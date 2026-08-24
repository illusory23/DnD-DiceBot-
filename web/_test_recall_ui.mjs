// 撤回后聊天室事件消息完全不可见:发布→玩家看到→撤回→消息自动消失(不刷新)+刷新后仍不可见
import { spawn } from 'node:child_process';

const PORT = 9269;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5000';

async function api(path, body) {
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    return r.json();
}
async function apiGet(path) {
    const r = await fetch(BASE + path);
    return r.json();
}

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-test-recall`,
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
        ws.onopen = () => resolve({
            send(method, params = {}) {
                return new Promise((res, rej) => {
                    const mid = ++id;
                    pending.set(mid, { res, rej });
                    ws.send(JSON.stringify({ id: mid, method, params }));
                });
            },
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
async function waitFor(cdp, expr, label, timeout = 20000) {
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
    // 准备:DM/玩家加入,发布事件
    await api('/api/room/join', { name: '测试DM', role: 'DM' });
    await api('/api/room/join', { name: '玩家A', role: 'PL' });
    const pub = await api('/api/dm/event-publish', { name: '测试DM', title: '撤销测试事件', content: '这条消息将被撤回' });
    console.log('准备:已发布事件 id=' + pub.event.id);

    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await sleep(1000);

    // 玩家进入聊天页
    await evalJs(cdp, `location.href='${BASE}/chat'`);
    await sleep(3000);
    await evalJs(cdp, `sessionStorage.setItem('dnd_joined_room', JSON.stringify({name:'玩家A', role:'PL', color:'#4dc9f6'})); location.reload();`);



    const dbg = await evalJs(cdp, `(async () => {
        const s = JSON.parse(sessionStorage.getItem('dnd_joined_room') || 'null');
        const r = await fetch('/api/chat/messages');
        const d = await r.json();
        return JSON.stringify({
            session: s ? s.name : null,
            panelOpen: document.getElementById('chat-panel') ? document.getElementById('chat-panel').classList.contains('open') : false,
            msgs: d.ok ? d.messages.length : -1,
            hasEvt: d.ok ? d.messages.some(m => m.event_id === 3) : false,
            chatMsgsHtml: document.getElementById('chat-msgs') ? document.getElementById('chat-msgs').children.length : -1
        });
    })()`);
    console.log('dice3d 状态:', dbg);
    await waitFor(cdp, `document.querySelector('#chat-msgs [data-event-id="${pub.event.id}"]') !== null`, '玩家看到事件消息');
    check('玩家聊天界面显示事件消息', true);

    // DM 撤回
    const recall = await api('/api/dm/events/' + pub.event.id + '/recall', { name: '测试DM' });
    check('DM 撤回成功', recall.ok, recall);

    // 玩家聊天界面的事件消息应自动消失(不刷新)
    await waitFor(cdp, `document.querySelector('#chat-msgs [data-event-id="${pub.event.id}"]') === null`, '事件消息自动消失');
    check('撤回后消息自动从界面消失(无需刷新)', true);

    // 检查界面文本也不含被撤回事件的内容
    const txt = await evalJs(cdp, `document.getElementById('chat-msgs') ? document.getElementById('chat-msgs').textContent : 'no-msgs'`);
    check('界面文本不含被撤回的事件', !txt.includes('这条消息将被撤回'), txt.slice(-200));

    // 刷新后仍不可见
    await evalJs(cdp, `location.reload()`);
    await sleep(4000);
    const txt2 = await evalJs(cdp, `document.getElementById('chat-msgs') ? document.getElementById('chat-msgs').textContent : 'no-msgs'`);
    check('刷新后消息仍不可见', !txt2.includes('撤销测试事件'), txt2.slice(-200));

    // API 层:消息列表仍含该消息(带 _recalled 标记,前端负责隐藏)
    const msgs = await apiGet('/api/chat/messages');
    const evtMsg = msgs.messages.find(m => m.event_id === pub.event.id);
    check('后端消息标记 _recalled(数据保留)', evtMsg && evtMsg._recalled === true, evtMsg);

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
    cdp.close();
    edge.kill();
    process.exit(fail ? 1 : 0);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
