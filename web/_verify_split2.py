# -*- coding: utf-8 -*-
"""静态对比: 第二轮拆分(north-main.js → tavern/fx)前后语义一致性"""
import re, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
OLD = os.path.join(BASE, '..', 'backups', '2026-08-15_官网功能与北境拆分前', 'web', 'static', 'north-main.js')
NEW = os.path.join(BASE, 'static', 'north-main.js')
TV = os.path.join(BASE, 'static', 'north-tavern.js')
FX = os.path.join(BASE, 'static', 'north-fx.js')

STRIP = re.compile(r"'([^'\\]|\\.)*'|\"([^\"\\]|\\.)*\"|//.*")

def strip_all(s):
    """去注释/字符串/空白, 做语义行对比"""
    out = []
    for l in s.split('\n'):
        l = STRIP.sub('', l).strip()
        if l:
            out.append(l)
    return out

old = open(OLD, encoding='utf-8').read()
ol = old.split('\n')

def find(ls, pat, start=0):
    for i in range(start, len(ls)):
        if pat in ls[i]:
            return i
    raise SystemExit('not found: ' + pat)

# ── 1. 原始块定位 ──
s_tv = find(ol, '// ━━ 酒馆聊天 ━━')
e_tv = find(ol, '_tavernTimer = setInterval(northTavernRefresh, 2000);')
s_fx = find(ol, 'function initSnow()')
aur = find(ol, 'function initAurora()')
depth = 0
e_fx = None
for i in range(aur, len(ol)):
    s = STRIP.sub('', ol[i])
    depth += s.count('{') - s.count('}')
    if depth == 0 and i > aur:
        e_fx = i
        break
assert e_fx is not None
print('备份块: 酒馆 %d-%d, 特效 %d-%d' % (s_tv + 1, e_tv + 1, s_fx + 1, e_fx + 1))

# ── 2. 酒馆块对比(改写 _northUsername → window.NORTH_CTX.username) ──
old_tv = '\n'.join(ol[s_tv:e_tv + 1])
exp_tv = strip_all(old_tv.replace('_northUsername', 'window.NORTH_CTX.username'))
new_tv = strip_all(open(TV, encoding='utf-8').read())
missing = [l for l in exp_tv if l not in new_tv]
print('酒馆块缺失行数(期望0):', len(missing))
for m in missing[:8]:
    print('  缺失:', m[:100])

# ── 3. 特效块对比(备份块去 12 空格缩进) ──
old_fx = '\n'.join(ol[s_fx:e_fx + 1])
exp_fx = strip_all('\n'.join([l[8:] if l.startswith('            ') else l for l in old_fx.split('\n')]))
new_fx = strip_all(open(FX, encoding='utf-8').read())
missing2 = [l for l in exp_fx if l not in new_fx]
print('特效块缺失行数(期望0):', len(missing2))
for m in missing2[:8]:
    print('  缺失:', m[:100])

# ── 4. 主文件对比: 备份(删两块+删init两行+调用点改写+CTX注入) vs 新主文件 ──
keep = ol[:s_tv] + ol[e_tv + 1:s_fx] + ol[e_fx + 1:]
keep = [l for l in keep if l.strip() not in ('initSnow();', 'initAurora();')]
keep_txt = '\n'.join(keep)
keep_txt = keep_txt.replace('northTavernRefresh();', 'window.NORTH_TAVERN.refresh();')
keep_txt = keep_txt.replace(
    "Object.defineProperty(window.NORTH_CTX, 'activeCharId'",
    "Object.defineProperty(window.NORTH_CTX, 'username', { get: function () { return _northUsername; }, configurable: true });\n            Object.defineProperty(window.NORTH_CTX, 'activeCharId'")
e1, e2 = strip_all(keep_txt), strip_all(open(NEW, encoding='utf-8').read())
diff = [x for x in e1 if x not in e2] + [x for x in e2 if x not in e1]
print('主文件差异行数(期望0):', len(diff))
for d in diff[:10]:
    print('  差异:', d[:110])

ok = not missing and not missing2 and not diff
print('\n结论:', '全部一致 ✓' if ok else '存在差异 ✗')
sys.exit(0 if ok else 1)
