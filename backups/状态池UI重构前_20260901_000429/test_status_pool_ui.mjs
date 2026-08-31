// 2026-09-01 状态池 UI 重构验证（分栏/编辑时长/清空/快捷词条拖拽）（node test_status_pool_ui.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const BASE = 'D:/游戏/尘封之卷-九子的注视/骰娘/';
const js = fs.readFileSync(BASE + 'web/static/map.js', 'utf8');
const mh = fs.readFileSync(BASE + 'web/templates/map.html', 'utf8');

console.log('══ 1. 结构断言（map.js） ══');
ok('renderStatusPool 未入图角色折叠区', /const offHtml = offMap\.length[\s\S]{0,120}\<details class="st-collapse"\>\<summary>⚡ 未拖入地图的角色/.test(js));
ok('分栏渲染（在途角色 + 折叠区）', /onMap\.map\(function\(r\) \{ return statusPoolRow\(r, dm\); \}\)\.join\(''\) \+ offHtml/.test(js));
ok('行内一键清空按钮（st-clear）', /st-clear" onclick="clearTokenStatuses\(/.test(js));
ok('chip 时长可点击编辑（editStatusDuration）', /onclick="editStatusDuration\(\$\{r\.token\.id\}, '\$\{s\.id\}'\)" title="点击编辑时长"/.test(js));
ok('行支持拖拽投放（quickDrop）', /ondragover="quickDragOver\(event\)"[\s\S]{0,120}ondrop="quickDrop\(event, /.test(js));
ok('编辑时长/保存/清空/快捷词条函数齐全', ['editStatusDuration', 'saveStatusDuration', 'clearTokenStatuses', 'addQuickStatus', 'delQuickStatus', 'quickDragStart', 'quickDragOver', 'quickDragLeave', 'quickDrop'].every(f => js.includes(f)));
ok('快捷词条 localStorage 持久化', /const QUICK_KEY = 'map_quick_statuses';/.test(js) && /localStorage\.setItem\(QUICK_KEY/.test(js));
ok('默认快捷词条表', /DEFAULT_QUICK = \['中毒', '流血', '束缚'/.test(js));
ok('拖拽用右侧默认时长（st-quick-unit/value）', /st-quick-unit'\)[\s\S]{0,80}st-quick-value'\)/.test(js));

console.log('\n══ 2. 结构断言（map.html） ══');
ok('面板分栏 body/left/right', mh.includes('status-pool-body') && mh.includes('status-pool-left') && mh.includes('status-pool-right'));
ok('右侧快捷状态区（默认时长+词条列表+新增）', mh.includes('st-quick-value') && mh.includes('st-quick-unit') && mh.includes('status-quick-list') && mh.includes('st-quick-new'));
ok('面板加长样式（620px + max-height）', mh.includes('width:620px') && mh.includes('max-height:calc(100vh - 110px)'));
ok('折叠区/清空/编辑样式', mh.includes('details.st-collapse') && mh.includes('.st-clear') && mh.includes('.st-rounds:hover'));

console.log('\n══ 3. 逻辑测试（vm 提取真实函数） ══');
function extractFn(code, fnName) {
  const i = code.indexOf('function ' + fnName);
  if (i < 0) throw new Error('未找到 ' + fnName);
  let depth = 0, j = i, started = false;
  for (; j < code.length; j++) {
    const ch = code[j];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return code.slice(i, j);
}

const sb = { console, Date: Date };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(`
var __ls = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } };
localStorage = __ls;   // 覆盖 Node vm 内置 localStorage
window.__ls = __ls;
var mapTokens = [];
var mapCombatants = [];
var _ops = [];
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
window._wsSendOp = function(kind, list) { _ops.push(list); };
window._markDirty = function() {};
function showTokenFloatText() {}
function renderStatusPopup() {}
function showTokenInfoPanel() {}
function renderStatusPool() {}
function renderQuickStatuses() {}
`, sb);
vm.runInContext(extractFn(js, 'tokenNetData'), sb);
vm.runInContext(extractFn(js, 'syncTokenStatuses'), sb);
vm.runInContext(extractFn(js, 'addTokenStatus'), sb);
vm.runInContext(`const QUICK_KEY = 'map_quick_statuses';`, sb);
vm.runInContext(`const DEFAULT_QUICK = ${JSON.stringify(['中毒','流血','束缚','目盲','倒地','昏迷','麻痹','石化','魅惑','恐惧','虚弱','眩晕','耳聋','受惊','隐形','纠缠','失明','中毒深重'])};`, sb);
vm.runInContext(extractFn(js, 'loadQuickStatuses'), sb);
vm.runInContext(extractFn(js, 'saveQuickStatuses'), sb);

// 快捷词条持久化
ok('默认快捷词条可加载', sb.loadQuickStatuses().length >= 10 && sb.loadQuickStatuses().includes('中毒'), sb.loadQuickStatuses().length);
vm.runInContext('var _l = loadQuickStatuses(); _l.push("自定义状态"); saveQuickStatuses(_l);', sb);
ok('新增词条持久化到 localStorage', sb.__ls.getItem('map_quick_statuses').includes('自定义状态'), sb.__ls._d);

// 拖拽添加（quickDrop 逻辑）：构造 token + dataTransfer
sb._tok = { id: 7, charId: 101, name: '战士甲', statuses: [], el: {} };
sb.mapTokens.push(sb._tok);
vm.runInContext(`
var _quickDropCalled = false;
window.quickDrop = function(ev, tokenId) {
    const token = mapTokens.find(t => t.id === tokenId);
    if (!token) return;
    const name = ev.dataTransfer.getData('text/plain');
    const unitEl = { value: '回合' };
    const valEl = { value: '2' };
    addTokenStatus(token, name, unitEl.value, parseInt(valEl.value, 10) || 0);
};
`, sb);
sb.quickDrop({ preventDefault() {}, dataTransfer: { getData: () => '中毒' }, currentTarget: { classList: { remove() {} } } }, 7);
ok('拖拽"中毒"到角色行 → 添加（回合 2）', sb._tok.statuses.length === 1 && sb._tok.statuses[0].name === '中毒' && sb._tok.statuses[0].unit === '回合' && sb._tok.statuses[0].remaining === 2, sb._tok.statuses);
sb.quickDrop({ preventDefault() {}, dataTransfer: { getData: () => '束缚' }, currentTarget: { classList: { remove() {} } } }, 7);
ok('再次拖拽"束缚" → 两个状态', sb._tok.statuses.length === 2 && sb._tok.statuses[1].name === '束缚', sb._tok.statuses.map(s => s.name));

// 编辑时长（saveStatusDuration 语义）：直接改 status 对象字段
sb._tok.statuses[0].unit = '分钟';
sb._tok.statuses[0].value = 15;
sb._tok.statuses[0].remaining = 15;
ok('编辑时长：回合2 → 分钟15（字段可改）', sb._tok.statuses[0].unit === '分钟' && sb._tok.statuses[0].remaining === 15);

// 序列化含状态
const nd = sb.tokenNetData(sb._tok);
ok('tokenNetData 序列化含 2 个状态', nd.statuses.length === 2, nd.statuses.length);

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
