// 2026-08-16 八项优化验证: 地图(map-fog拆分) + 北境(guild模块/渲染增量/公会标签) + 用户中心(通知红点)
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
    // ━━ 1. 地图页: map-fog 拆分后 ━━
    const ws1 = await launch('http://localhost:5000/map', 9241);
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
        fogFns: ['redrawFogCanvas','drawFogShapeTo','floodFillOnCanvas','removeFogByErasePath'].every(function(n){ return typeof window[n] === 'function'; }),
        topFns: ['handleFileImport','clearDrawings','setTool','exportMapJSON','renderSaveMenu'].every(function(n){ return typeof window[n] === 'function'; }),
        canvas: !!document.getElementById('map-canvas'),
        fogCanvas: !!document.getElementById('fog-canvas'),
        mapJsLoaded: !!document.querySelector('script[src*="map.js"]'),
        fogJsLoaded: !!document.querySelector('script[src*="map-fog.js"]'),
    })`);
    const d1 = JSON.parse(m1);
    check('迷雾函数全局可用', d1.fogFns, d1.fogFns ? '' : '缺失');
    check('map.js 顶层函数完整', d1.topFns);
    check('画布元素存在', d1.canvas && d1.fogCanvas);
    check('脚本加载顺序正确', d1.fogJsLoaded && d1.mapJsLoaded, 'fog=' + d1.fogJsLoaded + ' map=' + d1.mapJsLoaded);
    check('地图页无JS错误', errors1.length === 0, errors1[0] || '');
    cdp1.close();
    edge.kill();
    await sleep(1000);

    // ━━ 2. 北境页: guild 模块 + 渲染增量 + 公会标签 ━━
    const ws2 = await launch('http://localhost:5000/north-expedition', 9242);
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
        guild: !!window.NORTH_GUILD && typeof window.NORTH_GUILD.updateRankUI === 'function',
        statsGetter: (function(){ try { return typeof Object.getOwnPropertyDescriptor(window.NORTH_CTX,'statsData').get; } catch(e){ return 'no'; } })(),
        charStatus: document.getElementById('charStatus') ? document.getElementById('charStatus').textContent : '无',
        renderLog: typeof renderDisplayLog === 'function',
        noDup: (function(){ var c = 0; for (var k in window) if (k === 'checkRankUp') c++; return c; })(),
    })`);
    const d2 = JSON.parse(m2);
    check('NORTH_GUILD 模块加载', d2.guild);
    check('CTX statsData getter 注入', d2.statsGetter === 'function', d2.statsGetter);
    check('探索端公会标签渲染', d2.charStatus === '青羽' || d2.charStatus === '未选择', d2.charStatus);
    check('北境页无JS错误', errors2.length === 0, errors2[0] || '');
    cdp2.close();
    edge.kill();
    await sleep(1000);

    // ━━ 3. 用户中心: 通知卡片 + 红点 + Toast ━━
    const ws3 = await launch('http://localhost:5000/user', 9243);
    const cdp3 = await connect(ws3);
    await cdp3.send('Runtime.enable');
    await sleep(4000);
    await evalJs(cdp3, `(async () => {
        const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'NotifyA0816', password:'TestPass123'})});
        await r.json();
        // 制造一条新未读通知（B 再评论一次）
        const cj = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'NotifyB0816', password:'TestPass123'})});
        await cj.json();
        await fetch('/api/community/posts/3/comments', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({content:'未读红点验证评论'})});
        // 重新以 A 登录
        const r2 = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'NotifyA0816', password:'TestPass123'})});
        await r2.json();
        location.reload();
    })()`);
    await sleep(4500);
    const m3 = await evalJs(cdp3, `JSON.stringify({
        notifyList: !!document.getElementById('notify-list'),
        notifyCount: document.querySelectorAll('#notify-list .item-row').length,
        badge: (function(){ var b = document.getElementById('notify-badge'); return b && b.style.display !== 'none' ? b.textContent : '无'; })(),
        toast: typeof Toast !== 'undefined' && typeof Toast.show === 'function',
        notifFn: typeof loadNotifications === 'function' && typeof refreshUnreadCount === 'function',
    })`);
    const d3 = JSON.parse(m3);
    check('通知卡片渲染', d3.notifyList && d3.notifyCount > 0, d3.notifyCount + ' 条');
    check('未读红点显示', d3.badge.indexOf('未读') >= 0, d3.badge);
    check('Toast 组件就绪', d3.toast);
    check('通知函数齐全', d3.notifFn);
    cdp3.close();
    edge.kill();

    console.log('\n═══ ' + (fails ? `失败 ${fails} 项 ❌` : '全部通过 ✅') + ' ═══');
    process.exit(fails ? 1 : 0);
})().catch(e => {
    console.error('异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
