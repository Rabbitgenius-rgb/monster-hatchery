import { MONSTERS } from './catalog.mjs';
import { EGGS, ROOMS, TIERS, INITIAL_CONDITIONS, createHatch, tierDistribution } from './engine.mjs';
import { paintEgg } from './sprites.mjs';
import { Scene, paintRoomThumbnail } from './scene.mjs';
import { CharacterAnimator, ensureCharacterSheet, ACTION_LABELS, portraitStyle } from './character-animation.mjs';
import { actionsFor } from './character-actions.mjs';

const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const conditions={...INITIAL_CONDITIONS},history=[],discovered=new Set();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const monstersById=new Map(MONSTERS.map(m=>[m.id,m]));
let player=null,apiReady=false,status='idle',result=null,activeHatch=null,revealTime=0,totalHatches=0,bestScore=0,filter='all';
let autoplay=false,currentView='lab',autoplayTimer=null,reactionTimer=null,pendingOutcome=null,inspectSerial=0,inspectMonster=null;
let requestId=crypto.randomUUID();
const tierFor=m=>TIERS.find(t=>m.rarity.startsWith(t.id+' '));
const formChip=m=>`<span class="form-chip">${escapeHTML(m.form)}</span>`;
const rarityChip=m=>`<span class="rarity-chip" style="--rarity:${tierFor(m).color}">${escapeHTML(m.rarity)}</span>`;
const portrait=m=>`<span class="atlas-portrait" style="${portraitStyle(m)}"><span class="atlas-crop"><img src="${escapeHTML(m.animationSheet)}" alt="${escapeHTML(m.name)}" loading="lazy" decoding="async"></span></span>`;
const actor=new CharacterAnimator($('scene-character'));
const dialogActor=new CharacterAnimator($('character-dialog-canvas'),{onState:(action,label)=>{$('dialog-motion-status').textContent=label||ACTION_LABELS[action];}});
const motionFor={greet:'wave',blink:'blink',walk:'walk',pet:'pet',feed:'feed'};
function updateActions(monster,dialog=false){
  const actions=actionsFor(monster),attribute=dialog?'data-dialog-interaction':'data-interaction';
  const root=dialog?$('dialog-character-actions'):$('character-actions');
  const icons={greet:'✦',blink:'◡',walk:'↔',pet:'♡',feed:'◈'};
  root.querySelectorAll(`[${attribute}]`).forEach(button=>{const key=button.getAttribute(attribute);button.textContent=(dialog?'':icons[key]+' ')+actions[key].label;button.title=actions[key].description;});
}

async function api(path,{method='GET',body}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data){const error=new Error(data?.error||'活动服务暂时无法连接，请稍后重试。');error.code=data?.code;error.status=response.status;throw error;}
    return data;
  }catch(error){if(error.name==='AbortError')throw new Error('连接超时，请重试。已保存的首次成绩会保留。');throw error;}
  finally{clearTimeout(timeout);}
}
function hideError(){$('activity-error').hidden=true;$('result-retry').hidden=true;}
function showError(message,retry=false){$('activity-error-text').textContent=message;$('activity-error').hidden=false;$('result-retry').hidden=!retry;}
function outcomeToResult(outcome){
  const monster=monstersById.get(outcome?.monsterId);
  if(!monster||!Number.isInteger(outcome.score)||outcome.score<100||outcome.score>740)throw new Error('保存的成绩格式异常，请联系组织者。');
  return {...outcome,monster};
}
function updateParticipant(){
  $('player-name').textContent=player?.name??'';$('test-badge').hidden=!player?.isTest;
  $('header-status').textContent=player?.isTest?'专用测试会话':player?'正式活动进行中':'实名孵化活动';
  const first=player?.firstResult;
  $('official-summary').textContent=first?(player.isTest?`测试首次成绩 ${first.score} 分，测试结果不进入公开排行榜。`:`正式首次成绩已锁定：${first.score} 分。后续试玩不改变排行榜。`):(player?.isTest?'这是专用测试会话，首次测试结果不占正式名额、不进入公开排行榜。':'首次正式孵化的分数将按姓名保存，后续试玩不会覆盖。');
  $('autoplay-button').disabled=!first;
  $('hatch-button-label').textContent=status==='hatching'?'正在孵化':first?'自由试玩一颗':player?.isTest?'开始首次测试孵化':'首次孵化 · 计入排名';
  $('playback-note').textContent=!first?'先选好条件，再主动开始首次孵化。':autoplay?'自动试玩中 · 试玩分数不进入排行榜':'后续为自由试玩 · 首次正式成绩保持不变';
  $('autoplay-button').textContent=autoplay?'Ⅱ 暂停自动试玩':'▶ 开始自动试玩';
  $('autoplay-button').setAttribute('aria-pressed',String(autoplay));
}
function setBusy(busy){$('conditions-fieldset').disabled=busy;$('hatch-button').disabled=busy||!player;$('dex-tab').disabled=busy||!player;$('logout-player').disabled=busy;}
function clearAutoplay(){clearTimeout(autoplayTimer);autoplayTimer=null;}
function scheduleNext(delay=7200){clearAutoplay();if(autoplay&&player?.firstResult&&currentView==='lab'&&!document.hidden&&status!=='hatching'&&!$('character-dialog').open)autoplayTimer=setTimeout(()=>startHatch(),delay);}
function setAutoplay(value){autoplay=!!value&&!!player?.firstResult;clearAutoplay();updateParticipant();if(autoplay&&status!=='hatching')scheduleNext(100);}
function hideCharacter(){
  $('character-touch').hidden=true;$('inspect-character').hidden=true;$('character-actions').hidden=true;
  $('interaction-bubble').hidden=true;$('scene-tip').hidden=false;$('reaction-particles').replaceChildren();clearTimeout(reactionTimer);actor.hide();
}
function makeChoices(){
  $('egg-options').innerHTML=EGGS.map(egg=>`<button type="button" class="egg-option" data-egg="${egg.id}" aria-label="${egg.name}，${egg.tag}" aria-pressed="false"><canvas width="40" height="48" aria-hidden="true"></canvas><span class="egg-name">${egg.name}</span></button>`).join('');
  document.querySelectorAll('[data-egg]').forEach(button=>{paintEgg(button.querySelector('canvas'),button.dataset.egg);button.addEventListener('click',()=>{conditions.egg=button.dataset.egg;conditionsChanged();});});
  $('room-options').innerHTML=ROOMS.map(room=>`<button type="button" class="room-option" data-room="${room.id}" aria-label="${room.name}，${room.subtitle}" aria-pressed="false"><canvas width="256" height="160" aria-hidden="true"></canvas><span class="room-name">${room.name}</span></button>`).join('');
  document.querySelectorAll('[data-room]').forEach(button=>{paintRoomThumbnail(button.querySelector('canvas'),button.dataset.room);button.addEventListener('click',()=>{conditions.room=button.dataset.room;conditionsChanged();});});
  $('tier-filters').innerHTML=[['all','全部'],['成年版','成年版'],['Q版','Q版']].map(([id,label])=>`<button type="button" class="tier-filter" data-filter="${id}" aria-pressed="false">${label}<span>${id==='all'?MONSTERS.length:MONSTERS.filter(m=>m.form===id).length}</span></button>`).join('');
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;renderDex();}));
}
function conditionsChanged(){
  if(status==='hatching')return;
  status='idle';result=null;hideCharacter();
  renderConditions();updateParticipant();if(autoplay)scheduleNext(1200);
}
function renderConditions(){
  const egg=EGGS.find(e=>e.id===conditions.egg),room=ROOMS.find(r=>r.id===conditions.room);
  document.querySelectorAll('[data-egg]').forEach(button=>{const on=button.dataset.egg===conditions.egg;button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('[data-room]').forEach(button=>{const on=button.dataset.room===conditions.room;button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));});
  $('selected-egg-tag').textContent=egg.tag;$('egg-note').textContent=egg.note;
  $('temperature-output').innerHTML=`${conditions.temperature}<span>°C</span>`;$('scene-temperature').textContent=`${conditions.temperature}°C`;
  $('temperature').value=conditions.temperature;
  $('comfort-label').textContent=conditions.temperature<23?'清凉的孵化条件':conditions.temperature>34?'热乎乎的孵化条件':'温暖舒适';
  $('scene-room-name').textContent=room.name;$('room-index').textContent=String(ROOMS.indexOf(room)+1).padStart(2,'0');
  $('scene-tip').textContent=conditions.egg==='nebula'?'它会不会来自另一颗星球？':conditions.egg==='tide'?'听，蛋壳里好像有潮声…':conditions.egg==='amber'?'一颗热乎乎的小小奇迹。':'蛋里似乎有点动静…';
  $('scene-canvas').setAttribute('aria-label',`像素${room.name}：${egg.name}，温度${conditions.temperature}摄氏度`);
  $('stage-bottom').innerHTML='<div class="phase-icon" aria-hidden="true">◇</div><div><span class="sub-label">一切就绪</span><p>小小的蛋，大大的可能。</p></div><span class="stage-ready">READY</span>';
  const tiers=tierDistribution(conditions);
  $('probability-bar').innerHTML=tiers.map(t=>`<span style="width:${t.probability*100}%;background:${t.color}"></span>`).join('');
  $('probability-legend').innerHTML=tiers.map(t=>`<span><i style="background:${t.color}"></i>${t.id}<b>${(t.probability*100).toFixed(1)}%</b></span>`).join('');
}
async function startHatch(event,resumeOutcome=null){
  event?.preventDefault();if(!player||status==='hatching'||currentView!=='lab')return;
  clearAutoplay();hideError();hideCharacter();pendingOutcome=null;
  const snapshot=resumeOutcome?.conditions?{...resumeOutcome.conditions}:{...conditions};
  const hatch={conditions:snapshot,outcome:null,prepared:false,start:performance.now(),duration:reducedMotion.matches?500:2300,progress:0,resuming:!!resumeOutcome};
  activeHatch=hatch;status='hatching';result=null;setBusy(true);updateParticipant();
  $('scene-tip').textContent=resumeOutcome?'正在恢复已保存的伙伴…':'嘘，新伙伴正在醒来…';
  $('scene-canvas').setAttribute('aria-label',resumeOutcome?'正在恢复已保存的孵化结果':'正在孵化');
  $('hatch-progress').hidden=false;$('hatch-progress-fill').style.width='0%';
  $('stage-bottom').innerHTML='<div class="phase-icon" aria-hidden="true">✦</div><div><span class="sub-label">孵化进行中</span><p id="phase-description">正在适应舱内温度…</p></div><span class="stage-ready" id="stage-status">0%</span>';
  $('live-result').textContent=resumeOutcome?'正在恢复已保存结果。':'开始孵化，请稍候。';
  const update=now=>{
    if(activeHatch!==hatch)return;
    const raw=Math.min(1,(now-hatch.start)/hatch.duration);hatch.progress=hatch.prepared?raw:Math.min(.88,raw);
    const percent=Math.floor(hatch.progress*100);$('hatch-progress-fill').style.width=percent+'%';$('hatch-progress').setAttribute('aria-valuenow',String(percent));$('stage-status').textContent=percent+'%';
    $('phase-description').textContent=raw>=.88&&!hatch.prepared?'正在迎接新伙伴，请稍候…':hatch.progress<.3?'正在适应舱内温度…':hatch.progress<.65?'检测到小小的生命信号…':hatch.progress<.9?'蛋壳开始裂开了！':'它要出来了…';
    if(raw===1&&hatch.prepared)finishHatch(hatch);else requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
  try{
    let outcome=resumeOutcome;
    if(!outcome&&!player.firstResult){
      let response;
      try{response=await api('/api/hatch',{method:'POST',body:{conditions:snapshot,requestId}});}
      catch(original){
        const recovered=await api('/api/me').catch(()=>null);
        if(!recovered?.player?.firstResult)throw original;
        response={player:recovered.player,outcome:recovered.player.firstResult};
      }
      player=response.player;outcome=response.outcome;updateParticipant();
    }else if(!outcome){
      const sample=createHatch(snapshot);outcome={monsterId:sample.monster.id,score:sample.score,conditions:snapshot,completedAt:new Date().toISOString(),isRanked:false};
    }
    const resolved=outcomeToResult(outcome);hatch.outcome=resolved;hatch.conditions={...resolved.conditions};
    await ensureCharacterSheet(resolved.monster);
    if(activeHatch!==hatch)return;
    hatch.prepared=true;
  }catch(error){
    if(activeHatch!==hatch)return;
    pendingOutcome=hatch.outcome;activeHatch=null;status='idle';$('hatch-progress').hidden=true;setBusy(false);updateParticipant();
    $('stage-bottom').innerHTML='<div class="phase-icon" aria-hidden="true">◇</div><div><span class="sub-label">暂时未能完成显示</span><p>请重试，已保存的首次成绩会保持不变。</p></div>';
    $('scene-tip').textContent='稍等一下，我们再试一次。';
    showError(hatch.outcome?'角色图片暂时未能载入。该次得分已保留，可重新载入形象。':error.message,!!hatch.outcome);
    setAutoplay(false);
  }
}
function finishHatch(hatch){
  if(activeHatch!==hatch)return;
  activeHatch=null;status='result';result=hatch.outcome;revealTime=performance.now();pendingOutcome=null;
  Object.assign(conditions,result.conditions);renderConditions();
  const {monster,score}=result,isNew=!discovered.has(monster.id),isFirst=!!player.firstResult&&result.completedAt===player.firstResult.completedAt&&result.score===player.firstResult.score&&result.monsterId===player.firstResult.monsterId;
  const key=isFirst?`first:${player.id}`:crypto.randomUUID();
  if(!history.some(row=>row.key===key)){totalHatches++;history.unshift({...result,key,conditions:hatch.conditions,sequence:totalHatches,isFirst});if(history.length>12)history.pop();}
  discovered.add(monster.id);setBusy(false);updateParticipant();$('hatch-progress').hidden=true;
  $('scene-tip').textContent=isNew?'你好，我是你的新伙伴！':'又见面啦！点我试试。';
  actor.show(monster);if($('character-dialog').open||document.hidden||currentView!=='lab')actor.pause();
  updateActions(monster);$('character-touch').dataset.form=monster.form;$('character-touch').setAttribute('aria-label',`${monster.name}，${actionsFor(monster).greet.label}`);
  $('character-touch').hidden=false;$('inspect-character').hidden=false;$('character-actions').hidden=false;
  const mode=isFirst?(player.isTest?'首次测试 · 不入榜':'正式首次 · 已锁定'):'自由试玩 · 不入榜';
  $('stage-bottom').innerHTML=`<div class="phase-icon" aria-hidden="true">✦</div><div class="result-details" data-result-id="${monster.id}" data-result-score="${score}" data-ranked="${result.isRanked}"><span class="sub-label">${formChip(monster)}<span class="result-id">${escapeHTML(monster.id)}</span></span><p>${escapeHTML(monster.name)}</p></div><div class="result-score"><small>${mode}</small><strong>${score}</strong><small>分</small></div>`;
  $('scene-canvas').setAttribute('aria-label',`${monster.name}，${mode}，${score}分`);
  $('discovered-count').textContent=String(discovered.size).padStart(2,'0');$('hatch-count').textContent=String(totalHatches);
  bestScore=Math.max(bestScore,score);$('best-score').textContent=bestScore;
  $('live-result').textContent=`孵化成功！${monster.name}，${mode}，${score}分。`;
  renderHistory();scheduleNext();
}
function renderHistory(){
  $('history-grid').innerHTML=history.slice(0,6).map((row,i)=>`<article class="history-card${i===0?' newest':''}" data-history-id="${row.monster.id}" data-history-score="${row.score}"><button class="history-portrait" data-inspect="${row.monster.id}" type="button" aria-label="放大${escapeHTML(row.monster.name)}">${portrait(row.monster)}</button><h3>${escapeHTML(row.monster.name)}</h3><div class="history-meta"><span class="history-score">${row.score}<small> 分</small></span></div><p class="history-conditions">${row.isFirst?(player.isTest?'测试首分':'正式首次 · 已锁定'):'自由试玩 · 不入榜'}<br>${escapeHTML(ROOMS.find(r=>r.id===row.conditions.room)?.name)} · ${row.conditions.temperature}°C</p></article>`).join('');
}
function renderDex(){
  const monsters=MONSTERS.filter(m=>filter==='all'||m.form===filter);
  document.querySelectorAll('[data-filter]').forEach(button=>{const on=button.dataset.filter===filter;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});
  $('dex-count').textContent=`${filter==='all'?'全部':filter} ${monsters.length} 款`;
  $('dex-grid').innerHTML=monsters.map(monster=>`<article class="dex-card" data-monster-id="${monster.id}" style="--rarity:${tierFor(monster).color}"><button type="button" class="dex-portrait" data-inspect="${monster.id}" aria-label="放大${escapeHTML(monster.name)}形象"><span class="dex-id">${monster.id} / ${monster.form}</span>${portrait(monster)}</button><div class="dex-card-info"><h3>${escapeHTML(monster.name)}</h3><div class="dex-card-meta">${formChip(monster)}${rarityChip(monster)}</div></div></article>`).join('');
}
function showView(view){
  if(!player||status==='hatching')return;
  currentView=view;const dex=view==='dex';if(dex)setAutoplay(false);
  $('lab-view').hidden=dex;$('dex-view').hidden=!dex;
  for(const [id,on] of [['lab-tab',!dex],['dex-tab',dex]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
  if(dex){renderDex();actor.pause();}else if(!document.hidden)actor.resume();
  window.scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'});
}
function interact(kind='greet'){
  if(status!=='result'||!result||!motionFor[kind])return;
  clearAutoplay();clearTimeout(reactionTimer);const action=actionsFor(result.monster)[kind];const lines=action.responses?.length?action.responses:[action.description];
  $('scene-tip').hidden=true;$('interaction-bubble').textContent=lines[Math.floor(Math.random()*lines.length)];$('interaction-bubble').hidden=false;actor.play(motionFor[kind]);
  $('reaction-particles').innerHTML=Array.from({length:5},(_,i)=>`<span style="--x:${34+i*8}%;--delay:${i*70}ms" aria-hidden="true">${kind==='feed'?'✦':'♥'}</span>`).join('');
  reactionTimer=setTimeout(()=>{$('interaction-bubble').hidden=true;$('scene-tip').hidden=false;$('reaction-particles').replaceChildren();},3600);scheduleNext(8000);
}
async function inspect(id){
  const monster=monstersById.get(id);if(!monster)return;
  const serial=++inspectSerial;inspectMonster=monster;setAutoplay(false);actor.pause();dialogActor.hide();
  updateActions(monster,true);
  $('character-dialog-title').textContent=monster.name+' · '+monster.form;$('character-dialog').dataset.characterId=id;
  $('dialog-load-state').hidden=false;$('dialog-load-state').textContent='正在载入形象…';$('dialog-retry').hidden=true;$('character-dialog-canvas').hidden=true;$('dialog-character-actions').hidden=true;$('dialog-motion-status').textContent='';
  if(!$('character-dialog').open)$('character-dialog').showModal();
  try{await ensureCharacterSheet(monster);if(serial!==inspectSerial||!$('character-dialog').open)return;dialogActor.show(monster);$('dialog-load-state').hidden=true;$('character-dialog-canvas').hidden=false;$('dialog-character-actions').hidden=false;}
  catch{if(serial!==inspectSerial||!$('character-dialog').open)return;$('dialog-load-state').textContent='形象暂时未能载入，请重试。';$('dialog-retry').hidden=false;}
}
async function acceptPlayer(next){
  if(!next||typeof next.name!=='string')throw new Error('参与状态异常，请重新连接。');
  player=next;apiReady=true;currentView='lab';status='idle';$('lab-view').hidden=false;$('dex-view').hidden=true;
  $('lab-tab').classList.add('active');$('lab-tab').setAttribute('aria-pressed','true');$('dex-tab').classList.remove('active');$('dex-tab').setAttribute('aria-pressed','false');
  $('entry-view').hidden=true;$('game-shell').hidden=false;$('lab-tab').disabled=false;setBusy(false);updateParticipant();
  if(player.firstResult){Object.assign(conditions,player.firstResult.conditions);$('temperature').value=conditions.temperature;conditionsChanged();await startHatch(null,player.firstResult);}else conditionsChanged();
}
async function restoreSession(){
  $('join-button').disabled=true;$('join-button').textContent='连接活动中…';$('connection-retry').hidden=true;$('entry-status').textContent='正在恢复你的参与状态…';apiReady=false;
  try{
    const url=new URL(location.href),testToken=url.searchParams.get('test');
    let me;
    if(testToken){
      url.searchParams.delete('test');historyReplace(url);
      me=await api('/api/test-session',{method:'POST',body:{token:testToken}});
    }
    const [session,activityData]=await Promise.all([me?Promise.resolve(me):api('/api/me'),api('/api/activity')]);
    apiReady=true;const activity=activityData.activity;
    $('entry-status').textContent=`已完成 ${activity.completed??0} / ${activity.capacity??200} 人 · 65 款伙伴等待孵化`;
    $('join-button').disabled=false;$('join-button').textContent='实名进入孵化器';$('header-status').textContent='实名孵化活动';
    if(session.player)await acceptPlayer(session.player);
  }catch(error){$('entry-status').textContent=error.message;$('connection-retry').hidden=false;$('header-status').textContent='等待重新连接';}
}
function historyReplace(url){window.history.replaceState(null,'',url.pathname+url.search+url.hash);}

makeChoices();conditionsChanged();$('lab-tab').disabled=true;$('dex-tab').disabled=true;$('conditions-fieldset').disabled=true;
$('join-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!apiReady)return;$('join-button').disabled=true;$('entry-status').textContent='正在保存参与姓名…';
 try{const response=await api('/api/join',{method:'POST',body:{name:$('real-name').value}});await acceptPlayer(response.player);}
 catch(error){$('entry-status').textContent=error.message;$('join-button').disabled=false;}
});
$('connection-retry').addEventListener('click',restoreSession);
$('logout-player').addEventListener('click',async()=>{
 if(status==='hatching')return;setAutoplay(false);
 try{await api('/api/logout',{method:'POST',body:{}});player=null;history.length=0;discovered.clear();totalHatches=0;bestScore=0;result=null;pendingOutcome=null;status='idle';Object.assign(conditions,INITIAL_CONDITIONS);$('temperature').value=conditions.temperature;
  $('history-grid').innerHTML='<div class="history-empty"><span class="empty-egg" aria-hidden="true"></span><div><strong>第一位伙伴，还在蛋里。</strong><p>开始孵化后，在这里收集每一次小小的惊喜。</p></div></div>';
  $('discovered-count').textContent='00';$('hatch-count').textContent='0';$('best-score').textContent='—';hideCharacter();hideError();$('game-shell').hidden=true;$('entry-view').hidden=false;$('lab-tab').disabled=true;$('dex-tab').disabled=true;$('real-name').value='';requestId=crypto.randomUUID();await restoreSession();}
 catch(error){showError(error.message);}
});
$('temperature').addEventListener('input',event=>{conditions.temperature=Number(event.target.value);conditionsChanged();});
$('hatch-form').addEventListener('submit',startHatch);$('autoplay-button').addEventListener('click',()=>setAutoplay(!autoplay));
$('result-retry').addEventListener('click',()=>pendingOutcome&&startHatch(null,pendingOutcome));
$('lab-tab').addEventListener('click',()=>showView('lab'));$('dex-tab').addEventListener('click',()=>showView('dex'));$('back-to-lab').addEventListener('click',()=>showView('lab'));
$('character-touch').addEventListener('click',()=>interact('greet'));
$('character-actions').addEventListener('click',event=>{const button=event.target.closest('[data-interaction]');if(button)interact(button.dataset.interaction);});
$('inspect-character').addEventListener('click',()=>result&&inspect(result.monster.id));
for(const grid of [$('history-grid'),$('dex-grid')])grid.addEventListener('click',event=>{const button=event.target.closest('[data-inspect]');if(button)inspect(button.dataset.inspect);});
$('close-character-dialog').addEventListener('click',()=>$('character-dialog').close());$('dialog-retry').addEventListener('click',()=>inspectMonster&&inspect(inspectMonster.id));
$('dialog-character-actions').addEventListener('click',event=>{const button=event.target.closest('[data-dialog-interaction]');if(button)dialogActor.play(motionFor[button.dataset.dialogInteraction]);});
$('character-dialog').addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!event.currentTarget.open)return;
  const dialog=event.currentTarget;
  const controls=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(element=>element.tabIndex>=0&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0);
  if(!controls.length){event.preventDefault();return;}
  const index=controls.indexOf(document.activeElement);
  if(event.shiftKey&&(index<=0)){event.preventDefault();controls.at(-1).focus();}
  else if(!event.shiftKey&&(index<0||index===controls.length-1)){event.preventDefault();controls[0].focus();}
});
$('character-dialog').addEventListener('close',()=>{inspectSerial++;dialogActor.hide();if(currentView==='lab'&&!document.hidden)actor.resume();});
$('character-dialog').addEventListener('click',event=>{if(event.target===$('character-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
const scene=new Scene($('scene-canvas'),now=>({...(activeHatch?.conditions||conditions),status,progress:activeHatch?.progress??0,revealAge:now-revealTime}));
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearAutoplay();actor.pause();dialogActor.pause();}else if($('character-dialog').open)dialogActor.resume();else{if(currentView==='lab')actor.resume();scheduleNext(800);}});
window.addEventListener('pagehide',()=>{activeHatch=null;inspectSerial++;scene.destroy();actor.destroy();dialogActor.destroy();clearAutoplay();clearTimeout(reactionTimer);},{once:true});
restoreSession();
