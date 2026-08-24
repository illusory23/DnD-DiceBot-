// 测量骰子在画面中的像素占比
const CDP_PORT = 9260;

async function getWsUrl() {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    const list = await res.json();
    const page = list.find(t => t.type === 'page' && t.url.includes('north-expedition'));
    return page.webSocketDebuggerUrl;
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evalJs(cdp, expression, awaitPromise = false) {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result ? r.result.value : undefined;
}

// 浏览器端分析 canvas 亮像素占比（骰子为白色，背景深色）
const ANALYZE = `(() => {
    const stage = document.getElementById('dice-stage');
    const cv = stage.querySelector('canvas');
    if (!cv) return JSON.stringify({ err: 'no canvas' });
    const tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(cv, 0, 0);
    const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let bright = 0, brightish = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        if (r > 220 && g > 220 && b > 220) bright++;
        else if (r > 150 && g > 150 && b > 150) brightish++;
    }
    const total = tmp.width * tmp.height;
    return JSON.stringify({
        w: tmp.width, h: tmp.height,
        brightRatio: +(bright / total).toFixed(4),
        brightishRatio: +((bright + brightish) / total).toFixed(4),
        brightPct: +(bright / total * 100).toFixed(2)
    });
})()`;

async function measure(cdp) {
    return evalJs(cdp, ANALYZE);
}

async function main() {
    const cdp = await connect(await getWsUrl());
    await cdp.send('Runtime.enable');

    for (let i = 0; i < 30; i++) { await sleep(1000); if (await evalJs(cdp, 'window._diceReady === true')) break; }
    console.log('ready:', await evalJs(cdp, 'window._diceReady'));
    const diag = await evalJs(cdp, `JSON.stringify({
        canvases: document.querySelectorAll('canvas').length,
        stageChildren: document.getElementById('dice-stage') ? document.getElementById('dice-stage').innerHTML.slice(0, 200) : 'NO_STAGE',
        webgl: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch(e) { return false; } })()
    })`);
    console.log('diag:', diag);

    // 显示界面并掷骰（headless 物理卡住，骰子停在初始位置附近）
    await evalJs(cdp, `window.__m = window.roll3DDice('1d20'); 's'`);
    await sleep(800);
    await evalJs(cdp, `document.getElementById('dice3d-roll-btn').click(); 'r'`);

    // 掷出后 1.2s 和 2.5s 各测一次
    await sleep(1200);
    console.log('t+1.2s:', await measure(cdp));
    await sleep(1300);
    console.log('t+2.5s:', await measure(cdp));
    await sleep(1300);
    console.log('t+3.8s:', await measure(cdp));

    // 关闭
    await evalJs(cdp, `document.getElementById('dice3d-cancel-btn').click(); 'c'`);
    await sleep(300);
    await evalJs(cdp, 'window.__m', true);
    cdp.close();
    console.log('PIXEL TEST DONE');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
