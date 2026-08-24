# -*- coding: utf-8 -*-
"""LMoP 附录B PDF 文本 vs custom/monsters.json 严格对比（NFKC 归一化）"""
import json, re, unicodedata

def norm(s):
    s = s.replace('　', '')
    s = unicodedata.normalize('NFKC', s)  # 兼容区/康熙部首 → 标准字符
    s = re.sub(r'\s+', '', s)
    return s

pdf = open('data/lmop_monsters_v2.txt', encoding='utf-8').read()
pdf = re.sub(r'===PDF PAGE \d+===', '', pdf)
pdf = re.sub(r'^\s*\d+\s*$', '', pdf, flags=re.M)

monsters = ['哥布林', '狼', '熊地精', '红烙印恶霸', '骷髅', '独眼怪', '邪恶法师',
            '蚊蝠', '食尸鬼', '食人魔', '大地精', '兽人', '枭熊', '僵尸', '枯枝怪',
            '巨蜘蛛', '年轻绿龙', '信徒', '掘地兽', '燃烧之颅', '变形怪', '黑蜘蛛']
positions = [(pdf.find(n), n) for n in monsters]
positions.sort()
blocks = {}
for i, (p, n) in enumerate(positions):
    end = positions[i + 1][0] if i + 1 < len(positions) else len(pdf)
    blocks[n] = pdf[p:end]

custom = json.load(open('data/custom/monsters.json', encoding='utf-8'))

def grab(t, pat):
    m = re.search(pat, t)
    return m.group(1) if m else '??'

FIELD_PATTERNS = [
    ('AC',   r'AC\s*[：:]?\s*([^\n]+)'),
    ('HP',   r'HP\s*[：:]?\s*([^\n]+)'),
    ('速度', r'速度\s*[：:]?\s*([^\n]+)'),
    ('CR',   r'挑战等级\s*[：:]?\s*([^\n]+)'),
    ('属性', r'(力量[^\n]*)'),
]

for m in custom:
    name = m['name']
    dn, pn = norm(m['detail_text']), norm(blocks.get(name, ''))
    if dn == pn:
        print(f'OK  {name} 全文一致')
        continue
    diffs = []
    for label, pat in FIELD_PATTERNS:
        cv, pv = grab(dn, pat), grab(pn, pat)
        if cv != pv:
            diffs.append(f'{label}: custom[{cv}] vs pdf[{pv}]')
    if diffs:
        print(f'DIFF {name}: ' + ' | '.join(diffs))
    else:
        print(f'DIFF {name}: 关键字段相同，但全文文本存在差异（见下方）')
        # 输出行级差异
        clines = [norm(l) for l in m['detail_text'].split('\n') if norm(l)]
        plines = [norm(l) for l in blocks.get(name, '').split('\n') if norm(l)]
        for i, (c, p) in enumerate(zip(clines, plines)):
            if c != p:
                print(f'   行{i} custom: {c}')
                print(f'   行{i} pdf   : {p}')
