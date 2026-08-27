"""CHM 资料库索引器 — 从提取的CHM文件中解析结构化数据

解析:
  - 5E万法大全.html → data/spells_full.json (全法术)
  - 5E万兽大全.html → data/monsters_full.json (全怪物)
  - 构建全文搜索索引 → data/chm_search_index.json
"""

import re
import json
import os
from pathlib import Path
from html.parser import HTMLParser

DATA_DIR = Path(__file__).parent.parent / "data"
CHM_DIR = DATA_DIR / "chm_extracted"

# 项目根目录（尘封之卷-九子的注视）
PROJECT_ROOT = Path(__file__).parent.parent.parent

# 跳过的目录
SKIP_DIRS = {
    '.claude', '__pycache__', '骰娘', 'chm_extracted',
    '.git', 'node_modules', '.obsidian',
}

# 可读文本扩展名
TEXT_EXTS = {'.txt', '.md', '.json', '.js', '.css', '.html', '.htm'}
# 文档扩展名（需解析器）
DOCX_EXT = '.docx'
# 图片扩展名
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
# PDF扩展名
PDF_EXT = '.pdf'
# 表格扩展名
SHEET_EXTS = {'.xlsx', '.xls'}


# ━━━ HTML 解析工具 ━━━

def _read_gbk(filepath: Path) -> str:
    """读取 CHM HTML 文件（UTF-8 严格优先，回退 GBK）

    怪物图鉴2014（5e 导入）为 UTF-8，CHM 提取为 GBK——GBK 解码宽松会
    把 UTF-8 文件解成乱码，故必须 UTF-8 优先严格尝试。
    """
    raw = filepath.read_bytes()
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('gbk', errors='replace')


def _strip_tags(text: str) -> str:
    """去除HTML标签"""
    return re.sub(r'<[^>]+>', '', text).strip()


def _extract_tr_rows(html: str) -> list[dict]:
    """从HTML表格中提取所有TR行数据

    每行: <TR tags="..." spell="..."> <TD>...</TD> ... </TR>
    返回: [{'spell': '...', 'tags': '...', 'cells': ['...', ...]}, ...]
    """
    rows = []
    # 匹配每个TR行
    pattern = re.compile(
        r'<TR\s+(?:tags="([^"]*)"\s+)?(?:spell|monster)="([^"]*)"[^>]*>(.*?)</TR>',
        re.IGNORECASE | re.DOTALL
    )
    for m in pattern.finditer(html):
        tags = m.group(1) or ''
        name = m.group(2) or ''
        inner = m.group(3) or ''
        # 提取TD内容
        cells = []
        for td_m in re.finditer(r'<TD[^>]*>(.*?)</TD>', inner, re.IGNORECASE | re.DOTALL):
            cells.append(_strip_tags(td_m.group(1)))
        # 从第一个TD中提取href链接
        link_match = re.search(r'href="([^"]+)"', inner)
        detail_link = link_match.group(1) if link_match else ''
        rows.append({
            'name': name,
            'tags': tags,
            'cells': cells,
            'detail_link': detail_link,
            '_raw_inner': inner,
        })
    return rows


# ━━━ 法术索引 ━━━

def build_spell_index() -> list[dict]:
    """解析5E万法大全.html，构建法术索引"""
    spell_file = CHM_DIR / "速查" / "法术速查" / "5E万法大全.html"
    if not spell_file.exists():
        print(f"法术文件不存在: {spell_file}")
        return []

    html = _read_gbk(spell_file)
    rows = _extract_tr_rows(html)

    spells = []
    # 列: 0=法术名, 1=环阶, 2=学派, 3=职业, 4=时间, 5=V, 6=S, 7=M, 8=仪式, 9=专注, 10=来源
    for row in rows:
        if not row['name'] or row['name'] == '法术名':
            continue
        cells = row['cells']

        spell = {
            'name': row['name'].strip(),
            'level': cells[1].strip() if len(cells) > 1 else '',
            'school': cells[2].strip() if len(cells) > 2 else '',
            'classes': cells[3].strip() if len(cells) > 3 else '',
            'casting_time': cells[4].strip() if len(cells) > 4 else '',
            'verbal': cells[5].strip() if len(cells) > 5 else '',
            'somatic': cells[6].strip() if len(cells) > 6 else '',
            'material': cells[7].strip() if len(cells) > 7 else '',
            'ritual': cells[8].strip() if len(cells) > 8 else '',
            'concentration': cells[9].strip() if len(cells) > 9 else '',
            'source': cells[10].strip() if len(cells) > 10 else '',
            'tags': row['tags'],
            'detail_link': row.get('detail_link', ''),
        }

        # 提取中文名（格式: "中文名English Name"）
        cn_name = row['name']
        # 尝试在第一个大写字母处分割
        for i, ch in enumerate(cn_name):
            if i > 0 and ch.isupper() and cn_name[i-1].isalpha() and not cn_name[i-1].isupper():
                spell['name_cn'] = cn_name[:i].strip()
                spell['name_en'] = cn_name[i:].strip()
                break
        else:
            spell['name_cn'] = cn_name
            spell['name_en'] = cn_name

        spells.append(spell)

    return spells


# ━━━ 怪物索引 ━━━

def build_monster_index() -> list[dict]:
    """解析5E万兽大全.html，构建怪物索引"""
    monster_file = CHM_DIR / "速查" / "5E万兽大全.html"
    if not monster_file.exists():
        print(f"怪物文件不存在: {monster_file}")
        return []

    html = _read_gbk(monster_file)
    rows = _extract_tr_rows(html)

    monsters = []
    # 列: 0=怪物名(含链接), 1=体型, 2=类型, 3=传奇动作, 4=挑战等级, 5=来源
    for row in rows:
        if not row['name'] or row['name'] == '怪物名':
            continue
        cells = row['cells']

        monster = {
            'name': row['name'].strip(),
            'size': cells[1].strip() if len(cells) > 1 else '',
            'type': cells[2].strip() if len(cells) > 2 else '',
            'legendary': cells[3].strip() if len(cells) > 3 else '',
            'cr': cells[4].strip() if len(cells) > 4 else '',
            'source': cells[5].strip() if len(cells) > 5 else '',
            'tags': row['tags'],
            'detail_link': row.get('detail_link', ''),
        }

        # 提取中文名和英文名
        cn_name = row['name']
        for i, ch in enumerate(cn_name):
            if i > 0 and ch.isupper() and cn_name[i-1].isalpha() and not cn_name[i-1].isupper():
                monster['name_cn'] = cn_name[:i].strip()
                monster['name_en'] = cn_name[i:].strip()
                break
        else:
            monster['name_cn'] = cn_name
            monster['name_en'] = cn_name

        monsters.append(monster)

    return monsters


# ━━━ 全文搜索索引 ━━━

def build_fulltext_index() -> dict:
    """遍历所有HTML文件，构建关键词→文件路径的映射索引"""
    index = {}

    # 跳过系统文件和二进制文件
    skip_prefixes = {'#', '$', 'stat-block', 'style', 'template'}
    skip_dirs = {'.files', '__pycache__'}

    file_count = 0
    for root, dirs, files in os.walk(CHM_DIR):
        # 过滤目录
        dirs[:] = [d for d in dirs if d not in skip_dirs]

        for fname in files:
            if not fname.endswith(('.htm', '.html')):
                continue
            if any(fname.startswith(p) for p in skip_prefixes):
                continue

            filepath = Path(root) / fname
            try:
                html = _read_gbk(filepath)
            except Exception:
                continue

            # 提取标题
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            title = _strip_tags(title_match.group(1)) if title_match else fname

            # 提取正文文本
            body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.IGNORECASE | re.DOTALL)
            body_text = _strip_tags(body_match.group(1)) if body_match else ''
            # 限制正文长度（8000 字符：覆盖正文深处词条如"负重"（中位 3790 字符），
            # 原 300 字符片段导致大量正文内容搜不到）
            body_text = body_text[:8000]

            # 相对路径
            rel_path = str(filepath.relative_to(CHM_DIR)).replace('\\', '/')

            # 存储文件条目
            entry = {
                'title': title,
                'path': rel_path,
                'snippet': body_text[:8000],
            }
            index[rel_path] = entry
            file_count += 1

    print(f"全文索引: {file_count} 个HTML文件")
    return index


# ━━━ 构建全部索引 ━━━

def build_all_indexes():
    """构建所有索引并保存到JSON文件"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("正在解析法术索引...")
    spells = build_spell_index()
    spell_path = DATA_DIR / "spells_full.json"
    with open(spell_path, 'w', encoding='utf-8') as f:
        json.dump(spells, f, ensure_ascii=False, indent=2)
    print(f"  → {len(spells)} 条法术 → {spell_path}")

    print("正在解析怪物索引...")
    monsters = build_monster_index()
    monster_path = DATA_DIR / "monsters_full.json"
    with open(monster_path, 'w', encoding='utf-8') as f:
        json.dump(monsters, f, ensure_ascii=False, indent=2)
    print(f"  → {len(monsters)} 条怪物 → {monster_path}")

    print("正在构建全文搜索索引...")
    fts = build_fulltext_index()
    fts_path = DATA_DIR / "chm_search_index.json"
    with open(fts_path, 'w', encoding='utf-8') as f:
        json.dump(fts, f, ensure_ascii=False, indent=2)
    print(f"  → {len(fts)} 个文件 → {fts_path}")

    # 构建关键词索引
    print("正在构建关键词倒排索引...")
    inverted = build_inverted_index(spells, monsters, fts)
    inv_path = DATA_DIR / "chm_inverted_index.json"
    with open(inv_path, 'w', encoding='utf-8') as f:
        json.dump(inverted, f, ensure_ascii=False, indent=2)
    print(f"  → {len(inverted)} 个关键词 → {inv_path}")

    print("\n✅ 索引构建完成!")


def build_inverted_index(spells: list, monsters: list, fts: dict) -> dict:
    """构建倒排索引: 关键词 → [(类型, 名称/路径), ...]"""
    inverted = {}

    def add_entry(keyword: str, entry_type: str, entry_name: str, extra: dict = None):
        keyword = keyword.lower().strip()
        if not keyword or len(keyword) < 2:
            return
        if keyword not in inverted:
            inverted[keyword] = []
        # 避免重复
        e = {'type': entry_type, 'name': entry_name}
        if extra:
            e.update(extra)
        if not any(x.get('name') == entry_name and x.get('type') == entry_type
                   for x in inverted[keyword]):
            inverted[keyword].append(e)

    # 法术关键词
    for s in spells:
        name_cn = s.get('name_cn', '')
        name_en = s.get('name_en', '')
        for word in name_cn:
            add_entry(word, 'spell', name_cn, {'level': s.get('level', ''),
                                                'school': s.get('school', ''),
                                                'classes': s.get('classes', '')})
        # 用空格分词
        for word in name_cn.replace('·', ' ').replace('的', ' ').split():
            if len(word) >= 2:
                add_entry(word, 'spell', name_cn)

    # 怪物关键词
    for m in monsters:
        name_cn = m.get('name_cn', '')
        for word in name_cn.replace('·', ' ').split():
            if len(word) >= 2:
                add_entry(word, 'monster', name_cn, {'cr': m.get('cr', ''),
                                                      'type': m.get('type', ''),
                                                      'size': m.get('size', '')})

    # 全文搜索关键词 (从标题中提取)
    for path, entry in fts.items():
        title = entry.get('title', '')
        for word in title.replace(' ', ' ').replace('·', ' ').split():
            w = word.strip().rstrip('：:')
            if len(w) >= 2:
                add_entry(w, 'doc', title, {'path': path,
                                            'snippet': entry.get('snippet', '')[:100]})

    return inverted


# ━━━ 项目文件索引 ━━━

def _extract_text_from_txt(filepath: Path) -> str:
    """从纯文本文件提取内容"""
    for enc in ('utf-8', 'gbk', 'gb2312', 'utf-16'):
        try:
            with open(filepath, 'r', encoding=enc, errors='strict') as f:
                return f.read()[:3000]
        except (UnicodeDecodeError, UnicodeError):
            continue
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()[:3000]
    except Exception:
        return ''


def _extract_text_from_docx(filepath: Path) -> str:
    """从Word文档提取文本"""
    try:
        import docx
        doc = docx.Document(str(filepath))
        paragraphs = []
        for para in doc.paragraphs:
            if para.text.strip():
                paragraphs.append(para.text.strip())
        return '\n'.join(paragraphs)[:3000]
    except ImportError:
        return f'[需安装python-docx: {filepath.name}]'
    except Exception:
        return ''


def _categorize_file(filepath: Path) -> str:
    """将文件分类"""
    name = filepath.stem.lower()
    parent = filepath.parent.name.lower()
    ext = filepath.suffix.lower()

    if ext in IMAGE_EXTS:
        if '面板' in name or 'stat' in name or 'monster' in name:
            return 'monster_image'
        if '地图' in name or 'map' in name or '城' in name or '镇' in name:
            return 'map'
        if '角色' in name or '人物' in name or 'character' in name or 'portrait' in name:
            return 'portrait'
        return 'image'

    if ext == PDF_EXT:
        if '玩家' in name or 'phb' in name or 'player' in name:
            return 'rulebook'
        if '城主' in name or 'dmg' in name or 'master' in name:
            return 'rulebook'
        if '怪物' in name or 'monster' in name:
            return 'rulebook'
        if '模组' in name or '冒险' in name or 'adventure' in name or '矿坑' in name:
            return 'adventure'
        if '设定' in name or '国度' in name or 'setting' in name:
            return 'setting'
        return 'pdf'

    if ext == DOCX_EXT:
        if '历史' in parent or '纪' in parent or '纪元' in parent:
            return 'history'
        if '设定' in parent or '背景' in parent or '世界' in parent or '杂记' in parent:
            return 'setting_doc'
        if '模组' in parent or '跑团' in parent or 'edit' in parent or 'edit' in name:
            return 'module_doc'
        if '人物' in name or '角色' in name or 'npc' in name:
            return 'character_doc'
        if '职业' in name or 'class' in name or '破魔' in name:
            return 'class_doc'
        if '种族' in name or 'race' in name:
            return 'race_doc'
        if '生物' in name or '图鉴' in name or 'monster' in name:
            return 'bestiary_doc'
        if '神' in name or 'god' in name or 'deity' in name:
            return 'pantheon_doc'
        if '魔法' in name or '炼金' in name or 'spell' in name:
            return 'magic_doc'
        # 根据父目录名判断
        if '北境' in parent or '城' in parent or '利文顿' in parent:
            return 'setting_doc'
        if '跑团' in parent:
            return 'module_doc'
        if '人物' in parent:
            return 'character_doc'
        return 'doc'

    if ext in SHEET_EXTS:
        return 'character_sheet'

    if ext in TEXT_EXTS:
        return 'text'

    return 'other'


def build_project_file_index() -> list[dict]:
    """扫描项目目录中的所有参考文件，构建文件索引"""
    files = []

    for root, dirs, filenames in os.walk(PROJECT_ROOT):
        # 跳过不需要的目录
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.') and not d.startswith('~')]

        for fname in filenames:
            if fname.startswith('~$'):
                continue
            if fname.startswith('.'):
                continue

            filepath = Path(root) / fname
            ext = filepath.suffix.lower()

            # 跳过系统文件
            if ext in ('.tmp', '.pyc', '.pyo', '.log'):
                continue

            try:
                rel_path = str(filepath.relative_to(PROJECT_ROOT)).replace('\\', '/')
                size = filepath.stat().st_size
            except OSError:
                continue

            category = _categorize_file(filepath)
            parent_dir = filepath.parent.name

            entry = {
                'name': fname,
                'stem': filepath.stem,
                'path': rel_path,
                'parent': parent_dir,
                'type': category,
                'ext': ext,
                'size': size,
                'size_kb': round(size / 1024, 1),
            }

            # 提取文本内容
            text_content = ''
            if ext in TEXT_EXTS:
                text_content = _extract_text_from_txt(filepath)
            elif ext == DOCX_EXT and not fname.startswith('~$'):
                text_content = _extract_text_from_docx(filepath)

            if text_content:
                entry['snippet'] = text_content[:300]

            files.append(entry)

    # 按类别排序
    files.sort(key=lambda f: (f['type'], f['name']))

    return files


def build_file_type_summary(files: list[dict]) -> dict:
    """生成文件类型摘要"""
    summary = {}
    for f in files:
        cat = f['type']
        if cat not in summary:
            summary[cat] = {'count': 0, 'total_size_kb': 0}
        summary[cat]['count'] += 1
        summary[cat]['total_size_kb'] += f.get('size_kb', 0)
    return summary


# ━━━ 构建全部索引 ━━━

def build_all_indexes():
    """构建所有索引并保存到JSON文件"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("正在解析法术索引...")
    spells = build_spell_index()
    spell_path = DATA_DIR / "spells_full.json"
    with open(spell_path, 'w', encoding='utf-8') as f:
        json.dump(spells, f, ensure_ascii=False, indent=2)
    print(f"  → {len(spells)} 条法术 → {spell_path}")

    print("正在解析怪物索引...")
    monsters = build_monster_index()
    monster_path = DATA_DIR / "monsters_full.json"
    with open(monster_path, 'w', encoding='utf-8') as f:
        json.dump(monsters, f, ensure_ascii=False, indent=2)
    print(f"  → {len(monsters)} 条怪物 → {monster_path}")

    print("正在构建全文搜索索引...")
    fts = build_fulltext_index()
    fts_path = DATA_DIR / "chm_search_index.json"
    with open(fts_path, 'w', encoding='utf-8') as f:
        json.dump(fts, f, ensure_ascii=False, indent=2)
    print(f"  → {len(fts)} 个HTML文件 → {fts_path}")

    # 构建关键词索引
    print("正在构建关键词倒排索引...")
    inverted = build_inverted_index(spells, monsters, fts)
    inv_path = DATA_DIR / "chm_inverted_index.json"
    with open(inv_path, 'w', encoding='utf-8') as f:
        json.dump(inverted, f, ensure_ascii=False, indent=2)
    print(f"  → {len(inverted)} 个关键词 → {inv_path}")

    # ━ 项目文件索引 ━
    print("正在扫描项目文件...")
    proj_files = build_project_file_index()
    files_path = DATA_DIR / "project_files.json"
    with open(files_path, 'w', encoding='utf-8') as f:
        json.dump(proj_files, f, ensure_ascii=False, indent=2)
    print(f"  → {len(proj_files)} 个项目文件 → {files_path}")

    # 文件类型摘要
    summary = build_file_type_summary(proj_files)
    summary_path = DATA_DIR / "file_summary.json"
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    type_names = {
        'image': '图片', 'monster_image': '怪物面板图', 'map': '地图',
        'portrait': '角色肖像', 'rulebook': '规则书PDF', 'adventure': '冒险模组',
        'setting': '设定集', 'pdf': 'PDF文档', 'history': '纪元历史',
        'setting_doc': '设定文档', 'module_doc': '模组文档',
        'character_doc': '角色文档', 'class_doc': '职业文档', 'race_doc': '种族文档',
        'bestiary_doc': '生物图鉴', 'pantheon_doc': '神系', 'magic_doc': '魔法炼金',
        'character_sheet': '角色卡', 'text': '文本笔记', 'doc': 'Word文档', 'other': '其他',
    }
    for cat, info in summary.items():
        label = type_names.get(cat, cat)
        print(f"     {label}: {info['count']} 个 ({info['total_size_kb']:.0f} KB)")

    print("\n✅ 全部索引构建完成!")


if __name__ == '__main__':
    build_all_indexes()
