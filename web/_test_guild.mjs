// 公会界面测试:等级与积分面板/阶梯可视化/子标签切换/积分逻辑
import { spawn } from 'node:child_process';
const PORT = 9272;
const URL = 'http://localhost:5000/north-expedition';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-test-guild`,URL], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<30;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl;}catch(e){}await sleep(500);}throw new Error('no ws');}
function connect(wsUrl){return new Promise((res,rej)=>{const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();const lis=[];ws.onopen=()=>res({send(m,p={}){return new Promise((r,j)=>{const mid=++id;pend.set(mid,{r,j});ws.send(JSON.stringify({id:mid,method:m,params:p}));});},onEvent(cb){lis.push(cb);},close(){ws.close();}});ws.onerror=e=>rej(e);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result);}else if(m.method){lis.forEach(cb=>cb(m));}};});}
async function evalJs(cdp,e){const r=await cdp.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('JS: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result?.value;}

const IMPORT_SAVE = (total, points) => `(async () => {
    const save = {
        version: 2,
        statsData: { total: ${total}, guildPoints: ${points}, groups: {} },
        survival: { evilFrostActive: false },
        fullLog: [],
        charData: { c1: { name: '测试冒险者', rank: '青羽', level: 1, class: '战士', race: '人类',
            str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 9,
            hp: 10, hpMax: 10, tempHp: 0, armor: 12, weapons: [], inventory: [],
            spells: [], skillProfs: {}, saveProfs: {}, profBonus: 2, background: '', features: [] } },
        activeCharId: 'c1'
    };
    const file = new File([JSON.stringify(save)], 'test.json', { type: 'application/json' });
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    const guildTab = document.getElementById('guildTab');
    if (guildTab && typeof guildTab.click === 'function') guildTab.click();
    await new Promise(r => setTimeout(r, 500));
    return 'done';
})()`;

const CHECK = `(() => {
    const badge = document.getElementById('guildRankBadge');
    const ladder = document.getElementById('guildLadder');
    const steps = ladder ? ladder.children.length : 0;
    const current = ladder ? ladder.querySelector('.current') : null;
    const done = ladder ? ladder.querySelectorAll('.done').length : 0;
    const locked = ladder ? ladder.querySelectorAll('.locked').length : 0;
    return JSON.stringify({
        badge: badge ? badge.textContent : null,
        badgeColor: badge ? badge.style.color : null,
        events: document.getElementById('guildStatEvents') ? document.getElementById('guildStatEvents').textContent : null,
        points: document.getElementById('guildStatPoints') ? document.getElementById('guildStatPoints').textContent : null,
        nextLabel: document.getElementById('guildRankNextLabel') ? document.getElementById('guildRankNextLabel').textContent : null,
        need: document.getElementById('guildRankNeed') ? document.getElementById('guildRankNeed').textContent : null,
        fill: document.getElementById('guildRankFill') ? document.getElementById('guildRankFill').style.width : null,
        steps: steps, current: current ? current.textContent.slice(0, 10) : null, done: done, locked: locked,
        guildVisible: document.getElementById('guildView').style.display !== 'none',
        guildTabActive: document.getElementById('guildTab').classList.contains('active')
    });
})()`;

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('[✅]', label); }
    else { fail++; console.log('[❌]', label, '|', detail ? JSON.stringify(detail).slice(0, 200) : ''); }
}
async function runCase(cdp, label, total, points, expect) {
    await evalJs(cdp, IMPORT_SAVE(total, points));
    const res = JSON.parse(await evalJs(cdp, CHECK));
    const ok = Object.entries(expect).every(([k, v]) => {
        if (k === 'current') return String(res[k]).includes(v);
        return String(res[k]) === String(v);
    });
    console.log(`[${ok ? '✅' : '❌'}] ${label} (事件=${total},积分=${points})`);
    if (!ok) { console.log('    期望:', JSON.stringify(expect)); console.log('    实际:', JSON.stringify(res)); }
    return ok;
}

try {
    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    const errs = [];
    cdp.onEvent(m => {
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails.exception || {};
            errs.push((d.description || d.value || '').slice(0, 300));
        }
    });
    await cdp.send('Runtime.enable');
    await sleep(4000);
    let all = true;

    // 1. 青羽 0 事件
    all &= await runCase(cdp, '青羽:徽章/阶梯7级/无完成', 0, 0, {
        badge: '青羽', events: '0', points: '0', steps: 7, done: 0, current: '青羽', locked: 6,
        guildVisible: 'true', guildTabActive: true, nextLabel: '→ 黑羽', need: '还需 50 次事件', fill: '0%'
    });
    // 2. 黑羽 50 事件 积分 70(50事件+20晋升)
    all &= await runCase(cdp, '黑羽:晋升+积分奖励(50+10)', 50, 60, {
        badge: '黑羽', events: '50', points: '60', done: 1, current: '黑羽', locked: 5,
        need: '还需 70 次事件'
    });
    // 3. 金羽 350:刚到金羽进度 0%;400 时 50/170→29%
    all &= await runCase(cdp, '金羽:刚到本级进度0%', 350, 500, {
        badge: '金羽', done: 4, current: '金羽', locked: 2,
        nextLabel: '→ 赤羽', need: '还需 170 次事件', fill: '0%'
    });
    all &= await runCase(cdp, '金羽:400事件进度29%', 400, 550, {
        badge: '金羽', fill: '29%', need: '还需 120 次事件'
    });
    // 4. 白羽 750:满级,进度条隐藏
    await evalJs(cdp, IMPORT_SAVE(750, 900));
    const wp = JSON.parse(await evalJs(cdp, CHECK));
    const progHidden = await evalJs(cdp, `document.getElementById('guildRankProgress').style.display`);
    const ok4 = wp.badge === '白羽' && wp.done === 6 && wp.locked === 0 && progHidden === 'none';
    console.log(`[${ok4 ? '✅' : '❌'}] 白羽:满级进度条隐藏`);
    if (!ok4) console.log('    实际:', JSON.stringify({badge: wp.badge, done: wp.done, progHidden}));
    all &= ok4;
    // 5. 子标签切换
    await evalJs(cdp, IMPORT_SAVE(0, 0));
    await evalJs(cdp, `guildSubTab('quest')`);
    const q = await evalJs(cdp, `JSON.stringify({
        rankHidden: document.getElementById('guildRankPanel').style.display === 'none',
        questShown: document.getElementById('guildQuestPanel').style.display !== 'none',
        questText: document.getElementById('guildQuestPanel').textContent
    })`);
    const qr = JSON.parse(q);
    check('委托栏子标签切换', qr.rankHidden && qr.questShown && qr.questText.includes('冒险者委托栏'), q);
    await evalJs(cdp, `guildSubTab('shop')`);
    const s = await evalJs(cdp, `JSON.stringify({
        shopShown: document.getElementById('guildShopPanel').style.display !== 'none',
        shopText: document.getElementById('guildShopPanel').textContent
    })`);
    const sr = JSON.parse(s);
    check('积分商店子标签切换', sr.shopShown && sr.shopText.includes('积分商店'), s);
    await evalJs(cdp, `guildSubTab('rank')`);
    const r = await evalJs(cdp, `document.getElementById('guildRankPanel').style.display !== 'none'`);
    check('切回等级与积分', r);

    // 6. 事件积分逻辑:触发一次事件验证 +1(通过 UI 点击事件)
    await evalJs(cdp, IMPORT_SAVE(0, 0));
    const clickRes = await evalJs(cdp, `(async () => {
        const card = document.querySelector('.event-card[data-cmd="ts100"]');
        if (!card) return 'no-card';
        card.click();
        await new Promise(r => setTimeout(r, 4000));
        const out = document.getElementById('outputArea');
        return JSON.stringify({
            outText: out ? out.textContent.slice(0, 150) : 'no-out',
            outHtml: out ? out.innerHTML.slice(0, 150) : '',
            exploreDepth: window._testDepth
        });
    })()`);
    console.log('事件点击详情:', clickRes);
    console.log('JS错误数:', errs.length);
    errs.slice(0, 8).forEach(e => console.log('  ❌', e));
    const after = await evalJs(cdp, `JSON.stringify({
        points: document.getElementById('guildStatPoints') ? document.getElementById('guildStatPoints').textContent : null
    })`);
    const ar = JSON.parse(after);
    check('事件完成积分+1', ar.points === '1', clickRes + ' ' + after);

    // 7. 晋升播报:49 事件 + 1 事件 = 黑羽(奖励 10)
    await evalJs(cdp, IMPORT_SAVE(49, 49));
    await evalJs(cdp, `(async () => {
        const card = document.querySelector('.event-card[data-cmd="ts100"]');
        if (card) card.click();
        await new Promise(r => setTimeout(r, 4000));
        return 'clicked';
    })()`);
    const promo = await evalJs(cdp, `document.getElementById('outputArea') ? document.getElementById('outputArea').textContent : ''`);
    check('晋升播报:黑羽获得10积分', promo.includes('获得 10 冒险者积分'), promo.slice(-200));

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
    cdp.close(); edge.kill();
    process.exit(fail ? 1 : 0);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
