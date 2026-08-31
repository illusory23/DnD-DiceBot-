// 2026-08-31 攻击列表排除治疗法术验证（node test_attack_spell_filter.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const BASE = 'D:/游戏/尘封之卷-九子的注视/骰娘/';
const js = fs.readFileSync(BASE + 'web/static/map.js', 'utf8');

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

// 先加载真实效果库，再注入 map.js 的 isHealSpell/isAttackSpell
const effJs = fs.readFileSync(BASE + 'web/static/spell-effects.js', 'utf8');
const sb = { console, window: {} };
vm.createContext(sb);
vm.runInContext(effJs, sb);
vm.runInContext(extractFn(js, 'isHealSpell'), sb);
vm.runInContext(extractFn(js, 'isAttackSpell'), sb);
const atk = (name) => sb.isAttackSpell({ spell_name: name });

console.log('══ 1. 攻击列表保留（可攻击法术） ══');
for (const n of ['火球术', '魔法飞弹', '闪电束', '灼热射线', '死亡一指']) {
  ok(`"${n}"（damage）保留在攻击列表`, atk(n) === true);
}
ok('"吸血鬼之触"（fn 回血攻击）保留在攻击列表', atk('吸血鬼之触') === true);
ok('"马友夫强酸箭"（未登记攻击法术）保留', atk('马友夫强酸箭') === true);

console.log('\n══ 2. 攻击列表排除（治疗/临时生命） ══');
for (const n of ['疗伤术', '治愈真言', '治疗祷言', '群体疗伤术', '医疗术']) {
  ok(`"${n}"（heal）从攻击列表排除`, atk(n) === false);
}
for (const n of ['虚假生命', '援助术']) {
  ok(`"${n}"（temp_hp）从攻击列表排除`, atk(n) === false);
}
ok('"次级复原术"（未登记但名称关键词）排除', atk('次级复原术') === false);
ok('"再生术"（名称关键词）排除', atk('再生术') === false);

console.log('\n══ 3. 空对象与版本号 ══');
ok('空对象 → false', sb.isAttackSpell(null) === false);
const mh = fs.readFileSync(BASE + 'web/templates/map.html', 'utf8');
ok('map.js?v=89', mh.includes('map.js?v=89'));
ok('渲染列表使用 isAttackSpell 过滤', /prepared_spells \|\| \[\]\)\.filter\(isAttackSpell\)/.test(js));
ok('选择时同源过滤（isAttackSpell）', (js.match(/filter\(isAttackSpell\)/g) || []).length >= 2);
ok('空列表提示引导到💚治疗', js.includes('该角色没有可攻击的法术（治疗法术请在💚治疗中选择）'));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
