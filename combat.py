"""DND5E 战斗追踪器

管理先攻列表、回合推进、HP追踪。
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Combatant:
    """战斗参与者"""
    name: str
    initiative: int = 0
    hp: int = 0
    hp_max: int = 0
    ac: int = 10
    is_current: bool = False
    conditions: list[str] = field(default_factory=list)
    notes: str = ''


class CombatTracker:
    """战斗追踪器"""

    def __init__(self):
        self.combatants: list[Combatant] = []
        self.round: int = 0
        self.current_index: int = -1
        self.is_active: bool = False

    def add_combatant(self, name: str, initiative: int = 0,
                      hp: int = 0, hp_max: int = 0, ac: int = 10) -> Combatant:
        """添加战斗参与者"""
        c = Combatant(
            name=name,
            initiative=initiative,
            hp=hp,
            hp_max=hp_max,
            ac=ac,
        )
        self.combatants.append(c)
        return c

    def remove_combatant(self, name: str) -> bool:
        """移除战斗参与者"""
        for i, c in enumerate(self.combatants):
            if c.name.lower() == name.lower():
                self.combatants.pop(i)
                if i <= self.current_index and self.current_index >= 0:
                    self.current_index -= 1
                return True
        return False

    def start_combat(self) -> None:
        """开始战斗，按先攻排序"""
        self.combatants.sort(key=lambda x: x.initiative, reverse=True)
        self.round = 1
        self.current_index = 0
        self.is_active = True

        if self.combatants:
            self.combatants[0].is_current = True

    def next_turn(self) -> Combatant | None:
        """推进到下一回合"""
        if not self.combatants:
            return None

        # 取消当前标记
        if self.current_index >= 0 and self.current_index < len(self.combatants):
            self.combatants[self.current_index].is_current = False

        # 推进
        self.current_index += 1

        # 检查是否到下一轮
        if self.current_index >= len(self.combatants):
            self.current_index = 0
            self.round += 1

        # 标记当前
        if self.combatants:
            self.combatants[self.current_index].is_current = True
            return self.combatants[self.current_index]

        return None

    def get_current(self) -> Combatant | None:
        """获取当前行动者"""
        if self.current_index >= 0 and self.current_index < len(self.combatants):
            return self.combatants[self.current_index]
        return None

    def set_hp(self, name: str, hp: int) -> bool:
        """设置某角色当前HP"""
        for c in self.combatants:
            if c.name.lower() == name.lower():
                c.hp = max(0, min(c.hp_max, hp)) if c.hp_max > 0 else hp
                return True
        return False

    def adjust_hp(self, name: str, amount: int) -> int | None:
        """调整某角色HP，返回新HP"""
        for c in self.combatants:
            if c.name.lower() == name.lower():
                c.hp = max(0, min(c.hp_max, c.hp + amount)) if c.hp_max > 0 else c.hp + amount
                return c.hp
        return None

    def add_condition(self, name: str, condition: str) -> bool:
        """添加状态"""
        for c in self.combatants:
            if c.name.lower() == name.lower():
                if condition not in c.conditions:
                    c.conditions.append(condition)
                return True
        return False

    def remove_condition(self, name: str, condition: str) -> bool:
        """移除状态"""
        for c in self.combatants:
            if c.name.lower() == name.lower():
                if condition in c.conditions:
                    c.conditions.remove(condition)
                return True
        return False

    def get_list(self) -> list[Combatant]:
        """获取先攻列表"""
        return list(self.combatants)

    def get_summary(self) -> dict:
        """获取战斗摘要"""
        return {
            'round': self.round,
            'current': self.get_current().name if self.get_current() else None,
            'total_combatants': len(self.combatants),
            'is_active': self.is_active,
        }

    def clear(self) -> None:
        """清空战斗"""
        self.combatants.clear()
        self.round = 0
        self.current_index = -1
        self.is_active = False


# 全局战斗追踪器实例
_tracker: CombatTracker | None = None


def get_tracker() -> CombatTracker:
    """获取全局战斗追踪器"""
    global _tracker
    if _tracker is None:
        _tracker = CombatTracker()
    return _tracker


def reset_tracker() -> CombatTracker:
    """重置战斗追踪器"""
    global _tracker
    _tracker = CombatTracker()
    return _tracker
