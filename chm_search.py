"""CHM 资料库搜索模块

提供法术、怪物、物品、专长、规则等内容的搜索功能。
数据来自 CHM 索引文件。
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
CHM_DIR = DATA_DIR / "chm_extracted"

# 延迟加载
_spells: list[dict] | None = None
_monsters: list[dict] | None = None
_fts_index: dict | None = None
_inverted_index: dict | None = None
_project_files: list[dict] | None = None
_file_summary: dict | None = None


def _load_json(filename: str):
    path = DATA_DIR / filename
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _get_spells() -> list[dict]:
    global _spells
    if _spells is None:
        _spells = _load_json("spells_full.json") or []
    return _spells


def _get_monsters() -> list[dict]:
    global _monsters
    if _monsters is None:
        _monsters = _load_json("monsters_full.json") or []
    return _monsters


def _get_fts() -> dict:
    global _fts_index
    if _fts_index is None:
        _fts_index = _load_json("chm_search_index.json") or {}
    return _fts_index


def _get_inverted() -> dict:
    global _inverted_index
    if _inverted_index is None:
        _inverted_index = _load_json("chm_inverted_index.json") or {}
    return _inverted_index


# ━━━ 读取详情页 ━━━

def _read_gbk(filepath: Path) -> str:
    """读取GBK编码的HTML文件"""
    for enc in ('gbk', 'gb2312', 'utf-8', 'gb18030'):
        try:
            with open(filepath, 'r', encoding=enc, errors='strict') as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def read_detail_page(rel_path: str) -> str | None:
    """读取CHM中的详情页HTML，返回纯文本内容

    rel_path 可以是:
      - '/玩家手册/魔法/法术详述/3环.html' (完整路径)
      - '玩家手册/魔法/法术详述/3环.html#Fireball' (含锚点)
    """
    anchor = None
    # 提取锚点
    if '#' in rel_path:
        rel_path, anchor = rel_path.split('#', 1)
    # 去除开头的 /
    rel_path = rel_path.lstrip('/')

    filepath = CHM_DIR / rel_path
    if not filepath.exists():
        return None

    html = _read_gbk(filepath)

    # 如果有锚点，截取该锚点到下一个锚点之间的内容
    if anchor:
        anchor_pattern = re.compile(
            rf'<a\s+[^>]*name="{re.escape(anchor)}"[^>]*>.*?</a>'
            rf'|id="{re.escape(anchor)}"'
            rf'|name="{re.escape(anchor)}"',
            re.IGNORECASE
        )
        anchor_match = anchor_pattern.search(html)
        if anchor_match:
            start = anchor_match.start()
            # 找到下一个锚点作为结束边界（尝试多种模式）
            after = html[start+10:]
            # 模式1: <a name="..."> 标签
            next_bound = re.search(r'<a\s+[^>]*name="([^"]*)"[^>]*>', after, re.IGNORECASE)
            # 模式2: id="..." 属性（法术页面常用）
            if not next_bound:
                next_bound = re.search(r'\bid="([^"]+)"', after, re.IGNORECASE)
            # 模式3: <a id="..."> 标签
            if not next_bound:
                next_bound = re.search(r'<a\s+[^>]*\bid="([^"]+)"[^>]*>', after, re.IGNORECASE)
            if next_bound:
                end = start + 10 + next_bound.start()
                html = html[start:end]
            else:
                html = html[start:start + 16000]

    # 提取body内容
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.IGNORECASE | re.DOTALL)
    if not body_match:
        # 如果没有body标签，直接用html
        body = html
    else:
        body = body_match.group(1)

    # 移除脚本和样式
    body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.IGNORECASE | re.DOTALL)
    body = re.sub(r'<style[^>]*>.*?</style>', '', body, flags=re.IGNORECASE | re.DOTALL)

    # 移除图片
    body = re.sub(r'<img[^>]*>', '', body, flags=re.IGNORECASE)

    # 将换行标签转为换行
    body = re.sub(r'<br[^>]*>', '\n', body, flags=re.IGNORECASE)
    body = re.sub(r'</?p[^>]*>', '\n', body, flags=re.IGNORECASE)
    body = re.sub(r'</?div[^>]*>', '\n', body, flags=re.IGNORECASE)

    # 去除所有HTML标签
    text = re.sub(r'<[^>]+>', '', body)

    # 清理空白
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    lines = [l.strip() for l in text.split('\n')]
    text = '\n'.join(l for l in lines if l)

    return text[:3000]  # 限制长度


# ━━━ 搜索函数 ━━━

def search_spell(query: str) -> list[dict]:
    """搜索法术

    支持中文名、英文名、拼音首字母匹配。
    返回匹配的法术列表（最多20条）。
    """
    spells = _get_spells()
    query_lower = query.lower().strip()
    results = []

    for s in spells:
        name_cn = s.get('name_cn', '')
        name_en = s.get('name_en', '')
        full_name = s.get('name', '')

        # 完全匹配优先
        if query_lower == name_cn.lower() or query_lower == name_en.lower():
            results.insert(0, s)
            continue

        # 包含匹配
        if (query_lower in name_cn.lower() or
            query_lower in name_en.lower() or
            query_lower in full_name.lower()):
            results.append(s)
            continue

        # 拼音首字母匹配
        # 取中文名的拼音首字母简拼
        # 简化: 检查每个字的首字母
        if len(query_lower) <= 4 and len(name_cn) >= 2:
            initials = ''.join(w[0].lower() for w in name_cn.split() if w)
            if query_lower == initials:
                results.append(s)
                continue

        # 标签匹配（学派、职业等）
        tags = s.get('tags', '').lower()
        if query_lower in tags:
            results.append(s)

    return results[:20]


def search_monster(query: str) -> list[dict]:
    """搜索怪物

    支持中文名、英文名匹配。对于多字中文查询会逐字模糊匹配。
    返回匹配的怪物列表（最多20条）。
    """
    monsters = _get_monsters()
    query_lower = query.lower().strip()
    results = []

    for m in monsters:
        name_cn = m.get('name_cn', '')
        name_en = m.get('name_en', '')
        full_name = m.get('name', '')

        if query_lower == name_cn.lower() or query_lower == name_en.lower():
            results.insert(0, m)
            continue

        if (query_lower in name_cn.lower() or
            query_lower in name_en.lower() or
            query_lower in full_name.lower()):
            results.append(m)
            continue

        # 中文逐字匹配：查询词中任意单个字在怪物名中出现即匹配（处理"僵尸"→"丧尸"这类译名差异）
        if any('一' <= c <= '鿿' for c in query_lower):
            for ch in query_lower:
                if ch in name_cn:
                    results.append(m)
                    break

        # CR匹配
        cr = m.get('cr', '')
        if query_lower == cr.lower():
            results.append(m)
            continue

        # 类型匹配
        mtype = m.get('type', '').lower()
        if query_lower in mtype:
            results.append(m)

    return results[:20]


def search_all(query: str) -> list[dict]:
    """全文搜索 — 在所有已索引的HTML文件中搜索关键词

    返回匹配的文件列表（最多15条）。
    """
    query_lower = query.lower().strip()
    if len(query_lower) < 2:
        return []

    inverted = _get_inverted()
    fts = _get_fts()

    results = []

    # 先查倒排索引
    if query_lower in inverted:
        for entry in inverted[query_lower][:10]:
            entry_type = entry.get('type', '')
            entry_name = entry.get('name', '')

            if entry_type == 'spell':
                results.append({
                    'type': 'spell',
                    'name': entry_name,
                    'name_cn': entry.get('name_cn', entry_name),
                    'name_en': entry.get('name_en', ''),
                    'level': entry.get('level', ''),
                    'school': entry.get('school', ''),
                    'classes': entry.get('classes', ''),
                    'source': entry.get('source', ''),
                    'casting_time': entry.get('casting_time', ''),
                    'verbal': entry.get('verbal', ''),
                    'somatic': entry.get('somatic', ''),
                    'material': entry.get('material', ''),
                    'ritual': entry.get('ritual', ''),
                    'concentration': entry.get('concentration', ''),
                    'detail_link': entry.get('detail_link', ''),
                    'detail': f"{entry.get('level', '')} {entry.get('school', '')} {entry.get('classes', '')}",
                })
            elif entry_type == 'monster':
                results.append({
                    'type': 'monster',
                    'name': entry_name,
                    'detail': f"CR:{entry.get('cr', '')} {entry.get('size', '')} {entry.get('type', '')}",
                })
            elif entry_type == 'doc':
                path = entry.get('path', '')
                snippet = entry.get('snippet', '')
                if path in fts:
                    results.append({
                        'type': 'rule',
                        'name': entry_name,
                        'detail': snippet[:100],
                        'path': path,
                    })
            else:
                results.append({
                    'type': entry_type,
                    'name': entry_name,
                })

    # 再在全文索引中搜索标题
    if len(results) < 10:
        for path, entry in fts.items():
            title = entry.get('title', '').lower()
            snippet = entry.get('snippet', '').lower()
            if query_lower in title or query_lower in snippet:
                if not any(r.get('path') == path for r in results):
                    results.append({
                        'type': 'rule',
                        'name': entry.get('title', ''),
                        'detail': entry.get('snippet', '')[:100],
                        'path': path,
                    })
                if len(results) >= 15:
                    break

    return results[:15]


def search_by_type(query: str, search_type: str) -> list[dict]:
    """按类型搜索

    search_type: 'spell' | 'monster' | 'item' | 'feat' | 'rule' | 'class' | 'race'
    """
    if search_type == 'spell':
        return [
            {'type': 'spell', 'name': s.get('name_cn', s.get('name', '')),
             'detail': f"{s.get('level', '')} {s.get('school', '')} | {s.get('classes', '')} | {s.get('source', '')}",
             'detail_link': s.get('detail_link', ''),
             'spell_data': s}
            for s in search_spell(query)
        ]
    elif search_type == 'monster':
        return [
            {'type': 'monster', 'name': m.get('name_cn', m.get('name', '')),
             'detail': f"CR:{m.get('cr', '')} | {m.get('size', '')} {m.get('type', '')} | {m.get('source', '')}",
             'detail_link': m.get('detail_link', ''),
             'monster_data': m}
            for m in search_monster(query)
        ]
    else:
        # 全文搜索并过滤
        all_results = search_all(query)
        if search_type == 'rule':
            return [r for r in all_results if r.get('type') == 'rule']
        return all_results


def get_spell_detail(name: str) -> dict | None:
    """获取法术的详细信息（从详情页读取）"""
    spells = search_spell(name)
    if not spells:
        return None

    spell = spells[0]
    detail_link = spell.get('detail_link', '')
    if detail_link:
        detail_text = read_detail_page(detail_link)
        spell['detail_text'] = detail_text

    return spell


def get_monster_detail(name: str) -> dict | None:
    """获取怪物的详细信息（从详情页读取）"""
    monsters = search_monster(name)
    if not monsters:
        return None

    monster = monsters[0]
    detail_text = None

    # 1. 优先用 detail_link
    detail_link = monster.get('detail_link', '')
    if detail_link:
        detail_text = read_detail_page(detail_link)
        if detail_text and not detail_text.strip():
            detail_text = None

    # 2. 在全怪物索引中查找同名条目，尝试其 detail_link
    if not detail_text:
        monsters_data = _get_monsters()
        target_name = monster.get('name_cn', monster.get('name', ''))
        for m in monsters_data:
            if m.get('name_cn', '') == target_name or m.get('name', '') == target_name:
                alt_link = m.get('detail_link', '')
                if alt_link and alt_link != detail_link:
                    detail_text = read_detail_page(alt_link)
                    if detail_text and detail_text.strip():
                        break

    # 3. 用全文索引查找包含怪物名的页面（速度远快于目录遍历）
    if not detail_text:
        fts = _get_fts()
        for path_key, info in fts.items():
            title = info.get('title', '')
            if name in title or name in path_key:
                content = read_detail_page(path_key)
                if content and name in content:
                    detail_text = content
                    break
        # 全文索引未找到，再遍历目录
        if not detail_text:
            import os as _os_module
            for root, dirs, files in _os_module.walk(str(CHM_DIR)):
                for f in files:
                    if f.endswith(('.htm', '.html')):
                        fpath = _os_module.path.join(root, f)
                        rel = _os_module.path.relpath(fpath, str(CHM_DIR)).replace('\\', '/')
                        content = read_detail_page(rel)
                        if content and name in content:
                            detail_text = content
                            break
                if detail_text:
                    break

    monster['detail_text'] = detail_text
    return monster


# ━━━ 项目文件搜索 ━━━

def _get_project_files() -> list[dict]:
    global _project_files
    if _project_files is None:
        _project_files = _load_json("project_files.json") or []
    return _project_files


def _get_file_summary() -> dict:
    global _file_summary
    if _file_summary is None:
        _file_summary = _load_json("file_summary.json") or {}
    return _file_summary


CATEGORY_LABELS = {
    'image': '🖼️ 图片', 'monster_image': '👹 怪物面板', 'map': '🗺️ 地图',
    'portrait': '🎭 角色肖像', 'rulebook': '📘 规则书', 'adventure': '⚔️ 冒险模组',
    'setting': '🌍 设定集', 'pdf': '📄 PDF文档', 'history': '📜 纪元历史',
    'setting_doc': '📝 设定文档', 'module_doc': '📋 模组文档',
    'character_doc': '👤 角色文档', 'class_doc': '⚔️ 职业文档', 'race_doc': '🧬 种族文档',
    'bestiary_doc': '📖 生物图鉴', 'pantheon_doc': '🏛️ 神系', 'magic_doc': '✨ 魔法炼金',
    'character_sheet': '📋 角色卡', 'text': '📝 文本笔记', 'doc': '📄 文档', 'other': '📦 其他',
}


def search_project_files(query: str, category: str = None) -> list[dict]:
    """搜索项目文件

    Args:
        query: 搜索关键词（在文件名、父目录、文本内容中搜索）
        category: 限定类别 (如 'rulebook', 'setting_doc', 'map')，None表示全部
    """
    files = _get_project_files()
    query_lower = query.lower().strip()
    results = []

    for f in files:
        # 类别过滤
        if category and f['type'] != category:
            continue

        name_lower = f['name'].lower()
        parent_lower = f['parent'].lower()
        stem_lower = f['stem'].lower()
        snippet = f.get('snippet', '').lower()

        score = 0
        # 精确匹配文件名
        if query_lower == stem_lower:
            score = 100
        elif query_lower in stem_lower:
            score = 50
        elif query_lower in name_lower:
            score = 40
        elif query_lower in parent_lower:
            score = 30
        elif query_lower in snippet:
            score = 20
        else:
            # 部分匹配
            for word in query_lower.split():
                if len(word) >= 2:
                    if word in name_lower:
                        score = max(score, 15)
                    elif word in parent_lower:
                        score = max(score, 10)
                    elif word in snippet:
                        score = max(score, 5)

        if score > 0:
            entry = {
                'type': 'file',
                'category': f['type'],
                'cat_label': CATEGORY_LABELS.get(f['type'], f['type']),
                'name': f['name'],
                'path': f['path'],
                'parent': f['parent'],
                'ext': f['ext'],
                'size_kb': f.get('size_kb', 0),
                'snippet': f.get('snippet', '')[:150],
                'score': score,
            }
            results.append(entry)

    # 按分数排序
    results.sort(key=lambda r: -r['score'])
    return results[:20]


def get_file_summary_text() -> str:
    """获取文件库摘要文本"""
    summary = _get_file_summary()
    if not summary:
        return '文件索引尚未构建，请运行 chm_indexer.build_all_indexes()'

    lines = ['📦 资料库文件统计:']
    total_files = 0
    for cat, info in sorted(summary.items()):
        label = CATEGORY_LABELS.get(cat, cat)
        count = info['count']
        total_files += count
        lines.append(f'   {label}: {count} 个')
    lines.append(f'   ──────────────')
    lines.append(f'   📁 总计: {total_files} 个文件')
    return '\n'.join(lines)


def search_all_combined(query: str) -> list[dict]:
    """综合搜索：CHM资料库 + 项目文件"""
    results = []

    # CHM规则搜索
    chm_results = search_all(query)
    for r in chm_results[:8]:
        results.append(r)

    # 法术搜索
    spell_results = search_spell(query)
    for s in spell_results[:3]:
        results.append({
            'type': 'spell',
            'name': s.get('name_cn', s.get('name', '')),
            'detail': f"{s.get('level', '')} {s.get('school', '')} | {s.get('classes', '')}",
        })

    # 怪物搜索
    monster_results = search_monster(query)
    for m in monster_results[:3]:
        results.append({
            'type': 'monster',
            'name': m.get('name_cn', m.get('name', '')),
            'name_en': m.get('name_en', ''),
            'detail': f"CR:{m.get('cr', '')} {m.get('size', '')} {m.get('type', '')}",
            'cr': m.get('cr', ''),
            'path': m.get('detail_link', ''),
            'source': m.get('source', ''),
        })

    # 项目文件搜索
    file_results = search_project_files(query)
    for f in file_results[:8]:
        results.append(f)

    return results[:25]
