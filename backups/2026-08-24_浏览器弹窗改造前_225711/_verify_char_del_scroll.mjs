// 验证:角色卡删除角色后滚动位置保持(不回到顶部)
import { spawn } from 'node:child_process';
const PORT = 9283;
const BASE = 'http://localhost:5000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-cdelsc`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(1000);
  // 加载角色卡页
  await evalJs(cdp, `location.href='${BASE}/character'`);
  await sleep(4000);
  // 加入房间(游客身份)
  await evalJs(cdp, `(async () => {
      sessionStorage.setItem('dnd_joined_room', JSON.stringify({name:'滚动测试用户', role:'PL', color:'#00bcd4'}));
      location.reload();
      return 'reloaded';
  })()`);
  await sleep(4000);
  // 创建测试角色(通过页面 API)
  const created = await evalJs(cdp, `(async () => {
      const r = await fetch('/api/character', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({name:'待删角色'+Date.now(), level:1, class:'战士', race:'人类', created_by:'滚动测试用户'})});
      const d = await r.json();
      return d.id || (d.error || 'no-id');
  })()`);
  console.log('创建角色:', created);
  await evalJs(cdp, `loadCharList()`);
  await sleep(1500);
  // 滚动到页面中部
  await evalJs(cdp, `window.scrollTo(0, 600)`);
  await sleep(500);
  const before = await evalJs(cdp, `window.scrollY`);
  console.log('删除前 scrollY:', before);
  // 点击删除按钮(模拟 confirm 确认)
  await evalJs(cdp, `(async () => {
      window.confirm = function(){ return true; };
      window.alert = function(){};
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.title === '删除角色');
      if (!btns.length) return 'no-btn';
      btns[0].click();
      await new Promise(r => setTimeout(r, 2000));
      return 'clicked';
  })()`);
  const after = await evalJs(cdp, `window.scrollY`);
  console.log('删除后 scrollY:', after);
  console.log(`[${Math.abs(after - before) < 30 ? '✅' : '❌'}] 删除后滚动位置保持(不回到顶部)`);
  cdp.close(); edge.kill();
  process.exit(Math.abs(after - before) < 30 ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
