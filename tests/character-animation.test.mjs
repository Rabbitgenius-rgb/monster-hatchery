import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MONSTERS as CATALOG } from '../catalog.mjs';
const MONSTERS = [CATALOG[0], CATALOG[3]];
import { sampleMotion, ACTION_DURATIONS } from '../character-animation.mjs';
import { decodeRGBA } from './png-rgba.mjs';

test('sample placeholder sheets have complete transparent eight-pose images',async()=>{
  assert.equal(new Set(MONSTERS.map(m=>m.animationSheet)).size,2);
  for(const monster of MONSTERS){
    const png=await readFile(new URL('../'+monster.animationSheet,import.meta.url));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),1536);assert.equal(png.readUInt32BE(20),1024);
    assert.equal(png[25],6,'RGBA alpha must survive sheet integration');
  }
});

test('empty areas in sample pose cells remain transparent',async()=>{
  for(const monster of MONSTERS){
    const image=decodeRGBA(await readFile(new URL('../'+monster.animationSheet,import.meta.url)));
    for(let frame=0;frame<8;frame++)for(const [x,y] of [[5,5],[378,5],[5,505],[378,505],[20,100],[355,50]]){
      const alpha=image.alphaAt((frame%4)*384+x,Math.floor(frame/4)*512+y);
      assert.ok(alpha<=5,`${monster.id} frame ${frame}, background (${x},${y}) alpha ${alpha}`);
    }
  }
});

test('blink closes and reopens both eyes, and greeting alternates its two hand poses',()=>{
  assert.deepEqual([0,400,600,800].map(t=>sampleMotion('blink',t).frame),[1,0,1,0]);
  assert.deepEqual([0,220,440,660].map(t=>sampleMotion('wave',t).frame),[2,3,2,3]);
  for(const action of ['blink','wave']){
    const end=sampleMotion(action,ACTION_DURATIONS[action]);
    assert.equal(end.action,'idle');assert.equal(end.frame,0);assert.equal(end.completed,true);
  }
});

test('walking alternates stride poses, turns around, stays bounded and returns to center',()=>{
  assert.equal(sampleMotion('walk',0).frame,4);assert.equal(sampleMotion('walk',170).frame,5);
  assert.ok(sampleMotion('walk',700).offset>0);
  assert.equal(sampleMotion('walk',1000).flip,true);
  assert.ok(sampleMotion('walk',2700).offset<0);
  assert.equal(sampleMotion('walk',3000).flip,false);
  for(let time=0;time<=3400;time+=17){
    const pose=sampleMotion('walk',time);assert.ok(Math.abs(pose.offset)<=.140001);
    assert.ok([0,4,5].includes(pose.frame));
  }
  const end=sampleMotion('walk',3400);assert.equal(end.frame,0);assert.equal(end.offset,0);
});

test('petting and feeding select dedicated full-body frames then restore idle',()=>{
  assert.equal(sampleMotion('pet',1000).frame,6);assert.equal(sampleMotion('feed',1000).frame,7);
  assert.equal(sampleMotion('pet',2200).frame,0);assert.equal(sampleMotion('feed',2400).frame,0);
});

test('idle autonomously blinks and strolls, reduced motion retains static user-selected poses',()=>{
  assert.equal(sampleMotion('idle',1650).frame,1);
  assert.equal(sampleMotion('idle',4200).action,'walk');
  assert.equal(sampleMotion('idle',7000).frame,0);
  for(let time=0;time<10000;time+=100){
    const pose=sampleMotion('idle',time,true);assert.equal(pose.frame,0);assert.equal(pose.offset,0);
  }
  assert.equal(sampleMotion('wave',500,true).frame,2);
  const walk=sampleMotion('walk',1000,true);assert.equal(walk.frame,4);assert.equal(walk.offset,0);assert.equal(walk.flip,false);
  assert.throws(()=>sampleMotion('missing',0),RangeError);assert.throws(()=>sampleMotion('walk',NaN),RangeError);
});
