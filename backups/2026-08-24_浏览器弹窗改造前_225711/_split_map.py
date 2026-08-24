# -*- coding: utf-8 -*-
"""map.js 模块拆分: 战争迷雾系统 → map-fog.js
- 提取 1541-1860（fogLineWidth → floodFillOnCanvas 结束）
- keydown 快捷键监听器（1861 起）留在 map.js（非迷雾代码）
- 加载顺序: map-fog.js 在 map.js 之前（boot 立即调用迷雾函数）
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'static', 'map.js')
FOG = os.path.join(BASE, 'static', 'map-fog.js')

lines = open(SRC, encoding='utf-8').read().split('\n')

# 定位边界（内容定位，容错行号漂移）
def find_line(pat, start=0):
    for i in range(start, len(lines)):
        if pat in lines[i]:
            return i
    raise SystemExit('未找到: ' + pat)

s = find_line('// ━━━ 战争迷雾（画笔式涂抹轨迹即迷雾 / 橡皮式擦除）━━━━')
# 迷雾段结束 = keydown 监听器之前（floodFillOnCanvas 的最后一个 '}'）
k = find_line("window.addEventListener('keydown'", s)
e = k - 1
# 去掉 e 后的空行
while lines[e].strip() == '':
    e -= 1
print(f'迷雾段: {s + 1}-{e + 1} (共 {e - s + 1} 行)')

fog_block = lines[s:e + 1]
fog_js = '''/* ━━━ 战术地图 · 战争迷雾模块 ━━━
 * 从 map.js 拆分（2026-08-16 地图代码治理）
 * 必须在 map.js 之前加载（boot 启动时立即调用迷雾函数）
 * 引用 map.js 顶部的全局状态（fogStrokes/fogErasures/fogCanvas 等）
 */
''' + '\n'.join(fog_block) + '\n'
open(FOG, 'w', encoding='utf-8').write(fog_js)
print('→ map-fog.js', len(fog_js), '字符')

# map.js 删除迷雾段
del lines[s:e + 1]
open(SRC, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'→ map.js 剩余 {len(lines)} 行（原 {len(lines) + (e - s + 1)} 行）')

# 语法检查
import subprocess
for p in (SRC, FOG):
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(('✓ ' if r.returncode == 0 else '!! ') + p + ('' if r.returncode == 0 else '\n' + r.stderr[:500]))
    if r.returncode != 0:
        sys.exit(1)
print('拆分完成')
