// 验证 north-expedition 页面:加载、JS 错误、数据注入、交互冒烟
import { spawn } from 'node:child_process';

const PORT = 9261;
const URL = process.argv[2] || 'http://localhost:5000/north-expedition';

const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-verify-north`,
    URL,
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWsUrl() {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json`);
            const list = await res.json();
            const page = list.find(t => t.type === 'page');
            if (page) return page.webSocketDebuggerUrl;
        } catch (e) {}
        await sleep(500);
    }
    throw new Error('无法连接调试端口');
}

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let id = 0;
        const pending = new Map();
        const listeners = [];
        ws.onopen = () => resolve({
            send(method, params = {}) {
                return new Promise((res, rej) => {
                    const mid = ++id;
                    pending.set(mid, { res, rej });
                    ws.send(JSON.stringify({ id: mid, method, params }));
                });
            },
            onEvent(cb) { listeners.push(cb); },
            close() { ws.close(); }
        });
        ws.onerror = e => reject(new Error('WS error: ' + e.message));
        ws.onmessage = ev => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const p = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) p.rej(new Error(msg.error.message));
                else p.res(msg.result);
            } else if (msg.method) {
                listeners.forEach(cb => cb(msg));
            }
        };
    });
}

async function evalJs(cdp, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
        const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
        throw new Error('JS错误: ' + (d || r.exceptionDetails.text));
    }
    return r.result ? r.result.value : undefined;
}

try {
    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    const errors = [];
    cdp.onEvent(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails.exception || {};
            errors.push((d.description || d.value || '').slice(0, 300));
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            errors.push('Log: ' + (msg.params.entry.text || '').slice(0, 300));
        }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await sleep(4000);

    console.log('=== 页面标题:', await evalJs(cdp, 'document.title'));
    console.log('=== NORTH_DATA 注入:', await evalJs(cdp, '!!window.NORTH_DATA && Object.keys(window.NORTH_DATA).join(",")'));
    const tables = await evalJs(cdp, 'window.NORTH_DATA ? Object.keys(window.NORTH_DATA.TABLES).length : -1');
    console.log('=== TABLES 表数:', tables, '(期望 16)');
    const checkKeys = await evalJs(cdp, 'window.NORTH_DATA ? Object.keys(window.NORTH_DATA.CHECK_ACTIONS).length : -1');
    console.log('=== CHECK_ACTIONS 表数:', checkKeys);
    const itemKeys = await evalJs(cdp, 'window.NORTH_DATA ? Object.keys(window.NORTH_DATA.ITEM_ACTIONS).length : -1');
    console.log('=== ITEM_ACTIONS 表数:', itemKeys);

    // CTX 注入检查
    const ctx = await evalJs(cdp, `JSON.stringify({
        hasSurvival: !!window.NORTH_CTX.survival,
        hasAddLog: typeof window.NORTH_CTX.addSystemLog === 'function',
        hasRunCheck: typeof window.NORTH_CTX.runCheckChain === 'function',
        activeCharGetter: (function(){ try { return typeof Object.getOwnPropertyDescriptor(window.NORTH_CTX,'activeChar').get; } catch(e){ return 'no'; } })()
    })`);
    console.log('=== NORTH_CTX 注入:', ctx);

    // 页面关键元素存在
    const els = await evalJs(cdp, `JSON.stringify({
        exploreBtn: !!document.getElementById('exploreBtn') || !!document.querySelector('#exploreTab'),
        outputArea: !!document.getElementById('outputArea'),
        campView: !!document.getElementById('campView') || !!document.querySelector('.camp'),
        loadingOverlay: !!document.getElementById('northLoadingOverlay')
    })`);
    console.log('=== 关键元素:', els);

    // 交互冒烟:检查事件按钮并模拟触发一次探索(只读检查按钮存在)
    const btns = await evalJs(cdp, `(() => {
        const out = [];
        document.querySelectorAll('#outputArea button, .evt-btn, .event-btn, [onclick*="runEvent"], [onclick*="trigger"]').forEach(b => out.push((b.id || b.className || '').slice(0,40)));
        return out.slice(0, 12).join(' | ');
    })()`);
    console.log('=== 事件按钮:', btns);

    // 尝试点击第一个探索按钮(若有)
    const clickRes = await evalJs(cdp, `(() => {
        const btn = document.querySelector('#outputArea button, .evt-btn, .event-btn');
        if (!btn) return 'no-btn';
        const fn = btn.onclick ? btn.onclick.toString().slice(0, 60) : (btn.getAttribute('onclick') || '');
        btn.click();
        return 'clicked:' + fn;
    })()`);
    console.log('=== 点击按钮:', clickRes);
    await sleep(1500);
    const logLen = await evalJs(cdp, `(document.getElementById('outputArea') ? document.getElementById('outputArea').children.length : -1)`);
    console.log('=== 输出区子元素数:', logLen);
    console.log('=== JS 错误数:', errors.length);
    errors.slice(0, 10).forEach(e => console.log('  ❌', e));
    if (errors.length === 0) console.log('✅ 页面运行无 JS 错误');
    cdp.close();
    edge.kill();
    process.exit(errors.length ? 1 : 0);
} catch (e) {
    console.error('验证失败:', e.message);
    edge.kill();
    process.exit(1);
}
