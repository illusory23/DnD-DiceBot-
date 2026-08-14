// 验证:晋升之路未达成等级徽章显示问号
import { spawn } from 'node:child_process';
const PORT = 9275;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-qmark`,'http://localhost:5000/north-expedition'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

const IMPORT = (total) => `(async () => {
    const save = {version:2, statsData:{total:${total}, guildPoints:${total}, groups:{}}, survival:{evilFrostActive:false}, fullLog:[],
      charData:{c1:{name:'测试',rank:'青羽',level:1,class:'战士',race:'人类',str:14,dex:12,con:13,int:10,wis:11,cha:9,hp:10,hpMax:10,tempHp:0,armor:12,weapons:[],inventory:[],spells:[],skillProfs:{},saveProfs:{},profBonus:2,background:'',features:[]}}, activeCharId:'c1'};
    const file = new File([JSON.stringify(save)], 't.json', {type:'application/json'});
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r => setTimeout(r, 800));
    document.getElementById('guildTab').click();
    await new Promise(r => setTimeout(r, 500));
    return 'ok';
})()`;

const CHECK = `(() => {
    const steps = Array.from(document.querySelectorAll('.guild-ladder-step'));
    return JSON.stringify({
        badges: steps.map(s => s.querySelector('.gls-badge').textContent),
        names: steps.map(s => s.querySelector('.gls-name').textContent)
    });
})()`;

(async()=>{
  const cdp = await connect(await getWsUrl());
  await cdp.send('Runtime.enable');
  await sleep(4000);
  // 青羽 0 事件:所有未达成(locked)应显示问号
  await evalJs(cdp, IMPORT(0));
  const qy = JSON.parse(await evalJs(cdp, CHECK));
  console.log('青羽(0事件) 徽章:', qy.badges.join(','));
  console.log('青羽(0事件) 名称:', qy.names.join(','));
  const ok1 = qy.badges[0] === '青羽' && qy.badges.slice(1).every(b => b === '?');
  console.log(`[${ok1 ? '✅' : '❌'}] 青羽:未达成等级徽章全为问号`);

  // 金羽 350:前 5 个为等级名(青羽~金羽),后 2 个为问号
  await evalJs(cdp, IMPORT(350));
  const jy = JSON.parse(await evalJs(cdp, CHECK));
  console.log('金羽(350事件) 徽章:', jy.badges.join(','));
  const ok2 = jy.badges.slice(0, 5).join('') === '青羽黑羽蓝羽银羽金羽' && jy.badges.slice(5).every(b => b === '?');
  console.log(`[${ok2 ? '✅' : '❌'}] 金羽:前5级显示名称,赤羽白羽为问号`);

  // 白羽 750:全部显示名称
  await evalJs(cdp, IMPORT(750));
  const by = JSON.parse(await evalJs(cdp, CHECK));
  const ok3 = by.badges.every(b => b !== '?');
  console.log(`[${ok3 ? '✅' : '❌'}] 白羽:满级全部显示名称`);
  cdp.close(); edge.kill();
  process.exit(ok1 && ok2 && ok3 ? 0 : 1);
})().catch(e=>{console.error('ERR', e.message); edge.kill();});
