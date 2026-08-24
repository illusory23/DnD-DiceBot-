# -*- coding: utf-8 -*-
"""north-main.js 生存系统拆分 → north-survival.js
- 提取 480-711（getColdDC/getColdEffect/getColdBadge/getSurvivalBadges/
  checkCold/checkRation/checkStarvation/checkOrient/checkFuel）
- 闭包引用经 window.NORTH_CTX 注入（survival/activeChar 等 getter + 函数引用）
"""
import sys, io, os, re, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'static', 'north-main.js')
SURV = os.path.join(BASE, 'static', 'north-survival.js')

lines = open(SRC, encoding='utf-8').read().split('\n')

def find_line(pat, start=0):
    for i in range(start, len(lines)):
        if pat in lines[i]:
            return i
    raise SystemExit('未找到: ' + pat)

s = find_line('function getColdDC() {')
# 段尾: checkFuel 结束（事件联动系统注释前）
e = find_line('// =========================================================================', s)
e -= 1
while lines[e].strip() == '' or lines[e].strip() == '// =========================================================================':
    e -= 1
print(f'生存段: {s + 1}-{e + 1} (共 {e - s + 1} 行)')

block = '\n'.join(lines[s:e + 1])
# 闭包引用改写（词边界）
CTX_MAP = [
    ('survival', 'window.NORTH_CTX.survival'),
    ('activeChar', 'window.NORTH_CTX.activeChar'),
    ('activeCharId', 'window.NORTH_CTX.activeCharId'),
    ('addSystemLog', 'window.NORTH_CTX.addSystemLog'),
    ('updateSurvivalUI', 'window.NORTH_CTX.updateSurvivalUI'),
    ('checkHpZero', 'window.NORTH_CTX.checkHpZero'),
    ('renderCharDetail', 'window.NORTH_CTX.renderCharDetail'),
    ('rollDiceExpr', 'window.NORTH_CTX.rollDiceExpr'),
    ('abilityMod', 'window.NORTH_CTX.abilityMod'),
    ('rand', 'window.NORTH_CTX.rand'),
]
counts = {}
for name, repl in CTX_MAP:
    pat = re.compile(r'(?<![A-Za-z0-9_$])' + name + r'(?![A-Za-z0-9_$])')
    block, n = pat.subn(repl, block)
    counts[name] = n
print('引用改写次数:', counts)

surv_js = '''/* ━━━ 北境雪原 · 生存系统模块 ━━━
 * 从 north-main.js 拆分（2026-08-16 第三次拆分）
 * 严寒/口粮/迷失/燃料判定层；运行期依赖经 window.NORTH_CTX 注入
 */
(function () {
    'use strict';
''' + block + '''
    window.NORTH_SURVIVAL = {
        getColdDC: getColdDC,
        getColdEffect: getColdEffect,
        getColdBadge: getColdBadge,
        getSurvivalBadges: getSurvivalBadges,
        checkCold: checkCold,
        checkRation: checkRation,
        checkStarvation: checkStarvation,
        checkOrient: checkOrient,
        checkFuel: checkFuel,
    };
})();
'''
open(SURV, 'w', encoding='utf-8').write(surv_js)
print('→ north-survival.js', len(surv_js), '字符')

# main.js: 删段
del lines[s:e + 1]

# 调用点改写
repls = [
    ('checkCold();', 'window.NORTH_SURVIVAL.checkCold();'),
    ('checkCold(); checkRation(); checkStarvation(); checkOrient(); checkFuel();',
     'window.NORTH_SURVIVAL.checkCold(); window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation(); window.NORTH_SURVIVAL.checkOrient(); window.NORTH_SURVIVAL.checkFuel();'),
    ('checkRation(); checkStarvation();',
     'window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation();'),
    ('checkOrient();', 'window.NORTH_SURVIVAL.checkOrient();'),
    ('checkFuel();', 'window.NORTH_SURVIVAL.checkFuel();'),
    ('getSurvivalBadges();', 'window.NORTH_SURVIVAL.getSurvivalBadges();'),
]
# 注意顺序: 先替换四连, 再替换单个（避免四连被单替换破坏）
for old, new in repls:
    for i, l in enumerate(lines):
        if old in l:
            lines[i] = l.replace(old, new)

# CTX 注入（在 statsData getter 注入后追加）
anchor = "Object.defineProperty(window.NORTH_CTX, 'statsData'"
for i in range(len(lines)):
    if anchor in lines[i]:
        inject = [
            "            window.NORTH_CTX.updateSurvivalUI = updateSurvivalUI;",
            "            window.NORTH_CTX.checkHpZero = checkHpZero;",
            "            window.NORTH_CTX.abilityMod = abilityMod;",
            "            window.NORTH_CTX.rand = rand;",
        ]
        for j, line in enumerate(inject):
            lines.insert(i + 1 + j, line)
        print(f'CTX 生存函数注入: 第 {i + 2} 行起')
        break

open(SRC, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'→ north-main.js 剩余 {len(lines)} 行')

for p in (SRC, SURV):
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(('✓ ' if r.returncode == 0 else '!! ') + p)
    if r.returncode != 0:
        print(r.stderr[:500])
        sys.exit(1)
print('拆分完成')
