# -*- coding: utf-8 -*-
"""拆分 north-expedition.html:
- CSS(UI) → /static/north-expedition.css
- 事件数据(TABLES/ITEM_ACTIONS/CHECK_ACTIONS) → /static/north-data.js
- 逻辑(全局函数+主 IIFE) → /static/north-main.js
- HTML 保留骨架,改为外链引用
"""
import re, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = r'web/templates/north-expedition.html'
CSS = r'web/static/north-expedition.css'
DATA = r'web/static/north-data.js'
MAIN = r'web/static/north-main.js'

raw = open(SRC, encoding='utf-8-sig').read()
lines = raw.split('\n')

def find_line(pattern, start=0):
    for i in range(start, len(lines)):
        if pattern in lines[i]:
            return i
    raise SystemExit('未找到: ' + pattern)

def match_brace(open_line):
    """括号配对:从 open_line 的 '{' 所在行开始,返回配对的 '}' 行号"""
    depth = 0
    for i in range(open_line, len(lines)):
        s = re.sub(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*", '', lines[i])
        depth += s.count('{') - s.count('}')
        if depth == 0 and i > open_line:
            return i
    raise SystemExit('括号不配对,起始行 ' + str(open_line + 1))

# ── 定位 ──
s_style = find_line('<style>')
e_style = find_line('</style>')
s_tables = find_line('const TABLES = {')
e_tables = match_brace(s_tables)
tn_line = find_line('const TABLE_NAMES = Object.keys(TABLES);')
s_item = find_line('const ITEM_ACTIONS = {')
e_item = match_brace(s_item)
s_check = find_line('const CHECK_ACTIONS = {')
e_check = match_brace(s_check)
s_main = find_line('<script>', 2000)      # 主脚本块
e_main = find_line('</script>', s_main)   # 主脚本块结束
assert s_style == 8 and e_style == 1681, 'style 边界异常: %d-%d' % (s_style, e_style)

print('style: %d-%d | TABLES: %d-%d | TN: %d | ITEM: %d-%d | CHECK: %d-%d | main: %d-%d' % (
    s_style, e_style, s_tables, e_tables, tn_line, s_item, e_item, s_check, e_check, s_main, e_main))

# ── 1. CSS ──
css_content = '\n'.join(lines[s_style + 1:e_style])
open(CSS, 'w', encoding='utf-8').write(css_content + '\n')
print('CSS 写入:', len(css_content), '字符')

# ── 2. 数据文件 ──
tables_body = '\n'.join(lines[s_tables:e_tables + 1])
item_body = '\n'.join(lines[s_item:e_item + 1])
check_body = '\n'.join(lines[s_check:e_check + 1])

# CHECK_ACTIONS 闭包引用 → CTX.* (词边界替换,防误伤字符串)
CTX_MAP = [
    ('survival', 'CTX.survival'),
    ('addSystemLog', 'CTX.addSystemLog'),
    ('runCheckChain', 'CTX.runCheckChain'),
    ('activeCharId', 'CTX.activeCharId'),
    ('activeChar', 'CTX.activeChar'),
    ('addCheckResult', 'CTX.addCheckResult'),
    ('rollDiceExpr', 'CTX.rollDiceExpr'),
    ('renderCharDetail', 'CTX.renderCharDetail'),
]
counts = {}
for name, repl in CTX_MAP:
    pat = re.compile(r'(?<![A-Za-z0-9_$])' + name + r'(?![A-Za-z0-9_$])')
    check_body, n = pat.subn(repl, check_body)
    counts[name] = n
print('CHECK_ACTIONS 改写次数:', counts)

data_js = '''/* ━━━ 北境雪原 · 事件数据文件 ━━━
 * 从 north-expedition.html 拆分（2026-08-14 三合一优化）
 * 包含：TABLES（16 张事件表）、ITEM_ACTIONS（材料自动拾取）、CHECK_ACTIONS（检定交互表）
 * CHECK_ACTIONS 内含闭包回调，依赖运行期上下文 → window.NORTH_CTX（由 north-main.js 注入）
 */
(function () {
    'use strict';
    var CTX = window.NORTH_CTX = window.NORTH_CTX || {};

''' + tables_body + '''

''' + '            const TABLE_NAMES = Object.keys(TABLES);' + '''

''' + item_body + '''

''' + check_body + '''

    window.NORTH_DATA = {
        TABLES: TABLES,
        TABLE_NAMES: TABLE_NAMES,
        ITEM_ACTIONS: ITEM_ACTIONS,
        CHECK_ACTIONS: CHECK_ACTIONS
    };
})();
'''
open(DATA, 'w', encoding='utf-8').write(data_js)
print('数据文件写入:', len(data_js), '字符')

# ── 3. 主逻辑文件 ──
main_lines = lines[s_main + 1:e_main]  # 排除 <script> 标签行

def match_brace_in(ml, open_line):
    """在 ml 中从 open_line 起括号配对"""
    depth = 0
    for i in range(open_line, len(ml)):
        s = re.sub(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*", '', ml[i])
        depth += s.count('{') - s.count('}')
        if depth == 0 and i > open_line:
            return i
    raise SystemExit('括号不配对: ' + ml[open_line][:60])

def find_in(ml, pattern, start=0):
    for i in range(start, len(ml)):
        if pattern in ml[i]:
            return i
    raise SystemExit('未找到: ' + pattern)

# 替换 TABLES 段(用内容定位,不依赖原文件行号)
s_t2 = find_in(main_lines, 'const TABLES = {')
e_t2 = match_brace_in(main_lines, s_t2)
tn2 = find_in(main_lines, 'const TABLE_NAMES = Object.keys(TABLES);', e_t2)
del main_lines[tn2]
del main_lines[s_t2:e_t2 + 1]
main_lines[s_t2:s_t2] = [
    '            // =========================================================================',
    '            // 一、完整事件表（数据定义已移入 /static/north-data.js，经 window.NORTH_DATA 注入）',
    '            // =========================================================================',
    '            const TABLES = window.NORTH_DATA.TABLES;',
    '            const TABLE_NAMES = window.NORTH_DATA.TABLE_NAMES;',
]

# 替换 ITEM_ACTIONS 段
s_item2 = find_in(main_lines, 'const ITEM_ACTIONS = {')
e_item2 = match_brace_in(main_lines, s_item2)
del main_lines[s_item2:e_item2 + 1]
main_lines[s_item2:s_item2] = [
    '            // =========================================================================',
    '            // 六、材料自动拾取 TABLE_ITEM_ACTIONS（数据定义已移入 north-data.js）',
    '            const ITEM_ACTIONS = window.NORTH_DATA.ITEM_ACTIONS;',
]

# 替换 CHECK_ACTIONS 段
s_check2 = find_in(main_lines, 'const CHECK_ACTIONS = {')
e_check2 = match_brace_in(main_lines, s_check2)
del main_lines[s_check2:e_check2 + 1]
main_lines[s_check2:s_check2] = [
    '            // =========================================================================',
    '            // 检定交互表：CHECK_ACTIONS[表键][骰值] = { title, desc, steps }',
    '            // 每个step: { label, ability, dc, skill?, save?, damage?, passMsg, failMsg, passDone, failDone, passExtra?, failExtra? }',
    '            // 数据定义已移入 north-data.js（含闭包回调，经 window.NORTH_CTX 注入运行期上下文）',
    '            // =========================================================================',
    '            const CHECK_ACTIONS = window.NORTH_DATA.CHECK_ACTIONS;',
]

# 末尾注入 CTX(在 })(); 之前)
inject_block = '''
            // ━━ 事件数据运行期上下文注入（north-data.js 的 CHECK_ACTIONS 回调依赖）━━
            // activeChar/activeCharId 会被重新赋值,必须用 getter 实时读取
            Object.defineProperty(window.NORTH_CTX, 'activeChar', { get: function () { return activeChar; }, configurable: true });
            Object.defineProperty(window.NORTH_CTX, 'activeCharId', { get: function () { return activeCharId; }, configurable: true });
            window.NORTH_CTX.survival = survival;
            window.NORTH_CTX.addSystemLog = addSystemLog;
            window.NORTH_CTX.runCheckChain = runCheckChain;
            window.NORTH_CTX.addCheckResult = addCheckResult;
            window.NORTH_CTX.rollDiceExpr = rollDiceExpr;
            window.NORTH_CTX.renderCharDetail = renderCharDetail;
'''
close_idx = next(i for i in reversed(range(len(main_lines))) if main_lines[i].strip() == '})();')
main_lines.insert(close_idx, inject_block)

open(MAIN, 'w', encoding='utf-8').write('\n'.join(main_lines) + '\n')
print('主逻辑文件写入:', len(main_lines), '行')

# ── 4. 新 HTML ──
new_lines = []
new_lines.extend(lines[:s_style])          # 到 <style> 之前
new_lines.append('    <link rel="stylesheet" href="/static/north-expedition.css">')
new_lines.extend(lines[e_style + 1:s_main])  # </style> 后到主 script 前
new_lines.append('    <script src="/static/north-data.js"></script>')
new_lines.append('    <script src="/static/north-main.js"></script>')
new_lines.extend(lines[e_main + 1:])         # </script> 之后(module script 等)
open(SRC, 'w', encoding='utf-8').write('\n'.join(new_lines) + '\n')
print('HTML 重写完成:', len(new_lines), '行')
