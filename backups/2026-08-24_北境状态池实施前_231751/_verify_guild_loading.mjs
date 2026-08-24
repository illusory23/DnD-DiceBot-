// 验证:进入公会时显示加载覆盖页(公会封面图)
import { spawn } from 'node:child_process';
const PORT = 9278;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-gloading`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}
(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  // 点击公会 tab,在加载动画期间立即检查覆盖层
  await evalJs(cdp, `document.getElementById('guildTab').click()`);
  await sleep(400); // 加载动画进行中
  const st = await evalJs(cdp, `(() => {
    const ov = document.getElementById('northLoadingOverlay');
    const bg = document.getElementById('northLoadingBg');
    const sub = document.getElementById('northLoadingSub');
    return JSON.stringify({
      overlayVisible: ov ? !ov.classList.contains('hidden') : false,
      bgImage: bg ? bg.style.backgroundImage : null,
      sub: sub ? sub.textContent : null,
      hint: document.getElementById('northLoadingHint') ? document.getElementById('northLoadingHint').textContent : null
    });
  })()`);
  console.log('进入公会加载覆盖层:', st);
  await sleep(2500);
  const after = await evalJs(cdp, `JSON.stringify({
      overlayHidden: document.getElementById('northLoadingOverlay').classList.contains('hidden'),
      guildVisible: document.getElementById('guildView').style.display !== 'none',
      guildTabActive: document.getElementById('guildTab').classList.contains('active')
  })`);
  console.log('加载完成后:', after);
  const s = JSON.parse(st);
  const a = JSON.parse(after);
  const ok1 = s.overlayVisible && s.bgImage.includes('loading_guild.png') && s.sub === '冒险者公会';
  const ok2 = a.overlayHidden && a.guildVisible && a.guildTabActive;
  console.log(`[${ok1 ? '✅' : '❌'}] 公会加载覆盖层(封面图+标题)`);
  console.log(`[${ok2 ? '✅' : '❌'}] 加载完成后进入公会界面`);
  cdp.close(); edge.kill();
  process.exit(ok1 && ok2 ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
