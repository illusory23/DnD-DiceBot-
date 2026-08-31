// 2026-08-31 掷骰帮助页演示器验证（node test_dice_help.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → 得到: ' + JSON.stringify(extra) : '')); }
}

const html = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/templates/dice-help.html', 'utf8');

// 提取纯函数区（parseDiceExpr → buildDetNotation 结束，不含 DOM 依赖）
const s1 = html.indexOf('function parseDiceExpr');
const s2 = html.indexOf('function demoRoll');
const pure = html.slice(s1, s2);

// 提取 demoRoll（含 DOM 依赖，stub 后单独执行）
const s3 = html.indexOf('function demoRoll');
const s4 = html.indexOf('window.demoPreset');
const demoRollSrc = html.slice(s3, s4);

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);

console.log('══ 1. 表达式解析 parseDiceExpr ══');
vm.runInContext(pure, sandbox);
const p = (e) => sandbox.parseDiceExpr(e);

let r = p('3d6');
ok('"3d6" → 1组 3d6', r && r.groups.length === 1 && r.groups[0].count === 3 && r.groups[0].sides === 6 && r.bonus === 0 && r.advantage === null, r && r.groups);
r = p('2d20+5');
ok('"2d20+5" → 2d20 +5', r && r.groups[0].count === 2 && r.groups[0].sides === 20 && r.bonus === 5, r && { g: r.groups[0], b: r.bonus });
r = p('4d6k3');
ok('"4d6k3" → 保留最高3', r && r.groups[0].keepMode === 'kh' && r.groups[0].keepCount === 3, r && r.groups[0]);
r = p('4d6dl1');
ok('"4d6dl1" → 丢弃最低1', r && r.groups[0].keepMode === 'dl' && r.groups[0].keepCount === 1, r && r.groups[0]);
r = p('adv d20+5');
ok('"adv d20+5" → 优势', r && r.advantage === true && r.groups[0].sides === 20, r && { a: r.advantage, g: r.groups[0] });
r = p('d20 dis');
ok('"d20 dis" → 劣势', r && r.advantage === false, r && r.advantage);
r = p('3d6!');
ok('"3d6!" → 爆炸', r && r.groups[0].explode === true, r && r.groups[0]);
r = p('2d8+1d6+3');
ok('"2d8+1d6+3" → 2组 +3', r && r.groups.length === 2 && r.groups[0].sides === 8 && r.groups[1].sides === 6 && r.bonus === 3, r && { n: r.groups.length, b: r.bonus });
r = p('d20-2');
ok('"d20-2" → 加值 -2', r && r.bonus === -2, r && r.bonus);
r = p('1d100');
ok('"1d100" → 100面', r && r.groups[0].sides === 100, r && r.groups[0]);
ok('"abc" → null', p('abc') === null);
ok('"" → null', p('') === null);
r = p('  adv   2d20 + 4 ');
ok('带空格"adv 2d20 + 4" → 优势 +4', r && r.advantage === true && r.bonus === 4 && r.groups[0].count === 2, r && { a: r.advantage, b: r.bonus, c: r.groups[0].count });

console.log('\n══ 2. 掷骰/保留/爆炸 rollGroup ══');
// 序列随机：0.9→6, 0.9→6, 之后 0.1→1（掷出 6,6 后爆炸继续掷 1 停止）
vm.runInContext('var __seq=[0.9,0.9,0.1];var __i=0;Math.random=function(){return __seq[Math.min(__i++,__seq.length-1)];};', sandbox);
let g = { count: 1, sides: 6, keepMode: null, keepCount: 1, explode: true };
let out = sandbox.rollGroup(g, true, null);
ok('爆炸骰：掷出 6 追加直到非6（[6,6,1]）', JSON.stringify(out.rolls) === '[6,6,1]', out.rolls);
vm.runInContext('Math.random = function(){ return 0.3; };', sandbox); // → 2
g = { count: 4, sides: 6, keepMode: 'kh', keepCount: 3, explode: false };
out = sandbox.rollGroup(g, true, null);
ok('kh3：kept 长度 3 且为最高3个', out.kept.length === 3 && out.rolls.length === 4, { kept: out.kept, rolls: out.rolls });
// 序列：0.9→d20=19, 0.3→d20=7（优势取高19 / 劣势取低7）
vm.runInContext('var __seq2=[0.9,0.3];var __j=0;Math.random=function(){return __seq2[__j++ % 2];};', sandbox);
g = { count: 1, sides: 20, keepMode: null, keepCount: 1, explode: false };
out = sandbox.rollGroup(g, true, true);
ok('优势：掷2取高（19,7→19）', out.originals.length === 2 && out.kept.length === 1 && out.kept[0] === 19, { o: out.originals, k: out.kept });
vm.runInContext('var __seq3=[0.9,0.3];var __k=0;Math.random=function(){return __seq3[__k++ % 2];};', sandbox);
out = sandbox.rollGroup(g, true, false);
ok('劣势：掷2取低（19,7→7）', out.kept[0] === 7 && out.originals.length === 2, { o: out.originals, k: out.kept });

console.log('\n══ 3. 3D 确定性格式 buildDetNotation ══');
ok('多组 "2d6+1d8@6,5,3"', sandbox.buildDetNotation([{ sides: 6, rolls: [6, 5] }, { sides: 8, rolls: [3] }]) === '2d6+1d8@6,5,3', sandbox.buildDetNotation([{ sides: 6, rolls: [6, 5] }, { sides: 8, rolls: [3] }]));
ok('d100 单组拆 2d10（83→8,3）', sandbox.buildDetNotation([{ sides: 100, rolls: [83] }]) === '2d10@8,3', sandbox.buildDetNotation([{ sides: 100, rolls: [83] }]));
ok('d100 个位0（80→8,10）', sandbox.buildDetNotation([{ sides: 100, rolls: [80] }]) === '2d10@8,10', sandbox.buildDetNotation([{ sides: 100, rolls: [80] }]));

console.log('\n══ 4. demoRoll 完整链路（DOM stub，3D 不可用降级） ══');
const resultEl = { textContent: '' };
const exprEl = { value: '' };
const dbs = {
  getElementById(id) {
    if (id === 'demo-expr') return exprEl;
    return null;
  }
};
const s5 = sandbox2();
function sandbox2() {
  const sb = { console, document: dbs, Math };
  sb.window = sb;
  vm.createContext(sb);
  // 注入 demoRoll 依赖的 module 变量与纯函数（parseDiceExpr 等）
  vm.runInContext(pure, sb);
  vm.runInContext('var initOk=false; var box=null; var st={textContent:""};', sb);
  sb._resultEl = resultEl;
  vm.runInContext('var resultEl = _resultEl;', sb);
  vm.runInContext(demoRollSrc, sb);
  return sb;
}
// demoRoll 内部引用的是模块级 resultEl（提取后未定义）——改为 context 内定义
vm.runInContext('var resultEl = _resultEl;', s5);
exprEl.value = '3d6';
s5.demoRoll();
ok('demoRoll("3d6") 结果格式 "3d6 = N [a,b,c]"', /^3d6 = \d+ \[\d+,\d+,\d+\]$/.test(resultEl.textContent), resultEl.textContent);
exprEl.value = 'abc';
s5.demoRoll();
ok('demoRoll("abc") 提示无法解析', resultEl.textContent.indexOf('无法解析') >= 0, resultEl.textContent);
exprEl.value = 'adv d20+5';
s5.demoRoll();
ok('demoRoll("adv d20+5") 结果含 = 与 []（大成功可能）', /^adv d20\+5 = \d+ \[\d+,\d+\]/.test(resultEl.textContent), resultEl.textContent);
exprEl.value = '2d8+1d6+3';
s5.demoRoll();
ok('demoRoll("2d8+1d6+3") 双组明细', /^2d8\+1d6\+3 = \d+ \[\d+,\d+;\d+\]$/.test(resultEl.textContent), resultEl.textContent);

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
