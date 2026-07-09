"""JSON 数据加载器"""

import json
import os
from pathlib import Path

# 数据目录
DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename: str) -> dict:
    """加载 JSON 文件"""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        return {}
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(filename: str, data: dict) -> None:
    """保存 JSON 文件"""
    filepath = DATA_DIR / filename
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_skills() -> dict:
    """加载技能-属性映射"""
    return load_json("skills.json")


def load_conditions() -> dict:
    """加载状态列表"""
    return load_json("conditions.json")


def load_spells() -> list[dict]:
    """加载法术列表"""
    return load_json("srd_spells.json").get("spells", [])


def load_monsters() -> list[dict]:
    """加载怪物列表"""
    return load_json("srd_monsters.json").get("monsters", [])


def search_spell(query: str) -> dict | None:
    """搜索法术（模糊匹配）"""
    spells = load_spells()
    query_lower = query.lower()

    for spell in spells:
        if query_lower in spell.get('name', '').lower():
            return spell

    # 英文名模糊匹配
    for spell in spells:
        if query_lower in spell.get('name_en', '').lower():
            return spell

    return None


def search_monster(query: str) -> dict | None:
    """搜索怪物（模糊匹配）"""
    monsters = load_monsters()
    query_lower = query.lower()

    for monster in monsters:
        if query_lower in monster.get('name', '').lower():
            return monster
        if query_lower in monster.get('name_en', '').lower():
            return monster

    return None
