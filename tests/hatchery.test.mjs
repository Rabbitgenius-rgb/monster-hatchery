import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS } from '../catalog.mjs';
import { EGGS,ROOMS,INITIAL_CONDITIONS,distribution,tierDistribution,pickMonster,rollScore,createHatch,SCORE_RANGE,validateConditions } from '../engine.mjs';
import { frameRect, portraitStyle } from '../character-animation.mjs';
const baseline={...INITIAL_CONDITIONS};

test('65 appearances retain stable IDs, adult/Q forms and no fixed score field',()=>{
 assert.equal(MONSTERS.length,65);assert.equal(new Set(MONSTERS.map(m=>m.id)).size,65);
 assert.ok(MONSTERS.some(m=>m.form==='成年版'));assert.ok(MONSTERS.some(m=>m.form==='Q版'));
 assert.ok(MONSTERS.every(m=>['成年版','Q版'].includes(m.form)));
 for(const [i,m] of MONSTERS.entries()){assert.equal(m.id,`M${String(i+1).padStart(2,'0')}`);assert.equal(Object.hasOwn(m,'score'),false);assert.equal(m.animationSheet,`./assets/monsters/${m.id}-actions.png`);}
});
test('per-frame offsets align blink poses without changing their source cell or natural size',()=>{
 assert.deepEqual(frameRect('M01',3),{sx:1152,sy:0,sw:384,sh:512,dx:0,dy:0});
 assert.deepEqual(frameRect('M02',1),{sx:384,sy:0,sw:384,sh:512,dx:32,dy:0});
 assert.deepEqual(frameRect('M18',1),{sx:384,sy:0,sw:384,sh:512,dx:27,dy:0});
 assert.throws(()=>frameRect('M01',8),RangeError);
});
test('M23 animation and portrait both use its isolated subject crop at original pixel size',()=>{
 assert.deepEqual(frameRect('M23',0),{sx:34,sy:11,sw:328,sh:471,dx:28,dy:11});
 for(let frame=0;frame<8;frame++){
  const r=frameRect('M23',frame);assert.ok(r.sw<384&&r.sh<512);
  assert.ok(r.sx>=0&&r.sy>=0&&r.sx+r.sw<=1536&&r.sy+r.sh<=1024);
  assert.ok(r.dx>=0&&r.dy>=0&&r.dx+r.sw<=384&&r.dy+r.sh<=512);
 }
 const style=Object.fromEntries(portraitStyle('M23').split(';').map(part=>part.split(':')));
 const pct=name=>Number.parseFloat(style[name])/100;
 assert.ok(Math.abs(pct('--crop-x')*384-28)<.00001);
 assert.ok(Math.abs(pct('--crop-w')*384-328)<.00001);
 assert.ok(Math.abs(pct('--atlas-w')*328-1536)<.00001);
 assert.ok(Math.abs(pct('--atlas-x')*328+34)<.00001);
});
test('one appearance can receive both score boundaries with separate score samples',()=>{
 const low=createHatch(baseline,{monsterRandom:()=>0,scoreRandom:()=>0}),high=createHatch(baseline,{monsterRandom:()=>0,scoreRandom:()=>1-Number.EPSILON});
 assert.equal(low.monster.id,high.monster.id);assert.equal(low.score,SCORE_RANGE.min);assert.equal(high.score,SCORE_RANGE.max);
});
test('all 65 appearances can receive the same independent score',()=>{
 let before=0;for(const row of distribution(baseline)){const sample=before+row.probability/2;const outcome=createHatch(baseline,{monsterRandom:()=>sample,scoreRandom:()=>.5});assert.equal(outcome.monster.id,row.monster.id);assert.equal(outcome.score,420);assert.ok(Object.isFrozen(outcome));before+=row.probability;}
});
test('egg, room and temperature change appearance chances while never entering score generation',()=>{
 for(const egg of EGGS)for(const room of ROOMS)for(let temperature=16;temperature<=42;temperature++){
  const c={egg:egg.id,room:room.id,temperature},rows=distribution(c);assert.equal(rows.length,65);assert.ok(rows.every(r=>r.probability>0&&Number.isFinite(r.probability)));assert.ok(Math.abs(rows.reduce((a,r)=>a+r.probability,0)-1)<1e-12);assert.ok(Math.abs(tierDistribution(c).reduce((a,r)=>a+r.probability,0)-1)<1e-12);
  for(const sample of [0,.75])assert.equal(createHatch(c,{monsterRandom:()=>sample,scoreRandom:()=>.5}).score,420);
 }
 const p=c=>distribution(c).map(r=>r.probability);assert.notDeepEqual(p(baseline),p({...baseline,egg:'tide'}));assert.notDeepEqual(p(baseline),p({...baseline,room:'forge'}));assert.notDeepEqual(p(baseline),p({...baseline,temperature:42}));
});
test('a hatch consumes distinct character and score samples and retains prior outcome values',()=>{
 const calls=[];const result=createHatch(baseline,{monsterRandom:()=>{calls.push('appearance');return .7;},scoreRandom:()=>{calls.push('score');return .2;}});assert.deepEqual(calls,['appearance','score']);assert.equal(result.monster.id,pickMonster(baseline,()=>.7).id);assert.equal(result.score,228);
 const next=createHatch(baseline,{monsterRandom:()=>.7,scoreRandom:()=>.8});assert.notEqual(result.score,next.score);assert.equal(result.score,228);
});
test('invalid conditions and random values are rejected at their input boundary',()=>{
 for(const invalid of [-.1,1,NaN,Infinity,undefined]){assert.throws(()=>pickMonster(baseline,()=>invalid),RangeError);assert.throws(()=>rollScore(()=>invalid),RangeError);}
 for(const temperature of [15,43,28.5,'28',null])assert.throws(()=>validateConditions({...baseline,temperature}),RangeError);
 assert.throws(()=>distribution({...baseline,egg:'missing'}),RangeError);assert.throws(()=>distribution({...baseline,room:'missing'}),RangeError);assert.throws(()=>distribution(null),RangeError);
 for(const value of [0,.1,.3333,.5,.8,1-Number.EPSILON]){const score=rollScore(()=>value);assert.ok(Number.isInteger(score));assert.ok(score>=100&&score<=740);}
});
