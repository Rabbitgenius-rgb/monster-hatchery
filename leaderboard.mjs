import { MONSTERS } from './catalog.mjs';
import { portraitStyle } from './character-animation.mjs';
const $=id=>document.getElementById(id),byId=new Map(MONSTERS.map(m=>[m.id,m]));
const timeFormat=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
let pending=false,timer=null,disposed=false;
function cell(text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;return td;}
function drawRows(rows){
 const body=$('leaderboard-rows');body.replaceChildren();
 if(!rows.length){const tr=document.createElement('tr'),td=cell('榜单还没有正式成绩。第一颗蛋，正在等待孵化。','board-empty');td.colSpan=5;tr.append(td);body.append(tr);return;}
 for(const row of rows){
  const tr=document.createElement('tr');tr.dataset.number=String(row.number);tr.dataset.self=String(!!row.isSelf);if(row.isSelf){tr.className='self-row';tr.tabIndex=-1;}
  tr.append(cell(row.rank,'rank-cell'),cell(row.name,'name-cell'));
  const character=cell('','board-character'),monster=byId.get(row.monsterId);
  if(monster){const art=document.createElement('span');art.className='atlas-portrait board-portrait';art.setAttribute('style',portraitStyle(monster));const crop=document.createElement('span');crop.className='atlas-crop';const img=document.createElement('img');img.src=monster.animationSheet;img.alt='';img.loading='lazy';img.decoding='async';crop.append(img);art.append(crop);character.append(art);const name=document.createElement('span');name.textContent=monster.name;character.append(name);}else character.textContent='伙伴';
  const score=cell(row.score,'board-score');const date=new Date(row.completedAt);tr.append(character,score,cell(Number.isNaN(date.getTime())?'—':timeFormat.format(date),'board-date'));body.append(tr);
 }
}
async function refresh(){
 if(pending||disposed)return;pending=true;$('refresh-board').disabled=true;
 try{
  const response=await fetch('/api/leaderboard',{credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'榜单暂时未能更新。');
  if(!Array.isArray(data.rows))throw new Error('榜单数据暂时不可用。');
  drawRows(data.rows);$('completed-count').textContent=String(data.activity.completed??data.rows.length);$('capacity-count').textContent=` / ${data.activity.capacity??200} 人`;$('remaining-count').textContent=String(data.activity.remaining??'—');
  const own=data.rows.find(row=>row.isSelf);$('locate-self').disabled=!own;
  const tied=own&&data.rows.filter(row=>row.rank===own.rank).length>1;
  $('viewer-summary').textContent=own?`你的首次成绩：${own.score} 分 · ${tied?'并列第':'第'} ${own.rank} 名。`:data.viewer?'你已进入活动，首次成绩保存后会出现在这里。':'公开姓名已脱敏，完整姓名仅供组织者核对。';
  $('refresh-time').textContent=`最近更新 ${timeFormat.format(new Date())}`;$('board-error').hidden=true;
 }catch(error){$('board-error').textContent=error.message||'更新失败，请稍后重试。已有榜单仍保留显示。';$('board-error').hidden=false;$('refresh-time').textContent='等待重新连接';}
 finally{pending=false;$('refresh-board').disabled=false;}
}
function schedule(){clearInterval(timer);if(!document.hidden&&!disposed)timer=setInterval(refresh,10000);}
$('refresh-board').addEventListener('click',refresh);
$('locate-self').addEventListener('click',()=>{const row=document.querySelector('tr[data-self="true"]');if(!row)return;row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});row.focus({preventScroll:true});row.classList.remove('row-flash');requestAnimationFrame(()=>row.classList.add('row-flash'));});
document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden)refresh();});
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);},{once:true});refresh();schedule();
