// 验证:酒馆左侧菜单(默认收拢/展开/聊天区右移)
import { spawn } from 'node:child_process';
const PORT = 9280;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-tmenu`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}
(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  await evalJs(cdp, `document.getElementById('tavernTab').click()`);
  await sleep(2500);
  const btnSt = await evalJs(cdp, `(() => {
    const btn = document.getElementById('tavernMenuBtn');
    const r = btn.getBoundingClientRect();
    return JSON.stringify({
      display: getComputedStyle(btn).display,
      visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0,
      left: Math.round(r.left), top: Math.round(r.top)
    });
  })()`);
  console.log('菜单按钮:', btnSt);
  const b = JSON.parse(btnSt);
  const okBtn = b.display !== 'none' && b.visible;
  // 按钮与标题/在线显示不重合检查
  const overlap = await evalJs(cdp, `(() => {
    const btn = document.getElementById('tavernMenuBtn');
    const hd = document.querySelector('.tavern-header');
    const onl = document.querySelector('.tavern-online');
    const br = btn.getBoundingClientRect();
    const hr = hd.getBoundingClientRect();
    const or = onl.getBoundingClientRect();
    const overlapHd = br.top < hr.bottom && br.bottom > hr.top;
    const overlapOnl = br.top < or.bottom && br.bottom > or.top;
    return JSON.stringify({
      btnTop: Math.round(br.top), btnBottom: Math.round(br.bottom),
      hdBottom: Math.round(hr.bottom), onlBottom: Math.round(or.bottom),
      overlapHd, overlapOnl
    });
  })()`);
  console.log('按钮与标题位置:', overlap);
  const o = JSON.parse(overlap);
  const okPos = !o.overlapHd && !o.overlapOnl && o.btnTop >= o.hdBottom && o.btnTop >= o.onlBottom;
  console.log(`[${okPos ? '✅' : '❌'}] 按钮在标题与在线显示下方(不重合)`);
  console.log(`[${okBtn ? '✅' : '❌'}] 收拢时菜单按钮可见`);

  const init = await evalJs(cdp, `(() => {
    const tm = document.getElementById('tavernMenu');
    const main = document.querySelector('.tavern-main');
    return JSON.stringify({
      collapsed: !tm.classList.contains('open'),
      menuWidth: getComputedStyle(tm).width,
      mainLeft: Math.round(main.getBoundingClientRect().left),
      menuBody: document.querySelector('.tavern-menu-body').textContent
    });
  })()`);
  console.log('进入酒馆(默认):', init);
  const i = JSON.parse(init);
  const ok1 = i.collapsed && parseFloat(i.menuWidth) < 10 && i.menuBody.includes('瑟伦瑞达菜单');
  console.log(`[${ok1 ? '✅' : '❌'}] 进入酒馆菜单默认收拢`);

  await evalJs(cdp, `document.getElementById('tavernMenuBtn').click()`);
  await sleep(600);
  const exp = await evalJs(cdp, `(() => {
    const tm = document.getElementById('tavernMenu');
    const main = document.querySelector('.tavern-main');
    return JSON.stringify({
      open: tm.classList.contains('open'),
      menuWidth: getComputedStyle(tm).width,
      mainLeft: Math.round(main.getBoundingClientRect().left)
    });
  })()`);
  console.log('展开后:', exp);
  const e = JSON.parse(exp);
  const ok2 = e.open && e.menuWidth === '250px' && e.mainLeft > i.mainLeft + 200;
  console.log(`[${ok2 ? '✅' : '❌'}] 点击菜单展开且聊天区右移`);
  // 展开时按钮位置:菜单栏右上角,不遮挡菜单标题
  const btnPos = await evalJs(cdp, `(() => {
    const btn = document.getElementById('tavernMenuBtn');
    const title = document.querySelector('.tm-title');
    const br = btn.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    return JSON.stringify({
      inMenu: btn.classList.contains('in-menu'),
      btnLeft: Math.round(br.left), btnRight: Math.round(br.right),
      titleLeft: Math.round(tr.left), titleRight: Math.round(tr.right),
      btnBottom: Math.round(br.bottom),
      titleTop: Math.round(tr.top),
      inPadZone: br.bottom <= 56,
      overlapTitle: !(br.right <= tr.left || br.left >= tr.right || br.bottom <= tr.top)
    });
  })()`);
  console.log('展开时按钮位置:', btnPos);
  const bp = JSON.parse(btnPos);
  const okBtnPos = bp.inMenu && !bp.overlapTitle && bp.btnBottom <= bp.titleTop;
  console.log(`[${okBtnPos ? '✅' : '❌'}] 展开时按钮在菜单栏右上角不遮挡标题`);

  await evalJs(cdp, `document.getElementById('tavernMenuBtn').click()`);
  await sleep(600);
  const cl = await evalJs(cdp, `document.getElementById('tavernMenu').classList.contains('open')`);
  console.log(`[${!cl ? '✅' : '❌'}] 再次点击收拢`);

  await evalJs(cdp, `document.getElementById('exploreTab').click()`);
  await sleep(800);
  await evalJs(cdp, `document.getElementById('tavernTab').click()`);
  await sleep(2500);
  const again = await evalJs(cdp, `document.getElementById('tavernMenu').classList.contains('open')`);
  console.log(`[${!again ? '✅' : '❌'}] 重新进入酒馆默认收拢`);
  cdp.close(); edge.kill();
  process.exit(okBtn && okPos && ok1 && ok2 && okBtnPos && !cl && !again ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
