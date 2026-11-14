import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashPassword } from '../server/store.mjs';

const directory = fileURLToPath(new URL('../private/', import.meta.url));
export function prepareCredentials({ origin } = {}) {
  if (origin !== undefined && (!/^https?:/.test(origin) || new URL(origin).origin !== origin)) throw new Error('Origin must be an exact HTTP(S) origin');
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const destination = directory + 'activity-credentials.json';
  if (!existsSync(destination)) {
    const adminPassword = randomBytes(18).toString('base64url');
    writeFileSync(destination, JSON.stringify({ adminPassword, adminHash: hashPassword(adminPassword), origin: origin ?? null }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const credentials = JSON.parse(readFileSync(destination, 'utf8'));
  if (origin !== undefined && origin !== credentials.origin) { credentials.origin = origin; writeFileSync(destination, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 }); }
  chmodSync(destination, 0o600);
  const base = credentials.origin ?? '（公网域名待配置）';
  writeFileSync(directory + '活动管理访问说明.txt', `AI 怪兽孵化大会\n\n玩家入口：${base}/\n公开排行榜：${base}/leaderboard\n活动管理：${base}/admin\n管理口令：${credentials.adminPassword}\n\n真实姓名为自填，不做身份证核验。同一归一化姓名仅保存最早一次正式孵化分数，后续试玩不改榜单。公开姓名脱敏，完整姓名和成绩 CSV 只供后台查看。\n\n线上验收请先登录后台生成独立测试入口；测试不占正式名额、不进入正式排名。管理口令、测试链接和此说明均不要公开分享。\n`, { mode: 0o600 });
  if (credentials.origin) writeFileSync(directory + 'sealos-env.json', JSON.stringify({ PORT: '80', DATA_DIR: '/data', ACTIVITY_CAPACITY: '200', ACTIVITY_TITLE: 'AI 怪兽孵化大会', PUBLIC_ORIGIN: credentials.origin, ADMIN_PASSWORD_HASH: credentials.adminHash }, null, 2) + '\n', { mode: 0o600 });
  return { credentials, destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.argv.find(value => value.startsWith('--origin='))?.slice('--origin='.length);
  prepareCredentials({ origin });
  console.log('独立管理凭据已准备于 private/；口令与哈希没有输出到终端。');
}
