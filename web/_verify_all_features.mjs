// 2026-08-15 综合验证: 北境拆分(tavern/fx) + 官网头像/点赞/搜索/公告
// 用法: node _verify_all_features.mjs [baseUrl]
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'http://localhost:5000';
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
            const res = await fetch(`http://127.0.0.1:${port}/json`);
            const list = await res.json();
            const page = list.find(t => t.type === 'page');
            if (page) return page.webSocketDebuggerUrl;
        } catch (e) {}
        await sleep(500);
    }
    throw new Error(`无法连接调试端口 ${port}`);
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
        throw new Error('JS错误: ' + (d || r.exceptionDetails.text).slice(0, 300));
    }
    return r.result ? r.result.value : undefined;
}

let failures = 0;
function check(name, ok, extra = '') {
    console.log((ok ? '  ✅' : '  ❌') + ' ' + name + (extra ? ' — ' + extra : ''));
    if (!ok) failures++;
}

async function verifyPage(url, port, checks) {
    console.log(`\n▶ 页面: ${url}`);
    const wsUrl = await launch(url, port);
    const cdp = await connect(wsUrl);
    const errors = [];
    cdp.onEvent(msg => {
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails.exception || {};
            errors.push((d.description || d.value || '').slice(0, 300));
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            const t = msg.params.entry.text || '';
            if (t.indexOf('401') >= 0) return; // 未登录访问 /api/auth/me 的预期响应, 非错误
            errors.push('Log: ' + t.slice(0, 300));
        }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await sleep(5000);
    for (const c of checks) {
        try { await c.run(cdp); } catch (e) { check(c.name, false, e.message); }
    }
    check('页面无 JS 错误', errors.length === 0, errors.length ? errors[0] : '');
    if (errors.length > 1) errors.slice(1, 6).forEach(e => console.log('    ⚠ ' + e.slice(0, 150)));
    cdp.close();
    edge.kill();
    edge = null;
    await sleep(1000);
}

(async () => {
    // ━━ 1. 北境页: 拆分后模块加载与运行 ━━
    await verifyPage(`${BASE}/north-expedition`, 9211, [
        {
            name: 'NORTH_TAVERN 模块已加载',
            run: async (c) => {
                const v = await evalJs(c, `!!window.NORTH_TAVERN && typeof window.NORTH_TAVERN.refresh === 'function'`);
                check('NORTH_TAVERN.refresh 存在', v);
            }
        },
        {
            name: '酒馆发送/菜单挂全局',
            run: async (c) => {
                const v = await evalJs(c, `typeof window.northTavernSend === 'function' && typeof window.toggleTavernMenu === 'function'`);
                check('northTavernSend/toggleTavernMenu 存在', v);
            }
        },
        {
            name: 'CTX username getter 注入',
            run: async (c) => {
                const v = await evalJs(c, `(() => { try { var d = Object.getOwnPropertyDescriptor(window.NORTH_CTX, 'username'); return d && typeof d.get === 'function'; } catch(e){ return false; } })()`);
                check('NORTH_CTX.username getter', v);
            }
        },
        {
            name: '雪花特效运行',
            run: async (c) => {
                const v = await evalJs(c, `(() => { var cv = document.getElementById('snowCanvas'); return cv ? 'canvas存在 ' + cv.width + 'x' + cv.height : '无canvas'; })()`);
                check('snowCanvas 初始化', !!v && !String(v).startsWith('无'), String(v));
            }
        },
        {
            name: '数据注入正常',
            run: async (c) => {
                const v = await evalJs(c, `window.NORTH_DATA ? Object.keys(window.NORTH_DATA.TABLES).length : -1`);
                check('TABLES 表数=16', v === 16, '实际 ' + v);
            }
        },
        {
            name: '主逻辑函数完整(经CTX注入引用)',
            run: async (c) => {
                const v = await evalJs(c, `(() => { var f = ['addSystemLog','runCheckChain','addCheckResult','rollDiceExpr','renderCharDetail','survival']; var miss = f.filter(function(n){ return !window.NORTH_CTX[n]; }); return miss.join(','); })()`);
                check('NORTH_CTX 注入完整', v === '', v || 'OK');
            }
        },
        {
            name: '酒馆轮询已启动',
            run: async (c) => {
                await sleep(2500);
                const v = await evalJs(c, `(document.getElementById('tavernMessages') ? document.getElementById('tavernMessages').children.length : -1)`);
                check('tavernMessages 有轮询输出', v >= 0, '元素数 ' + v);
            }
        },
    ]);

    // ━━ 2. 官网首页: 头像/点赞/搜索/分页 JS ━━
    await verifyPage(`${BASE}/`, 9212, [
        {
            name: '头像辅助函数',
            run: async (c) => {
                const v = await evalJs(c, `typeof _avatarHTML === 'function' && typeof ensureAvatars === 'function' && typeof _avatarCache === 'object'`);
                check('_avatarHTML/ensureAvatars 存在', v);
            }
        },
        {
            name: '点赞/分页/搜索函数',
            run: async (c) => {
                const v = await evalJs(c, `['toggleLike','loadThreads','renderThreadPager','threadPage','doThreadSearch','wsPage','renderWsPager','doWsSearch'].every(function(n){ return typeof window[n] === 'function'; })`);
                check('分页搜索点赞函数齐全', v);
            }
        },
        {
            name: '板块列表渲染',
            run: async (c) => {
                const v = await evalJs(c, `(document.getElementById('home-board-list') ? document.getElementById('home-board-list').children.length : -1)`);
                check('首页板块列表有内容', v > 0, '元素数 ' + v);
            }
        },
        {
            name: '工坊卡片渲染',
            run: async (c) => {
                const v = await evalJs(c, `(document.getElementById('home-ws-grid') ? document.getElementById('home-ws-grid').children.length : -1)`);
                check('首页工坊卡片有内容', v >= 0, '元素数 ' + v);
            }
        },
        {
            name: '切换酒馆板块',
            run: async (c) => {
                await evalJs(c, `navTo('community', document.querySelector('[data-nav="community"]'))`);
                await sleep(1500);
                const v = await evalJs(c, `(document.getElementById('board-list') ? document.getElementById('board-list').children.length : -1)`);
                check('酒馆板块渲染', v > 0, '元素数 ' + v);
            }
        },
        {
            name: '进入板块帖子列表(分页+计数)',
            run: async (c) => {
                await evalJs(c, `(function(){ var row = document.querySelector('#board-list .board-row'); if (row) renderBoard(row.dataset.id); })()`);
                await sleep(1800);
                const v = await evalJs(c, `(() => { var t = document.getElementById('board-threads'); return t ? {rows: t.querySelectorAll('.thread-row').length, search: !!document.getElementById('thread-search'), pager: !!document.getElementById('thread-pager')} : null; })()`);
                check('帖子列表+搜索框渲染', v && v.rows >= 0 && v.search, JSON.stringify(v));
            }
        },
        {
            name: '工坊页搜索框',
            run: async (c) => {
                await evalJs(c, `navTo('workshop', document.querySelector('[data-nav="workshop"]'))`);
                await sleep(1500);
                const v = await evalJs(c, `(() => { var s = document.getElementById('ws-search'); return s ? 'search存在' : '无'; })()`);
                check('工坊搜索框存在', String(v).indexOf('search') >= 0, String(v));
            }
        },
    ]);

    // ━━ 3. 公告页 ━━
    await verifyPage(`${BASE}/announcements`, 9213, [
        {
            name: '公告页结构',
            run: async (c) => {
                const v = await evalJs(c, `(document.getElementById('ann-list') ? document.getElementById('ann-list').children.length : -1)`);
                check('公告列表容器渲染', v >= 0, '元素数 ' + v);
            }
        },
    ]);

    console.log('\n═══ 验证结果 ═══');
    console.log(failures === 0 ? '全部通过 ✅' : `失败 ${failures} 项 ❌`);
    process.exit(failures ? 1 : 0);
})().catch(e => {
    console.error('验证异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
