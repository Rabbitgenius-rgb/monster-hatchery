// Hand-drawn, integer-grid pixel interpretations of the approved character traits.
export class Pixels {
  constructor(width = 64, height = 80) { this.width = width; this.height = height; this.pixels = new Array(width * height).fill(null); }
  dot(x, y, color) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.pixels[y * this.width + x] = color; }
  rect(x, y, w, h, color) { for (let j = Math.round(y); j < y + h; j++) for (let i = Math.round(x); i < x + w; i++) this.dot(i, j, color); }
  oval(cx, cy, rx, ry, color) { for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) { const q = Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)); const dx = Math.floor(rx * q); this.rect(cx - dx, y, dx * 2 + 1, 1, color); } }
  line(x0, y0, x1, y1, color, size = 1) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (;;) { this.rect(x0, y0, size, size, color); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } }
  poly(points, color, stroke) { const minY = Math.max(0, Math.ceil(Math.min(...points.map(p => p[1])))), maxY = Math.min(this.height - 1, Math.floor(Math.max(...points.map(p => p[1])))); for (let y = minY; y <= maxY; y++) { const cuts = []; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) cuts.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } cuts.sort((a, b) => a - b); for (let i = 0; i < cuts.length; i += 2) this.rect(Math.ceil(cuts[i]), y, Math.floor(cuts[i + 1]) - Math.ceil(cuts[i]) + 1, 1, color); } if (stroke) points.forEach((a, i) => { const b = points[(i + 1) % points.length]; this.line(...a, ...b, stroke); }); }
}

const base = { hair: '#496ba1', light: '#8cb7cb', dark: '#2b3d64', outfit: '#354b78', trim: '#d5b36c', skin: '#f5d6bf', eyes: '#5b90ae', style: 'maid', hairstyle: 'wave', ears: 'whale', tail: 'whale', tags: ['whale', 'water'], temperature: 25, accessory: '', wings: '' };
const DS = {
  M01: { style: 'longMaid' }, M02: { style: 'simple' }, M03: { style: 'maid', accessory: 'frills' }, M04: { style: 'maid', tiny: true, accessory: 'bow' }, M05: { style: 'bodysuit', hairstyle: 'wave' },
  M13: { hairstyle: 'wave', accessory: 'beads' }, M14: { hairstyle: 'bob' }, M15: { hairstyle: 'middle' }, M16: { hairstyle: 'twinCurl' }, M17: { hairstyle: 'lowTwin', accessory: 'bow' }, M18: { hairstyle: 'halfPony' }, M19: { hairstyle: 'buns' }, M20: { hairstyle: 'shortTwin' }, M21: { hairstyle: 'twinBraid' }, M22: { hairstyle: 'sideBraid' }, M23: { hairstyle: 'bowWave', accessory: 'bigBow' }, M24: { hairstyle: 'highPony', accessory: 'finBow' }, M25: { hairstyle: 'topBunWave', accessory: 'ribbon' }, M26: { hairstyle: 'hime' }, M27: { hairstyle: 'curlyBob' }, M28: { hairstyle: 'fluffy' },
  M35: { hairstyle: 'sideBraid', style: 'asymMaid', accessory: 'notebook' }, M36: { body: 'plump' }, M37: { body: 'round', accessory: 'belly' }, M38: { hairstyle: 'updo', accessory: 'pearls' }, M39: { hairstyle: 'sideCurl', accessory: 'whiteBow' }, M40: { hairstyle: 'drill' }, M41: { style: 'court', hairstyle: 'halfPony', tags: ['whale', 'royal'] }, M42: { hair: '#454c47', light: '#9fac9e', dark: '#26332e', outfit: '#3c5146', trim: '#97bc93' }, M43: { hair: '#4c343c', light: '#9a6c79', dark: '#30272f', outfit: '#503242', trim: '#d07a79', eyes: '#b8757c', temperature: 33 }, M49: { hairstyle: 'sideBraid', style: 'asymMaid', accessory: 'monocle', tags: ['whale', 'craft'] }, M51: { style: 'hanfu', outfit: '#dce7e7', trim: '#8da8b9', tags: ['whale', 'royal'] }, M52: { style: 'hanfu', hairstyle: 'braided', outfit: '#d6e2e8', accessory: 'ribbon', tags: ['whale', 'royal'] }, M53: { style: 'hanfu', hairstyle: 'lowBun', outfit: '#e0e6ed', accessory: 'hairpin', tags: ['whale', 'royal'] }, M54: { style: 'gown', outfit: '#373b49', hairstyle: 'wave', accessory: 'blackRose', tags: ['whale', 'royal'] }, M61: { hair: '#383b4b', light: '#8c9dad', dark: '#252d40', outfit: '#424958', trim: '#a9bec6', style: 'asymMaid', accessory: 'hetero', tags: ['whale', 'craft'], temperature: 31 }, M62: { style: 'hanfu', hairstyle: 'lowBun', outfit: '#dfe6e4', accessory: 'sword', tags: ['whale', 'craft'], temperature: 32 }, M63: { style: 'warrior', hairstyle: 'highPony', accessory: 'spear', tags: ['whale', 'craft'], temperature: 36 },
};
const OTHER = {
  M06: { hair: '#574338', light: '#977363', dark: '#382f2d', outfit: '#3a4143', style: 'casual', hairstyle: 'bob', eyes: '#4a3c33', ears: '', tail: '', tags: ['everyday'], temperature: 29 },
  M07: { hair: '#e8e2cd', light: '#fff5de', dark: '#8d8e7b', outfit: '#e9e4d2', style: 'pajamas', hairstyle: 'curlyBob', ears: 'llama', tail: '', eyes: '#b6b398', tags: ['nature'], temperature: 24 },
  M08: { hair: '#cf8e77', light: '#f0b997', dark: '#805e59', outfit: '#bd8e83', trim: '#f1d4ad', hairstyle: 'bob', style: 'casual', accessory: 'beretCamera', ears: '', tail: '', tags: ['everyday'], temperature: 28 },
  M09: { hair: '#3d4055', light: '#727892', dark: '#2a2d42', outfit: '#e4dfd5', style: 'hanfu', accessory: 'scarf', ears: '', tail: '', tags: ['nature', 'everyday'], temperature: 24 },
  M10: { hair: '#635697', light: '#9c91c5', dark: '#3d3c69', outfit: '#a4a6d3', style: 'longMaid', accessory: 'wheelchair', ears: '', tail: '', tags: ['craft', 'water'], temperature: 26 },
  M11: { hair: '#d4aa67', light: '#f4d994', dark: '#99684f', outfit: '#ac5f58', trim: '#f0cf89', style: 'royal', ears: 'cat', tail: 'cat', accessory: 'redHat', tags: ['fire', 'royal'], temperature: 33 },
  M12: { hair: '#407c7c', light: '#91b9a7', dark: '#2b515e', outfit: '#42646c', trim: '#d1c29b', style: 'robe', accessory: 'staffGlasses', ears: '', tail: '', tags: ['nature', 'cosmic'], temperature: 20 },
  M29: { hair: '#8b86b9', light: '#beb9d6', dark: '#56577f', outfit: '#7774a2', trim: '#dac79a', style: 'hanfu', hairstyle: 'sideBraid', accessory: 'fan', ears: '', tail: '', tags: ['royal', 'water'], temperature: 24 },
  M30: { hair: '#353640', light: '#858593', dark: '#252b39', outfit: '#42434b', style: 'longMaid', ears: 'fox', tail: 'fox', accessory: 'headband', tags: ['nature', 'cosmic'], temperature: 22 },
  M31: { hair: '#dddde7', light: '#fcf3e7', dark: '#9092ad', outfit: '#434367', trim: '#d6d1e1', style: 'starCape', accessory: 'moonBow', ears: '', tail: '', eyes: '#8982b1', tags: ['cosmic'], temperature: 19 },
  M32: { hair: '#c98459', light: '#ebbd88', dark: '#825a48', outfit: '#b97b5a', trim: '#f0d7ab', hairstyle: 'sideBraid', style: 'robe', accessory: 'book', ears: '', tail: '', tags: ['fire', 'everyday'], temperature: 30 },
  M33: { hair: '#9a77c0', light: '#a7c8dc', dark: '#635282', outfit: '#c2c5e7', trim: '#86c8c9', style: 'future', hairstyle: 'highPony', accessory: 'device', ears: '', tail: '', tags: ['cosmic', 'everyday'], temperature: 28 },
  M34: { hair: '#9a85ca', light: '#c5a9e3', dark: '#5f6095', outfit: '#6c6895', trim: '#e5d69b', hairstyle: 'twinCurl', ears: 'cat', tail: 'cat', accessory: 'stars', tags: ['cosmic', 'nature'], temperature: 22 },
  M44: { hair: '#7770b2', light: '#b1a4d3', dark: '#49477d', outfit: '#57558e', trim: '#c0b08b', style: 'hanfu', hairstyle: 'sideBraid', accessory: 'fan', ears: '', tail: '', tags: ['royal', 'cosmic'], temperature: 25 },
  M45: { hair: '#5873a6', light: '#a5bfe1', dark: '#374c76', outfit: '#ece8d0', trim: '#d4b473', style: 'royal', accessory: 'crown', ears: '', tail: '', tags: ['royal', 'cosmic'], temperature: 29 },
  M46: { hair: '#454251', light: '#ba8aaf', dark: '#2c3144', outfit: '#5b465e', trim: '#e2a17b', style: 'future', hairstyle: 'bob', accessory: 'headphones', ears: '', tail: '', tags: ['fire', 'craft'], temperature: 32 },
  M47: { hair: '#3b464c', light: '#9db7aa', dark: '#293340', outfit: '#d8dfd8', trim: '#96b8ae', style: 'robe', accessory: 'headphones', ears: '', tail: '', tags: ['nature', 'craft'], temperature: 23 },
  M48: { hair: '#e6e3ec', light: '#fff7eb', dark: '#9d9bba', outfit: '#e2ddeb', trim: '#b3a6cc', style: 'gown', ears: 'horns', tail: 'dragon', wings: 'dragon', eyes: '#a49bb9', accessory: 'knot', tags: ['dragon', 'cosmic'], temperature: 24 },
  M50: { kind: 'dino', tags: ['fire', 'nature'], temperature: 35 },
  M55: { hair: '#d7dfed', light: '#fff8ed', dark: '#8b9dbe', outfit: '#e8e9e0', trim: '#9fb7da', style: 'workcoat', hairstyle: 'curlyBob', ears: 'horns', tail: 'dragon', accessory: 'pens', tags: ['dragon', 'craft'], temperature: 29 },
  M56: { hair: '#d9b572', light: '#f2d59b', dark: '#9a7456', outfit: '#443742', trim: '#ba9a67', style: 'gown', hairstyle: 'twinCurl', ears: 'horns', tail: 'dragon', accessory: 'axe', tags: ['fire', 'royal'], temperature: 37 },
  M57: { hair: '#534e8b', light: '#9185b7', dark: '#343854', outfit: '#41446c', trim: '#9287b8', style: 'robe', wings: 'feather', accessory: 'halo', ears: '', tail: '', tags: ['cosmic', 'craft'], temperature: 18 },
  M58: { hair: '#4e4558', light: '#b184b3', dark: '#2e3146', outfit: '#5d4765', trim: '#ce9cbc', style: 'robe', wings: 'feather', accessory: 'scales', ears: '', tail: '', tags: ['royal', 'craft'], temperature: 30 },
  M59: { hair: '#c78a5c', light: '#edbe89', dark: '#865b48', outfit: '#e8dbbd', trim: '#c2a46a', style: 'toga', hairstyle: 'lowBun', accessory: 'laurel', ears: '', tail: '', tags: ['royal', 'fire'], temperature: 32 },
  M60: { hair: '#4d5b83', light: '#9bafc3', dark: '#2e3e5c', outfit: '#354d67', trim: '#d2b97e', style: 'royal', accessory: 'captain', ears: '', tail: '', tags: ['water', 'royal'], temperature: 23 },
  M64: { hair: '#e0dfed', light: '#fff6df', dark: '#9ca7c5', outfit: '#dce4ed', trim: '#b3a3d0', style: 'starCape', wings: 'dragon', ears: 'horns', tail: 'dragon', accessory: 'constellation', eyes: '#a195c2', tags: ['dragon', 'cosmic'], temperature: 18 },
  M65: { hair: '#3c3445', light: '#86706d', dark: '#242937', outfit: '#383039', trim: '#c0a06a', skin: '#cba88f', style: 'gown', wings: 'dragon', ears: 'horns', tail: 'dragon', accessory: 'tablet', eyes: '#c5ad78', tags: ['dragon', 'craft', 'fire'], temperature: 38 },
};

export function profileFor(id) {
  const override = OTHER[id] || DS[id];
  if (!override) throw new Error('缺少像素角色：' + id);
  return { ...base, ...override, id };
}
const OUT = '#343d47';
const WHITE = '#f4efdd';
function star(b, x, y, color, r = 2) { b.line(x-r,y,x+r,y,color); b.line(x,y-r,x,y+r,color); b.dot(x,y,WHITE); }

export function createSpritePixels(id) {
  const p = profileFor(id), b = new Pixels();
  if (p.kind === 'dino') { dino(b); return b; }
  const wide = p.body === 'round' ? 9 : p.body === 'plump' ? 5 : 0;
  // Silhouette: tail and wings stay behind the body.
  if (p.wings) for (const sign of [-1, 1]) {
    const points = [[32+sign*8,40],[32+sign*25,28],[32+sign*29,51],[32+sign*18,47],[32+sign*12,57]];
    b.poly(points, p.wings === 'dragon' ? p.light : p.dark, OUT);
    for (let y=37; y<54; y+=5) b.line(32+sign*11,41,32+sign*(p.wings === 'dragon'?24:28),y,p.hair);
  }
  if (p.tail === 'whale') { b.poly([[39,61],[48,60],[55,52],[59,49],[59,56],[55,61],[49,66],[39,66]],p.hair,OUT); b.poly([[55,53],[51,46],[57,48],[61,44],[62,49],[58,55]],p.dark,OUT); b.line(45,62,54,57,p.light); }
  if (p.tail === 'cat') { b.line(43,63,54,61,p.dark,4); b.line(54,61,56,51,p.dark,4); b.line(54,52,51,49,p.hair,3); }
  if (p.tail === 'fox') { b.oval(50,58,11,12,OUT); b.oval(50,57,10,11,p.hair); b.poly([[49,47],[58,50],[60,57],[52,54],[46,55]],WHITE); }
  if (p.tail === 'dragon') { b.poly([[38,61],[48,61],[53,55],[55,49],[57,55],[54,64],[45,69],[38,67]],p.light,OUT); for(let k=0;k<4;k++) b.dot(48+k*2,61-k*2,p.trim); }
  drawHairBack(b,p);
  if (p.accessory === 'wheelchair') { for (const x of [17,47]) { b.oval(x,62,8,10,OUT); b.oval(x,62,5,7,'#a8b6bd'); b.line(x,55,x,68,OUT); b.line(x-5,62,x+5,62,OUT); } b.rect(20,41,3,23,p.dark); b.rect(41,41,3,23,p.dark); }
  const footY = p.tiny ? 65 : 71;
  b.rect(25,59,5,footY-58,p.skin); b.rect(35,59,5,footY-58,p.skin);
  b.rect(24,footY,7,4,OUT); b.rect(34,footY,7,4,OUT); b.rect(25,footY,4,1,WHITE); b.rect(35,footY,4,1,WHITE);
  drawClothes(b,p,wide);
  b.oval(20-wide/2,46,3,5,p.outfit); b.oval(44+wide/2,46,3,5,p.outfit);
  b.rect(18-wide/2,49,4,4,p.skin); b.rect(43+wide/2,49,4,4,p.skin);
  b.rect(19-wide/2,47,3,2,WHITE); b.rect(43+wide/2,47,3,2,WHITE);
  const headRX=wide?13:12;
  b.oval(32,26,headRX+1,12,OUT); b.oval(32,26,headRX,11,p.skin); b.oval(31,24,headRX-1,8,'#f8dfc9');
  drawEars(b,p);
  drawHairFront(b,p);
  const eyeY = p.body === 'round' ? 27 : 26;
  for(const x of [25,36]) { b.rect(x,eyeY,4,5,p.dark); b.rect(x+1,eyeY+1,3,3,p.eyes); b.dot(x+1,eyeY,WHITE); b.dot(x+2,eyeY+2,'#b6d0d1'); }
  if (p.accessory==='hetero') { b.rect(26,27,3,3,'#bd7d7f'); b.dot(26,26,WHITE); }
  b.rect(23,32,3,1,'#dfa7a0'); b.rect(39,32,3,1,'#dfa7a0'); b.rect(31,34,3,1,'#a87876');
  // An intentional asymmetrical fringe for the hime hairstyle.
  if(p.hairstyle==='hime') b.poly([[22,16],[33,14],[32,26],[28,31],[24,28]],p.hair,p.dark);
  drawAccessories(b,p);
  return b;
}

function drawHairBack(b,p) {
  const h=p.hairstyle, long=!['bob','curlyBob','fluffy','buns','shortTwin','updo'].includes(h);
  b.oval(32,25,16,18,p.dark); b.oval(32,24,15,17,p.hair);
  if(long) { b.poly([[18,24],[16,52],[12,59],[18,63],[23,58],[25,46],[40,46],[43,61],[51,62],[48,55],[46,27]],p.hair,p.dark); for(const x of [18,21,43,46]) b.line(x,38,x-2,55,p.light); }
  if(['twinCurl','lowTwin','shortTwin','drill','twinBraid'].includes(h)) for(const s of [-1,1]) {
    if(h==='twinBraid') for(let y=32;y<57;y+=5) { b.oval(32+s*17,y,4,4,p.dark); b.oval(32+s*17,y-1,3,3,p.hair); b.dot(32+s*17,y,p.light); }
    else if(h==='drill') for(let y=30;y<57;y+=6) { b.oval(32+s*19,y,7-(y-30)/10,4,p.dark); b.oval(32+s*19,y-1,6-(y-30)/10,3,p.hair); b.line(32+s*23,y,32+s*16,y+2,p.light); }
    else { const yy=h==='shortTwin'?35:h==='lowTwin'?44:37, ry=h==='shortTwin'?8:16; b.oval(32+s*19,yy,7,ry,p.dark); b.oval(32+s*19,yy-1,6,ry-1,p.hair); b.line(32+s*19,yy-7,32+s*21,yy+7,p.light); }
  }
  if(['buns','lowBun','topBunWave','updo'].includes(h)) { const positions=h==='buns'?[[17,16],[47,16]]:h==='updo'?[[46,29]]:h==='lowBun'?[[44,24]]:[[39,10]]; for(const [x,y] of positions) { b.oval(x,y,7,6,p.dark); b.oval(x,y-1,6,5,p.hair); b.line(x-3,y-2,x+3,y+2,p.light); } }
  if(['highPony','halfPony','sideCurl'].includes(h)) { const x=h==='highPony'?43:49, y=h==='highPony'?15:30; b.oval(x,y+11,8,17,p.dark); b.oval(x,y+10,7,16,p.hair); b.line(x+2,y+3,x+4,y+19,p.light); }
  if(h==='sideBraid') for(let y=31;y<57;y+=5) { b.oval(44,y,4,4,p.dark); b.oval(44,y-1,3,3,p.hair); b.dot(45,y,p.light); }
  if(h==='braided') { b.line(19,19,26,16,p.light,2); b.line(39,16,46,22,p.light,2); }
  if(['bob','curlyBob','fluffy','middle'].includes(h)) { const bottom=h==='middle'?46:37; b.poly([[17,23],[17,bottom],[23,bottom+3],[23,31],[41,31],[41,bottom+3],[48,bottom],[47,22]],p.hair,p.dark); if(h==='fluffy') for(let y=18;y<38;y+=5) { b.poly([[16,y],[12,y+5],[19,y+7]],p.hair,p.dark); b.poly([[47,y],[52,y+5],[44,y+7]],p.hair,p.dark); } }
}
function drawHairFront(b,p) {
  b.oval(32,17,15,9,p.dark); b.oval(32,17,14,8,p.hair);
  b.poly([[19,17],[25,12],[31,14],[29,25],[24,23],[20,26]],p.hair,p.dark);
  b.poly([[28,14],[35,13],[39,18],[35,25],[32,23]],p.hair,p.dark);
  b.poly([[36,14],[44,17],[46,26],[40,23],[38,22]],p.hair,p.dark);
  b.line(22,15,24,14,p.light,2); b.line(34,14,37,16,p.light,2); b.rect(21,19,2,3,p.light);
  if(p.hairstyle==='curlyBob') for(const x of [17,21,43,47]) b.oval(x,34,3,4,p.hair);
  // A curl above the head is part of the whale-family silhouette.
  if(p.ears==='whale') { b.line(31,9,30,5,p.dark); b.line(30,5,34,3,p.dark); b.line(34,3,38,6,p.dark); }
  if(['maid','longMaid','simple','asymMaid'].includes(p.style)) { b.line(18,13,24,9,WHITE,2); b.line(24,9,39,9,WHITE,2); b.line(39,9,46,14,WHITE,2); for(let x=21;x<44;x+=4) b.rect(x,8,2,2,WHITE); }
}
function drawEars(b,p) {
  if(p.ears==='whale') { b.poly([[20,23],[13,27],[14,30],[21,29]],p.hair,p.dark); b.line(15,29,20,29,WHITE); b.poly([[44,23],[51,27],[50,30],[43,29]],p.hair,p.dark); b.line(45,29,50,29,WHITE); }
  if(p.ears==='cat'||p.ears==='fox') for(const s of [-1,1]) { b.poly([[32+s*7,15],[32+s*16,5],[32+s*17,21]],p.hair,OUT); b.poly([[32+s*12,14],[32+s*15,10],[32+s*15,19]],p.ears==='fox'?WHITE:'#d3a2b2'); }
  if(p.ears==='horns') for(const s of [-1,1]) b.poly([[32+s*8,12],[32+s*11,2],[32+s*15,7],[32+s*13,17]],p.light,p.dark);
  if(p.ears==='llama') for(const s of [-1,1]) { b.oval(32+s*12,8,4,8,p.dark); b.oval(32+s*12,8,3,7,p.hair); b.line(32+s*12,4,32+s*12,10,'#d3b4b1',2); }
}
function drawClothes(b,p,wide) {
  const long=['longMaid','asymMaid','court','gown','hanfu','robe','royal','starCape','toga'].includes(p.style), hem=long?68:p.tiny?60:62, l=20-wide, r=44+wide;
  if(p.style==='bodysuit') { b.rect(24,39,16,22,WHITE); b.rect(25,59,5,12,WHITE); b.rect(35,59,5,12,WHITE); b.line(32,49,32,60,'#c3cdd0'); return; }
  b.poly([[25,37],[39,37],[42,47],[r,hem],[l,hem],[22,47]],p.outfit,OUT);
  b.line(27,38,24,hem-2,p.light); b.line(38,40,41,hem-2,p.dark);
  if(p.style==='casual'||p.style==='future'||p.style==='warrior'||p.style==='pajamas'||p.style==='workcoat') {
    const upper=p.style==='workcoat'?WHITE:p.outfit; b.rect(24-wide/2,38,16+wide,17,upper);
    if(p.style==='warrior'||p.style==='casual') { b.rect(23,55,8,13,p.dark); b.rect(34,55,8,13,p.dark); }
    else if(p.style==='pajamas') { b.rect(23,53,8,16,p.outfit); b.rect(34,53,8,16,p.outfit); }
    else { b.poly([[23,52],[40,52],[43,61],[20,61]],upper,OUT); b.line(32,38,32,60,p.trim); }
    b.rect(28,40,8,4,WHITE); b.rect(31,42,2,3,p.trim);
  } else if(['maid','longMaid','simple','asymMaid'].includes(p.style)) {
    b.poly([[28,37],[36,37],[38,46],[26,46]],WHITE); b.rect(23-wide,47,18+wide*2,2,WHITE);
    b.poly([[25-wide/2,49],[39+wide/2,49],[41+wide,hem-4],[37,hem-2],[27,hem-2],[23-wide,hem-4]],WHITE,p.light);
    if(p.style!=='simple') { b.rect(30,53,4,2,p.hair); b.dot(29,52,p.hair); b.dot(34,52,p.hair); }
    for(let x=l+1;x<r;x+=4) b.rect(x,hem,3,2,WHITE);
    if(p.style!=='simple')b.line(l+3,hem-4,r-3,hem-4,p.trim);
    if(p.accessory==='frills')for(let y=49;y<hem-5;y+=3){b.rect(22,y,2,2,WHITE);b.rect(41,y,2,2,WHITE);}
    b.rect(29,39,3,2,p.dark); b.rect(33,39,3,2,p.dark); b.dot(32,42,p.trim); b.dot(32,45,p.trim);
  } else if(p.style==='hanfu'||p.style==='court'||p.style==='toga') {
    b.poly([[26,37],[37,37],[42,47],[39,hem-2],[24,hem-2],[23,46]],WHITE);
    b.line(25,39,37,48,p.light,2); b.line(37,39,29,49,p.light,2); b.rect(24,48,16,3,p.dark); b.rect(30,51,3,hem-51,p.trim);
    b.poly([[22,39],[15,52],[22,56],[26,42]],p.outfit,p.dark); b.poly([[42,39],[49,52],[42,56],[38,42]],p.outfit,p.dark);
  } else { b.poly([[28,38],[36,38],[36,46],[40,hem-3],[25,hem-3]],p.style==='gown'?p.outfit:WHITE); b.rect(24,46,16,2,p.trim); for(let x=23;x<44;x+=5) star(b,x,59+(x%3),p.trim,1); }
  if(p.style==='starCape') { b.poly([[23,38],[17,65],[26,60],[30,43]],p.outfit,p.dark); b.poly([[41,38],[47,66],[38,61],[34,43]],p.outfit,p.dark); for(const [x,y] of [[21,49],[43,48],[23,59],[42,59]]) star(b,x,y,p.trim,1); }
  if(p.body==='plump') b.line(17,58,46,58,p.trim);
  if(p.body==='round') { b.oval(32,54,23,15,p.dark); b.oval(32,53,22,14,p.outfit); b.oval(32,55,14,10,WHITE); b.rect(28,53,7,3,p.hair); b.line(12,63,52,63,p.trim); }
}
function drawAccessories(b,p) {
  const a=p.accessory;
  if(['bow','bigBow','whiteBow','ribbon','finBow','beads','pearls','headband','moonBow'].includes(a)) { const c=a==='whiteBow'||a==='pearls'?WHITE:p.trim, x=a==='bigBow'?44:46; b.poly([[x,16],[x+5,13],[x+5,20]],c,p.dark); b.poly([[x,16],[x-4,13],[x-4,20]],c,p.dark); b.rect(x-1,16,2,3,WHITE); if(a==='pearls') for(let y=19;y<28;y+=3)b.dot(49,y,WHITE); }
  if(a==='hairpin'||a==='blackRose') { star(b,46,16,a==='blackRose'?OUT:p.trim,3); b.line(44,18,49,24,p.trim); }
  if(a==='scarf') { b.rect(22,37,20,4,'#b96b60'); b.poly([[24,39],[19,53],[24,51],[28,40]],'#b96b60',OUT); }
  if(a==='monocle') { b.oval(38,28,5,6,p.trim); b.oval(38,28,4,5,null); b.rect(37,27,3,4,p.eyes); b.dot(37,27,WHITE); b.line(43,29,46,44,p.trim); }
  if(a==='book'||a==='notebook'||a==='tablet') { const c=a==='book'?'#755a4f':a==='tablet'?'#44434c':WHITE; b.rect(43,43,10,13,OUT); b.rect(44,44,8,11,c); b.line(45,45,45,53,p.trim); star(b,48,49,p.trim,1); }
  if(a==='sword') { b.line(11,46,11,71,'#a9bac9',2); b.line(12,47,12,65,WHITE); b.line(7,46,16,46,p.trim,2); b.rect(11,39,3,6,p.dark); b.dot(12,40,p.trim); }
  if(a==='spear') { b.line(10,22,10,75,p.dark,2); b.poly([[10,14],[5,27],[10,24],[14,27]],'#b3cbd1',OUT); b.line(9,17,9,24,WHITE); b.line(12,32,15,41,p.trim); }
  if(a==='axe') { b.line(10,30,10,74,p.trim,2); b.poly([[9,20],[3,25],[3,37],[9,33],[17,37],[17,25]],p.dark,p.trim); }
  if(a==='fan') { b.poly([[43,44],[43,34],[49,29],[58,34],[57,42],[47,47]],p.hair,p.trim); for(let x=44;x<58;x+=3)b.line(47,46,x,33,WHITE); }
  if(a==='staffGlasses') { b.line(10,25,10,72,p.trim,2); star(b,10,21,p.light,5); b.line(24,28,40,28,p.dark); b.oval(27,28,5,4,p.dark); b.oval(38,28,5,4,p.dark); b.rect(25,27,4,3,p.light); b.rect(36,27,4,3,p.light); }
  if(a==='beretCamera'||a==='redHat'||a==='captain') { const c=a==='redHat'?'#a86458':a==='captain'?p.outfit:'#cda4a0'; b.oval(32,11,17,4,p.dark); b.oval(32,10,16,3,c); b.poly([[22,9],[23,3],[41,3],[44,9]],c,p.dark); b.line(23,8,42,8,p.trim); star(b,32,6,p.trim,2); if(a==='beretCamera') { b.rect(44,46,10,7,p.dark); b.oval(49,49,2,2,p.light); } }
  if(a==='laurel'||a==='crown') { for(let x=20;x<46;x+=4) b.poly([[x,12],[x-1,6],[x+3,9]],p.trim,p.dark); b.line(21,13,43,13,p.trim); }
  if(a==='halo') { b.oval(32,7,17,5,p.trim); b.oval(32,7,14,3,null); for(const x of [17,24,32,40,47]) b.line(x,5,x,1,p.dark); }
  if(a==='headphones') { b.line(17,14,17,30,p.dark,3); b.line(47,14,47,30,p.dark,3); b.line(19,9,45,9,p.dark,3); b.rect(14,23,6,9,p.trim); b.rect(45,23,6,9,p.trim); }
  if(a==='stars'||a==='constellation'||a==='moonBow') for(const [x,y] of [[9,24],[54,17],[55,39]]) star(b,x,y,p.trim,a==='constellation'?3:2);
  if(a==='device') { b.rect(43,45,8,12,p.dark); b.rect(44,46,6,8,p.light); b.rect(45,48,4,2,WHITE); }
  if(a==='pens') { for(let x=37;x<42;x+=2)b.line(x,43,x,49,p.hair); b.rect(36,48,7,5,p.light); }
  if(a==='scales') { b.line(9,39,9,71,p.trim); b.line(2,42,17,42,p.trim); b.line(3,42,1,49,p.light); b.line(15,42,18,49,p.light); b.line(0,49,5,49,p.trim); b.line(14,49,19,49,p.trim); }
  if(a==='knot') { b.oval(32,49,4,4,p.dark); b.oval(32,49,2,2,WHITE); b.dot(32,49,p.outfit); }
}
function dino(b) {
  b.poly([[42,53],[56,50],[59,55],[52,62],[41,64]],'#e1bb6e',OUT);
  b.oval(31,52,18,19,OUT); b.oval(31,51,17,18,'#e3c674'); b.oval(31,54,11,13,'#f0dfad');
  b.oval(30,29,21,19,OUT); b.oval(30,28,20,18,'#e9cc7c'); b.oval(29,24,17,13,'#f1d98c');
  for(const x of [21,35]) { b.oval(x,28,5,7,OUT); b.oval(x,28,4,6,'#e9ede0'); b.oval(x+1,29,2,4,'#799267'); b.dot(x+1,26,WHITE); }
  b.line(26,39,33,39,'#906d50'); b.dot(25,38,'#906d50'); b.dot(34,38,'#906d50');
  b.oval(13,49,5,7,'#d9b769'); b.oval(47,49,5,7,'#d9b769'); b.rect(19,68,10,5,OUT); b.rect(34,68,10,5,OUT); b.rect(20,67,8,5,'#ddbf76'); b.rect(35,67,8,5,'#ddbf76');
  b.rect(18,38,3,2,'#e2aa7b'); b.rect(39,38,3,2,'#e2aa7b');
}

export function createEggPixels(id='meadow', crack=0) {
  const palettes = { meadow: ['#e5dec0','#91ab80','#c5d39d'], tide: ['#c2dce1','#6d9fb4','#94bccc'], nebula: ['#d2c4e1','#8d78ad','#b49ec9'], amber: ['#e6ca9d','#bd8c58','#d3a86d'] };
  const [shell,spot,shade]=palettes[id] || palettes.meadow, b=new Pixels(40,48);
  b.poly([[16,5],[23,5],[28,11],[33,24],[33,33],[29,39],[11,39],[7,33],[7,24],[12,11]],shell,OUT);
  b.poly([[27,12],[32,24],[32,33],[28,38],[13,38],[12,35],[25,35],[28,29]],shade);
  b.rect(14,12,3,7,'#f7f2dd'); b.rect(12,19,2,4,'#f7f2dd');
  if(id==='meadow') { for(const [x,y] of [[23,14],[14,28],[26,29],[20,35]]) b.oval(x,y,3,2,spot); }
  if(id==='tide') { for(const y of [20,29]) { b.line(10,y,17,y+2,spot,2); b.line(17,y+2,28,y-1,spot,2); } b.dot(23,12,WHITE); }
  if(id==='nebula') { for(const [x,y] of [[23,15],[14,27],[27,29]]) star(b,x,y,spot,2); }
  if(id==='amber') { b.poly([[22,17],[15,28],[21,26],[18,34],[27,23],[21,24]],spot); }
  if(crack>0) { const points=[[20,6],[17,14],[23,18],[18,25],[23,29],[19,38]]; const count=Math.min(points.length,Math.ceil(crack*points.length)); for(let i=1;i<count;i++)b.line(...points[i-1],...points[i],OUT,crack>.7?2:1); }
  return b;
}

const canvasCache = new Map();
export function pixelsToCanvas(bitmap) {
  const canvas=document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d'), image=ctx.createImageData(bitmap.width,bitmap.height), colors=new Map();
  bitmap.pixels.forEach((hex,i)=>{ if(!hex)return; if(!colors.has(hex))colors.set(hex,[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]); const rgb=colors.get(hex); image.data.set([...rgb,255],i*4); });
  ctx.putImageData(image,0,0); return canvas;
}
export function spriteCanvas(id) { if(!canvasCache.has(id))canvasCache.set(id,pixelsToCanvas(createSpritePixels(id))); return canvasCache.get(id); }
export function paintSprite(canvas,id) { const ctx=canvas.getContext('2d'); canvas.width=64; canvas.height=80; ctx.imageSmoothingEnabled=false; ctx.drawImage(spriteCanvas(id),0,0); }
export function paintEgg(canvas,id) { canvas.width=40;canvas.height=48;canvas.getContext('2d').drawImage(pixelsToCanvas(createEggPixels(id)),0,0); }
