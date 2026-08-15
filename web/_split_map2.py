# -*- coding: utf-8 -*-
"""map.js 二次拆分: IndexedDB → map-idb.js, 存档槽 → map-saves.js, 内联JS → map-page.js
加载顺序: map-idb.js → map-fog.js → map-saves.js → map.js（boot 末尾执行时函数已全部定义）
"""
import sys, io, os, re, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'static', 'map.js')
IDB = os.path.join(BASE, 'static', 'map-idb.js')
SAVES = os.path.join(BASE, 'static', 'map-saves.js')
HTML = os.path.join(BASE, '..', 'web', 'templates', 'map.html')
PAGE = os.path.join(BASE, 'static', 'map-page.js')

def strip_code(s):
    """去注释后保留代码（含字符串），用于一致性检查"""
    return re.sub(r'//.*', '', s).strip()

# ═══════ 1. 提取 IndexedDB 段（204-274）═══════
lines = open(SRC, encoding='utf-8').read().split('\n')
def find_line(pat, start=0):
    for i in range(start, len(lines)):
        if pat in lines[i]:
            return i
    raise SystemExit('未找到: ' + pat)

s_idb = find_line('// ━━ IndexedDB 封装（持久连接')
s_next = find_line('// ━━━ 状态收集/应用（可复用于存档槽系统）')
e_idb = s_next - 1
while lines[e_idb].strip() == '':
    e_idb -= 1
idb_block = lines[s_idb:e_idb + 1]
idb_js = '''/* ━━━ 战术地图 · IndexedDB 缓存模块 ━━━
 * 从 map.js 拆分（2026-08-16 二次治理）
 * 必须在 map.js 之前加载（boot 启动时 await initDB()）
 */
''' + '\n'.join(idb_block) + '\n'
open(IDB, 'w', encoding='utf-8').write(idb_js)
print(f'→ map-idb.js {s_idb + 1}-{e_idb + 1} ({len(idb_block)} 行)')

# ═══════ 2. 提取存档槽段（573-1016）═══════
s_sav = find_line('// ━━━ 存档槽系统')
s_next2 = find_line('// ━━━ 坐标转换')
e_sav = s_next2 - 1
while lines[e_sav].strip() == '':
    e_sav -= 1
sav_block = lines[s_sav:e_sav + 1]
sav_js = '''/* ━━━ 战术地图 · 存档槽与地图存档模块 ━━━
 * 从 map.js 拆分（2026-08-16 二次治理）
 * 必须在 map.js 之前加载（boot 启动时调用 renderSaveMenu 等）
 * 引用 map.js 顶部的状态变量（STORAGE_KEY/DB_NAME/collectState 等）
 */
''' + '\n'.join(sav_block) + '\n'
open(SAVES, 'w', encoding='utf-8').write(sav_js)
print(f'→ map-saves.js {s_sav + 1}-{e_sav + 1} ({len(sav_block)} 行)')

# ═══════ 3. map.js 删除两段（先删后段再删前段，避免行号漂移）═══════
del lines[s_sav:e_sav + 1]
del lines[s_idb:e_idb + 1]
open(SRC, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'→ map.js 剩余 {len(lines)} 行')

# ═══════ 4. map.html 内联 JS 外置 → map-page.js ═══════
html = open(HTML, encoding='utf-8').read()
# 提取两个内联 script 段（最后一个 <script> 之前的两个）
import re as _re
scripts = list(_re.finditer(r'<script>\n(.*?)</script>', html, _re.DOTALL))
if len(scripts) < 2:
    raise SystemExit('内联 script 段不足: ' + str(len(scripts)))
inline1, inline2 = scripts[-2], scripts[-1]
page_js = '''/* ━━━ 战术地图 · 页面内联逻辑模块（加入房间遮罩 / 返回与统计）━━━
 * 从 map.html 内联 script 外置（2026-08-16 二次治理）
 */
''' + inline1.group(1) + '\n\n' + inline2.group(1) + '\n'
open(PAGE, 'w', encoding='utf-8').write(page_js)
print('→ map-page.js', len(page_js), '字符')

# HTML: 替换两个内联 script 为外链引用
html = html[:inline1.start()] + '    <script src="/static/map-page.js?v=54"></script>\n' + html[inline2.end():]
# 版本号递增
html = html.replace('map-fog.js?v=53', 'map-fog.js?v=54')
html = html.replace('map.js?v=53', 'map.js?v=54')
# 引入 map-idb.js / map-saves.js（map.js 之前）
html = html.replace('    <script src="/static/map-fog.js?v=54"></script>\n    <script src="/static/map.js?v=54"></script>',
                    '    <script src="/static/map-idb.js?v=54"></script>\n    <script src="/static/map-fog.js?v=54"></script>\n    <script src="/static/map-saves.js?v=54"></script>\n    <script src="/static/map.js?v=54"></script>')
open(HTML, 'w', encoding='utf-8').write(html)
print('→ map.html 内联已外置')

# ═══════ 5. 语法检查 ═══════
ok = True
for p in (SRC, IDB, SAVES, PAGE):
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    print(('✓ ' if r.returncode == 0 else '!! ') + p)
    if r.returncode != 0:
        print(r.stderr[:400])
        ok = False
sys.exit(0 if ok else 1)
