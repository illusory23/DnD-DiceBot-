// 2026-08-31 掷骰页三 Tab 对象选择验证（node test_dice3d_obj.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}

const html = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/templates/dice3d-e.html', 'utf8');

console.log('══ 1. 结构断言 ══');
ok('掷骰 Tab 新增对象选择器（roll-char-select）', html.includes('id="roll-char-select"'), '缺 select');
ok('掷骰选择器默认"👤 无对象"', /roll-char-select[^>]*>[\s\S]*?<option value="">👤 无对象<\/option>/.test(html));
ok('setRollChar 函数存在（onchange 绑定）', html.includes('onchange="setRollChar()"') && html.includes('window.setRollChar='));
ok('roll-char-badge 徽章存在', html.includes('id="roll-char-badge"'));
ok('_localRollChar 独立状态变量', html.includes('var _localRollChar=null;'));
ok('检定/豁免选择器仍存在', html.includes('id="active-char-select"') && html.includes('id="save-char-select"'));
ok('公共加载函数 loadCharsInto', html.includes('async function loadCharsInto(selId)'));
ok('三个选择器同源加载（loadCharSelect/loadSaveChars/loadRollChars）', html.includes('async function loadCharSelect(){return loadCharsInto') && html.includes('async function loadSaveChars(){return loadCharsInto') && html.includes('window.loadRollChars=function(){return loadCharsInto'));
ok('页面加载时三选择器统一加载', html.includes('loadCharSelect();loadSaveChars();loadRollChars();'));
ok('加入房间后三选择器统一刷新', (html.match(/loadCharSelect\(\);loadSaveChars\(\);loadRollChars\(\);/g) || []).length >= 2);
ok('switchTab 不再重载豁免选择器（切 Tab 不重置选择）', !/tab==='save'\)loadSaveChars\(\);/.test(html));
ok('doRoll 计算对象主体（角色名/玩家名）', html.includes('var subject=(_localRollChar&&_localRollChar.name)?_localRollChar.name:name;'));
ok('broadcastRoll 带 subject 参数', html.includes('function broadcastRoll(apiResult,expr,detNotation,subject)'));
ok('broadcastRoll WS roller 保持玩家名（发送者）', /roller:name,/.test(html));
ok('broadcastRoll 聊天发送者保持玩家名、内容带主体', /name:name,text:subject\+" 🎲 "/.test(html));
ok('showResult 用 subject 显示主体', html.includes('showResult(data,subject)'));
ok('统计仍按玩家名（recordDiceStats(name,...)）', /recordDiceStats\(name,data\.rolls/.test(html));
ok('检定/豁免 WS roller 保持玩家名', html.includes('roller:s.name'));
ok('三 Tab 选择互不干扰（三个独立变量）', html.includes('_localActiveChar') && html.includes('_localSaveChar') && html.includes('_localRollChar'));

console.log('\n══ 2. broadcastRoll 行为测试（vm 提取真实函数） ══');
// 提取 broadcastRoll 函数（其后是 recordDiceStats）
const s1 = html.indexOf('function broadcastRoll');
const s2 = html.indexOf('function recordDiceStats');
const code = html.slice(s1, s2);
const sent = [];
const sb = {
  console,
  syncWs: { readyState: 1, send(m) { sent.push(JSON.parse(m)); } },
  sessionStorage: { getItem() { return JSON.stringify({ name: '玩家甲', role: 'PL', color: '#00bcd4' }); } },
  mn: () => '玩家甲',
  pc: () => 'white',
  fetch: (u, opts) => { sb._lastFetch = { u, body: JSON.parse(opts.body) }; return Promise.resolve({ catch() {} }); },
  HIDDEN_ROLL: false,
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(code, sb);
const apiResult = { total: 12, rolls: [6, 6], is_crit_success: false, is_crit_failure: false };

sb.broadcastRoll(apiResult, '2d6', '2d6@6,6', '角色乙');
ok('选了对象 → WS roller 保持玩家名（发送者）', sent[0].roller === '玩家甲', sent[0].roller);
ok('选了对象 → 聊天发送者保持玩家名', sb._lastFetch.body.name === '玩家甲', sb._lastFetch.body.name);
ok('选了对象 → 消息内容带角色名主体', sb._lastFetch.body.text === '角色乙 🎲 2d6 = [12]', sb._lastFetch.body.text);

sent.length = 0;
sb.broadcastRoll(apiResult, '2d6', '2d6@6,6', '');
ok('未选对象（空 subject）→ WS roller 为玩家名', sent[0].roller === '玩家甲', sent[0].roller);
ok('未选对象（空 subject）→ 消息内容主体为玩家名', sb._lastFetch.body.text === '玩家甲 🎲 2d6 = [12]', sb._lastFetch.body.text);

// 暗骰不广播（前一次已留 1 条，暗骰调用不应新增）
sb.HIDDEN_ROLL = true;
sb.broadcastRoll(apiResult, '2d6', '2d6@6,6', '角色乙');
ok('暗骰模式不广播（条数保持 1）', sent.length === 1, sent.length);

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
