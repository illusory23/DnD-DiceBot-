// 验证:公会界面背景图生效
import { spawn } from 'node:child_process';
const PORT = 9279;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-gbg`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}
(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  await evalJs(cdp, `document.getElementById('guildTab').click()`);
  await sleep(3000);
  const st = await evalJs(cdp, `(() => {
    const bg = document.getElementById('guildBg');
    const cs = bg ? getComputedStyle(bg) : null;
    return JSON.stringify({
      shown: bg ? bg.style.display !== 'none' : false,
      bgImage: cs ? cs.backgroundImage : null,
      position: cs ? cs.position : null,
      inset: cs ? (cs.top + '/' + cs.left + '/' + cs.right + '/' + cs.bottom) : null,
      zIndex: cs ? cs.zIndex : null,
      viewZ: getComputedStyle(document.getElementById('guildView')).zIndex
    });
  })()`);
  console.log('公会全屏背景:', st);
  const s = JSON.parse(st);
  const ok = s.shown && s.bgImage.includes('guild_bg.png') && s.position === 'fixed' && s.inset === '0px/0px/0px/0px' && Number(s.zIndex) < Number(s.viewZ);
  console.log(`[${ok ? '✅' : '❌'}] 公会全屏背景生效`);
  await evalJs(cdp, `document.getElementById('exploreTab').click()`);
  await sleep(600);
  const hidden = await evalJs(cdp, `document.getElementById('guildBg').style.display`);
  console.log(`[${hidden === 'none' ? '✅' : '❌'}] 离开公会后背景隐藏`);
  // 回到公会验证顶部栏层级
  await evalJs(cdp, `document.getElementById('guildTab').click()`);
  await sleep(2500);
  const tb = await evalJs(cdp, `(() => {
    const bar = document.querySelector('.top-bar');
    const cs = bar ? getComputedStyle(bar) : null;
    const bg = document.getElementById('guildBg');
    return JSON.stringify({
      topBarZ: cs ? cs.zIndex : null,
      bgZ: getComputedStyle(bg).zIndex,
      aboveBg: Number(cs.zIndex) > Number(getComputedStyle(bg).zIndex)
    });
  })()`);
  console.log('顶部栏层级:', tb);
  // 酒馆背景全屏验证
  await evalJs(cdp, `document.getElementById('tavernTab').click()`);
  await sleep(2500);
  const tv = await evalJs(cdp, `(() => {
    const tp = document.getElementById('tavernPanel');
    const cs = tp ? getComputedStyle(tp) : null;
    const bar = document.querySelector('.top-bar');
    return JSON.stringify({
      active: tp.classList.contains('active'),
      top: cs ? cs.top : null,
      bgImage: cs ? cs.backgroundImage.slice(0, 60) : null,
      bgSize: cs ? cs.backgroundSize : null,
      topBarZ: getComputedStyle(bar).zIndex,
      panelZ: cs ? cs.zIndex : null,
      barAbove: Number(getComputedStyle(bar).zIndex) > Number(cs.zIndex)
    });
  })()`);
  console.log('酒馆背景:', tv);
  // 酒馆标题栏位置验证(在功能栏下方)
  const hd = await evalJs(cdp, `(() => {
    const bar = document.querySelector('.top-bar');
    const h = document.querySelector('.tavern-header');
    const tp = document.getElementById('tavernPanel');
    const cs = getComputedStyle(tp);
    const barRect = bar.getBoundingClientRect();
    const hRect = h.getBoundingClientRect();
    return JSON.stringify({
      paddingTop: cs.paddingTop,
      headerTop: Math.round(hRect.top),
      barBottom: Math.round(barRect.bottom),
      belowBar: hRect.top >= barRect.bottom - 2
    });
  })()`);
  console.log('酒馆标题位置:', hd);
  const hObj = JSON.parse(hd);
  const okHeader = hObj.belowBar;
  console.log(`[${okHeader ? '✅' : '❌'}] 酒馆标题与在线显示在功能栏下方`);

  const tvObj = JSON.parse(tv);
  const okTavern = tvObj.active && tvObj.top === '0px' && tvObj.bgSize === 'cover' && tvObj.barAbove;
  console.log(`[${okTavern ? '✅' : '❌'}] 酒馆背景全屏铺满+顶部栏可切换`);

  // 公会内容卡片不透明度验证
  const cards = await evalJs(cdp, `(() => {
    const gv = document.getElementById('guildView');
    const rc = document.querySelector('.guild-rank-card');
    const step = document.querySelector('.guild-ladder-step');
    return JSON.stringify({
      viewBg: getComputedStyle(gv).backgroundColor,
      cardBg: rc ? getComputedStyle(rc).backgroundImage : null,
      stepBg: step ? getComputedStyle(step).backgroundColor : null
    });
  })()`);
  console.log('公会卡片背景:', cards);

  const t = JSON.parse(tb);
  const okTb = t.aboveBg;
  console.log(`[${okTb ? '✅' : '❌'}] 顶部功能栏在公会背景之上(可切换界面)`);
  // 实际点击顶部栏切到营地
  await evalJs(cdp, `document.querySelector('.top-bar #campTab').click()`);
  await sleep(2500);
  const switched = await evalJs(cdp, `document.getElementById('campView').style.display !== 'none'`);
  console.log(`[${switched ? '✅' : '❌'}] 公会界面下点击顶部栏成功切换`);
  cdp.close(); edge.kill();
  process.exit(ok && hidden === 'none' && okTb && switched && okTavern && okHeader ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
