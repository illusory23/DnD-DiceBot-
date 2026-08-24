# -*- coding: utf-8 -*-
"""第二轮北境拆分: north-main.js (~6200 行) → 3 个文件
- 酒馆聊天(northTavernRefresh/renderTavernMessages/northTavernSend/toggleTavernMenu + 轮询) → north-tavern.js
- 视觉特效(initSnow/initAurora, 完全自包含) → north-fx.js
- north-main.js 仅删块 + 改调用点 + CTX 注入 username(getter)
"""
import re, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os
_BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(_BASE, 'static', 'north-main.js')
TAVERN = os.path.join(_BASE, 'static', 'north-tavern.js')
FX = os.path.join(_BASE, 'static', 'north-fx.js')

lines = open(SRC, encoding='utf-8').read().split('\n')
N = len(lines)

def find_line(pat, start=0):
    for i in range(start, N):
        if pat in lines[i]:
            return i
    raise SystemExit('未找到: ' + pat)

def strip_str(s):
    return re.sub(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*", '', s)

def brace_from(open_line):
    """从 open_line 起(含该行)找到 depth 归零的 '}' 行号"""
    depth = 0
    for i in range(open_line, N):
        s = strip_str(lines[i])
        depth += s.count('{') - s.count('}')
        if depth <= 0 and i > open_line and '{' in lines[i]:
            return i
        if depth == 0 and '}' in lines[i] and '{' not in lines[i]:
            return i
    raise SystemExit('括号不配对: ' + str(open_line + 1))

def verify_js(path):
    """node 语法检查(存在 node 时)"""
    import subprocess
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    if r.returncode != 0:
        print(f'!! 语法错误 {path}:\n{r.stderr[:800]}')
        return False
    print(f'✓ 语法通过: {path}')
    return True

# ═══════════════ 1. 定位酒馆块(注释行 → setInterval 行) ═══════════════
s_tv = find_line('// ━━ 酒馆聊天 ━━')
e_tv = find_line('_tavernTimer = setInterval(northTavernRefresh, 2000);')
print(f'酒馆块: {s_tv + 1}-{e_tv + 1}')

# ═══════════════ 2. 定位特效块(function initSnow → function initAurora 结束) ═══════════════
s_fx = find_line('function initSnow()')
# initAurora 的结束: 找 'function initAurora()' 后配对(函数体最深一层)
aur_line = find_line('function initAurora()')
depth = 0
e_fx = None
for i in range(aur_line, N):
    s = strip_str(lines[i])
    depth += s.count('{') - s.count('}')
    if depth == 0 and i > aur_line:
        e_fx = i
        break
if e_fx is None:
    raise SystemExit('initAurora 结束定位失败')
# 去掉 e_fx 之后可能紧跟的空行,保留一个空行
print(f'特效块: {s_fx + 1}-{e_fx + 1}')

# ═══════════════ 3. 提取酒馆块 → north-tavern.js ═══════════════
tv_block = lines[s_tv:e_tv + 1]
tv_text = '\n'.join(tv_block)
# 闭包引用改写: _northUsername → CTX.username(getter)
tv_text = tv_text.replace('_northUsername', 'window.NORTH_CTX.username')
tavern_js = '''/* ━━━ 北境雪原 · 酒馆聊天模块 ━━━
 * 从 north-main.js 拆分（2026-08-15 第二轮拆分）
 * 独立轮询 /api/tavern/chat/messages，依赖 window.NORTH_CTX.username（由 north-main.js 注入）
 */
(function () {
    'use strict';
''' + tv_text + '''
    window.NORTH_TAVERN = { refresh: northTavernRefresh };

    // 页面就绪后启动 2 秒轮询（原逻辑在 init() 中启动）
    function start() {
        _tavernTimer = setInterval(northTavernRefresh, 2000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
'''
# 原块内 3890 注释行缩进 16 空格,搬到模块顶层统一为 4 空格
tavern_js = tavern_js.replace(tv_block[0], "    // ━━ 酒馆聊天 ━━")
open(TAVERN, 'w', encoding='utf-8').write(tavern_js)
print('→', TAVERN, len(tavern_js), '字符')

# ═══════════════ 4. 提取特效块 → north-fx.js ═══════════════
fx_lines = lines[s_fx:e_fx + 1]
fx_text = '\n'.join(fx_lines)
# 去掉函数外缩进 12 空格 → 4 空格(保持可读)
fx_lines2 = [l[8:] if l.startswith('            ') else l for l in fx_text.split('\n')]
fx_text = '\n'.join(fx_lines2)
fx_js = '''/* ━━━ 北境雪原 · 视觉特效模块 ━━━
 * 从 north-main.js 拆分（2026-08-15 第二轮拆分）
 * 完全自包含: 雪花飘落 + 极光动画, 仅依赖 canvas DOM
 */
(function () {
    'use strict';
''' + fx_text + '''

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initSnow();
            initAurora();
        });
    } else {
        initSnow();
        initAurora();
    }
})();
'''
open(FX, 'w', encoding='utf-8').write(fx_js)
print('→', FX, len(fx_js), '字符')

# ═══════════════ 5. 修改主文件 ═══════════════
# 5.1 删除特效块(从后往前删,避免行号漂移)
del lines[s_fx:e_fx + 1]
# 5.2 删除酒馆块
del lines[s_tv:e_tv + 1]
# 5.3 删除 init() 中的 initSnow()/initAurora() 两行
def pop_line(pat):
    global lines
    for i in range(len(lines)):
        if lines[i].strip() == pat:
            del lines[i]
            return
    raise SystemExit('未找到待删行: ' + pat)
pop_line('initSnow();')
pop_line('initAurora();')
# 5.4 调用点改写: activateTab('tavern') 内 northTavernRefresh()
for i in range(len(lines)):
    if 'northTavernRefresh();' in lines[i]:
        lines[i] = lines[i].replace('northTavernRefresh();', 'window.NORTH_TAVERN.refresh();')
        print(f'调用点改写: 第 {i + 1} 行')
# 5.5 CTX 注入 username getter(_northUsername 会被重新赋值, 必须 getter 实时读取)
anchor = "Object.defineProperty(window.NORTH_CTX, 'activeCharId'"
for i in range(len(lines)):
    if anchor in lines[i]:
        lines.insert(i + 1, "            Object.defineProperty(window.NORTH_CTX, 'username', { get: function () { return _northUsername; }, configurable: true });")
        print(f'CTX username getter 注入: 第 {i + 2} 行')
        break

open(SRC, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'→ {SRC} 剩余 {len(lines)} 行(原 {N} 行, 删除 {N - len(lines)} 行)')

# ═══════════════ 6. 语法验证 ═══════════════
ok = True
for p in (SRC, TAVERN, FX):
    ok = verify_js(p) and ok
sys.exit(0 if ok else 1)
