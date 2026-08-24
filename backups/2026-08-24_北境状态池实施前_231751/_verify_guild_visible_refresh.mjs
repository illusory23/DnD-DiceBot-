// 验证:公会界面可见时存档加载(updateRankUI)直接刷新阶梯,无需切换
import { spawn } from 'node:child_process';
const PORT = 9277;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-gvr`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  // 先进入公会(此时 statsData.total=0,阶梯=青羽)
  await evalJs(cdp, `document.getElementById('guildTab').click()`);
  await sleep(600);
  const before = await evalJs(cdp, `document.querySelector('.guild-ladder-step.current .gls-badge').textContent`);
  console.log('进入公会(0事件):', before);
  // 公会可见状态下导入 350 事件存档(importSave → updateRankUI → renderGuild 应直接刷新)
  await evalJs(cdp, `(async () => {
    const save = {version:2, statsData:{total:350, guildPoints:500, groups:{}}, survival:{evilFrostActive:false}, fullLog:[],
      charData:{c1:{name:'测试',rank:'青羽',level:1,class:'战士',race:'人类',str:14,dex:12,con:13,int:10,wis:11,cha:9,hp:10,hpMax:10,tempHp:0,armor:12,weapons:[],inventory:[],spells:[],skillProfs:{},saveProfs:{},profBonus:2,background:'',features:[]}}, activeCharId:'c1'};
    const file = new File([JSON.stringify(save)], 't.json', {type:'application/json'});
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r => setTimeout(r, 1500));
    return 'ok';
  })()`);
  const after = await evalJs(cdp, `document.querySelector('.guild-ladder-step.current .gls-badge').textContent`);
  console.log('公会可见时导入存档后:', after);
  console.log(`[${after === '金羽' ? '✅' : '❌'}] 公会可见时存档加载直接刷新阶梯(无需切换)`);
  cdp.close(); edge.kill();
  process.exit(after === '金羽' ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
