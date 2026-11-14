import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MONSTERS } from '../catalog.mjs';
import { INITIAL_CONDITIONS } from '../engine.mjs';
import { ActivityStore, ActivityError, normalizeName, hashPassword, csv } from '../server/store.mjs';
import { createApp } from '../server/server.mjs';

const CONDITIONS = { ...INITIAL_CONDITIONS }, ORIGIN = 'http://hatchery.test';
const ADMIN_PASSWORD = 'local-test-only-admin-password', ADMIN_HASH = hashPassword(ADMIN_PASSWORD);
const fixedHatch = score => () => ({ monster: MONSTERS[0], score });
const cookieOf = response => response.headers['set-cookie']?.[0]?.split(';')[0];

async function fixture(options = {}) {
  const store = new ActivityStore({ filename: ':memory:', ...options });
  const server = createApp({ store, origin: options.origin ?? ORIGIN, adminHash: ADMIN_HASH });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const agent = new Agent({ keepAlive: true, maxSockets: 16 });
  let closed = false;
  const request = (path, { method = 'GET', json, cookie, origin = options.origin ?? ORIGIN, headers = {}, raw } = {}) => new Promise((resolve, reject) => {
    const payload = raw !== undefined ? Buffer.from(raw) : method === 'POST' ? Buffer.from(JSON.stringify(json ?? {})) : null;
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, agent, headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json', ...(origin !== null ? { Origin: origin } : {}), 'Content-Length': payload.length } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...headers,
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks), text = bytes.toString('utf8');
        let data;
        if (/^application\/json/.test(response.headers['content-type'] ?? '')) { try { data = JSON.parse(text); } catch { /* An empty HEAD response has no body. */ } }
        resolve({ status: response.statusCode, headers: response.headers, bytes, text, data });
      });
      response.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('Test request timeout')));
    if (payload) req.write(payload); req.end();
  });
  return { store, request, close: async () => { if (closed) return; closed = true; agent.destroy(); await new Promise(resolve => server.close(resolve)); store.close(); } };
}
const post = (app, path, json, cookie, extra = {}) => app.request(path, { method: 'POST', json, cookie, ...extra });
const hatch = (app, cookie, extra = {}) => post(app, '/api/hatch', { conditions: CONDITIONS, requestId: randomUUID(), ...extra }, cookie);

test('same normalized real name owns one first score; retries never call the random source again', () => {
  let rolls = 0;
  const store = new ActivityStore({ filename: ':memory:', makeHatch: () => { rolls++; return { monster: MONSTERS[0], score: rolls === 1 ? 123 : 740 }; } });
  try {
    assert.deepEqual(normalizeName('  Ａ l i c e  '), { display: 'A l i c e', key: 'alice' });
    const joined = store.join('  王 小明 '), id = joined.player.id;
    const first = store.hatch(id, CONDITIONS, 'request-first');
    const repeated = store.hatch(id, { ...CONDITIONS, egg: 'tide' }, 'request-later');
    assert.deepEqual(repeated.outcome, first.outcome); assert.equal(first.outcome.score, 123); assert.equal(rolls, 1);
    const resumed = store.join('王小明', id); assert.equal(resumed.player.id, id); assert.equal(resumed.player.firstResult.score, 123);
    assert.throws(() => store.join('王小明'), error => error instanceof ActivityError && error.code === 'same_name_completed');
    assert.equal(store.info().joined, 1); assert.equal(store.info().completed, 1);
    assert.throws(() => normalizeName(''), ActivityError); assert.throws(() => normalizeName('王\u200b明'), ActivityError);
  } finally { store.close(); }
});

test('name reservation, capacity and enlargement preserve the existing participant and outcome', () => {
  const store = new ActivityStore({ filename: ':memory:', capacity: 1, makeHatch: fixedHatch(333) });
  try {
    const player = store.join('同名选手').player;
    assert.throws(() => store.join(' 同 名选手 '), error => error.code === 'same_name_in_progress');
    assert.throws(() => store.join('另一位'), error => error.code === 'activity_full');
    const first = store.hatch(player.id, CONDITIONS, 'capacity-first');
    store.expandCapacity(200); assert.equal(store.info().capacity, 200);
    assert.deepEqual(store.player(player.id).firstResult, first.outcome);
    assert.throws(() => store.expandCapacity(100), error => error.code === 'capacity_cannot_shrink');
    assert.equal(store.join('另一位').player.number, 2);
  } finally { store.close(); }
});

test('database close and reopen retain identity, cookie session, first result and activity id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hatchery-store-')), filename = join(directory, 'activity.sqlite');
  let store = new ActivityStore({ filename, capacity: 5, makeHatch: fixedHatch(427) });
  try {
    const joined = store.join('恢复选手'), first = store.hatch(joined.player.id, CONDITIONS, 'persisted-first'), activityId = store.info().id;
    store.close(); store = new ActivityStore({ filename, capacity: 3, makeHatch: fixedHatch(740) });
    assert.equal(store.info().id, activityId); assert.equal(store.info().capacity, 5);
    assert.equal(store.session(joined.token, 'player').player_id, joined.player.id);
    assert.deepEqual(store.player(joined.player.id).firstResult, first.outcome);
    assert.deepEqual(store.hatch(joined.player.id, CONDITIONS, 'persisted-retry').outcome, first.outcome);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('score ties share competition rank; public rows mask names and CSV guards spreadsheet formulas', () => {
  const scores = [600, 600, 300], store = new ActivityStore({ filename: ':memory:', makeHatch: () => ({ monster: MONSTERS[0], score: scores.shift() }) });
  try {
    const people = ['张三', '王小明', '=SUM(1+1)'].map(name => store.join(name).player);
    people.forEach((person, i) => store.hatch(person.id, CONDITIONS, `ranking-${i}`));
    const board = store.leaderboard(people[1].id);
    assert.deepEqual(board.rows.map(row => row.rank), [1, 1, 3]);
    assert.deepEqual(board.rows.slice(0, 2).map(row => row.name), ['张*', '王*明']);
    assert.deepEqual(board.rows.map(row => row.isSelf), [false, true, false]);
    assert.deepEqual(board.viewer, { number: 2, rank: 1, score: 600 });
    assert.equal(JSON.stringify(board).includes('王小明'), false); assert.equal(Object.hasOwn(board.rows[0], 'playerId'), false);
    assert.ok(csv([['姓名'], ['=SUM(1+1)']]).includes('"\'=SUM(1+1)"'));
    assert.ok(csv([['a"b']]).startsWith('\ufeff"a""b"'));
  } finally { store.close(); }
});

test('200 concurrent HTTP participants save one server-generated result each despite duplicate hatch requests', async () => {
  const app = await fixture({ capacity: 200 });
  try {
    const settled = await Promise.allSettled(Array.from({ length: 200 }, async (_, index) => {
      const joined = await post(app, '/api/join', { name: `并发选手${String(index + 1).padStart(3, '0')}` });
      assert.equal(joined.status, 200); const cookie = cookieOf(joined);
      const responses = await Promise.allSettled([hatch(app, cookie), hatch(app, cookie)]);
      responses.forEach(item => { if (item.status === 'rejected') throw item.reason; });
      const [first, second] = responses.map(item => item.value);
      assert.equal(first.status, 200); assert.equal(second.status, 200); assert.deepEqual(first.data.outcome, second.data.outcome);
      const result = first.data.outcome;
      assert.ok(Number.isInteger(result.score) && result.score >= 100 && result.score <= 740);
      assert.ok(MONSTERS.some(monster => monster.id === result.monsterId)); assert.equal(result.isRanked, true);
      return result;
    }));
    const errors = settled.filter(item => item.status === 'rejected'); assert.deepEqual(errors.map(item => String(item.reason)), []);
    assert.equal(app.store.results().length, 200); assert.deepEqual(app.store.info(), { ...app.store.info(), joined: 200, completed: 200, remaining: 0 });
    const over = await post(app, '/api/join', { name: '超出名额' }); assert.equal(over.status, 409); assert.equal(over.data.code, 'activity_full');
    const board = await app.request('/api/leaderboard'); assert.equal(board.data.rows.length, 200); assert.equal(board.data.viewer, null);
    assert.ok(board.data.rows.every(row => !Object.hasOwn(row, 'playerId') && row.name.includes('*')));
  } finally { await app.close(); }
});

test('concurrent normalized-name registrations and retries preserve the earliest saved score', async () => {
  const app = await fixture({ makeHatch: fixedHatch(111) });
  try {
    const names = ['Ａlice', 'alice', ' A l i c e ', 'ALICE'];
    const joins = await Promise.all(names.map(name => post(app, '/api/join', { name })));
    assert.equal(joins.filter(response => response.status === 200).length, 1);
    assert.ok(joins.filter(response => response.status !== 200).every(response => response.data.code === 'same_name_in_progress'));
    const cookie = cookieOf(joins.find(response => response.status === 200));
    const first = await hatch(app, cookie); assert.equal(first.data.outcome.score, 111);
    const repeats = await Promise.all(Array.from({ length: 20 }, () => hatch(app, cookie)));
    repeats.forEach(response => assert.deepEqual(response.data.outcome, first.data.outcome));
    const duplicate = await post(app, '/api/join', { name: 'ALICE' }); assert.equal(duplicate.data.code, 'same_name_completed');
    const own = await post(app, '/api/join', { name: 'a l i c e' }, cookie); assert.equal(own.status, 200); assert.deepEqual(own.data.player.firstResult, first.data.outcome);
    assert.equal(app.store.info().joined, 1); assert.equal(app.store.info().completed, 1);
  } finally { await app.close(); }
});

test('HTTP rejects client scores, invalid conditions, foreign origins and unauthorized private access', async () => {
  const app = await fixture({ makeHatch: fixedHatch(345) });
  try {
    assert.equal((await hatch(app)).status, 401);
    assert.equal((await post(app, '/api/join', { name: '请求选手' }, undefined, { origin: 'https://other.invalid' })).status, 403);
    assert.equal((await post(app, '/api/join', { name: '请求选手' }, undefined, { origin: null })).status, 403);
    const joined = await post(app, '/api/join', { name: '请求选手' }), cookie = cookieOf(joined);
    assert.ok(joined.headers['set-cookie'][0].includes('HttpOnly')); assert.ok(joined.headers['set-cookie'][0].includes('SameSite=Strict'));
    const forged = await hatch(app, cookie, { score: 740, monsterId: 'M65' }); assert.equal(forged.status, 400); assert.equal(app.store.info().completed, 0);
    const bad = await hatch(app, cookie, { conditions: { ...CONDITIONS, temperature: '42' } }); assert.equal(bad.status, 400);
    const extra = await hatch(app, cookie, { conditions: { ...CONDITIONS, score: 740 } }); assert.equal(extra.status, 400);
    const valid = await hatch(app, cookie); assert.equal(valid.data.outcome.score, 345);
    assert.equal((await app.request('/api/me')).data.player, null);
    assert.equal((await app.request('/api/me', { cookie })).data.player.name, '请求选手');
    for (const path of ['/api/admin/summary', '/api/admin/results.csv']) assert.equal((await app.request(path)).status, 401);
    for (const path of ['/server/server.mjs', '/server/runtime-files.json', '/private/activity-credentials.json', '/data/activity.sqlite', '/catalog.mjs/../server/store.mjs', '/%2e%2e/private/secret']) assert.equal((await app.request(path)).status, 404);
    const script = await app.request('/engine.mjs'); assert.equal(script.status, 200); assert.match(script.headers['content-type'], /^application\/javascript/);
    const actions = await app.request('/character-actions.mjs');
    assert.equal(actions.status, 200); assert.match(actions.headers['content-type'], /^application\/javascript/);
    assert.equal(actions.bytes.compare(await readFile(new URL('../character-actions.mjs', import.meta.url))), 0);
    const picture = await app.request('/assets/monsters/M01-actions.png'); assert.equal(picture.status, 200); assert.equal(picture.headers['content-type'], 'image/png');
    assert.equal((await app.request('/assets/monsters/M01-actions.png', { headers: { 'If-None-Match': picture.headers.etag } })).status, 304);
    assert.equal((await app.request('/assets/monsters/deepseek-adult.png')).status, 404);
    assert.equal((await app.request('/healthz')).data.ok, true);
  } finally { await app.close(); }
});

test('admin-only test links exercise first-score flow without using formal places or appearing on the board', async () => {
  const app = await fixture({ capacity: 1, makeHatch: fixedHatch(579) });
  try {
    assert.equal((await post(app, '/api/admin/login', { password: 'wrong' })).status, 401);
    const admin = await post(app, '/api/admin/login', { password: ADMIN_PASSWORD }), adminCookie = cookieOf(admin);
    assert.equal(admin.status, 200); assert.equal((await app.request('/api/admin/session', { cookie: adminCookie })).data.authenticated, true);
    const formal = await post(app, '/api/join', { name: '=SUM(1+1)' }), formalCookie = cookieOf(formal); await hatch(app, formalCookie);
    assert.equal(app.store.info().remaining, 0);
    const created = await post(app, '/api/admin/test-entry', {}, adminCookie); assert.equal(created.status, 200);
    const token = new URL(created.data.url).searchParams.get('test');
    const testLogin = await post(app, '/api/test-session', { token }), testCookie = cookieOf(testLogin);
    assert.equal(testLogin.status, 200); assert.equal(testLogin.data.player.isTest, true);
    const testResult = await hatch(app, testCookie); assert.equal(testResult.status, 200); assert.equal(testResult.data.outcome.score, 579); assert.equal(testResult.data.outcome.isRanked, false);
    assert.equal((await post(app, '/api/test-session', { token })).data.code, 'test_link_used');
    assert.equal((await post(app, '/api/test-session', { token }, testCookie)).status, 200);
    assert.equal((await app.request('/api/leaderboard', { cookie: testCookie })).data.rows.length, 1);
    assert.equal((await app.request('/api/leaderboard', { cookie: testCookie })).data.viewer, null);
    assert.equal(app.store.info().joined, 1); assert.equal(app.store.info().completed, 1);
    const summary = await app.request('/api/admin/summary', { cookie: adminCookie });
    assert.equal(summary.data.results.length, 1); assert.equal(summary.data.tests.length, 1); assert.equal(summary.data.results[0].name, '=SUM(1+1)');
    const exported = await app.request('/api/admin/results.csv', { cookie: adminCookie });
    assert.equal(exported.status, 200); assert.ok(exported.text.startsWith('\ufeff')); assert.ok(exported.text.includes('"\'=SUM(1+1)"')); assert.equal(exported.text.includes('测试参与者'), false);
    assert.equal((await post(app, '/api/admin/logout', {}, adminCookie)).status, 200);
    assert.equal((await app.request('/api/admin/summary', { cookie: adminCookie })).status, 401);
    await post(app, '/api/logout', {}, formalCookie); assert.equal((await app.request('/api/me', { cookie: formalCookie })).data.player, null);
  } finally { await app.close(); }
});

test('HTTPS deployment sessions use Secure cookies', async () => {
  const app = await fixture({ origin: 'https://hatchery.test' });
  try {
    const joined = await post(app, '/api/join', { name: 'HTTPS 选手' });
    assert.equal(joined.status, 200); assert.ok(joined.headers['set-cookie'][0].includes('; Secure'));
    const admin = await post(app, '/api/admin/login', { password: ADMIN_PASSWORD }); assert.ok(admin.headers['set-cookie'][0].includes('; Secure'));
  } finally { await app.close(); }
});
