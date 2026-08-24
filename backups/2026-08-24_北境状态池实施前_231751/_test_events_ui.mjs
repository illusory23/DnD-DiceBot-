// 事件管理页前端 UI 测试:DM 管理弹窗(撤回/置顶按钮) + 玩家置顶公告弹窗
import { spawn } from 'node:child_process';

const PORT = 9265;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5000';

async function api(path, body) {
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    return r.json();
}

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-test-events-ui`,
    'about:blank',
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
        const lis = [];
        ws.onopen = () => resolve({
            send(method, params = {}) {
                return new Promise((res, rej) => {
                    const mid = ++id;
                    pending.set(mid, { res, rej });
                    ws.send(JSON.stringify({ id: mid, method, params }));
                });
            },
            onEvent(cb) { lis.push(cb); },
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
                lis.forEach(cb => cb(msg));
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
// 导航并等待条件满足(轮询,带超时)
async function waitFor(cdp, expr, label, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const v = await evalJs(cdp, expr);
        if (v) return v;
        await sleep(500);
    }
    throw new Error('等待超时: ' + label);
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('[✅]', label); }
    else { fail++; console.log('[❌]', label, '|', detail ? JSON.stringify(detail).slice(0, 200) : ''); }
}

try {
    // 准备:DM 加入 + 发布并置顶事件
    await api('/api/room/join', { name: '测试DM', role: 'DM' });
    await api('/api/room/join', { name: '玩家A', role: 'PL' });
    const pub = await api('/api/dm/event-publish', { name: '测试DM', title: '风雪将至', content: '天空开始飘落大雪' });
    await api('/api/dm/events/' + pub.event.id + '/pin', { name: '测试DM', pinned: true });
    console.log('准备:已发布并置顶事件 id=' + pub.event.id);

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
    await cdp.send('Log.enable');
    await sleep(1000);

    // ── DM 视角:管理弹窗 ──
    await evalJs(cdp, `location.href='${BASE}/chat'`);
    await sleep(3000);
    await evalJs(cdp, `sessionStorage.setItem('dnd_joined_room', JSON.stringify({name:'测试DM', role:'DM', color:'#ffd700'})); location.reload();`);
    // 等待 DM 按钮出现(会话恢复 + dm-status 判定)
    await waitFor(cdp, `!!document.getElementById('dm-event-list-btn') && document.getElementById('dm-event-list-btn').style.display !== 'none'`, 'DM按钮出现');
    await evalJs(cdp, `document.getElementById('dm-event-list-btn').click()`);
    await waitFor(cdp, `(document.getElementById('event-list-body')||{}).textContent && document.getElementById('event-list-body').textContent.includes('已发布事件')`, '管理弹窗渲染');
    const dmModal = await evalJs(cdp, `document.getElementById('event-list-body').textContent`);
    check('DM 管理弹窗显示"已发布事件"分区', dmModal.includes('已发布事件'));
    check('弹窗显示置顶中状态', dmModal.includes('置顶中') && dmModal.includes('📌'));
    check('弹窗含撤回按钮', dmModal.includes('撤回'));
    check('弹窗含取消置顶按钮', dmModal.includes('取消置顶'));
    check('弹窗含"保存的事件"分区', dmModal.includes('保存的事件'));
    check('发布历史显示时间', /🕐 \d{4}-\d{2}-\d{2}/.test(dmModal));

    // ── 玩家视角:置顶公告弹窗 ──
    // 使用跑团页面 /map(含 event-popup.js;官网首页 portal/index.html 不含弹窗脚本)
    await evalJs(cdp, `location.href='${BASE}/map'`);
    await sleep(3500);
    await evalJs(cdp, `sessionStorage.setItem('dnd_joined_room', JSON.stringify({name:'玩家A', role:'PL', color:'#4dc9f6'})); 'set';`);
    // 等待置顶公告弹窗(玩家A在线心跳需先注册;页面 reload 会触发 leave,期间周期性保活)
    const keepAlive = setInterval(() => { api('/api/room/heartbeat', { name: '玩家A' }).catch(() => {}); }, 2500);
    await sleep(5000);
    const dbgState = await evalJs(cdp, `JSON.stringify({
        path: location.pathname,
        session: (JSON.parse(sessionStorage.getItem('dnd_joined_room') || 'null') || {}).name || null,
        keyframes: !!document.getElementById('event-popup-keyframes')
    })`);
    console.log('玩家页状态:', dbgState);
    await waitFor(cdp, `document.querySelectorAll('.event-popup-card').length > 0`, '置顶公告弹窗');
    const popup = await evalJs(cdp, `(() => {
        const cards = document.querySelectorAll('.event-popup-card');
        return cards[cards.length - 1].textContent;
    })()`);
    check('玩家收到置顶公告弹窗', popup.includes('📌 置顶事件'), popup.slice(0, 200));
    check('弹窗可关闭(有知道了按钮)', popup.includes('知道了'));

    // 关闭弹窗后不重复弹
    await evalJs(cdp, `(() => {
        const btns = document.querySelectorAll('.event-popup-card button');
        if (btns.length) btns[btns.length - 1].click();
    })()`);
    await sleep(1000);
    const dismissed = await evalJs(cdp, `JSON.parse(sessionStorage.getItem('dnd_dismissed_pins') || '{}')`);
    check('关闭后记录已读(不再重复弹)', dismissed && Object.keys(dismissed).length > 0, dismissed);
    await sleep(4500);
    const popupCount = await evalJs(cdp, `document.querySelectorAll('.event-popup-card').length`);
    check('已读置顶不重复弹', popupCount === 0, popupCount);

    // ── DM 撤回后,玩家不再收到 ──
    clearInterval(keepAlive);
    await api('/api/dm/events/' + pub.event.id + '/recall', { name: '测试DM' });
    await api('/api/room/heartbeat', { name: '玩家A' });
    await sleep(4500);
    const popupCount2 = await evalJs(cdp, `document.querySelectorAll('.event-popup-card').length`);
    check('撤回后无新弹窗', popupCount2 === 0, popupCount2);

    // 页面无 JS 错误(排除 401 资源类)
    const realErrs = errs.filter(e => !e.includes('401'));
    check('页面无 JS 运行错误', realErrs.length === 0, realErrs);

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
    cdp.close();
    edge.kill();
    process.exit(fail ? 1 : 0);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
