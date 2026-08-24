// 验证:北境页面横幅在顶部栏下方(不遮挡)
import { spawn } from 'node:child_process';
const PORT = 9284;
const BASE = 'http://localhost:5000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-bn`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _cookie = '';
async function api(path, body) {
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (_cookie) opts.headers['Cookie'] = _cookie;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    const setc = r.headers.get('set-cookie');
    if (setc) _cookie = setc.split(';')[0];
    return r.json();
}
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

(async()=>{
  // 发布公告
  await api('/admin/api/login', { username: 'IllusoryActor', password: 'illusorior' });
  const pub = await api('/api/admin/announcements', { action: 'add', title: '横幅位置测试', content: '位置验证' });
  const annId = pub.announcement.id;
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(1000);
  await evalJs(cdp, `location.href='${BASE}/north-expedition'`);
  await sleep(5000);
  // 1. 北境:不显示公告
  await evalJs(cdp, `location.href='${BASE}/north-expedition'`);
  await sleep(5000);
  const northSt = await evalJs(cdp, `document.body.textContent.includes('横幅位置测试')`);
  console.log(`[${!northSt ? '✅' : '❌'}] 北境不显示公告`);
  // 2. chat:不显示公告
  await evalJs(cdp, `location.href='${BASE}/chat'`);
  await sleep(4000);
  const chatSt = await evalJs(cdp, `document.body.textContent.includes('横幅位置测试')`);
  console.log(`[${!chatSt ? '✅' : '❌'}] 跑团聊天页不显示公告`);
  // 3. 官网首页:显示公告且在导航下方
  await evalJs(cdp, `location.href='${BASE}/'`);
  await sleep(4000);
  const homeSt = await evalJs(cdp, `(() => {
      const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('横幅位置测试'));
      if (!divs.length) return 'no-banner';
      const nav = document.querySelector('.navbar');
      const br = divs[0].getBoundingClientRect();
      const nr = nav ? nav.getBoundingClientRect() : null;
      return JSON.stringify({
          shown: true,
          bannerTop: Math.round(br.top),
          navBottom: nr ? Math.round(nr.bottom) : 56,
          belowNav: nr ? br.top >= nr.bottom - 2 : br.top >= 56
      });
  })()`);
  console.log('官网首页横幅:', homeSt);
  const homeObj = homeSt === 'no-banner' ? {shown: false} : JSON.parse(homeSt);
  const ok = homeObj.shown && homeObj.belowNav && !northSt && !chatSt;
  console.log(`[${ok ? '✅' : '❌'}] 官网显示公告且不遮挡导航`);
  // 4. 侧边栏展开:公告不遮挡功能栏
  await evalJs(cdp, `toggleSidebar()`);
  await sleep(800);
  const sbSt = await evalJs(cdp, `(() => {
      const sb = document.getElementById('nav-sidebar');
      const banner = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('横幅位置测试'));
      const br = banner ? banner.getBoundingClientRect() : null;
      const sr = sb.getBoundingClientRect();
      const bannerZ = banner ? getComputedStyle(banner).zIndex : null;
      const sidebarZ = getComputedStyle(sb).zIndex;
      return JSON.stringify({
          open: sb.classList.contains('open'),
          bannerZ: bannerZ, sidebarZ: sidebarZ,
          bannerAbove: Number(bannerZ) > Number(sidebarZ),
          sidebarClickable: br ? br.left > sr.width : true
      });
  })()`);
  console.log('侧边栏层级:', sbSt);
  const sbObj = JSON.parse(sbSt);
  const okSb = sbObj.open && !sbObj.bannerAbove;
  console.log(`[${okSb ? '✅' : '❌'}] 侧边栏在公告之上(展开不被遮挡)`);
  // 5. 侧边栏展开后横幅右移压缩(不与侧边栏重叠)
  await sleep(600);
  const shiftSt = await evalJs(cdp, `(() => {
      const sb = document.getElementById('nav-sidebar');
      const banner = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('横幅位置测试'));
      const br = banner ? banner.getBoundingClientRect() : null;
      const sr = sb.getBoundingClientRect();
      return JSON.stringify({
          bannerLeft: br ? Math.round(br.left) : null,
          sidebarRight: Math.round(sr.right),
          noOverlap: br ? br.left >= sr.right - 2 : false
      });
  })()`);
  console.log('展开后横幅位置:', shiftSt);
  const shObj = JSON.parse(shiftSt);
  const okShift = shObj.noOverlap;
  console.log(`[${okShift ? '✅' : '❌'}] 侧边栏展开后横幅右移不重叠`);
  // 收拢后横幅回到左侧
  await evalJs(cdp, `toggleSidebar()`);
  await sleep(600);
  const backSt = await evalJs(cdp, `(() => {
      const banner = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('横幅位置测试'));
      return banner ? Math.round(banner.getBoundingClientRect().left) : null;
  })()`);
  console.log(`[${backSt === 0 ? '✅' : '❌'}] 侧边栏收拢后横幅回到左侧`);
  // 清理
  await api('/api/admin/announcements', { action: 'delete', id: annId });
  cdp.close(); edge.kill();
  process.exit(ok && okSb && okShift && backSt === 0 ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
