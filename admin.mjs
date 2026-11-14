import { MONSTERS } from './catalog.mjs';
const $=id=>document.getElementById(id),names=new Map(MONSTERS.map(m=>[m.id,m.name]));
let busy=false;
const dateFormat=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
async function api(path,{method='GET',body}={}){
 const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>null);
 if(!response.ok||!data){const error=new Error(data?.error||'暂时无法连接活动管理。');error.status=response.status;throw error;}return data;
}
function showLogin(message='请输入管理口令。'){$('admin-content').hidden=true;$('admin-login').hidden=false;$('admin-login-status').textContent=message;$('admin-results').replaceChildren();$('test-entry-url').value='';$('test-entry-result').hidden=true;$('open-test-entry').removeAttribute('href');}
function cell(value,className){const td=document.createElement('td');td.textContent=String(value??'—');if(className)td.className=className;return td;}
async function refresh(){
 if(busy)return;busy=true;$('admin-refresh').disabled=true;
 try{
  const data=await api('/api/admin/summary');$('admin-login').hidden=true;$('admin-content').hidden=false;
  $('admin-completed').textContent=String(data.activity.completed??data.results.length);$('admin-capacity').textContent=` / ${data.activity.capacity} 人`;$('admin-joined').textContent=String(data.activity.joined??'—');$('admin-activity-title').textContent=data.activity.title;
  const body=$('admin-results');body.replaceChildren();
  if(!data.results.length){const tr=document.createElement('tr'),td=cell('还没有正式首次成绩。','board-empty');td.colSpan=6;tr.append(td);body.append(tr);}
  for(const row of data.results){const tr=document.createElement('tr'),date=new Date(row.completedAt);tr.append(cell(row.rank,'rank-cell'),cell(row.number),cell(row.name,'name-cell'),cell(names.get(row.monsterId)||row.monsterId),cell(row.score,'board-score'),cell(Number.isNaN(date.getTime())?'—':dateFormat.format(date),'board-date'));body.append(tr);}
  $('admin-refresh-status').textContent=`最近更新 ${dateFormat.format(new Date())} · 测试会话 ${data.tests?.length??0} 个，不计入此表`;$('admin-error').hidden=true;
 }catch(error){if(error.status===401)showLogin('管理会话已过期，请重新登录。');else if($('admin-content').hidden)showLogin(error.message);else{$('admin-error').textContent=error.message;$('admin-error').hidden=false;}}
 finally{busy=false;$('admin-refresh').disabled=false;}
}
$('admin-login-form').addEventListener('submit',async event=>{event.preventDefault();$('admin-login-button').disabled=true;$('admin-login-status').textContent='正在登录…';try{await api('/api/admin/login',{method:'POST',body:{password:$('admin-password').value}});$('admin-password').value='';await refresh();}catch(error){$('admin-login-status').textContent=error.message;}finally{$('admin-login-button').disabled=false;}});
$('admin-refresh').addEventListener('click',refresh);
$('admin-logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:{}});showLogin('已退出管理后台。');}catch(error){$('admin-error').textContent=error.message;$('admin-error').hidden=false;}});
$('create-test-entry').addEventListener('click',async()=>{$('create-test-entry').disabled=true;$('test-entry-status').textContent='正在生成测试会话…';try{const data=await api('/api/admin/test-entry',{method:'POST',body:{}});const value=data.url??data.link;if(typeof value!=='string')throw new Error('测试链接未能生成。');const url=new URL(value,location.origin);if(url.origin!==location.origin)throw new Error('测试链接来源异常。');$('test-entry-url').value=url.href;$('open-test-entry').href=url.href;$('test-entry-result').hidden=false;$('test-entry-status').textContent='测试入口已生成。使用此入口不会产生正式排名。';}catch(error){$('test-entry-status').textContent=error.message;}finally{$('create-test-entry').disabled=false;}});
$('copy-test-entry').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('test-entry-url').value);$('test-entry-status').textContent='已复制测试链接。';}catch{$('test-entry-url').focus();$('test-entry-url').select();$('test-entry-status').textContent='请复制上方选中的链接。';}});
try{const session=await api('/api/admin/session');if(session.authenticated)await refresh();else showLogin();}catch(error){showLogin(error.message);}
