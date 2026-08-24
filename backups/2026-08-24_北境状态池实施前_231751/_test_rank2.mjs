// 等级系统补充测试:特殊配方(银羽)/白羽全配方/严寒豁免加成
import { spawn } from 'node:child_process';

const PORT = 9263;
const URL = 'http://localhost:5000/north-expedition';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\edge-test-rank2`,
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

const IMPORT_SAVE = (total, extra) => `(async () => {
    const save = {
        version: 2,
        statsData: { total: ${total}, groups: {} },
        survival: Object.assign({ evilFrostActive: false }, ${JSON.stringify(extra || {})}),
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
    // 切到探索视图(事件卡片在探索页)
    const exploreTab = document.getElementById('exploreTab');
    if (exploreTab && typeof exploreTab.click === 'function') exploreTab.click();
    await new Promise(r => setTimeout(r, 300));
    return 'imported';
})()`;

// 进入工作间查看配方
const OPEN_CRAFT = `(async () => {
    const campTab = document.getElementById('campTab');
    if (campTab && typeof campTab.click === 'function') campTab.click();
    await new Promise(r => setTimeout(r, 300));
    if (typeof window.enterWorkshop === 'function') window.enterWorkshop('craft');
    await new Promise(r => setTimeout(r, 400));
    const list = document.getElementById('craftRecipeList');
    return list ? list.innerHTML : 'no-list';
})()`;

// 触发一次探索事件(严寒检定需要 eventsSinceCold=2)
const CLICK_EVENT = `(async () => {
    const card = document.querySelector('.event-card[data-cmd="ts100"]');
    if (!card) return 'no-card';
    card.click();
    await new Promise(r => setTimeout(r, 2000));
    const out = document.getElementById('outputArea');
    return out ? out.textContent : 'no-out';
})()`;

async function runCheck(cdp, label, fn, expectIn, expectNotIn) {
    const res = await fn();
    const ok = (!expectIn || res.includes(expectIn)) && (!expectNotIn || !res.includes(expectNotIn));
    console.log(`[${ok ? '✅' : '❌'}] ${label}`);
    if (!ok) console.log('    期望含:', expectIn, '| 期望不含:', expectNotIn, '\n    实际(前300字):', res.slice(0, 300));
    return ok;
}

try {
    const wsUrl = await getWsUrl();
    const cdp = await connect(wsUrl);
    await cdp.send('Runtime.enable');
    await sleep(4000);

    let all = true;

    // 1. 青羽:无特殊配方
    await evalJs(cdp, IMPORT_SAVE(0));
    all &= await runCheck(cdp, '青羽:配方无"秘方"', () => evalJs(cdp, OPEN_CRAFT), null, '秘方');

    // 2. 银羽:特殊配方出现
    await evalJs(cdp, IMPORT_SAVE(220));
    all &= await runCheck(cdp, '银羽:配方含"秘方"(特殊配方解锁)', () => evalJs(cdp, OPEN_CRAFT), '驱寒药膏·秘方');

    // 3. 白羽:未发现配方也全部显示(基础4+秘方3=7条)
    await evalJs(cdp, IMPORT_SAVE(750));
    const craftHtml = await evalJs(cdp, OPEN_CRAFT);
    const count = (craftHtml.match(/ws-recipe-item/g) || []).length;
    const ok3 = craftHtml.includes('驱寒药膏·秘方') && craftHtml.includes('绒蜂蜜·秘方') && count === 7;
    console.log(`[${ok3 ? '✅' : '❌'}] 白羽:全部配方解锁(${count}条,期望7)`);
    if (!ok3) console.log('    实际:', craftHtml.slice(0, 300));
    all &= ok3;

    // 4. 严寒豁免加成:白羽(coldSave=2) + eventsSinceCold=2 → 检定消息含"等级+2"
    await evalJs(cdp, IMPORT_SAVE(750, { eventsSinceCold: 2 }));
    const outText = await evalJs(cdp, CLICK_EVENT);
    const ok4 = outText.includes('等级+2');
    console.log(`[${ok4 ? '✅' : '❌'}] 白羽:严寒检定含等级+2加成`);
    if (!ok4) console.log('    输出(前400字):', outText.slice(0, 400));
    all &= ok4;

    // 5. 青羽:无严寒豁免加成
    await evalJs(cdp, IMPORT_SAVE(0, { eventsSinceCold: 2 }));
    const outText2 = await evalJs(cdp, CLICK_EVENT);
    const ok5 = !outText2.includes('等级+');
    console.log(`[${ok5 ? '✅' : '❌'}] 青羽:严寒检定无等级加成`);
    if (!ok5) console.log('    输出(前400字):', outText2.slice(0, 400));
    all &= ok5;

    console.log(all ? '\n=== 补充测试全部通过 ===' : '\n=== 存在失败项 ===');
    cdp.close();
    edge.kill();
    process.exit(all ? 0 : 1);
} catch (e) {
    console.error('测试失败:', e.message);
    edge.kill();
    process.exit(1);
}
