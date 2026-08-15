# -*- coding: utf-8 -*-
"""north-main.js 公会系统拆分 → north-guild.js
- 提取 795-896（RANK_LEVELS 注入 + getRankIndex/getCurrentRank/getNextRank/
  checkRankUp/renderGuild/guildSubTab/updateRankUI）
- 外部引用改 window.NORTH_GUILD.xxx；statsData/addSystemLog 经 NORTH_CTX 实时读取
"""
import sys, io, os, re, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'static', 'north-main.js')
GUILD = os.path.join(BASE, 'static', 'north-guild.js')

lines = open(SRC, encoding='utf-8').read().split('\n')

def find_line(pat, start=0):
    for i in range(start, len(lines)):
        if pat in lines[i]:
            return i
    raise SystemExit('未找到: ' + pat)

s = find_line('const RANK_LEVELS = window.NORTH_DATA.RANK_LEVELS;')
# 段尾: updateRankUI 结束（findItemAction 之前）
e = find_line('function findItemAction(cmd, rollVal)') - 1
while lines[e].strip() == '':
    e -= 1
print(f'公会段: {s + 1}-{e + 1} (共 {e - s + 1} 行)')

guild_block = '\n'.join(lines[s:e + 1])
# 闭包引用改写: statsData → window.NORTH_CTX.statsData（getter 实时读取）
guild_block = re.sub(r'(?<![A-Za-z0-9_$.])statsData(?![A-Za-z0-9_$])',
                     'window.NORTH_CTX.statsData', guild_block)
guild_block = re.sub(r'(?<![A-Za-z0-9_$.])addSystemLog(?![A-Za-z0-9_$])',
                     'window.NORTH_CTX.addSystemLog', guild_block)

guild_js = '''/* ━━━ 北境雪原 · 公会系统模块 ━━━
 * 从 north-main.js 拆分（2026-08-16 JS 体积治理）
 * 等级/积分/晋升进程可视化；statsData 经 window.NORTH_CTX 实时读取
 * （north-main.js 末尾注入 statsData getter，importSave/存档恢复可能重赋值）
 */
(function () {
    'use strict';
''' + guild_block + '''
    window.NORTH_GUILD = {
        getRankIndex: getRankIndex,
        getCurrentRank: getCurrentRank,
        getNextRank: getNextRank,
        checkRankUp: checkRankUp,
        renderGuild: renderGuild,
        updateRankUI: updateRankUI,
        guildSubTab: window.guildSubTab,
    };
})();
'''
open(GUILD, 'w', encoding='utf-8').write(guild_js)
print('→ north-guild.js', len(guild_js), '字符')

# main.js: 删公会段
del lines[s:e + 1]

# 外部调用点改写
repls = [
    ('checkRankUp(oldTotal, statsData.total);', 'window.NORTH_GUILD.checkRankUp(oldTotal, window.NORTH_CTX.statsData.total);'),
    ('updateRankUI();', 'window.NORTH_GUILD.updateRankUI();'),
    ('renderGuild();', 'window.NORTH_GUILD.renderGuild();'),
]
for i, l in enumerate(lines):
    for old, new in repls:
        if old in l:
            lines[i] = l.replace(old, new)

# CTX 注入 statsData getter（在 username getter 注入之后）
anchor = "Object.defineProperty(window.NORTH_CTX, 'username'"
for i in range(len(lines)):
    if anchor in lines[i]:
        lines.insert(i + 1, "            Object.defineProperty(window.NORTH_CTX, 'statsData', { get: function () { return statsData; }, configurable: true });")
        print(f'CTX statsData getter 注入: 第 {i + 2} 行')
        break

open(SRC, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'→ north-main.js 剩余 {len(lines)} 行（原 {len(lines) + (e - s + 1)} 行）')

for p in (SRC, GUILD):
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(('✓ ' if r.returncode == 0 else '!! ') + p)
    if r.returncode != 0:
        print(r.stderr[:500])
        sys.exit(1)
print('拆分完成')
