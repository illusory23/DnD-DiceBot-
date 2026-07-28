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


def roll_die(sides: int) -> int:
    """投掷单个骰子"""
    return random.randint(1, sides)


def parse_dice_expression(expr: str) -> dict:
    """解析骰子表达式

    Returns:
        dict with keys: count, sides, modifier, keep_highest, drop_lowest,
                        drop_highest, advantage, exploding
    """
    result = {
        'count': 1,
        'sides': 20,
        'modifier': 0,
        'keep_highest': None,
        'drop_lowest': None,
        'drop_highest': None,
        'advantage': None,  # True/False/None
        'exploding': False,
    }

    expr = expr.strip().lower()

    # 检测优势/劣势
    if '优势' in expr or ' adv' in expr or 'adv ' in expr or expr.endswith('adv') or expr.startswith('adv '):
        result['advantage'] = True
        expr = expr.replace('优势', '').replace('adv', '').strip()
    elif '劣势' in expr or ' dis' in expr or 'dis ' in expr or expr.endswith('dis') or expr.startswith('dis '):
        result['advantage'] = False
        expr = expr.replace('劣势', '').replace('dis', '').strip()

    # 检测爆炸骰
    if '!' in expr:
        result['exploding'] = True
        expr = expr.replace('!', '')

    # 如果表达式只是一个数字，视为调整值
    if expr.isdigit() or (expr.startswith('-') and expr[1:].isdigit()):
        result['modifier'] = int(expr)
        return result

    if expr.startswith('+') and expr[1:].isdigit():
        result['modifier'] = int(expr[1:])
        return result

    # 解析 dX 部分
    d_match = re.match(r'(?:(\d+)d(\d+))', expr)
    if not d_match:
        # 可能只是 "d20" 形式
        d_match = re.match(r'd(\d+)', expr)
        if d_match:
            result['count'] = 1
            result['sides'] = int(d_match.group(1))
        else:
            raise ValueError(f"无法解析表达式: {expr}")
    else:
        result['count'] = int(d_match.group(1))
        result['sides'] = int(d_match.group(2))

    # 解析 k/d 操作 (如 4d6k3, 4d6d1, 4d6dl1, 4d6dh1)
    rest = expr[d_match.end():]

    # keep highest: k3
    k_match = re.search(r'k(\d+)', rest)
    if k_match:
        result['keep_highest'] = int(k_match.group(1))
        rest = rest[:k_match.start()] + rest[k_match.end():]

    # drop lowest: d1 或 dl1
    dl_match = re.search(r'dl?(\d+)', rest)
    if dl_match and 'dh' not in rest:
        result['drop_lowest'] = int(dl_match.group(1))
        rest = rest[:dl_match.start()] + rest[dl_match.end():]
    elif result.get('drop_lowest') is None:
        # 纯数字后缀也可能是 drop lowest
        dl_alt = re.search(r'd(\d+)', rest)
        if dl_alt and not k_match:
            result['drop_lowest'] = int(dl_alt.group(1))
            rest = rest[:dl_alt.start()] + rest[dl_alt.end():]

    # drop highest: dh1
    dh_match = re.search(r'dh(\d+)', rest)
    if dh_match:
        result['drop_highest'] = int(dh_match.group(1))
        rest = rest[:dh_match.start()] + rest[dh_match.end():]

    # 解析调整值 +Z 或 -Z
    mod_match = re.search(r'([+-]\d+)', rest)
    if mod_match:
        result['modifier'] = int(mod_match.group(1))
    elif rest.strip() and rest.strip().isdigit():
        result['modifier'] = int(rest.strip())

    # 优势/劣势：投两个骰子取高/取低（任意面数均支持）
    if result['advantage'] is not None:
        result['count'] = 2  # 投两个骰子

    return result


def roll(expression: str) -> DiceResult:
    """执行掷骰

    Examples:
        >>> roll("3d6")
        >>> roll("1d20+5")
        >>> roll("4d6k3")
        >>> roll("d20 adv")
        >>> roll("1d6!")
    """
    parsed = parse_dice_expression(expression)

    count = parsed['count']
    sides = parsed['sides']
    modifier = parsed['modifier']
    keep_highest = parsed['keep_highest']
    drop_lowest = parsed['drop_lowest']
    drop_highest = parsed['drop_highest']
    advantage = parsed['advantage']
    exploding = parsed['exploding']

    # 投掷骰子
    rolls = []
    for _ in range(count):
        roll_value = roll_die(sides)

        # 爆炸骰
        if exploding and roll_value == sides:
            while roll_value == sides:
                rolls.append(roll_value)
                roll_value = roll_die(sides)
            rolls.append(roll_value)
        else:
            rolls.append(roll_value)

    # 保留/丢弃操作
    kept_rolls = list(rolls)

    if keep_highest is not None:
        kept_rolls = sorted(rolls, reverse=True)[:keep_highest]
    elif drop_lowest is not None:
        kept_rolls = sorted(rolls, reverse=True)[:len(rolls) - drop_lowest]
    elif drop_highest is not None:
        kept_rolls = sorted(rolls)[:len(rolls) - drop_highest]

    # 优势/劣势（任意面数均支持：投2取高或取低）
    final_roll = None
    if advantage is not None:
        if advantage:
            final_roll = max(kept_rolls)
        else:
            final_roll = min(kept_rolls)
        kept_rolls_for_total = [final_roll]
    else:
        kept_rolls_for_total = kept_rolls

    # 计算最终结果
    base_total = sum(kept_rolls_for_total)
    total = base_total + modifier
    if total < 0:
        total = 0  # DND 中伤害不能为负

    # 暴击判定 (仅d20)
    is_crit_success = False
    is_crit_failure = False
    if sides == 20:
        if advantage is True:
            # 优势：取最高值，检查该值是否为20
            final_val = max(rolls)
            if final_val == 20:
                is_crit_success = True
            if final_val == 1:
                is_crit_failure = True
        elif advantage is False:
            # 劣势：取最低值，检查该值是否为1
            final_val = min(rolls)
            if final_val == 1:
                is_crit_failure = True
            if final_val == 20:
                is_crit_success = True
        else:
            if 20 in rolls:
                is_crit_success = True
            if 1 in rolls:
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
