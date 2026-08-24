// 事件系统管理页 API 测试:发布历史/撤回/置顶/权限
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

let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log('[✅]', label); }
    else { fail++; console.log('[❌]', label, '|', JSON.stringify(detail).slice(0, 200)); }
}

// 1. DM 注册并发布事件
await api('/api/room/join', { name: '测试DM', role: 'DM' });
await api('/api/room/join', { name: '玩家A', role: 'PL' });
const pub1 = await api('/api/dm/event-publish', { name: '测试DM', title: '遭遇伏击', content: '道路两侧冲出三名匪徒！' });
check('DM 发布事件成功', pub1.ok && pub1.event && pub1.event.id === 1, pub1);

// 2. 发布历史
const hist1 = await apiGet('/api/dm/published-events?name=测试DM');
check('发布历史含 1 条且未撤回', hist1.ok && hist1.events.length === 1 && !hist1.events[0].recalled_at, hist1);

// 3. PL 轮询收到事件
const notif1 = await apiGet('/api/events/notifications?name=玩家A&since=0');
check('PL 轮询收到新事件', notif1.ok && notif1.events.some(e => e.title === '遭遇伏击' && !e._is_pinned), notif1);

// 4. PL 无权查看发布历史/撤回/置顶
const plHist = await apiGet('/api/dm/published-events?name=玩家A');
check('PL 查看发布历史被拒', !plHist.ok, plHist);
const plRecall = await api('/api/dm/events/1/recall', { name: '玩家A' });
check('PL 撤回被拒', !plRecall.ok, plRecall);

// 5. 置顶
const pin1 = await api('/api/dm/events/1/pin', { name: '测试DM', pinned: true });
check('DM 置顶成功', pin1.ok && pin1.pinned === true, pin1);
const notif2 = await apiGet('/api/events/notifications?name=玩家A&since=9999999999');
check('置顶后轮询收到置顶公告(_is_pinned)', notif2.ok && notif2.events.some(e => e._is_pinned && e.title === '遭遇伏击'), notif2);

// 6. 撤回
const recall1 = await api('/api/dm/events/1/recall', { name: '测试DM' });
check('DM 撤回成功', recall1.ok, recall1);
const notif3 = await apiGet('/api/events/notifications?name=玩家A&since=0');
check('撤回后轮询不再收到该事件', notif3.ok && !notif3.events.some(e => e.title === '遭遇伏击'), notif3);
const recall2 = await api('/api/dm/events/1/recall', { name: '测试DM' });
check('重复撤回被拒', !recall2.ok, recall2);
const pinAfter = await api('/api/dm/events/1/pin', { name: '测试DM', pinned: true });
check('撤回后置顶被拒', !pinAfter.ok, pinAfter);

// 7. 聊天室消息标记撤回
const chat = await apiGet('/api/chat/messages');
const evtMsg = chat.messages.find(m => m.event_id === 1);
check('聊天室事件消息已标记撤回', evtMsg && evtMsg._recalled === true, evtMsg);

// 8. 发布历史显示已撤回
const hist2 = await apiGet('/api/dm/published-events?name=测试DM');
check('发布历史显示已撤回+取消置顶', hist2.ok && hist2.events[0].recalled_at && hist2.events[0].pinned === false, hist2);

// 9. 取消置顶流程（新事件置顶再取消）
const pub2 = await api('/api/dm/event-publish', { name: '测试DM', title: '风雪将至', content: '天空开始飘落大雪' });
const pid2 = pub2.event.id;
await api('/api/dm/events/' + pid2 + '/pin', { name: '测试DM', pinned: true });
const pinOut = await api('/api/dm/events/' + pid2 + '/pin', { name: '测试DM', pinned: false });
check('取消置顶成功', pinOut.ok && pinOut.pinned === false, pinOut);
const notif4 = await apiGet('/api/events/notifications?name=玩家A&since=0');
check('取消置顶后不再作为公告返回', notif4.ok && !notif4.events.some(e => e._is_pinned && e.title === '风雪将至'), notif4);
// 取消置顶后普通新事件仍可正常收到
const notif5 = await apiGet('/api/events/notifications?name=玩家A&since=0');
check('未撤回事件仍可收到', notif5.ok && notif5.events.some(e => e.title === '风雪将至' && !e._is_pinned && !e.recalled), notif5);

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
