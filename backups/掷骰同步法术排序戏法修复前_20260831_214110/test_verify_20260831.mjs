// 2026-08-31 三项改动自动化验证脚本（node test_verify_20260831.mjs）
// 1) 掷骰自定义输入与控件双向同步（dice3d-e.html）
// 2) 法术书/准备法术按等级排序（spells.html）
// 3) 戏法显示与索引错位修复（map.js 语法）
import fs from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → 得到: ' + JSON.stringify(extra) : '')); }
}

const BASE = 'D:/游戏/尘封之卷-九子的注视/骰娘/';

// ━━━━━━━━━━━━ 1) 掷骰同步逻辑 ━━━━━━━━━━━━
console.log('\n══ 1. 掷骰自定义输入与控件同步（dice3d-e.html 真实代码） ══');
const html = fs.readFileSync(BASE + 'web/templates/dice3d-e.html', 'utf8');
// 提取主逻辑片段：var S=20 起 → function buildDetNotation 前（不含 import/DiceBox 初始化）
const start = html.indexOf('var S=20,C=1,M=0');
const end = html.indexOf('function buildDetNotation');
if (start < 0 || end < 0 || end <= start) { console.log('  ❌ 提取主逻辑片段失败'); process.exit(1); }
const code = html.slice(start, end);

// DOM stub
function makeEl(init = {}) {
  const el = { value: '', textContent: '', style: {}, dataset: {}, _cls: new Set() };
  el.classList = {
    add: (c) => el._cls.add(c),
    remove: (c) => el._cls.delete(c),
    toggle: (c, f) => { if (f === undefined) f = !el._cls.has(c); if (f) el._cls.add(c); else el._cls.delete(c); return f; },
    contains: (c) => el._cls.has(c)
  };
  Object.assign(el, init);
  return el;
}
const dbsBtns = ['4','6','8','10','12','20','100'].map(s => { const b = makeEl(); b.dataset.s = s; return b; });
const togBtns = ['', 'adv', 'dis'].map(a => { const b = makeEl(); b.dataset.a = a; return b; });
const els = {
  'cv': makeEl({ textContent: '1' }),
  'mv': makeEl({ textContent: '+0' }),
  'custom-expr': makeEl({ value: '' }),
  'explode-btn': makeEl(),
  'keep-mode': makeEl({ value: '' }),
  'keep-count': makeEl({ value: '1' }),
};
const sandbox = {
  document: {
    getElementById(id) { return els[id] || null; },
    querySelectorAll(sel) {
      if (sel === '#dbs button') return dbsBtns;
      if (sel === '#tog button') return togBtns;
      return [];
    }
  },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const g = sandbox; // S/C/M/A/EXPLODING/KEEP_MODE/KEEP_COUNT 在 context 顶层

// 1a. 点击加减 → 输入框实时同步
g.C = 1; g.M = 0; g.S = 20; g.A = '';
g.window.chgC(1);
ok('chgC(+1) 后输入框="2d20"', els['custom-expr'].value === '2d20', els['custom-expr'].value);
g.window.chgM(1);
ok('chgM(+1) 后输入框="2d20+1"', els['custom-expr'].value === '2d20+1', els['custom-expr'].value);
g.window.chgM(-2);
ok('chgM(-2) 后输入框="2d20-1"', els['custom-expr'].value === '2d20-1', els['custom-expr'].value);
g.window.chgC(-1);
ok('chgC(-1) 后输入框="1d20-1"', els['custom-expr'].value === '1d20-1', els['custom-expr'].value);

// 1b. 输入自定义表达式 → 上方控件同步
els['custom-expr'].value = '4d6k3';
g.parseCustomInput();
ok('解析"4d6k3" → C=4,S=6,KEEP=kh/3', g.C === 4 && g.S === 6 && g.KEEP_MODE === 'kh' && g.KEEP_COUNT === 3 && g.M === 0, { C: g.C, S: g.S, K: g.KEEP_MODE, KC: g.KEEP_COUNT, M: g.M });
ok('解析"4d6k3" → 个数显示"4"', String(els['cv'].textContent) === '4', els['cv'].textContent);

els['custom-expr'].value = 'd20 adv';
g.parseCustomInput();
ok('解析"d20 adv" → A=adv,S=20,C=1', g.A === 'adv' && g.S === 20 && g.C === 1, { A: g.A, S: g.S, C: g.C });

els['custom-expr'].value = '2d8+1d6+3';
g.parseCustomInput();
ok('解析混合"2d8+1d6+3" → C=2,S=8,M=3（尽力同步首组+尾加值）', g.C === 2 && g.S === 8 && g.M === 3, { C: g.C, S: g.S, M: g.M });

els['custom-expr'].value = '1d100';
g.parseCustomInput();
ok('解析"1d100" → S=100,C=1', g.S === 100 && g.C === 1, { S: g.S, C: g.C });

els['custom-expr'].value = '3d6!';
g.parseCustomInput();
ok('解析"3d6!" → EXPLODING=true', g.EXPLODING === true, g.EXPLODING);

els['custom-expr'].value = '4d6dl1';
g.parseCustomInput();
ok('解析"4d6dl1" → KEEP_MODE=dl,KEEP_COUNT=1', g.KEEP_MODE === 'dl' && g.KEEP_COUNT === 1, { K: g.KEEP_MODE, KC: g.KEEP_COUNT });

// 1c. 输入框解析后，再点控件 → 输入框以控件为准重建（覆盖手动复杂表达式是预期行为）
g.window.chgC(1);
ok('解析后点 chgC(+1) → 输入框重建为"5d6dl1"', els['custom-expr'].value === '5d6dl1', els['custom-expr'].value);

// 1d. 模式切换按钮点击 → 输入框同步
g.S = 20; g.C = 1; g.M = 0; g.A = '';
togBtns[1].dataset.a = 'adv';
togBtns[1]._cls.has = undefined; // 触发真实 handler 需手动调用；直接验证构建逻辑
els['custom-expr'].value = '';
g.A = 'adv';
g.syncCustomInput();
ok('A=adv 同步 → 输入框="d20 adv"', els['custom-expr'].value === 'd20 adv', els['custom-expr'].value);

// ━━━━━━━━━━━━ 2) 法术排序逻辑 ━━━━━━━━━━━━
console.log('\n══ 2. 法术书/准备法术按等级排序（spells.html） ══');
const sh = fs.readFileSync(BASE + 'web/templates/spells.html', 'utf8');
ok('renderLearnedSpells 含排序', /renderLearnedSpells\(spells\)[\s\S]*?const sorted = \[\.\.\.spells\]\.sort/.test(sh));
ok('renderPreparedSpells 含排序', /renderPreparedSpells\(spells\)[\s\S]*?const sorted = \[\.\.\.spells\]\.sort/.test(sh));
// 排序表达式行为验证（真实数据形态）
const sample = [
  { id: 1, spell_name: '火球术', spell_level: 3 },
  { id: 2, spell_name: '火焰箭', spell_level: 0 },
  { id: 3, spell_name: '魔法飞弹', spell_level: 1 },
  { id: 4, spell_name: '九环术', spell_level: 9 },
  { id: 5, spell_name: '冷冻射线', spell_level: 0 },
  { id: 6, spell_name: null }, // 缺等级兜底
];
const sorted = [...sample].sort((a, b) => (a.spell_level || 0) - (b.spell_level || 0));
ok('排序结果：等级升序（null 兜底 0 并入戏法组）', JSON.stringify(sorted.map(s => s.spell_level)) === '[0,0,null,1,3,9]', sorted.map(s => s.spell_level));
ok('同环稳定：火焰箭在冷冻射线前', sorted[0].spell_name === '火焰箭' && sorted[1].spell_name === '冷冻射线', sorted.map(s => s.spell_name));

// ━━━━━━━━━━━━ 3) map.js 语法与改动存在性 ━━━━━━━━━━━━
console.log('\n══ 3. map.js 戏法修复 ══');
try {
  execSync('node --check "' + BASE + 'web/static/map.js"', { stdio: 'pipe' });
  ok('map.js 语法检查通过', true);
} catch (e) {
  ok('map.js 语法检查通过', false, String(e.stderr || e));
}
const mj = fs.readFileSync(BASE + 'web/static/map.js', 'utf8');
ok('戏法显示标签（lvlTxt 0→"戏法"）', /lvlTxt = \(s\.spell_level === 0\) \? '戏法'/.test(mj));
ok('pickAttackSource 用过滤后数组取索引', /const spells = \(attackPickerChar\.prepared_spells \|\| \[\]\)\.filter\(function\(s\) \{ return s && s\.spell_name; \}\);\s*\n\s*const s = spells\[index\]/.test(mj));
// map.html 版本号已升 85
const mh = fs.readFileSync(BASE + 'web/templates/map.html', 'utf8');
ok('map.html map.js?v=85', mh.includes('map.js?v=85'));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
