import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MONSTERS } from '../catalog.mjs';
import { createHatch, validateConditions, SCORE_RANGE } from '../engine.mjs';

export class ActivityError extends Error {
  constructor(status, message, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new ActivityError(status, message, code); };
const digest = value => createHash('sha256').update(value).digest('hex');
const isoNow = () => new Date().toISOString();
const ids = new Set(MONSTERS.map(monster => monster.id));
const randomUnit = () => randomInt(4294967296) / 4294967296;

export function normalizeName(value) {
  if (typeof value !== 'string') fail(400, '请填写真实姓名。', 'invalid_name');
  const display = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if ([...display].length < 1 || [...display].length > 40 || /\p{C}/u.test(display)) fail(400, '请输入 1–40 个字的真实姓名，不要使用隐藏字符。', 'invalid_name');
  return { display, key: display.replace(/\s+/gu, '').toLowerCase() };
}
export function maskName(value) {
  const letters = [...String(value ?? '').replace(/\s+/gu, '')];
  if (letters.length < 2) return '*';
  if (letters.length === 2) return letters[0] + '*';
  return letters[0] + '*'.repeat(Math.min(3, letters.length - 2)) + letters.at(-1);
}
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const [kind, salt, key] = String(hash).split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(key ?? '')) return false;
  return timingSafeEqual(scryptSync(String(password), salt, 32), Buffer.from(key, 'hex'));
}
export function csv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}

export class ActivityStore {
  constructor({ filename, title = 'AI 怪兽孵化大会', capacity = 200, makeHatch = createHatch }) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw new Error('Activity capacity must be an integer between 1 and 10000');
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.makeHatch = makeHatch;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players(
        id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL,
        name TEXT NOT NULL, name_key TEXT NOT NULL, is_test INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS formal_name ON players(name_key) WHERE is_test=0;
      CREATE UNIQUE INDEX IF NOT EXISTS player_number ON players(number);
      CREATE TABLE IF NOT EXISTS results(
        completion_order INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL UNIQUE REFERENCES players(id),
        monster_id TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 100 AND 740),
        conditions_json TEXT NOT NULL, request_id TEXT NOT NULL, completed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions(
        token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('player','admin')),
        player_id INTEGER REFERENCES players(id), expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS test_links(
        token_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id),
        expires_at INTEGER NOT NULL, used_at TEXT
      );`);
    this.transaction(() => {
      if (!this.db.prepare("SELECT value FROM metadata WHERE key='activity_id'").get()) {
        const insert = this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)');
        insert.run('activity_id', randomBytes(8).toString('hex')); insert.run('title', title);
        insert.run('capacity', String(capacity)); insert.run('created_at', isoNow());
      } else {
        const current = Number(this.db.prepare("SELECT value FROM metadata WHERE key='capacity'").get().value);
        if (capacity > current) this.db.prepare("UPDATE metadata SET value=? WHERE key='capacity'").run(String(capacity));
      }
    });
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  info() {
    const meta = Object.fromEntries(this.db.prepare('SELECT key,value FROM metadata').all().map(row => [row.key, row.value]));
    const joined = this.db.prepare('SELECT COUNT(*) AS n FROM players WHERE is_test=0').get().n;
    const completed = this.db.prepare('SELECT COUNT(*) AS n FROM results r JOIN players p ON p.id=r.player_id WHERE p.is_test=0').get().n;
    return { id: meta.activity_id, title: meta.title, capacity: Number(meta.capacity), joined, completed, remaining: Number(meta.capacity) - joined, characters: MONSTERS.length };
  }
  setTitle(title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 100) fail(400, '活动名称无效。', 'invalid_title');
    this.db.prepare("UPDATE metadata SET value=? WHERE key='title'").run(title.trim());
  }
  expandCapacity(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) fail(400, '活动容量应为 1–10000 的整数。', 'invalid_capacity');
    this.transaction(() => {
      const current = this.info().capacity;
      if (capacity < current) fail(409, '活动容量不能通过缩小名额修改。', 'capacity_cannot_shrink');
      this.db.prepare("UPDATE metadata SET value=? WHERE key='capacity'").run(String(capacity));
    });
  }
  newSession(kind, playerId = null) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    this.db.prepare('INSERT INTO sessions(token_hash,kind,player_id,expires_at) VALUES(?,?,?,?)')
      .run(digest(token), kind, playerId, Date.now() + (kind === 'admin' ? 12 * 3600000 : 7 * 86400000));
    return token;
  }
  session(token, kind) {
    if (typeof token !== 'string' || token.length > 100) return null;
    return this.db.prepare('SELECT player_id FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?').get(digest(token), kind, Date.now()) ?? null;
  }
  deleteSession(token) { if (typeof token === 'string') this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); }
  player(id) {
    const row = this.db.prepare('SELECT * FROM players WHERE id=?').get(id);
    if (!row) fail(404, '参与记录不存在。', 'player_missing');
    const saved = this.db.prepare('SELECT * FROM results WHERE player_id=?').get(id);
    return {
      id: row.id, number: row.number, name: row.name, isTest: !!row.is_test,
      firstResult: saved ? this.outcome(saved, row.is_test) : null,
    };
  }
  outcome(row, isTest) {
    return { monsterId: row.monster_id, score: row.score, conditions: JSON.parse(row.conditions_json), completedAt: row.completed_at, isRanked: !isTest };
  }
  join(nameValue, activePlayerId = null) {
    const name = normalizeName(nameValue);
    return this.transaction(() => {
      const current = activePlayerId ? this.db.prepare('SELECT * FROM players WHERE id=?').get(activePlayerId) : null;
      if (current && !current.is_test && current.name_key === name.key) return { token: this.newSession('player', current.id), player: this.player(current.id) };
      const duplicate = this.db.prepare('SELECT p.id,r.player_id AS completed FROM players p LEFT JOIN results r ON r.player_id=p.id WHERE p.is_test=0 AND p.name_key=?').get(name.key);
      if (duplicate) fail(409, duplicate.completed ? '这个姓名已完成首次孵化，排行榜已保留最早成绩。' : '这个姓名已经报名，请在原设备继续；需要恢复请联系组织者。', duplicate.completed ? 'same_name_completed' : 'same_name_in_progress');
      const info = this.info();
      if (!info.remaining) fail(409, '本次活动参与名额已满。', 'activity_full');
      const number = this.db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM players WHERE is_test=0').get().n;
      const insert = this.db.prepare('INSERT INTO players(number,name,name_key,joined_at) VALUES(?,?,?,?)').run(number, name.display, name.key, isoNow());
      const id = Number(insert.lastInsertRowid);
      return { token: this.newSession('player', id), player: this.player(id) };
    });
  }
  hatch(id, conditions, requestId) {
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) fail(400, '请重新提交本次孵化请求。', 'invalid_request_id');
    if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions) || Object.keys(conditions).some(key => !['egg', 'temperature', 'room'].includes(key))) fail(400, '孵化条件无效。', 'invalid_conditions');
    let clean;
    try { clean = validateConditions(conditions); }
    catch { fail(400, '请选择有效的蛋、温度和孵化室。', 'invalid_conditions'); }
    return this.transaction(() => {
      const player = this.db.prepare('SELECT * FROM players WHERE id=?').get(id);
      if (!player) fail(401, '请先填写真实姓名进入活动。', 'unauthorized');
      let saved = this.db.prepare('SELECT * FROM results WHERE player_id=?').get(id);
      if (!saved) {
        const rolled = this.makeHatch(clean, { monsterRandom: randomUnit, scoreRandom: randomUnit });
        if (!ids.has(rolled?.monster?.id) || !Number.isInteger(rolled.score) || rolled.score < SCORE_RANGE.min || rolled.score > SCORE_RANGE.max) throw new Error('Invalid server-generated hatch outcome');
        this.db.prepare('INSERT INTO results(player_id,monster_id,score,conditions_json,request_id,completed_at) VALUES(?,?,?,?,?,?)')
          .run(id, rolled.monster.id, rolled.score, JSON.stringify(clean), requestId, isoNow());
        saved = this.db.prepare('SELECT * FROM results WHERE player_id=?').get(id);
      }
      return { outcome: this.outcome(saved, player.is_test), player: this.player(id) };
    });
  }
  rankedResults() {
    const rows = this.db.prepare('SELECT p.id,p.number,p.name,r.* FROM players p JOIN results r ON r.player_id=p.id WHERE p.is_test=0 ORDER BY r.score DESC,r.completion_order ASC').all();
    let rank = 0, previous;
    return rows.map((row, index) => {
      if (row.score !== previous) rank = index + 1;
      previous = row.score;
      return { rank, number: row.number, name: row.name, score: row.score, monsterId: row.monster_id, completedAt: row.completed_at, playerId: row.id };
    });
  }
  results() { return this.rankedResults().map(({ playerId, ...row }) => row); }
  leaderboard(playerId = null) {
    const all = this.rankedResults();
    const self = all.find(row => row.playerId === playerId);
    return {
      activity: this.info(),
      rows: all.map(({ playerId: id, name, ...row }) => ({ ...row, name: maskName(name), isSelf: id === playerId })),
      viewer: self ? { number: self.number, rank: self.rank, score: self.score } : null,
    };
  }
  tests() {
    return this.db.prepare('SELECT id FROM players WHERE is_test=1 ORDER BY id').all().map(row => this.player(row.id));
  }
  createTestEntry(origin) {
    return this.transaction(() => {
      const number = this.db.prepare('SELECT COALESCE(MIN(number),0)-1 AS n FROM players WHERE is_test=1').get().n;
      const name = `测试参与者 ${-number}`, token = randomBytes(32).toString('base64url');
      const insert = this.db.prepare('INSERT INTO players(number,name,name_key,is_test,joined_at) VALUES(?,?,?,1,?)').run(number, name, `test:${randomBytes(8).toString('hex')}`, isoNow());
      this.db.prepare('INSERT INTO test_links(token_hash,player_id,expires_at) VALUES(?,?,?)').run(digest(token), Number(insert.lastInsertRowid), Date.now() + 86400000);
      return { url: `${origin}/?test=${token}`, name };
    });
  }
  exchangeTestToken(token, activePlayerId = null) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(400, '测试链接无效。', 'invalid_test_link');
    return this.transaction(() => {
      const link = this.db.prepare('SELECT * FROM test_links WHERE token_hash=?').get(digest(token));
      if (!link || link.expires_at < Date.now()) fail(410, '测试链接已失效，请在后台重新生成。', 'test_link_expired');
      if (link.used_at && link.player_id !== activePlayerId) fail(409, '测试链接已经使用，请在原设备继续或重新生成。', 'test_link_used');
      if (!link.used_at) this.db.prepare('UPDATE test_links SET used_at=? WHERE token_hash=?').run(isoNow(), digest(token));
      return { token: this.newSession('player', link.player_id), player: this.player(link.player_id) };
    });
  }
}
