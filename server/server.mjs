import { createServer } from 'node:http';
import { createReadStream, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ActivityStore, ActivityError, verifyPassword, csv } from './store.mjs';

const PUBLIC_FILES = new Set(JSON.parse(readFileSync(new URL('./runtime-files.json', import.meta.url), 'utf8')));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const cookiesFrom = value => Object.fromEntries(String(value ?? '').split(';').map(part => part.trim().split('=')).filter(pair => pair.length === 2));

export function createApp({ store, root = fileURLToPath(new URL('../', import.meta.url)), origin, adminHash }) {
  if (!origin || !/^https?:/.test(origin) || new URL(origin).origin !== origin) throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin');
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(adminHash ?? '')) throw new Error('ADMIN_PASSWORD_HASH is required');
  const secure = origin.startsWith('https:'), attempts = new Map(), textCache = new Map();
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolve(root, 'release.json'), 'utf8')); } catch { /* Local development has no release manifest. */ }
  const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function send(res, status, value, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(value));
  }
  function throttle(key, limit) {
    const now = Date.now(), old = attempts.get(key);
    if (!old || old.until < now) attempts.set(key, { until: now + 60000, count: 1 });
    else if (++old.count > limit) throw new ActivityError(429, '请求较多，请稍后再试。', 'rate_limited');
    if (attempts.size > 5000) for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
  }
  async function body(req, keys) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new ActivityError(415, '请使用 JSON 请求。', 'invalid_content_type');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new ActivityError(413, '请求内容过长。', 'body_too_large'); chunks.push(chunk); }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw new ActivityError(400, '请求格式不正确。', 'invalid_json'); }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new ActivityError(400, '请求内容包含无效字段。', 'invalid_request');
    return value;
  }
  const http = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, origin), path = url.pathname;
      if (path === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (path.startsWith('/api/')) {
        if (!['GET', 'POST'].includes(req.method)) throw new ActivityError(405, '不支持此请求方法。', 'method_not_allowed');
        if (req.method === 'POST' && req.headers.origin !== origin) throw new ActivityError(403, '请从活动网页提交请求。', 'invalid_origin');
        const cookies = cookiesFrom(req.headers.cookie);
        const session = store.session(cookies.hatchery_player, 'player');
        const requirePlayer = () => { if (!session) throw new ActivityError(401, '请先填写真实姓名进入活动。', 'unauthorized'); return session.player_id; };
        const requireAdmin = () => { if (!store.session(cookies.hatchery_admin, 'admin')) throw new ActivityError(401, '请先登录活动管理。', 'unauthorized'); };
        if (path === '/api/activity' && req.method === 'GET') return send(res, 200, { activity: store.info() });
        if (path === '/api/me' && req.method === 'GET') return send(res, 200, { player: session ? store.player(session.player_id) : null });
        if (path === '/api/leaderboard' && req.method === 'GET') return send(res, 200, store.leaderboard(session?.player_id ?? null));
        if (path === '/api/join' && req.method === 'POST') {
          throttle(`join:${req.socket.remoteAddress}`, 1000);
          const data = await body(req, ['name']), joined = store.join(data.name, session?.player_id ?? null);
          return send(res, 200, { player: joined.player }, { 'Set-Cookie': cookie('hatchery_player', joined.token, 604800) });
        }
        if (path === '/api/test-session' && req.method === 'POST') {
          throttle(`test:${req.socket.remoteAddress}`, 100);
          const data = await body(req, ['token']), joined = store.exchangeTestToken(data.token, session?.player_id ?? null);
          return send(res, 200, { player: joined.player }, { 'Set-Cookie': cookie('hatchery_player', joined.token, 604800) });
        }
        if (path === '/api/logout' && req.method === 'POST') {
          await body(req, []); store.deleteSession(cookies.hatchery_player);
          return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('hatchery_player', '', 0) });
        }
        if (path === '/api/hatch' && req.method === 'POST') {
          const id = requirePlayer(), data = await body(req, ['conditions', 'requestId']);
          return send(res, 200, store.hatch(id, data.conditions, data.requestId));
        }
        if (path === '/api/admin/login' && req.method === 'POST') {
          throttle(`admin:${req.socket.remoteAddress}`, 10);
          const data = await body(req, ['password']);
          if (typeof data.password !== 'string' || data.password.length > 256 || !verifyPassword(data.password, adminHash)) throw new ActivityError(401, '管理口令不正确。', 'invalid_password');
          return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('hatchery_admin', store.newSession('admin'), 43200) });
        }
        if (path === '/api/admin/session' && req.method === 'GET') return send(res, 200, { authenticated: !!store.session(cookies.hatchery_admin, 'admin') });
        if (path.startsWith('/api/admin/')) {
          requireAdmin();
          if (path === '/api/admin/summary' && req.method === 'GET') return send(res, 200, { activity: store.info(), results: store.results(), tests: store.tests() });
          if (path === '/api/admin/logout' && req.method === 'POST') {
            await body(req, []); store.deleteSession(cookies.hatchery_admin);
            return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('hatchery_admin', '', 0) });
          }
          if (path === '/api/admin/test-entry' && req.method === 'POST') { await body(req, []); return send(res, 200, store.createTestEntry(origin)); }
          if (path === '/api/admin/results.csv' && req.method === 'GET') {
            const rows = [['排名', '参与者编号', '真实姓名', '首次孵化分数', '形象编号', '形象名称', '形象版本', '孵化时间（UTC）'], ...store.results().map(row => {
              const monster = MONSTERS_FOR_EXPORT.get(row.monsterId);
              return [row.rank, row.number, row.name, row.score, row.monsterId, monster?.name ?? row.monsterId, monster?.form ?? '', row.completedAt];
            })];
            res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hatchery-first-scores.csv"', 'Cache-Control': 'no-store' });
            return res.end(csv(rows));
          }
        }
        throw new ActivityError(404, '接口不存在。', 'not_found');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new ActivityError(405, '不支持此请求方法。', 'method_not_allowed');
      const alias = { '/': 'index.html', '/leaderboard': 'leaderboard.html', '/admin': 'admin.html' };
      if (path === '/leaderboard/' || path === '/admin/') { res.writeHead(302, { Location: path.slice(0, -1), 'Cache-Control': 'no-cache' }); return res.end(); }
      let relative;
      try { relative = alias[path] ?? decodeURIComponent(path).replace(/^\//, ''); }
      catch { throw new ActivityError(400, '页面地址无效。', 'invalid_path'); }
      if (!(PUBLIC_FILES.has(relative) || relative === 'release.json') || relative.split('/').some(part => part === '..' || part.startsWith('.'))) throw new ActivityError(404, '页面不存在。', 'not_found');
      const absolute = resolve(root, relative), type = MIME[extname(relative)];
      if (!absolute.startsWith(resolve(root) + '/') || !type) throw new ActivityError(404, '页面不存在。', 'not_found');
      let stat;
      try { stat = lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(); }
      catch { throw new ActivityError(404, '页面不存在。', 'not_found'); }
      const etag = '"' + (manifest?.files?.[relative] ?? `${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}`) + '"';
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
      if (['.png', '.webp'].includes(extname(relative))) {
        res.writeHead(200, { ...headers, 'Content-Length': stat.size });
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(absolute);
        stream.on('error', error => res.destroy(error)); res.on('close', () => stream.destroy()); stream.pipe(res); return;
      }
      let asset = textCache.get(relative);
      if (!asset || asset.mtime !== stat.mtimeMs || asset.size !== stat.size) {
        const raw = readFileSync(absolute); asset = { mtime: stat.mtimeMs, size: stat.size, raw, gz: raw.length > 1024 ? gzipSync(raw) : null }; textCache.set(relative, asset);
      }
      const compressed = asset.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      res.writeHead(200, { ...headers, Vary: 'Accept-Encoding', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': compressed ? asset.gz.length : asset.raw.length });
      return res.end(req.method === 'HEAD' ? undefined : compressed ? asset.gz : asset.raw);
    } catch (error) {
      if (error instanceof ActivityError) return send(res, error.status, { error: error.message, code: error.code });
      console.error('Hatchery request failed:', error.name);
      if (!res.headersSent) send(res, 500, { error: '保存暂时失败，请稍后重试；已保存的首次成绩会保留。', code: 'server_error' });
      else res.end();
    }
  });
  http.headersTimeout = 15000; http.requestTimeout = 20000;
  return http;
}

import { MONSTERS } from '../catalog.mjs';
const MONSTERS_FOR_EXPORT = new Map(MONSTERS.map(monster => [monster.id, monster]));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new ActivityStore({ filename: resolve(process.env.DATA_DIR ?? './private/activity-data', 'activity.sqlite'), title: process.env.ACTIVITY_TITLE ?? 'AI 怪兽孵化大会', capacity: Number(process.env.ACTIVITY_CAPACITY ?? 200) });
  if (process.env.ACTIVITY_TITLE) store.setTitle(process.env.ACTIVITY_TITLE);
  const server = createApp({ store, origin: process.env.PUBLIC_ORIGIN, adminHash: process.env.ADMIN_PASSWORD_HASH });
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  server.listen(port, '0.0.0.0', () => console.log(`Hatchery activity listening on ${port}; capacity=${store.info().capacity}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
