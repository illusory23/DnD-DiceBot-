# -*- coding: utf-8 -*-
"""从 5e.kiwee.top（5etools 中文站）导入怪物数据到资源库

kiwee 数据为 5e（2014）规则、已汉化（name 中文 / ENG_name 英文，
含完整属性/特性/动作文本）。转换输出：
  1. data/chm_extracted/<目录>/<英文名>.htm — 每个怪物一个词条卡
     （detail_link 指向它，chm_search.read_detail_page 可直接读取）
  2. data/monsters_full.json — 追加条目（按 (name_cn, name_en) 去重）

用法:
  python _import_kiwee_bestiary.py [kiwee_json] [--source MM] [--dir 怪物图鉴2014]

示例:
  python _import_kiwee_bestiary.py data/bestiary/bestiary-mm.json
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent          # 骰娘/
DATA = BASE / 'data'
CHM_DIR = DATA / 'chm_extracted'
BACKUP_DIR = BASE / 'backups'

# ━━━ 转换表 ━━━
SIZE_CN = {'T': '微型', 'S': '小型', 'M': '中型', 'L': '大型', 'G': '巨型', 'H': '超巨型'}
TYPE_CN = {
    'aberration': '异怪', 'beast': '野兽', 'celestial': '天界生物', 'construct': '构装生物',
    'dragon': '龙类', 'elemental': '元素生物', 'fey': '妖精', 'fiend': '邪魔',
    'giant': '巨人', 'humanoid': '类人生物', 'monstrosity': '怪兽', 'ooze': '泥怪',
    'plant': '植物', 'undead': '亡灵', 'swarm': '集群', 'titan': '泰坦',
}
ALIGN_CN = {
    'LG': '守序善良', 'NG': '中立善良', 'CG': '混乱善良', 'LN': '守序中立',
    'N': '绝对中立', 'CN': '混乱中立', 'LE': '守序邪恶', 'NE': '中立邪恶',
    'CE': '混乱邪恶', 'U': '无阵营', 'ANY': '任意',
}
ABBR_CN = {'str': '力量', 'dex': '敏捷', 'con': '体质', 'int': '智力', 'wis': '感知', 'cha': '魅力'}
SKILL_CN = {
    'acrobatics': '特技', 'animal handling': '驯兽', 'arcana': '奥秘', 'athletics': '运动',
    'deception': '欺诈', 'history': '历史', 'insight': '洞悉', 'intimidation': '威吓',
    'investigation': '调查', 'medicine': '医药', 'nature': '自然', 'perception': '察觉',
    'performance': '表演', 'persuasion': '游说', 'religion': '宗教', 'sleight of hand': '巧手',
    'stealth': '隐匿', 'survival': '生存',
}
DAMAGE_CN = {
    'acid': '强酸', 'bludgeoning': '钝击', 'cold': '寒冷', 'fire': '火焰',
    'force': '力场', 'lightning': '闪电', 'necrotic': '暗蚀', 'piercing': '穿刺',
    'poison': '毒素', 'psychic': '心灵', 'radiant': '光耀', 'slashing': '挥砍',
    'thunder': '雷鸣', 'nonmagical': '非魔法', 'magical': '魔法',
}

def _clean_tags(s: str) -> str:
    """清理 5etools 标记：{@damage 1d6} → 1d6；{@hit} → 空"""
    if not s:
        return s
    s = re.sub(r'\{@(?:[a-z]+)\s+([^}]*)\}', r'\1', s)
    s = re.sub(r'\{@[a-z]+\}', '', s)
    return s.strip()

def render_entries(entries) -> str:
    """递归拼接 entries（含嵌套命名段）为纯文本"""
    parts = []

    def walk(o):
        if isinstance(o, str):
            parts.append(_clean_tags(o))
        elif isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            if 'entries' in o and ('name' in o or 'ENG_name' in o):
                name = o.get('name') or ''
                sub = render_entries(o.get('entries'))
                parts.append(f'{name}：{sub}' if name else sub)
            else:
                for v in o.values():
                    walk(v)

    walk(entries)
    return ' '.join(p for p in parts if p)

def render_blocks(items, header: str) -> str:
    """渲染 特性/动作/反应/传奇动作 区块"""
    if not items:
        return ''
    lines = [header]
    for it in items:
        if isinstance(it, dict):
            name = it.get('name', '')
            txt = render_entries(it.get('entries'))
            lines.append(f'{name}：{txt}' if name else txt)
        else:
            lines.append(render_entries(it))
    return '\n'.join(lines)

def render_ac(ac) -> str:
    """ac: 12 / [12] / [12, {ac:17, condition:...}] → 取第一个数字"""
    if isinstance(ac, list):
        if not ac:
            return '?'
        ac = ac[0]
    if isinstance(ac, dict):
        return str(ac.get('ac', '?'))
    return str(ac)

def render_speed(speed) -> str:
    if not isinstance(speed, dict):
        return str(speed) if speed else '0尺'
    order = [('walk', ''), ('burrow', '掘地'), ('climb', '攀爬'), ('fly', '飞行'), ('swim', '游泳')]
    parts = []
    for key, cn in order:
        v = speed.get(key)
        if v is None or v == 0:
            continue
        parts.append(f'{cn}{v}尺' if cn else f'{v}尺')
    return '，'.join(parts) if parts else '0尺'

def render_dmg_list(items, label: str) -> str:
    """伤害抗性/免疫/易伤：["fire", "cold"] 或嵌套对象 → 中文"""
    if not items:
        return ''
    names = []
    for it in items:
        if isinstance(it, dict):
            # 嵌套结构如 {"resist": ["fire"], "note": "..."}
            for sub in it.values():
                if isinstance(sub, list):
                    for x in sub:
                        if isinstance(x, str):
                            names.append(_clean_tags(x))
                elif isinstance(sub, str):
                    names.append(_clean_tags(sub))
        else:
            names.append(_clean_tags(str(it)))
    return f'{label}：{"，".join(names)}'

def render_save(save) -> str:
    if not save:
        return ''
    parts = []
    for k in ('str', 'dex', 'con', 'int', 'wis', 'cha'):
        v = save.get(k)
        if v is not None:
            parts.append(f'{ABBR_CN[k]}{v}')
    return f'豁免：{"，".join(parts)}' if parts else ''

def render_skill(skill) -> str:
    if not skill:
        return ''
    parts = []
    for k, v in skill.items():
        cn = SKILL_CN.get(k.lower(), k)
        parts.append(f'{cn}{v}')
    return f'技能：{"，".join(parts)}' if parts else ''

def _type_info(m: dict) -> tuple[str, str]:
    """返回 (类型中文, 附加标签)；兼容 type 为字符串或对象两种格式"""
    t = m.get('type')
    if isinstance(t, dict):
        ttype = TYPE_CN.get((t.get('type') or '?').lower(), t.get('type') or '?')
        tags = t.get('tags') or []
    else:
        ttype = TYPE_CN.get(str(t or '?').lower(), str(t or '?'))
        tags = []
    if tags:
        ttype += f"（{'、'.join(str(x) for x in tags)}）"
    return ttype, ''

def _cr_str(cr) -> str:
    """cr 可能是字符串（"1/4"）或对象（{"cr": "21", "lair": "22"} 巢穴怪物）"""
    if isinstance(cr, dict):
        return str(cr.get('cr', '?'))
    return str(cr) if cr is not None else '?'

def render_body(m: dict) -> str:
    cn = m.get('name', '?')
    en = m.get('ENG_name', '')
    size = SIZE_CN.get((m.get('size') or ['?'])[0], '?')
    ttype, _ = _type_info(m)
    algns = m.get('alignment') or []
    align = ALIGN_CN.get(str(algns[0]) if algns else '', '')
    cr = _cr_str(m.get('cr'))
    hp = m.get('hp') or {}
    hp_avg = hp.get('average')
    hp_formula = hp.get('formula', '')
    legendary = '有' if m.get('legendary') else '无'
    senses = m.get('senses') or []
    passive = m.get('passive')
    languages = m.get('languages') or []

    lines = [
        f'{cn}{en}',
        f'{size}{ttype}，{align}'.rstrip('，'),
        f'AC {render_ac(m.get("ac"))}',
        f'HP {hp_avg}（{hp_formula}）' if hp_avg else 'HP ?',
        f'速度 {render_speed(m.get("speed"))}',
        f"力量{m.get('str','?')} 敏捷{m.get('dex','?')} 体质{m.get('con','?')} 智力{m.get('int','?')} 感知{m.get('wis','?')} 魅力{m.get('cha','?')}",
    ]
    s = render_save(m.get('save'))
    if s:
        lines.append(s)
    s = render_skill(m.get('skill'))
    if s:
        lines.append(s)
    s = render_dmg_list(m.get('resist'), '伤害抗性')
    if s:
        lines.append(s)
    s = render_dmg_list(m.get('immune'), '伤害免疫')
    if s:
        lines.append(s)
    if m.get('conditionImmune'):
        lines.append(f"状态免疫：{'、'.join(str(x) for x in m['conditionImmune'])}")
    s = render_dmg_list(m.get('vulnerable'), '伤害易伤')
    if s:
        lines.append(s)
    if senses:
        sense_text = '，'.join(str(x) for x in senses)
        if passive and '被动' not in sense_text:
            sense_text += f'；被动察觉{passive}'
        lines.append(f'感官：{sense_text}')
    elif passive:
        lines.append(f'被动察觉{passive}')
    if languages:
        lines.append(f'语言：{"，".join(str(x) for x in languages)}')
    lines.append(f'CR {cr}')

    blocks = [
        render_blocks(m.get('trait'), '【特性】'),
        render_blocks(m.get('action'), '【动作】'),
        render_blocks(m.get('reaction'), '【反应】'),
        render_blocks(m.get('legendary'), '【传奇动作】'),
    ]
    for b in blocks:
        if b:
            lines.append(b)
    return '\n'.join(lines)

def esc_html(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def main():
    kiwee_json = sys.argv[1] if len(sys.argv) > 1 else None
    source = 'MM'
    out_dir = '怪物图鉴2014'
    for i, a in enumerate(sys.argv):
        if a == '--source' and i + 1 < len(sys.argv):
            source = sys.argv[i + 1]
        if a == '--dir' and i + 1 < len(sys.argv):
            out_dir = sys.argv[i + 1]

    if not kiwee_json or not Path(kiwee_json).exists():
        print('用法: python _import_kiwee_bestiary.py <kiwee_bestiary.json> [--source MM] [--dir 怪物图鉴2014]')
        sys.exit(1)

    with open(kiwee_json, encoding='utf-8') as f:
        data = json.load(f)
    monsters = data.get('monster') or data if isinstance(data, list) else data.get('monster', [])
    if isinstance(data, list):
        monsters = data
    print(f'读取 kiwee 数据: {len(monsters)} 个怪物')

    # 备份现有索引
    if (DATA / 'monsters_full.json').exists():
        bak = BACKUP_DIR / f'monsters_full_导入{out_dir}前_{__import__("datetime").datetime.now():%Y%m%d_%H%M%S}.json'
        shutil.copy2(DATA / 'monsters_full.json', bak)
        print(f'已备份 monsters_full.json → {bak.name}')

    with open(DATA / 'monsters_full.json', encoding='utf-8') as f:
        existing = json.load(f)
    # 去重键含 source：同名不同规则版本（5e MM / 5r MM25）允许并存
    existing_keys = {(e.get('name_cn', ''), e.get('name_en', ''), e.get('source', '')) for e in existing}
    seen_new = set()

    out_dir_path = CHM_DIR / out_dir
    out_dir_path.mkdir(parents=True, exist_ok=True)

    added = 0
    skipped = 0
    for m in monsters:
        cn = m.get('name', '')
        en = m.get('ENG_name', '')
        if not cn:
            skipped += 1
            continue
        key = (cn, en, source)
        if key in existing_keys or key in seen_new:
            skipped += 1
            continue

        body = render_body(m)
        detail_link = f'/{out_dir}/{en}.htm#{en}'

        # 生成词条 html（UTF-8；read_detail_page 按 gbk→utf-8 顺序尝试）
        html = (
            '<!DOCTYPE html>\n<html lang="zh">\n<head>\n'
            f'<meta charset="utf-8">\n<title>{esc_html(cn)}{esc_html(en)}</title>\n'
            '</head>\n<body>\n'
            f'<div id="{esc_html(en)}">\n{esc_html(body).replace(chr(10), "<br>\n")}\n</div>\n'
            '</body>\n</html>\n'
        )
        (out_dir_path / f'{en}.htm').write_text(html, encoding='utf-8')

        size = SIZE_CN.get((m.get('size') or ['?'])[0], '?')
        ttype, _ = _type_info(m)
        legendary = '有' if m.get('legendary') else '无'
        cr = _cr_str(m.get('cr'))

        existing.append({
            'name': f'{cn}{en}',
            'size': size,
            'type': ttype,
            'legendary': legendary,
            'cr': cr,
            'source': source,
            'tags': f'{size} {ttype} {legendary} {cr} {source}',
            'detail_link': detail_link,
            'name_cn': cn,
            'name_en': en,
        })
        seen_new.add(key)
        added += 1

    with open(DATA / 'monsters_full.json', 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, indent=1)
    print(f'导入完成: 新增 {added} 条, 跳过 {skipped} 条')
    print(f'monsters_full.json 现有 {len(existing)} 条')
    print(f'词条文件: {out_dir_path}')

if __name__ == '__main__':
    main()
