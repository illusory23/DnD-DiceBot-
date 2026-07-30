#!/usr/bin/env python3
"""尘封之卷 — 命令行交互入口

用法:
    python dnd_bot.py              # 交互模式
    python dnd_bot.py ".r 3d6"     # 单次命令模式
    python dnd_bot.py --web        # 启动 Web 模式
"""

import sys
import os
import re as _re
from datetime import datetime
from pathlib import Path

# Windows 控制台 UTF-8 支持
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ━━━ 会话日志 ━━━
_session_log: list[tuple[str, str, str]] = []  # (时间, 命令, 输出)

try:
    import readline  # 启用命令行历史/编辑 (Unix)
except ImportError:
    try:
        import pyreadline3 as readline  # Windows 替代
    except ImportError:
        readline = None  # 无历史记录也可运行

# 将项目根目录加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.dice_engine import roll, roll_ability_check, roll_attack, roll_damage, roll_initiative, roll_death_save, generate_ability_scores
from core.dnd5e_rules import (
    ability_modifier, get_ability_for_skill,
    normalize_ability, normalize_skill,
    proficiency_bonus, get_skills_for_ability,
    SAVE_ABILITIES, ABILITY_ORDER, ABILITY_ABBR,
    SKILL_TO_ABILITY,
)
from core.character import (
    create_character, get_character, list_characters,
    update_character, set_ability, set_skill_proficiency,
    set_save_proficiency, set_hp, adjust_hp, init_spell_slots,
    init_spell_slots_by_level, use_spell_slot, long_rest, short_rest,
    death_save as char_death_save, delete_character,
    add_weapon, clear_weapons, remove_weapon, set_armor,
    set_coins, adjust_coin, add_prepared_spell,
    clear_prepared_spells, set_background,
    add_item, clear_inventory, remove_item,
    update_item_quantity, remove_item_quantity, stack_inventory,
    import_from_excel_data, resolve_portrait_path,
)
from core.combat import get_tracker, reset_tracker
from utils.data_loader import search_spell as srd_search_spell, search_monster as srd_search_monster, load_conditions
from utils.excel_importer import import_character_from_excel, import_and_print_summary
from utils.formatter import (
    format_dice_result, format_check_result, format_attack_result,
    format_death_save, format_spell_slots, format_character_sheet,
    format_initiative_list, format_spell_info, format_monster_info,
    format_wealth, format_weapons,
    bold, color_red, color_green, color_cyan, color_yellow,
)
from core.chm_search import (
    search_spell, search_monster, search_all, search_by_type,
    get_spell_detail, get_monster_detail, read_detail_page,
    search_project_files, search_all_combined, get_file_summary_text,
    CATEGORY_LABELS,
)

# 当前活跃角色
_active_char_id: int | None = None
_active_char_name: str | None = None


def get_active_char() -> dict | None:
    """获取当前活跃角色"""
    global _active_char_id
    if _active_char_id is None:
        return None
    return get_character(_active_char_id)


def set_active_char(name_or_id: str | int) -> dict | None:
    """设置活跃角色"""
    global _active_char_id, _active_char_name
    char = get_character(name_or_id)
    if char:
        _active_char_id = char['id']
        _active_char_name = char['name']
        return char
    return None


# ━━━ 命令处理器 ━━━
# 每个处理器返回 (output_string, error_string)

def cmd_roll(args: str) -> tuple[str | None, str | None]:
    """.r <表达式> — 掷骰"""
    if not args.strip():
        return None, "用法: .r <表达式>  例: .r 3d6  / .r d20+5  / .r 4d6k3  / .r adv d20"
    try:
        result = roll(args.strip())
        crit = 'success' if result.is_crit_success else ('failure' if result.is_crit_failure else None)
        return format_dice_result(
            result.expression, result.rolls, result.total,
            modifier=result.modifier, advantage=result.advantage,
            is_crit=crit
        ), None
    except ValueError as e:
        return None, str(e)


def cmd_roll_ability(args: str) -> tuple[str | None, str | None]:
    """.dnd — 生成属性值"""
    count = 1
    if args.strip().isdigit():
        count = int(args.strip())
    outputs = []
    for i in range(count):
        scores = generate_ability_scores()
        outputs.append(bold(f"📊 属性组 #{i+1}: {scores}"))
        outputs.append(f"   合计: {sum(scores)} | {'分配建议: ' + ', '.join(ABILITY_ORDER)}")
    return "\n".join(outputs), None


def cmd_check(args: str) -> tuple[str | None, str | None]:
    """.check <属性/技能> [优势/劣势] — 属性/技能检定"""
    if not args.strip():
        return None, f"用法: .check <属性/技能> [优势/劣势]\n属性: {', '.join(ABILITY_ORDER)}\n常用技能: 察觉/隐匿/游说/运动/奥秘..."

    parts = args.strip().split()
    target = parts[0]

    # 检查优势/劣势
    advantage = None
    if len(parts) > 1:
        if parts[1] in ('优势', 'adv', 'advantage'):
            advantage = True
        elif parts[1] in ('劣势', 'dis', 'disadvantage'):
            advantage = False

    char = get_active_char()

    # 判断是技能还是属性
    ability = normalize_ability(target)
    skill = normalize_skill(target)

    if skill:
        # 技能检定
        ability_for_skill = get_ability_for_skill(skill)
        ability_mod = 0
        prof_bonus = 0

        if char:
            ability_key_map = {
                '力量': 'str', '敏捷': 'dex', '体质': 'con',
                '智力': 'int', '感知': 'wis', '魅力': 'cha',
            }
            abbr = ability_key_map.get(ability_for_skill, 'str')
            ability_score = char['abilities'].get(abbr, 10)
            ability_mod = ability_modifier(ability_score)
            prof_bonus = char.get('proficiency_bonus', 2)

            # 检查是否有技能熟练
            skill_profs = char.get('skill_proficiencies', {})
            if skill in skill_profs and skill_profs[skill].get('is_proficient'):
                prof_bonus = prof_bonus * (2 if skill_profs[skill].get('is_expertise') else 1)
            else:
                prof_bonus = 0
        else:
            ability_mod = 0

        total_mod = ability_mod + prof_bonus
        result = roll_ability_check(ability_mod, prof_bonus, advantage)
        output = format_check_result(
            f"{skill}({ability_for_skill})", result.rolls[-1] if result.rolls else 0,
            total_mod, result.total, advantage,
            proficiency_bonus=prof_bonus, ability_mod=ability_mod
        )
        return output, None

    elif ability:
        # 属性检定
        ability_mod = 0
        prof_bonus = 0

        if char:
            ability_key_map = {
                '力量': 'str', '敏捷': 'dex', '体质': 'con',
                '智力': 'int', '感知': 'wis', '魅力': 'cha',
            }
            abbr = ability_key_map.get(ability, 'str')
            ability_score = char['abilities'].get(abbr, 10)
            ability_mod = ability_modifier(ability_score)

            # 检查豁免熟练
            save_profs = char.get('save_proficiencies', {})
            if ability in save_profs and save_profs[ability].get('is_proficient'):
                prof_bonus = char.get('proficiency_bonus', 2)

        total_mod = ability_mod + prof_bonus
        result = roll_ability_check(ability_mod, prof_bonus, advantage)
        output = format_check_result(
            ability, result.rolls[-1] if result.rolls else 0,
            total_mod, result.total, advantage,
            proficiency_bonus=prof_bonus, ability_mod=ability_mod
        )
        return output, None

    else:
        return None, f"未知的技能或属性: {target}\n可用: {', '.join(list(SKILL_TO_ABILITY.keys()) + ABILITY_ORDER)}"


def cmd_save(args: str) -> tuple[str | None, str | None]:
    """.save <属性> [优势/劣势] — 豁免检定"""
    if not args.strip():
        return None, "用法: .save <属性>  例: .save 敏捷  / .save DEX"

    parts = args.strip().split()
    ability = normalize_ability(parts[0])
    if not ability:
        return None, f"未知属性: {parts[0]}\n可用: {', '.join(ABILITY_ORDER)}"

    advantage = None
    if len(parts) > 1:
        if parts[1] in ('优势', 'adv'):
            advantage = True
        elif parts[1] in ('劣势', 'dis'):
            advantage = False

    char = get_active_char()
    ability_mod = 0
    prof_bonus = 0

    if char:
        ability_key_map = {
            '力量': 'str', '敏捷': 'dex', '体质': 'con',
            '智力': 'int', '感知': 'wis', '魅力': 'cha',
        }
        abbr = ability_key_map.get(ability, 'str')
        ability_score = char['abilities'].get(abbr, 10)
        ability_mod = ability_modifier(ability_score)

        save_profs = char.get('save_proficiencies', {})
        if ability in save_profs and save_profs[ability].get('is_proficient'):
            prof_bonus = char.get('proficiency_bonus', 2)

    total_mod = ability_mod + prof_bonus
    result = roll_ability_check(ability_mod, prof_bonus, advantage)
    return format_check_result(
        f"{ABILITY_ABBR.get(ability, ability)} 豁免", result.rolls[-1] if result.rolls else 0,
        total_mod, result.total, advantage,
        proficiency_bonus=prof_bonus, ability_mod=ability_mod
    ), None


def cmd_initiative(args: str) -> tuple[str | None, str | None]:
    """.init [加值] [名字] — 先攻"""
    tracker = get_tracker()

    if not args.strip():
        if not tracker.is_active:
            return None, "用法: .init <加值> [名字]  或  .init list 或 .init start 或 .init next"
        return format_initiative_list(tracker.get_list()), None

    parts = args.strip().split()

    if parts[0] == 'list':
        return format_initiative_list(tracker.get_list()), None

    if parts[0] == 'next':
        current = tracker.next_turn()
        if current:
            summary = tracker.get_summary()
            return f"⚔️ 第 {summary['round']} 轮\n▶ 轮到: {bold(current.name)}\n{format_initiative_list(tracker.get_list())}", None
        return tracker.get_list(), None

    if parts[0] == 'start':
        tracker.start_combat()
        return f"⚔️ 战斗开始！\n{format_initiative_list(tracker.get_list())}", None

    if parts[0] == 'clear':
        reset_tracker()
        return "先攻列表已清空。", None

    if parts[0] == 'remove':
        if len(parts) > 1:
            name = parts[1]
            if tracker.remove_combatant(name):
                return f"已移除 {name}。", None
            return None, f"未找到: {name}"
        return None, "用法: .init remove <名字>"

    # .init <加值> [名字]
    if parts[0] == 'add' and len(parts) >= 3:
        # .init add +3 哥布林
        bonus_str = parts[1]
        name = ' '.join(parts[2:])
    elif len(parts) >= 2:
        # .init +3 哥布林
        bonus_str = parts[0]
        name = ' '.join(parts[1:])
    else:
        return None, "用法: .init [+]<加值> <名字>  例: .init +3 哥布林"

    # 解析加值
    try:
        if bonus_str.startswith('+'):
            bonus = int(bonus_str[1:])
        elif bonus_str.startswith('-'):
            bonus = int(bonus_str)
        else:
            bonus = int(bonus_str)
    except ValueError:
        return None, f"无效的先攻加值: {bonus_str}"

    # 自动投d20
    result = roll_initiative(0, bonus)
    initiative = result.total

    # 添加到追踪器
    tracker.add_combatant(name, initiative=initiative, hp=0, hp_max=0, ac=10)

    return f"🎯 {name} 先攻: d20({result.rolls[-1] if result.rolls else 0}) + {bonus} = {color_cyan(str(initiative))}", None


def cmd_death_save(args: str) -> tuple[str | None, str | None]:
    """.ds — 死亡豁免"""
    char = get_active_char()
    if not char:
        return None, "请先选择一个角色: .char use <名字>"

    modifier = 0
    result = roll_death_save(modifier)
    d20_roll = result.rolls[-1] if result.rolls else result.total

    ds_result = char_death_save(char['id'], d20_roll, modifier)
    if 'error' in ds_result:
        return None, ds_result['error']

    return format_death_save(
        d20_roll, modifier, d20_roll + modifier,
        ds_result['successes'], ds_result['failures'],
        ds_result.get('is_stable', False)
    ), None


def cmd_attack(args: str) -> tuple[str | None, str | None]:
    """.attack <武器> [-t 目标] [优势/劣势] — 攻击检定"""
    if not args.strip():
        return None, "用法: .attack <武器名> [-t 目标名] [优势/劣势]\n例: .attack 长剑 -t 地精  / .attack 匕首 优势"

    advantage = None
    target = None

    parts = args.strip().split()
    i = 0
    weapon_parts = []
    while i < len(parts):
        if parts[i] == '-t' and i + 1 < len(parts):
            target = parts[i + 1]
            i += 2
        elif parts[i] in ('优势', 'adv'):
            advantage = True
            i += 1
        elif parts[i] in ('劣势', 'dis'):
            advantage = False
            i += 1
        else:
            weapon_parts.append(parts[i])
            i += 1

    weapon = ' '.join(weapon_parts)

    char = get_active_char()
    attack_bonus = 4  # 默认 +4 (STR +2, prof +2)

    # 尝试从角色武器库中查找匹配的武器
    if char:
        for w in char.get('weapons', []):
            if w.get('name', '').lower() == weapon.lower():
                attack_bonus = w.get('attack_bonus', attack_bonus)
                break
        else:
            # 没找到则用力量调整值
            str_score = char['abilities'].get('str', 10)
            str_mod = ability_modifier(str_score)
            prof = char.get('proficiency_bonus', 2)
            attack_bonus = str_mod + prof

    result = roll_attack(attack_bonus, advantage)
    d20_roll = result.rolls[-1] if result.rolls else result.total - result.modifier
    is_crit = result.is_crit_success

    # 模拟伤害
    str_mod = ability_modifier(char['abilities']['str']) if char else 2
    dmg_result = roll_damage(1, 8, str_mod, is_crit)
    dmg_rolls = dmg_result.rolls

    return format_attack_result(
        weapon, target, d20_roll, attack_bonus, result.total,
        ac_hit=None,
        damage_rolls=dmg_rolls, damage_total=dmg_result.total,
        is_crit=is_crit, advantage=advantage
    ), None


def cmd_damage(args: str) -> tuple[str | None, str | None]:
    """.damage <表达式> — 伤害投掷"""
    if not args.strip():
        return None, "用法: .damage <表达式>  例: .damage 2d6+3  / .damage 1d8"
    try:
        result = roll(args.strip())
        return format_dice_result(result.expression, result.rolls, result.total,
                                  modifier=result.modifier), None
    except ValueError as e:
        return None, str(e)


# ━━━ 角色卡命令 ━━━

def cmd_char(args: str) -> tuple[str | None, str | None]:
    """.char <子命令> — 角色卡管理"""
    global _active_char_id, _active_char_name

    if not args.strip():
        return _help_char(), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'new':
        name = parts[1] if len(parts) > 1 else None
        if not name:
            return None, "用法: .char new <名字>"
        char_id = create_character(name)
        char = get_character(char_id)
        set_active_char(name)
        return (
            f"✅ 角色 {bold(name)} 创建成功!\n"
            f"   使用 .char set <属性> <值> 设置属性\n"
            f"   例: .char set STR 16\n"
            + format_character_sheet(char), None
        )

    elif subcmd == 'show':
        show_detail = False
        name_query = None
        for p in parts[1:]:
            if p in ('-d', '--detail', '详细'):
                show_detail = True
            else:
                name_query = (name_query + ' ' + p).strip() if name_query else p

        if name_query:
            char = get_character(name_query)
        else:
            char = get_active_char()
        if not char:
            return None, "请指定角色名或先选择角色: .char use <名字>"

        result = format_character_sheet(char, detail=show_detail)

        # 头像信息
        portrait_path = char.get('portrait_path', '')
        if portrait_path:
            exists = os.path.exists(portrait_path)
            status = '' if exists else ' ⚠文件不存在'
            result += f"\n   🖼 头像: {portrait_path}{status}"
            result += f"\n      .char portrait open 查看 | .char portrait clear 清除"

        # 源文件信息
        source_file = char.get('source_file', '')
        if source_file:
            exists = os.path.exists(source_file)
            status = '' if exists else ' ⚠文件不存在'
            result += f"\n   📁 角色卡文件: {source_file}{status}"
            if exists:
                result += f"\n      .char open 打开文件"

        return result, None

    elif subcmd == 'list':
        chars = list_characters()
        if not chars:
            return "暂无角色，使用 .char new <名字> 创建。", None
        lines = [bold("📜 角色列表")]
        for c in chars:
            marker = " ◀" if _active_char_id == c['id'] else ""
            lines.append(f"   {c['name']} | {c['level']}级 {c['class']} {c['race']} | HP: {c['hp_current']}/{c['hp_max']}{marker}")
        return "\n".join(lines), None

    elif subcmd == 'use':
        if len(parts) < 2:
            return None, "用法: .char use <名字/ID>"
        char = set_active_char(' '.join(parts[1:]))
        if not char:
            return None, f"未找到角色: {' '.join(parts[1:])}"
        return f"✅ 当前角色: {bold(char['name'])}", None

    elif subcmd == 'import' or subcmd == '导入':
        if len(parts) < 2:
            return None, "用法: .char import <Excel文件路径>\n例: .char import 丹恩·铁拳.xlsx"

        filepath = ' '.join(parts[1:])

        # 如果是相对路径，尝试在人物相关目录查找
        if not os.path.isabs(filepath):
            search_paths = [
                filepath,
                os.path.join(os.path.dirname(os.path.abspath(__file__)), filepath),
                os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '人物相关', filepath),
            ]
            found = None
            for sp in search_paths:
                if os.path.exists(sp):
                    found = sp
                    break
            if found:
                filepath = found
            else:
                return None, f"文件不存在: {filepath}\n已搜索路径:\n" + "\n".join(f"  - {sp}" for sp in search_paths)

        try:
            # 预览
            preview = import_and_print_summary(filepath)
            # 导入
            data = import_character_from_excel(filepath)
            # CLI 导入使用系统用户名作为 created_by
            import getpass
            cli_user = getpass.getuser()
            char_id = import_from_excel_data(data, source_file=os.path.abspath(filepath), created_by=cli_user)
            char = get_character(char_id)
            set_active_char(char_id)

            result = f"✅ 角色卡导入成功!\n{preview}"
            result += f"\n\n使用 .char show -d 查看完整角色卡"
            return result, None
        except ImportError as e:
            return None, str(e)
        except Exception as e:
            return None, f"导入失败: {type(e).__name__}: {e}"

    elif subcmd == 'set':
        if len(parts) < 3:
            return None, "用法: .char set <属性/技能> <值>\n例: .char set STR 16  / .char set 察觉 熟练"

        char = get_active_char()
        if not char:
            return None, "请先选择角色: .char use <名字>"

        target = parts[1]
        value = ' '.join(parts[2:])

        # 检查是否是属性设置
        ability = normalize_ability(target)
        if ability:
            try:
                score = int(value)
            except ValueError:
                return None, f"属性值必须是数字: {value}"
            key_map = {'力量': 'str', '敏捷': 'dex', '体质': 'con',
                       '智力': 'int', '感知': 'wis', '魅力': 'cha'}
            if set_ability(char['id'], key_map.get(ability, ability), score):
                return f"✅ {ability}: {score} (调整值: {'+' if (score-10)//2 >= 0 else ''}{(score-10)//2})", None
            return None, "设置失败"

        # 检查是否是技能熟练设置
        skill = normalize_skill(target)
        if skill:
            is_prof = value.lower() in ('熟练', 'proficient', 'true', 'yes', '1')
            is_exp = value.lower() in ('专精', 'expertise', 'double')
            set_skill_proficiency(char['id'], skill, is_prof or is_exp, is_exp)
            level_desc = '专精(双倍熟练)' if is_exp else ('熟练' if is_prof else '非熟练')
            return f"✅ {skill}: {level_desc}", None

        # 检查是否是豁免熟练
        save_ability = normalize_ability(target)
        if save_ability and '豁免' in value or 'save' in value.lower():
            is_prof = value.lower() not in ('否', 'no', 'false', '0')
            set_save_proficiency(char['id'], save_ability, is_prof)
            return f"✅ {save_ability}豁免: {'熟练' if is_prof else '非熟练'}", None

        # 检查是否是基础信息设置
        basic_fields = {
            '职业': 'class', 'class': 'class',
            '种族': 'race', 'race': 'race',
            '阵营': 'alignment', 'alignment': 'alignment',
            '信仰': 'faith', 'faith': 'faith',
            '等级': 'level', 'level': 'level',
            '玩家': 'player', 'player': 'player',
            '性别': 'gender', 'gender': 'gender',
            '年龄': 'age', 'age': 'age',
            '身高': 'height', 'height': 'height',
            '体重': 'weight', 'weight': 'weight',
        }
        target_lower = target.lower()
        if target_lower in basic_fields:
            field = basic_fields[target_lower]
            if field == 'level':
                try:
                    level_val = int(value)
                    update_character(char['id'], level=level_val)
                    return f"✅ 等级: {level_val} (熟练加值: +{proficiency_bonus(level_val)})", None
                except ValueError:
                    return None, f"等级必须是数字: {value}"
            else:
                update_character(char['id'], **{field: value})
                return f"✅ {target}: {value}", None

        return None, f"无法识别的目标: {target}\n可用: 属性名/技能名/职业/种族/阵营/信仰/等级/玩家/性别/年龄/身高/体重"

    elif subcmd == 'hp':
        return cmd_hp(' '.join(parts[1:]))

    elif subcmd == 'delete':
        if len(parts) < 2:
            return None, "用法: .char delete <名字>"
        name = ' '.join(parts[1:])
        char = get_character(name)
        if not char:
            return None, f"未找到角色: {name}"
        delete_character(char['id'])
        if _active_char_id == char['id']:
            _active_char_id = None
            _active_char_name = None
        return f"已删除角色: {name}", None

    # ━━━ 武器装备子命令 ━━━
    elif subcmd == 'weapon' or subcmd == '武器':
        return cmd_weapon(' '.join(parts[1:]))

    # ━━━ 钱币子命令 ━━━
    elif subcmd == 'coin' or subcmd == 'wealth' or subcmd == '钱币':
        return cmd_wealth(' '.join(parts[1:]))

    # ━━━ 法术准备子命令 ━━━
    elif subcmd == 'spell' or subcmd == '法术':
        return cmd_char_spell(' '.join(parts[1:]))

    # ━━━ 物品子命令 ━━━
    elif subcmd == 'item' or subcmd == '物品':
        return cmd_item(' '.join(parts[1:]))

    # ━━━ 背景子命令 ━━━
    elif subcmd == 'bg' or subcmd == '背景':
        return cmd_background(' '.join(parts[1:]))

    # ━━━ 头像子命令 ━━━
    elif subcmd == 'portrait' or subcmd == '头像':
        return cmd_portrait(' '.join(parts[1:]))

    # ━━━ 打开角色卡文件 ━━━
    elif subcmd == 'open' or subcmd == '打开':
        return cmd_open_char(' '.join(parts[1:]))

    else:
        return None, "未知子命令: " + subcmd


# ━━━ 武器装备命令 ━━━

def cmd_weapon(args: str) -> tuple[str | None, str | None]:
    """.char weapon [add/remove/list/clear] — 管理武器"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        return format_weapons(char.get('weapons', [])), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'add' or subcmd == '添加':
        if len(parts) < 3:
            return None, "用法: .char weapon add <武器名> <命中加值> <伤害骰> [伤害类型] [描述: ...] [效果: ...]\n例: .char weapon add 长剑 5 1d8 挥砍 描述: 一把锋利的剑 效果: 命中+1"

        # 解析参数，支持描述:/效果: 关键词
        name_parts = []
        atk = 0
        dmg = ''
        dmg_type = ''
        desc_parts = []
        effect_parts = []
        reading_desc = False
        reading_effect = False

        i = 1
        while i < len(parts):
            p = parts[i]
            if p.lower() == '描述:' or p.lower() == 'desc:':
                reading_desc = True
                reading_effect = False
                i += 1
            elif p.lower() == '效果:' or p.lower() == 'effect:':
                reading_effect = True
                reading_desc = False
                i += 1
            elif reading_desc:
                desc_parts.append(p)
                i += 1
            elif reading_effect:
                effect_parts.append(p)
                i += 1
            elif not name_parts:
                name_parts.append(p)
                i += 1
            elif atk == 0 and p.lstrip('+-').isdigit():
                atk = int(p)
                i += 1
            elif not dmg:
                dmg = p
                i += 1
            elif not dmg_type:
                dmg_type = p
                i += 1
            else:
                name_parts.append(p)
                i += 1

        name = ' '.join(name_parts)
        desc = ' '.join(desc_parts)
        effect = ' '.join(effect_parts)

        wid = add_weapon(char['id'], name, atk, dmg, dmg_type, True,
                        description=desc, effect=effect)
        desc_str = f"\n   描述: {desc}" if desc else ''
        effect_str = f"\n   效果: {effect}" if effect else ''
        return f"✅ 已添加武器: {name} (命中: +{atk}, 伤害: {dmg} {dmg_type}){desc_str}{effect_str}", None

    elif subcmd == 'remove' or subcmd == '删除' or subcmd == 'rm':
        if len(parts) < 2:
            return None, "用法: .char weapon remove <ID/名称>\n  先用 .char weapon 查看武器 ID"

        query = ' '.join(parts[1:])
        char = get_character(char['id'])
        weapons = char.get('weapons', [])

        # 先尝试按 ID 删除
        try:
            weapon_id = int(query)
            for w in weapons:
                if w.get('id') == weapon_id:
                    name = w.get('name', '?')
                    remove_weapon(weapon_id)
                    return f"🗑️ 已删除武器: {name} (ID:{weapon_id})", None
            return None, f"未找到 ID={weapon_id} 的武器（可能不属于当前角色）"
        except ValueError:
            pass

        # 按名称模糊匹配
        matches = [(w['id'], w['name']) for w in weapons
                   if query.lower() in w.get('name', '').lower()]
        if not matches:
            return None, f"未找到匹配 '{query}' 的武器"

        if len(matches) == 1:
            rid, rname = matches[0]
            remove_weapon(rid)
            return f"🗑️ 已删除武器: {rname} (ID:{rid})", None

        # 多个匹配
        lines = [bold(f"找到 {len(matches)} 个匹配武器，请用 ID 指定:")]
        for mid, mname in matches:
            lines.append(f"   [{mid}] {mname}")
        return "\n".join(lines), None

    elif subcmd == 'clear' or subcmd == '清空':
        clear_weapons(char['id'])
        return "🗑️ 已清除所有武器", None

    elif subcmd == 'list' or subcmd == '列表':
        char = get_character(char['id'])
        return format_weapons(char.get('weapons', [])), None

    else:
        return None, "用法: .char weapon [add/remove/list/clear]"


# ━━━ 钱币命令 ━━━

def cmd_wealth(args: str) -> tuple[str | None, str | None]:
    """.char coin [add/set <币种> <数量>] — 管理钱币"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        return format_wealth(char.get('coins', {})), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'add' or subcmd == '增加':
        if len(parts) < 3:
            return None, "用法: .char coin add <币种> <数量>\n币种: cp/sp/ep/gp/pp 或 铜币/银币/金银币/金币/白金币"

        coin_type = parts[1]
        try:
            amount = int(parts[2])
        except ValueError:
            return None, f"数量必须是数字: {parts[2]}"

        result = adjust_coin(char['id'], coin_type, amount)
        if 'error' in result:
            return None, result['error']

        coin_names = {'cp': '铜币', 'sp': '银币', 'ep': '金银币', 'gp': '金币', 'pp': '白金币'}
        cname = coin_names.get(result['coin_type'], result['coin_type'])
        return (
            f"💰 {cname}: {result['old']} → {result['new']} "
            f"({'+' if amount >= 0 else ''}{amount})"
        ), None

    elif subcmd == 'set' or subcmd == '设置':
        if len(parts) < 5:
            return None, "用法: .char coin set cp sp ep gp pp\n例: .char coin set 0 10 0 50 0"

        try:
            vals = [int(p) for p in parts[1:6]]
        except (ValueError, IndexError):
            return None, "钱币值必须是数字"

        set_coins(char['id'], *vals)
        return f"✅ 钱币已设置: CP:{vals[0]} SP:{vals[1]} EP:{vals[2]} GP:{vals[3]} PP:{vals[4]}", None

    else:
        return None, "用法: .char coin [add/set]"


# ━━━ 已准备法术命令 ━━━

def cmd_char_spell(args: str) -> tuple[str | None, str | None]:
    """.char spell [add/clear/list] — 管理已准备法术"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        prepared = char.get('prepared_spells', [])
        if not prepared:
            return "暂无已准备法术。使用 .char spell add <法术名> 添加", None

        lines = [bold(f"📖 {char['name']} 的已准备法术")]
        for s in prepared:
            name = s.get('spell_name', s.get('name', '?'))
            level = s.get('spell_level', 0)
            level_str = f"{level}环" if level > 0 else '戏法'
            lines.append(f"   [{level_str}] {name}")
        return "\n".join(lines), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'add' or subcmd == '添加':
        if len(parts) < 2:
            return None, "用法: .char spell add <法术名> [环数]"
        name = ' '.join(parts[1:]).rsplit(' ', 1)
        if len(name) == 2 and name[1].isdigit():
            spell_name = name[0]
            spell_level = int(name[1])
        else:
            spell_name = ' '.join(parts[1:])
            spell_level = 0

        sid = add_prepared_spell(char['id'], spell_name, spell_level)
        return f"✅ 已准备法术: {spell_name}" + (f" ({spell_level}环)" if spell_level > 0 else ""), None

    elif subcmd == 'clear' or subcmd == '清空':
        clear_prepared_spells(char['id'])
        return "🗑️ 已清除已准备法术列表", None

    else:
        return None, "用法: .char spell [add/clear]"


# ━━━ HP 命令 ━━━

def cmd_hp(args: str) -> tuple[str | None, str | None]:
    """.char hp [set/max] — 管理角色生命值

    用法:
        .char hp                  查看HP
        .char hp <+/-数值>        调整HP (如 -10 / +5)
        .char hp set <数值>       设置当前HP
        .char hp max <数值>       设置最大HP
        .char hp set <当前> <最大> 同时设置当前和最大HP
    """
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        # 查看 HP
        char = get_character(char['id'])
        temp_hp = char.get('temp_hp', 0)
        temp_str = f" (临时: {temp_hp})" if temp_hp > 0 else ""
        return f"❤️ {char['name']} HP: {char['hp_current']}/{char['hp_max']}{temp_str}", None

    parts = args.strip().split()
    sub = parts[0].lower()

    if sub == 'set' or sub == '设置':
        if len(parts) == 1:
            return None, "用法: .char hp set <当前HP> [最大HP]\n例: .char hp set 25  / .char hp set 25 50"

        try:
            requested_current = int(parts[1])
        except ValueError:
            return None, f"无效的HP值: {parts[1]}"

        max_val = None
        if len(parts) > 2:
            try:
                max_val = int(parts[2])
            except ValueError:
                return None, f"无效的最大HP值: {parts[2]}"

        result = set_hp(char['id'], hp_current=requested_current, hp_max=max_val)
        if 'error' in result:
            return None, result['error']

        status = result.get('status', '')
        status_msg = f" ⚠ {status}" if status else ''

        # 提示被限制的情况
        capped_note = ''
        effective_max = max_val if max_val is not None else char['hp_max']
        if requested_current > effective_max:
            capped_note = f'\n   💡 当前HP已自动限制为最大值 {effective_max}（无法超过最大HP）'
        elif requested_current < 0:
            capped_note = f'\n   💡 已自动调整为 0（HP不能为负）'

        if max_val is not None:
            return (
                f"✅ {char['name']} HP 已设置\n"
                f"   ❤️ 当前: {result['hp_current']}  |  最大: {result['hp_max']}{status_msg}{capped_note}"
            ), None
        else:
            return f"✅ {char['name']} 当前HP: {result['hp_current']}/{result['hp_max']}{status_msg}{capped_note}", None

    elif sub == 'max' or sub == '最大':
        if len(parts) < 2:
            return None, "用法: .char hp max <数值>\n例: .char hp max 50"

        try:
            max_val = int(parts[1])
        except ValueError:
            return None, f"无效的最大HP值: {parts[1]}"

        result = set_hp(char['id'], hp_max=max_val)
        if 'error' in result:
            return None, result['error']

        return f"✅ {char['name']} 最大HP: {result['hp_max']} (当前: {result['hp_current']})", None

    else:
        # 相对调整 (原逻辑)
        try:
            amount = int(parts[0])
        except ValueError:
            return None, (
                "用法:\n"
                "  .char hp <+/-数值>        调整HP (如 -10 / +5)\n"
                "  .char hp set <数值> [最大] 设置HP\n"
                "  .char hp max <数值>        设置最大HP"
            )

        result = adjust_hp(char['id'], amount)
        if 'error' in result:
            return None, result['error']

        status = result.get('status', '')
        status_msg = f" ⚠ {status}" if status else ''

        sign = '+' if amount >= 0 else ''
        return (
            f"❤️ {char['name']} HP: {result['hp_current']}/{result['hp_max']}"
            f"  ({sign}{amount}){status_msg}"
        ), None


# ━━━ 物品命令 ━━━

def cmd_item(args: str) -> tuple[str | None, str | None]:
    """.char item [add/remove/clear] — 管理物品"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        inv = char.get('inventory', [])
        if not inv:
            return "暂无物品。使用 .char item add <物品名> [x数量] [@位置] 添加", None

        lines = [bold(f"🎒 {char['name']} 的物品")]
        for item in inv:
            iid = item.get('id', '?')
            qty = item.get('quantity', 1)
            name = item.get('item_name', '?')
            wt = item.get('weight', 0)
            loc = item.get('location', '')
            desc = item.get('description', '')
            effect = item.get('effect', '')
            wt_str = f" ({wt}磅)" if wt else ""
            loc_str = f" [{loc}]" if loc else ""
            desc_str = f" — {desc}" if desc else ""
            effect_str = f"\n      效果: {effect}" if effect else ""
            lines.append(f"   [{iid}] {name} x{qty}{wt_str}{loc_str}{desc_str}{effect_str}")
        return "\n".join(lines), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'add' or subcmd == '添加':
        if len(parts) < 2:
            return None, "用法: .char item add <物品名> [x数量] [重量] [@位置] [描述] [效果]"

        # 解析参数
        name_parts = []
        qty = 1
        weight = 0.0
        location = '背包'
        desc_parts = []
        effect_parts = []
        reading_desc = False
        reading_effect = False
        i = 1
        while i < len(parts):
            p = parts[i]
            if p.lower().startswith('x') and p[1:].isdigit() and not reading_desc and not reading_effect:
                qty = int(p[1:])
                i += 1
            elif p.startswith('@') and not reading_desc and not reading_effect:
                location = p[1:]
                i += 1
            elif p.lower() == '描述:' or p.lower() == 'desc:':
                reading_desc = True
                reading_effect = False
                i += 1
            elif p.lower() == '效果:' or p.lower() == 'effect:':
                reading_effect = True
                reading_desc = False
                i += 1
            elif reading_desc:
                desc_parts.append(p)
                i += 1
            elif reading_effect:
                effect_parts.append(p)
                i += 1
            elif p.replace('.', '').isdigit() and not name_parts:
                weight = float(p)
                i += 1
            else:
                name_parts.append(p)
                i += 1

        item_name = ' '.join(name_parts)
        desc = ' '.join(desc_parts)
        effect = ' '.join(effect_parts)

        if not item_name:
            return None, "请输入物品名"

        iid = add_item(char['id'], item_name, qty, weight, '', location, desc, effect)
        loc_str = f" @{location}" if location != '背包' else ''
        wt_str = f" ({weight}磅)" if weight else ''
        desc_str = f"\n   描述: {desc}" if desc else ''
        effect_str = f"\n   效果: {effect}" if effect else ''
        return f"✅ 已添加: {item_name} x{qty}{wt_str}{loc_str}{desc_str}{effect_str}", None

    elif subcmd == 'remove' or subcmd == '删除' or subcmd == 'rm':
        # .char item remove <ID/名称> [数量]
        # 如果带数量参数则只减少指定数量，否则删除整个条目
        if len(parts) < 2:
            return None, "用法: .char item remove <ID/名称> [数量]\n  数量为空则删除整个物品，有数量则减少指定份数"

        # 检查最后一个参数是否为数量
        amount = None
        query = ' '.join(parts[1:])
        if len(parts) >= 3 and parts[-1].isdigit():
            amount = int(parts[-1])
            query = ' '.join(parts[1:-1])

        char = get_character(char['id'])
        inv = char.get('inventory', [])

        # 先尝试按 ID 操作
        try:
            item_id = int(query)
            for item in inv:
                if item.get('id') == item_id:
                    name = item.get('item_name', '?')
                    if amount is not None:
                        ok, remaining = remove_item_quantity(item_id, amount)
                        if remaining > 0:
                            return f"📦 {name}: {item.get('quantity')} → {remaining} (-{amount})", None
                        else:
                            return f"🗑️ {name} x{item.get('quantity')} 全部移除 (-{amount})", None
                    else:
                        remove_item(item_id)
                        return f"🗑️ 已删除物品: {name} x{item.get('quantity',1)} (ID:{item_id})", None
            return None, f"未找到 ID={item_id} 的物品（可能不属于当前角色）"
        except ValueError:
            pass

        # 按名称模糊匹配
        matches = [(item['id'], item['name'] if 'name' in item else item.get('item_name','?'), item.get('quantity',1))
                   for item in inv
                   if query.lower() in item.get('item_name', '').lower()]
        if not matches:
            return None, f"未找到匹配 '{query}' 的物品"

        if len(matches) == 1:
            rid, rname, rqty = matches[0]
            if amount is not None:
                ok, remaining = remove_item_quantity(rid, amount)
                if remaining > 0:
                    return f"📦 {rname}: {rqty} → {remaining} (-{amount})", None
                else:
                    return f"🗑️ {rname} x{rqty} 全部移除 (-{amount})", None
            else:
                remove_item(rid)
                return f"🗑️ 已删除物品: {rname} x{rqty} (ID:{rid})", None

        # 多个匹配
        lines = [bold(f"找到 {len(matches)} 个匹配物品，请用 ID 指定:")]
        for mid, mname, mqty in matches:
            lines.append(f"   [{mid}] {mname} x{mqty}")
        return "\n".join(lines), None

    elif subcmd == 'set' or subcmd == '设置':
        # .char item set <ID> <数量>
        if len(parts) < 3:
            return None, "用法: .char item set <ID> <数量>\n  设置物品数量为指定值，≤0则删除"
        try:
            item_id = int(parts[1])
            qty = int(parts[2])
        except ValueError:
            return None, "ID和数量必须为数字"

        char = get_character(char['id'])
        inv = char.get('inventory', [])
        found = None
        for item in inv:
            if item.get('id') == item_id:
                found = item
                break
        if not found:
            return None, f"未找到 ID={item_id} 的物品"

        name = found.get('item_name', '?')
        old_qty = found.get('quantity', 1)
        update_item_quantity(item_id, qty)
        if qty <= 0:
            return f"🗑️ 已删除: {name} (原x{old_qty})", None
        return f"📦 {name}: {old_qty} → {qty}", None

    elif subcmd == 'stack' or subcmd == '合并' or subcmd == '堆叠':
        char = get_character(char['id'])
        merged = stack_inventory(char['id'])
        if merged > 0:
            return f"📦 已合并 {merged} 个重复物品条目", None
        return "✅ 背包中没有需要合并的重复物品", None

    elif subcmd == 'clear' or subcmd == '清空':
        clear_inventory(char['id'])
        return "🗑️ 已清空物品栏", None

    else:
        return None, "用法: .char item [add/remove/clear]"


# ━━━ 背景命令 ━━━

def cmd_background(args: str) -> tuple[str | None, str | None]:
    """.char bg [set <字段> <值>] — 管理背景信息"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        bg = char.get('background', {})
        if not bg:
            return "暂无背景信息。", None

        lines = [bold(f"📝 {char['name']} 的背景")]
        fields = [
            ('personality_traits', '个性'),
            ('personality_traits_ext', '个性(补充)'),
            ('ideals', '理念'),
            ('bonds', '羁绊'),
            ('flaws', '缺陷'),
            ('background_feature', '背景特性'),
            ('appearance', '外貌'),
            ('origin', '出身'),
            ('languages', '语言'),
            ('tool_proficiencies', '熟练工具'),
        ]
        for key, label in fields:
            val = bg.get(key, '')
            if val:
                # 对于长文本或多行文本，按原文完整展示
                if '\n' in val:
                    first_line, *rest_lines = val.split('\n')
                    lines.append(f"   {label}:")
                    lines.append(f"      {first_line}")
                    for rl in rest_lines:
                        lines.append(f"      {rl}")
                elif len(val) > 80:
                    lines.append(f"   {label}:")
                    lines.append(f"      {val}")
                else:
                    lines.append(f"   {label}: {val}")

        backstory = bg.get('backstory', '')
        if backstory:
            lines.append(f"   ═══ 背景故事 ═══")
            lines.append(f"   {backstory}")

        return "\n".join(lines), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'set' or subcmd == '设置':
        if len(parts) < 3:
            return None, "用法: .char bg set <字段> <内容>\n字段: 个性/理念/羁绊/缺陷/背景特性/外貌/出身/语言/熟练工具/背景故事"

        field_map = {
            '个性': 'personality_traits', '个性补充': 'personality_traits_ext',
            '理念': 'ideals', '羁绊': 'bonds', '缺陷': 'flaws',
            '背景特性': 'background_feature', '外貌': 'appearance',
            '出身': 'origin', '语言': 'languages',
            '熟练工具': 'tool_proficiencies', '背景故事': 'backstory',
        }
        field = field_map.get(parts[1], parts[1])
        content = ' '.join(parts[2:])

        set_background(char['id'], **{field: content})
        return f"✅ {parts[1]}: 已设置", None

    else:
        return None, "用法: .char bg [set]"


# ━━━ 头像命令 ━━━

def cmd_portrait(args: str) -> tuple[str | None, str | None]:
    """.char portrait [路径/open/clear] — 管理角色头像

    用法:
        .char portrait                 查看当前头像路径
        .char portrait <文件路径>      设置头像（支持相对路径，自动搜索人物相关目录）
        .char portrait open            用系统默认程序打开头像图片
        .char portrait clear           清除头像
    """
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        # 查看当前头像
        char = get_character(char['id'])
        path = char.get('portrait_path', '')
        if path:
            exists = os.path.exists(path)
            status = '✅' if exists else '⚠ 文件不存在'
            return f"🖼 {char['name']} 头像: {path}\n   {status}", None
        else:
            return f"🖼 {char['name']} 尚未设置头像。\n   使用 .char portrait <文件路径> 设置", None

    parts = args.strip().split()
    sub = parts[0].lower()

    if sub in ('open', '打开', '查看'):
        char = get_character(char['id'])
        path = char.get('portrait_path', '')
        if not path:
            return None, "尚未设置头像，请先用 .char portrait <路径> 设置"
        # 尝试解析路径
        resolved, _ = resolve_portrait_path(path)
        if not resolved and not os.path.exists(path):
            return None, f"头像文件未找到: {path}\n   使用 .char portrait clear 清除无效路径"
        target = resolved or path
        try:
            if sys.platform == 'win32':
                os.startfile(target)
            elif sys.platform == 'darwin':
                import subprocess
                subprocess.run(['open', target])
            else:
                import subprocess
                subprocess.run(['xdg-open', target])
            return f"🖼 已打开头像: {target}", None
        except Exception as e:
            return None, f"无法打开头像: {e}\n   文件路径: {target}"

    elif sub in ('clear', '清除', 'none', '删除'):
        update_character(char['id'], portrait_path='')
        return f"🖼 已清除 {char['name']} 的头像", None

    else:
        # 当作文件路径处理
        raw_path = args.strip()

        # 搜索路径（与 .char import 同样的模式）
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        search_paths = [
            raw_path,
            os.path.join(project_root, raw_path),
            os.path.join(project_root, '人物相关', raw_path),
        ]

        found = None
        for sp in search_paths:
            if os.path.exists(sp) and os.path.isfile(sp):
                found = os.path.abspath(sp)
                break

        if found:
            update_character(char['id'], portrait_path=found)
            return f"✅ {char['name']} 头像已设置: {found}\n   使用 .char portrait open 打开查看", None
        else:
            return None, (
                f"未找到头像文件: {raw_path}\n"
                f"已搜索路径:\n"
                + "\n".join(f"  - {sp}" for sp in search_paths)
            )


# ━━━ 打开角色卡命令 ━━━

def cmd_open_char(args: str) -> tuple[str | None, str | None]:
    """.char open — 用系统默认程序打开导入的角色卡文件"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    # 重新获取最新数据
    char = get_character(char['id'])
    source_file = char.get('source_file', '')

    if not source_file:
        return None, (
            f"📁 {char['name']} 没有关联的角色卡文件。\n"
            f"   该角色可能是手动创建或旧版本导入的。\n"
            f"   使用 .char import <文件> 重新导入即可关联文件。"
        )

    if not os.path.exists(source_file):
        return None, f"角色卡文件已移动或删除: {source_file}"

    try:
        if sys.platform == 'win32':
            os.startfile(source_file)
        elif sys.platform == 'darwin':
            import subprocess
            subprocess.run(['open', source_file])
        else:
            import subprocess
            subprocess.run(['xdg-open', source_file])
        return f"📁 已打开角色卡: {os.path.basename(source_file)}\n   {source_file}", None
    except Exception as e:
        return None, f"无法打开文件: {e}\n   路径: {source_file}"


def cmd_ss(args: str) -> tuple[str | None, str | None]:
    """.ss [子命令] — 法术位"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    if not args.strip():
        char = get_character(char['id'])
        return format_spell_slots(char.get('spell_slots', {})), None

    parts = args.strip().split()
    subcmd = parts[0].lower()

    if subcmd == 'init':
        if len(parts) == 1:
            init_spell_slots_by_level(char['id'], char['level'])
            char = get_character(char['id'])
            return f"✅ 法术位已按等级 ({char['level']}级) 初始化\n" + format_spell_slots(char.get('spell_slots', {})), None

        slot_map = {}
        for i, count in enumerate(parts[1:], 1):
            try:
                c = int(count)
                if c > 0:
                    slot_map[str(i)] = c
            except ValueError:
                return None, f"无效法术位数量: {count}"
        init_spell_slots(char['id'], slot_map)
        char = get_character(char['id'])
        return f"✅ 法术位已设定\n" + format_spell_slots(char.get('spell_slots', {})), None

    elif subcmd == 'use':
        if len(parts) < 2:
            return None, "用法: .ss use <环数>"
        level = parts[1]
        result = use_spell_slot(char['id'], level)
        if 'error' in result:
            return None, result['error']
        return f"✨ 消耗 {level}环 法术位 1个 (剩余 {result['remaining']}/{result['max']})", None

    elif subcmd == 'restore':
        if len(parts) > 1:
            level = parts[1]
            import sqlite3
            from core.character import get_db
            conn = get_db()
            conn.execute("UPDATE spell_slots SET used_slots = 0 WHERE character_id = ? AND slot_level = ?",
                        (char['id'], level))
            conn.commit()
            conn.close()
            return f"✅ {level}环法术位已恢复", None

    return None, f"未知子命令: {subcmd}\n用法: .ss / .ss init / .ss use <环数>"


def cmd_longrest(args: str) -> tuple[str | None, str | None]:
    """.longrest — 长休"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    result = long_rest(char['id'])
    if 'error' in result:
        return None, result['error']

    return (
        f"🛌 {bold(char['name'])} 完成长休!\n"
        f"   ❤️ HP 恢复至: {result['hp']}\n"
        f"   ✨ 法术位已恢复\n"
        f"   💀 死亡豁免已重置\n"
        f"   🎲 生命骰已恢复: {result.get('hd_restored', '?')}个"
    ), None


def cmd_shortrest(args: str) -> tuple[str | None, str | None]:
    """.shortrest [生命骰数量] — 短休（消耗生命骰恢复HP）"""
    char = get_active_char()
    if not char:
        return None, "请先选择角色: .char use <名字>"

    hd_to_spend = None
    if args.strip():
        try:
            hd_to_spend = int(args.strip())
        except ValueError:
            return None, f"无效的生命骰数量: {args.strip()}"

    result = short_rest(char['id'], hd_to_spend)
    if 'error' in result:
        return None, result['error']

    con_sign = '+' if result['con_mod'] >= 0 else ''
    roll_details = '\n'.join(
        f"      🎲 {r['die']}: {r['roll']} {con_sign}{r['con_mod']} = 恢复{r['heal']}HP"
        for r in result['hd_rolls']
    )

    lines = [
        f"☕ {bold(char['name'])} 完成短休!",
        f"   消耗生命骰: {result['hd_spent']}个 (剩余{result['hd_remaining']}个)",
        f"   体质调整值: {con_sign}{result['con_mod']}",
        f"   生命骰详情:",
        roll_details,
        f"   总计掷出: {result['total_rolled']}HP → 实际恢复: {color_green(str(result['actual_healed']))}HP",
        f"   ❤️ HP: {result['hp_before']} → {result['hp_after']}/{result['hp_max']}",
    ]
    if result.get('capped'):
        lines.append(f"   💡 HP已达上限，多余恢复量被舍弃")

    return "\n".join(lines), None


def cmd_spell(args: str) -> tuple[str | None, str | None]:
    """.spell <名称> [-d] — 查询法术 (-d 显示详细描述)"""
    if not args.strip():
        return None, "用法: .spell <法术名> [-d]\n例: .spell 火球术  / .spell fireball  / .spell 火球术 -d"

    parts = args.strip().split()
    show_detail = False
    if parts[-1] in ('-d', '--detail', '详细'):
        show_detail = True
        parts = parts[:-1]
    query = ' '.join(parts)

    if not query:
        return None, "请输入法术名"

    # 先从CHM数据库搜索
    chm_results = search_spell(query)
    if chm_results:
        spell = chm_results[0]
        return _format_chm_spell(spell, show_detail), None

    # 回退到SRD数据
    spell = srd_search_spell(query)
    if not spell:
        return None, f"未找到法术: {query}"
    return format_spell_info(spell), None


def _format_chm_spell(spell: dict, show_detail: bool = False) -> str:
    """格式化CHM法术查询结果"""
    name_cn = spell.get('name_cn', spell.get('name', '未知'))
    name_en = spell.get('name_en', '')
    level = spell.get('level', '?')
    school = spell.get('school', '?')
    classes = spell.get('classes', '?')
    casting_time = spell.get('casting_time', '?')
    verbal = 'V' if spell.get('verbal', '') in ('V', '✓') else ''
    somatic = 'S' if spell.get('somatic', '') in ('S', '✓') else ''
    material = 'M' if spell.get('material', '') in ('M', '✓') else ''
    ritual = '是' if spell.get('ritual', '') in ('✓', '是', 'R') else '否'
    concentration = '是' if spell.get('concentration', '') in ('✓', '是', 'C') else '否'
    source = spell.get('source', '?')

    components = ' '.join(filter(None, [verbal, somatic, material])) or '—'

    lines = [
        bold(f"📖 {name_cn}"),
        f"   {name_en}" if name_en else "",
        f"   {level} · {school}学派",
        f"   ⏱ 施法时间: {casting_time}",
        f"   🧪 成分: {components}",
        f"   📋 仪式: {ritual} | 🎯 专注: {concentration}",
        f"   👤 职业: {classes}",
        f"   📚 来源: {source}",
    ]
    lines = [l for l in lines if l]  # 去除空行

    # 详细描述
    if show_detail or spell.get('detail_text'):
        detail_text = spell.get('detail_text', '')
        if not detail_text:
            # 尝试从详情页读取
            detail_link = spell.get('detail_link', '')
            if detail_link:
                detail_text = read_detail_page(detail_link) or ''
        if detail_text:
            lines.append(f"")
            lines.append(f"   ═══ 详细描述 ═══")
            lines.append(f"   {detail_text}")

    if not show_detail:
        lines.append(f"")
        lines.append(f"   💡 使用 .spell {name_cn} -d 查看完整描述")

    return "\n".join(lines)


def cmd_monster(args: str) -> tuple[str | None, str | None]:
    """.monster <名称> [-d] — 查询怪物 (-d 显示详细数据)"""
    if not args.strip():
        return None, "用法: .monster <怪物名> [-d]\n例: .monster 地精  / .monster goblin  / .monster 龙 -d"

    parts = args.strip().split()
    show_detail = False
    if parts[-1] in ('-d', '--detail', '详细'):
        show_detail = True
        parts = parts[:-1]
    query = ' '.join(parts)

    if not query:
        return None, "请输入怪物名"

    # 先从CHM数据库搜索
    chm_results = search_monster(query)
    if chm_results:
        if len(chm_results) == 1:
            monster = chm_results[0]
            return _format_chm_monster(monster, show_detail), None
        else:
            # 多个匹配结果
            lines = [bold(f"👹 找到 {len(chm_results)} 个匹配怪物:")]
            for m in chm_results[:15]:
                name = m.get('name_cn', m.get('name', '?'))
                cr = m.get('cr', '?')
                mtype = m.get('type', '?')
                size = m.get('size', '?')
                source = m.get('source', '?')
                lines.append(f"   {name} | CR:{cr} | {size} {mtype} | {source}")
            if len(chm_results) > 15:
                lines.append(f"   ... 还有 {len(chm_results) - 15} 个结果")
            lines.append(f"")
            lines.append(f"   💡 使用更精确的名称查看详情")
            return "\n".join(lines), None

    # 回退到SRD数据
    monster = srd_search_monster(query)
    if not monster:
        return None, f"未找到怪物: {query}"
    return format_monster_info(monster), None


def _format_chm_monster(monster: dict, show_detail: bool = False) -> str:
    """格式化CHM怪物查询结果"""
    name_cn = monster.get('name_cn', monster.get('name', '未知'))
    name_en = monster.get('name_en', '')
    size = monster.get('size', '?')
    mtype = monster.get('type', '?')
    cr = monster.get('cr', '?')
    legendary = monster.get('legendary', '?')
    source = monster.get('source', '?')

    lines = [
        bold(f"👹 {name_cn}"),
        f"   {name_en}" if name_en else "",
        f"   挑战等级: {cr} | {size} {mtype}",
        f"   传奇动作: {legendary}",
        f"   📚 来源: {source}",
    ]
    lines = [l for l in lines if l]

    if show_detail or monster.get('detail_text'):
        detail_text = monster.get('detail_text', '')
        if not detail_text:
            detail_link = monster.get('detail_link', '')
            if detail_link:
                detail_text = read_detail_page(detail_link) or ''
        if detail_text:
            lines.append(f"")
            lines.append(f"   ═══ 详细数据 ═══")
            lines.append(f"   {detail_text}")

    if not show_detail:
        lines.append(f"")
        lines.append(f"   💡 使用 .monster {name_cn} -d 查看完整数据")

    return "\n".join(lines)


def cmd_condition(args: str) -> tuple[str | None, str | None]:
    """.condition <名称> — 查询状态"""
    if not args.strip():
        conditions = load_conditions()
        return f"可用状态: {', '.join(conditions.keys())}", None

    conditions = load_conditions()
    query = args.strip()
    for name, desc in conditions.items():
        if query in name:
            return f"{bold(name)}:\n{desc}", None

    return None, f"未找到状态: {query}"


# ━━━ 随机事件表命令 ━━━

# ━━ 辅助：区间表构建器 ━━
def _build_interval_table(ranges: list[tuple[tuple[int, int], object]]) -> dict:
    """根据 (lo, hi) 区间列表生成 1-based 映射字典。区间重叠时后者覆盖。"""
    table = {}
    for (lo, hi), value in ranges:
        for i in range(lo, hi + 1):
            table[i] = value
    return table


# 随机环境 d6 表 (.hj6) — 保持原样
ENVIRONMENT_TABLE = {
    1: ("雪坑（需要过被动察觉，如果未过则需要敏捷豁免DC15，未过则掉入坑中，受到1d6钝击伤害，且需要进行运动检定DC12爬出）",
        {"passive": "察觉", "save": "敏捷", "dc": 15}),
    2: ("暴风雪（感知，敏捷劣势，可见范围降低至30尺，火把无法使用；需要过自然检定DC15，未过则暂时迷失方向）",
        {"check": "自然", "dc": 15}),
    3: "极光（被认为是水星的指引，下次智力或感知相关属性检定为优势）",
    4: ("霜雾（感知劣势，可见范围降低至30尺；需要过体质豁免DC15，失败则受到1d4寒冷伤害）",
        {"save": "体质", "dc": 15}),
    5: ("冻雨（需要过体质豁免DC15，失败则受到1d4寒冷伤害）",
        {"save": "体质", "dc": 15}),
    6: "暖风（山谷中的风吹向外界造成短暂升温，下一次体质豁免优势）",
}

# 随机人类 d100 表 (.rl100) — 区间表
HUMAN_TABLE = _build_interval_table([
    ((1, 15), "商队（可交易）"),
    ((16, 45), "公会（佣兵，冒险者）"),
    ((46, 65), "士兵（军队，地方卫队）"),
    ((66, 100), "猎人（向导，当地人）"),
])

# 随机野兽 d10 表 (.ys10) — 保持原样（更新条目1）
BEAST_TABLE = {
    1: "冰原狼（1d2只）",
    2: "野猪（1只）",
    3: "柯莫得白熊（1只）",
    4: "卡佐巨熊（1只）",
    5: "冈达尔巨鹰（1只）",
    6: "寒脊蛇（1d2条）",
    7: "柯莫得白熊（1d3只）",
    8: "冰原狼（2只）",
    9: "野猪（1只）",
    10: "冰原狼（1d4只）",
}

# 随机特殊事件 d6 表 (.sj6) — 保持原样
SPECIAL_EVENT_TABLE = {
    1: ("雪崩（敏捷或体质豁免DC12，失败被雪埋住受到1d6寒冷伤害，并且需要过运动检定DC15脱离雪层，失败则每次受到1d4寒冷伤害）",
        {"save": "敏捷", "dc": 12}),
    2: ("冰层破裂（敏捷豁免 DC12，失败落水受 1d6 寒冷伤害 + 持续失温）",
        {"save": "敏捷", "dc": 12}),
    3: "冰层震动",
    4: ("陷阱（野外猎人留下的捕兽陷阱，需被动察觉DC15，失败触发陷阱受1d4穿刺伤害）",
        {"passive": "察觉", "dc": 15, "on_fail_desc": "触发陷阱，受到1d4穿刺伤害"}),
    5: ("发现特殊标记（奥秘或调查检定DC15，成功则下次自然检定优势）",
        {"check": "奥秘", "dc": 15}),
    6: "寒鸦报信（都灵寒鸦指引安全的方向，下次检定为优势，接下来两次事件不会遭遇危险）",
}

# 随机非敌对生物 d12 表 (.zl12) — 保持原样
NEUTRAL_CREATURE_TABLE = {
    1: "雪蹄兔（被惊吓可跟踪至附近的浆果丛，获得1d2份口粮，生存检定DC12）（1d2只）",
    2: "野鹿（跟踪可发现附近的野菜或者发现荧光苔丛，自然检定DC15，成功则投掷1d100,1-20则为荧光苔丛，获得2份荧光苔，21-100则为野菜，获得1d2份口粮）（1d5只）",
    3: "雪鸮（夜间活动，跟随可发现岩洞，生存检定DC15）（1d2只）",
    4: "都灵寒鸦（展示友善并喂食1份口粮可为你示警，避开下一次遭遇中的恶意事件，驯养检定DC10）（1只）",
    5: "雪狐（展示友善并喂食1份口粮可引路至附近的特殊发现，驯养检定DC15）（1只）",
    6: "霜鼠（跟踪可发现附近温暖地脉，接下来两次事件中体质检定优势，自然检定DC15）（2d3只）",
    7: "雪蹄兔（被惊吓可跟踪至附近的浆果丛，获得1d2份口粮，生存检定DC12）（1d3只）",
    8: "野鹿（跟踪可发现附近的野菜或者发现荧光苔丛，自然检定DC15，成功则投掷1d100,1-20则为荧光苔丛，获得2份荧光苔，21-100则为野菜，获得1d2份口粮）（1d3只）",
    9: "麝牛（被惊吓后需过驯养检定DC15，失败则进入敌对状态）（1d4只）",
    10: "银蛛（可采集蛛网但会进入敌对状态）（1d4只）",
    11: "霜羽雉（跟随可发现霜羽雉的巢穴，获得1d3个霜羽雉的蛋，1d2根霜羽雉的银羽，自然检定DC15）（1d3只）",
    12: "绒蜂巢（可采集绒蜂蜜，但需要过驯养检定DC15，失败则进入敌对状态）（1d4只绒蜂）",
}

# 随机特殊生物 d100 表 (.sw100) — 区间表
RANDOM_SPECIAL_CREATURE_TABLE = _build_interval_table([
    ((1, 5), "霜巨魔（敌对，可交流）（1d2只）"),
    ((6, 45), "恶尸（敌对，被恶灵附体的尸体）（1d3只）"),
    ((46, 60), "冬之氏族精灵（中立，可交流）（1d3只）"),
    ((61, 92), "霜灵（中立，无意识游荡的灵体）（1d2只）"),
    ((93, 95), "瘦鹿（敌对，恶意的高级猎杀者，灵体生物免疫物理伤害，可被击退）（1只）"),
    ((96, 100), "水星守卫（位于迷失之境的守卫，防止生物误入水星神国，会引导生物远离；下次智力相关检定优势，恢复至满状态）（1只）"),
])

# 随机材料 d50 表 (.cl50) — 区间表
MATERIAL_TABLE = _build_interval_table([
    ((1, 6), "药草（可与魔法泉水调配制成恢复药水恢复2d4+2生命，独立使用恢复1d2生命或者脱离流血状态）"),
    ((7, 15), "浆果/野菜（获得1d2份口粮）"),
    ((16, 23), "松枝（可制作火把，可作为柴火）"),
    ((24, 30), "松脂（可点燃，可制作火把）"),
    ((31, 35), "普通兽骨（可打磨制成工具，可出售，价值1d3银币）"),
    ((36, 42), "矿粒（可出售，价值1d10银币）"),
    ((43, 46), "钱袋（某个倒霉蛋的遗物，获得1d3金币）"),
    ((47, 50), ("特殊材料（进入随机特殊材料d100表并自动使用对应指令）", "cl100")),
])

# 随机特殊材料 d100 表 (.cl100) — 区间表
SPECIAL_MATERIAL_TABLE = _build_interval_table([
    ((1, 25), "荧光苔（照明半径15尺，易燃，可在暴风雪中点燃）"),
    ((26, 45), "松茸（较稀有的食材，可出售，价值5-8银币；可做陷阱诱饵诱捕部分生物；食用后下次力量或体质检定优势）"),
    ((46, 65), "铁松松脂（易燃，耐烧，可在暴风雪中点燃；可使用一个附赠动作点燃涂抹至武器上，使武器在一场战斗中可额外造成1d6火焰伤害）"),
    ((66, 72), "绒蜂蜜（北境的绒蜂所产出的珍稀食材，可出售，价值2-4金币；可做陷阱诱饵诱捕部分生物；处理后食用后恢复1d4生命，并且在一段时间内获得寒冷抗性，并且免疫失温或冰冻效果；直接食用有弱毒型，1d3，若结果为2-3则腹泻，下次体质检定劣势）"),
    ((73, 85), "银蛛蛛网（韧性较强，较稀有材料，可制作网兜，可制作陷阱，可出售，价值6-10银币）"),
    ((86, 95), "霜晶核（蕴含着极其冰冷的能量，可用于制作魔法物品，可用于附魔武器，可出售，价值5-10金币）"),
    ((96, 100), "寒铁髓（寒铁中最为坚硬，魔力相性最好的部分的精华，可用于制作魔法物品，可出售，价值10-20金币）"),
])

# 随机矿物 d100 表 (.kw100) — 区间表
MINERAL_TABLE = _build_interval_table([
    ((1, 10), "岩盐（可用于腌制食品，可用于调味，可出售，价值2-4银币）"),
    ((11, 25), "煤矿（可用于火炉生火；可出售，价值3-5银币）"),
    ((26, 35), "铜矿（熔炼后可用于制作工具，可出售，价值2-4银币）"),
    ((36, 50), "铁矿（熔炼后可用于制作工具，可出售，价值5-10银币）"),
    ((51, 60), "寒铁矿（北境特产铁矿，比普通铁矿更坚硬，魔力相性更好；熔炼后可制作工具，可出售，价值1-2金币；有概率产出寒铁髓，寒铁中最为坚硬，魔力相性最好的部分的精华；可用于制作魔法物品，可出售，价值15-20金币；自动投掷1d6，若结果为6则产出寒铁髓）"),
    ((61, 70), "银矿（可出售，价值2-4金币）"),
    ((71, 75), "金矿（熔炼后可制作饰品，可制作魔法物品，可出售，价值10-20金币）"),
    ((76, 85), "冰水晶（蓝色晶体，可用于制作魔法物品，可出售，价值3-5金币）"),
    ((86, 92), "霜晶核（蕴含着极其冰冷的能量；可用于制作魔法物品，可用于附魔武器，可出售，价值5-10金币）"),
    ((93, 96), "化石（可出售，价值1-30金）"),
    ((97, 100), "宝石（可制作饰品，可制作魔法物品，可出售，价值20-50金币）"),
])

# 随机特殊发现 d100 表 (.fx100) — 区间表（更新链至 kw100）
FX100_TABLE = _build_interval_table([
    ((1, 5), ("发现遗迹（可探索调查，进入随机遗迹d8表并自动使用对应指令）", "yj8", 1)),
    ((6, 15), "发现灵泉（魔法泉水，可收集2次，饮用后下次智力相关检定优势）"),
    ((16, 40), "发现猎人小屋（可进入长休/短休，可获得1d4份口粮）"),
    ((41, 55), "发现天然温泉（可短休，回复1d4生命，体温回升，下次体质检定优势）"),
    ((56, 85), "发现岩洞（可进入长休/短休，可躲避恶劣天气）"),
    ((86, 100), ("发现矿坑（可探索调查，若携带矿镐可采掘2次，进入随机矿物d100表并自动使用对应指令）", "kw100", 2)),
])

# 随机遗迹 d8 表 (.yj8) — 保持原样
RUINS_TABLE = {
    1: "远古战场（发现古老的战场，满地都是断裂的武器和破损的甲胄，也许其中还有蒙尘的宝物；奥秘检定/调查检定DC20，成功则获得魔法物品）",
    2: "巨兽骨骸（发现远古巨兽的坚硬骨架，过奥秘检定DC18，成功则发现并可以尝试采集巨兽秘骨，失败则只能尝试采集巨兽之骨；采集需要过力量检定DC18，失败则无法采集）",
    3: "古老墓穴（也许沉睡着古老的存在）",
    4: "符文法阵（也许还能激活？需要过奥秘检定DC18，失败则无法得知此法阵作用；企图激活法阵需要过奥秘检定DC15，失败则无法激活）",
    5: "废弃神殿（废弃的神殿早已破旧不堪，甚至神像上都盖着厚厚的一层白雪）",
    6: "残破石碑（残破的石碑上记载着一些不被人们知晓的故事）",
    7: "倒塌建筑（倒塌的建筑埋没了一段历史）",
    8: "神秘祭坛（也许接受献祭的对象是你招惹不起的存在）",
}

# 随机调查事件 d100 表 (.dc100) — 区间表
INVESTIGATE_TABLE = _build_interval_table([
    ((1, 10), ("特殊发现（进入随机特殊发现d100表并自动使用对应指令）", "fx100")),
    ((11, 35), "发现踪迹（下次过调查检定为优势）"),
    ((36, 60), ("发现异常（需要过感知检定DC12，失败则进入随机遭遇事件d100表并自动使用对应指令）", {"check": "感知", "dc": 12, "on_fail": "zy100"})),
    ((61, 85), ("发现材料（进入随机材料d50表并自动使用对应指令）", "cl50")),
    ((86, 100), "一无所获"),
])

# 随机探索事件 d100 表 (.ts100) — 区间表
EXPLORE_TABLE = _build_interval_table([
    ((1, 20), "继续深入"),
    ((21, 40), ("进入随机遭遇（进入随机遭遇事件d100表并自动使用对应指令）", "zy100")),
    ((41, 60), ("采集资源（调查DC12，若成功则自动骰1d100若结果为1-45则进入随机材料d50表并自动使用对应指令；若结果为46-100则获得柴火与石块，可用于长短休时生火回复体温）", {"check": "调查", "dc": 12, "on_success_d100": [1, 45], "on_success_chain": "cl50", "on_fail_d100_desc": "获得柴火与石块，可用于长短休时生火回复体温"})),
    ((61, 85), ("调查附近（进入随机调查事件d100表并自动使用对应指令）", "dc100")),
    ((86, 95), "原地修整（长休/短休）"),
    ((96, 100), "返回"),
])

# 随机遭遇事件 d100 表 (.zy100) — 区间表
ENCOUNTER_TABLE = _build_interval_table([
    ((1, 20), ("遭遇环境变化（进入随机环境d6表并自动使用对应指令）", "hj6")),
    ((21, 30), ("遭遇人类（进入随机人类d100表并自动使用对应指令）", "rl100")),
    ((31, 55), ("遭遇野兽（进入随机野兽d10表并自动使用对应指令）", "ys10")),
    ((56, 60), "陷入迷失现象（表现为思维迟缓，嗜睡：下次体质/感知检定为劣势）"),
    ((61, 80), ("遭遇中立/友善生物（进入随机非敌对生物d12表并自动使用对应指令）", "zl12")),
    ((81, 85), "遭遇恶霜现象（周围一定范围内有特殊生物，环境表现为魔力的凝滞和败坏，空间的错乱以及生命力的逸散：脱离范围前可见范围降低至30尺，每次事件失去1d4生命，同时敏捷，体质和感知检定处于劣势）"),
    ((86, 95), ("遭遇特殊事件（进入随机特殊事件d6表并自动使用对应指令）", "sj6")),
    ((96, 100), ("遭遇特殊生物（进入随机特殊生物d100表并自动使用对应指令）", "sw100")),
])

# 全随机事件 d100 表 (.qsj100) — 区间表（更新全部链至新表名）
QSJ100_TABLE = _build_interval_table([
    ((1, 4), ("特殊发现", "fx100")),
    ((5, 8), ("特殊生物", "sw100")),
    ((9, 15), ("特殊事件", "sj6")),
    ((16, 25), ("发现材料", "cl50")),
    ((26, 35), ("环境", "hj6")),
    ((36, 50), ("野兽", "ys10")),
    ((51, 60), ("中立/友善生物", "zl12")),
    ((61, 70), ("人类", "rl100")),
    ((71, 80), ("遭遇", "zy100")),
    ((81, 90), ("探索", "ts100")),
    ((91, 100), ("调查", "dc100")),
])

# 物品参考表 (.wp) — 29项物品索引
ITEM_TABLE = {
    1: "药草（可与魔法泉水调配制成恢复药水恢复2d4+2生命，独立使用恢复1d2生命或者脱离流血状态）",
    2: "魔法泉水（可与药草调配制成恢复药水恢复2d4+2生命，单独饮用后下次智力相关检定优势）",
    3: "浆果/野菜（获得1d2份口粮）",
    4: "松枝（可制作火把，可作为柴火）",
    5: "荧光苔（照明半径15尺，易燃，可在暴风雪中点燃）",
    6: "松茸（较稀有的食材，可出售，价值5-8银币；可做陷阱诱饵诱捕部分生物；食用后下次力量或体质检定优势）",
    7: "松脂（可点燃，可制作火把）",
    8: "铁松松脂（易燃，耐烧，可在暴风雪中点燃；可使用一个附赠动作点燃涂抹至武器上，使武器在一场战斗中可额外造成1d6火焰伤害）",
    9: "普通兽骨（可打磨制成工具，可出售，价值1d3银币）",
    10: "霜羽雉的蛋（富含营养的食材，可孵化，可出售，价值3-5银币）",
    11: "霜羽雉的银羽（霜羽雉最出名的尾羽，可作装饰品，可出售，价值1-3金币）",
    12: "绒蜂蜜（北境的绒蜂所产出的珍稀食材，可出售，价值2-4金币；可做陷阱诱饵诱捕部分生物；处理后食用后恢复1d4生命，并且在一段时间内获得寒冷抗性，并且免疫失温或冰冻效果；直接食用有弱毒型，1d3，若结果为2-3则腹泻，下次体质检定劣势）",
    13: "银蛛蛛网（韧性较强，较稀有材料，可制作网兜，可制作陷阱，可出售，价值6-10银币）",
    14: "矿粒（可出售，价值1d10银币）",
    15: "岩盐（可用于腌制食品，可用于调味，可出售，价值2-4银币）",
    16: "煤矿（可用于火炉生火；可出售，价值3-5银币）",
    17: "铜矿（熔炼后可用于制作工具，可出售，价值1-2银币）",
    18: "铁矿（熔炼后可用于制作工具，可出售，价值5-10银币）",
    19: "银矿（可出售，价值2-4金币）",
    20: "金矿（熔炼后可制作饰品，可制作魔法物品，可出售，价值10-20金币）",
    21: "寒铁矿（北境特产铁矿，比普通铁矿更坚硬，魔力相性更好；熔炼后可制作工具，可出售，价值1-2金币；有概率产出寒铁髓，寒铁中最为坚硬，魔力相性最好的部分的精华；可用于制作魔法物品，可出售，价值15-20金币；自动投掷1d6，若结果为6则产出寒铁髓）",
    22: "寒铁髓（寒铁中最为坚硬，魔力相性最好的部分的精华，可用于制作魔法物品，可出售，价值10-20金币）",
    23: "霜晶核（蕴含着极其冰冷的能量，可用于制作魔法物品，可用于附魔武器，可出售，价值5-10金币）",
    24: "冰水晶（蓝色晶体，可用于制作魔法物品，可出售，价值3-5金币）",
    25: "化石（可出售，价值1-30金）",
    26: "宝石（可制作饰品，可制作魔法物品，可出售，价值20-50金币）",
    27: "钱袋（某个倒霉蛋的遗物，获得1d3金币）",
    28: "巨兽之骨（埋骨于北境的远古巨兽的骨头，可制作魔法物品，可出售，价值5-10金币）",
    29: "巨兽秘骨（埋骨于北境的远古巨兽的骨头，其中精华在寒冷的淬炼下拥有了优良的魔力相性，可制作魔法物品，可出售，价值30-50金币）",
}

# 子表注册表: key → (标签, 表字典, 骰子)
SUB_TABLE_REGISTRY = {
    'zy100': ('随机遭遇事件', ENCOUNTER_TABLE, 'd100'),
    'ts100': ('随机探索事件', EXPLORE_TABLE, 'd100'),
    'dc100': ('随机调查事件', INVESTIGATE_TABLE, 'd100'),
    'hj6': ('随机环境', ENVIRONMENT_TABLE, 'd6'),
    'rl100': ('随机人类', HUMAN_TABLE, 'd100'),
    'ys10': ('随机野兽', BEAST_TABLE, 'd10'),
    'sj6': ('随机特殊事件', SPECIAL_EVENT_TABLE, 'd6'),
    'zl12': ('随机非敌对生物', NEUTRAL_CREATURE_TABLE, 'd12'),
    'sw100': ('随机特殊生物', RANDOM_SPECIAL_CREATURE_TABLE, 'd100'),
    'cl50': ('随机材料', MATERIAL_TABLE, 'd50'),
    'fx100': ('随机特殊发现', FX100_TABLE, 'd100'),
    'yj8': ('随机遗迹', RUINS_TABLE, 'd8'),
    'cl100': ('随机特殊材料', SPECIAL_MATERIAL_TABLE, 'd100'),
    'kw100': ('随机矿物', MINERAL_TABLE, 'd100'),
    'qsj100': ('全随机事件', QSJ100_TABLE, 'd100'),
}

EVENT_DURATION_NOTE = "\n   ⏱ 单次随机事件时间：1小时"


def _auto_skill_check(skill_name: str) -> tuple[int, int, int]:
    """执行技能检定，使用当前活跃角色数据。
    返回 (d20结果, 总加值, 最终结果)
    """
    ABILITY_TO_SKILL = {
        '感知': '察觉',
    }
    char = get_active_char()
    skill = normalize_skill(skill_name)
    if skill is None and skill_name in ABILITY_TO_SKILL:
        skill = normalize_skill(ABILITY_TO_SKILL[skill_name])
    ability_mod = 0
    prof_bonus = 0

    if char and skill:
        ability_for_skill = get_ability_for_skill(skill)
        ability_key_map = {
            '力量': 'str', '敏捷': 'dex', '体质': 'con',
            '智力': 'int', '感知': 'wis', '魅力': 'cha',
        }
        abbr = ability_key_map.get(ability_for_skill, 'str')
        ability_score = char['abilities'].get(abbr, 10)
        ability_mod = ability_modifier(ability_score)
        prof_bonus = char.get('proficiency_bonus', 2)

        skill_profs = char.get('skill_proficiencies', {})
        if skill in skill_profs and skill_profs[skill].get('is_proficient'):
            prof_bonus = prof_bonus * (2 if skill_profs[skill].get('is_expertise') else 1)
        else:
            prof_bonus = 0

    total_mod = ability_mod + prof_bonus
    result = roll_ability_check(ability_mod, prof_bonus)
    d20_roll = result.rolls[-1] if result.rolls else result.total - total_mod
    return int(d20_roll), total_mod, result.total


def _auto_save_check(ability_name: str) -> tuple[int, int, int]:
    """执行豁免检定，使用当前活跃角色数据。
    返回 (d20结果, 总加值, 最终结果)
    """
    char = get_active_char()
    ability = normalize_ability(ability_name)
    ability_mod = 0
    prof_bonus = 0

    if char and ability:
        ability_key_map = {
            '力量': 'str', '敏捷': 'dex', '体质': 'con',
            '智力': 'int', '感知': 'wis', '魅力': 'cha',
        }
        abbr = ability_key_map.get(ability, 'str')
        ability_score = char['abilities'].get(abbr, 10)
        ability_mod = ability_modifier(ability_score)

        save_profs = char.get('save_proficiencies', {})
        if ability in save_profs and save_profs[ability].get('is_proficient'):
            prof_bonus = char.get('proficiency_bonus', 2)

    total_mod = ability_mod + prof_bonus
    result = roll_ability_check(ability_mod, prof_bonus)
    d20_roll = result.rolls[-1] if result.rolls else result.total - total_mod
    return int(d20_roll), total_mod, result.total


def _process_check_chain(check_config: dict, indent: str, depth: int) -> str:
    """处理条件检定/豁免链，返回追加的输出文本。"""
    output = ""
    dc = check_config.get('dc', 10)

    passive_name = check_config.get('passive', '')
    if passive_name:
        try:
            prompt = f"\n{indent}🔍 被动{passive_name}DC{dc} — 是否通过？(y/n): "
            answer = input(prompt).strip().lower()
        except (EOFError, OSError):
            answer = 'y'
        if answer in ('y', 'yes', '是', '1', ''):
            output += f"\n{indent}🔍 被动{passive_name}DC{dc}: 通过 ✓"
            return output
        else:
            output += f"\n{indent}🔍 被动{passive_name}DC{dc}: 未通过 → 触发后续"
            if 'save' not in check_config and 'check' not in check_config:
                fail_desc = check_config.get('on_fail_desc', '')
                if fail_desc:
                    output += f"\n{indent}   ⚠ {fail_desc}"
                return output

    if 'save' in check_config:
        save_name = check_config['save']
        d20, mod, total = _auto_save_check(save_name)
        sign = '+' if mod >= 0 else ''
        success = total >= dc
        status = color_green('成功') if success else color_red('失败')
        output += f"\n{indent}🎯 自动{save_name}豁免: d20({d20}) {sign}{mod} = {color_cyan(str(total))} (DC{dc}) → {status}"
    elif 'check' in check_config:
        check_name = check_config['check']
        d20, mod, total = _auto_skill_check(check_name)
        sign = '+' if mod >= 0 else ''
        success = total >= dc
        status = color_green('成功') if success else color_red('失败')
        output += f"\n{indent}🎯 自动{check_name}检定: d20({d20}) {sign}{mod} = {color_cyan(str(total))} (DC{dc}) → {status}"
    else:
        return output

    if not success and 'on_fail' in check_config:
        fail_key = check_config['on_fail']
        if fail_key in SUB_TABLE_REGISTRY:
            sub_label, sub_dict, sub_dice = SUB_TABLE_REGISTRY[fail_key]
            sub_result = roll(sub_dice)
            sub_val = sub_result.total
            sub_entry = sub_dict.get(sub_val, "未知事件")
            if isinstance(sub_entry, tuple):
                if len(sub_entry) == 3:
                    sub_desc, sub_sub_key, _ = sub_entry
                else:
                    sub_desc, sub_sub_key = sub_entry
            else:
                sub_desc, sub_sub_key = sub_entry, None
            output += f"\n{indent}↳ 🎲 {bold(sub_label)} [{sub_dice}: {color_cyan(str(sub_val))}]\n{indent}   {_fmt_desc(sub_desc)}"
            if fail_key in TABLE_ITEM_ACTIONS and sub_val in TABLE_ITEM_ACTIONS[fail_key]:
                item_msg = _apply_item_action(TABLE_ITEM_ACTIONS[fail_key][sub_val], sub_val)
                if item_msg:
                    output += f"\n{indent}   {item_msg}"
            # Follow sub-chain (e.g. zy100→sj6, zy100→rl100)
            if sub_sub_key and depth < 1 and isinstance(sub_sub_key, str) and sub_sub_key in SUB_TABLE_REGISTRY:
                sub_sub_label, sub_sub_dict, sub_sub_dice = SUB_TABLE_REGISTRY[sub_sub_key]
                sub_sub_result = roll(sub_sub_dice)
                sub_sub_val = sub_sub_result.total
                sub_sub_entry = sub_sub_dict.get(sub_sub_val, "未知事件")
                if isinstance(sub_sub_entry, tuple):
                    if len(sub_sub_entry) == 3:
                        sub_sub_desc, _, _ = sub_sub_entry
                    else:
                        sub_sub_desc, _ = sub_sub_entry
                else:
                    sub_sub_desc = sub_sub_entry
                output += f"\n{indent}   ↳ 🎲 {bold(sub_sub_label)} [{sub_sub_dice}: {color_cyan(str(sub_sub_val))}]\n{indent}      {_fmt_desc(sub_sub_desc)}"

    elif success and 'on_success_chain' in check_config:
        d100_result = roll("d100")
        d100_val = d100_result.total
        low, high = check_config.get('on_success_d100', [1, 100])
        in_range = low <= d100_val <= high
        range_status = f"{color_green('命中范围')}" if in_range else "未命中范围"
        output += f"\n{indent}🎲 d100: {color_cyan(str(d100_val))} [{low}-{high}] → {range_status}"

        if in_range:
            chain_key = check_config['on_success_chain']
            chain_repeat = check_config.get('on_success_repeat', 1)
            if chain_key in SUB_TABLE_REGISTRY:
                for ri in range(chain_repeat):
                    sub_label, sub_dict, sub_dice = SUB_TABLE_REGISTRY[chain_key]
                    sub_result = roll(sub_dice)
                    sub_val = sub_result.total
                    sub_entry = sub_dict.get(sub_val, "未知事件")
                    if isinstance(sub_entry, tuple):
                        sub_desc, sub_sub_key = sub_entry
                    else:
                        sub_desc, sub_sub_key = sub_entry, None
                    repeat_tag = f' [第{ri+1}次]' if chain_repeat > 1 else ''
                    output += f"\n{indent}↳ 🎲 {bold(sub_label)} [{sub_dice}: {color_cyan(str(sub_val))}]{repeat_tag}\n{indent}   {_fmt_desc(sub_desc)}"
                    if chain_key in TABLE_ITEM_ACTIONS and sub_val in TABLE_ITEM_ACTIONS[chain_key]:
                        item_msg = _apply_item_action(TABLE_ITEM_ACTIONS[chain_key][sub_val], sub_val)
                        if item_msg:
                            output += f"\n{indent}   {item_msg}"
        else:
            fail_desc = check_config.get('on_fail_d100_desc', '')
            if fail_desc:
                output += f"\n{indent}   📦 {fail_desc}"

        if in_range:
            if sub_sub_key and depth < 1 and isinstance(sub_sub_key, str) and sub_sub_key in SUB_TABLE_REGISTRY:
                    sub_sub_label, sub_sub_dict, sub_sub_dice = SUB_TABLE_REGISTRY[sub_sub_key]
                    sub_sub_result = roll(sub_sub_dice)
                    sub_sub_val = sub_sub_result.total
                    sub_sub_entry = sub_sub_dict.get(sub_sub_val, "未知事件")
                    if isinstance(sub_sub_entry, tuple):
                        sub_sub_desc, _ = sub_sub_entry
                    else:
                        sub_sub_desc = sub_sub_entry
                    output += f"\n{indent}   ↳ 🎲 {bold(sub_sub_label)} [{sub_sub_dice}: {color_cyan(str(sub_sub_val))}]\n{indent}      {_fmt_desc(sub_sub_desc)}"
                    if sub_sub_key in TABLE_ITEM_ACTIONS and sub_sub_val in TABLE_ITEM_ACTIONS[sub_sub_key]:
                        item_msg = _apply_item_action(TABLE_ITEM_ACTIONS[sub_sub_key][sub_sub_val], sub_sub_val)
                        if item_msg:
                            output += f"\n{indent}      {item_msg}"

    return output


# ━━ 材料自动拾取配置 ━━
TABLE_ITEM_ACTIONS = {
    'cl50': {
        **{i: {"item": "药草", "qty": 1, "unit": "份"} for i in range(1, 7)},
        **{i: {"item": "浆果/野菜", "qty_roll": "1d2", "unit": "份口粮"} for i in range(7, 16)},
        **{i: {"item": "松枝", "qty": 1, "unit": "份"} for i in range(16, 24)},
        **{i: {"item": "松脂", "qty": 1, "unit": "份"} for i in range(24, 31)},
        **{i: {"item": "普通兽骨", "qty": 1, "unit": "份"} for i in range(31, 36)},
        **{i: {"item": "矿粒", "qty": 1, "unit": "份"} for i in range(36, 43)},
        **{i: {"coin": "gp", "coin_roll": "1d3"} for i in range(43, 47)},
    },
    'cl100': {
        **{i: {"item": "荧光苔", "qty": 1, "unit": "份"} for i in range(1, 26)},
        **{i: {"item": "松茸", "qty": 1, "unit": "份"} for i in range(26, 46)},
        **{i: {"item": "铁松松脂", "qty": 1, "unit": "份"} for i in range(46, 66)},
        **{i: {"item": "绒蜂蜜", "qty": 1, "unit": "份"} for i in range(66, 73)},
        **{i: {"item": "银蛛蛛网", "qty": 1, "unit": "份"} for i in range(73, 86)},
        **{i: {"item": "霜晶核", "qty": 1, "unit": "份"} for i in range(86, 96)},
        **{i: {"item": "寒铁髓", "qty": 1, "unit": "份"} for i in range(96, 101)},
    },
    'fx100': {
        **{i: {"item": "魔法泉水", "qty": 2, "unit": "份"} for i in range(6, 16)},
        **{i: {"item": "口粮", "qty_roll": "1d4", "unit": "份"} for i in range(16, 41)},
    },
    'kw100': {
        **{i: {"item": "岩盐", "qty": 1, "unit": "份"} for i in range(1, 11)},
        **{i: {"item": "煤矿", "qty": 1, "unit": "份"} for i in range(11, 26)},
        **{i: {"item": "铜矿", "qty": 1, "unit": "份"} for i in range(26, 36)},
        **{i: {"item": "铁矿", "qty": 1, "unit": "份"} for i in range(36, 51)},
        **{i: {"item": "寒铁矿", "qty": 1, "unit": "份",
               "bonus_roll": {"dice": "1d6", "target": 6, "item": "寒铁髓", "qty": 1, "unit": "份"}}
           for i in range(51, 61)},
        **{i: {"item": "银矿", "qty": 1, "unit": "份"} for i in range(61, 71)},
        **{i: {"item": "金矿", "qty": 1, "unit": "份"} for i in range(71, 76)},
        **{i: {"item": "冰水晶", "qty": 1, "unit": "份"} for i in range(76, 86)},
        **{i: {"item": "霜晶核", "qty": 1, "unit": "份"} for i in range(86, 93)},
        **{i: {"item": "化石", "qty": 1, "unit": "份"} for i in range(93, 97)},
        **{i: {"item": "宝石", "qty": 1, "unit": "份"} for i in range(97, 101)},
    },
}


def _apply_item_action(action: dict, roll_val: int) -> str | None:
    """执行物品添加动作，返回提示文本。无活跃角色时仅显示掷骰结果。"""
    char = get_active_char()
    result_parts = []

    if 'coin' in action:
        coin_type = action['coin']
        coin_roll = action.get('coin_roll', '1')
        qty = roll(coin_roll).total
        coin_names = {'cp': '铜币', 'sp': '银币', 'ep': '金银币', 'gp': '金币', 'pp': '白金币'}
        cname = coin_names.get(coin_type, coin_type)
        if not char:
            return f"💰 {coin_roll}={qty} → +{qty} {cname}（无活跃角色）"
        result = adjust_coin(char['id'], coin_type, qty)
        if 'error' not in result:
            cname = coin_names.get(result.get('coin_type', coin_type), coin_type)
            return f"💰 +{qty} {cname}（已添加至角色）"
        return None

    item_name = action['item']
    if 'qty_roll' in action:
        qty_roll_expr = action['qty_roll']
        qty = roll(qty_roll_expr).total
        qty_detail = f"{qty_roll_expr}={qty}"
    else:
        qty = action.get('qty', 1)
        qty_detail = str(qty)
    unit = action.get('unit', '份')

    if not char:
        result_parts.append(f"📦 {qty_detail} → +{qty}{unit} {item_name}（无活跃角色）")
    else:
        add_item(char['id'], f"{item_name}", qty, 0, '', '背包',
                 f"随机事件获得（{qty}{unit}）", '')
        result_parts.append(f"📦 +{qty}{unit} {item_name}（已添加至背包）")

    # ━━ 额外奖励掷骰（如寒铁矿 → 1d6=6 → 寒铁髓）━━
    bonus = action.get('bonus_roll')
    if bonus:
        bonus_dice = bonus['dice']
        bonus_target = bonus['target']
        bonus_item = bonus['item']
        bonus_qty = bonus.get('qty', 1)
        bonus_unit = bonus.get('unit', '份')

        bonus_result = roll(bonus_dice)
        bonus_val = bonus_result.total
        hit = bonus_val == bonus_target
        hit_str = color_green('✓ 命中!') if hit else '未命中'
        result_parts.append(
            f"   🎲 额外判定: {bonus_dice}={color_cyan(str(bonus_val))} "
            f"(需要={bonus_target}) → {hit_str}"
        )

        if hit:
            if char:
                add_item(char['id'], f"{bonus_item}", bonus_qty, 0, '', '背包',
                         f"随机事件额外获得（{bonus_qty}{bonus_unit}）", '')
                result_parts.append(f"   📦 +{bonus_qty}{bonus_unit} {bonus_item}（已添加至背包）")
            else:
                result_parts.append(f"   📦 +{bonus_qty}{bonus_unit} {bonus_item}（无活跃角色）")

    return "\n".join(result_parts)


# ━━ 生物数量自动投掷 ━━

def _parse_and_roll_qty(desc: str) -> tuple[str, str]:
    """解析描述末尾的生物数量骰子并自动投掷。

    识别模式: （XdY只/条/个）或（N只/条/个）
    例如: "冰原狼（1d4只）" → ("冰原狼", " ×3只 (1d4=3)")

    Returns:
        (clean_desc, qty_suffix) — 无数量标记时返回 (desc, "")
    """
    match = _re.search(r'（(\d+d\d+|\d+)(只|条|个)）\s*$', desc)
    if not match:
        return desc, ""

    qty_expr = match.group(1)  # e.g., "1d4", "2d3", "1"
    unit = match.group(2)      # e.g., "只", "条"

    # 去掉描述中的数量部分
    clean_desc = desc[:match.start()].rstrip()

    # 投掷数量
    if 'd' in qty_expr.lower():
        qty_result = roll(qty_expr)
        qty_val = qty_result.total
        qty_detail = f" ({qty_expr}={qty_val})"
    else:
        qty_val = int(qty_expr)
        qty_detail = ""

    suffix = f" ×{color_cyan(str(qty_val))}{unit}{qty_detail}"
    return clean_desc, suffix


def _fmt_desc(desc: str) -> str:
    """格式化描述文本，自动投掷生物数量骰子。"""
    clean, suffix = _parse_and_roll_qty(desc)
    return clean + suffix


def _roll_event_table(table_dict: dict, label: str, dice: str, depth: int = 0,
                      table_key: str = None) -> str:
    """掷随机事件表，支持自动链式掷子表、条件检定链和材料自动拾取（最多3层深）"""
    result = roll(dice)
    roll_val = result.total
    entry = table_dict.get(roll_val, "未知事件")

    if isinstance(entry, tuple):
        if len(entry) == 3:
            desc, sub_table_key, chain_repeat = entry
        else:
            desc, sub_table_key = entry
            chain_repeat = 1
    else:
        desc, sub_table_key, chain_repeat = entry, None, 1

    output = f"🎲 {bold(label)} [{dice}: {color_cyan(str(roll_val))}]\n   {_fmt_desc(desc)}"

    if table_key and table_key in TABLE_ITEM_ACTIONS:
        actions = TABLE_ITEM_ACTIONS[table_key]
        if roll_val in actions:
            item_msg = _apply_item_action(actions[roll_val], roll_val)
            if item_msg:
                output += f"\n   {item_msg}"

    if isinstance(sub_table_key, dict) and depth < 2:
        if 'passive' in sub_table_key:
            print(output, flush=True)
            output = ""
        output += _process_check_chain(sub_table_key, "   ", depth)

    elif isinstance(sub_table_key, str) and depth < 2 and sub_table_key in SUB_TABLE_REGISTRY:
        sub_label, sub_dict, sub_dice = SUB_TABLE_REGISTRY[sub_table_key]
        for ri in range(chain_repeat):
            sub_result = roll(sub_dice)
            sub_val = sub_result.total
            sub_entry = sub_dict.get(sub_val, "未知事件")

            if isinstance(sub_entry, tuple):
                if len(sub_entry) == 3:
                    sub_desc, sub_sub_key, sub_repeat = sub_entry
                else:
                    sub_desc, sub_sub_key = sub_entry
                    sub_repeat = 1
            else:
                sub_desc, sub_sub_key, sub_repeat = sub_entry, None, 1

            repeat_tag = f' [第{ri+1}次]' if chain_repeat > 1 else ''
            output += f"\n   ↳ 🎲 {bold(sub_label)} [{sub_dice}: {color_cyan(str(sub_val))}]{repeat_tag}\n      {_fmt_desc(sub_desc)}"

            if sub_table_key in TABLE_ITEM_ACTIONS:
                sub_actions = TABLE_ITEM_ACTIONS[sub_table_key]
                if sub_val in sub_actions:
                    item_msg = _apply_item_action(sub_actions[sub_val], sub_val)
                    if item_msg:
                        output += f"\n      {item_msg}"

        if sub_sub_key and depth < 1:
            if isinstance(sub_sub_key, dict):
                if 'passive' in sub_sub_key:
                    print(output, flush=True)
                    output = ""
                output += _process_check_chain(sub_sub_key, "      ", depth)
            elif isinstance(sub_sub_key, str) and sub_sub_key in SUB_TABLE_REGISTRY:
                sub_sub_label, sub_sub_dict, sub_sub_dice = SUB_TABLE_REGISTRY[sub_sub_key]
                for sri in range(sub_repeat):
                    sub_sub_result = roll(sub_sub_dice)
                    sub_sub_val = sub_sub_result.total
                    sub_sub_entry = sub_sub_dict.get(sub_sub_val, "未知事件")
                    if isinstance(sub_sub_entry, tuple):
                        if len(sub_sub_entry) == 3:
                            sub_sub_desc, sub_sub_sub_key, sub3_repeat = sub_sub_entry
                        else:
                            sub_sub_desc, sub_sub_sub_key = sub_sub_entry
                            sub3_repeat = 1
                    else:
                        sub_sub_desc, sub_sub_sub_key, sub3_repeat = sub_sub_entry, None, 1
                    sri_tag = f' [第{sri+1}次]' if sub_repeat > 1 else ''
                    output += f"\n      ↳ 🎲 {bold(sub_sub_label)} [{sub_sub_dice}: {color_cyan(str(sub_sub_val))}]{sri_tag}\n         {_fmt_desc(sub_sub_desc)}"

                    if sub_sub_key in TABLE_ITEM_ACTIONS and sub_sub_val in TABLE_ITEM_ACTIONS[sub_sub_key]:
                        item_msg = _apply_item_action(TABLE_ITEM_ACTIONS[sub_sub_key][sub_sub_val], sub_sub_val)
                        if item_msg:
                            output += f"\n         {item_msg}"

                    # 处理第四层链（如 fx100→kw100，支持 chain_repeat 多次采掘）
                    if sub_sub_sub_key and isinstance(sub_sub_sub_key, str) and sub_sub_sub_key in SUB_TABLE_REGISTRY:
                        sub3_label, sub3_dict, sub3_dice = SUB_TABLE_REGISTRY[sub_sub_sub_key]
                        for s3i in range(sub3_repeat):
                            sub3_result = roll(sub3_dice)
                            sub3_val = sub3_result.total
                            sub3_entry = sub3_dict.get(sub3_val, "未知事件")
                            if isinstance(sub3_entry, tuple):
                                sub3_desc, sub3_chain = sub3_entry
                            else:
                                sub3_desc, sub3_chain = sub3_entry, None
                            s3_tag = f' [第{s3i+1}次]' if sub3_repeat > 1 else ''
                            output += f"\n         ↳ 🎲 {bold(sub3_label)} [{sub3_dice}: {color_cyan(str(sub3_val))}]{s3_tag}\n            {_fmt_desc(sub3_desc)}"

                            # item actions for this level
                            if sub_sub_sub_key in TABLE_ITEM_ACTIONS and sub3_val in TABLE_ITEM_ACTIONS[sub_sub_sub_key]:
                                item_msg = _apply_item_action(TABLE_ITEM_ACTIONS[sub_sub_sub_key][sub3_val], sub3_val)
                                if item_msg:
                                    output += f"\n            {item_msg}"

                            # 处理第5层的检定/豁免链
                            if isinstance(sub3_chain, dict):
                                if 'passive' in sub3_chain:
                                    print(output, flush=True)
                                    output = ""
                                output += _process_check_chain(sub3_chain, "            ", depth)
                            elif isinstance(sub3_chain, str) and sub3_chain in SUB_TABLE_REGISTRY:
                                sub4_label, sub4_dict, sub4_dice = SUB_TABLE_REGISTRY[sub3_chain]
                                sub4_result = roll(sub4_dice)
                                sub4_val = sub4_result.total
                                sub4_entry = sub4_dict.get(sub4_val, "未知事件")
                                if isinstance(sub4_entry, tuple):
                                    sub4_desc, _ = sub4_entry
                                else:
                                    sub4_desc = sub4_entry
                                output += f"\n            ↳ 🎲 {bold(sub4_label)} [{sub4_dice}: {color_cyan(str(sub4_val))}]\n               {_fmt_desc(sub4_desc)}"

    return output


# ━━ 主表命令 ━━

def cmd_zy100(args: str) -> tuple[str | None, str | None]:
    """.zy100 — 随机遭遇事件（d100）"""
    output = _roll_event_table(ENCOUNTER_TABLE, '随机遭遇事件', 'd100')
    return output + EVENT_DURATION_NOTE, None


def cmd_ts100(args: str) -> tuple[str | None, str | None]:
    """.ts100 — 随机探索事件（d100）"""
    output = _roll_event_table(EXPLORE_TABLE, '随机探索事件', 'd100')
    return output + EVENT_DURATION_NOTE, None


def cmd_dc100(args: str) -> tuple[str | None, str | None]:
    """.dc100 — 随机调查事件（d100）"""
    output = _roll_event_table(INVESTIGATE_TABLE, '随机调查事件', 'd100')
    return output + EVENT_DURATION_NOTE, None


# ━━ 维度子表命令 ━━

def cmd_hj6(args: str) -> tuple[str | None, str | None]:
    """.hj6 — 随机环境（d6）"""
    output = _roll_event_table(ENVIRONMENT_TABLE, '随机环境', 'd6')
    return output + EVENT_DURATION_NOTE, None


def cmd_rl100(args: str) -> tuple[str | None, str | None]:
    """.rl100 — 随机人类（d100）"""
    output = _roll_event_table(HUMAN_TABLE, '随机人类', 'd100')
    return output + EVENT_DURATION_NOTE, None


def cmd_ys10(args: str) -> tuple[str | None, str | None]:
    """.ys10 — 随机野兽（d10）"""
    output = _roll_event_table(BEAST_TABLE, '随机野兽', 'd10')
    return output + EVENT_DURATION_NOTE, None


def cmd_sj6(args: str) -> tuple[str | None, str | None]:
    """.sj6 — 随机特殊事件（d6）"""
    output = _roll_event_table(SPECIAL_EVENT_TABLE, '随机特殊事件', 'd6')
    return output + EVENT_DURATION_NOTE, None


def cmd_zl12(args: str) -> tuple[str | None, str | None]:
    """.zl12 — 随机非敌对生物（d12）"""
    output = _roll_event_table(NEUTRAL_CREATURE_TABLE, '随机非敌对生物', 'd12')
    return output + EVENT_DURATION_NOTE, None


def cmd_sw100(args: str) -> tuple[str | None, str | None]:
    """.sw100 — 随机特殊生物（d100）"""
    output = _roll_event_table(RANDOM_SPECIAL_CREATURE_TABLE, '随机特殊生物', 'd100')
    return output + EVENT_DURATION_NOTE, None


# ━━ 资源表命令 ━━

def cmd_cl50(args: str) -> tuple[str | None, str | None]:
    """.cl50 — 随机材料（d50）"""
    output = _roll_event_table(MATERIAL_TABLE, '随机材料', 'd50', table_key='cl50')
    return output + EVENT_DURATION_NOTE, None


def cmd_fx100(args: str) -> tuple[str | None, str | None]:
    """.fx100 — 随机特殊发现（d100）"""
    output = _roll_event_table(FX100_TABLE, '随机特殊发现', 'd100', table_key='fx100')
    return output + EVENT_DURATION_NOTE, None


def cmd_yj8(args: str) -> tuple[str | None, str | None]:
    """.yj8 — 随机遗迹（d8）"""
    output = _roll_event_table(RUINS_TABLE, '随机遗迹', 'd8')
    return output + EVENT_DURATION_NOTE, None


def cmd_cl100(args: str) -> tuple[str | None, str | None]:
    """.cl100 — 随机特殊材料（d100）"""
    output = _roll_event_table(SPECIAL_MATERIAL_TABLE, '随机特殊材料', 'd100', table_key='cl100')
    return output + EVENT_DURATION_NOTE, None


def cmd_kw100(args: str) -> tuple[str | None, str | None]:
    """.kw100 — 随机矿物（d100）"""
    output = _roll_event_table(MINERAL_TABLE, '随机矿物', 'd100', table_key='kw100')
    return output + EVENT_DURATION_NOTE, None


def cmd_qsj100(args: str) -> tuple[str | None, str | None]:
    """.qsj100 — 全随机事件（d100区间表）"""
    output = _roll_event_table(QSJ100_TABLE, '全随机事件', 'd100')
    return output + EVENT_DURATION_NOTE, None


def cmd_wp(args: str) -> tuple[str | None, str | None]:
    """.wp [编号] — 查询物品表（1-29）"""
    if not args.strip():
        # 列出所有物品
        lines = [bold('📦 物品表（1-29）')]
        for k in sorted(ITEM_TABLE.keys()):
            lines.append(f'  {k:>2}  {ITEM_TABLE[k]}')
        return '\n'.join(lines), None
    try:
        num = int(args.strip())
        if num in ITEM_TABLE:
            return f'📦 物品 #{num}\n   {ITEM_TABLE[num]}', None
        return None, f'物品编号 {num} 不在1-29范围内'
    except ValueError:
        return None, '用法: .wp [编号]\n例: .wp 1  / .wp (列出全部)'


# ━━━ 跑团记录导出 ━━━

# ━━ 事件类型映射（每种事件独立分类，不再合并大类）━━
# 格式: 命令前缀 → (图标+标签, 事件key)
_EVENT_TYPE_MAP: dict[str, tuple[str, str]] = {
    # 主表（顶层掷表）
    'zy100':   ('🗺️ 随机遭遇', 'zy100'),
    'ts100':   ('🗺️ 随机探索', 'ts100'),
    'dc100':   ('🗺️ 随机调查', 'dc100'),
    'qsj100':  ('🗺️ 全随机事件', 'qsj100'),
    # 维度子表（环境/遭遇类）
    'hj6':     ('🌍 随机环境', 'hj6'),
    'rl100':   ('🌍 随机人类', 'rl100'),
    'ys10':    ('🌍 随机野兽', 'ys10'),
    'sj6':     ('🌍 随机特殊事件', 'sj6'),
    'zl12':    ('🌍 随机非敌对生物', 'zl12'),
    'sw100':   ('🌍 随机特殊生物', 'sw100'),
    # 资源表
    'cl50':    ('⛏ 随机材料', 'cl50'),
    'fx100':   ('⛏ 随机特殊发现', 'fx100'),
    'yj8':     ('⛏ 随机遗迹', 'yj8'),
    'cl100':   ('⛏ 随机特殊材料', 'cl100'),
    'kw100':   ('⛏ 随机矿物', 'kw100'),
    # 物品参考
    'wp':      ('📦 物品参考', 'wp'),
}

# 链式子事件标签 → 事件key（用于从输出中解析子事件并归类到具体事件类型）
_SUB_EVENT_LABEL_TO_KEY: dict[str, str] = {
    '随机遭遇事件': 'zy100',
    '随机探索事件': 'ts100',
    '随机调查事件': 'dc100',
    '全随机事件': 'qsj100',
    '随机环境': 'hj6',
    '随机人类': 'rl100',
    '随机野兽': 'ys10',
    '随机特殊事件': 'sj6',
    '随机非敌对生物': 'zl12',
    '随机特殊生物': 'sw100',
    '随机材料': 'cl50',
    '随机特殊发现': 'fx100',
    '随机遗迹': 'yj8',
    '随机特殊材料': 'cl100',
    '随机矿物': 'kw100',
}

_COMMAND_CATEGORIES: dict[str, tuple[str, str]] = {
    'r': ('🎲 掷骰', ''),
    'dnd': ('🎲 属性生成', ''),
    'check': ('🎯 技能/属性检定', ''),
    'save': ('🎯 豁免检定', ''),
    'ds': ('🎯 死亡豁免', ''),
    'init': ('⚔️ 先攻', ''),
    'attack': ('⚔️ 攻击', ''),
    'damage': ('⚔️ 伤害', ''),
    'char': ('👤 角色管理', ''),
    'ss': ('✨ 法术位', ''),
    'longrest': ('🛌 休整', ''),
    'shortrest': ('🛌 休整', ''),
    'spell': ('📚 资料查询', ''),
    'monster': ('📚 资料查询', ''),
    'condition': ('📚 资料查询', ''),
    'search': ('📚 资料查询', ''),
    'rule': ('📚 资料查询', ''),
    'item': ('📚 资料查询', ''),
    'feat': ('📚 资料查询', ''),
    'file': ('📚 资料查询', ''),
    'help': ('🛠️ 系统', ''),
    'log': ('🛠️ 系统', ''),
}


def _extract_gains_from_output(output: str) -> list[str]:
    """从命令输出中提取获得的物品和钱币。"""
    gains = []
    # 匹配: 📦 +X份 YYY（已添加至背包）
    for m in _re.finditer(r'📦\s*\+(\d+)(\S+)\s+(.+?)（已添加至背包）', output):
        gains.append(f"   物品: {m.group(3)} x{m.group(1)}{m.group(2)}")
    # 匹配: 💰 +X YYY（已添加至角色）
    for m in _re.finditer(r'💰\s*\+(\d+)\s+(.+?)（已添加至角色）', output):
        gains.append(f"   钱币: +{m.group(1)} {m.group(2)}")
    # 匹配无活跃角色时的物品提示
    for m in _re.finditer(r'📦\s*(.+?)\s*→\s*\+(\d+)(\S+)\s+(.+?)（无活跃角色）', output):
        gains.append(f"   物品(未绑定): {m.group(4)} x{m.group(2)}{m.group(3)} [掷骰: {m.group(1)}]")
    return gains


def _extract_sub_events(output: str) -> dict[str, int]:
    """从链式事件输出中解析子事件并按事件类型（event_key）分类计数。

    只识别 '↳ 🎲 XXX事件 [dXX: N]' 模式（带 ↳ 前缀的链式子事件），
    不含顶层事件自身的首行 🎲。
    返回 {event_key: count}，其中 event_key 对应 _EVENT_TYPE_MAP。
    """
    # 先剥离 ANSI 颜色码再解析
    clean = _re.sub(r'\x1b\[[0-9;]*m', '', output)
    counts: dict[str, int] = {}
    for m in _re.finditer(r'↳\s*🎲\s*(.+?)\s*\[', clean):
        label = m.group(1).strip()
        event_key = _SUB_EVENT_LABEL_TO_KEY.get(label)
        if event_key:
            counts[event_key] = counts.get(event_key, 0) + 1
    return counts


def cmd_log(args: str) -> tuple[str | None, str | None]:
    """.log — 导出本次会话的跑团记录为TXT文件（含目录与收获总结）"""
    if not _session_log:
        return None, "本次会话暂无命令记录。"

    script_dir = Path(__file__).parent
    log_dir = script_dir / '跑团记录'
    log_dir.mkdir(exist_ok=True)

    date_str = datetime.now().strftime('%Y-%m-%d')
    base_filename = f'跑团记录{date_str}'
    filename = f'{base_filename}.txt'
    filepath = log_dir / filename

    # 如果同名文件已存在，追加序号 (同一会话内不重复覆盖)
    counter = 1
    while filepath.exists():
        counter += 1
        filename = f'{base_filename}_{counter}.txt'
        filepath = log_dir / filename

    # ━━ 分析和归类 ━━
    # 事件条目: event_key -> [(ts, cmd, output), ...]
    event_entries: dict[str, list[tuple[str, str, str]]] = {}
    # 非事件命令条目: category_label -> [(ts, cmd, output), ...]
    cmd_entries: dict[str, list[tuple[str, str, str]]] = {}
    # 每个事件类型的链式子事件计数: event_key -> count
    event_sub_counts: dict[str, int] = {}
    all_gains: list[str] = []
    top_event_count = 0
    other_count = 0

    for ts, cmd, output in _session_log:
        cmd_name = cmd.split()[0].lstrip('.') if cmd else ''
        gains = _extract_gains_from_output(output)
        all_gains.extend(gains)

        # 分类顶层命令
        if cmd_name in _EVENT_TYPE_MAP:
            _, event_key = _EVENT_TYPE_MAP[cmd_name]
            event_entries.setdefault(event_key, []).append((ts, cmd, output))
            top_event_count += 1
        elif cmd_name in _COMMAND_CATEGORIES:
            cat_label, _ = _COMMAND_CATEGORIES[cmd_name]
            cmd_entries.setdefault(cat_label, []).append((ts, cmd, output))
            other_count += 1
        else:
            cmd_entries.setdefault('📋 其他', []).append((ts, cmd, output))
            other_count += 1

        # 从输出中解析链式子事件
        subs = _extract_sub_events(output)
        for event_key, cnt in subs.items():
            event_sub_counts[event_key] = event_sub_counts.get(event_key, 0) + cnt

    total_sub_events = sum(event_sub_counts.values())

    # ━━ 生成文件 ━━
    lines: list[str] = []
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # 标题
    lines.append('═' * 64)
    lines.append(f'  跑团记录 — {now_str}')
    lines.append('═' * 64)
    lines.append('')

    # ━━ 📑 目录 ━━
    lines.append('┏' + '━' * 62 + '┓')
    lines.append('┃' + '               📑 目  录                        '.center(50) + '┃')
    lines.append('┗' + '━' * 62 + '┛')
    lines.append('')
    lines.append(f'  总命令数: {len(_session_log)}')
    lines.append(f'  顶层事件: {top_event_count} 条')
    if total_sub_events > 0:
        lines.append(f'  链式子事件: {total_sub_events} 条')
    lines.append(f'  其他命令: {other_count} 条')
    lines.append(f'  获得物品/钱币: {len(all_gains)} 项')
    lines.append('')

    # ━━ 每种事件类型分别统计 ━━
    # 事件类型显示顺序（按图标分组）
    event_display_order = [
        # 主表
        'zy100', 'ts100', 'dc100', 'qsj100',
        # 维度子表
        'hj6', 'rl100', 'ys10', 'sj6', 'zl12', 'sw100',
        # 资源表
        'cl50', 'fx100', 'yj8', 'cl100', 'kw100',
        # 物品参考
        'wp',
    ]
    for event_key in event_display_order:
        top_cnt = len(event_entries.get(event_key, []))
        sub_cnt = event_sub_counts.get(event_key, 0)
        if top_cnt > 0 or sub_cnt > 0:
            label, _ = _EVENT_TYPE_MAP[event_key]
            if sub_cnt > 0:
                lines.append(f'  {label}: {top_cnt + sub_cnt} 条 (顶层 {top_cnt} + 链式 {sub_cnt})')
            else:
                lines.append(f'  {label}: {top_cnt} 条')

    # 非事件命令统计
    cmd_display_order = [
        '🎲 掷骰', '🎲 属性生成', '🎯 技能/属性检定', '🎯 豁免检定', '🎯 死亡豁免',
        '⚔️ 先攻', '⚔️ 攻击', '⚔️ 伤害',
        '👤 角色管理', '✨ 法术位', '🛌 休整',
        '📚 资料查询', '🛠️ 系统', '📋 其他',
    ]
    for cat in cmd_display_order:
        cnt = len(cmd_entries.get(cat, []))
        if cnt > 0:
            lines.append(f'  {cat}: {cnt} 条')

    lines.append('')

    # ━━ 🎒 收获总结 ━━
    lines.append('┏' + '━' * 62 + '┓')
    lines.append('┃' + '               🎒 收获总结                      '.center(50) + '┃')
    lines.append('┗' + '━' * 62 + '┛')
    lines.append('')

    if all_gains:
        from collections import Counter
        gain_counter = Counter(all_gains)
        for gain_text, count in gain_counter.items():
            if count > 1:
                lines.append(f'{gain_text}  (×{count})')
            else:
                lines.append(gain_text)
    else:
        lines.append('  （无收获记录）')

    lines.append('')

    # ━━ 详细记录（每种事件类型独立一节）━━
    lines.append('─' * 64)
    lines.append('')
    lines.append('┏' + '━' * 62 + '┓')
    lines.append('┃' + '               📜 详细记录                      '.center(50) + '┃')
    lines.append('┗' + '━' * 62 + '┛')
    lines.append('')

    # 先输出事件类型（每种独立一节，含总结）
    for event_key in event_display_order:
        entries = event_entries.get(event_key, [])
        sub_cnt = event_sub_counts.get(event_key, 0)
        if not entries and sub_cnt == 0:
            continue

        label, _ = _EVENT_TYPE_MAP[event_key]
        # 节标题：显示总结信息
        total_cnt = len(entries) + sub_cnt
        header = f'{label} — 共 {total_cnt} 条'
        if sub_cnt > 0:
            header += f' (顶层 {len(entries)} + 链式 {sub_cnt})'
        lines.append(f'┏━━ {header} ' + '━' * max(0, 58 - len(header)))
        lines.append('')

        # 输出该事件类型的每条记录
        if entries:
            for i, (ts, cmd, output) in enumerate(entries, 1):
                lines.append(f'  [{ts}] ▶ {cmd}')
                if output:
                    # 去除 ANSI 颜色码
                    clean = _re.sub(r'\x1b\[[0-9;]*m', '', output)
                    for out_line in clean.split('\n'):
                        lines.append(f'      {out_line}')
                lines.append('')
        else:
            # 只有链式子事件，没有顶层命令
            lines.append(f'  （全部为链式子事件，共 {sub_cnt} 条，见上方主表事件的输出详情）')
            lines.append('')

        lines.append('─' * 64)
        lines.append('')

    # 再输出非事件命令（按大类）
    for cat in cmd_display_order:
        entries = cmd_entries.get(cat, [])
        if not entries:
            continue

        header = f'{cat} — 共 {len(entries)} 条'
        lines.append(f'┏━━ {header} ' + '━' * max(0, 58 - len(header)))
        lines.append('')

        for i, (ts, cmd, output) in enumerate(entries, 1):
            lines.append(f'  [{ts}] ▶ {cmd}')
            if output:
                clean = _re.sub(r'\x1b\[[0-9;]*m', '', output)
                for out_line in clean.split('\n'):
                    lines.append(f'      {out_line}')
            lines.append('')

        lines.append('─' * 64)
        lines.append('')

    lines.append(f'  记录导出时间: {now_str}')
    lines.append('═' * 64)

    content = '\n'.join(lines)
    filepath.write_text(content, encoding='utf-8')

    total_events = top_event_count + total_sub_events
    return (f'📝 跑团记录已导出\n'
            f'   文件: {filepath}\n'
            f'   命令数: {len(_session_log)} | 事件: {total_events} '
            f'(顶层 {top_event_count} + 链式 {total_sub_events}) | '
            f'收获: {len(all_gains)} 项'), None


# ━━━ CHM资料库搜索命令 ━━━

def cmd_search(args: str) -> tuple[str | None, str | None]:
    """.search <关键词> — 综合搜索（CHM资料库 + 项目文件）"""
    if not args.strip():
        return None, "用法: .search <关键词>\n例: .search 火球术  / .search 战士  / .search 魔法物品"

    query = args.strip()
    if len(query) < 2:
        return None, "搜索关键词至少2个字"

    results = search_all_combined(query)

    if not results:
        return None, f"未找到相关内容: {query}"

    type_icons = {
        'spell': '📖', 'monster': '👹', 'rule': '📋', 'file': '📁',
        'item': '💎', 'feat': '⭐', 'doc': '📄',
    }

    lines = [bold(f"🔍 综合搜索: {query} ({len(results)} 条)")]
    for r in results[:20]:
        rtype = r.get('type', '?')
        icon = type_icons.get(rtype, '📄')

        if rtype == 'file':
            cat_label = r.get('cat_label', '')
            name = r.get('name', '?')
            size = r.get('size_kb', 0)
            size_str = f' ({size:.0f}KB)' if size > 0 else ''
            lines.append(f"   {icon} {cat_label} | {name}{size_str}")
            snippet = r.get('snippet', '')
            if snippet:
                lines.append(f"      {snippet[:100]}")
        else:
            name = r.get('name', '?')
            detail = r.get('detail', '')
            lines.append(f"   {icon} [{rtype}] {name}")
            if detail:
                lines.append(f"      {detail}")

    if len(results) > 20:
        lines.append(f"   ... 还有 {len(results) - 20} 条结果")

    return "\n".join(lines), None


def cmd_file(args: str) -> tuple[str | None, str | None]:
    """.file <关键词> [类别] — 搜索项目资料文件

    类别: 规则书/设定/地图/角色卡/模组/怪物面板/历史/笔记/职业/种族/魔法/神系
    """
    if not args.strip():
        return get_file_summary_text(), None

    parts = args.strip().split()
    # 检查最后一个参数是否是类别
    category_map = {
        '规则书': 'rulebook', '设定': 'setting', '设定文档': 'setting_doc',
        '地图': 'map', '角色卡': 'character_sheet', '模组': 'adventure',
        '模组文档': 'module_doc', '怪物面板': 'monster_image',
        '历史': 'history', '笔记': 'text', '职业': 'class_doc',
        '种族': 'race_doc', '魔法': 'magic_doc', '神系': 'pantheon_doc',
        '生物': 'bestiary_doc', '角色': 'character_doc', '图片': 'image',
        '肖像': 'portrait', 'pdf': 'pdf', 'doc': 'doc',
    }
    category = None
    if parts[-1] in category_map:
        category = category_map[parts[-1]]
        parts = parts[:-1]

    query = ' '.join(parts) if parts else ''
    if not query and not category:
        return get_file_summary_text(), None

    results = search_project_files(query, category)

    if not results:
        cat_hint = f' (类别: {parts[-1]})' if category else ''
        return None, f"未找到匹配文件: {query}{cat_hint}"

    lines = [bold(f"📁 文件搜索: {query or '全部'} ({len(results)} 个)")]
    for r in results[:20]:
        cat_label = r.get('cat_label', '')
        name = r.get('name', '?')
        parent = r.get('parent', '')
        size = r.get('size_kb', 0)
        size_str = f' {size:.0f}KB' if size > 0 else ''
        path = r.get('path', '')
        lines.append(f"   {cat_label} | {name}{size_str}")
        lines.append(f"      📂 {parent}/")
        snippet = r.get('snippet', '')
        if snippet:
            lines.append(f"      {snippet[:120]}")

    if len(results) > 20:
        lines.append(f"   ... 还有 {len(results) - 20} 个文件")

    return "\n".join(lines), None


def cmd_rule(args: str) -> tuple[str | None, str | None]:
    """.rule <关键词> [-d] — 搜索规则 (-d 查看详细内容)"""
    if not args.strip():
        return None, "用法: .rule <关键词> [-d]\n例: .rule 借机攻击  / .rule 隐蔽 -d"

    parts = args.strip().split()
    show_detail = False
    if parts[-1] in ('-d', '--detail', '详细'):
        show_detail = True
        parts = parts[:-1]
    query = ' '.join(parts)

    if not query or len(query) < 2:
        return None, "搜索关键词至少2个字"

    results = search_by_type(query, 'rule')

    if not results:
        # 回退到全文搜索
        all_results = search_all(query)
        if all_results:
            lines = [bold(f"📋 规则搜索: {query}")]
            for r in all_results[:10]:
                name = r.get('name', '?')
                detail = r.get('detail', '')
                lines.append(f"   📄 {name}")
                if detail:
                    lines.append(f"      {detail[:120]}")
            return "\n".join(lines), None
        return None, f"未找到规则: {query}"

    lines = [bold(f"📋 规则搜索: {query} ({len(results)} 条)")]
    for r in results[:10]:
        name = r.get('name', '?')
        detail = r.get('detail', '')
        path = r.get('path', '')
        lines.append(f"   📄 {name}")
        if detail:
            lines.append(f"      {detail[:150]}")

    # 详细查看
    if show_detail and results:
        r = results[0]
        path = r.get('path', '')
        if path:
            detail_text = read_detail_page(path)
            if detail_text:
                lines.append(f"")
                lines.append(f"   ═══ 详细内容 ═══")
                lines.append(f"   {detail_text}")

    return "\n".join(lines), None


def cmd_item_search(args: str) -> tuple[str | None, str | None]:
    """.item <名称> — 搜索魔法物品/装备"""
    if not args.strip():
        return None, "用法: .item <物品名>\n例: .item 治疗药水  / .item 长剑  / .item 魔法飞弹魔杖"

    query = args.strip()
    if len(query) < 2:
        return None, "搜索关键词至少2个字"

    # 全文搜索物品相关内容
    all_results = search_all(query)
    item_results = [r for r in all_results if r.get('type') in ('item', 'rule', 'doc')]

    if not item_results:
        # 回退到通用搜索
        item_results = all_results

    if not item_results:
        return None, f"未找到物品: {query}"

    lines = [bold(f"💎 物品搜索: {query} ({len(item_results)} 条)")]
    for r in item_results[:12]:
        name = r.get('name', '?')
        detail = r.get('detail', '')
        lines.append(f"   📄 {name}")
        if detail:
            lines.append(f"      {detail[:120]}")

    # 自动读取第一个结果的详情
    if item_results:
        r = item_results[0]
        path = r.get('path', '')
        if path:
            detail_text = read_detail_page(path)
            if detail_text:
                lines.append(f"")
                lines.append(f"   ═══ 详细信息 ═══")
                lines.append(f"   {detail_text}")

    return "\n".join(lines), None


def cmd_feat(args: str) -> tuple[str | None, str | None]:
    """.feat <名称> — 搜索专长"""
    if not args.strip():
        return None, "用法: .feat <专长名>\n例: .feat 神射手  / .feat 战地施法者"

    query = args.strip()
    if len(query) < 2:
        return None, "搜索关键词至少2个字"

    all_results = search_all(query)
    feat_results = [r for r in all_results if '专长' in r.get('name', '') or 'feat' in r.get('name', '').lower()]

    if not feat_results:
        feat_results = all_results

    if not feat_results:
        return None, f"未找到专长: {query}"

    lines = [bold(f"⭐ 专长搜索: {query} ({len(feat_results)} 条)")]
    for r in feat_results[:10]:
        name = r.get('name', '?')
        detail = r.get('detail', '')
        lines.append(f"   📄 {name}")
        if detail:
            lines.append(f"      {detail[:120]}")

    # 自动读取详情
    if feat_results:
        r = feat_results[0]
        path = r.get('path', '')
        if path:
            detail_text = read_detail_page(path)
            if detail_text:
                lines.append(f"")
                lines.append(f"   ═══ 详细信息 ═══")
                lines.append(f"   {detail_text}")

    return "\n".join(lines), None


def _help_char() -> str:
    return bold("📜 角色卡命令") + """
  .char new <名字>           创建角色
  .char show [-d] [名字]     查看角色卡 (-d 显示详细信息)
  .char list                  列出所有角色
  .char use <名字>            选择当前角色
  .char import <文件>        从Excel人物卡导入角色
  .char set <属性> <值>       设置属性值 (如 STR 16)
  .char set <技能> 熟练       设置技能熟练
  .char set <字段> <值>       设置基础信息 (职业/种族/阵营/信仰/等级/玩家/性别/年龄/身高/体重)
  .char hp                     查看HP
  .char hp <+/-数值>          调整HP (如 -10 / +5)
  .char hp set <数值> [最大]  设置当前HP (可选同时设最大HP)
  .char hp max <数值>          设置最大HP
  .char delete <名字>         删除角色

  武器装备
  .char weapon                查看武器
  .char weapon add <名> <命中> <伤害> [类型]  添加武器
  .char weapon remove <ID/名称>  删除武器
  .char weapon clear           清空武器

  钱币
  .char coin                  查看钱币
  .char coin add <币种> <数量>  增减钱币 (cp/sp/ep/gp/pp)
  .char coin set cp sp ep gp pp 设置钱币

  法术准备
  .char spell                 查看已准备法术
  .char spell add <法术名> [环数]  添加法术
  .char spell clear            清空法术列表

  物品
  .char item                  查看物品
  .char item add <物品名> [x数量] [@位置]  添加物品（同名自动堆叠）
  .char item remove <ID/名称> [数量]  删除物品/减少指定数量
  .char item set <ID> <数量>  设置物品数量（≤0则删除）
  .char item stack             合并背包中同名重复物品
  .char item clear             清空物品

  背景
  .char bg                    查看背景
  .char bg set <字段> <内容>   设置背景信息

  头像
  .char portrait               查看当前头像路径
  .char portrait <文件路径>    设置头像（支持相对路径）
  .char portrait open          用系统默认程序打开头像
  .char portrait clear          清除头像
  .char open                    打开导入时使用的角色卡文件

  法术位
  .ss                         查看法术位
  .ss init                    按等级初始化
  .ss init 4 3 2 1           手动设定 (1环4个, 2环3个...)
  .ss use <环数>              消耗法术位
  .ss restore [环数]          恢复法术位

  休整
  .longrest                   长休 (恢复HP/法术位/死亡豁免/生命骰)
  .shortrest [骰数]           短休 (消耗生命骰恢复HP，不填则用全部)"""


def cmd_help(args: str) -> tuple[str | None, str | None]:
    """.help — 帮助"""
    if args.strip():
        cmd = args.strip().lstrip('.')
        helps = {
            'r': "掷骰: .r <表达式>\n  例: .r 3d6  / .r d20+5 / .r 4d6k3 / .r adv d20",
            'check': "检定: .check <属性/技能> [优势/劣势]\n  例: .check 察觉  / .check 力量 优势",
            'save': "豁免: .save <属性> [优势/劣势]\n  例: .save 敏捷  / .save WIS",
            'init': "先攻: .init [+]<加值> <名字>  / .init list / .init start / .init next / .init clear",
            'ds': "死亡豁免: .ds",
            'attack': "攻击: .attack <武器> [-t 目标] [优势/劣势]",
            'damage': "伤害: .damage <表达式>\n  例: .damage 2d6+3",
            'char': _help_char(),
            'spell': "法术查询: .spell <法术名> [-d]\n  例: .spell 火球术  / .spell fireball -d",
            'monster': "怪物查询: .monster <怪物名> [-d]\n  例: .monster 地精  / .monster 龙 -d",
            'condition': "状态查询: .condition <状态名>\n  例: .condition 麻痹",
            'search': "全文搜索: .search <关键词>\n  例: .search 战士  / .search 魔法物品",
            'rule': "规则查询: .rule <关键词> [-d]\n  例: .rule 借机攻击  / .rule 隐蔽 -d",
            'item': "物品查询: .item <物品名>\n  例: .item 治疗药水  / .item 魔法飞弹魔杖",
            'feat': "专长查询: .feat <专长名>\n  例: .feat 神射手  / .feat 战地施法者",
            'file': "文件搜索: .file <关键词> [类别]\n  例: .file 薇薇  / .file 地图  / .file 北境 设定文档\n  类别: 规则书/设定/地图/角色卡/模组/怪物面板/历史/笔记/职业/种族/魔法/神系",
            'dnd': "属性生成: .dnd [数量]\n  例: .dnd  (1组)  / .dnd 3 (3组)",
            'zy100': "随机遭遇事件(d100): .zy100\n  1-20环境变化 21-30人类 31-55野兽 56-60迷失 61-80友善生物 81-85恶霜现象 86-95特殊事件 96-100特殊生物",
            'ts100': "随机探索事件(d100): .ts100\n  1-20继续深入 21-40随机遭遇 41-60采集资源 61-85调查附近 86-95原地修整 96-100返回",
            'dc100': "随机调查事件(d100): .dc100\n  1-10特殊发现 11-35发现踪迹 36-60发现异常 61-85发现材料 86-100一无所获",
            'hj6': "随机环境(d6): .hj6\n  1雪坑 2暴风雪 3极光 4霜雾 5冻雨 6暖风",
            'rl100': "随机人类(d100): .rl100\n  1-15商队 16-45公会 46-65士兵 66-100猎人",
            'ys10': "随机野兽(d10): .ys10\n  1冰原狼(1d2只) 2野猪(1只) 3柯莫得白熊(1只) 4卡佐巨熊(1只) 5冈达尔巨鹰(1只) 6寒脊蛇(1d2条) 7柯莫得白熊(1d3只) 8冰原狼(2只) 9野猪(1只) 10冰原狼(1d4只)",
            'sj6': "随机特殊事件(d6): .sj6\n  1雪崩 2冰层破裂 3冰层震动 4陷阱 5特殊标记 6寒鸦报信",
            'sw100': "随机特殊生物(d100): .sw100\n  1-5霜巨魔 6-45恶尸 46-60冬之氏族精灵 61-92霜灵 93-95瘦鹿 96-100水星守卫",
            'zl12': "随机非敌对生物(d12): .zl12\n  1雪蹄兔 2野鹿 3雪鸮 4都灵寒鸦 5雪狐 6霜鼠 7雪蹄兔 8野鹿 9麝牛 10银蛛 11霜羽雉 12绒蜂巢\n  各生物附带不同交互效果（跟踪、喂食、驯养等），详见掷出结果",
            'cl50': "随机材料(d50): .cl50\n  1-6药草 7-15浆果 16-23松枝 24-30松脂 31-35兽骨 36-42矿粒 43-46钱袋 47-50特殊材料",
            'fx100': "随机特殊发现(d100): .fx100\n  1-5遗迹 6-15灵泉 16-40猎人小屋 41-55温泉 56-85岩洞 86-100矿坑",
            'yj8': "随机遗迹(d8): .yj8\n  1远古战场 2巨兽骨骸 3古老墓穴 4符文法阵 5废弃神殿 6残破石碑 7倒塌建筑 8神秘祭坛\n  各遗迹附带探索检定（奥秘/调查/力量等）",
            'wp': "物品表(1-29): .wp [编号]\n  查询物品详情或列出全部29项物品",
            'cl100': "随机特殊材料(d100): .cl100\n  1-25荧光苔 26-45松茸 46-65铁松松脂 66-72绒蜂蜜 73-85银蛛蛛网 86-95霜晶核 96-100寒铁髓",
            'kw100': "随机矿物(d100): .kw100\n  1-10岩盐 11-25煤矿 26-35铜矿 36-50铁矿 51-60寒铁矿 61-70银矿 71-75金矿 76-85冰水晶 86-92霜晶核 93-96化石 97-100宝石",
            'qsj100': "全随机事件(d100): .qsj100\n  1-4特殊发现 5-8特殊生物 9-15特殊事件 16-25材料 26-35环境 36-50野兽 51-60友善生物 61-70人类 71-80遭遇 81-90探索 91-100调查",
            'log': "跑团记录: .log\n  导出本次会话所有命令及结果为TXT，保存在 ./跑团记录/跑团记录+日期.txt",
            'ss': "法术位: .ss  / .ss init / .ss use <环数>",
            'longrest': "长休: .longrest",
            'shortrest': "短休: .shortrest [生命骰数量]\n  消耗生命骰恢复HP（每骰+体质调整值），不填数量则消耗全部可用骰",
        }
        if cmd in helps:
            return helps[cmd], None
        return f"无详细帮助: {cmd}", None

    return bold("✦ 尘封之卷 v2.0 — 命令列表") + """
│
├── 🎲 掷骰
│   .r <表达式>          通用掷骰 (3d6 / d20+5 / 4d6k3)
│   .r adv <表达式>      优势掷骰
│   .r dis <表达式>      劣势掷骰
│   .dnd [数量]          随机属性生成
│
├── 🎯 检定
│   .check <属性/技能>   属性/技能检定
│   .save <属性>         豁免检定
│   .ds                   死亡豁免
│
├── ⚔️ 战斗
│   .init <+加值> <名字>  加入先攻
│   .init list            查看先攻
│   .init start           开始战斗
│   .init next            下一回合
│   .init clear           清空先攻
│   .attack <武器> [目标] 攻击检定
│   .damage <表达式>      伤害投掷
│
├── 🗺️ 随机事件 (单次1小时，自动链式掷子表)
│   .zy100                随机遭遇事件 (d100)
│   .ts100                随机探索事件 (d100)
│   .dc100                随机调查事件 (d100)
│   .hj6                  随机环境 (d6)
│   .rl100                随机人类 (d100)
│   .ys10                 随机野兽 (d10)
│   .sj6                  随机特殊事件 (d6)
│   .zl12                 随机非敌对生物 (d12)
│   .sw100                随机特殊生物 (d100)
│   .cl50                 随机材料 (d50)
│   .fx100                随机特殊发现 (d100)
│   .yj8                  随机遗迹 (d8)
│   .cl100                随机特殊材料 (d100)
│   .kw100                随机矿物 (d100)
│   .qsj100               全随机事件 (d100)
│   .log                   导出跑团记录
│
├── 👤 角色卡
│   .char import <文件>   从Excel导入角色卡
│   .char show -d [名字]  查看完整角色卡(含装备/法术/背景)
│   .char weapon / coin / item / bg  管理武器/钱币/物品/背景
│   .ss / .longrest / .shortrest  法术位 / 长休 / 短休
│
├── 📚 资料库 (五版不全书 + 项目文件)
│   .spell <名称> [-d]   法术查询 (936条, -d 详细)
│   .monster <名称> [-d] 怪物查询 (557条, -d 详细)
│   .item <名称>         魔法物品/装备查询
│   .feat <名称>         专长查询
│   .rule <关键词> [-d]  规则查询 (-d 详细内容)
│   .search <关键词>     综合搜索(规则+法术+怪物+文件)
│   .file <关键词> [类别] 搜索项目资料文件
│   .file                 查看文件库统计
│   .condition <名称>    状态查询
│
└── 🛠️ 系统
    .help               显示帮助
    .help <命令>        命令帮助
    .exit / quit        退出""", None


# ━━━ 命令路由 ━━━

COMMAND_MAP = {
    'r': cmd_roll,
    'dnd': cmd_roll_ability,
    'check': cmd_check,
    'save': cmd_save,
    'init': cmd_initiative,
    'ds': cmd_death_save,
    'attack': cmd_attack,
    'damage': cmd_damage,
    'char': cmd_char,
    'ss': cmd_ss,
    'longrest': cmd_longrest,
    'shortrest': cmd_shortrest,
    'spell': cmd_spell,
    'monster': cmd_monster,
    'condition': cmd_condition,
    'search': cmd_search,
    'rule': cmd_rule,
    'item': cmd_item_search,
    'feat': cmd_feat,
    'file': cmd_file,
    'zy100': cmd_zy100,
    'ts100': cmd_ts100,
    'dc100': cmd_dc100,
    'hj6': cmd_hj6,
    'rl100': cmd_rl100,
    'ys10': cmd_ys10,
    'sj6': cmd_sj6,
    'zl12': cmd_zl12,
    'sw100': cmd_sw100,
    'cl50': cmd_cl50,
    'fx100': cmd_fx100,
    'yj8': cmd_yj8,
    'cl100': cmd_cl100,
    'kw100': cmd_kw100,
    'qsj100': cmd_qsj100,
    'wp': cmd_wp,
    'log': cmd_log,
    'help': cmd_help,
}


def process_command(raw: str) -> str:
    """处理单条命令"""
    raw = raw.strip()

    if not raw:
        return ''

    # 检查命令前缀
    if not raw.startswith('.'):
        if raw[0].isdigit() or raw.lower().startswith('d'):
            raw = '.r ' + raw
        elif raw.lower().startswith('adv') or raw.lower().startswith('优势'):
            raw = '.r ' + raw
        else:
            return f"未知命令: {raw}\n使用 .help 查看命令列表。命令以 . 开头。"

    # 分离命令和参数
    raw = raw[1:]  # 去掉 .
    if ' ' in raw:
        cmd, args = raw.split(' ', 1)
    else:
        cmd = raw
        args = ''

    cmd = cmd.lower()

    # 查找处理器
    if cmd in COMMAND_MAP:
        try:
            output, error = COMMAND_MAP[cmd](args)
            result = ''
            if error:
                result = f"{color_red('❌ 错误')}: {error}"
            else:
                result = output or ''
            # 记录日志（排除 .log 自身避免循环）
            if cmd != 'log':
                clean = _re.sub(r'\x1b\[[0-9;]*m', '', result)
                _session_log.append((datetime.now().strftime('%H:%M:%S'), f'.{cmd} {args}'.strip(), clean))
            return result
        except Exception as e:
            result = f"{color_red('❌ 异常')}: {type(e).__name__}: {e}"
            clean = _re.sub(r'\x1b\[[0-9;]*m', '', result)
            _session_log.append((datetime.now().strftime('%H:%M:%S'), f'.{cmd} {args}'.strip(), clean))
            return result
    else:
        result = f"未知命令: .{cmd}\n使用 .help 查看命令列表。"
        clean = _re.sub(r'\x1b\[[0-9;]*m', '', result)
        _session_log.append((datetime.now().strftime('%H:%M:%S'), f'.{cmd} {args}'.strip(), clean))
        return result


# ━━━ 主循环 ━━━

def interactive_mode():
    """交互模式"""
    print(bold("✦ 尘封之卷 v2.0"))
    print(f"  Powered by 尘封之卷 · D&D 5E SRD")
    print(f"  输入 .help 查看命令，.exit 退出")
    print()

    while True:
        try:
            raw = input(f"{color_cyan('尘封之卷>')} ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not raw:
            continue

        if raw in ('.exit', '.quit', '.q', 'exit', 'quit'):
            print("再见！")
            break

        result = process_command(raw)
        if result:
            print(result)
            print()


def single_command_mode(raw: str):
    """单次命令模式"""
    result = process_command(raw)
    if result:
        print(result)


def main():
    """主入口"""
    if len(sys.argv) > 1:
        if sys.argv[1] == '--web':
            from web.app import run_server
            run_server()
        else:
            single_command_mode(' '.join(sys.argv[1:]))
    else:
        interactive_mode()


if __name__ == '__main__':
    main()
