"""DND 骰子解析与投掷引擎

支持的表达式：
  XdY       — 基本骰子 (3d6, 1d20)
  XdY+Z     — 加固定值 (1d20+5)
  XdY-Z     — 减固定值 (2d6-1)
  XdYkH     — 保留最高的H个 (4d6k3)
  XdYdL     — 舍弃最低的L个 (4d6d1)
  XdYdhH    — 舍弃最高的H个 (4d6dh1, 同 dH)
  XdYdlL    — 舍弃最低的L个 (4d6dl1, 同 dL)
  XdY adv   — 优势 (2d20取高)
  XdY dis   — 劣势 (2d20取低)
  XdY!      — 爆炸骰 (取最大值时再投一次)
"""

import random
import re
from dataclasses import dataclass, field


@dataclass
class DiceResult:
    """掷骰结果"""
    expression: str           # 原始表达式
    rolls: list[int] = field(default_factory=list)      # 每次掷骰的面值
    kept_rolls: list[int] | None = None  # 保留的骰子（k/d操作后）
    modifier: int = 0         # 调整值
    total: int = 0            # 最终结果
    advantage: bool | None = None  # True=优势, False=劣势, None=普通
    is_crit_success: bool = False  # Natural 20 (仅d20)
    is_crit_failure: bool = False  # Natural 1 (仅d20)
    groups_detail: list | None = None  # 每组 {sides, rolls}，混合骰子 3D 动画用（v5.8）


def roll_die(sides: int) -> int:
    """投掷单个骰子"""
    return random.randint(1, sides)


def parse_dice_expression(expr: str) -> dict:
    """解析骰子表达式（支持混合多重骰子，如 1d20+1d4+3 / 2d8+1d6+3）

    Returns:
        dict with keys: groups（每组 count/sides/keep_highest/drop_lowest/
        drop_highest/exploding）、modifier、advantage；并保留第一组的
        兼容字段 count/sides/keep_highest/drop_lowest/drop_highest/exploding
    """
    expr = expr.strip().lower()

    # 检测优势/劣势
    advantage = None
    if '优势' in expr or ' adv' in expr or 'adv ' in expr or expr.endswith('adv') or expr.startswith('adv '):
        advantage = True
        expr = expr.replace('优势', '').replace('adv', '').strip()
    elif '劣势' in expr or ' dis' in expr or 'dis ' in expr or expr.endswith('dis') or expr.startswith('dis '):
        advantage = False
        expr = expr.replace('劣势', '').replace('dis', '').strip()

    # 按 +/- 拆分为多个子段（保留符号），每段为独立骰子组或调整值
    parts = [p.strip() for p in re.split(r'(?=[+-])', expr) if p.strip()]
    if not parts:
        raise ValueError(f"无法解析表达式: {expr}")

    groups = []
    modifier = 0
    for part in parts:
        # 纯数字段 = 调整值（如 +3 / -2 / 5）
        if part.isdigit() or (part.startswith('-') and part[1:].isdigit()) or (part.startswith('+') and part[1:].isdigit()):
            modifier += int(part)
            continue

        exploding = '!' in part
        part_clean = part.replace('!', '')
        if part_clean.startswith('+'):
            part_clean = part_clean[1:]  # 拆分保留的正号前缀

        # 解析 dX 部分（支持 XdY 或 dY 形式）
        d_match = re.match(r'(?:(\d+)d(\d+)|d(\d+))', part_clean)
        if not d_match:
            raise ValueError(f"无法解析表达式: {expr}")
        if d_match.group(1):
            count = int(d_match.group(1))
            sides = int(d_match.group(2))
        else:
            count = 1
            sides = int(d_match.group(3))

        rest = part_clean[d_match.end():]
        keep_highest = None
        drop_lowest = None
        drop_highest = None

        # keep highest: k3
        k_match = re.search(r'k(\d+)', rest)
        if k_match:
            keep_highest = int(k_match.group(1))
            rest = rest[:k_match.start()] + rest[k_match.end():]

        # drop highest: dh1（先于 dl 匹配，避免 d 误吞 h）
        dh_match = re.search(r'dh(\d+)', rest)
        if dh_match:
            drop_highest = int(dh_match.group(1))
            rest = rest[:dh_match.start()] + rest[dh_match.end():]

        # drop lowest: dl1 或 d1
        dl_match = re.search(r'dl?(\d+)', rest)
        if dl_match:
            drop_lowest = int(dl_match.group(1))
        elif rest.strip().isdigit() and keep_highest is None:
            # 纯数字后缀也可能是 drop lowest（兼容 4d6d1）
            drop_lowest = int(rest.strip())

        groups.append({
            'count': count,
            'sides': sides,
            'keep_highest': keep_highest,
            'drop_lowest': drop_lowest,
            'drop_highest': drop_highest,
            'exploding': exploding,
        })

    # 纯数字表达式（如 "5"）：无骰子组，保持原行为（掷 1d20 + 调整值）
    if not groups:
        groups = [{
            'count': 1, 'sides': 20,
            'keep_highest': None, 'drop_lowest': None,
            'drop_highest': None, 'exploding': False,
        }]

    # 优势/劣势：第一组投两个骰子取高/取低（任意面数均支持）
    g1 = groups[0]
    if advantage is not None:
        g1['count'] = 2  # 投两个骰子

    return {
        'groups': groups,
        'count': g1['count'],
        'sides': g1['sides'],
        'modifier': modifier,
        'keep_highest': g1['keep_highest'],
        'drop_lowest': g1['drop_lowest'],
        'drop_highest': g1['drop_highest'],
        'advantage': advantage,
        'exploding': g1['exploding'],
    }


def roll(expression: str) -> DiceResult:
    """执行掷骰（支持混合多重骰子，如 1d20+1d4+3）

    Examples:
        >>> roll("3d6")
        >>> roll("1d20+5")
        >>> roll("4d6k3")
        >>> roll("d20 adv")
        >>> roll("1d6!")
        >>> roll("1d20+1d4+3")
    """
    parsed = parse_dice_expression(expression)
    groups = parsed['groups']
    modifier = parsed['modifier']
    advantage = parsed['advantage']

    # 纯数字表达式（如 "5"）：保持原行为，掷 1d20 + 调整值
    if not groups:
        groups = [{
            'count': 1, 'sides': 20,
            'keep_highest': None, 'drop_lowest': None,
            'drop_highest': None, 'exploding': False,
        }]

    rolls = []          # 全部骰子投掷值（k/d 前）
    kept_rolls = []     # 每组 k/d 后的保留值
    group_rolls = []    # 每组原始投掷值（暴击判定用）

    for idx, g in enumerate(groups):
        count = g['count']
        sides = g['sides']

        # 投掷骰子
        g_rolls = []
        for _ in range(count):
            roll_value = roll_die(sides)

            # 爆炸骰
            if g['exploding'] and roll_value == sides:
                while roll_value == sides:
                    g_rolls.append(roll_value)
                    roll_value = roll_die(sides)
                g_rolls.append(roll_value)
            else:
                g_rolls.append(roll_value)

        # 保留/丢弃操作（每组独立）
        kept = list(g_rolls)
        if g['keep_highest'] is not None:
            kept = sorted(g_rolls, reverse=True)[:g['keep_highest']]
        elif g['drop_lowest'] is not None:
            kept = sorted(g_rolls, reverse=True)[:len(g_rolls) - g['drop_lowest']]
        elif g['drop_highest'] is not None:
            kept = sorted(g_rolls)[:len(g_rolls) - g['drop_highest']]

        # 优势/劣势（任意面数均支持：投2取高或取低，仅第一组）
        if advantage is not None and idx == 0:
            kept = [max(g_rolls) if advantage else min(g_rolls)]

        group_rolls.append(g_rolls)
        rolls.extend(g_rolls)
        kept_rolls.extend(kept)

    # 计算最终结果
    total = sum(kept_rolls) + modifier
    if total < 0:
        total = 0  # DND 中伤害不能为负

    # 暴击判定 (仅d20)：任一组 d20 满足即算
    is_crit_success = False
    is_crit_failure = False
    for idx, g in enumerate(groups):
        if g['sides'] != 20:
            continue
        vals = group_rolls[idx]
        if advantage is True:
            # 优势：取最高值，检查该值是否为20
            final_val = max(vals)
            if final_val == 20:
                is_crit_success = True
            if final_val == 1:
                is_crit_failure = True
        elif advantage is False:
            # 劣势：取最低值，检查该值是否为1
            final_val = min(vals)
            if final_val == 1:
                is_crit_failure = True
            if final_val == 20:
                is_crit_success = True
        else:
            if 20 in vals:
                is_crit_success = True
            if 1 in vals:
                is_crit_failure = True

    return DiceResult(
        expression=expression,
        rolls=rolls,
        kept_rolls=kept_rolls if len(kept_rolls) < len(rolls) else None,
        modifier=modifier,
        total=total,
        advantage=advantage,
        is_crit_success=is_crit_success,
        is_crit_failure=is_crit_failure,
        groups_detail=[{'sides': g['sides'], 'rolls': gr}
                       for g, gr in zip(groups, group_rolls)],
    )


def roll_ability_check(ability_mod: int, proficiency_bonus: int = 0,
                       advantage: bool | None = None) -> DiceResult:
    """DND 属性检定: d20 + 属性调整值 + 熟练加值"""
    if advantage is True:
        expr = "d20 优势"
    elif advantage is False:
        expr = "d20 劣势"
    else:
        expr = "d20"

    total_mod = ability_mod + proficiency_bonus
    expr += f"+{total_mod}" if total_mod >= 0 else f"{total_mod}"

    return roll(expr)


def roll_attack(attack_bonus: int, advantage: bool | None = None) -> DiceResult:
    """攻击检定: d20 + 攻击加值"""
    if advantage is True:
        expr = "d20 优势"
    elif advantage is False:
        expr = "d20 劣势"
    else:
        expr = "d20"

    expr += f"+{attack_bonus}" if attack_bonus >= 0 else f"{attack_bonus}"

    return roll(expr)


def roll_damage(dice_count: int, dice_sides: int, modifier: int = 0,
                is_crit: bool = False) -> DiceResult:
    """伤害投掷（暴击时骰子翻倍）"""
    if is_crit:
        dice_count *= 2

    expr = f"{dice_count}d{dice_sides}"
    if modifier > 0:
        expr += f"+{modifier}"
    elif modifier < 0:
        expr += f"{modifier}"

    return roll(expr)


def roll_initiative(dex_mod: int, bonus: int = 0,
                    advantage: bool | None = None) -> DiceResult:
    """先攻检定: d20 + 敏捷调整值 + 其他加值"""
    total_mod = dex_mod + bonus
    if advantage is True:
        expr = "d20 优势"
    elif advantage is False:
        expr = "d20 劣势"
    else:
        expr = "d20"

    expr += f"+{total_mod}" if total_mod >= 0 else f"{total_mod}"

    return roll(expr)


def roll_death_save(modifier: int = 0) -> DiceResult:
    """死亡豁免: 无熟练加值的 d20，DC=10"""
    expr = f"d20+{modifier}" if modifier != 0 else "d20"
    result = roll(expr)

    # 死亡豁免特殊规则: nat1 算两次失败, nat20 恢复1HP
    return result


def generate_ability_scores(method: str = "4d6k3") -> list[int]:
    """生成属性值

    Args:
        method: 生成方式
            "4d6k3" - 标准: 4d6取最高的3个
            "3d6"   - 经典: 直接3d6
            "point_buy" - 购点法 (返回示例数组)
    """
    if method == "4d6k3":
        scores = []
        for _ in range(6):
            result = roll("4d6k3")
            scores.append(result.total)
        return sorted(scores, reverse=True)
    elif method == "3d6":
        scores = []
        for _ in range(6):
            result = roll("3d6")
            scores.append(result.total)
        return sorted(scores, reverse=True)
    else:
        # 标准数组
        return [15, 14, 13, 12, 10, 8]
