import { actionsFor } from './character-actions.mjs';

// One action owns the character at a time. A new interaction replaces the old
// one immediately; drawing and its clock are paused when the view is hidden.
export const ACTION_DURATIONS = Object.freeze({ blink: 900, wave: 1800, walk: 3400, pet: 2200, feed: 2400 });
export const ACTION_LABELS = Object.freeze({ idle: '待机', blink: '眨眼', wave: '挥手', walk: '走动', pet: '摸头回应', feed: '吃点心' });

// Source crops and target offsets share one definition across animation and
// still portraits. Cropped subjects retain their original pixel dimensions.
export function frameRect(monsterOrId, frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame > 7) throw new RangeError('无效角色帧');
  const offset=actionsFor(monsterOrId).frameOffsets?.[frame]??{};
  const source=offset.source??{x:(frame%4)*384,y:Math.floor(frame/4)*512,width:384,height:512};
  return {sx:source.x,sy:source.y,sw:source.width,sh:source.height,dx:offset.x??0,dy:offset.y??0};
}

export function portraitStyle(monsterOrId) {
  const r=frameRect(monsterOrId,0),percent=value=>`${Number((value*100).toFixed(6))}%`;
  return [
    ['--crop-x',r.dx/384],['--crop-y',r.dy/512],['--crop-w',r.sw/384],['--crop-h',r.sh/512],
    ['--atlas-x',-r.sx/r.sw],['--atlas-y',-r.sy/r.sh],['--atlas-w',1536/r.sw],['--atlas-h',1024/r.sh]
  ].map(([name,value])=>`${name}:${percent(value)}`).join(';');
}

function walkSample(age, duration, reduced) {
  const p = age / duration;
  const x = p < .25 ? p * 4 : p < .75 ? 1 - (p - .25) * 4 : -1 + (p - .75) * 4;
  return { action: 'walk', frame: reduced ? 4 : 4 + Math.floor(age / 170) % 2, offset: reduced ? 0 : x * .14, flip: !reduced && p >= .25 && p < .75, completed: false };
}

export function sampleMotion(action, elapsed, reduced = false) {
  if (action !== 'idle' && !Object.hasOwn(ACTION_DURATIONS, action)) throw new RangeError('未知角色动作');
  if (!Number.isFinite(elapsed)) throw new RangeError('无效动作时钟');
  const age = Math.max(0, elapsed);
  const idle = { action: 'idle', frame: 0, offset: 0, flip: false, completed: false };
  if (action === 'idle') {
    if (reduced) return idle;
    const cycle = age % 10000;
    if (cycle >= 3800 && cycle < 6600) return walkSample(cycle - 3800, 2800, false);
    if ((cycle >= 1600 && cycle < 1790) || (cycle >= 7900 && cycle < 8090)) return { ...idle, action: 'blink', frame: 1 };
    return idle;
  }
  if (age >= ACTION_DURATIONS[action]) return { ...idle, completed: true };
  if (action === 'walk') return walkSample(age, ACTION_DURATIONS.walk, reduced);
  const frame = action === 'blink' ? (age < 380 || (age >= 550 && age < 760) ? 1 : 0)
    : action === 'wave' ? (reduced ? 2 : 2 + Math.floor(age / 220) % 2)
    : action === 'pet' ? 6 : 7;
  return { ...idle, action, frame };
}

const sheets = new Map();
const loading = new Map();
const MAX_CACHED_SHEETS = 8;
export async function ensureCharacterSheet(monster) {
  const path = monster.animationSheet;
  if (sheets.has(path)) {
    const image = sheets.get(path); sheets.delete(path); sheets.set(path,image);
    return image;
  }
  if (loading.has(path)) return loading.get(path);
  const pending = (async () => {
    const image = new Image(); image.decoding = 'async';
    const loaded = new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{image.src='';reject(new Error('角色图片载入超时，请重试。'));},45000);
      image.onload=()=>{clearTimeout(timeout);resolve();};
      image.onerror=()=>{clearTimeout(timeout);reject(new Error(`角色动作图未能载入：${monster.id}`));};
    });
    image.src=path; await loaded;
    if(image.naturalWidth!==1536||image.naturalHeight!==1024)throw new Error('角色动作图应为 1536×1024 的八帧图集');
    sheets.set(path,image);
    while(sheets.size>MAX_CACHED_SHEETS)sheets.delete(sheets.keys().next().value);
    return image;
  })();
  loading.set(path,pending);
  try { return await pending; } finally { loading.delete(path); }
}
export async function loadCharacterSheets(monsters) {
  await Promise.all(monsters.map(ensureCharacterSheet));
}

export class CharacterAnimator {
  constructor(canvas, { onState = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onState = onState;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.tick = this.tick.bind(this);
    this.onMotionChange = () => { this.drawKey = ''; this.draw(performance.now()); };
    this.motion.addEventListener('change', this.onMotionChange);
    this.handle = null;
    this.visible = false;
    this.pausedAt = null;
  }
  show(monster) {
    this.stop();
    this.monster = monster;
    this.actions = actionsFor(monster);
    this.sheet = sheets.get(monster.animationSheet);
    if (!this.sheet) throw new Error(`角色动作图尚未就绪：${monster.id}`);
    this.canvas.width = 384; this.canvas.height = 512;
    this.visible = true; this.pausedAt = null;
    this.action = 'idle'; this.startedAt = performance.now(); this.drawKey = '';
    this.canvas.dataset.characterId = monster.id;
    this.draw(this.startedAt);
    this.handle = requestAnimationFrame(this.tick);
  }
  play(action) {
    if (!Object.hasOwn(ACTION_DURATIONS, action)) throw new RangeError('未知角色动作');
    if (!this.visible) return;
    this.action = action; this.startedAt = performance.now(); this.drawKey = '';
    this.draw(this.startedAt);
  }
  draw(now) {
    if (!this.visible) return;
    let pose = sampleMotion(this.action, now - this.startedAt, this.motion.matches);
    if (pose.completed) {
      this.action = 'idle'; this.startedAt = now;
      pose = sampleMotion('idle', 0, this.motion.matches);
    }
    const movement = this.actions.movement || { type: 'walk', amplitude: 1 };
    const amplitude = Number.isFinite(movement.amplitude) ? Math.max(0,Math.min(2,movement.amplitude)) : 1;
    let x = pose.offset * amplitude, y = 0, angle = 0;
    if(pose.action === 'walk' && !this.motion.matches){
      const age=now-this.startedAt;
      if(movement.type === 'hop')y=-Math.abs(Math.sin(age/340*Math.PI))*7*amplitude;
      else if(movement.type === 'float')y=Math.sin(age/600)*4*amplitude;
      else if(movement.type === 'dance'){y=-Math.abs(Math.sin(age/320))*3*amplitude;angle=Math.sin(age/350)*3*amplitude;}
    }
    const key = `${pose.action}/${pose.frame}/${pose.flip}/${x.toFixed(3)}/${y.toFixed(1)}/${angle.toFixed(1)}`;
    if (key === this.drawKey) return;
    this.drawKey = key;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, 384, 512);
    this.ctx.imageSmoothingEnabled = false;
    if (pose.flip) { this.ctx.translate(384, 0); this.ctx.scale(-1, 1); }
    const r=frameRect(this.monster,pose.frame);
    this.ctx.drawImage(this.sheet,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.sw,r.sh);
    this.canvas.style.transform = `translate(${(x * 100).toFixed(2)}%,${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
    this.canvas.dataset.action = pose.action;
    this.canvas.dataset.frame = String(pose.frame);
    this.canvas.dataset.direction = pose.flip ? 'left' : 'right';
    const actionKey={wave:'greet',blink:'blink',walk:'walk',pet:'pet',feed:'feed'}[pose.action];
    const label=this.actions[actionKey]?.label||ACTION_LABELS[pose.action];
    this.canvas.setAttribute('aria-label', `${this.monster.name}，${this.monster.form}，${label}`);
    this.onState(pose.action,label);
  }
  tick(now) {
    this.draw(now);
    this.handle = requestAnimationFrame(this.tick);
  }
  stop() { if (this.handle !== null) cancelAnimationFrame(this.handle); this.handle = null; }
  pause() {
    if (!this.visible || this.pausedAt !== null) return;
    this.pausedAt = performance.now(); this.stop();
  }
  resume() {
    if (!this.visible || this.pausedAt === null) return;
    this.startedAt += performance.now() - this.pausedAt;
    this.pausedAt = null; this.handle = requestAnimationFrame(this.tick);
  }
  hide() {
    this.stop(); this.visible = false; this.pausedAt = null;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, 384, 512);
    this.canvas.style.transform = ''; this.canvas.dataset.action = 'hidden';
  }
  destroy() { this.hide(); this.motion.removeEventListener('change', this.onMotionChange); }
}
