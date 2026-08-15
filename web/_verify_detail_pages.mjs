// 验证: 帖子/工坊独立详情页渲染 + 用户中心收藏链接跳转
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
    // ━━ 1. 帖子详情页 ━━
    const ws1 = await launch('http://localhost:5000/post/2', 9231);
    const cdp1 = await connect(ws1);
    await cdp1.send('Runtime.enable');
    const errors = [];
    cdp1.onEvent(m => {
        if (m.method === 'Runtime.exceptionThrown') {
            errors.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
        }
    });
    await sleep(4500);
    const p1 = await evalJs(cdp1, `JSON.stringify({
        title: document.querySelector('.post-title') ? document.querySelector('.post-title').textContent : '',
        author: document.querySelector('.author-name') ? document.querySelector('.author-name').textContent : '',
        content: document.querySelector('.post-content') ? document.querySelector('.post-content').textContent.slice(0, 20) : '',
        hasLike: !!document.getElementById('like-btn'),
        hasFav: !!document.getElementById('fav-btn'),
        likeCnt: document.getElementById('like-cnt') ? document.getElementById('like-cnt').textContent : '',
        cmtBox: !!document.getElementById('cmt-list'),
        cmtCount: document.querySelectorAll('.cmt-item').length,
        pageTitle: document.title,
    })`);
    const d1 = JSON.parse(p1);
    check('帖子标题渲染', d1.title === '欢迎来到冒险者酒馆', d1.title);
    check('作者渲染', d1.author === 'IllusoryActor', d1.author);
    check('内容渲染', d1.content.length > 0, d1.content);
    check('点赞/收藏按钮', d1.hasLike && d1.hasFav);
    check('评论列表渲染', d1.cmtBox && d1.cmtCount >= 0, d1.cmtCount + ' 条');
    check('页面无JS错误', errors.length === 0, errors[0] || '');
    cdp1.close();
    edge.kill();
    await sleep(1000);

    // ━━ 2. 工坊详情页 ━━
    const ws2 = await launch('http://localhost:5000/workshop/1', 9232);
    const cdp2 = await connect(ws2);
    await cdp2.send('Runtime.enable');
    await sleep(4500);
    const p2 = await evalJs(cdp2, `JSON.stringify({
        title: document.querySelector('.ws-title') ? document.querySelector('.ws-title').textContent : '',
        author: document.querySelector('.author-name') ? document.querySelector('.author-name').textContent : '',
        desc: document.querySelector('.ws-desc') ? document.querySelector('.ws-desc').textContent.slice(0, 20) : '',
        hasLike: !!document.getElementById('like-btn'),
        cmtCount: document.querySelectorAll('.cmt-item').length,
    })`);
    const d2 = JSON.parse(p2);
    check('工坊标题渲染', d2.title.indexOf('北境地图包') >= 0, d2.title);
    check('工坊作者渲染', d2.author === 'IllusoryActor', d2.author);
    check('工坊描述渲染', d2.desc.length > 0, d2.desc);
    check('工坊点赞按钮', d2.hasLike);
    cdp2.close();
    edge.kill();
    await sleep(1000);

    // ━━ 3. 用户中心收藏链接（登录后） ━━
    const ws3 = await launch('http://localhost:5000/user', 9233);
    const cdp3 = await connect(ws3);
    await cdp3.send('Runtime.enable');
    await sleep(4000);
    const login = await evalJs(cdp3, `(async () => {
        const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'FavLinkTest', email:'favlink@test.com', password:'TestPass123', confirm_password:'TestPass123'})});
        const d = await r.json();
        if (d.ok) {
            await fetch('/api/favorites', {method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({type:'post', id:2})});
            await fetch('/api/favorites', {method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({type:'workshop', id:1})});
        }
        return true;
    })()`);
    await evalJs(cdp3, `location.reload()`);
    await sleep(4500);
    const links = await evalJs(cdp3, `(() => {
        const els = document.querySelectorAll('#fav-list a');
        return Array.from(els).map(a => a.getAttribute('href')).join(',');
    })()`);
    check('收藏链接为详情页', links.indexOf('/post/2') >= 0 && links.indexOf('/workshop/1') >= 0, links);
    // 点击第一个收藏项 → 应跳转 /post/2
    const nav = await evalJs(cdp3, `(async () => {
        const a = document.querySelector('#fav-list a[href="/post/2"]');
        if (!a) return 'no-link';
        a.click();
        await new Promise(r => setTimeout(r, 2500));
        return location.pathname;
    })()`);
    check('点击收藏跳转帖子详情', nav === '/post/2', nav);
    const title = await evalJs(cdp3, `document.querySelector('.post-title') ? document.querySelector('.post-title').textContent : ''`);
    check('跳转后详情渲染', title === '欢迎来到冒险者酒馆', title);
    cdp3.close();
    edge.kill();

    console.log('\n═══ ' + (fails ? `失败 ${fails} 项 ❌` : '全部通过 ✅') + ' ═══');
    process.exit(fails ? 1 : 0);
})().catch(e => {
    console.error('异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
