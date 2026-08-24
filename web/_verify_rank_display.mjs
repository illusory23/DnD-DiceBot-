// 验证:其他界面只显示头衔(无进度条元素),公会界面保留阶梯
import { spawn } from 'node:child_process';
const PORT = 9274;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-verify-rank`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}
(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  // 导入 50 事件存档(黑羽)
  await evalJs(cdp, `(async () => {
    const save = {version:2, statsData:{total:50, guildPoints:70, groups:{}}, survival:{evilFrostActive:false}, fullLog:[],
      charData:{c1:{name:'测试',rank:'青羽',level:1,class:'战士',race:'人类',str:14,dex:12,con:13,int:10,wis:11,cha:9,hp:10,hpMax:10,tempHp:0,armor:12,weapons:[],inventory:[],spells:[],skillProfs:{},saveProfs:{},profBonus:2,background:'',features:[]}}, activeCharId:'c1'};
    const file = new File([JSON.stringify(save)], 't.json', {type:'application/json'});
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r => setTimeout(r, 800));
    return 'ok';
  })()`);
  const st = await evalJs(cdp, `JSON.stringify({
    progressRow: !!document.getElementById('rankProgressRow'),
    badge: document.getElementById('charStatus') ? document.getElementById('charStatus').textContent : null,
    campBadge: document.getElementById('campCharStatus') ? document.getElementById('campCharStatus').textContent : null,
    guildLadder: !!document.getElementById('guildLadder')
  })`);
  console.log('探索面板状态(50事件):', st);
  // 进入公会验证阶梯渲染
  await evalJs(cdp, `document.getElementById('guildTab').click()`);
  await sleep(600);
  const g = await evalJs(cdp, `JSON.stringify({
    ladderSteps: document.getElementById('guildLadder') ? document.getElementById('guildLadder').children.length : 0,
    current: document.getElementById('guildLadder') ? document.getElementById('guildLadder').querySelector('.current') ? document.getElementById('guildLadder').querySelector('.current').textContent.slice(0,8) : null : null
  })`);
  console.log('公会面板状态:', g);
  // 样式生效验证:计算样式
  const css = await evalJs(cdp, `(() => {
    const card = document.querySelector('.guild-rank-card');
    const subtab = document.querySelector('.guild-subtab');
    const step = document.querySelector('.guild-ladder-step');
    const badge = document.querySelector('.gls-badge');
    return JSON.stringify({
      cardBg: card ? getComputedStyle(card).backgroundImage.slice(0, 60) : null,
      cardBorder: card ? getComputedStyle(card).borderColor : null,
      subtabColor: subtab ? getComputedStyle(subtab).color : null,
      stepRadius: step ? getComputedStyle(step).borderRadius : null,
      badgeSize: badge ? getComputedStyle(badge).width : null
    });
  })()`);
  console.log('样式计算:', css);
  cdp.close(); edge.kill();
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
