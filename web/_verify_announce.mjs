// 公告端到端验证:管理员发布→横幅显示→停用→横幅消失→删除
import { spawn } from 'node:child_process';
const PORT = 9281;
const BASE = 'http://localhost:5000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\edge-ann`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _cookie = '';
async function api(path, body, method) {
    const opts = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
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

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('[✅]', label); }
    else { fail++; console.log('[❌]', label, '|', detail ? JSON.stringify(detail).slice(0, 200) : ''); }
}

try {
    // 1. 管理员登录
    const login = await api('/admin/api/login', { username: 'IllusoryActor', password: 'illusorior' });
    check('管理员登录', login.ok, login);

    // 2. 发布公告
    const pub = await api('/api/admin/announcements', { action: 'add', title: '平台测试公告', content: '这是一条测试公告内容' });
    check('管理员发布公告', pub.ok && pub.announcement && pub.announcement.active, pub);
    const annId = pub.announcement.id;

    // 3. 公开接口返回
    const list = await api('/api/announcements');
    check('公开接口返回公告', list.ok && list.announcements.some(a => a.id === annId), list);

    // 4. 浏览器横幅显示
    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    await cdp.send('Runtime.enable');
    await sleep(1000);
    await evalJs(cdp, `location.href='${BASE}/'`);
    await sleep(4000);
    const banner = await evalJs(cdp, `(() => {
        const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('平台测试公告'));
        if (!divs.length) return 'no-banner';
        const nav = document.querySelector('.navbar');
        const br = divs[0].getBoundingClientRect();
        const nr = nav ? nav.getBoundingClientRect() : null;
        return JSON.stringify({
            text: divs[0].textContent.slice(0, 50),
            bannerTop: Math.round(br.top),
            navBottom: nr ? Math.round(nr.bottom) : 56,
            belowNav: nr ? br.top >= nr.bottom - 2 : br.top >= 56,
            navClickable: nr ? br.top >= nr.bottom : true
        });
    })()`);
    const bObj = JSON.parse(banner);
    check('平台页面横幅显示', bObj.text.includes('📢') && bObj.text.includes('平台测试公告'), banner);
    check('横幅在导航下方不遮挡', bObj.belowNav && bObj.navClickable, banner);

    // 5. 关闭按钮 → 本地记忆,刷新后不显示
    await evalJs(cdp, `(() => {
        const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('平台测试公告'));
        if (divs.length) {
            const btn = divs[0].querySelector('button');
            if (btn) btn.click();
        }
        return 'closed';
    })()`);
    await sleep(500);
    const closed = await evalJs(cdp, `(() => {
        const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('平台测试公告'));
        return divs.length === 0;
    })()`);
    check('关闭后横幅消失(本地记忆)', closed);
    // 北境页面横幅位置验证
    await evalJs(cdp, `location.href='${BASE}/north-expedition'`);
    await sleep(4000);
    const nb = await evalJs(cdp, `(() => {
        const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('平台测试公告'));
        if (!divs.length) return 'no-banner';
        const bar = document.querySelector('.top-bar');
        const br = divs[0].getBoundingClientRect();
        const barRect = bar ? bar.getBoundingClientRect() : null;
        return JSON.stringify({bannerTop: Math.round(br.top), barBottom: barRect ? Math.round(barRect.bottom) : 0});
    })()`);
    console.log('北境横幅位置:', nb);

    // 6. 停用公告 → 新浏览器会话(清 localStorage)不显示
    await evalJs(cdp, `localStorage.removeItem('dnd_dismissed_anns'); location.reload();`);
    await sleep(3500);
    const afterReload = await evalJs(cdp, `document.body.textContent.includes('平台测试公告')`);
    check('刷新后(未关闭记忆)横幅重新显示', afterReload);

    const toggle = await api('/api/admin/announcements', { action: 'toggle', id: annId });
    check('管理员停用公告', toggle.ok && toggle.active === false, toggle);
    await evalJs(cdp, `location.reload()`);
    await sleep(3500);
    const afterOff = await evalJs(cdp, `!document.body.textContent.includes('平台测试公告')`);
    check('停用后横幅消失', afterOff);

    // 7. 删除公告
    const del = await api('/api/admin/announcements', { action: 'delete', id: annId });
    check('管理员删除公告', del.ok, del);
    const afterDel = await api('/api/announcements');
    check('删除后公开接口无该公告', !afterDel.announcements.some(a => a.id === annId), afterDel);

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
    cdp.close(); edge.kill();
    process.exit(fail ? 1 : 0);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
