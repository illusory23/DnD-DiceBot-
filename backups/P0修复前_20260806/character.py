"""DND 角色卡管理系统

使用 SQLAlchemy ORM 存储角色数据。
支持从 NekoWorks DND 5E 人物卡 Excel 导入。
兼容原有 SQLite 数据库，可通过 DATABASE_URL 环境变量切换 PostgreSQL。
"""

import os
import json as _json
from pathlib import Path
from core.dnd5e_rules import (
    ability_modifier, proficiency_bonus, SKILL_TO_ABILITY,
    get_ability_for_skill, normalize_ability, normalize_skill,
    STANDARD_SPELL_SLOTS, get_spell_slots_for_level
)
from core.database import db
from core.models import (
    Character, CharacterGroup, Ability, SkillProficiency, SaveProficiency,
    SpellSlot, DeathSave, Weapon, Armor, Coins, PreparedSpell, LearnedSpell,
    BackgroundDetail, InventoryItem, CharacterFeature,
)

DB_PATH = Path(__file__).parent.parent / "data" / "characters.db"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 数据库初始化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def init_db() -> None:
    """初始化数据库表（幂等 — 已存在的表不会重复创建）。

    替代原来的 sqlite3 executescript + _migrate_schema。
    SQLAlchemy create_all 自动处理表创建，Alembic 负责后续迁移。
    """
    from core.database import create_tables
    create_tables()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 辅助函数
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _save():
    """提交数据库事务"""
    db.session.commit()


def resolve_portrait_path(path: str):
    """解析头像路径为绝对路径。（与原来相同的搜索逻辑）"""
    if not path or not path.strip():
        return None, []
    path = path.strip()
    if len(path) >= 2 and ((path[0] == '"' and path[-1] == '"') or (path[0] == "'" and path[-1] == "'")):
        path = path[1:-1]

    script_dir = DB_PATH.parent
    base = script_dir.parent
    tried = []
    candidates = [
        Path(path),
        script_dir / path,
        base / path,
        base / '人物相关' / path,
    ]
    for candidate in candidates:
        tried.append(str(candidate))
        try:
            if candidate.exists() and candidate.is_file():
                return str(candidate.resolve()), []
        except (OSError, PermissionError):
            continue

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


def _char_to_dict(char: Character) -> dict:
    """将 ORM 对象转为字典（兼容原有返回格式）"""
    d = {
        'id': char.id, 'name': char.name, 'player': char.player,
        'created_by': char.created_by or '', 'level': char.level,
        'class': char.class_, 'race': char.race, 'subrace': char.subrace or '',
        'background_field': char.background_field or '',
        'alignment': char.alignment or '', 'faith': char.faith or '',
        'gender': char.gender or '', 'age': char.age or '',
        'height': char.height or '', 'weight_field': char.weight_field or '',
        'hp_max': char.hp_max, 'hp_current': char.hp_current,
        'temp_hp': char.temp_hp, 'ac': char.ac,
        'initiative_bonus': char.initiative_bonus, 'speed': char.speed,
        'proficiency_bonus': char.proficiency_bonus,
        'hit_dice': char.hit_dice, 'hd_count': char.hd_count, 'xp': char.xp,
        'passive_perception': char.passive_perception,
        'spellcasting_ability': char.spellcasting_ability or '',
        'spell_attack_bonus': char.spell_attack_bonus,
        'spell_save_dc': char.spell_save_dc,
        'prepared_spell_count': char.prepared_spell_count,
        'portrait_path': char.portrait_path or '',
        'source_file': char.source_file or '',
        'resistances': char.resistances or '',
        'key_abilities': char.key_abilities or '',
        'sort_order': char.sort_order,
        'group_id': char.group_id,
        'created_at': char.created_at.isoformat() if char.created_at else '',
    }
    # abilities — 前端期望嵌套对象 + 扁平字段
    if char.abilities:
        a = char.abilities
        d['str'] = a.str; d['dex'] = a.dex; d['con'] = a.con
        d['int'] = a.int_score; d['wis'] = a.wis; d['cha'] = a.cha
        d['abilities'] = {'str': a.str, 'dex': a.dex, 'con': a.con,
                          'int': a.int_score, 'wis': a.wis, 'cha': a.cha}
        d['ability_mods'] = {k: ability_modifier(v) for k, v in d['abilities'].items()}
    # skill_proficiencies — 前端期望 {技能名: {is_proficient, ...}}
    skills = {}
    for s in char.skill_proficiencies:
        skills[s.skill_name] = {'is_proficient': s.is_proficient, 'is_expertise': s.is_expertise, 'bonus': s.bonus or 0}
    d['skill_proficiencies'] = skills
    # save_proficiencies
    saves = {}
    for s in char.save_proficiencies:
        saves[s.ability_name] = {'is_proficient': s.is_proficient, 'save_bonus': s.save_bonus or 0}
    d['save_proficiencies'] = saves
    # weapons — 前端期望数组
    d['weapons'] = [{'id': w.id, 'name': w.name, 'attack_bonus': w.attack_bonus,
                      'damage_dice': w.damage_dice, 'damage_type': w.damage_type,
                      'is_proficient': w.is_proficient, 'ammo': w.ammo, 'notes': w.notes,
                      'description': w.description, 'effect': w.effect} for w in char.weapons]
    # inventory — 前端期望数组
    d['inventory'] = [{'id': i.id, 'item_name': i.item_name, 'quantity': i.quantity,
                        'weight': i.weight, 'value': i.value, 'location': i.location,
                        'notes': i.notes, 'description': i.description, 'effect': i.effect}
                      for i in char.inventory]
    # prepared_spells / learned_spells
    d['prepared_spells'] = [{'id': s.id, 'spell_name': s.spell_name, 'spell_level': s.spell_level,
                              'is_prepared': s.is_prepared, 'notes': s.notes} for s in char.prepared_spells]
    d['learned_spells'] = [{'id': s.id, 'spell_name': s.spell_name, 'spell_level': s.spell_level,
                             'school': s.school, 'casting_time': s.casting_time, 'range': s.range,
                             'duration': s.duration, 'components': s.components, 'ritual': s.ritual,
                             'concentration': s.concentration, 'description': s.description,
                             'source': s.source} for s in char.learned_spells]
    if char.coins:
        c = char.coins
        d['cp'] = c.cp; d['sp'] = c.sp; d['ep'] = c.ep
        d['gp'] = c.gp; d['pp'] = c.pp
    if char.armor:
        ar = char.armor
        d['armor_name'] = ar.armor_name; d['armor_ac'] = ar.armor_ac
        d['armor_max_dex'] = ar.armor_max_dex
        d['shield_name'] = ar.shield_name; d['shield_ac'] = ar.shield_ac
        d['shield_weight'] = ar.shield_weight
    if char.death_saves:
        ds = char.death_saves
        d['ds_successes'] = ds.successes; d['ds_failures'] = ds.failures
        d['ds_stable'] = ds.is_stable
    if char.background_details:
        bg = char.background_details
        d['personality_traits'] = bg.personality_traits
        d['personality_traits_ext'] = bg.personality_traits_ext or ''
        d['ideals'] = bg.ideals; d['bonds'] = bg.bonds
        d['flaws'] = bg.flaws; d['background_feature'] = bg.background_feature or ''
        d['appearance'] = bg.appearance or ''; d['backstory'] = bg.backstory or ''
        d['origin'] = bg.origin or ''; d['languages'] = bg.languages or ''
        d['tool_proficiencies'] = bg.tool_proficiencies or ''
    # features — 专长/职业能力/种族特性/特殊能力
    d['features'] = [{'id': f.id, 'category': f.category, 'feature_name': f.name,
                       'description': f.description, 'sort_order': f.sort_order}
                      for f in char.features]
    return d


def _get_char(name_or_id) -> Character | None:
    """根据名称或ID获取角色ORM对象"""
    if isinstance(name_or_id, int):
        return db.session.get(Character, name_or_id)
    try:
        char_id = int(name_or_id)
        return db.session.get(Character, char_id)
    except (ValueError, TypeError):
        return Character.query.filter_by(name=name_or_id).first()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 角色 CRUD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_character(name: str, level: int = 1, cls: str = '', race: str = '',
                     created_by: str = '') -> int:
    """创建角色并返回ID"""
    char = Character(
        name=name, level=level, class_=cls, race=race, created_by=created_by,
        hp_max=10, hp_current=10,
    )
    db.session.add(char)
    db.session.flush()  # 获取 ID

    # 创建关联记录
    db.session.add(Ability(character_id=char.id))
    for ability in ['str', 'dex', 'con', 'int', 'wis', 'cha']:
        db.session.add(SaveProficiency(character_id=char.id, ability_name=ability))
    db.session.add(DeathSave(character_id=char.id))
    db.session.add(Armor(character_id=char.id))
    db.session.add(Coins(character_id=char.id))
    db.session.add(BackgroundDetail(character_id=char.id))
    _save()
    return char.id


def get_character(name_or_id: str | int) -> dict | None:
    """获取角色（返回字典）"""
    char = _get_char(name_or_id)
    return _char_to_dict(char) if char else None


def list_characters(created_by: str | None = None) -> list[dict]:
    """列出所有角色"""
    q = Character.query.order_by(Character.sort_order, Character.id)
    if created_by:
        q = q.filter_by(created_by=created_by)
    return [_char_to_dict(c) for c in q.all()]


def update_character(char_id: int, **kwargs) -> bool:
    """更新角色字段"""
    char = db.session.get(Character, char_id)
    if not char:
        return False
    for key, value in kwargs.items():
        if key == 'class':
            key = 'class_'
        if key == 'weight':
            key = 'weight_field'
        if key == 'int':
            # 属性值通过 set_ability 设置，这里跳过
            continue
        if hasattr(char, key):
            setattr(char, key, value)
    _save()
    return True


def delete_character(char_id: int) -> bool:
    """删除角色（ORM 自动级联删除所有关联数据）"""
    char = db.session.get(Character, char_id)
    if not char:
        return False
    db.session.delete(char)
    _save()
    return True


def copy_character(char_id: int, new_name: str = '') -> int:
    """复制角色（含所有关联数据），返回新角色ID"""
    orig = db.session.get(Character, char_id)
    if not orig:
        raise ValueError(f'角色不存在: {char_id}')

    # 创建新角色
    new_char = Character(
        name=new_name or (orig.name + ' (副本)'),
        player=orig.player, created_by=orig.created_by,
        level=orig.level, class_=orig.class_, race=orig.race,
        subrace=orig.subrace, background_field=orig.background_field,
        alignment=orig.alignment, faith=orig.faith,
        gender=orig.gender, age=orig.age, height=orig.height,
        weight_field=orig.weight_field, hp_max=orig.hp_max,
        hp_current=orig.hp_current, temp_hp=orig.temp_hp, ac=orig.ac,
        initiative_bonus=orig.initiative_bonus, speed=orig.speed,
        proficiency_bonus=orig.proficiency_bonus,
        hit_dice=orig.hit_dice, hd_count=orig.hd_count, xp=orig.xp,
        passive_perception=orig.passive_perception,
        spellcasting_ability=orig.spellcasting_ability,
        spell_attack_bonus=orig.spell_attack_bonus,
        spell_save_dc=orig.spell_save_dc,
        prepared_spell_count=orig.prepared_spell_count,
        portrait_path=orig.portrait_path, source_file=orig.source_file,
        group_id=orig.group_id,
    )
    db.session.add(new_char)
    db.session.flush()

    # 复制关联数据
    if orig.abilities:
        a = orig.abilities
        db.session.add(Ability(character_id=new_char.id, str=a.str, dex=a.dex,
                               con=a.con, int_score=a.int_score, wis=a.wis, cha=a.cha))
    if orig.armor:
        ar = orig.armor
        db.session.add(Armor(character_id=new_char.id, armor_name=ar.armor_name,
                             armor_ac=ar.armor_ac, armor_max_dex=ar.armor_max_dex,
                             shield_name=ar.shield_name, shield_ac=ar.shield_ac))
    if orig.coins:
        c = orig.coins
        db.session.add(Coins(character_id=new_char.id, cp=c.cp, sp=c.sp,
                             ep=c.ep, gp=c.gp, pp=c.pp))
    if orig.background_details:
        bg = orig.background_details
        db.session.add(BackgroundDetail(
            character_id=new_char.id, personality_traits=bg.personality_traits,
            personality_traits_ext=bg.personality_traits_ext, ideals=bg.ideals,
            bonds=bg.bonds, flaws=bg.flaws,
            background_feature=bg.background_feature,
            appearance=bg.appearance, backstory=bg.backstory,
            origin=bg.origin, languages=bg.languages,
            tool_proficiencies=bg.tool_proficiencies,
        ))
    if orig.death_saves:
        ds = orig.death_saves
        db.session.add(DeathSave(character_id=new_char.id, successes=ds.successes,
                                 failures=ds.failures, is_stable=ds.is_stable))

    for s in orig.skill_proficiencies:
        db.session.add(SkillProficiency(
            character_id=new_char.id, skill_name=s.skill_name,
            is_proficient=s.is_proficient, is_expertise=s.is_expertise, bonus=s.bonus))
    for s in orig.save_proficiencies:
        db.session.add(SaveProficiency(
            character_id=new_char.id, ability_name=s.ability_name,
            is_proficient=s.is_proficient, save_bonus=s.save_bonus))
    for s in orig.spell_slots:
        db.session.add(SpellSlot(
            character_id=new_char.id, slot_level=s.slot_level,
            max_slots=s.max_slots, used_slots=s.used_slots))
    for w in orig.weapons:
        db.session.add(Weapon(
            character_id=new_char.id, name=w.name,
            attack_bonus=w.attack_bonus, damage_dice=w.damage_dice,
            damage_type=w.damage_type, is_proficient=w.is_proficient,
            ammo=w.ammo, notes=w.notes, description=w.description, effect=w.effect))
    for s in orig.prepared_spells:
        db.session.add(PreparedSpell(
            character_id=new_char.id, spell_name=s.spell_name,
            spell_level=s.spell_level, is_prepared=s.is_prepared, notes=s.notes))
    for s in orig.learned_spells:
        db.session.add(LearnedSpell(
            character_id=new_char.id, spell_name=s.spell_name,
            spell_level=s.spell_level, school=s.school,
            casting_time=s.casting_time, range=s.range, duration=s.duration,
            components=s.components, ritual=s.ritual,
            concentration=s.concentration, description=s.description, source=s.source))
    for item in orig.inventory:
        db.session.add(InventoryItem(
            character_id=new_char.id, item_name=item.item_name,
            quantity=item.quantity, weight=item.weight, value=item.value,
            location=item.location, notes=item.notes,
            description=item.description, effect=item.effect))
    for feat in orig.features:
        db.session.add(CharacterFeature(
            character_id=new_char.id, category=feat.category,
            name=feat.name, description=feat.description, sort_order=feat.sort_order))

    _save()
    return new_char.id


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 属性 & 技能 & 豁免
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def set_ability(char_id: int, ability: str, score: int) -> bool:
    """设置属性值"""
    ability = normalize_ability(ability)
    if not ability:
        return False
    a = Ability.query.filter_by(character_id=char_id).first()
    if not a:
        a = Ability(character_id=char_id)
        db.session.add(a)
    field_map = {'str': 'str', 'dex': 'dex', 'con': 'con', 'int': 'int_score',
                 'wis': 'wis', 'cha': 'cha'}
    setattr(a, field_map.get(ability, ability), score)
    _save()
    return True


def set_skill_proficiency(char_id: int, skill_name: str, is_proficient: bool = True,
                          is_expertise: bool = False, bonus: int = 0) -> bool:
    """设置技能熟练"""
    skill = normalize_skill(skill_name)
    if not skill:
        return False
    sp = SkillProficiency.query.filter_by(character_id=char_id, skill_name=skill).first()
    if sp:
        sp.is_proficient = is_proficient
        sp.is_expertise = is_expertise
        sp.bonus = bonus
    else:
        db.session.add(SkillProficiency(
            character_id=char_id, skill_name=skill,
            is_proficient=is_proficient, is_expertise=is_expertise, bonus=bonus))
    _save()
    return True


def set_save_proficiency(char_id: int, ability: str, is_proficient: bool = True,
                         save_bonus: int = 0) -> bool:
    """设置豁免熟练"""
    ability = normalize_ability(ability)
    if not ability:
        return False
    sp = SaveProficiency.query.filter_by(character_id=char_id, ability_name=ability).first()
    if sp:
        sp.is_proficient = is_proficient
        sp.save_bonus = save_bonus
    else:
        db.session.add(SaveProficiency(
            character_id=char_id, ability_name=ability,
            is_proficient=is_proficient, save_bonus=save_bonus))
    _save()
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HP & 休整
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def set_hp(char_id: int, hp_current: int | None = None,
           hp_max: int | None = None, temp_hp: int = 0) -> bool:
    """设置生命值"""
    char = db.session.get(Character, char_id)
    if not char:
        return False
    if hp_max is not None:
        char.hp_max = hp_max
    if hp_current is not None:
        char.hp_current = hp_current
    char.temp_hp = temp_hp
    _save()
    return True


def adjust_hp(char_id: int, amount: int) -> dict:
    """调整HP，返回 {hp_current, hp_max, temp_hp, is_dead}"""
    char = db.session.get(Character, char_id)
    if not char:
        return {'hp_current': 0, 'hp_max': 0, 'temp_hp': 0, 'is_dead': False}
    # 先扣临时HP
    if amount < 0 and char.temp_hp > 0:
        temp_absorb = min(char.temp_hp, -amount)
        char.temp_hp -= temp_absorb
        amount += temp_absorb
    char.hp_current = max(0, char.hp_current + amount)
    _save()
    return {
        'hp_current': char.hp_current, 'hp_max': char.hp_max,
        'temp_hp': char.temp_hp,
        'is_dead': char.hp_current <= 0,
    }


def long_rest(char_id: int) -> dict:
    """长休：恢复全部HP、法术位、生命骰"""
    char = db.session.get(Character, char_id)
    if not char:
        return {}
    char.hp_current = char.hp_max
    char.temp_hp = 0
    for slot in char.spell_slots:
        slot.used_slots = 0
    char.hd_count = int(char.hit_dice[1:]) if char.hit_dice and 'd' in char.hit_dice else char.hd_count
    if char.death_saves:
        char.death_saves.successes = 0
        char.death_saves.failures = 0
        char.death_saves.is_stable = False
    _save()
    return {'hp_current': char.hp_current, 'hp_max': char.hp_max}


def short_rest(char_id: int, hd_to_spend: int = None) -> dict:
    """短休：消耗生命骰恢复HP"""
    char = db.session.get(Character, char_id)
    if not char:
        return {}
    if hd_to_spend is None:
        hd_to_spend = char.hd_count
    hd_to_spend = min(hd_to_spend, char.hd_count)
    if hd_to_spend <= 0:
        return {'hp_current': char.hp_current, 'hp_max': char.hp_max, 'spent_hd': 0}

    die_size = 8
    if char.hit_dice and 'd' in char.hit_dice:
        try:
            die_size = int(char.hit_dice.split('d')[1])
        except (ValueError, IndexError):
            pass
    con_mod = 0
    if char.abilities:
        con_mod = ability_modifier(char.abilities.con)

    import random
    healed = 0
    for _ in range(hd_to_spend):
        healed += random.randint(1, die_size) + con_mod
    char.hp_current = min(char.hp_max, char.hp_current + healed)
    char.hd_count -= hd_to_spend
    _save()
    return {'hp_current': char.hp_current, 'hp_max': char.hp_max,
            'spent_hd': hd_to_spend, 'healed': healed}


def death_save(char_id: int, roll_value: int, modifier: int = 0) -> dict:
    """死亡豁免"""
    char = db.session.get(Character, char_id)
    if not char:
        return {}
    ds = char.death_saves
    if ds is None:
        ds = DeathSave(character_id=char_id)
        db.session.add(ds)
    total = roll_value + modifier
    if roll_value == 20:
        ds.successes = 3
        ds.is_stable = True
    elif roll_value == 1:
        ds.failures += 2
    elif total >= 10:
        ds.successes += 1
    else:
        ds.failures += 1
    if ds.failures >= 3:
        ds.is_stable = False
    if ds.successes >= 3:
        ds.is_stable = True
    _save()
    return {'successes': ds.successes, 'failures': ds.failures,
            'is_stable': ds.is_stable, 'total': total}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 法术位
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def init_spell_slots(char_id: int, slots: dict[str, int]) -> bool:
    """初始化法术位"""
    char = db.session.get(Character, char_id)
    if not char:
        return False
    # 清除旧的
    SpellSlot.query.filter_by(character_id=char_id).delete()
    for level, count in slots.items():
        if count > 0:
            db.session.add(SpellSlot(
                character_id=char_id, slot_level=str(level),
                max_slots=count, used_slots=0))
    _save()
    return True


def init_spell_slots_by_level(char_id: int, class_level: int) -> bool:
    """按职业等级初始化法术位"""
    slots = get_spell_slots_for_level(class_level)
    return init_spell_slots(char_id, slots)


def use_spell_slot(char_id: int, level: str) -> dict:
    """消耗法术位"""
    slot = SpellSlot.query.filter_by(character_id=char_id, slot_level=str(level)).first()
    if not slot:
        return {'ok': False, 'error': f'没有{level}环法术位'}
    if slot.used_slots >= slot.max_slots:
        return {'ok': False, 'error': f'{level}环法术位已用完'}
    slot.used_slots += 1
    _save()
    return {'ok': True, 'remaining': slot.max_slots - slot.used_slots}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 武器 & 护甲
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def add_weapon(char_id: int, name: str, attack_bonus: int = 0,
               damage_dice: str = '', damage_type: str = '',
               is_proficient: bool = False, ammo: str = '',
               notes: str = '', description: str = '', effect: str = '') -> int:
    """添加武器，返回武器ID"""
    w = Weapon(character_id=char_id, name=name, attack_bonus=attack_bonus,
               damage_dice=damage_dice, damage_type=damage_type,
               is_proficient=is_proficient, ammo=ammo, notes=notes,
               description=description, effect=effect)
    db.session.add(w)
    db.session.flush()
    _save()
    return w.id


def clear_weapons(char_id: int) -> None:
    Weapon.query.filter_by(character_id=char_id).delete()
    _save()


def remove_weapon(weapon_id: int) -> bool:
    w = db.session.get(Weapon, weapon_id)
    if not w:
        return False
    db.session.delete(w)
    _save()
    return True


def set_armor(char_id: int, armor_name: str = '', armor_ac: int = 0,
              armor_max_dex: str = '', shield_name: str = '',
              shield_ac: int = 0, shield_weight: str = '') -> bool:
    a = Armor.query.filter_by(character_id=char_id).first()
    if not a:
        a = Armor(character_id=char_id)
        db.session.add(a)
    a.armor_name = armor_name; a.armor_ac = armor_ac
    a.armor_max_dex = armor_max_dex; a.shield_name = shield_name
    a.shield_ac = shield_ac; a.shield_weight = shield_weight
    _save()
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 钱币
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def set_coins(char_id: int, cp: int = 0, sp: int = 0, ep: int = 0,
              gp: int = 0, pp: int = 0) -> bool:
    c = Coins.query.filter_by(character_id=char_id).first()
    if not c:
        c = Coins(character_id=char_id)
        db.session.add(c)
    c.cp = cp; c.sp = sp; c.ep = ep; c.gp = gp; c.pp = pp
    _save()
    return True


def adjust_coin(char_id: int, coin_type: str, amount: int) -> dict:
    c = Coins.query.filter_by(character_id=char_id).first()
    if not c:
        c = Coins(character_id=char_id)
        db.session.add(c)
    coin_map = {'cp': 'cp', 'sp': 'sp', 'ep': 'ep', 'gp': 'gp', 'pp': 'pp'}
    attr = coin_map.get(coin_type.lower())
    if not attr:
        return {'error': f'无效币种: {coin_type}'}
    new_val = getattr(c, attr) + amount
    if new_val < 0:
        return {'error': f'{coin_type.upper()}不足'}
    setattr(c, attr, new_val)
    _save()
    result = {'ok': True, coin_type: getattr(c, attr)}
    for key in coin_map.values():
        result[key] = getattr(c, key)
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 法术
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def add_prepared_spell(char_id: int, spell_name: str, spell_level: int = 0) -> int:
    s = PreparedSpell(character_id=char_id, spell_name=spell_name,
                      spell_level=spell_level)
    db.session.add(s); db.session.flush(); _save()
    return s.id


def clear_prepared_spells(char_id: int) -> None:
    PreparedSpell.query.filter_by(character_id=char_id).delete()
    _save()


def add_learned_spell(char_id: int, spell_name: str, spell_level: int = 0,
                      school: str = '', casting_time: str = '', range: str = '',
                      duration: str = '', components: str = '', ritual: str = '否',
                      concentration: str = '否', description: str = '',
                      source: str = '自定义') -> int:
    s = LearnedSpell(character_id=char_id, spell_name=spell_name,
                     spell_level=spell_level, school=school,
                     casting_time=casting_time, range=range, duration=duration,
                     components=components, ritual=ritual,
                     concentration=concentration, description=description, source=source)
    db.session.add(s); db.session.flush(); _save()
    return s.id


def remove_learned_spell(spell_id: int) -> bool:
    s = db.session.get(LearnedSpell, spell_id)
    if not s: return False
    db.session.delete(s); _save()
    return True


def get_learned_spells(char_id: int) -> list[dict]:
    spells = LearnedSpell.query.filter_by(character_id=char_id).all()
    return [{c.name: getattr(s, c.name) for c in s.__table__.columns} for s in spells]


def clear_learned_spells(char_id: int) -> None:
    LearnedSpell.query.filter_by(character_id=char_id).delete()
    _save()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 背景
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def set_background(char_id: int, **kwargs) -> bool:
    bg = BackgroundDetail.query.filter_by(character_id=char_id).first()
    if not bg:
        bg = BackgroundDetail(character_id=char_id)
        db.session.add(bg)
    for key, value in kwargs.items():
        if hasattr(bg, key):
            setattr(bg, key, value)
    _save()
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 物品
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def add_item(char_id: int, item_name: str, quantity: int = 1,
             weight: float = 0, value: str = '', location: str = '背包',
             notes: str = '', description: str = '', effect: str = '') -> int:
    """添加物品，同名自动堆叠"""
    # 检查同名物品
    existing = InventoryItem.query.filter_by(
        character_id=char_id, item_name=item_name).first()
    if existing:
        existing.quantity += quantity
        _save()
        return existing.id
    item = InventoryItem(character_id=char_id, item_name=item_name,
                         quantity=quantity, weight=weight, value=value,
                         location=location, notes=notes,
                         description=description, effect=effect)
    db.session.add(item); db.session.flush(); _save()
    return item.id


def update_item_quantity(item_id: int, quantity: int) -> bool:
    item = db.session.get(InventoryItem, item_id)
    if not item: return False
    if quantity <= 0:
        db.session.delete(item)
    else:
        item.quantity = quantity
    _save()
    return True


def remove_item_quantity(item_id: int, amount: int) -> tuple[bool, int]:
    """减少物品数量，返回(是否完全删除, 剩余数量)"""
    item = db.session.get(InventoryItem, item_id)
    if not item:
        return False, 0
    new_qty = item.quantity - amount
    if new_qty <= 0:
        db.session.delete(item)
        _save()
        return True, 0
    item.quantity = new_qty
    _save()
    return False, new_qty


def stack_inventory(char_id: int) -> int:
    """合并同名物品，返回合并后的物品种类数"""
    items = InventoryItem.query.filter_by(character_id=char_id).all()
    merged = {}
    for item in items:
        if item.item_name in merged:
            merged[item.item_name].quantity += item.quantity
            db.session.delete(item)
        else:
            merged[item.item_name] = item
    _save()
    return len(merged)


def clear_inventory(char_id: int) -> None:
    InventoryItem.query.filter_by(character_id=char_id).delete()
    _save()


def remove_item(item_id: int) -> bool:
    item = db.session.get(InventoryItem, item_id)
    if not item: return False
    db.session.delete(item); _save()
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 角色特性
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def add_feature(char_id: int, category: str, name: str, description: str = '') -> int:
    f = CharacterFeature(character_id=char_id, category=category,
                         name=name, description=description)
    db.session.add(f); db.session.flush(); _save()
    return f.id


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 角色分组
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def list_character_groups(created_by: str | None = None) -> list[dict]:
    q = CharacterGroup.query.order_by(CharacterGroup.sort_order)
    if created_by:
        q = q.filter_by(created_by=created_by)
    return [{c.name: getattr(g, c.name) for c in g.__table__.columns}
            for g in q.all()]


def create_character_group(name: str, created_by: str = '') -> int:
    g = CharacterGroup(name=name, created_by=created_by)
    db.session.add(g); db.session.flush(); _save()
    return g.id


def update_character_group(group_id: int, **kwargs) -> bool:
    g = db.session.get(CharacterGroup, group_id)
    if not g: return False
    for k, v in kwargs.items():
        if hasattr(g, k):
            setattr(g, k, v)
    _save()
    return True


def delete_character_group(group_id: int) -> bool:
    g = db.session.get(CharacterGroup, group_id)
    if not g: return False
    db.session.delete(g); _save()
    return True


def set_character_group(char_id: int, group_id: int | None) -> bool:
    char = db.session.get(Character, char_id)
    if not char: return False
    char.group_id = group_id
    _save()
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Excel 导入
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def import_from_excel_data(data: dict, source_file: str = '',
                           created_by: str = '') -> int:
    """从 Excel 解析后的字典导入角色。

    data 格式来自 utils/excel_importer.py 的解析结果。
    返回新角色ID。
    """
    name = data.get('name', '未命名')
    char = Character(
        name=name,
        player=data.get('player', ''),
        created_by=created_by or data.get('created_by', ''),
        level=data.get('level', 1),
        class_=data.get('class', ''),
        race=data.get('race', ''),
        subrace=data.get('subrace', ''),
        background_field=data.get('background', ''),
        alignment=data.get('alignment', ''),
        faith=data.get('faith', ''),
        gender=data.get('gender', ''),
        age=data.get('age', ''),
        height=data.get('height', ''),
        weight_field=data.get('weight', ''),
        hp_max=data.get('hp_max', 10),
        hp_current=data.get('hp_current', 10),
        temp_hp=data.get('temp_hp', 0),
        ac=data.get('ac', 10),
        initiative_bonus=data.get('initiative_bonus', 0),
        speed=data.get('speed', 30),
        proficiency_bonus=data.get('proficiency_bonus', 2),
        hit_dice=data.get('hit_dice', '1d8'),
        hd_count=data.get('hd_count', 1),
        xp=data.get('xp', 0),
        passive_perception=data.get('passive_perception', 10),
        spellcasting_ability=data.get('spellcasting_ability', ''),
        spell_attack_bonus=data.get('spell_attack_bonus', 0),
        spell_save_dc=data.get('spell_save_dc', 10),
        prepared_spell_count=data.get('prepared_spell_count', 0),
        portrait_path=data.get('portrait_path', ''),
        source_file=source_file,
        resistances=data.get('resistances', ''),
        key_abilities=data.get('key_abilities', ''),
    )
    db.session.add(char)
    db.session.flush()

    # 属性
    abilities_data = data.get('abilities', {})
    db.session.add(Ability(
        character_id=char.id,
        str=abilities_data.get('str', 10),
        dex=abilities_data.get('dex', 10),
        con=abilities_data.get('con', 10),
        int_score=abilities_data.get('int', 10),
        wis=abilities_data.get('wis', 10),
        cha=abilities_data.get('cha', 10),
    ))

    # 钱币
    coins_data = data.get('coins', {})
    db.session.add(Coins(
        character_id=char.id,
        cp=coins_data.get('cp', 0),
        sp=coins_data.get('sp', 0),
        ep=coins_data.get('ep', 0),
        gp=coins_data.get('gp', 0),
        pp=coins_data.get('pp', 0),
    ))

    # 护甲
    armor_data = data.get('armor', {})
    db.session.add(Armor(character_id=char.id, **armor_data) if armor_data
                   else Armor(character_id=char.id))

    # 背景
    bg_data = data.get('background_data', data.get('background', {}))
    if isinstance(bg_data, str):
        try:
            bg_data = _json.loads(bg_data)
        except Exception:
            bg_data = {}
    db.session.add(BackgroundDetail(character_id=char.id, **bg_data) if bg_data
                   else BackgroundDetail(character_id=char.id))

    # 死亡豁免
    db.session.add(DeathSave(character_id=char.id))

    # 技能熟练
    for skill_name, prof in data.get('skill_proficiencies', {}).items():
        if prof:
            db.session.add(SkillProficiency(
                character_id=char.id, skill_name=skill_name, is_proficient=True))

    # 豁免熟练
    for ability_name, prof in data.get('save_proficiencies', {}).items():
        if prof:
            db.session.add(SaveProficiency(
                character_id=char.id, ability_name=ability_name, is_proficient=True))

    # 武器
    for w in data.get('weapons', []):
        if w and w.get('name'):
            db.session.add(Weapon(
                character_id=char.id,
                name=w.get('name', ''),
                attack_bonus=w.get('attack_bonus', 0),
                damage_dice=str(w.get('damage_dice', '')),
                damage_type=str(w.get('damage_type', '')),
                is_proficient=w.get('is_proficient', True),
                ammo=str(w.get('ammo', '')),
                description=str(w.get('description', '')),
                effect=str(w.get('effect', '')),
            ))

    # 物品/背包
    for item in data.get('inventory', []):
        if item and item.get('item_name'):
            db.session.add(InventoryItem(
                character_id=char.id,
                item_name=item.get('item_name', ''),
                quantity=item.get('quantity', 1),
                weight=float(item.get('weight', 0)),
                location=item.get('location', '背包'),
                notes=str(item.get('description', '')),
            ))

    # 已准备法术
    for spell in data.get('prepared_spells', []):
        if spell and spell.get('name'):
            db.session.add(PreparedSpell(
                character_id=char.id,
                spell_name=spell.get('name', ''),
                spell_level=int(spell.get('level', 0)),
            ))

    # 特性/专长/职业能力/种族特性
    for feat in data.get('features', []):
        if feat and feat.get('name'):
            db.session.add(CharacterFeature(
                character_id=char.id,
                category=feat.get('category', '特殊能力'),
                name=feat.get('name', ''),
                description=feat.get('description', ''),
                sort_order=feat.get('sort_order', 0),
            ))

    _save()
    return char.id
