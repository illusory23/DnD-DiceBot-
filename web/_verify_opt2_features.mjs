// 2026-08-16 五项优化验证2: map二次拆分 + 生存模块 + 通知独立页
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let edge = null;

async function launch(url, port) {
    edge = spawn(EDGE, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}\\edge-verify-${port}`,
        url,
    ], { stdio: 'ignore' });
    for (let i = 0; i < 30; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json`);
            const l = await r.json();
            const p = l.find(t => t.type === 'page');
            if (p) return p.webSocketDebuggerUrl;
        } catch (e) {}
        await sleep(500);
    }
    throw new Error('no debug port');
}

function connect(wsUrl) {
    return new Promise((res, rej) => {
        const ws = new WebSocket(wsUrl);
        let id = 0;
        const pending = new Map();
        const listeners = [];
        ws.onopen = () => res({
            send(method, params = {}) {
                return new Promise((rs, rj) => {
                    const mid = ++id;
                    pending.set(mid, { res: rs, rej: rj });
                    ws.send(JSON.stringify({ id: mid, method, params }));
                });
            },
            onEvent(cb) { listeners.push(cb); },
            close() { ws.close(); }
        });
        ws.onerror = () => rej(new Error('WS error'));
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && pending.has(m.id)) {
                const p = pending.get(m.id);
                pending.delete(m.id);
                m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
            } else if (m.method) {
                listeners.forEach(cb => cb(m));
            }
        };
    });
}

async function evalJs(cdp, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
        throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 300));
    }
    return r.result ? r.result.value : undefined;
}

let fails = 0;
function check(name, ok, extra = '') {
    console.log((ok ? '  ✅' : '  ❌') + ' ' + name + (extra ? ' — ' + extra : ''));
    if (!ok) fails++;
}

(async () => {
    // ━━ 1. 地图页: 二次拆分后 ━━
    const ws1 = await launch('http://localhost:5000/map', 9251);
    const cdp1 = await connect(ws1);
    await cdp1.send('Runtime.enable');
    const errors1 = [];
    cdp1.onEvent(m => {
        if (m.method === 'Runtime.exceptionThrown') {
            errors1.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
        }
    });
    await sleep(5000);
    const m1 = await evalJs(cdp1, `JSON.stringify({
        idb: typeof window.initDB === 'function' && typeof window.dbGetSync === 'function',
        saves: ['getSlotRegistry','renderSaveMenu','exportMapJSON','importMapJSON','loadMapFromServer'].every(function(n){ return typeof window[n] === 'function'; }),
        page: typeof window.toggleJoinColorPalette === 'function' && typeof window._selectJoinColor === 'function',
        fog: typeof window.redrawFogCanvas === 'function',
        scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.src.split('/').pop()).join(','),
        canvas: !!document.getElementById('map-canvas'),
    })`);
    const d1 = JSON.parse(m1);
    check('IndexedDB 模块', d1.idb);
    check('存档槽模块函数', d1.saves);
    check('页面内联外置函数', d1.page);
    check('迷雾模块', d1.fog);
    check('脚本加载顺序(idb→fog→saves→map)', d1.scripts.indexOf('map-idb.js') < d1.scripts.indexOf('map-fog.js')
        && d1.scripts.indexOf('map-fog.js') < d1.scripts.indexOf('map-saves.js')
        && d1.scripts.indexOf('map-saves.js') < d1.scripts.indexOf('map.js'), d1.scripts);
    check('地图页无JS错误', errors1.length === 0, errors1[0] || '');
    cdp1.close();
    edge.kill();
    await sleep(1000);

    // ━━ 2. 北境页: 生存模块 ━━
    const ws2 = await launch('http://localhost:5000/north-expedition', 9252);
    const cdp2 = await connect(ws2);
    await cdp2.send('Runtime.enable');
    const errors2 = [];
    cdp2.onEvent(m => {
        if (m.method === 'Runtime.exceptionThrown') {
            errors2.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
        }
    });
    await sleep(5000);
    const m2 = await evalJs(cdp2, `JSON.stringify({
        surv: !!window.NORTH_SURVIVAL && typeof window.NORTH_SURVIVAL.checkCold === 'function',
        ctx: typeof window.NORTH_CTX.updateSurvivalUI === 'function' && typeof window.NORTH_CTX.checkHpZero === 'function',
        guild: typeof window.NORTH_GUILD.updateRankUI === 'function',
        data: !!window.NORTH_DATA,
        main: typeof renderEvents === 'function',
    })`);
    const d2 = JSON.parse(m2);
    check('NORTH_SURVIVAL 模块', d2.surv);
    check('CTX 生存函数注入', d2.ctx);
    check('guild 模块仍正常', d2.guild);
    check('北境页无JS错误', errors2.length === 0, errors2[0] || '');
    cdp2.close();
    edge.kill();
    await sleep(1000);

    // ━━ 3. 通知独立页 ━━
    const ws3 = await launch('http://localhost:5000/notifications', 9253);
    const cdp3 = await connect(ws3);
    await cdp3.send('Runtime.enable');
    await sleep(4000);
    await evalJs(cdp3, `(async () => {
        const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'AggA0816', password:'TestPass123'})});
        await r.json();
        location.reload();
    })()`);
    await sleep(4500);
    const m3 = await evalJs(cdp3, `JSON.stringify({
        count: document.querySelectorAll('.notify-item').length,
        hasAgg: (document.querySelectorAll('.notify-text b')[0] ? document.querySelectorAll('.notify-text b')[0].textContent : ''),
        badge: (function(){ var b = document.getElementById('nav-badge'); return b && b.style.display !== 'none' ? b.textContent : '无'; })(),
        unreadDots: document.querySelectorAll('.notify-dot').length,
        pageTitle: document.title,
    })`);
    const d3 = JSON.parse(m3);
    check('通知列表渲染', d3.count >= 3, d3.count + ' 条');
    check('聚合显示 N 人', d3.hasAgg.indexOf('人') >= 0, d3.hasAgg);
    check('导航红点', d3.badge !== '无', d3.badge);
    check('未读红点', d3.unreadDots >= 3, d3.unreadDots + ' 个');
    cdp3.close();
    edge.kill();

    console.log('\n═══ ' + (fails ? `失败 ${fails} 项 ❌` : '全部通过 ✅') + ' ═══');
    process.exit(fails ? 1 : 0);
})().catch(e => {
    console.error('异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
