import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ActivityStore } from '../server/store.mjs';
import { createApp } from '../server/server.mjs';

const credentials = JSON.parse(readFileSync(new URL('../private/activity-credentials.json', import.meta.url), 'utf8'));
const port = Number(process.env.HATCHERY_ACTIVITY_PORT ?? 4390), origin = `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HATCHERY_ACTIVITY_PORT');
const store = new ActivityStore({ filename: fileURLToPath(new URL('../private/local-activity/activity.sqlite', import.meta.url)), title: 'AI 怪兽孵化大会 · 本地验收', capacity: 200 });
const server = createApp({ store, origin, adminHash: credentials.adminHash });
server.listen(port, '127.0.0.1', () => console.log(`孵化活动本地预览：${origin}/；排行榜 /leaderboard；管理 /admin`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
