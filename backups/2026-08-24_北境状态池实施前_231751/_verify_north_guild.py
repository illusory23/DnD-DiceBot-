# -*- coding: utf-8 -*-
"""静态对比: north-main.js 公会系统拆分前后语义一致性"""
import re, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
OLD = os.path.join(BASE, '..', 'backups', '2026-08-16_八项优化前', 'north-main.js')
NEW = os.path.join(BASE, 'static', 'north-main.js')
GUILD = os.path.join(BASE, 'static', 'north-guild.js')

STRIP = re.compile(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*")

def strip_all(s):
    out = []
    for l in s.split('\n'):
        l = STRIP.sub('', l).strip()
        if l:
            out.append(l)
    return out

old = open(OLD, encoding='utf-8').read().split('\n')
new_main = open(NEW, encoding='utf-8').read()
guild = open(GUILD, encoding='utf-8').read()

s = next(i for i, l in enumerate(old) if 'const RANK_LEVELS = window.NORTH_DATA.RANK_LEVELS;' in l)
e = next(i for i, l in enumerate(old) if 'function findItemAction(cmd, rollVal)' in l) - 1
old_guild = '\n'.join(old[s:e + 1])
print('公会段: %d-%d (%d 行)' % (s + 1, e + 1, e - s + 1))

# 1. 公会模块: 备份段(改写 statsData/addSystemLog → CTX) 应存在于 north-guild.js
exp = strip_all(old_guild
                .replace('statsData', 'window.NORTH_CTX.statsData')
                .replace('addSystemLog', 'window.NORTH_CTX.addSystemLog'))
new_g = strip_all(guild)
missing = [l for l in exp if l not in new_g]
print('公会段缺失行数(期望0):', len(missing))
for m in missing[:5]:
    print('  缺失:', m[:100])

# 2. 主文件: 备份(删公会段+调用点改写+CTX注入) vs 新主文件
keep = old[:s] + old[e + 1:]
keep_txt = '\n'.join(keep)
keep_txt = keep_txt.replace('checkRankUp(oldTotal, statsData.total);',
                            'window.NORTH_GUILD.checkRankUp(oldTotal, window.NORTH_CTX.statsData.total);')
keep_txt = keep_txt.replace('updateRankUI();', 'window.NORTH_GUILD.updateRankUI();')
keep_txt = keep_txt.replace('renderGuild();', 'window.NORTH_GUILD.renderGuild();')
keep_txt = keep_txt.replace(
    "Object.defineProperty(window.NORTH_CTX, 'username'",
    "Object.defineProperty(window.NORTH_CTX, 'statsData', { get: function () { return statsData; }, configurable: true });\n            Object.defineProperty(window.NORTH_CTX, 'username'")
e1, e2 = strip_all(keep_txt), strip_all(new_main)
diff = [x for x in e1 if x not in e2] + [x for x in e2 if x not in e1]
# 过滤: 本轮新增功能代码（渲染增量/存档异常/日志裁剪/公会标签init）不属于拆分对比范围
allowed_new = ['_displayRendered', 'renderDisplayLog(true)', 'MAX_SAVE_LOG', '_saveFailCount',
               'saveNorthToServer', 'logTrimmed', 'updateRankUI(); // 公会标签',
               'insertAdjacentHTML', 'forceFull']
real_diff = [d for d in diff if not any(a in d for a in allowed_new)]
print('主文件差异行数(过滤新功能后期望0):', len(real_diff))
for d in real_diff[:10]:
    print('  差异:', d[:110])

ok = not missing and not real_diff
print('\n结论:', '全部一致 ✓' if ok else '存在差异 ✗')
sys.exit(0 if ok else 1)
