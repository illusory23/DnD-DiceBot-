// 登录态验证: 用户中心头像UI + 首页横幅 + 历史公告页
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:5000';
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
    // ━━ 1. 用户中心页(未登录) ━━
    const ws1 = await launch(BASE + '/user', 9215);
    const cdp1 = await connect(ws1);
    await cdp1.send('Runtime.enable');
    await sleep(4000);
    const v1 = await evalJs(cdp1, `typeof renderAvatar === 'function' && typeof uploadAvatar === 'function' && typeof deleteAvatar === 'function'`);
    check('user.html 头像函数齐全', v1);
    cdp1.close();
    edge.kill();
    await sleep(1000);

    // ━━ 2. 首页: 登录后侧栏头像 + 公告横幅 ━━
    const ws2 = await launch(BASE + '/', 9216);
    const cdp2 = await connect(ws2);
    await cdp2.send('Runtime.enable');
    await sleep(4000);
    const login = await evalJs(cdp2, `(async () => {
        const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'AvatarTest0815', password:'TestPass123'})});
        return (await r.json()).ok;
    })()`);
    check('测试账号登录', login);
    await evalJs(cdp2, `location.reload()`);
    await sleep(4500);
    const v2 = await evalJs(cdp2, `(() => {
        const sb = document.getElementById('side-user');
        const ha = document.getElementById('header-actions');
        const html = document.body.innerHTML;
        return {
                 side: sb ? (sb.querySelector('img[src*="avatars"]') ? '有头像img' : '侧栏无头像img') : '无侧栏',
                 sideName: sb ? (sb.textContent || '').slice(0, 30) : '',
                 header: ha ? (ha.querySelector('img[src*="avatars"]') ? '有头像img' : '头部无头像img') : '无头部',
                 banner: html.indexOf('验证测试公告') >= 0 ? '横幅显示' : '无横幅',
                 link: html.indexOf('查看全部公告') >= 0 ? '有全部链接' : '无链接' };
    })()`);
    check('侧栏头像显示', v2.side === '有头像img', v2.side + ' | 侧栏文本: ' + v2.sideName);
    check('头部头像显示', v2.header === '有头像img', v2.header);
    check('公告横幅显示', v2.banner === '横幅显示', v2.banner);
    check('横幅含全部公告链接', v2.link === '有全部链接', v2.link);
    cdp2.close();
    edge.kill();
    await sleep(1000);

    // ━━ 3. 历史公告页显示测试公告 ━━
    const ws3 = await launch(BASE + '/announcements', 9217);
    const cdp3 = await connect(ws3);
    await cdp3.send('Runtime.enable');
    await sleep(4000);
    const v3 = await evalJs(cdp3, `(() => {
        var cards = document.querySelectorAll('.ann-card');
        return { count: cards.length, title: cards[0] ? cards[0].querySelector('.ann-title').textContent : '' };
    })()`);
    check('历史公告页显示公告', v3.count >= 1 && v3.title === '验证测试公告', JSON.stringify(v3));
    cdp3.close();
    edge.kill();

    console.log('\n═══ ' + (fails ? `失败 ${fails} 项 ❌` : '全部通过 ✅') + ' ═══');
    process.exit(fails ? 1 : 0);
})().catch(e => {
    console.error('异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
