# -*- coding: utf-8 -*-
"""自定义生物 → 词条卡 PDF 导出（reportlab）

词条卡风格（与参考界面词条一致）：
名称头部 + 英文名 + 信息行（挑战等级/体型/类型/阵营/信仰/性别/AC/HP/速度）
+ 六属性表（名称/数值/调整值）+ detail_text 分区正文（【特性】【动作】等加粗）
+ 来源页脚。旧条目（无结构化字段）用 detail_text 兜底。
中文字体：优先微软雅黑（msyh.ttc），回退黑体（simhei.ttf）；都缺失时报错。
"""
import os
import re as _re
from pathlib import Path

_AB_CN = {'str': '力量', 'dex': '敏捷', 'con': '体质', 'int': '智力', 'wis': '感知', 'cha': '魅力'}
_FONT_CANDIDATES = (
    ('MSYH', 'C:/Windows/Fonts/msyh.ttc', 0),      # 微软雅黑（ttc 取第 0 个 face）
    ('SimHei', 'C:/Windows/Fonts/simhei.ttf', None),  # 黑体
)


def _register_font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    for name, path, idx in _FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                if idx is not None:
                    pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
                else:
                    pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue
    raise RuntimeError('未找到系统中文字体（需要 msyh.ttc 或 simhei.ttf）')


def _parse_abilities(e: dict):
    """结构化 abilities → {英文键: 数值}；旧条目无结构化时从 detail_text 正则解析"""
    ab = e.get('abilities') or {}
    if all(str(ab.get(k, '')).strip() != '' for k in _AB_CN):
        try:
            return {k: int(ab[k]) for k in _AB_CN}
        except (TypeError, ValueError):
            pass
    text = e.get('detail_text') or ''
    parsed = {}
    for cn, key in _AB_CN.items():
        m = _re.search(cn + r'\s*(\d+)', text)
        if m:
            parsed[key] = int(m.group(1))
    return parsed if len(parsed) == 6 else None


def _ability_mod(score: int) -> int:
    return (score - 10) // 2


def _fmt(n: int) -> str:
    return f'+{n}' if n >= 0 else str(n)


def export_monster_pdf(e: dict, out_path) -> Path:
    """生成一页/多页 A4 词条卡 PDF，保存到 out_path"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                    Table, TableStyle, HRFlowable)

    font = _register_font()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(str(out_path), pagesize=A4,
                            leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"{e.get('name', '')} - 尘封之卷词条卡",
                            author='尘封之卷')

    gold = colors.HexColor('#B8860B')
    dark = colors.HexColor('#2b2b2b')
    grey = colors.HexColor('#666666')

    st_name = ParagraphStyle('name', fontName=font, fontSize=22, leading=28,
                             textColor=gold, spaceAfter=2)
    st_en = ParagraphStyle('en', fontName=font, fontSize=10.5, leading=14,
                           textColor=grey, spaceAfter=6)
    st_info = ParagraphStyle('info', fontName=font, fontSize=9.5, leading=15,
                             textColor=dark, spaceAfter=10)
    st_title = ParagraphStyle('title', fontName=font, fontSize=13, leading=18,
                              textColor=gold, spaceBefore=10, spaceAfter=4)
    st_body = ParagraphStyle('body', fontName=font, fontSize=10, leading=15.5,
                             textColor=dark, spaceAfter=3)

    def esc(s: str) -> str:
        return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    story = []

    # ━━ 名称头部 ━━
    story.append(Paragraph(esc(e.get('name') or '未命名生物'), st_name))
    if e.get('name_en'):
        story.append(Paragraph(esc(e['name_en']), st_en))
    story.append(HRFlowable(width='100%', thickness=1.2, color=gold, spaceAfter=8))

    # ━━ 信息行 ━━
    info_parts = []
    if e.get('cr'):
        info_parts.append(f'挑战等级：{e["cr"]}')
    if e.get('size'):
        info_parts.append(f'体型：{e["size"]}')
    if e.get('type'):
        info_parts.append(f'类型：{e["type"]}')
    if e.get('alignment'):
        info_parts.append(f'阵营：{e["alignment"]}')
    if e.get('faith'):
        info_parts.append(f'信仰：{e["faith"]}')
    if e.get('gender'):
        info_parts.append(f'性别：{e["gender"]}')
    if str(e.get('ac') or '') != '':
        info_parts.append(f'AC {e["ac"]}{("（" + e["armor"] + "）") if e.get("armor") else ""}')
    if e.get('hp'):
        info_parts.append(f'HP {e["hp"]}')
    if e.get('speed'):
        info_parts.append(f'速度 {e["speed"]}')
    if info_parts:
        story.append(Paragraph('　'.join(esc(p) for p in info_parts), st_info))

    # ━━ 六属性表 ━━
    abilities = _parse_abilities(e)
    if abilities:
        header = [Paragraph(f'<font color="#888888">{_AB_CN[k]}</font>', st_body) for k in _AB_CN]
        scores = [Paragraph(f'<b>{abilities[k]}</b>', st_body) for k in _AB_CN]
        mods = [Paragraph(f'<font color="#B8860B">{_fmt(_ability_mod(abilities[k]))}</font>', st_body)
                for k in _AB_CN]
        col_w = (doc.width) / 6
        tbl = Table([header, scores, mods], colWidths=[col_w] * 6)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f7f4ec')),
            ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#d8cdb0')),
            ('INNERGRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d8cdb0')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 6))

    # ━━ detail_text 分区正文 ━━
    ab_line_re = _re.compile(r'力量\d+.*敏捷\d+.*体质\d+.*智力\d+.*感知\d+.*魅力\d+')
    for raw_line in (e.get('detail_text') or '').split('\n'):
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('【') and stripped.endswith('】'):
            story.append(HRFlowable(width='100%', thickness=0.6, color=gold, spaceBefore=6, spaceAfter=2))
            story.append(Paragraph(esc(stripped), st_title))
        else:
            if abilities and ab_line_re.search(stripped):
                continue  # 属性行已表格化，跳过
            story.append(Paragraph(esc(line), st_body))

    # ━━ 页脚：来源 ━━
    src = e.get('source') or '自定义'
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width='100%', thickness=0.6, color=gold))
    story.append(Paragraph(f'<font color="#999999">来源：{esc(src)}　|　尘封之卷·跑团平台</font>',
                           ParagraphStyle('footer', fontName=font, fontSize=8.5,
                                          leading=12, textColor=grey, spaceBefore=4)))

    doc.build(story)
    return out_path
