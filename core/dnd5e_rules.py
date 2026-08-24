"""DND 规则系统

包含：属性调整值、技能映射、熟练加值、豁免类型、经验等级表
"""

# ━━━ 属性系统 ━━━

ABILITY_NAMES = {
    'str': '力量', 'strength': '力量', '力量': '力量',
    'dex': '敏捷', 'dexterity': '敏捷', '敏捷': '敏捷',
    'con': '体质', 'constitution': '体质', '体质': '体质',
    'int': '智力', 'intelligence': '智力', '智力': '智力',
    'wis': '感知', 'wisdom': '感知', '感知': '感知',
    'cha': '魅力', 'charisma': '魅力', '魅力': '魅力',
}

ABILITY_ABBR = {
    '力量': 'STR', '敏捷': 'DEX', '体质': 'CON',
    '智力': 'INT', '感知': 'WIS', '魅力': 'CHA',
}

ABILITY_ORDER = ['力量', '敏捷', '体质', '智力', '感知', '魅力']


def ability_modifier(score: int) -> int:
    """计算属性调整值: (属性值 - 10) // 2（向下取整）"""
    return (score - 10) // 2


# ━━━ 技能系统 ━━━

SKILL_TO_ABILITY = {
    '运动': '力量',
    '特技': '敏捷', '杂技': '敏捷', '巧手': '敏捷', '隐匿': '敏捷',
    '奥秘': '智力', '历史': '智力', '调查': '智力', '自然': '智力', '宗教': '智力',
    '驯兽': '感知', '洞悉': '感知', '医药': '感知', '察觉': '感知', '生存': '感知',
    '欺诈': '魅力', '欺瞒': '魅力', '威吓': '魅力', '表演': '魅力', '游说': '魅力',
}

# 英文别名
SKILL_ALIASES = {
    'athletics': '运动',
    'acrobatics': '特技', 'sleight of hand': '巧手', 'stealth': '隐匿',
    'arcana': '奥秘', 'history': '历史', 'investigation': '调查',
    'nature': '自然', 'religion': '宗教',
    'animal handling': '驯兽', 'insight': '洞悉', 'medicine': '医药',
    'perception': '察觉', 'survival': '生存',
    'deception': '欺诈', 'intimidation': '威吓', 'performance': '表演',
    'persuasion': '游说',
    # 别名（不同译法）
    '杂技': '特技', '欺瞒': '欺诈',
    # 简写
    'ath': '运动', 'acro': '特技', 'sleight': '巧手',
    'arc': '奥秘', 'hist': '历史', 'invest': '调查',
    'nat': '自然', 'rel': '宗教',
    'animal': '驯兽', 'ins': '洞悉', 'med': '医药',
    'per': '察觉', 'surv': '生存',
    'dec': '欺诈', 'intim': '威吓', 'perf': '表演', 'pers': '游说',
}


def get_ability_for_skill(skill_name: str) -> str | None:
    """获取技能对应的属性"""
    # 先查直接映射
    if skill_name in SKILL_TO_ABILITY:
        return SKILL_TO_ABILITY[skill_name]
    # 再查别名
    lower = skill_name.lower()
    if lower in SKILL_ALIASES:
        return SKILL_TO_ABILITY[SKILL_ALIASES[lower]]
    # 检查是否是属性名本身
    if skill_name in ABILITY_NAMES:
        return ABILITY_NAMES[skill_name]
    return None


def normalize_ability(name: str) -> str | None:
    """标准化属性名"""
    lower = name.lower()
    for key, value in ABILITY_NAMES.items():
        if lower == key.lower():
            return value
    if name in ABILITY_NAMES:
        return ABILITY_NAMES[name]
    return None


def normalize_skill(name: str) -> str | None:
    """标准化技能名"""
    for key, value in SKILL_ALIASES.items():
        if name.lower() == key.lower():
            return value
    if name in SKILL_TO_ABILITY:
        return name
    return None


def get_skills_for_ability(ability: str) -> list[str]:
    """获取某属性下的所有技能"""
    ability_cn = normalize_ability(ability)
    if not ability_cn:
        return []
    return [skill for skill, attr in SKILL_TO_ABILITY.items() if attr == ability_cn]


# ━━━ 熟练加值 ━━━

def proficiency_bonus(level: int) -> int:
    """根据等级返回熟练加值"""
    if level <= 0:
        return 0
    elif level <= 4:
        return 2
    elif level <= 8:
        return 3
    elif level <= 12:
        return 4
    elif level <= 16:
        return 5
    else:
        return 6


# ━━━ 经验等级表 ━━━

LEVEL_XP_TABLE = {
    1: 0,       2: 300,     3: 900,     4: 2700,     5: 6500,
    6: 14000,   7: 23000,   8: 34000,   9: 48000,    10: 64000,
    11: 85000,  12: 100000, 13: 120000, 14: 140000,  15: 165000,
    16: 195000, 17: 225000, 18: 265000, 19: 305000,  20: 355000,
}


def level_from_xp(xp: int) -> int:
    """根据经验值返回等级"""
    current_level = 1
    for level, required_xp in LEVEL_XP_TABLE.items():
        if xp >= required_xp:
            current_level = level
        else:
            break
    return current_level


# ━━━ 豁免 ━━━

SAVE_ABILITIES = ['力量', '敏捷', '体质', '智力', '感知', '魅力']

DEATH_SAVE_DC = 10

# ━━━ 暴击 ━━━

CRIT_ROLL = 20
FUMBLE_ROLL = 1


def is_critical_hit(d20_roll: int) -> bool:
    """判定是否为暴击"""
    return d20_roll == CRIT_ROLL


def is_critical_miss(d20_roll: int) -> bool:
    """判定是否为大失败"""
    return d20_roll == FUMBLE_ROLL


def is_death_save_success(roll_total: int) -> bool:
    """判定死亡豁免是否成功 (DC=10)"""
    return roll_total >= DEATH_SAVE_DC


# ━━━ 负重 ━━━

def carrying_capacity(strength_score: int) -> tuple[int, int, int]:
    """计算负重

    Returns:
        (正常负重, 重载负重, 最大拖拽)
    """
    normal = strength_score * 15    # 磅
    heavy = strength_score * 30     # 磅
    drag = strength_score * 30      # 磅
    return normal, heavy, drag


# ━━━ 被动感知 ━━━

def passive_perception(wisdom_score: int, proficiency_bonus_value: int = 0,
                       is_proficient: bool = False, advantage: bool = False,
                       disadvantage: bool = False) -> int:
    """计算被动感知"""
    base = 10 + ability_modifier(wisdom_score)
    if is_proficient:
        base += proficiency_bonus_value
    if advantage:
        base += 5
    elif disadvantage:
        base -= 5
    return base


# ━━━ 先攻 ━━━

def initiative_bonus(dex_score: int, additional: int = 0) -> int:
    """计算先攻加值"""
    return ability_modifier(dex_score) + additional


# ━━━ 生命值 ━━━

HIT_DICE_BY_CLASS = {
    '野蛮人': 12, '战士': 10, '圣骑士': 10, '游侠': 10,
    '吟游诗人': 8, '牧师': 8, '德鲁伊': 8, '武僧': 8, '游荡者': 8, '邪术师': 8,
    '术士': 6, '法师': 6,
    # 英文别名
    'barbarian': 12, 'fighter': 10, 'paladin': 10, 'ranger': 10,
    'bard': 8, 'cleric': 8, 'druid': 8, 'monk': 8, 'rogue': 8, 'warlock': 8,
    'sorcerer': 6, 'wizard': 6,
}


def hit_die_for_class(cls_name: str) -> int:
    """获取职业的生命骰面数"""
    return HIT_DICE_BY_CLASS.get(cls_name.lower(), 8)


def average_hp_per_level(hit_die: int, con_mod: int) -> int:
    """每级平均生命值 (取固定值而非投骰)"""
    return hit_die // 2 + 1 + con_mod


# ━━━ 法术位 ━━━

# 标准施法者法术位表 (按等级)
STANDARD_SPELL_SLOTS = {
    1:  {'1': 2},
    2:  {'1': 3},
    3:  {'1': 4, '2': 2},
    4:  {'1': 4, '2': 3},
    5:  {'1': 4, '2': 3, '3': 2},
    6:  {'1': 4, '2': 3, '3': 3},
    7:  {'1': 4, '2': 3, '3': 3, '4': 1},
    8:  {'1': 4, '2': 3, '3': 3, '4': 2},
    9:  {'1': 4, '2': 3, '3': 3, '4': 3, '5': 1},
    10: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2},
    11: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1},
    12: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1},
    13: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1},
    14: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1},
    15: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1},
    16: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1},
    17: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1},
    18: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 1, '7': 1, '8': 1, '9': 1},
    19: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 1, '8': 1, '9': 1},
    20: {'1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 2, '8': 1, '9': 1},
}


def get_spell_slots_for_level(class_level: int) -> dict[str, int]:
    """获取标准施法者某等级的法术位"""
    return STANDARD_SPELL_SLOTS.get(class_level, {})


# ━━━ 护甲等级 ━━━

def calculate_ac(base_ac: int = 10, dex_mod: int = 0,
                 armor_bonus: int = 0, shield_bonus: int = 0,
                 other_bonus: int = 0) -> int:
    """计算护甲等级"""
    return base_ac + dex_mod + armor_bonus + shield_bonus + other_bonus


# ━━━ 攻击加值 ━━━

def attack_bonus(ability_mod: int, prof_bonus: int) -> int:
    """攻击加值 = 属性调整值 + 熟练加值"""
    return ability_mod + prof_bonus


def spell_attack_bonus(casting_ability_mod: int, prof_bonus: int) -> int:
    """法术攻击加值"""
    return casting_ability_mod + prof_bonus


def spell_save_dc(casting_ability_mod: int, prof_bonus: int) -> int:
    """法术豁免 DC = 8 + 施法属性调整值 + 熟练加值"""
    return 8 + casting_ability_mod + prof_bonus
