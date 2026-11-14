import { MONSTERS } from './catalog.mjs';
import { profileFor } from './sprites.mjs';

export const TIERS = [
  { id: 'N', label: '普通', weight: 42, color: '#8d998e' },
  { id: 'R', label: '稀有', weight: 30, color: '#5b916a' },
  { id: 'SR', label: '珍稀', weight: 17, color: '#648eaa' },
  { id: 'SSR', label: '史诗', weight: 8, color: '#9980ba' },
  { id: 'UR', label: '传说', weight: 3, color: '#c09040' },
];
export const EGGS = [
  { id: 'meadow', name: '斑点蛋', tag: '均衡探索', note: '一切惊喜的起点', color: '#c6d6a2', affinity: ['nature', 'everyday'] },
  { id: 'tide', name: '潮汐蛋', tag: '海洋亲和', note: '蛋壳里藏着潮声', color: '#a2c9d7', affinity: ['whale', 'water'] },
  { id: 'nebula', name: '星云蛋', tag: '星月亲和', note: '来自遥远的小星球', color: '#b9a7d4', affinity: ['cosmic', 'dragon'] },
  { id: 'amber', name: '琥珀蛋', tag: '光焰亲和', note: '一颗暖乎乎的蛋', color: '#dfb685', affinity: ['fire', 'royal', 'craft'] },
];
export const ROOMS = [
  { id: 'greenhouse', name: '苔藓温室', subtitle: '草木与阳光', affinity: ['nature', 'everyday'], temp: 25, color: '#a1bf93' },
  { id: 'ocean', name: '潮汐实验室', subtitle: '海风与微光', affinity: ['whale', 'water'], temp: 23, color: '#91b8c7' },
  { id: 'observatory', name: '星月观测室', subtitle: '星尘与月光', affinity: ['cosmic', 'dragon'], temp: 21, color: '#a99cc5' },
  { id: 'forge', name: '熔光工坊', subtitle: '炉火与奇想', affinity: ['fire', 'royal', 'craft'], temp: 34, color: '#d0a17e' },
];
export const INITIAL_CONDITIONS = Object.freeze({ egg: 'meadow', temperature: 28, room: 'greenhouse' });
export const SCORE_RANGE = Object.freeze({ min: 100, max: 740 });
const tierCounts = new Map(TIERS.map(tier => [tier.id, MONSTERS.filter(monster => monster.rarity.startsWith(tier.id + ' ')).length]));

export function validateConditions(conditions) {
  const egg = EGGS.find(item => item.id === conditions?.egg);
  const room = ROOMS.find(item => item.id === conditions?.room);
  const temperature = conditions?.temperature;
  if (!egg || !room || !Number.isInteger(temperature) || temperature < 16 || temperature > 42) throw new RangeError('无效的孵化条件');
  return { egg: egg.id, room: room.id, temperature };
}

export function distribution(conditions) {
  const clean = validateConditions(conditions);
  const egg = EGGS.find(e => e.id === clean.egg), room = ROOMS.find(r => r.id === clean.room);
  const weighted = MONSTERS.map(monster => {
    const profile = profileFor(monster.id), tierId = monster.rarity.split(' ')[0];
    const tier = TIERS.find(item => item.id === tierId);
    const eggBoost = egg.affinity.some(tag => profile.tags.includes(tag)) ? 1.7 : 1;
    const roomBoost = room.affinity.some(tag => profile.tags.includes(tag)) ? 1.45 : 1;
    const comfort = .55 + .9 * Math.exp(-(((clean.temperature - profile.temperature) / 8) ** 2));
    return { monster, weight: tier.weight / tierCounts.get(tierId) * eggBoost * roomBoost * comfort };
  });
  const total = weighted.reduce((sum,row)=>sum+row.weight,0);
  return weighted.map(row => ({ ...row, probability: row.weight / total }));
}

export function tierDistribution(conditions) {
  const rows = distribution(conditions);
  return TIERS.map(tier => ({ ...tier, probability: rows.filter(r => r.monster.rarity.startsWith(tier.id + ' ')).reduce((sum, r) => sum + r.probability, 0) }));
}

export function pickMonster(conditions, random = secureRandom) {
  const rows = distribution(conditions);
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数必须在 [0, 1) 内');
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.probability;
    if (value < cumulative) return row.monster;
  }
  return rows.at(-1).monster;
}

export function secureRandom() {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0] / 4294967296;
}

export function rollScore(random = secureRandom) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数必须在 [0, 1) 内');
  return SCORE_RANGE.min + Math.floor(value * (SCORE_RANGE.max - SCORE_RANGE.min + 1));
}

export function createHatch(conditions, { monsterRandom = secureRandom, scoreRandom = secureRandom } = {}) {
  return Object.freeze({ monster: pickMonster(conditions, monsterRandom), score: rollScore(scoreRandom) });
}
