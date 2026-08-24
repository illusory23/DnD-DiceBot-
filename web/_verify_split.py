# -*- coding: utf-8 -*-
"""静态对比:拆分后 JS 与原内联 JS 语义一致性"""
import re, sys, io, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

B = glob.glob(r'backups/2026-08-14_等级晋升*')[0]
orig = open(B + '/north-expedition.html', encoding='utf-8-sig').read().split('\n')
new = open('web/static/north-main.js', encoding='utf-8').read().split('\n')
data = open('web/static/north-data.js', encoding='utf-8').read()

STRIP = re.compile(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*")

def find_line(lines, pat, start=0):
    for i in range(start, len(lines)):
        if pat in lines[i]:
            return i
    raise SystemExit('not found: ' + pat)

def brace_in(lines, open_line):
    depth = 0
    for i in range(open_line, len(lines)):
        s = STRIP.sub('', lines[i])
        depth += s.count('{') - s.count('}')
        if depth == 0 and i > open_line:
            return i
    raise SystemExit('brace fail at line ' + str(open_line + 1))

# ── 1) 数据段对比 ──
s_t = find_line(orig, 'const TABLES = {'); e_t = brace_in(orig, s_t)
s_i = find_line(orig, 'const ITEM_ACTIONS = {'); e_i = brace_in(orig, s_i)
s_c = find_line(orig, 'const CHECK_ACTIONS = {'); e_c = brace_in(orig, s_c)
orig_tables = '\n'.join(orig[s_t:e_t + 1])
orig_item = '\n'.join(orig[s_i:e_i + 1])
orig_check = '\n'.join(orig[s_c:e_c + 1])

dlines = data.split('\n')
i_t = find_line(dlines, 'const TABLES = {'); e_t2 = brace_in(dlines, i_t)
i_i = find_line(dlines, 'const ITEM_ACTIONS = {'); e_i2 = brace_in(dlines, i_i)
i_c = find_line(dlines, 'const CHECK_ACTIONS = {'); e_c2 = brace_in(dlines, i_c)
new_tables = '\n'.join(dlines[i_t:e_t2 + 1])
new_item = '\n'.join(dlines[i_i:e_i2 + 1])
new_check = '\n'.join(dlines[i_c:e_c2 + 1])

print('TABLES 与原文一致:', orig_tables == new_tables)
print('ITEM_ACTIONS 与原文一致:', orig_item == new_item)
strip_check = re.sub(r'CTX\.', '', new_check)
print('CHECK_ACTIONS 去 CTX 前缀后与原文一致:', strip_check == orig_check)
bare = [l for l in new_check.split('\n')
        if re.search(r'(?<![A-Za-z0-9_$.])survival\.', l)
        or re.search(r'(?<!CTX\.)\bactiveChar(?:Id)?\b', l)
        or re.search(r'(?<!CTX\.)\b(addSystemLog|runCheckChain|addCheckResult|rollDiceExpr|renderCharDetail)\s*\(', l)]
print('CHECK 段残留裸外部引用行数(期望0):', len(bare))
for b in bare[:5]:
    print('  残留:', b.strip()[:90])

# ── 2) main.js 对比 ──
s_m = find_line(orig, '<script>', 2000)
e_m = find_line(orig, '</script>', s_m)
exp = orig[s_m + 1:e_m]
exp.pop(find_line(exp, 'const TABLE_NAMES = Object.keys(TABLES);'))

def f2(pat, st=0):
    for i in range(st, len(exp)):
        if pat in exp[i]:
            return i
    raise SystemExit('not found2: ' + pat)

st2 = f2('const TABLES = {'); et2 = brace_in(exp, st2)
del exp[st2:et2 + 1]
exp[st2:st2] = ['const TABLES = window.NORTH_DATA.TABLES;', 'const TABLE_NAMES = window.NORTH_DATA.TABLE_NAMES;']
si2 = f2('const ITEM_ACTIONS = {'); ei2 = brace_in(exp, si2)
del exp[si2:ei2 + 1]
exp[si2:si2] = ['const ITEM_ACTIONS = window.NORTH_DATA.ITEM_ACTIONS;']
sc2 = f2('const CHECK_ACTIONS = {'); ec2 = brace_in(exp, sc2)
del exp[sc2:ec2 + 1]
exp[sc2:sc2] = ['const CHECK_ACTIONS = window.NORTH_DATA.CHECK_ACTIONS;']

# main.js 去掉注入块
act = []
skip = False
for l in new:
    if '运行期上下文注入' in l:
        skip = True
        continue
    if skip and '})();' in l:
        skip = False
        act.append('})();')
        continue
    if skip:
        continue
    act.append(l)

def clean(ls):
    return [l.strip() for l in ls if not l.strip().startswith('//')]

ce = clean(exp)
ca = clean(act)
print('main.js 行数 期望/实际:', len(ce), '/', len(ca))
if len(ce) != len(ca):
    print('⚠ 行数不一致!')
diff = 0
for a, b in zip(ce, ca):
    if a != b:
        diff += 1
        if diff <= 10:
            print('DIFF 期望:', a[:100])
            print('DIFF 实际:', b[:100])
print('main.js 非注释行差异数(期望0):', diff)
