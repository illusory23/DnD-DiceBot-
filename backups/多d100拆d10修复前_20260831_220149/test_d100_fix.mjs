// 2026-08-31 多 d100 拆 d10 修复验证（node test_d100_fix.mjs）
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  → 得到: ' + JSON.stringify(extra) : '')); }
}

// 提取函数（括号计数取函数体）
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

// ━━ dice-help.html（演示页） ━━
console.log('══ 演示页 dice-help.html buildDetNotation ══');
const dh = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/templates/dice-help.html', 'utf8');
const sb1 = { console };
vm.createContext(sb1);
vm.runInContext(extractFn(dh, 'buildDetNotation'), sb1);
const b1 = sb1.buildDetNotation;

ok('2d100 → 4d10（每个百面骰拆两个十面骰）', b1([{ sides: 100, rolls: [37, 92] }]) === '4d10@3,7,9,2', b1([{ sides: 100, rolls: [37, 92] }]));
ok('3d100 → 6d10', b1([{ sides: 100, rolls: [11, 22, 33] }]) === '6d10@1,1,2,2,3,3', b1([{ sides: 100, rolls: [11, 22, 33] }]));
ok('单 d100 → 2d10（回归）', b1([{ sides: 100, rolls: [83] }]) === '2d10@8,3', b1([{ sides: 100, rolls: [83] }]));
ok('d100 十位/个位 0 显示为 10（80→8,10）', b1([{ sides: 100, rolls: [80] }]) === '2d10@8,10', b1([{ sides: 100, rolls: [80] }]));
ok('d100 整十 100 → 10,10', b1([{ sides: 100, rolls: [100] }]) === '2d10@10,10', b1([{ sides: 100, rolls: [100] }]));
ok('混合 2d100+1d20 → 4d10+1d20', b1([{ sides: 100, rolls: [37, 92] }, { sides: 20, rolls: [15] }]) === '4d10+1d20@3,7,9,2,15', b1([{ sides: 100, rolls: [37, 92] }, { sides: 20, rolls: [15] }]));
ok('普通骰不受影响 2d6 → 2d6@…', b1([{ sides: 6, rolls: [3, 5] }]) === '2d6@3,5', b1([{ sides: 6, rolls: [3, 5] }]));

// ━━ dice3d-e.html（主掷骰页） ━━
console.log('\n══ 主掷骰页 dice3d-e.html buildDetNotation（apiResult 形状） ══');
const de = fs.readFileSync('D:/游戏/尘封之卷-九子的注视/骰娘/web/templates/dice3d-e.html', 'utf8');
const sb2 = { console };
vm.createContext(sb2);
vm.runInContext(extractFn(de, 'buildDetNotation'), sb2);
const b2 = sb2.buildDetNotation;

ok('2d100 → 4d10', b2({ groups_detail: [{ sides: 100, rolls: [37, 92] }] }) === '4d10@3,7,9,2', b2({ groups_detail: [{ sides: 100, rolls: [37, 92] }] }));
ok('3d100 → 6d10', b2({ groups_detail: [{ sides: 100, rolls: [11, 22, 33] }] }) === '6d10@1,1,2,2,3,3', b2({ groups_detail: [{ sides: 100, rolls: [11, 22, 33] }] }));
ok('单 d100 → 2d10（回归）', b2({ groups_detail: [{ sides: 100, rolls: [83] }] }) === '2d10@8,3', b2({ groups_detail: [{ sides: 100, rolls: [83] }] }));
// 50→[5,10]（个位0显示10），5→[10,5]（十位0显示10）
ok('混合 1d20+2d100+1d4 → 1d20+4d10+1d4', b2({ groups_detail: [{ sides: 20, rolls: [15] }, { sides: 100, rolls: [50, 5] }, { sides: 4, rolls: [2] }] }) === '1d20+4d10+1d4@15,5,10,10,5,2', b2({ groups_detail: [{ sides: 20, rolls: [15] }, { sides: 100, rolls: [50, 5] }, { sides: 4, rolls: [2] }] }));
// 旧路径依赖模块变量 S（此处注入 S=20 模拟 d20 场景）
vm.runInContext('var S=20;', sb2);
ok('无分组信息旧路径不受影响（d20 单骰）', b2({ total: 15, rolls: [15] }) === '1d20@15', b2({ total: 15, rolls: [15] }));

console.log(`\n════════ 结果：${pass} 通过 / ${fail} 失败 ════════`);
process.exit(fail ? 1 : 0);
