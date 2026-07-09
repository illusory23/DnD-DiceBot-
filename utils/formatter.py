"""输出格式化 — 模拟 Discord/聊天风格的骰子结果输出"""


def bold(text: str) -> str:
    """粗体 (终端用 ANSI)"""
    return f"\033[1m{text}\033[0m"


def italic(text: str) -> str:
    """斜体"""
    return f"\033[3m{text}\033[0m"


def color_red(text: str) -> str:
    return f"\033[31m{text}\033[0m"


def color_green(text: str) -> str:
    return f"\033[32m{text}\033[0m"


def color_yellow(text: str) -> str:
    return f"\033[33m{text}\033[0m"


def color_blue(text: str) -> str:
    return f"\033[34m{text}\033[0m"


def color_cyan(text: str) -> str:
    return f"\033[36m{text}\033[0m"


def format_dice_result(expression: str, rolls: list[int], total: int,
                       modifier: int = 0, advantage: bool | None = None,
                       is_crit: str | None = None) -> str:
    """格式化掷骰结果

    Args:
        expression: 原始表达式
        rolls: 每次掷骰的结果
        total: 最终结果（含调整值）
        modifier: 调整值
        advantage: True=优势, False=劣势, None=普通
        is_crit: 'success'=大成功, 'failure'=大失败, None=普通
    """
    parts = []

    # 标题
    if advantage is True:
        parts.append(bold(f"🎲 {expression} (优势)"))
    elif advantage is False:
        parts.append(bold(f"🎲 {expression} (劣势)"))
    else:
        parts.append(bold(f"🎲 {expression}"))

    # 掷骰详情
    if advantage is not None and len(rolls) >= 2:
        if advantage:
            parts.append(f"   投掷: [{', '.join(map(str, rolls))}] → 取最高 {max(rolls)}")
        else:
            parts.append(f"   投掷: [{', '.join(map(str, rolls))}] → 取最低 {min(rolls)}")
    elif len(rolls) > 1:
        parts.append(f"   投掷: [{', '.join(map(str, rolls))}]")
    elif len(rolls) == 1:
        parts.append(f"   投掷: {rolls[0]}")

    # 调整值
    if modifier > 0:
        parts.append(f"   调整值: +{modifier}")
    elif modifier < 0:
        parts.append(f"   调整值: {modifier}")

    # 暴击
    if is_crit == 'success':
        parts.append(f"   {color_green('✨ 大成功！(Natural 20)')}")
    elif is_crit == 'failure':
        parts.append(f"   {color_red('💀 大失败！(Natural 1)')}")

    # 总计
    parts.append(f"   {bold('结果')}: {bold(str(total))}")

    return "\n".join(parts)


def format_check_result(ability_or_skill: str, d20_roll: int, modifier: int,
                        total: int, advantage: bool | None = None,
                        proficiency_bonus: int = 0, ability_mod: int = 0) -> str:
    """格式化属性/技能检定结果"""
    parts = [bold(f"🎯 {ability_or_skill} 检定")]

    if advantage is True:
        parts[-1] = bold(f"🎯 {ability_or_skill} 检定 (优势)")
    elif advantage is False:
        parts[-1] = bold(f"🎯 {ability_or_skill} 检定 (劣势)")

    parts.append(f"   d20: {d20_roll}")

    if ability_mod != 0:
        parts.append(f"   属性调整值: {'+' if ability_mod >= 0 else ''}{ability_mod}")
    if proficiency_bonus > 0:
        parts.append(f"   熟练加值: +{proficiency_bonus}")
    if modifier != ability_mod + proficiency_bonus:
        parts.append(f"   总调整值: {'+' if modifier >= 0 else ''}{modifier}")

    parts.append(f"   {bold('检定结果')}: {color_cyan(str(total))}")

    if d20_roll == 20:
        parts.append(f"   {color_green('✨ 大成功！(Natural 20)')}")
    elif d20_roll == 1:
        parts.append(f"   {color_red('💀 大失败！(Natural 1)')}")

    return "\n".join(parts)


def format_attack_result(weapon: str, target: str | None, d20_roll: int,
                         attack_bonus: int, attack_total: int, ac_hit: int | None,
                         damage_rolls: list[int], damage_total: int,
                         is_crit: bool, advantage: bool | None = None) -> str:
    """格式化攻击结果"""
    parts = [bold(f"⚔️ 攻击: {weapon}")]
    if target:
        parts[-1] += f" → {target}"
    if advantage is True:
        parts[-1] += " (优势)"
    elif advantage is False:
        parts[-1] += " (劣势)"

    parts.append(f"   攻击检定: d20({d20_roll}) + {attack_bonus - (0 if d20_roll != 20 else 0)} = {color_cyan(str(attack_total))}")

    if is_crit:
        parts.append(f"   {color_green('💥 暴击！伤害骰翻倍！')}")

    if ac_hit:
        if attack_total >= ac_hit:
            parts.append(f"   {color_green(f'命中！(vs AC {ac_hit})')}")
        else:
            parts.append(f"   {color_red(f'未命中 (vs AC {ac_hit})')}")

    parts.append(f"   伤害: [{', '.join(map(str, damage_rolls))}] = {color_red(str(damage_total))}")

    return "\n".join(parts)


def format_death_save(roll: int, modifier: int, total: int, successes: int,
                      failures: int, is_stable: bool = False) -> str:
    """格式化死亡豁免结果"""
    parts = [bold("💀 死亡豁免")]
    parts.append(f"   投掷: d20({roll}) + {modifier} = {total}")

    if total >= 10:
        parts.append(f"   {color_green('成功！')}")
    else:
        parts.append(f"   {color_red('失败...')}")

    # 死亡豁免标记
    success_marks = "❤️" * successes + "🖤" * (3 - successes)
    failure_marks = "💀" * failures + "🖤" * (3 - failures)
    parts.append(f"   成功: {success_marks} ({successes}/3)")
    parts.append(f"   失败: {failure_marks} ({failures}/3)")

    if successes >= 3:
        parts.append(f"   {color_green('稳定！角色处于稳定状态。')}")
    elif failures >= 3:
        parts.append(f"   {color_red('角色死亡...')}")
    elif is_stable:
        parts.append(f"   {color_yellow('角色处于稳定状态。')}")

    return "\n".join(parts)


def format_spell_slots(slots: dict) -> str:
    """格式化法术位状态"""
    parts = [bold("✨ 法术位")]

    slot_order = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    has_slots = False

    for level in slot_order:
        if level in slots:
            has_slots = True
            info = slots[level]
            used = info.get('used', 0)
            max_slots = info.get('max', 0)
            bar = "█" * (max_slots - used) + "░" * used
            parts.append(f"   {level}环 [{max_slots - used}/{max_slots}] {bar}")

    if not has_slots:
        parts.append("   尚未设定法术位，使用 .ss init 设定")

    return "\n".join(parts)


def format_character_sheet(data: dict, detail: bool = False) -> str:
    """格式化角色卡

    Args:
        data: 角色数据字典
        detail: 是否显示详细信息（装备、法术、背景等）
    """
    name = data.get('name', '未命名')
    level = data.get('level', 1)
    cls = data.get('class', '未知')
    race = data.get('race', '未知')
    alignment = data.get('alignment', '')
    faith = data.get('faith', '')

    title = f"📜 {name} — {level}级 {cls} ({race})"
    if alignment:
        title += f" | {alignment}"
    parts = [bold(title)]

    # 基本信息行
    info_parts = []
    if data.get('player'):
        info_parts.append(f"玩家: {data['player']}")
    if data.get('gender'):
        info_parts.append(f"性别: {data['gender']}")
    if data.get('age'):
        info_parts.append(f"年龄: {data['age']}")
    if faith:
        info_parts.append(f"信仰: {faith}")
    if info_parts:
        parts.append(f"   📋 {' | '.join(info_parts)}")

    # HP & AC & 战斗
    hp_cur = data.get('hp_current', 0)
    hp_max = data.get('hp_max', 0)
    temp_hp = data.get('temp_hp', 0)
    ac = data.get('ac', 10)
    speed = data.get('speed', 30)
    init_bonus = data.get('initiative_bonus', 0)

    hp_pct = min(20, int(hp_cur / max(hp_max, 1) * 20))
    hp_bar = "█" * hp_pct + "░" * (20 - hp_pct)
    combat_line = f"   ❤️ HP: [{hp_cur}/{hp_max}] {hp_bar}"
    if temp_hp:
        combat_line += f" (临时: {temp_hp})"
    combat_line += f"\n   🛡️ AC: {ac} | ⚡ 先攻: {init_bonus:+d} | 🏃 速度: {speed}ft"
    parts.append(combat_line)

    # HD & 被动感知
    hd = data.get('hit_dice', '1d8')
    hd_count = data.get('hd_count', 1)
    passive_per = data.get('passive_perception', 10)
    # 正确格式化HD: "1d10" + count=2 → "2d10"
    hd_clean = hd.replace('1d', 'd') if hd.startswith('1d') else hd
    if hd_count > 1:
        hd_display = f"{hd_count}{hd_clean}"
    else:
        hd_display = hd
    parts.append(f"   🎲 HD: {hd_display} | 👁 被动察觉: {passive_per}")

    # 属性
    abilities = data.get('abilities', {})
    if abilities:
        abbr = {'str': '力量', 'dex': '敏捷', 'con': '体质',
                'int': '智力', 'wis': '感知', 'cha': '魅力'}
        ability_parts = []
        for key, label in abbr.items():
            score = abilities.get(key, 10)
            mod_val = (score - 10) // 2
            mod_str = f"+{mod_val}" if mod_val >= 0 else str(mod_val)
            ability_parts.append(f"{label}: {score}({mod_str})")
        parts.append(f"   📊 {' | '.join(ability_parts)}")

    # 熟练
    prof = data.get('proficiency_bonus', 2)
    parts.append(f"   ⭐ 熟练加值: +{prof}")

    # 技能（含加值）
    skill_profs = data.get('skill_proficiencies', {})
    save_profs = data.get('save_proficiencies', {})
    if skill_profs:
        prof_skills = []
        all_skills = []
        for skill_name, levels in skill_profs.items():
            bonus = levels.get('bonus', 0)
            if levels.get('is_proficient'):
                mark = '**' if levels.get('is_expertise') else '*'
                prof_skills.append(f"{skill_name}{mark}({bonus:+d})")
            else:
                all_skills.append(f"{skill_name}({bonus:+d})")
        if prof_skills:
            parts.append(f"   🎯 熟练技能: {', '.join(prof_skills[:10])}" +
                       (f"... 等{len(prof_skills)}项" if len(prof_skills) > 10 else ""))
        # 显示所有技能加值（详细模式）
        if detail and all_skills:
            parts.append(f"   📋 其他技能: {', '.join(all_skills[:6])}" +
                       (f"... 等{len(all_skills)}项" if len(all_skills) > 6 else ""))

    if save_profs:
        prof_saves = []
        for ability, levels in save_profs.items():
            if levels.get('is_proficient'):
                prof_saves.append(ability)
        if prof_saves:
            parts.append(f"   🛡️ 熟练豁免: {', '.join(prof_saves)}")

    # 施法信息
    spell_ability = data.get('spellcasting_ability', '')
    spell_dc = data.get('spell_save_dc', 0)
    if spell_ability:
        parts.append(f"   ✨ 施法属性: {spell_ability} | 法术DC: {spell_dc}")

    # ━━━ 详细信息 ━━━
    if detail:
        # 头像
        portrait_path = data.get('portrait_path', '')
        if portrait_path:
            parts.append(f"   🖼 头像: {portrait_path}")

        # 源文件
        source_file = data.get('source_file', '')
        if source_file:
            parts.append(f"   📁 角色卡文件: {source_file}")

        # 武器
        weapons = data.get('weapons', [])
        if weapons:
            parts.append(f"   ═══ ⚔️ 武器 ═══")
            for w in weapons:
                wp_name = w.get('name', '?')
                wp_ab = w.get('attack_bonus', 0)
                wp_dmg = w.get('damage_dice', '?')
                wp_type = w.get('damage_type', '')
                prof_mark = '✓' if w.get('is_proficient') else '✗'
                wp_desc = w.get('description', '')
                wp_effect = w.get('effect', '')
                parts.append(f"      {wp_name} | 命中: +{wp_ab} | 伤害: {wp_dmg} {wp_type} | 熟练: {prof_mark}")
                if wp_desc:
                    parts.append(f"         描述: {wp_desc}")
                if wp_effect:
                    parts.append(f"         效果: {wp_effect}")

        # 护甲
        armor = data.get('armor', {})
        if armor and (armor.get('armor_name') or armor.get('shield_name')):
            parts.append(f"   ═══ 🛡️ 护甲 ═══")
            if armor.get('armor_name'):
                parts.append(f"      护甲: {armor['armor_name']} (AC: {armor.get('armor_ac', '?')})")
            if armor.get('shield_name'):
                parts.append(f"      盾牌: {armor['shield_name']} (AC: {armor.get('shield_ac', '?')})")

        # 钱币
        coins = data.get('coins', {})
        if coins:
            coin_strs = []
            coin_labels = {'cp': '铜币', 'sp': '银币', 'ep': '金银币', 'gp': '金币', 'pp': '白金币'}
            for key, label in coin_labels.items():
                val = coins.get(key, 0)
                if val:
                    coin_strs.append(f"{label}: {val}")
            if coin_strs:
                parts.append(f"   ═══ 💰 钱币 ═══")
                parts.append(f"      {', '.join(coin_strs)}")

        # 已准备法术
        prepared = data.get('prepared_spells', [])
        if prepared:
            parts.append(f"   ═══ 📖 已准备法术 ({len(prepared)}) ═══")
            spell_names = [s.get('spell_name', s.get('name', '?')) for s in prepared]
            for i, sn in enumerate(spell_names):
                if i % 3 == 0:
                    if i > 0:
                        parts.append("")
                    parts.append(f"      {sn}")
                else:
                    parts[-1] += f" | {sn}"

        # 法术位
        slots = data.get('spell_slots', {})
        if slots:
            has_any = any(s.get('max', 0) > 0 for s in slots.values())
            if has_any:
                slot_parts = []
                for lv in ['1','2','3','4','5','6','7','8','9']:
                    if lv in slots and slots[lv].get('max', 0) > 0:
                        s = slots[lv]
                        used = s.get('used', 0)
                        max_s = s.get('max', 0)
                        remain = max_s - used
                        slot_parts.append(f"{lv}环: {remain}/{max_s}")
                if slot_parts:
                    parts.append(f"   ═══ ✨ 法术位 ═══")
                    parts.append(f"      {' | '.join(slot_parts)}")

        # 背景（完整展示）
        bg = data.get('background', {})
        if bg:
            has_bg = False
            bg_lines = []
            for key, label in [
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
            ]:
                val = bg.get(key, '')
                if val:
                    has_bg = True
                    # 处理多行值（如语言、工具等用换行分隔的字段）
                    if '\n' in val:
                        first_line, *rest_lines = val.split('\n')
                        bg_lines.append(f"      {label}: {first_line}")
                        for rl in rest_lines:
                            bg_lines.append(f"            {rl}")
                    else:
                        bg_lines.append(f"      {label}: {val}")

            if has_bg:
                parts.append(f"   ═══ 📝 背景 ═══")
                parts.extend(bg_lines)

            if bg.get('backstory'):
                backstory = bg['backstory']
                parts.append(f"      ═══ 背景故事 ═══")
                parts.append(f"      {backstory}")

        # 物品
        inv = data.get('inventory', [])
        if inv:
            parts.append(f"   ═══ 🎒 物品 ({len(inv)}) ═══")
            for item in inv:
                qty = item.get('quantity', 1)
                item_name = item.get('item_name', '?')
                loc = item.get('location', '')
                desc = item.get('description', '')
                effect = item.get('effect', '')
                loc_str = f" [{loc}]" if loc else ""
                line = f"      {item_name}"
                if qty > 1:
                    line += f" x{qty}"
                line += loc_str
                parts.append(line)
                if desc:
                    parts.append(f"         描述: {desc}")
                if effect:
                    parts.append(f"         效果: {effect}")

    return "\n".join(parts)


def format_initiative_list(combatants: list[dict]) -> str:
    """格式化先攻列表"""
    if not combatants:
        return "先攻列表为空"

    parts = [bold("⚔️ 先攻顺序")]

    for i, c in enumerate(combatants, 1):
        name = c['name']
        initiative = c['initiative']
        hp = c.get('hp', '?')
        hp_max = c.get('hp_max', '?')
        ac = c.get('ac', '?')
        current_marker = " ◀ 当前" if c.get('is_current') else ""

        parts.append(
            f"   {i}. {bold(name)} | 先攻: {initiative} | "
            f"HP: {hp}/{hp_max} | AC: {ac}{current_marker}"
        )

    return "\n".join(parts)


def format_spell_info(spell: dict) -> str:
    """格式化单个法术信息"""
    parts = [
        bold(f"📖 {spell['name']}"),
        f"   {spell.get('level', '戏法')} · {spell.get('school', '未知学派')}",
        f"   ⏱ 施法时间: {spell.get('casting_time', '—')}",
        f"   📏 距离: {spell.get('range', '—')}",
        f"   🧪 成分: {spell.get('components', '—')}",
        f"   ⏳ 持续时间: {spell.get('duration', '—')}",
        f"",
        f"   {spell.get('description', '无描述')}",
    ]

    if spell.get('higher_level'):
        parts.append(f"")
        parts.append(f"   {bold('高环效果:')} {spell['higher_level']}")

    return "\n".join(parts)


def format_monster_info(monster: dict) -> str:
    """格式化单个怪物信息"""
    parts = [
        bold(f"👹 {monster['name']}"),
        f"   挑战等级: {monster.get('cr', '—')}",
        f"   ❤️ HP: {monster.get('hp', '—')}",
        f"   🛡️ AC: {monster.get('ac', '—')}",
        f"   🏃 速度: {monster.get('speed', '—')}",
    ]

    abilities = monster.get('abilities', {})
    if abilities:
        abbr = {'str': '力量', 'dex': '敏捷', 'con': '体质',
                'int': '智力', 'wis': '感知', 'cha': '魅力'}
        ability_parts = []
        for key, label in abbr.items():
            score = abilities.get(key, 10)
            mod_val = (score - 10) // 2
            mod_str = f"+{mod_val}" if mod_val >= 0 else str(mod_val)
            ability_parts.append(f"{label}: {score}({mod_str})")
        parts.append(f"   📊 {', '.join(ability_parts)}")

    if monster.get('traits'):
        parts.append(f"   🔧 特性: {', '.join(monster['traits'][:3])}")

    if monster.get('actions'):
        parts.append(f"   ⚔️ 动作: {', '.join(monster['actions'][:3])}")

    return "\n".join(parts)


def format_wealth(coins: dict) -> str:
    """格式化钱币显示"""
    if not coins:
        return "💰 暂无钱币记录"

    coin_labels = {'cp': ('铜币 CP', 1), 'sp': ('银币 SP', 10),
                   'ep': ('金银币 EP', 50), 'gp': ('金币 GP', 100),
                   'pp': ('白金币 PP', 1000)}

    parts = [bold("💰 钱币")]
    total_gp = 0

    for key, (label, gp_value) in coin_labels.items():
        val = coins.get(key, 0)
        if val is not None and val > 0:
            parts.append(f"   {label}: {val}")
            total_gp += val * gp_value

    if total_gp > 0:
        parts.append(f"   ──────────────")
        parts.append(f"   💎 总价值约: {total_gp} GP ({total_gp / 100:.1f} 金币)")

    return "\n".join(parts)


def format_weapons(weapons: list[dict]) -> str:
    """格式化武器列表（含描述与效果）"""
    if not weapons:
        return "暂无装备武器"

    parts = [bold("⚔️ 武器列表")]
    for w in weapons:
        wid = w.get('id', '?')
        name = w.get('name', '?')
        atk = w.get('attack_bonus', 0)
        dmg = w.get('damage_dice', '?')
        dmg_type = w.get('damage_type', '')
        prof = '✓' if w.get('is_proficient') else '✗'
        ammo = w.get('ammo', '')
        ammo_str = f" | 弹药: {ammo}" if ammo else ''
        desc = w.get('description', '')
        effect = w.get('effect', '')

        line = f"   [{wid}] {name} | 命中: {atk:+d} | 伤害: {dmg} {dmg_type} | 熟练: {prof}{ammo_str}"
        parts.append(line)
        if desc:
            parts.append(f"      描述: {desc}")
        if effect:
            parts.append(f"      效果: {effect}")

    return "\n".join(parts)
