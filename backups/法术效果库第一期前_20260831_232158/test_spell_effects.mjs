// 2026-08-31 法术效果库第一期验证（node test_spell_effects.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const BASE = 'D:/游戏/尘封之卷-九子的注视/骰娘/';

console.log('══ 1. 效果库数据（spell-effects.js） ══');
const effJs = fs.readFileSync(BASE + 'web/static/spell-effects.js', 'utf8');
const sb = { console, window: {} };
vm.createContext(sb);
vm.runInContext(effJs, sb);
const E = sb.window.SPELL_EFFECTS;

const f = E.get('火球术');
ok('火球术登记为伤害 8d6 火焰', f && f.kind === 'damage' && f.expr === '8d6' && f.dmgType === '火焰' && f.save === '敏捷', f);
const m = E.get('魔法飞弹');
ok('魔法飞弹 1d4+1 力场（无豁免）', m && m.expr === '1d4+1' && !m.save, m);
const cw = E.get('疗伤术');
ok('疗伤术为治疗 1d8+3', cw && cw.kind === 'heal' && cw.expr === '1d8+3', cw);
const mass = E.get('医疗术');
ok('医疗术 fixed=70', mass && mass.kind === 'heal' && mass.fixed === 70, mass);
const fl = E.get('虚假生命');
ok('虚假生命为临时生命 1d4+4', fl && fl.kind === 'temp_hp' && fl.expr === '1d4+4', fl);
const aid = E.get('援助术');
ok('援助术 fixed=5 临时生命', aid && aid.kind === 'temp_hp' && aid.fixed === 5, aid);
const vt = E.get('吸血鬼之触');
ok('吸血鬼之触为 fn 类（fn 待 map.js 注册）', vt && vt.kind === 'fn', vt);
ok('未登记法术返回 null', E.get('火球术X') === null);
const all = E.list();
const kinds = Object.values(all).map(e => e.kind);
ok('条目总数 >= 24', Object.keys(all).length >= 24, Object.keys(all).length);
ok('三类齐全（damage/heal/temp_hp/fn）', ['damage','heal','temp_hp','fn'].every(k => kinds.includes(k)));

console.log('\n══ 2. 流程接入结构断言（map.js） ══');
const mj = fs.readFileSync(BASE + 'web/static/map.js', 'utf8');
ok('攻击法术伤害表达式优先查效果库', /const eff = \(typeof window\.SPELL_EFFECTS !== 'undefined'\) \? window\.SPELL_EFFECTS\.get\(s\.spell_name\) : null;\s*cfg\.dmgExpr = \(eff && eff\.expr\) \? eff\.expr : extractSpellDamage/.test(mj));
ok('治疗法术表达式优先查效果库（含 fixed/kind）', /cfg\.effectKind = eff\.kind;\s*cfg\.fixed = \(eff\.fixed != null\) \? eff\.fixed : null;/.test(mj));
ok('healCtx 记录 kind/fixed', /kind: cfg\.effectKind \|\| '', fixed: \(cfg\.fixed != null\) \? cfg\.fixed : null/.test(mj));
ok('healRoll 纯数字固定值不掷骰', mj.includes('if (/^\\d+$/.test(expr.trim())) {') && mj.includes('total = parseInt(expr.trim(), 10);'));
ok('confirmHeal 临时生命分支（temp: true）', /isTemp \? \{amount: heal, temp: true\} : \{amount: heal, setAbsolute: false\}/.test(mj));
ok('临时生命播报", 获得了 N 点临时生命值"', /获得了 ' \+ heal \+ ' 点临时生命值'/.test(mj));
ok('applySpellAttackEffect 查效果库 fn 类', /const eff = window\.SPELL_EFFECTS\.get\(attackCtx\.sourceName\);[\s\S]{0,120}eff\.kind !== 'fn'/.test(mj));
ok('专属函数注册进效果库', /SPELL_EFFECTS\.get\('吸血鬼之触'\);[\s\S]{0,80}e\.fn = spellEffectVampiricTouch/.test(mj));
ok('旧 SPELL_ATTACK_EFFECTS 表已移除', !mj.includes('const SPELL_ATTACK_EFFECTS'));

console.log('\n══ 3. map.html 引入与版本号 ══');
const mh = fs.readFileSync(BASE + 'web/templates/map.html', 'utf8');
ok('spell-effects.js 在 map.js 前引入', mh.indexOf('spell-effects.js') < mh.indexOf('map.js?v=') && mh.includes('spell-effects.js'));
ok('map.js?v=88', mh.includes('map.js?v=88'));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
