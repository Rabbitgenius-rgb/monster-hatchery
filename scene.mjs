import { createEggPixels, pixelsToCanvas } from './sprites.mjs';

const PALETTES={
  greenhouse:{wall:'#d2ddc4',floor:'#a3b598',seam:'#93a88e',frame:'#71866d',metal:'#7e9d88',dark:'#4d6a60',glass:'#dce9cb',glow:'#d7e8af',sky:'#b9d5c0',light:'#eff3d7'},
  ocean:{wall:'#c4d9d7',floor:'#a2c0bf',seam:'#91b1b1',frame:'#6f9296',metal:'#79a3a8',dark:'#4b747f',glass:'#d6e8e2',glow:'#bce3da',sky:'#79a5b4',light:'#eef5df'},
  observatory:{wall:'#cbcbdc',floor:'#b4b0c8',seam:'#a29bb9',frame:'#85809c',metal:'#9390af',dark:'#5d5b7a',glass:'#dcdced',glow:'#e0d3ef',sky:'#454b71',light:'#f1eadd'},
  forge:{wall:'#ddc9b3',floor:'#c8ad96',seam:'#b79a82',frame:'#a18c76',metal:'#b7977f',dark:'#816953',glass:'#eddbc4',glow:'#f2d4a2',sky:'#bda28d',light:'#f5e8cb'},
};
const ink='#465951';
const eggCache=new Map();
function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function line(ctx,x,y,w,color){box(ctx,x,y,w,1,color);}
function star(ctx,x,y,color,size=2){box(ctx,x-size,y,size*2+1,1,color);box(ctx,x,y-size,1,size*2+1,color);}
function plant(ctx,x,y,large=false){const h=large?26:16;box(ctx,x-6,y-6,13,7,'#a18c73');box(ctx,x-7,y-8,15,3,'#b3a089');box(ctx,x,y-h,2,h-7,'#7c9668');for(let a=0;a<3;a++){const yy=y-h+a*5;box(ctx,x-7,yy,7,3,'#88a475');box(ctx,x+2,yy+3,7,3,'#6f8f64');box(ctx,x-5,yy-1,4,1,'#a6be89');}}
function bottle(ctx,x,y,color){box(ctx,x+2,y,3,4,ink);box(ctx,x+1,y+4,5,8,'#edf0d4');box(ctx,x,y+6,7,6,color);box(ctx,x+1,y+5,1,3,'#f5f5dd');}

export function drawRoom(ctx, state, now=0, reduced=false) {
  const p=PALETTES[state.room]||PALETTES.greenhouse, t=reduced?0:now/1000;
  ctx.imageSmoothingEnabled=false;
  box(ctx,0,0,256,160,p.wall);
  for(let y=16;y<124;y+=25)line(ctx,0,y,256,p.frame+'15');
  for(let x=5;x<256;x+=43)box(ctx,x,0,1,124,p.frame+'10');
  box(ctx,0,122,256,38,p.floor);line(ctx,0,122,256,p.frame);line(ctx,0,125,256,p.light+'80');
  for(let y=134;y<160;y+=13) { line(ctx,0,y,256,p.seam);for(let x=y%26===4?8:24;x<256;x+=32)box(ctx,x,y-10,1,10,p.seam); }
  // Large back window: each room changes its view and atmosphere.
  box(ctx,23,24,61,62,p.frame);box(ctx,26,27,55,56,p.light);box(ctx,29,30,49,50,p.sky);
  if(state.room==='observatory') {
    for(const [x,y] of [[36,40],[62,38],[43,59],[69,69],[59,55]])star(ctx,x,y,p.light,1);
    box(ctx,57,38,12,14,'#d6d7d7');box(ctx,54,41,12,12,p.sky);box(ctx,43,67,3,3,'#9d99bb');
  } else if(state.room==='ocean') {
    box(ctx,29,54,49,26,'#83afb5');for(let i=0;i<5;i++){const x=34+i*9,y=41+(i*7)%32;box(ctx,x,y,3,1,'#b4d3ce');box(ctx,x-1,y+1,1,2,'#b4d3ce');}
    for(let i=0;i<3;i++){const x=38+i*14,y=61+i*4;box(ctx,x,y,5,2,'#5c899b');box(ctx,x+5,y-1,2,4,'#5c899b');}
  } else if(state.room==='forge') {
    box(ctx,29,57,49,23,'#c8ac90');box(ctx,58,37,9,9,'#ecd299');for(let x=30;x<78;x+=9) { box(ctx,x,71-(x%3)*3,8,12,'#a3927d');box(ctx,x,70-(x%3)*3,8,2,'#b0a18c'); }
  } else {
    box(ctx,29,63,49,17,'#a6bd98');box(ctx,54,38,10,10,'#edf0bf');for(let i=0;i<5;i++){const x=31+i*10,y=57+(i%2)*4;box(ctx,x,y,8,14,'#91ad89');box(ctx,x+2,y-3,4,3,'#91ad89');}line(ctx,33,43,12,'#e3ebce');line(ctx,36,41,8,'#e3ebce');
  }
  box(ctx,51,29,3,51,p.frame);box(ctx,28,54,52,3,p.frame);box(ctx,20,84,67,4,p.frame);line(ctx,23,84,61,p.light);
  // Pipework, shelves and a miniature science corner.
  box(ctx,5,7,246,5,p.frame);line(ctx,5,7,246,p.light);box(ctx,8,12,4,98,p.frame);box(ctx,10,12,1,97,p.light);
  for(const y of [31,77,111]) {box(ctx,6,y,8,4,p.dark);line(ctx,7,y,6,p.light);}
  box(ctx,14,100,62,5,p.frame);line(ctx,14,100,62,p.light);box(ctx,19,105,4,28,p.dark);box(ctx,68,105,4,28,p.dark);
  bottle(ctx,24,87,'#a4ba8a');bottle(ctx,38,86,state.room==='ocean'?'#84aeb5':'#b69cba');
  for(let i=0;i<4;i++)box(ctx,54+i*4,88-i%2*2,3,12,['#b1a484','#8e9f91','#b79e93','#a7b78c'][i]);
  box(ctx,16,53,4,29,p.frame);box(ctx,13,50,10,4,p.frame);box(ctx,15,55,6,6,p.glow);
  plant(ctx,33,138,true);plant(ctx,231,143,true);
  // A wall clock and room-specific poster.
  box(ctx,192,22,25,25,p.frame);box(ctx,194,24,21,21,p.light);box(ctx,197,27,15,15,p.wall);box(ctx,204,28,1,8,p.dark);box(ctx,204,35,5,1,p.dark);
  box(ctx,228,25,15,21,p.light);line(ctx,231,30,9,p.frame);line(ctx,231,34,6,p.frame);star(ctx,235,40,p.frame,2);
  // Side console, lamp and temperature readout.
  box(ctx,187,88,50,37,p.frame);box(ctx,189,90,46,32,p.metal);box(ctx,193,95,25,16,p.dark);box(ctx,195,97,21,12,'#c7d7ba');
  const wave=Math.round((Math.sin(t*2)+1)*2);for(let x=196;x<215;x++)box(ctx,x,103+Math.round(Math.sin(x*.8+wave)*2),1,1,p.dark);
  for(let i=0;i<3;i++){box(ctx,223,96+i*6,7,3,i===1?p.glow:p.light);box(ctx,225,96+i*6,2,1,p.dark);}
  box(ctx,190,125,4,9,p.dark);box(ctx,230,125,4,9,p.dark);
  box(ctx,175,41,4,55,p.frame);box(ctx,176,42,1,53,p.light);box(ctx,168,39,18,4,p.frame);box(ctx,169,43,15,3,p.glow);
  // Incubation chamber, with squared bevels and individually drawn glass.
  box(ctx,92,132,76,7,p.seam);box(ctx,99,138,7,5,p.dark);box(ctx,155,138,7,5,p.dark);
  box(ctx,88,120,84,15,p.dark);box(ctx,91,119,78,12,p.metal);line(ctx,93,120,74,p.light);line(ctx,94,130,72,p.frame);
  box(ctx,101,123,58,4,p.dark);box(ctx,109,124,42,2,p.glow);box(ctx,164,123,3,3,'#c2d8a7');
  box(ctx,92,48,76,72,p.dark);box(ctx,95,46,70,74,p.frame);box(ctx,101,37,58,9,p.dark);box(ctx,104,35,52,10,p.metal);line(ctx,106,36,48,p.light);
  box(ctx,98,51,64,66,p.glass);box(ctx,104,44,52,8,p.glass);box(ctx,101,49,58,68,p.glass);box(ctx,102,109,56,8,p.glow);
  // A sparse pixel halo keeps the object at the visual center.
  for(let i=0;i<12;i++){const x=108+(i*19)%46,y=54+(i*11)%52;box(ctx,x,y,1,1,p.light+'90');}
  if(state.status==='result') {
    // The approved full-resolution illustration is an image layer above this
    // canvas, so it retains its proportions and detail instead of shrinking
    // into the old 64x80 procedural sprite.
    if(state.revealAge<1600&&!reduced)for(let i=0;i<16;i++){const a=i*2.4,dist=8+state.revealAge/45;const x=130+Math.sin(a)*dist,y=82+Math.cos(a)*dist*.7;star(ctx,Math.round(x),Math.round(y),i%2?p.light:p.glow,i%3===0?2:1);}
  } else {
    const progress=state.status==='hatching'?state.progress:0, shake=progress>.36&&!reduced?Math.round(Math.sin(t*41)*(progress*2.5)):0, crack=progress>.4?(progress-.4)/.6:0;
    const bucket=Math.round(crack*12),key=state.egg+'-'+bucket;
    if(!eggCache.has(key))eggCache.set(key,pixelsToCanvas(createEggPixels(state.egg,bucket/12)));
    const bob=state.status==='hatching'?Math.round(Math.sin(t*9)):reduced?0:Math.round(Math.sin(t*1.9));
    ctx.drawImage(eggCache.get(key),105+shake,60+bob,50,60);
    if(progress>.25)for(let i=0;i<6;i++){const yy=110-(t*14+i*13)%55;star(ctx,105+i*9,Math.round(yy),p.light,1);}
  }
  // Glass edge reflections are deliberately outside the character's face.
  box(ctx,99,54,2,38,'#f5f2dd90');box(ctx,102,51,2,13,'#f5f2dd90');box(ctx,160,69,1,41,p.light+'b0');
  box(ctx,119,39,24,3,p.dark);for(let i=0;i<7;i++)box(ctx,120+i*3,39,1,3,p.glow);
  if(state.status==='hatching') {const bars=Math.ceil(state.progress*8);for(let i=0;i<8;i++)box(ctx,97+i*9,126,5,2,i<bars?p.light:p.dark);}
  // Small room-specific details, rather than just a palette swap.
  if(state.room==='greenhouse'){box(ctx,5,14,3,18,'#7b966d');box(ctx,7,23,8,2,'#93ac7c');box(ctx,235,8,2,10,'#7b966d');box(ctx,227,14,9,2,'#93ac7c');}
  if(state.room==='ocean'){for(let i=0;i<3;i++){const x=174+i*4,y=118-(t*8+i*16)%47;box(ctx,x,Math.round(y),2,2,'#d6ece3');}}
  if(state.room==='observatory'){star(ctx,184,58,'#ece7cd',2);star(ctx,222,66,'#ece7cd',1);box(ctx,50,11,1,10,p.frame);star(ctx,50,23,p.glow,3);}
  if(state.room==='forge'){box(ctx,51,109,16,12,p.dark);box(ctx,54,112,10,8,'#ce986a');box(ctx,57,111+Math.round(Math.sin(t*3)),4,9,'#edc58b');}
  // Temperature indicator follows the actual selected temperature.
  box(ctx,178,91,4,26,p.dark);box(ctx,179,93,2,22,p.light);const level=Math.round((state.temperature-16)/26*21);box(ctx,179,115-level,2,level,state.temperature>33?'#c99568':'#8cad82');
}

export function paintRoomThumbnail(canvas,room) {
  canvas.width=256;canvas.height=160;
  drawRoom(canvas.getContext('2d'),{room,egg:'meadow',temperature:28,status:'idle',progress:0},0,true);
}

export class Scene {
  constructor(canvas,getState){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.getState=getState;this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.last=0;this.frame=this.frame.bind(this);this.handle=requestAnimationFrame(this.frame);}
  frame(now){if(now-this.last>65){const state=this.getState(now);drawRoom(this.ctx,state,now,this.motion.matches);this.last=now;}this.handle=requestAnimationFrame(this.frame);}
  destroy(){cancelAnimationFrame(this.handle);}
}
