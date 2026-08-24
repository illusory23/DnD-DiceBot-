// 验证头像布局修复: 用户中心头像不遮挡信息 + 首页 _avatarHTML 无占位残留
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
    // ━━ 1. 用户中心: 上传头像后布局 ━━
    const ws1 = await launch('http://localhost:5000/user', 9221);
    const cdp1 = await connect(ws1);
    await cdp1.send('Runtime.enable');
    await sleep(4000);
    // 登录
    const login = await evalJs(cdp1, `(async () => {
        const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'AvatarFixTest', password:'TestPass123'})});
        return (await r.json()).ok;
    })()`);
    check('测试账号登录', login);
    await evalJs(cdp1, `location.reload()`);
    await sleep(4500);

    // 真实 UI 流程: 构造 File → 触发 input change → 打开裁剪弹窗 → 确认上传
    const up = await evalJs(cdp1, `(async () => {
        const png = atob('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAPG4Ev+JzL9wAAAAAElFTkSuQmCC');
        const buf = new Uint8Array(png.length);
        for (let i = 0; i < png.length; i++) buf[i] = png.charCodeAt(i);
        const file = new File([buf], 't.png', {type: 'image/png'});
        const input = document.getElementById('avatar-file');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', {bubbles: true}));
        return true;
    })()`);
    check('选择图片触发裁剪弹窗', up);
    await sleep(1500);
    const cropOpen = await evalJs(cdp1, `document.getElementById('crop-modal').classList.contains('show')`);
    check('裁剪弹窗已打开', cropOpen);
    const cropReady = await evalJs(cdp1, `!!_crop && !!_crop.img && _crop.img.naturalWidth > 0`);
    check('裁剪图片已加载', cropReady);
    // 函数存在性诊断
    const fnCheck = await evalJs(cdp1, `JSON.stringify({
        confirmCrop: typeof confirmCrop,
        uploadAvatar: typeof uploadAvatar,
        currentUser: typeof _currentUser,
        windowCurrentUser: typeof window._currentUser,
    })`);
    console.log('  · 函数诊断:', fnCheck);
    // 确认上传（裁剪导出 PNG）
    const cropRes = await evalJs(cdp1, `(() => { try { confirmCrop(); return 'ok'; } catch(e) { return 'err:' + e.message; } })()`);
    console.log('  · confirmCrop:', cropRes);
    await sleep(2500);
    const upOk = await evalJs(cdp1, `(window._currentUser && window._currentUser.avatar_url) || ''`);
    check('裁剪后头像上传成功', !!upOk, upOk);
    await sleep(500);
    // 布局检查: 头像容器高度 + img 显示 + 下方信息不被遮挡
    const layout = await evalJs(cdp1, `(() => {
        const wrap = document.querySelector('.card .card-body .card-body, .card .card-body');
        const holder = document.getElementById('avatar-holder');
        const img = document.getElementById('info-avatar');
        const grid = document.querySelector('.info-grid');
        const avatarWrap = holder ? holder.parentElement : null;
        return {
            imgDisplay: img ? getComputedStyle(img).display : 'no-img',
            holderDisplay: holder ? getComputedStyle(holder).display : 'no-holder',
            avatarWrapH: avatarWrap ? avatarWrap.getBoundingClientRect().height : -1,
            imgH: img ? img.getBoundingClientRect().height : -1,
            gridTop: grid ? grid.getBoundingClientRect().top : -1,
            avatarBottom: avatarWrap ? avatarWrap.getBoundingClientRect().bottom : -1,
            overlap: (avatarWrap && grid) ? (avatarWrap.getBoundingClientRect().bottom > grid.getBoundingClientRect().top) : null,
        };
    })()`);
    check('头像img显示', layout.imgDisplay === 'block', layout.imgDisplay);
    check('占位holder隐藏', layout.holderDisplay === 'none', layout.holderDisplay);
    check('头像容器高度≈84px', layout.avatarWrapH >= 80 && layout.avatarWrapH <= 90, '高 ' + layout.avatarWrapH);
    check('头像不遮挡下方信息', layout.overlap === false,
        `头像底 ${layout.avatarBottom} vs 信息区顶 ${layout.gridTop}`);
    cdp1.close();
    edge.kill();
    await sleep(1000);

    // ━━ 2. 首页: _avatarHTML 头像加载后占位已移除 ━━
    const ws2 = await launch('http://localhost:5000/', 9222);
    const cdp2 = await connect(ws2);
    await cdp2.send('Runtime.enable');
    await sleep(4000);
    await evalJs(cdp2, `(async () => {
        const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'AvatarFixTest', password:'TestPass123'})});
        await r.json();
        location.reload();
    })()`);
    await sleep(4500);
    const side = await evalJs(cdp2, `(() => {
        const img = document.querySelector('#side-user img[src*="avatars"]');
        if (!img) return {found:false};
        const sibling = img.nextElementSibling;
        return {found:true, nextIsPlaceholder: sibling ? (sibling.textContent.indexOf('⚔️') >= 0) : false};
    })()`);
    check('侧栏头像加载', side.found);
    check('头像旁无占位残留', !side.nextIsPlaceholder, side.nextIsPlaceholder ? '占位仍在' : '占位已移除');
    cdp2.close();
    edge.kill();

    console.log('\n═══ ' + (fails ? `失败 ${fails} 项 ❌` : '全部通过 ✅') + ' ═══');
    process.exit(fails ? 1 : 0);
})().catch(e => {
    console.error('异常:', e.message);
    if (edge) edge.kill();
    process.exit(2);
});
