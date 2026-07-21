"""DND5E 角色卡管理系统

使用 SQLite 存储角色数据。
支持从 NekoWorks DND 5E 人物卡 Excel 导入。
"""

import sqlite3
import json
import os
from pathlib import Path
from core.dnd5e_rules import (
    ability_modifier, proficiency_bonus, SKILL_TO_ABILITY,
    get_ability_for_skill, normalize_ability, normalize_skill,
    STANDARD_SPELL_SLOTS, get_spell_slots_for_level
)

DB_PATH = Path(__file__).parent.parent / "data" / "characters.db"


def get_db() -> sqlite3.Connection:
    """获取数据库连接"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def resolve_portrait_path(path: str):
    """解析头像路径为绝对路径。

    搜索范围:
      1. 原路径（绝对路径 或 相对于当前工作目录）
      2. 相对于脚本目录 (骰娘/)
      3. 相对于项目根目录 (尘封之卷-九子的注视/)
      4. 相对于人物相关/ 目录
      5. 人物相关/ 下递归搜索同名文件（含子目录）
      6. 整个项目根目录下搜索同名文件（限2层）

    Returns:
        (resolved_path, tried_paths_list) — 成功时返回 (绝对路径, [])，
        失败时返回 (None, [尝试过的路径列表])
    """
    if not path or not path.strip():
        return None, []
    path = path.strip()
    # 去掉可能的首尾引号
    if len(path) >= 2 and ((path[0] == '"' and path[-1] == '"') or (path[0] == "'" and path[-1] == "'")):
        path = path[1:-1]

    script_dir = DB_PATH.parent  # 骰娘/
    base = script_dir.parent     # 项目根目录 (尘封之卷-九子的注视/)

    tried = []
    candidates = [
        Path(path),                     # 绝对路径 或 相对CWD
        script_dir / path,              # 相对于骰娘/
        base / path,                    # 相对于项目根目录
        base / '人物相关' / path,       # 相对于人物相关/
    ]
    for candidate in candidates:
        tried.append(str(candidate))
        try:
            if candidate.exists() and candidate.is_file():
                return str(candidate.resolve()), []
        except (OSError, PermissionError):
            continue

    # 在人物相关目录下递归搜索同名文件
    def search_dir(root, max_depth=3):
        if max_depth <= 0:
            return None
        try:
            for f in root.iterdir():
                if f.is_file() and f.name.lower() == Path(path).name.lower():
                    return str(f.resolve())
            for f in root.iterdir():
                if f.is_dir():
                    result = search_dir(f, max_depth - 1)
                    if result:
                        return result
        except (OSError, PermissionError):
            pass
        return None

    people_dir = base / '人物相关'
    if people_dir.is_dir():
        result = search_dir(people_dir)
        if result:
            return result, []

    # 最后在整个项目根目录下搜索（限2层，排除骰娘/目录）
    def search_root(root, depth=2):
        if depth <= 0:
            return None
        try:
            for f in root.iterdir():
                if f.name == '骰娘':
                    continue
                if f.is_file() and f.name.lower() == Path(path).name.lower():
                    return str(f.resolve())
            for f in root.iterdir():
                if f.is_dir() and f.name != '骰娘':
                    result = search_root(f, depth - 1)
                    if result:
                        return result
        except (OSError, PermissionError):
            pass
        return None

    result = search_root(base)
    if result:
        return result, []

    return None, tried


def init_db() -> None:
    """初始化数据库表（兼容自动迁移）"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            player TEXT DEFAULT '',
            created_by TEXT DEFAULT '',
            level INTEGER DEFAULT 1,
            class TEXT DEFAULT '',
            race TEXT DEFAULT '',
            subrace TEXT DEFAULT '',
            background_field TEXT DEFAULT '',
            alignment TEXT DEFAULT '',
            faith TEXT DEFAULT '',
            gender TEXT DEFAULT '',
            age TEXT DEFAULT '',
            height TEXT DEFAULT '',
            weight_field TEXT DEFAULT '',
            hp_max INTEGER DEFAULT 10,
            hp_current INTEGER DEFAULT 10,
            temp_hp INTEGER DEFAULT 0,
            ac INTEGER DEFAULT 10,
            initiative_bonus INTEGER DEFAULT 0,
            speed INTEGER DEFAULT 30,
            proficiency_bonus INTEGER DEFAULT 2,
            hit_dice TEXT DEFAULT '1d8',
            hd_count INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            passive_perception INTEGER DEFAULT 10,
            spellcasting_ability TEXT DEFAULT '',
            spell_attack_bonus INTEGER DEFAULT 0,
            spell_save_dc INTEGER DEFAULT 10,
            prepared_spell_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            portrait_path TEXT DEFAULT '',
            source_file TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            group_id INTEGER DEFAULT NULL,
            FOREIGN KEY (group_id) REFERENCES character_groups(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS abilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER UNIQUE,
            str INTEGER DEFAULT 10,
            dex INTEGER DEFAULT 10,
            con INTEGER DEFAULT 10,
            int_score INTEGER DEFAULT 10,
            wis INTEGER DEFAULT 10,
            cha INTEGER DEFAULT 10,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skill_proficiencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            skill_name TEXT,
            is_proficient BOOLEAN DEFAULT 0,
            is_expertise BOOLEAN DEFAULT 0,
            bonus INTEGER DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS save_proficiencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            ability_name TEXT,
            is_proficient BOOLEAN DEFAULT 0,
            save_bonus INTEGER DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS spell_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            slot_level TEXT,
            max_slots INTEGER DEFAULT 0,
            used_slots INTEGER DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS death_saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER UNIQUE,
            successes INTEGER DEFAULT 0,
            failures INTEGER DEFAULT 0,
            is_stable BOOLEAN DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 武器表
        CREATE TABLE IF NOT EXISTS weapons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            name TEXT DEFAULT '',
            attack_bonus INTEGER DEFAULT 0,
            damage_dice TEXT DEFAULT '',
            damage_type TEXT DEFAULT '',
            is_proficient BOOLEAN DEFAULT 0,
            ammo TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            description TEXT DEFAULT '',
            effect TEXT DEFAULT '',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 护甲/盾牌
        CREATE TABLE IF NOT EXISTS armor (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER UNIQUE,
            armor_name TEXT DEFAULT '',
            armor_ac INTEGER DEFAULT 0,
            armor_max_dex TEXT DEFAULT '',
            shield_name TEXT DEFAULT '',
            shield_ac INTEGER DEFAULT 0,
            shield_weight TEXT DEFAULT '',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 钱币
        CREATE TABLE IF NOT EXISTS coins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER UNIQUE,
            cp INTEGER DEFAULT 0,
            sp INTEGER DEFAULT 0,
            ep INTEGER DEFAULT 0,
            gp INTEGER DEFAULT 0,
            pp INTEGER DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 已准备法术
        CREATE TABLE IF NOT EXISTS prepared_spells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            spell_name TEXT NOT NULL,
            spell_level INTEGER DEFAULT 0,
            is_prepared BOOLEAN DEFAULT 1,
            notes TEXT DEFAULT '',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 法术书（已学习法术）
        CREATE TABLE IF NOT EXISTS learned_spells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            spell_name TEXT NOT NULL,
            spell_level INTEGER DEFAULT 0,
            school TEXT DEFAULT '',
            casting_time TEXT DEFAULT '',
            range TEXT DEFAULT '',
            duration TEXT DEFAULT '',
            components TEXT DEFAULT '',
            ritual TEXT DEFAULT '否',
            concentration TEXT DEFAULT '否',
            description TEXT DEFAULT '',
            source TEXT DEFAULT '自定义',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 背景信息
        CREATE TABLE IF NOT EXISTS background_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER UNIQUE,
            personality_traits TEXT DEFAULT '',
            personality_traits_ext TEXT DEFAULT '',
            ideals TEXT DEFAULT '',
            bonds TEXT DEFAULT '',
            flaws TEXT DEFAULT '',
            background_feature TEXT DEFAULT '',
            appearance TEXT DEFAULT '',
            backstory TEXT DEFAULT '',
            origin TEXT DEFAULT '',
            languages TEXT DEFAULT '',
            tool_proficiencies TEXT DEFAULT '',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 负重/物品
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            item_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            weight REAL DEFAULT 0,
            value TEXT DEFAULT '',
            location TEXT DEFAULT '背包',
            notes TEXT DEFAULT '',
            description TEXT DEFAULT '',
            effect TEXT DEFAULT '',
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 角色特性（职业能力/专长/种族特性/特殊能力/其他特性）
        CREATE TABLE IF NOT EXISTS character_features (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER,
            category TEXT NOT NULL DEFAULT 'other',
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        -- 角色分组
        CREATE TABLE IF NOT EXISTS character_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '新分组',
            sort_order INTEGER DEFAULT 0,
            created_by TEXT DEFAULT ''
        );
    """)

    # ━━━ 自动迁移: 为旧数据库添加新列 ━━━
    _migrate_schema(cursor, conn)

    conn.commit()
    conn.close()


def _migrate_schema(cursor, conn):
    """为旧版本数据库添加缺失的列"""
    existing_cols = set()
    cursor.execute("PRAGMA table_info(characters)")
    for row in cursor.fetchall():
        existing_cols.add(row['name'])

    migrations = [
        ('player', "TEXT DEFAULT ''"),
        ('subrace', "TEXT DEFAULT ''"),
        ('background_field', "TEXT DEFAULT ''"),
        ('faith', "TEXT DEFAULT ''"),
        ('gender', "TEXT DEFAULT ''"),
        ('age', "TEXT DEFAULT ''"),
        ('height', "TEXT DEFAULT ''"),
        ('weight_field', "TEXT DEFAULT ''"),
        ('hd_count', "INTEGER DEFAULT 1"),
        ('passive_perception', "INTEGER DEFAULT 10"),
        ('spellcasting_ability', "TEXT DEFAULT ''"),
        ('spell_attack_bonus', "INTEGER DEFAULT 0"),
        ('spell_save_dc', "INTEGER DEFAULT 10"),
        ('prepared_spell_count', "INTEGER DEFAULT 0"),
        ('portrait_path', "TEXT DEFAULT ''"),
        ('source_file', "TEXT DEFAULT ''"),
        ('created_by', "TEXT DEFAULT ''"),
        ('resistances', "TEXT DEFAULT ''"),
        ('key_abilities', "TEXT DEFAULT ''"),
        ('sort_order', "INTEGER DEFAULT 0"),
        ('group_id', "INTEGER DEFAULT NULL"),
    ]

    for col_name, col_def in migrations:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE characters ADD COLUMN {col_name} {col_def}")
            except Exception:
                pass

    # save_proficiencies 表新增 save_bonus
    existing_save_cols = set()
    try:
        cursor.execute("PRAGMA table_info(save_proficiencies)")
        for row in cursor.fetchall():
            existing_save_cols.add(row['name'])
    except Exception:
        pass

    if 'save_bonus' not in existing_save_cols:
        try:
            cursor.execute("ALTER TABLE save_proficiencies ADD COLUMN save_bonus INTEGER DEFAULT 0")
        except Exception:
            pass

    # inventory 表新增 description / effect
    existing_inv_cols = set()
    try:
        cursor.execute("PRAGMA table_info(inventory)")
        for row in cursor.fetchall():
            existing_inv_cols.add(row['name'])
    except Exception:
        pass

    for col_name in ('description', 'effect'):
        if col_name not in existing_inv_cols:
            try:
                cursor.execute(f"ALTER TABLE inventory ADD COLUMN {col_name} TEXT DEFAULT ''")
            except Exception:
                pass

    # weapons 表新增 description / effect
    existing_wp_cols = set()
    try:
        cursor.execute("PRAGMA table_info(weapons)")
        for row in cursor.fetchall():
            existing_wp_cols.add(row['name'])
    except Exception:
        pass

    for col_name in ('description', 'effect'):
        if col_name not in existing_wp_cols:
            try:
                cursor.execute(f"ALTER TABLE weapons ADD COLUMN {col_name} TEXT DEFAULT ''")
            except Exception:
                pass

    # skill_proficiencies 表新增 bonus
    existing_sk_cols = set()
    try:
        cursor.execute("PRAGMA table_info(skill_proficiencies)")
        for row in cursor.fetchall():
            existing_sk_cols.add(row['name'])
    except Exception:
        pass

    if 'bonus' not in existing_sk_cols:
        try:
            cursor.execute("ALTER TABLE skill_proficiencies ADD COLUMN bonus INTEGER DEFAULT 0")
        except Exception:
            pass

    # background_details 表新增 personality_traits_ext
    existing_bg_cols = set()
    try:
        cursor.execute("PRAGMA table_info(background_details)")
        for row in cursor.fetchall():
            existing_bg_cols.add(row['name'])
    except Exception:
        pass

    if 'personality_traits_ext' not in existing_bg_cols:
        try:
            cursor.execute("ALTER TABLE background_details ADD COLUMN personality_traits_ext TEXT DEFAULT ''")
        except Exception:
            pass


# ━━━ 角色 CRUD ━━━

def create_character(name: str, level: int = 1, cls: str = '', race: str = '',
                     background: str = '', alignment: str = '',
                     player: str = '', subrace: str = '', faith: str = '',
                     gender: str = '', age: str = '', height: str = '', weight: str = '',
                     created_by: str = '', group_id: int | None = None) -> int:
    """创建角色，返回角色ID"""
    conn = get_db()
    cursor = conn.cursor()

    prof = proficiency_bonus(level)

    cursor.execute("""
        INSERT INTO characters (name, level, class, race, background_field, alignment,
                               proficiency_bonus, player, created_by, subrace, faith,
                               gender, age, height, weight_field, group_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (name, level, cls, race, background, alignment, prof,
          player, created_by, subrace, faith, gender, age, height, weight, group_id))

    char_id = cursor.lastrowid

    # 默认属性
    cursor.execute("""
        INSERT INTO abilities (character_id, str, dex, con, int_score, wis, cha)
        VALUES (?, 10, 10, 10, 10, 10, 10)
    """, (char_id,))

    # 默认死亡豁免
    cursor.execute("INSERT INTO death_saves (character_id) VALUES (?)", (char_id,))

    # 默认护甲
    cursor.execute("INSERT INTO armor (character_id) VALUES (?)", (char_id,))

    # 默认钱币
    cursor.execute("INSERT INTO coins (character_id) VALUES (?)", (char_id,))

    # 默认背景
    cursor.execute("INSERT INTO background_details (character_id) VALUES (?)", (char_id,))

    conn.commit()
    conn.close()

    return char_id


def get_character(name_or_id: str | int) -> dict | None:
    """获取角色完整数据"""
    conn = get_db()
    cursor = conn.cursor()

    # 按名字或ID查询
    if isinstance(name_or_id, str):
        cursor.execute("SELECT * FROM characters WHERE name = ?", (name_or_id,))
    else:
        cursor.execute("SELECT * FROM characters WHERE id = ?", (name_or_id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    char = dict(row)
    char_id = char['id']

    # 属性（始终返回默认值，即使数据库无行）
    cursor.execute("SELECT * FROM abilities WHERE character_id = ?", (char_id,))
    ability_row = cursor.fetchone()
    char['abilities'] = {
        'str': ability_row['str'] if ability_row else 10,
        'dex': ability_row['dex'] if ability_row else 10,
        'con': ability_row['con'] if ability_row else 10,
        'int': ability_row['int_score'] if ability_row else 10,
        'wis': ability_row['wis'] if ability_row else 10,
        'cha': ability_row['cha'] if ability_row else 10,
    }
    char['ability_mods'] = {
        k: ability_modifier(v) for k, v in char['abilities'].items()
    }

    # 技能熟练（含加值）
    cursor.execute("SELECT * FROM skill_proficiencies WHERE character_id = ?", (char_id,))
    skill_rows = cursor.fetchall()
    char['skill_proficiencies'] = {}
    for row in skill_rows:
        row_dict = dict(row)
        char['skill_proficiencies'][row['skill_name']] = {
            'is_proficient': bool(row['is_proficient']),
            'is_expertise': bool(row['is_expertise']),
            'bonus': row_dict.get('bonus', 0),
        }

    # 豁免熟练
    cursor.execute("SELECT * FROM save_proficiencies WHERE character_id = ?", (char_id,))
    save_rows = cursor.fetchall()
    char['save_proficiencies'] = {}
    for row in save_rows:
        row_dict = dict(row) if row else {}
        char['save_proficiencies'][row_dict.get('ability_name', row['ability_name'])] = {
            'is_proficient': bool(row['is_proficient']),
            'save_bonus': row_dict.get('save_bonus', 0),
        }

    # 法术位
    cursor.execute("SELECT * FROM spell_slots WHERE character_id = ?", (char_id,))
    slot_rows = cursor.fetchall()
    char['spell_slots'] = {}
    for row in slot_rows:
        char['spell_slots'][row['slot_level']] = {
            'max': row['max_slots'],
            'used': row['used_slots'],
        }

    # 死亡豁免
    cursor.execute("SELECT * FROM death_saves WHERE character_id = ?", (char_id,))
    ds_row = cursor.fetchone()
    if ds_row:
        char['death_saves'] = {
            'successes': ds_row['successes'],
            'failures': ds_row['failures'],
            'is_stable': bool(ds_row['is_stable']),
        }

    # 武器
    cursor.execute("SELECT * FROM weapons WHERE character_id = ? ORDER BY id", (char_id,))
    char['weapons'] = [dict(r) for r in cursor.fetchall()]

    # 护甲
    cursor.execute("SELECT * FROM armor WHERE character_id = ?", (char_id,))
    armor_row = cursor.fetchone()
    char['armor'] = dict(armor_row) if armor_row else {}

    # 钱币
    cursor.execute("SELECT * FROM coins WHERE character_id = ?", (char_id,))
    coin_row = cursor.fetchone()
    char['coins'] = dict(coin_row) if coin_row else {}

    # 已准备法术
    cursor.execute("SELECT * FROM prepared_spells WHERE character_id = ?", (char_id,))
    char['prepared_spells'] = [dict(r) for r in cursor.fetchall()]

    # 法术书（已学习法术）
    cursor.execute("SELECT * FROM learned_spells WHERE character_id = ? ORDER BY spell_level, spell_name", (char_id,))
    char['learned_spells'] = [dict(r) for r in cursor.fetchall()]

    # 背景
    cursor.execute("SELECT * FROM background_details WHERE character_id = ?", (char_id,))
    bg_row = cursor.fetchone()
    char['background'] = dict(bg_row) if bg_row else {}

    # 物品
    cursor.execute("SELECT * FROM inventory WHERE character_id = ? ORDER BY id", (char_id,))
    char['inventory'] = [dict(r) for r in cursor.fetchall()]

    # 特性（按类别分组）
    cursor.execute("SELECT * FROM character_features WHERE character_id = ? ORDER BY category, sort_order, id", (char_id,))
    features = [dict(r) for r in cursor.fetchall()]
    char['features'] = {}
    for f in features:
        cat = f.get('category', 'other')
        if cat not in char['features']:
            char['features'][cat] = []
        char['features'][cat].append(f)

    conn.close()
    return char


def list_characters(created_by: str | None = None) -> list[dict]:
    """列出角色。若指定 created_by 则只返回该用户创建的角色；否则返回全部。"""
    conn = get_db()
    cursor = conn.cursor()
    if created_by:
        cursor.execute(
            "SELECT id, name, level, class, race, hp_current, hp_max, group_id FROM characters WHERE created_by = ? ORDER BY sort_order, id",
            (created_by,)
        )
    else:
        cursor.execute("SELECT id, name, level, class, race, hp_current, hp_max, group_id FROM characters ORDER BY sort_order, id")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_character_groups(created_by: str | None = None) -> list[dict]:
    """列出角色分组。PL 只能看到自己创建的分组和全局分组。"""
    conn = get_db()
    cursor = conn.cursor()
    if created_by:
        cursor.execute(
            "SELECT * FROM character_groups WHERE created_by = ? OR created_by = '' ORDER BY sort_order, id",
            (created_by,)
        )
    else:
        cursor.execute("SELECT * FROM character_groups ORDER BY sort_order, id")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_character_group(name: str, created_by: str = '') -> int:
    """创建角色分组，返回分组 ID。"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO character_groups (name, sort_order, created_by) VALUES (?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM character_groups), ?)",
        (name, created_by)
    )
    conn.commit()
    gid = cursor.lastrowid
    conn.close()
    return gid


def update_character_group(group_id: int, **kwargs) -> bool:
    """更新分组（name, sort_order）。"""
    allowed = ['name', 'sort_order']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    conn = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [group_id]
    conn.execute(f"UPDATE character_groups SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return True


def delete_character_group(group_id: int) -> bool:
    """删除分组，角色自动移回未分组（group_id = NULL）。"""
    conn = get_db()
    # 将组内角色移回未分组
    conn.execute("UPDATE characters SET group_id = NULL WHERE group_id = ?", (group_id,))
    conn.execute("DELETE FROM character_groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()
    return True


def set_character_group(char_id: int, group_id: int | None) -> bool:
    """将角色移入指定分组（group_id=None 表示移回未分组）。"""
    conn = get_db()
    conn.execute("UPDATE characters SET group_id = ? WHERE id = ?", (group_id, char_id))
    conn.commit()
    conn.close()
    return True


def update_character(char_id: int, **kwargs) -> bool:
    """更新角色属性"""
    allowed = ['name', 'player', 'level', 'class', 'race', 'subrace',
               'background_field', 'alignment', 'faith', 'gender', 'age',
               'height', 'weight_field', 'hp_max', 'hp_current', 'temp_hp',
               'ac', 'initiative_bonus', 'speed', 'hit_dice', 'hd_count',
               'xp', 'passive_perception', 'spellcasting_ability',
               'spell_attack_bonus', 'spell_save_dc', 'prepared_spell_count',
               'portrait_path', 'source_file', 'resistances', 'key_abilities']
    updates = {k: v for k, v in kwargs.items() if k in allowed}

    if not updates:
        return False

    # 如果等级改变，更新熟练加值
    if 'level' in updates:
        updates['proficiency_bonus'] = proficiency_bonus(updates['level'])

    conn = get_db()
    cursor = conn.cursor()

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [char_id]
    cursor.execute(f"UPDATE characters SET {set_clause} WHERE id = ?", values)

    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def set_ability(char_id: int, ability: str, score: int) -> bool:
    """设置单个属性值"""
    ability = ability.lower()
    field_map = {
        'str': 'str', 'strength': 'str', '力量': 'str',
        'dex': 'dex', 'dexterity': 'dex', '敏捷': 'dex',
        'con': 'con', 'constitution': 'con', '体质': 'con',
        'int': 'int_score', 'intelligence': 'int_score', '智力': 'int_score',
        'wis': 'wis', 'wisdom': 'wis', '感知': 'wis',
        'cha': 'cha', 'charisma': 'cha', '魅力': 'cha',
    }
    field = field_map.get(ability)
    if not field or score < 1 or score > 30:
        return False

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE abilities SET {field} = ? WHERE character_id = ?",
                   (score, char_id))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def set_skill_proficiency(char_id: int, skill_name: str, is_proficient: bool = True,
                          is_expertise: bool = False, bonus: int = 0) -> bool:
    """设置技能熟练（含加值）"""
    skill_name = normalize_skill(skill_name)
    if not skill_name:
        return False

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO skill_proficiencies (character_id, skill_name, is_proficient, is_expertise, bonus)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
    """, (char_id, skill_name, int(is_proficient), int(is_expertise), bonus))

    if cursor.rowcount == 0:
        cursor.execute("""
            UPDATE skill_proficiencies
            SET is_proficient = ?, is_expertise = ?, bonus = ?
            WHERE character_id = ? AND skill_name = ?
        """, (int(is_proficient), int(is_expertise), bonus, char_id, skill_name))

    conn.commit()
    conn.close()
    return True


def set_save_proficiency(char_id: int, ability: str, is_proficient: bool = True,
                         save_bonus: int = 0) -> bool:
    """设置豁免熟练"""
    ability = normalize_ability(ability)
    if not ability:
        return False

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO save_proficiencies (character_id, ability_name, is_proficient, save_bonus)
        VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
    """, (char_id, ability, int(is_proficient), save_bonus))

    if cursor.rowcount == 0:
        cursor.execute("""
            UPDATE save_proficiencies SET is_proficient = ?, save_bonus = ?
            WHERE character_id = ? AND ability_name = ?
        """, (int(is_proficient), save_bonus, char_id, ability))

    conn.commit()
    conn.close()
    return True


def set_hp(char_id: int, hp_current: int | None = None,
           hp_max: int | None = None) -> dict:
    """直接设置生命值（当前/最大）

    Args:
        char_id: 角色ID
        hp_current: 新的当前HP（None表示不修改）
        hp_max: 新的最大HP（None表示不修改）

    Returns:
        包含更新后状态的字典
    """
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    updates = {}
    if hp_max is not None:
        updates['hp_max'] = max(1, hp_max)
        # 如果当前HP超过新的最大值，自动调整
        if hp_current is None and char['hp_current'] > updates['hp_max']:
            updates['hp_current'] = updates['hp_max']
    if hp_current is not None:
        max_hp = hp_max if hp_max is not None else char['hp_max']
        updates['hp_current'] = max(0, min(hp_current, max_hp))

    if updates:
        update_character(char_id, **updates)

    # 重新获取最新数据
    char = get_character(char_id)
    result = {
        'hp_current': char['hp_current'],
        'hp_max': char['hp_max'],
        'temp_hp': char.get('temp_hp', 0),
    }

    if char['hp_current'] <= 0:
        conn = get_db()
        conn.execute(
            "UPDATE death_saves SET successes = 0, failures = 0, is_stable = 0 "
            "WHERE character_id = ?",
            (char_id,))
        conn.commit()
        conn.close()
        result['status'] = 'unconscious'

    return result


def adjust_hp(char_id: int, amount: int) -> dict:
    """调整生命值（相对增减），返回新状态"""
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    new_hp = char['hp_current'] + amount

    # 先扣临时HP
    if amount < 0 and char.get('temp_hp', 0) > 0:
        temp_dmg = min(char['temp_hp'], abs(amount))
        remaining = abs(amount) - temp_dmg
        new_temp = char['temp_hp'] - temp_dmg
        new_hp = char['hp_current'] - remaining
        update_character(char_id, temp_hp=new_temp)

    new_hp = max(0, min(char['hp_max'], new_hp))

    conn = get_db()
    conn.execute("UPDATE characters SET hp_current = ? WHERE id = ?",
                 (new_hp, char_id))
    conn.commit()
    conn.close()

    result = {'hp_current': new_hp, 'hp_max': char['hp_max']}

    if new_hp <= 0:
        conn = get_db()
        conn.execute("UPDATE death_saves SET successes = 0, failures = 0, is_stable = 0 WHERE character_id = ?",
                     (char_id,))
        conn.commit()
        conn.close()
        result['status'] = 'unconscious'

    return result


def init_spell_slots(char_id: int, slots: dict[str, int]) -> bool:
    """初始化法术位"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM spell_slots WHERE character_id = ?", (char_id,))

    for level, max_count in slots.items():
        cursor.execute("""
            INSERT INTO spell_slots (character_id, slot_level, max_slots, used_slots)
            VALUES (?, ?, ?, 0)
        """, (char_id, str(level), max_count))

    conn.commit()
    conn.close()
    return True


def init_spell_slots_by_level(char_id: int, class_level: int) -> bool:
    """根据职业等级初始化法术位（标准施法者）"""
    slots = get_spell_slots_for_level(class_level)
    return init_spell_slots(char_id, slots)


def use_spell_slot(char_id: int, level: str) -> dict:
    """消耗一个法术位"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM spell_slots
        WHERE character_id = ? AND slot_level = ?
    """, (char_id, str(level)))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return {'error': '该环法术位未设定'}

    if row['used_slots'] >= row['max_slots']:
        conn.close()
        return {'error': f'{level}环法术位已用完'}

    new_used = row['used_slots'] + 1
    cursor.execute("""
        UPDATE spell_slots SET used_slots = ?
        WHERE character_id = ? AND slot_level = ?
    """, (new_used, char_id, str(level)))

    conn.commit()
    conn.close()
    return {
        'level': level,
        'used': new_used,
        'max': row['max_slots'],
        'remaining': row['max_slots'] - new_used,
    }


def long_rest(char_id: int) -> dict:
    """长休：恢复HP和法术位"""
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    update_character(char_id, hp_current=char['hp_max'])

    conn = get_db()
    conn.execute("UPDATE spell_slots SET used_slots = 0 WHERE character_id = ?",
                 (char_id,))
    conn.execute("DELETE FROM death_saves WHERE character_id = ?", (char_id,))
    conn.execute("INSERT INTO death_saves (character_id) VALUES (?)", (char_id,))
    # 长休恢复一半生命骰（至少1个）
    hd = char.get('hd_count', 1)
    restored_hd = max(1, hd // 2)
    conn.execute("UPDATE characters SET hd_count = hd_count WHERE id = ?", (char_id,))
    # 生命骰恢复至最大值的一半
    from core.dnd5e_rules import ability_modifier
    level = char.get('level', 1)
    max_hd = level
    conn.execute("UPDATE characters SET hd_count = ? WHERE id = ?",
                 (max_hd, char_id))
    conn.commit()
    conn.close()

    return {
        'hp': char['hp_max'],
        'spell_slots_restored': True,
        'death_saves_reset': True,
        'hd_restored': max_hd,
    }


def short_rest(char_id: int, hd_to_spend: int = None) -> dict:
    """短休：消耗生命骰恢复HP。

    D&D5E 规则：
    - 可消耗任意数量的生命骰（每个角色拥有等于等级的HD）
    - 每消耗1个生命骰，掷对应骰子 + 体质调整值，恢复等量HP
    - 无法超过最大HP

    Args:
        char_id: 角色ID
        hd_to_spend: 要消耗的生命骰数量（None=消耗全部可用）

    Returns:
        dict: 包含恢复详情
    """
    from core.dnd5e_rules import ability_modifier
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    available_hd = char.get('hd_count', 0)
    if available_hd <= 0:
        return {'error': '没有可用的生命骰，需要长休恢复'}

    if hd_to_spend is None:
        hd_to_spend = available_hd
    hd_to_spend = min(hd_to_spend, available_hd)
    if hd_to_spend <= 0:
        return {'error': '请指定至少1个生命骰'}

    # 解析生命骰类型
    hd_str = char.get('hit_dice', '1d8')
    if 'd' in hd_str.lower():
        hd_size = int(hd_str.lower().split('d')[1])
    else:
        hd_size = 8

    # 获取体质调整值
    con_score = char['abilities'].get('con', 10)
    con_mod = ability_modifier(con_score)

    # 掷生命骰
    from core.dice_engine import roll as dice_roll
    rolls = []
    total_healed = 0
    for _ in range(hd_to_spend):
        r = dice_roll(f'1d{hd_size}')
        roll_val = r.total
        heal = roll_val + con_mod
        if heal < 0:
            heal = 0  # 每颗生命骰至少恢复0HP
        rolls.append({'die': f'd{hd_size}', 'roll': roll_val, 'con_mod': con_mod, 'heal': heal})
        total_healed += heal

    # 更新HP
    hp_max = char['hp_max']
    hp_current = char['hp_current']
    new_hp = min(hp_current + total_healed, hp_max)
    actual_healed = new_hp - hp_current

    # 更新生命骰计数
    new_hd_count = available_hd - hd_to_spend

    conn = get_db()
    conn.execute("UPDATE characters SET hp_current = ?, hd_count = ? WHERE id = ?",
                 (new_hp, new_hd_count, char_id))
    conn.commit()
    conn.close()

    return {
        'hd_spent': hd_to_spend,
        'hd_remaining': new_hd_count,
        'hd_rolls': rolls,
        'con_mod': con_mod,
        'total_rolled': total_healed,
        'actual_healed': actual_healed,
        'hp_before': hp_current,
        'hp_after': new_hp,
        'hp_max': hp_max,
        'capped': total_healed > actual_healed,
    }


def death_save(char_id: int, roll_value: int, modifier: int = 0) -> dict:
    """处理死亡豁免检定"""
    total = roll_value + modifier
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    ds = char.get('death_saves', {'successes': 0, 'failures': 0})

    if roll_value == 20:
        adjust_hp(char_id, 1)
        return {
            'success': True,
            'nat20': True,
            'hp_restored': True,
            'successes': ds['successes'],
            'failures': ds['failures'],
            'message': '✨ Natural 20！你恢复 1 点生命值并恢复意识！'
        }
    elif roll_value == 1:
        new_failures = min(3, ds['failures'] + 2)
        conn = get_db()
        conn.execute("UPDATE death_saves SET failures = ? WHERE character_id = ?",
                     (new_failures, char_id))
        conn.commit()
        conn.close()
        msg = '💀 Natural 1！算作两次失败！' if new_failures < 3 else '💀 三次失败...角色死亡...'
        return {
            'success': False,
            'nat1': True,
            'failures': new_failures,
            'successes': ds['successes'],
            'is_dead': new_failures >= 3,
            'message': msg,
        }
    elif total >= 10:
        new_successes = min(3, ds['successes'] + 1)
        conn = get_db()
        if new_successes >= 3:
            conn.execute("UPDATE death_saves SET successes = ?, is_stable = 1 WHERE character_id = ?",
                        (new_successes, char_id))
        else:
            conn.execute("UPDATE death_saves SET successes = ? WHERE character_id = ?",
                        (new_successes, char_id))
        conn.commit()
        conn.close()
        return {
            'success': True,
            'successes': new_successes,
            'failures': ds['failures'],
            'is_stable': new_successes >= 3,
            'message': '✅ 成功！' + (' 你稳定了！' if new_successes >= 3 else f' ({new_successes}/3)'),
        }
    else:
        new_failures = min(3, ds['failures'] + 1)
        conn = get_db()
        conn.execute("UPDATE death_saves SET failures = ? WHERE character_id = ?",
                     (new_failures, char_id))
        conn.commit()
        conn.close()
        return {
            'success': False,
            'successes': ds['successes'],
            'failures': new_failures,
            'is_dead': new_failures >= 3,
            'message': '❌ 失败...' + (' 角色死亡...' if new_failures >= 3 else f' ({new_failures}/3)'),
        }


def delete_character(char_id: int) -> bool:
    """删除角色（级联删除相关数据）"""
    conn = get_db()
    conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
    conn.commit()
    conn.close()
    return True


def copy_character(char_id: int, new_name: str = '') -> int:
    """复制角色，返回新角色ID"""
    char = get_character(char_id)
    if not char:
        raise ValueError('角色不存在')

    if not new_name:
        new_name = f"{char['name']} (副本)"

    # 创建新角色基础信息
    new_id = create_character(
        name=new_name,
        level=char.get('level', 1),
        cls=char.get('class', ''),
        race=char.get('race', ''),
        background=char.get('background_field', ''),
        alignment=char.get('alignment', ''),
        player=char.get('player', ''),
        subrace=char.get('subrace', ''),
        faith=char.get('faith', ''),
        gender=char.get('gender', ''),
        age=char.get('age', ''),
        height=char.get('height', ''),
        weight=char.get('weight_field', ''),
        created_by=char.get('created_by', ''),
    )

    # 复制属性
    abilities = char.get('abilities', {})
    for key, score in abilities.items():
        set_ability(new_id, key, score)

    # 复制战斗属性
    update_character(new_id,
        hp_max=char.get('hp_max', 10),
        hp_current=char.get('hp_current', 10),
        ac=char.get('ac', 10),
        speed=char.get('speed', 30),
        proficiency_bonus=char.get('proficiency_bonus', 2),
        passive_perception=char.get('passive_perception', 10),
        hit_dice=char.get('hit_dice', '1d8'),
        hd_count=char.get('hd_count', 1),
        xp=char.get('xp', 0),
        initiative_bonus=char.get('initiative_bonus', 0),
    )

    # 复制技能熟练
    for skill_name, prof in char.get('skill_proficiencies', {}).items():
        set_skill_proficiency(new_id, skill_name,
            prof.get('is_proficient', False),
            prof.get('is_expertise', False),
            prof.get('bonus', 0))

    # 复制豁免熟练
    for ability_name, prof in char.get('save_proficiencies', {}).items():
        set_save_proficiency(new_id, ability_name,
            prof.get('is_proficient', False),
            prof.get('save_bonus', 0))

    # 复制法术位
    from collections import OrderedDict
    slots = char.get('spell_slots', {})
    if slots:
        slot_map = {str(k): v.get('max', 0) for k, v in slots.items()}
        init_spell_slots(new_id, slot_map)

    # 复制武器
    for w in char.get('weapons', []):
        add_weapon(new_id, w.get('name', ''), w.get('attack_bonus', 0),
            w.get('damage_dice', ''), w.get('damage_type', ''),
            w.get('is_proficient', False), w.get('ammo', ''),
            w.get('notes', ''), w.get('description', ''),
            w.get('effect', ''))

    # 复制护甲
    armor = char.get('armor', {})
    if armor:
        set_armor(new_id, armor.get('armor_name', ''),
            armor.get('armor_ac', 0), armor.get('armor_max_dex', ''),
            armor.get('shield_name', ''), armor.get('shield_ac', 0),
            armor.get('shield_weight', ''))

    # 复制钱币
    coins = char.get('coins', {})
    if coins:
        set_coins(new_id, coins.get('cp', 0), coins.get('sp', 0),
            coins.get('ep', 0), coins.get('gp', 0), coins.get('pp', 0))

    # 复制已准备法术
    for spell in char.get('prepared_spells', []):
        add_prepared_spell(new_id, spell.get('spell_name', ''),
            spell.get('spell_level', 0))

    # 复制法术书
    for spell in char.get('learned_spells', []):
        add_learned_spell(new_id, spell.get('spell_name', ''),
            spell.get('spell_level', 0), spell.get('school', ''),
            spell.get('casting_time', ''), spell.get('range', ''),
            spell.get('duration', ''), spell.get('components', ''),
            spell.get('ritual', '否'), spell.get('concentration', '否'),
            spell.get('description', ''), spell.get('source', '自定义'))

    # 复制背景
    bg = char.get('background', {})
    if bg:
        bg_kwargs = {k: v for k, v in bg.items()
                     if k in ('personality_traits', 'personality_traits_ext',
                              'ideals', 'bonds', 'flaws', 'background_feature',
                              'appearance', 'backstory', 'origin', 'languages',
                              'tool_proficiencies')}
        if bg_kwargs:
            set_background(new_id, **bg_kwargs)

    # 复制物品
    for item in char.get('inventory', []):
        add_item(new_id, item.get('item_name', ''),
            item.get('quantity', 1), item.get('weight', 0),
            item.get('value', ''), item.get('location', '背包'),
            item.get('description', ''), item.get('effect', ''))

    return new_id


# ━━━ 武器管理 ━━━

def add_weapon(char_id: int, name: str, attack_bonus: int = 0,
               damage_dice: str = '', damage_type: str = '',
               is_proficient: bool = False, ammo: str = '',
               notes: str = '', description: str = '',
               effect: str = '') -> int:
    """添加武器（含描述与效果），返回武器ID"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO weapons (character_id, name, attack_bonus, damage_dice,
                            damage_type, is_proficient, ammo, notes,
                            description, effect)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (char_id, name, attack_bonus, damage_dice, damage_type,
          int(is_proficient), ammo, notes, description, effect))
    conn.commit()
    weapon_id = cursor.lastrowid
    conn.close()
    return weapon_id


def clear_weapons(char_id: int) -> None:
    """清除角色的所有武器"""
    conn = get_db()
    conn.execute("DELETE FROM weapons WHERE character_id = ?", (char_id,))
    conn.commit()
    conn.close()


def remove_weapon(weapon_id: int) -> bool:
    """按 ID 删除单个武器，返回是否成功"""
    conn = get_db()
    cursor = conn.execute("DELETE FROM weapons WHERE id = ?", (weapon_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ━━━ 护甲管理 ━━━

def set_armor(char_id: int, armor_name: str = '', armor_ac: int = 0,
              armor_max_dex: str = '', shield_name: str = '',
              shield_ac: int = 0, shield_weight: str = '') -> bool:
    """设置护甲信息"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO armor (character_id, armor_name, armor_ac, armor_max_dex,
                          shield_name, shield_ac, shield_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(character_id) DO UPDATE SET
            armor_name=excluded.armor_name, armor_ac=excluded.armor_ac,
            armor_max_dex=excluded.armor_max_dex, shield_name=excluded.shield_name,
            shield_ac=excluded.shield_ac, shield_weight=excluded.shield_weight
    """, (char_id, armor_name, armor_ac, armor_max_dex,
          shield_name, shield_ac, shield_weight))
    conn.commit()
    conn.close()
    return True


# ━━━ 钱币管理 ━━━

def set_coins(char_id: int, cp: int = 0, sp: int = 0, ep: int = 0,
              gp: int = 0, pp: int = 0) -> bool:
    """设置钱币"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO coins (character_id, cp, sp, ep, gp, pp)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(character_id) DO UPDATE SET
            cp=excluded.cp, sp=excluded.sp, ep=excluded.ep,
            gp=excluded.gp, pp=excluded.pp
    """, (char_id, cp, sp, ep, gp, pp))
    conn.commit()
    conn.close()
    return True


def adjust_coin(char_id: int, coin_type: str, amount: int) -> dict:
    """调整指定货币数量"""
    char = get_character(char_id)
    if not char:
        return {'error': '角色不存在'}

    coin_map = {'cp': 'cp', 'sp': 'sp', 'ep': 'ep', 'gp': 'gp', 'pp': 'pp',
                '铜币': 'cp', '银币': 'sp', '金银币': 'ep', '金币': 'gp', '白金币': 'pp'}
    coin_field = coin_map.get(coin_type.lower(), coin_type.lower())

    current = char.get('coins', {}).get(coin_field, 0)
    new_value = max(0, current + amount)

    conn = get_db()
    conn.execute(f"UPDATE coins SET {coin_field} = ? WHERE character_id = ?",
                 (new_value, char_id))
    conn.commit()
    conn.close()

    return {'coin_type': coin_field, 'old': current, 'new': new_value, 'change': amount}


# ━━━ 已准备法术管理 ━━━

def add_prepared_spell(char_id: int, spell_name: str, spell_level: int = 0) -> int:
    """添加已准备法术"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO prepared_spells (character_id, spell_name, spell_level)
        VALUES (?, ?, ?)
    """, (char_id, spell_name, spell_level))
    conn.commit()
    sid = cursor.lastrowid
    conn.close()
    return sid


def clear_prepared_spells(char_id: int) -> None:
    """清除已准备法术"""
    conn = get_db()
    conn.execute("DELETE FROM prepared_spells WHERE character_id = ?", (char_id,))
    conn.commit()
    conn.close()


# ━━━ 法术书（已学习法术）管理 ━━━

def add_learned_spell(char_id: int, spell_name: str, spell_level: int = 0,
                     school: str = '', casting_time: str = '', range_: str = '',
                     duration: str = '', components: str = '', ritual: str = '否',
                     concentration: str = '否', description: str = '',
                     source: str = '自定义') -> int:
    """添加法术到法术书，返回法术ID"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO learned_spells (character_id, spell_name, spell_level, school,
            casting_time, range, duration, components, ritual, concentration,
            description, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (char_id, spell_name, spell_level, school, casting_time, range_,
          duration, components, ritual, concentration, description, source))
    conn.commit()
    sid = cursor.lastrowid
    conn.close()
    return sid


def remove_learned_spell(spell_id: int) -> bool:
    """从法术书删除法术"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM learned_spells WHERE id = ?", (spell_id,))
    ok = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def get_learned_spells(char_id: int) -> list[dict]:
    """获取角色的法术书"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM learned_spells WHERE character_id = ? ORDER BY spell_level, spell_name",
        (char_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_learned_spells(char_id: int) -> None:
    """清除法术书"""
    conn = get_db()
    conn.execute("DELETE FROM learned_spells WHERE character_id = ?", (char_id,))
    conn.commit()
    conn.close()


# ━━━ 背景管理 ━━━

def set_background(char_id: int, **kwargs) -> bool:
    """设置背景信息"""
    allowed = ['personality_traits', 'personality_traits_ext',
               'ideals', 'bonds', 'flaws',
               'background_feature', 'appearance', 'backstory',
               'origin', 'languages', 'tool_proficiencies']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False

    conn = get_db()
    cursor = conn.cursor()

    # Upsert
    set_parts = ", ".join(f"{k}=excluded.{k}" for k in updates)
    cols = ", ".join(updates.keys())
    placeholders = ", ".join("?" * len(updates))
    values = list(updates.values())

    cursor.execute(f"""
        INSERT INTO background_details (character_id, {cols})
        VALUES (?, {placeholders})
        ON CONFLICT(character_id) DO UPDATE SET {set_parts}
    """, [char_id] + values)

    conn.commit()
    conn.close()
    return True


# ━━━ 物品管理 ━━━

def add_item(char_id: int, item_name: str, quantity: int = 1,
             weight: float = 0, value: str = '', location: str = '背包',
             description: str = '', effect: str = '') -> int:
    """添加物品（含描述与效果），同名物品自动堆叠"""
    conn = get_db()
    cursor = conn.cursor()
    # 查找背包中是否已有同名同位置物品
    cursor.execute("""
        SELECT id, quantity FROM inventory
        WHERE character_id = ? AND item_name = ? AND location = ?
        LIMIT 1
    """, (char_id, item_name, location))
    existing = cursor.fetchone()
    if existing:
        new_qty = existing[1] + quantity
        cursor.execute("UPDATE inventory SET quantity = ? WHERE id = ?",
                       (new_qty, existing[0]))
        conn.commit()
        iid = existing[0]
    else:
        cursor.execute("""
            INSERT INTO inventory (character_id, item_name, quantity, weight, value, location,
                                   description, effect)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (char_id, item_name, quantity, weight, value, location, description, effect))
        conn.commit()
        iid = cursor.lastrowid
    conn.close()
    return iid


def update_item_quantity(item_id: int, quantity: int) -> bool:
    """设置物品数量，返回是否成功。quantity <= 0 则删除物品"""
    conn = get_db()
    if quantity <= 0:
        cursor = conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
        conn.commit()
        deleted = cursor.rowcount > 0
        conn.close()
        return deleted
    cursor = conn.execute("UPDATE inventory SET quantity = ? WHERE id = ?",
                          (quantity, item_id))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def remove_item_quantity(item_id: int, amount: int) -> tuple[bool, int]:
    """减少物品指定数量，返回(是否操作成功, 剩余数量)。
    若剩余<=0则自动删除该物品条目"""
    conn = get_db()
    cursor = conn.execute("SELECT quantity FROM inventory WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False, 0
    current = row[0]
    new_qty = current - amount
    if new_qty <= 0:
        conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return True, 0
    conn.execute("UPDATE inventory SET quantity = ? WHERE id = ?", (new_qty, item_id))
    conn.commit()
    conn.close()
    return True, new_qty


def stack_inventory(char_id: int) -> int:
    """合并角色背包中同名同位置的重复物品，返回合并掉的条目数。
    保留第一条，将其余同名物品的数量累加到第一条后删除"""
    conn = get_db()
    cursor = conn.execute("""
        SELECT item_name, location, MIN(id) as keep_id, SUM(quantity) as total_qty, COUNT(*) as cnt
        FROM inventory
        WHERE character_id = ?
        GROUP BY item_name, location
        HAVING cnt > 1
    """, (char_id,))
    duplicates = cursor.fetchall()
    merged = 0
    for item_name, location, keep_id, total_qty, cnt in duplicates:
        # 更新保留条目的数量
        conn.execute("UPDATE inventory SET quantity = ? WHERE id = ?",
                     (total_qty, keep_id))
        # 删除其余同名条目
        conn.execute("""
            DELETE FROM inventory
            WHERE character_id = ? AND item_name = ? AND location = ? AND id != ?
        """, (char_id, item_name, location, keep_id))
        merged += cnt - 1
    conn.commit()
    conn.close()
    return merged


def clear_inventory(char_id: int) -> None:
    """清空物品栏"""
    conn = get_db()
    conn.execute("DELETE FROM inventory WHERE character_id = ?", (char_id,))
    conn.commit()
    conn.close()


def remove_item(item_id: int) -> bool:
    """按 ID 删除单个物品，返回是否成功"""
    conn = get_db()
    cursor = conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ━━━ 从 Excel 数据导入角色 ━━━

def import_from_excel_data(data: dict, source_file: str = '', created_by: str = '') -> int:
    """从 Excel 解析数据创建完整角色

    Args:
        data: utils.excel_importer.import_character_from_excel() 的返回值
        source_file: 导入的 Excel 文件路径（可选）
        created_by: 导入者名称（用于权限控制）

    Returns:
        新创建的角色ID
    """
    basic = data.get('basic', {})
    abilities = data.get('abilities', {})
    combat = data.get('combat', {})
    skill_profs = data.get('skill_proficiencies', {})
    save_profs = data.get('save_proficiencies', {})
    armor_data = data.get('armor', {})
    weapons = data.get('weapons', [])
    spell_info = data.get('spell_info', {})
    spell_slots = data.get('spell_slots', {})
    prepared_spells = data.get('prepared_spells', [])
    coins_data = data.get('coins', {})
    background = data.get('background', {})

    name = basic.get('name', '未命名角色')
    if not name:
        name = '未命名角色'

    # 创建角色
    conn = get_db()
    cursor = conn.cursor()

    level = basic.get('level', 1) or 1
    prof = proficiency_bonus(level)

    cls = basic.get('class', '') or ''
    race = basic.get('race', '') or ''
    hp_max = combat.get('hp_max', 10) or 10
    hp_current = combat.get('hp_current', hp_max) or hp_max
    ac = combat.get('ac', 10) or 10

    cursor.execute("""
        INSERT INTO characters (name, player, created_by, level, class, race, subrace,
                               background_field, alignment, faith, gender,
                               age, height, weight_field,
                               hp_max, hp_current, ac, initiative_bonus,
                               speed, hit_dice, hd_count, xp,
                               passive_perception, proficiency_bonus,
                               spellcasting_ability, spell_save_dc,
                               prepared_spell_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name,
        basic.get('player', '') or '',
        created_by,
        level,
        cls,
        race,
        basic.get('subrace', '') or '',
        '',  # background_field (from 背景 sheet)
        basic.get('alignment', '') or '',
        basic.get('faith', '') or '',
        basic.get('gender', '') or '',
        str(basic.get('age', '') or ''),
        str(basic.get('height', '') or ''),
        str(basic.get('weight', '') or ''),
        hp_max,
        hp_current,
        ac,
        combat.get('initiative_bonus', 0) or 0,
        combat.get('speed', 30) or 30,
        combat.get('hd_type', '1d8') or '1d8',
        combat.get('hd_count', 1) or 1,
        basic.get('xp', 0) or 0,
        combat.get('passive_perception', 10) or 10,
        prof,
        spell_info.get('spellcasting_ability', '') or '',
        spell_info.get('spell_save_dc', 10) or 10,
        spell_info.get('prepared_spell_count', 0) or 0,
    ))

    char_id = cursor.lastrowid
    conn.commit()

    # 属性值
    cursor.execute("""
        INSERT INTO abilities (character_id, str, dex, con, int_score, wis, cha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (char_id,
          abilities.get('str', 10) or 10,
          abilities.get('dex', 10) or 10,
          abilities.get('con', 10) or 10,
          abilities.get('int', 10) or 10,
          abilities.get('wis', 10) or 10,
          abilities.get('cha', 10) or 10))

    # 死亡豁免
    cursor.execute("INSERT INTO death_saves (character_id) VALUES (?)", (char_id,))

    conn.commit()
    conn.close()

    # 技能熟练（含加值）
    for skill_name, prof_data in skill_profs.items():
        set_skill_proficiency(char_id, skill_name,
                            prof_data.get('is_proficient', False),
                            prof_data.get('is_expertise', False),
                            prof_data.get('bonus', 0) or 0)

    # 豁免熟练
    for ability_name, prof_data in save_profs.items():
        set_save_proficiency(char_id, ability_name,
                           prof_data.get('is_proficient', False),
                           prof_data.get('save_bonus', 0))

    # 护甲
    if armor_data:
        set_armor(char_id,
                  armor_data.get('armor_name', '') or '',
                  armor_data.get('armor_ac', 0) or 0,
                  armor_data.get('armor_max_dex', '') or '',
                  armor_data.get('shield_name', '') or '',
                  armor_data.get('shield_ac', 0) or 0,
                  armor_data.get('shield_weight', '') or '')

    # 武器
    clear_weapons(char_id)
    for w in weapons:
        if w.get('name'):
            add_weapon(char_id,
                      w['name'],
                      w.get('attack_bonus', 0) or 0,
                      w.get('damage_dice', '') or '',
                      w.get('damage_type', '') or '',
                      w.get('is_proficient', False),
                      w.get('ammo', '') or '',
                      w.get('notes', '') or '',
                      w.get('description', '') or '',
                      w.get('effect', '') or '')

    # 物品/背包
    clear_inventory(char_id)
    inventory = data.get('inventory', [])
    for item in inventory:
        if item.get('item_name'):
            add_item(char_id,
                    item['item_name'],
                    item.get('quantity', 1) or 1,
                    item.get('weight', 0) or 0,
                    item.get('value', '') or '',
                    item.get('location', '背包') or '背包',
                    item.get('description', '') or '',
                    item.get('effect', '') or '')

    # 法术位
    if spell_slots:
        slot_map = {}
        for level_str, slot_data in spell_slots.items():
            max_slots = slot_data.get('max', 0) or 0
            if max_slots > 0:
                slot_map[level_str] = max_slots
        if slot_map:
            init_spell_slots(char_id, slot_map)

    # 已准备法术
    clear_prepared_spells(char_id)
    for spell in prepared_spells:
        if spell.get('name'):
            add_prepared_spell(char_id, spell['name'],
                             spell.get('level', 0) or 0)

    # 钱币
    if coins_data:
        set_coins(char_id,
                  coins_data.get('cp', 0) or 0,
                  coins_data.get('sp', 0) or 0,
                  coins_data.get('ep', 0) or 0,
                  coins_data.get('gp', 0) or 0,
                  coins_data.get('pp', 0) or 0)

    # 背景
    if background:
        set_background(char_id, **background)

    # 头像路径
    portrait_path = data.get('portrait_path', '')
    if portrait_path:
        update_character(char_id, portrait_path=portrait_path)

    # 源文件路径
    if source_file:
        update_character(char_id, source_file=source_file)

    return char_id


# ━━━ 角色特性管理（职业能力/专长/种族特性/特殊能力/其他） ━━━

FEATURE_CATEGORIES = {
    'class_feature': '职业能力',
    'feat': '专长',
    'racial_trait': '种族特性',
    'special_ability': '特殊能力',
    'other': '其他特性',
}


def add_feature(char_id: int, category: str, name: str, description: str = '') -> int:
    """添加角色特性，返回特性ID"""
    conn = get_db()
    cursor = conn.cursor()
    # 获取当前最大排序
    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM character_features WHERE character_id = ? AND category = ?",
        (char_id, category))
    next_order = cursor.fetchone()[0]
    cursor.execute(
        "INSERT INTO character_features (character_id, category, name, description, sort_order) VALUES (?, ?, ?, ?, ?)",
        (char_id, category, name, description, next_order))
    conn.commit()
    fid = cursor.lastrowid
    conn.close()
    return fid


def update_feature(feature_id: int, **kwargs) -> bool:
    """更新特性字段（name, description, category, sort_order）"""
    allowed = ['name', 'description', 'category', 'sort_order']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    conn = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [feature_id]
    conn.execute(f"UPDATE character_features SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return True


def delete_feature(feature_id: int) -> bool:
    """删除特性"""
    conn = get_db()
    cursor = conn.execute("DELETE FROM character_features WHERE id = ?", (feature_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# 初始化数据库
init_db()
