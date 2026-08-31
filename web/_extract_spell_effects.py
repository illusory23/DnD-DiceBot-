# -*- coding: utf-8 -*-
"""法术效果库条目提取脚本（第一期：伤害/治疗/临时HP）
从 CHM 词条 HTML 批量提取骰子表达式/豁免/效果，输出候选 JSON 供人工审查。
用法：python web/_extract_spell_effects.py
"""
import json, re, html as h, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = os.path.join(os.path.dirname(__file__), '..', 'data')
CHM = os.path.join(BASE, 'chm_extracted')

def read_detail(detail_link):
    """按 detail_link 读词条文本（utf-8 优先，回退 gbk）"""
    if not detail_link:
        return ''
    rel = detail_link.split('#')[0].lstrip('/')
    path = os.path.join(CHM, rel.replace('/', os.sep))
    if not os.path.isfile(path):
        return ''
    raw = None
    for enc in ('utf-8', 'gbk'):
        try:
            raw = open(path, encoding=enc, errors='strict').read()
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if raw is None:
        raw = open(path, encoding='utf-8', errors='replace').read()
    text = re.sub(r'<[^>]+>', ' ', raw)
    text = h.unescape(text)
    return re.sub(r'\s+', ' ', text)

def main():
    data = json.load(open(os.path.join(BASE, 'spells_full.json'), encoding='utf-8'))
    spells = data if isinstance(data, list) else data.get('spells', [])

    # 手工选定的第一期候选（常用伤害/治疗/临时HP法术）
    candidates = ['火球术', '魔法飞弹', '闪电束', '灼热射线', '灼烧之手', '冰锥术', '冷冻射线',
                  '冰霜射线', '心灵之匕', '飞弹风暴', '燃烧之手', '闪电箭', '冰风暴', '火焰射线',
                  '连环闪电', '火墙术', '冰墙术', '酸液飞溅', '毒云术', '死亡一指',
                  '疗伤术', '治愈真言', '治疗祷言', '群体疗伤术', '群体治愈真言', '医疗术',
                  '再生术', '次级复原术', '愈合祷言',
                  '虚假生命', '护盾术', '援助术', '树肤术', '英雄气概']

    out = {}
    for s in spells:
        cn = s.get('name_cn', '') or s.get('name', '')
        if cn not in candidates:
            continue
        txt = read_detail(s.get('detail_link', ''))
        if not txt:
            out[cn] = {'warn': '词条未找到'}
            continue
        # 定位目标法术段落：锚点"中文名｜英文名" → 下一个"XX｜YY"前
        m_anchor = re.search(re.escape(cn) + r'[｜|]', txt)
        if not m_anchor:
            out[cn] = {'warn': '锚点未找到'}
            continue
        seg = txt[m_anchor.end():]
        m_next = re.search(r'[一-鿿]{2,6}[｜|][A-Za-z]', seg)
        if m_next:
            seg = seg[:m_next.start()]
        entry = {}
        # 伤害表达式：XdY(±Z) + 伤害类型（伤害词前，仅在目标法术段落内匹配）
        m = re.search(r'([1-9]\d*)?d\d{1,3}(?:\s*[+-]\s*\d{1,3})?\s*(?:点\s*)?(火焰|寒冷|闪电|力场|心灵|毒素|酸液|雷鸣|光耀|暗蚀|钝击|挥砍|穿刺|雷电|冰霜)?伤害', seg)
        if m:
            entry['expr'] = m.group(0).split('伤害')[0].replace(' ', '')
            if m.group(2):  # 伤害类型
                entry['dmgType'] = m.group(2)
        # 豁免类型（目标法术段落内）
        m2 = re.search(r'(力量|敏捷|体质|智力|感知|魅力)\s*豁免', seg)
        if m2:
            entry['save'] = m2.group(1)
        # 治疗表达式：恢复/回复 XdY(±Z) 生命（目标法术段落内）
        m3 = re.search(r'(?:恢复|回复)\s*(?:[1-9]\d*)?d\d{1,3}(?:\s*[+-]\s*\d{1,3})?\s*点?\s*(?:生命值|生命)', seg)
        if m3:
            entry['heal'] = m3.group(0).replace('恢复', '').replace('回复', '').replace('点', '').replace('生命值', '').replace('生命', '').strip()
        # 临时生命（目标法术段落内）
        m4 = re.search(r'(?:获得|得到|具有)\s*([1-9]\d*)?d\d{1,3}(?:\s*[+-]\s*\d{1,3})?\s*点?\s*临时生命值', seg)
        if m4:
            entry['temp'] = m4.group(0).replace('获得', '').replace('得到', '').replace('具有', '').replace('点', '').replace('临时生命值', '').strip()
        out[cn] = entry
    print(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main()
