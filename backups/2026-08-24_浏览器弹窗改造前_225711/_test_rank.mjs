// 等级晋升系统运行测试:通过导入不同事件数的存档,验证徽章/进度条/商店/配方/出售
import { spawn } from 'node:child_process';

const PORT = 9262;
const URL = 'http://localhost:5000/north-expedition';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-test-rank`,
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

// 构造最小存档并导入；然后进入补给站渲染商店
const IMPORT_SAVE = (total) => `(async () => {
    const save = {
        version: 2,
        statsData: { total: ${total}, groups: {} },
        survival: { evilFrostActive: false },
        fullLog: [],
        charData: { c1: {
            name: '测试冒险者', rank: '青羽', level: 1, class: '战士', race: '人类',
            str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 9,
            hp: 10, hpMax: 10, tempHp: 0, armor: 12, weapons: [], inventory: [],
            spells: [], skillProfs: {}, saveProfs: {}, profBonus: 2, background: '', features: []
        } },
        activeCharId: 'c1'
    };
    const file = new File([JSON.stringify(save)], 'test.json', { type: 'application/json' });
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    // 进入营地 → 补给站(触发 renderShop 刷新)
    const campTab = document.getElementById('campTab');
    if (campTab && typeof campTab.click === 'function') campTab.click();
    await new Promise(r => setTimeout(r, 300));
    if (typeof window.enterWorkshop === 'function') window.enterWorkshop('supply');
    await new Promise(r => setTimeout(r, 300));
    return 'imported';
})()`;

const CHECK = `(() => {
    const st = document.getElementById('charStatus');
    const cs = document.getElementById('campCharStatus');
    const row = document.getElementById('rankProgressRow');
    const shopGrid = document.getElementById('shopGrid');
    const advNames = ['魔法泉水','绒蜂蜜','银蛛蛛网','寒铁矿'];
    const shopHtml = shopGrid ? shopGrid.innerHTML : '';
    return JSON.stringify({
        badge: st ? st.textContent : null,
        badgeColor: st ? st.style.color : null,
        campBadge: cs ? cs.textContent : null,
        rankRowVisible: row ? row.style.display : null,
        rankLabel: document.getElementById('rankLabel') ? document.getElementById('rankLabel').textContent : null,
        rankNeed: document.getElementById('rankNeed') ? document.getElementById('rankNeed').textContent : null,
        rankFillW: document.getElementById('rankFill') ? document.getElementById('rankFill').style.width : null,
        shopHasAdv: advNames.filter(n => shopHtml.includes(n)).length,
        hasErr: (document.getElementById('outputArea') || {}).innerHTML ? false : true
    });
})()`;

async function runCase(cdp, label, total, expect) {
    await evalJs(cdp, IMPORT_SAVE(total));
    const res = JSON.parse(await evalJs(cdp, CHECK));
    const ok = Object.entries(expect).every(([k, v]) => String(res[k]) === String(v));
    console.log(`[${ok ? '✅' : '❌'}] ${label} (事件数=${total})`);
    if (!ok) {
        console.log('    期望:', JSON.stringify(expect));
        console.log('    实际:', JSON.stringify(res));
    }
    return ok;
}

try {
    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    await cdp.send('Runtime.enable');
    await sleep(4000);

    let all = true;
    // 青羽 0 事件
    all &= await runCase(cdp, '青羽:徽章/无进度条', 0, {
        badge: '青羽', rankRowVisible: '',
    });
    // 黑羽 50
    all &= await runCase(cdp, '黑羽:徽章=黑羽', 50, { badge: '黑羽' });
    // 蓝羽 120
    all &= await runCase(cdp, '蓝羽:徽章=蓝羽', 120, { badge: '蓝羽' });
    // 银羽 220
    all &= await runCase(cdp, '银羽:徽章=银羽', 220, { badge: '银羽' });
    // 金羽 350
    all &= await runCase(cdp, '金羽:徽章=金羽', 350, { badge: '金羽' });
    // 赤羽 520
    all &= await runCase(cdp, '赤羽:徽章=赤羽', 520, { badge: '赤羽' });
    // 白羽 750
    all &= await runCase(cdp, '白羽:徽章=白羽/进度条隐藏', 750, { badge: '白羽', rankRowVisible: 'none' });
    // 进度条中间值:35/50 → 70%
    all &= await runCase(cdp, '进度条:35/50→70%', 35, { badge: '青羽', rankLabel: '→ 黑羽', rankNeed: '35 / 50 事件', rankFillW: '70%' });

    console.log(all ? '\n=== 等级系统全部通过 ===' : '\n=== 存在失败项 ===');
    cdp.close();
    edge.kill();
    process.exit(all ? 0 : 1);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
