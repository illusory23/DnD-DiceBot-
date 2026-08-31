// 2026-08-31 DM 状态池系统验证 v2（时间单位化：回合/分钟/小时）（node test_status_system.mjs）
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
ok('tokenNetData 含 statuses', /statuses: t\.statuses \|\| \[\]/.test(js));
ok('状态时间单位模型（unit/value/remaining）', /unit: hasDur \? unit : null,[\s\S]{0,80}value: hasDur \? value : null,[\s\S]{0,80}remaining: hasDur \? value : null/.test(js));
ok('fmtStatusDuration（回合/分钟/小时/永久）', /function fmtStatusDuration\(s\) {[\s\S]{0,400}return '剩 ' \+ rem \+ ' ' \+ s\.unit;/.test(js));
ok('fmtStatusShort 短显示', /function fmtStatusShort\(s\) {[\s\S]{0,200}return ' ' \+ \(s\.remaining != null \? s\.remaining : s\.value\) \+ s\.unit;/.test(js));
ok('normalizeStatus 旧数据兼容（rounds → 回合）', /if \(s\.unit == null && s\.rounds != null\) {[\s\S]{0,200}unit: '回合'/.test(js));
ok('mergeRemoteTokens 迁移旧数据+新状态提示', /t\.statuses = td\.statuses\.map\(normalizeStatus\);[\s\S]{0,400}showTokenFloatText\(t, '特殊状态：'/.test(js));
ok('tickStatusRounds 仅回合单位递减', /if \(s\.unit !== '回合'\) return true;[\s\S]{0,60}s\.remaining = \(s\.remaining != null \? s\.remaining : s\.value\) - 1;/.test(js));
ok('状态池添加区含单位下拉（回合/分钟/小时/永久）', /st-unit-' \+ r\.token\.id[\s\S]{0,120}\<option value="回合"\>[\s\S]{0,120}\<option value="分钟"\>[\s\S]{0,120}\<option value="小时"\>[\s\S]{0,120}\<option value=""\>永久/.test(js));
ok('弹窗用 fmtStatusDuration 显示剩余时间', /const rnd = fmtStatusDuration\(s\);/.test(js));
ok('头顶提示"特殊状态：内容"（本地+WS 全端）', js.includes("showTokenFloatText(token, '特殊状态：' + name)") && /fresh\.forEach\(function\(s\) \{[\s\S]{0,200}showTokenFloatText\(t, '特殊状态：'/.test(js));
ok('applyRoleRestrictions 控制状态池入口', /statusPoolBtn\) statusPoolBtn\.style\.display = 'none';/.test(js));
ok('makeDraggable 注册状态池/弹窗', js.includes("makeDraggable(document.getElementById('status-pool-panel')") && js.includes("makeDraggable(document.getElementById('status-popup')"));

console.log('\n══ 2. 结构断言（map.html） ══');
ok('状态池按钮/面板/弹窗/样式/版本', mh.includes('status-pool-btn') && mh.includes('status-pool-panel') && mh.includes('status-popup') && mh.includes('.token-float-text') && mh.includes('map.js?v=90'));

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
var mapTokens = [];
var mapCombatants = [];
var _ops = [];
var _dirty = 0;
var _floats = [];
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
window._wsSendOp = function(kind, list) { _ops.push({kind:kind, list:list}); };
window._markDirty = function() { _dirty++; };
function showTokenFloatText(t, text) { _floats.push({token:t.name, text:text}); }
function renderStatusPopup() {}
function showTokenInfoPanel() {}
`, sb);
vm.runInContext(extractFn(js, 'tokenNetData'), sb);
vm.runInContext(extractFn(js, 'syncTokenStatuses'), sb);
vm.runInContext(extractFn(js, 'addTokenStatus'), sb);
vm.runInContext(extractFn(js, 'removeTokenStatus'), sb);
vm.runInContext(extractFn(js, 'tickStatusRounds'), sb);
vm.runInContext(extractFn(js, 'fmtStatusDuration'), sb);
vm.runInContext(extractFn(js, 'fmtStatusShort'), sb);
vm.runInContext(extractFn(js, 'normalizeStatus'), sb);

sb._tokA = { id: 1, charId: 101, name: '战士甲', statuses: [], el: { querySelector: () => null, appendChild: () => {} } };
sb._tokB = { id: 2, charId: 102, name: '法师乙', statuses: [], el: { querySelector: () => null, appendChild: () => {} } };
sb.mapTokens.push(sb._tokA, sb._tokB);
sb.mapCombatants.push({ charId: 101 }, { charId: 102 });

// 添加：回合 3、分钟 30、永久
vm.runInContext('addTokenStatus(_tokA, "中毒", "回合", 3);', sb);
vm.runInContext('addTokenStatus(_tokA, "虚弱", "分钟", 30);', sb);
vm.runInContext('addTokenStatus(_tokA, "祝福", "", 0);', sb);
ok('添加三个状态：回合3/分钟30/永久', sb._tokA.statuses.length === 3
  && sb._tokA.statuses[0].unit === '回合' && sb._tokA.statuses[0].remaining === 3 && sb._tokA.statuses[0].value === 3
  && sb._tokA.statuses[1].unit === '分钟' && sb._tokA.statuses[1].remaining === 30
  && sb._tokA.statuses[2].unit === null && sb._tokA.statuses[2].remaining === null, sb._tokA.statuses);
ok('添加后头顶提示"特殊状态：中毒"', sb._floats.some(f => f.text === '特殊状态：中毒'), sb._floats);

// 时长格式化
ok('fmtStatusDuration：回合显示"剩 3 回合 / 共 3 回合"', sb.fmtStatusDuration(sb._tokA.statuses[0]) === '剩 3 回合 / 共 3 回合', sb.fmtStatusDuration(sb._tokA.statuses[0]));
ok('fmtStatusDuration：分钟显示"剩 30 分钟"', sb.fmtStatusDuration(sb._tokA.statuses[1]) === '剩 30 分钟', sb.fmtStatusDuration(sb._tokA.statuses[1]));
ok('fmtStatusDuration：永久', sb.fmtStatusDuration(sb._tokA.statuses[2]) === '永久');
ok('fmtStatusShort：回合" 3回合"', sb.fmtStatusShort(sb._tokA.statuses[0]) === ' 3回合', sb.fmtStatusShort(sb._tokA.statuses[0]));
ok('fmtStatusShort：永久 ∞', sb.fmtStatusShort(sb._tokA.statuses[2]) === ' ∞');

// 回合递减：只减回合单位
sb._floats.length = 0;
vm.runInContext('tickStatusRounds();', sb);
ok('新回合：中毒 3→2，分钟/永久不减', sb._tokA.statuses[0].remaining === 2 && sb._tokA.statuses[1].remaining === 30 && sb._tokA.statuses[2].remaining === null, sb._tokA.statuses.map(s => s.remaining));
vm.runInContext('tickStatusRounds(); tickStatusRounds();', sb);
ok('三回合后"中毒"归零移除，分钟/永久保留', sb._tokA.statuses.length === 2 && sb._tokA.statuses[0].name === '虚弱', sb._tokA.statuses.map(s => s.name));
ok('移除时提示"状态结束：中毒"', sb._floats.some(f => f.text === '状态结束：中毒'), sb._floats);

// 旧数据兼容
const legacy = sb.normalizeStatus({ id: 'x', name: '旧状态', rounds: 2, maxRounds: 5, ts: 1 });
ok('旧 rounds 数据迁移为回合单位', legacy.unit === '回合' && legacy.remaining === 2 && legacy.value === 5, legacy);

// 删除 + 序列化（当前剩 虚弱+祝福 两个，删一个剩 1）
vm.runInContext('removeTokenStatus(_tokA, _tokA.statuses[0].id);', sb);
ok('删除状态（虚弱）后剩祝福', sb._tokA.statuses.length === 1 && sb._tokA.statuses[0].name === '祝福', sb._tokA.statuses.map(s => s.name));
const nd = sb.tokenNetData(sb._tokB);
ok('tokenNetData 序列化含 statuses', Array.isArray(nd.statuses));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
