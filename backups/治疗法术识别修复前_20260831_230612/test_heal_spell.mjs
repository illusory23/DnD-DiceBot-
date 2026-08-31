// 2026-08-31 治疗法术识别 + 法术专属效果表（吸血鬼之触）验证（node test_heal_spell.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → 得到: ' + JSON.stringify(extra) : '')); }
}

const js = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/static/map.js', 'utf8');

function extractFn(code, fnName) {
  let i = code.indexOf('function ' + fnName);
  if (i < 0) throw new Error('未找到 ' + fnName);
  // 保留 async 前缀（async function 定义）
  const pre = code.slice(Math.max(0, i - 8), i);
  if (/async\s*$/.test(pre)) i -= (pre.match(/async\s*$/)[0]).length;
  let depth = 0, j = i, started = false;
  for (; j < code.length; j++) {
    const ch = code[j];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return code.slice(i, j);
}

console.log('══ 1. 治疗列表识别（isHealSpell） ══');
const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(extractFn(js, 'isHealSpell'), sb);
const isHeal = (name) => sb.isHealSpell({ spell_name: name });

ok('"复原术"识别（名称扩充）', isHeal('复原术') === true);
ok('"次级复原术"识别', isHeal('次级复原术') === true);
ok('"再生术"识别', isHeal('再生术') === true);
ok('"医疗术"识别', isHeal('医疗术') === true);
ok('"愈合真言"识别', isHeal('愈合真言') === true);
ok('"活力光环"识别', isHeal('活力光环') === true);
ok('"援助术"识别', isHeal('援助术') === true);
ok('"治愈真言"识别（原关键词）', isHeal('治愈真言') === true);
ok('"吸血鬼之触"不进治疗列表（属攻击类型，走法术效果表）', isHeal('吸血鬼之触') === false);
ok('"火球术"不识别', isHeal('火球术') === false);
ok('空对象不识别', sb.isHealSpell(null) === false);

console.log('\n══ 2. 法术专属效果表（SPELL_ATTACK_EFFECTS） ══');
ok('效果表存在且登记吸血鬼之触', /const SPELL_ATTACK_EFFECTS = \{\s*'吸血鬼之触': spellEffectVampiricTouch,\s*\};/.test(js));
ok('spellEffectVampiricTouch 单独函数', /async function spellEffectVampiricTouch\(dmg\)/.test(js));
ok('confirmDamage 调用分发函数 applySpellAttackEffect(dmg)', /applySpellAttackEffect\(dmg\);/.test(js));
ok('分发函数按表查找法术效果', /const fn = SPELL_ATTACK_EFFECTS\[attackCtx\.sourceName\];/.test(js));

// vm 行为测试：效果表分发
const sb2 = { console };
sb2.window = sb2;
vm.createContext(sb2);
vm.runInContext(`
var mapCombatants = [];
var attackCtx = { targetToken: {name:'哥布林'}, attackerName: '法师甲', attackerCharId: 1, sourceName: '吸血鬼之触', hit: true };
var _lifestealNotify = [];
function mapChatNotifyHp(icon, text) { _lifestealNotify.push(text); }
function refreshCharHpDisplay() {}
function mapRenderInitiative() {}
function mapUpdateDmgDropdown() {}
function saveMapCombatLocal() {}
function debouncedSave() {}
function pushCombatState() {}
`, sb2);
sb2._hpPosts = [];
sb2.fetch = async (url, opts) => {
  if (url.includes('/hp')) { sb2._hpPosts.push(JSON.parse(opts.body)); return { json: async () => ({ hp_current: 50, hp_max: 60 }) }; }
  return { json: async () => ({}) };
};
vm.runInContext(extractFn(js, 'spellEffectVampiricTouch'), sb2);
vm.runInContext(extractFn(js, 'applySpellAttackEffect'), sb2);
vm.runInContext(`const SPELL_ATTACK_EFFECTS = { '吸血鬼之触': spellEffectVampiricTouch };`, sb2);

await sb2.applySpellAttackEffect(8);
ok('吸血鬼之触命中 dmg=8 → 自动给攻击者回血 8', sb2._hpPosts.length === 1 && sb2._hpPosts[0].amount === 8 && sb2._hpPosts[0].setAbsolute === false, sb2._hpPosts);
ok('播报含"恢复了 8 点血量（攻击伤害）"', sb2._lifestealNotify.length === 1 && sb2._lifestealNotify[0].includes('恢复了 8 点血量（攻击伤害）'), sb2._lifestealNotify[0]);

sb2._hpPosts.length = 0; sb2._lifestealNotify.length = 0;
vm.runInContext('attackCtx = { attackerName: "法师甲", attackerCharId: 1, sourceName: "火球术", hit: true };', sb2);
await sb2.applySpellAttackEffect(20);
ok('火球术（未登记）→ 无效果（表驱动，不误触发）', sb2._hpPosts.length === 0 && sb2._lifestealNotify.length === 0, sb2._hpPosts);

sb2._hpPosts.length = 0;
vm.runInContext('attackCtx = { attackerName: "", attackerCharId: null, sourceName: "吸血鬼之触", hit: true };', sb2);
await sb2.applySpellAttackEffect(8);
ok('无攻击者 → 不回血', sb2._hpPosts.length === 0, sb2._hpPosts);

sb2._hpPosts.length = 0;
vm.runInContext('attackCtx = { attackerName: "法师甲", attackerCharId: 1, sourceName: "吸血鬼之触", hit: true };', sb2);
await sb2.applySpellAttackEffect(0);
ok('dmg=0 → 无效果', sb2._hpPosts.length === 0, sb2._hpPosts);

console.log('\n══ 3. 版本号与语法 ══');
const mh = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/templates/map.html', 'utf8');
ok('map.html map.js?v=87', mh.includes('map.js?v=87'));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
