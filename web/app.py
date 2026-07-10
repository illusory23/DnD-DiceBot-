"""DND5E 骰娘 — Flask Web UI"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import os as _os
import io as _io
import builtins
import re as _re
from pathlib import Path as _Path

from flask import Flask, render_template, request, jsonify, send_file, abort
from core.dice_engine import roll, generate_ability_scores, roll_ability_check
from core.dnd5e_rules import (
    ability_modifier, get_ability_for_skill, normalize_ability,
    normalize_skill, ABILITY_ORDER, SKILL_TO_ABILITY,
    proficiency_bonus, get_spell_slots_for_level,
)
from core.character import (
    create_character, get_character, list_characters,
    set_ability, adjust_hp, init_spell_slots, use_spell_slot,
    long_rest, set_skill_proficiency, set_save_proficiency,
    update_character, delete_character, death_save,
    resolve_portrait_path,
)
from utils.data_loader import search_spell, search_monster, load_conditions
from core.chm_search import (
    search_spell as chm_search_spell,
    search_monster as chm_search_monster,
    search_all as chm_search_all,
    get_monster_detail as chm_get_monster_detail,
    get_spell_detail as chm_get_spell_detail,
)
from utils.formatter import (
    format_dice_result, format_character_sheet, format_spell_slots,
    format_initiative_list, format_spell_info, format_monster_info,
    bold, color_red, color_green, color_cyan, color_yellow,
)
from utils.excel_importer import import_character_from_excel, import_and_print_summary
from core.character import import_from_excel_data

# ━━━ 导入随机事件表命令函数 ━━━
import dnd_bot as _bot

# 事件命令映射: 命令名 → (标签, 骰子, 命令函数)
_EVENT_COMMANDS = {
    'qsj100': ('全随机事件', 'd100', _bot.cmd_qsj100),
    'zy100':  ('随机遭遇事件', 'd100', _bot.cmd_zy100),
    'ts100':  ('随机探索事件', 'd100', _bot.cmd_ts100),
    'dc100':  ('随机调查事件', 'd100', _bot.cmd_dc100),
    'hj6':    ('随机环境', 'd6', _bot.cmd_hj6),
    'sj6':    ('随机特殊事件', 'd6', _bot.cmd_sj6),
    'rl100':  ('随机人类', 'd100', _bot.cmd_rl100),
    'ys10':   ('随机野兽', 'd10', _bot.cmd_ys10),
    'zl12':   ('随机非敌对生物', 'd12', _bot.cmd_zl12),
    'sw100':  ('随机特殊生物', 'd100', _bot.cmd_sw100),
    'cl50':   ('随机材料', 'd50', _bot.cmd_cl50),
    'cl100':  ('随机特殊材料', 'd100', _bot.cmd_cl100),
    'kw100':  ('随机矿物', 'd100', _bot.cmd_kw100),
    'fx100':  ('随机特殊发现', 'd100', _bot.cmd_fx100),
    'yj8':    ('随机遗迹', 'd8', _bot.cmd_yj8),
    'wp':     ('物品表', '', _bot.cmd_wp),
}

# 事件分组（用于前端 UI 布局）
_EVENT_GROUPS = [
    ('🗺️ 主事件表', [
        ('qsj100', '全随机事件', 'd100', '综合所有事件类型，一骰定乾坤'),
        ('zy100', '随机遭遇事件', 'd100', '1-20环境 21-30人类 31-55野兽 56-60迷失 61-80友善 81-85恶霜 86-95特殊 96-100特殊生物'),
        ('ts100', '随机探索事件', 'd100', '1-20深入 21-40遭遇 41-60采集 61-85调查 86-95修整 96-100返回'),
        ('dc100', '随机调查事件', 'd100', '1-10特殊发现 11-35踪迹 36-60异常 61-85材料 86-100无获'),
    ]),
    ('🌍 环境与遭遇', [
        ('hj6', '随机环境', 'd6', '1雪坑 2暴风雪 3极光 4霜雾 5冻雨 6暖风'),
        ('sj6', '随机特殊事件', 'd6', '1雪崩 2冰层破裂 3冰层震动 4陷阱 5特殊标记 6寒鸦报信'),
        ('rl100', '随机人类', 'd100', '1-15商队 16-45公会 46-65士兵 66-100猎人'),
        ('ys10', '随机野兽', 'd10', '1-10 冰原狼/野猪/白熊/巨熊/巨鹰/寒脊蛇'),
    ]),
    ('👹 生物', [
        ('zl12', '随机非敌对生物', 'd12', '1-12 雪蹄兔/野鹿/雪鸮/寒鸦/雪狐/霜鼠/麝牛/银蛛/霜羽雉/绒蜂巢'),
        ('sw100', '随机特殊生物', 'd100', '1-5霜巨魔 6-45恶尸 46-60冬精灵 61-92霜灵 93-95瘦鹿 96-100水星守卫'),
    ]),
    ('⛏ 资源与材料', [
        ('cl50', '随机材料', 'd50', '1-6药草 7-15浆果 16-23松枝 24-30松脂 31-35兽骨 36-42矿粒 43-46钱袋 47-50特殊'),
        ('cl100', '随机特殊材料', 'd100', '1-25荧光苔 26-45松茸 46-65铁松松脂 66-72绒蜂蜜 73-85蛛网 86-95霜晶核 96-100寒铁髓'),
        ('kw100', '随机矿物', 'd100', '1-10岩盐 11-25煤矿 26-35铜矿 36-50铁矿 51-60寒铁矿 61-70银矿 71-75金矿 76-85冰水晶 86-92霜晶核 93-96化石 97-100宝石'),
    ]),
    ('🏛 探索与发现', [
        ('fx100', '随机特殊发现', 'd100', '1-5遗迹 6-15灵泉 16-40猎人小屋 41-55温泉 56-85岩洞 86-100矿坑'),
        ('yj8', '随机遗迹', 'd8', '1远古战场 2巨兽骨骸 3古老墓穴 4符文法阵 5废弃神殿 6残破石碑 7倒塌建筑 8神秘祭坛'),
    ]),
    ('📦 参考', [
        ('wp', '物品表 (1-29)', '', '查询或列出全部29项物品'),
    ]),
]

app = Flask(__name__)

# 当前活跃角色 (简易会话，正式版用 Flask session)
active_char_id = None

# ━━━ 聊天系统 ━━━
import time as _time
import json as _json
import threading as _threading

_CHAT_LOG_FILE = _Path(__file__).parent / 'chat_log.json'
_chat_messages: list[dict] = []  # [{name, text, time, is_dm, ip, color}]
MAX_CHAT_MSGS = 500  # 最多保留500条消息

def _load_chat_log():
    """从磁盘加载聊天记录"""
    global _chat_messages
    try:
        if _CHAT_LOG_FILE.exists():
            with open(_CHAT_LOG_FILE, 'r', encoding='utf-8') as f:
                _chat_messages = _json.load(f)
    except Exception:
        _chat_messages = []

def _save_chat_log():
    """保存聊天记录到磁盘"""
    try:
        with open(_CHAT_LOG_FILE, 'w', encoding='utf-8') as f:
            _json.dump(_chat_messages[-MAX_CHAT_MSGS:], f, ensure_ascii=False, indent=2)
    except Exception:
        pass

# 启动时加载
_load_chat_log()

# ━━━ DM/主机系统 ━━━
_dm_name: str | None = None  # 当前DM的名字
_dm_ip: str | None = None    # DM的IP地址

# ━━━ 在线用户/房间系统 ━━━
# {name: {'ip': str, 'color': str, 'role': str, 'last_heartbeat': float, 'joined_at': float}}
_online_users: dict[str, dict] = {}

# ━━━ @提及通知系统 ━━━
_mentions: list[dict] = []  # [{target_name, from_name, text, time, _ts}]
MAX_MENTIONS = 100

# ━━━ 共享画布状态（HTTP 轮询，简单可靠）━━
from .shared_state import get_shared_canvas, get_shared_canvas_ts, update_shared_canvas, append_shared_strokes

_map_state: dict | None = None
_map_state_ts: float = 0.0

@app.route('/api/shared-canvas', methods=['GET'])
def api_get_shared_canvas():
    """获取共享画布状态"""
    since = request.args.get('since', '0')
    try:
        since_ts = float(since)
    except ValueError:
        since_ts = 0.0
    state = get_shared_canvas()
    ts = get_shared_canvas_ts()
    return jsonify({
        'ok': True,
        'state': state,
        'timestamp': ts,
        'changed': ts > since_ts,
    })


@app.route('/api/shared-canvas', methods=['POST'])
def api_push_shared_canvas():
    """推送画布更新。支持 _mode: 'full'（全量替换）或 'incremental'（增量合并）。"""
    data = request.get_json(silent=True) or {}
    updates = data.get('updates', data)
    mode = updates.get('_mode', data.get('_mode', 'incremental'))
    canvas = get_shared_canvas()

    for key in ['strokes', 'layers', 'tokens', 'texts', 'fog']:
        if key not in updates or updates[key] is None:
            continue

        if mode == 'full' or key == 'fog':
            update_shared_canvas(key, updates[key])
        elif key == 'strokes':
            append_shared_strokes(updates[key])
        else:
            existing = {item.get('id'): item for item in canvas[key] if isinstance(item, dict)}
            for item in updates[key]:
                if isinstance(item, dict) and item.get('id'):
                    existing[item['id']] = item
            update_shared_canvas(key, list(existing.values()))

    return jsonify({'ok': True, 'timestamp': get_shared_canvas_ts()})

# ━━━ 战斗状态同步 ━━━
_combat_state: dict | None = None  # 共享的战斗状态
_combat_state_ts: float = 0.0


def get_active():
    global active_char_id
    if active_char_id is None:
        return None
    return get_character(active_char_id)


# ━━━ 页面路由 ━━━

@app.route('/')
def index():
    """首页 — 掷骰面板"""
    return render_template('index.html')


@app.route('/character')
def character_page():
    """角色卡编辑"""
    return render_template('character.html')


@app.route('/combat')
def combat_page():
    """战斗追踪器"""
    return render_template('combat.html')


@app.route('/reference')
def reference_page():
    """参考文档"""
    return render_template('reference.html')


@app.route('/map')
def map_page():
    """战术地图"""
    return render_template('map.html')


@app.route('/spells')
def spells_page():
    """法术管理"""
    return render_template('spells.html')


@app.route('/events')
def events_page():
    """随机事件表"""
    return render_template('events.html', event_groups=_EVENT_GROUPS)


@app.route('/chat')
def chat_page():
    """聊天室"""
    return render_template('chat.html')


# ━━━ API 路由 ━━━

@app.route('/api/roll', methods=['POST'])
def api_roll():
    """掷骰 API"""
    data = request.get_json()
    expr = data.get('expression', '').strip()
    if not expr:
        return jsonify({'error': '缺少表达式'}), 400

    try:
        result = roll(expr)
        crit = 'success' if result.is_crit_success else ('failure' if result.is_crit_failure else None)
        # 获取当前活跃角色名
        char_name = ''
        active_char = get_active()
        if active_char:
            char_name = active_char.get('name', '')
        return jsonify({
            'expression': result.expression,
            'rolls': result.rolls,
            'kept_rolls': result.kept_rolls,
            'modifier': result.modifier,
            'total': result.total,
            'advantage': result.advantage,
            'is_crit_success': result.is_crit_success,
            'is_crit_failure': result.is_crit_failure,
            'char_name': char_name,
            'formatted': format_dice_result(
                result.expression, result.rolls, result.total,
                modifier=result.modifier, advantage=result.advantage,
                is_crit=crit,
            ).replace('\033[1m', '<b>').replace('\033[0m', '</b>')
             .replace('\033[31m', '<span style="color:red">').replace('\033[0m', '</span>')
             .replace('\033[32m', '<span style="color:green">').replace('\033[0m', '</span>')
             .replace('\033[36m', '<span style="color:cyan">').replace('\033[0m', '</span>'),
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/check', methods=['POST'])
def api_check():
    """检定 API"""
    data = request.get_json()
    target = data.get('target', '').strip()
    advantage = data.get('advantage')  # True/False/None

    char = get_active()
    ability_mod = 0
    prof_bonus = 0
    label = target

    skill = normalize_skill(target)
    ability = normalize_ability(target)

    if skill:
        ability_for_skill = get_ability_for_skill(skill)
        label = f"{skill}({ability_for_skill})"
        if char:
            ability_key_map = {
                '力量': 'str', '敏捷': 'dex', '体质': 'con',
                '智力': 'int', '感知': 'wis', '魅力': 'cha',
            }
            abbr = ability_key_map.get(ability_for_skill, 'str')
            ability_score = char['abilities'].get(abbr, 10)
            ability_mod = ability_modifier(ability_score)
            skill_profs = char.get('skill_proficiencies', {})
            if skill in skill_profs and skill_profs[skill].get('is_proficient'):
                prof_bonus = char['proficiency_bonus']
                if skill_profs[skill].get('is_expertise'):
                    prof_bonus *= 2
    elif ability:
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
                prof_bonus = char['proficiency_bonus']

    # 执行检定
    from core.dice_engine import roll_ability_check
    result = roll_ability_check(ability_mod, prof_bonus, advantage)
    total_mod = ability_mod + prof_bonus

    # 获取所有 d20 投掷结果（优势/劣势时有2个）
    d20_rolls = result.rolls if result.rolls else [0]
    kept_roll = result.total - total_mod  # 反推实际使用的 d20 值
    # 对于优势：d20_rolls 包含两次投掷，最终取最高/最低

    char_name = char.get('name', '') if char else ''
    return jsonify({
        'label': label,
        'd20_roll': result.rolls[-1] if result.rolls else 0,
        'd20_rolls': d20_rolls,
        'kept_roll': max(d20_rolls) if advantage is True else (min(d20_rolls) if advantage is False else d20_rolls[0]),
        'ability_mod': ability_mod,
        'prof_bonus': prof_bonus,
        'total_mod': total_mod,
        'total': result.total,
        'advantage': advantage,
        'is_crit_success': result.is_crit_success,
        'is_crit_failure': result.is_crit_failure,
        'char_name': char_name,
    })


@app.route('/api/characters', methods=['GET'])
def api_list_characters():
    """列出角色。PL 只能看到自己创建/导入的角色，DM 可看到全部。"""
    name = request.args.get('name', '').strip()
    role = request.args.get('role', 'PL')
    client_ip = request.remote_addr or ''

    if role == 'DM' or _is_dm_ip(client_ip):
        chars = list_characters()
    else:
        chars = list_characters(created_by=name)

    return jsonify(chars)


@app.route('/api/character/<name_or_id>', methods=['GET'])
def api_get_character(name_or_id):
    """获取角色详情"""
    try:
        char_id = int(name_or_id)
    except ValueError:
        char_id = name_or_id

    char = get_character(char_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    # 格式化角色卡
    char['formatted'] = format_character_sheet(char)
    return jsonify(char)


@app.route('/api/character', methods=['POST'])
def api_create_character():
    """创建角色"""
    data = request.get_json()
    name = data.get('name', '')
    level = data.get('level', 1)
    cls = data.get('class', '')
    race = data.get('race', '')
    background = data.get('background', '')
    created_by = data.get('created_by', '')

    if not name:
        return jsonify({'error': '角色名不能为空'}), 400

    char_id = create_character(name, level, cls, race, background, created_by=created_by)
    char = get_character(char_id)

    global active_char_id
    active_char_id = char_id

    return jsonify({'id': char_id, 'name': name, 'formatted': format_character_sheet(char)})


@app.route('/api/character/<name_or_id>', methods=['PUT'])
def api_update_character(name_or_id):
    """更新角色"""
    data = request.get_json()
    try:
        char_id = int(name_or_id)
    except ValueError:
        char = get_character(name_or_id)
        if not char:
            return jsonify({'error': '角色不存在'}), 404
        char_id = char['id']

    # 处理属性更新
    for key, value in data.items():
        if key.upper() in ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', '力量', '敏捷', '体质', '智力', '感知', '魅力'):
            set_ability(char_id, key, int(value))
        elif key in ('name', 'level', 'class', 'race', 'background', 'hp_max', 'hp_current', 'ac', 'speed'):
            update_character(char_id, **{key: value})

    char = get_character(char_id)
    return jsonify({
        'success': True,
        'formatted': format_character_sheet(char),
    })


def _resolve_char(name_or_id: str) -> dict | None:
    """按名字或ID查找角色（URL参数始终为字符串）"""
    try:
        char_id = int(name_or_id)
    except ValueError:
        char_id = name_or_id
    return get_character(char_id)


@app.route('/api/character/<name>/hp', methods=['POST'])
def api_adjust_hp(name):
    """调整 HP。setAbsolute=true 时直接设为指定值"""
    char = _resolve_char(name)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json()
    amount = data.get('amount', 0)
    if data.get('setAbsolute'):
        from core.character import set_hp
        result = set_hp(char['id'], hp_current=amount)
    else:
        result = adjust_hp(char['id'], amount)
    return jsonify(result)


@app.route('/api/character/<name>/spell_slot', methods=['POST'])
def api_use_spell_slot(name):
    """消耗法术位"""
    char = _resolve_char(name)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json()
    level = str(data.get('level', 1))
    result = use_spell_slot(char['id'], level)
    return jsonify(result)


@app.route('/api/character/<name>/longrest', methods=['POST'])
def api_long_rest(name):
    """长休"""
    char = _resolve_char(name)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    result = long_rest(char['id'])
    return jsonify(result)


# ━━━ 属性/技能/豁免 API ━━━

@app.route('/api/character/<name_or_id>/ability', methods=['PUT'])
def api_set_ability(name_or_id):
    """设置属性值"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    ability = data.get('ability', '').strip().lower()
    score = int(data.get('score', 10))

    valid = {'str', 'dex', 'con', 'int', 'wis', 'cha',
             '力量', '敏捷', '体质', '智力', '感知', '魅力'}
    if ability not in valid:
        return jsonify({'error': f'无效属性: {ability}'}), 400
    if score < 1 or score > 30:
        return jsonify({'error': '属性值范围 1-30'}), 400

    from core.character import set_ability as _set_ability
    ok = _set_ability(char['id'], ability, score)
    if not ok:
        return jsonify({'error': '设置失败'}), 400

    # 重新获取更新后的角色
    updated = get_character(char['id'])
    return jsonify({
        'success': True,
        'ability': ability,
        'score': score,
        'mod': updated['ability_mods'].get(ability, 0) if updated.get('ability_mods') else 0,
    })


@app.route('/api/character/<name_or_id>/skill', methods=['POST'])
def api_toggle_skill(name_or_id):
    """切换技能熟练（熟练 ↔ 非熟练）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    skill_name = data.get('skill', '').strip()
    is_proficient = bool(data.get('proficient', True))
    is_expertise = bool(data.get('expertise', False))

    skill = normalize_skill(skill_name)
    if not skill:
        return jsonify({'error': f'无效技能: {skill_name}'}), 400

    from core.character import set_skill_proficiency as _set_skill
    ok = _set_skill(char['id'], skill, is_proficient or is_expertise, is_expertise)
    if not ok:
        return jsonify({'error': '设置失败'}), 400

    return jsonify({
        'success': True,
        'skill': skill,
        'is_proficient': is_proficient or is_expertise,
        'is_expertise': is_expertise,
    })


@app.route('/api/character/<name_or_id>/save-prof', methods=['POST'])
def api_toggle_save_prof(name_or_id):
    """切换豁免熟练"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    ability_name = data.get('ability', '').strip()
    is_proficient = bool(data.get('proficient', True))

    ability = normalize_ability(ability_name)
    if not ability:
        return jsonify({'error': f'无效属性: {ability_name}'}), 400

    from core.character import set_save_proficiency as _set_save
    ok = _set_save(char['id'], ability, is_proficient)
    if not ok:
        return jsonify({'error': '设置失败'}), 400

    return jsonify({'success': True, 'ability': ability, 'is_proficient': is_proficient})


# ━━━ 背景信息 API ━━━

@app.route('/api/character/<name_or_id>/background', methods=['PUT'])
def api_update_background(name_or_id):
    """批量更新角色背景信息"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    allowed = ['personality_traits', 'personality_traits_ext', 'ideals', 'bonds', 'flaws',
               'background_feature', 'appearance', 'origin', 'languages', 'tool_proficiencies', 'backstory']
    from core.character import set_background
    for key in allowed:
        if key in data:
            set_background(char['id'], **{key: data[key]})
    return jsonify({'success': True})


# ━━━ 已准备法术 API ━━━

@app.route('/api/character/<name_or_id>/prepared-spell', methods=['POST'])
def api_add_prepared_spell(name_or_id):
    """添加已准备法术（从法术书中选择或直接添加）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    spell_name = data.get('name', '').strip()
    spell_level = int(data.get('level', 0))

    if not spell_name:
        return jsonify({'error': '法术名不能为空'}), 400

    from core.character import add_prepared_spell as _add_spell
    sid = _add_spell(char['id'], spell_name, spell_level)
    return jsonify({'success': True, 'spell_id': sid, 'name': spell_name, 'level': spell_level})


@app.route('/api/character/<name_or_id>/prepared-spell/<int:spell_id>', methods=['DELETE'])
def api_remove_prepared_spell(name_or_id, spell_id):
    """删除已准备法术"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    import sqlite3
    from core.character import get_db
    conn = get_db()
    conn.execute("DELETE FROM prepared_spells WHERE id = ? AND character_id = ?",
                 (spell_id, char['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ━━━ 法术书（已学习法术）API ━━━

@app.route('/api/character/<name_or_id>/learned-spell', methods=['POST'])
def api_add_learned_spell(name_or_id):
    """添加法术到法术书"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    spell_name = data.get('name', '').strip()
    if not spell_name:
        return jsonify({'error': '法术名不能为空'}), 400

    from core.character import add_learned_spell as _add_learned
    sid = _add_learned(
        char['id'], spell_name,
        spell_level=int(data.get('level', 0)),
        school=data.get('school', ''),
        casting_time=data.get('casting_time', ''),
        range_=data.get('range', ''),
        duration=data.get('duration', ''),
        components=data.get('components', ''),
        ritual=data.get('ritual', '否'),
        concentration=data.get('concentration', '否'),
        description=data.get('description', ''),
        source=data.get('source', '自定义'),
    )
    return jsonify({'success': True, 'spell_id': sid, 'name': spell_name})


@app.route('/api/character/<name_or_id>/learned-spell/<int:spell_id>', methods=['DELETE'])
def api_remove_learned_spell(name_or_id, spell_id):
    """从法术书删除法术"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    from core.character import remove_learned_spell as _remove_learned
    ok = _remove_learned(spell_id)
    if not ok:
        return jsonify({'error': '法术不存在'}), 404
    return jsonify({'success': True})


# ━━━ 法术搜索 API ━━━

@app.route('/api/spells/search', methods=['GET'])
def api_search_spells():
    """综合法术搜索（返回多条结果，优先查法术索引获取完整数据）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    spells = []
    seen = set()

    # 优先用 search_spell（直接查法术索引，数据完整）
    from core.chm_search import search_spell as _search_spell
    chm_spells = _search_spell(query)
    for s in chm_spells:
        name = s.get('name_cn', s.get('name', ''))
        if name in seen:
            continue
        seen.add(name)
        spells.append({
            'name': name,
            'name_en': s.get('name_en', ''),
            'level': s.get('level', ''),
            'school': s.get('school', ''),
            'casting_time': s.get('casting_time', ''),
            'components': ' '.join(filter(None, [
                'V' if s.get('verbal') in ('V', '✓') else '',
                'S' if s.get('somatic') in ('S', '✓') else '',
                'M' if s.get('material') in ('M', '✓') else '',
            ])) or '—',
            'ritual': '是' if s.get('ritual') in ('✓', '是', 'R') else '否',
            'concentration': '是' if s.get('concentration') in ('✓', '是', 'C') else '否',
            'classes': s.get('classes', ''),
            'source': s.get('source', ''),
            'detail_link': s.get('detail_link', ''),
        })
        if len(spells) >= 30:
            break

    # 补充 chm_search_all 的结果（可能包含倒排索引中的额外法术）
    if len(spells) < 15:
        all_results = chm_search_all(query)
        for r in all_results:
            if r.get('type') in ('spell',):
                name = r.get('name_cn', r.get('name', ''))
                if name in seen:
                    continue
                seen.add(name)
                spells.append({
                    'name': name,
                    'name_en': r.get('name_en', ''),
                    'level': r.get('level', ''),
                    'school': r.get('school', ''),
                    'casting_time': r.get('casting_time', ''),
                    'components': ' '.join(filter(None, [
                        'V' if r.get('verbal') in ('V', '✓') else '',
                        'S' if r.get('somatic') in ('S', '✓') else '',
                        'M' if r.get('material') in ('M', '✓') else '',
                    ])) or '—',
                    'ritual': '是' if r.get('ritual') in ('✓', '是', 'R') else '否',
                    'concentration': '是' if r.get('concentration') in ('✓', '是', 'C') else '否',
                    'classes': r.get('classes', ''),
                    'source': r.get('source', ''),
                    'detail_link': r.get('detail_link', ''),
                })
            if len(spells) >= 30:
                break

    return jsonify({'query': query, 'results': spells, 'total': len(spells)})


@app.route('/api/spell-detail/<path:name>', methods=['GET'])
def api_spell_detail(name):
    """获取法术详细描述"""
    spell = chm_get_spell_detail(name)
    if not spell:
        # 回退到 SRD
        spell = search_spell(name)
        if not spell:
            return jsonify({'error': '未找到法术'}), 404
        return jsonify({
            'name': spell.get('name', name),
            'name_en': '',
            'level': spell.get('level', '?'),
            'school': spell.get('school', '?'),
            'casting_time': spell.get('casting_time', '?'),
            'range': spell.get('range', '?'),
            'duration': spell.get('duration', '?'),
            'components': spell.get('components', '?'),
            'ritual': spell.get('ritual', '否'),
            'concentration': spell.get('concentration', '否'),
            'classes': spell.get('classes', '?'),
            'source': spell.get('source', '?'),
            'detail_text': spell.get('description', spell.get('detail', '')),
        })

    return jsonify({
        'name': spell.get('name_cn', spell.get('name', '?')),
        'name_en': spell.get('name_en', ''),
        'level': spell.get('level', '?'),
        'school': spell.get('school', '?'),
        'casting_time': spell.get('casting_time', '?'),
        'range': spell.get('range', ''),
        'duration': spell.get('duration', ''),
        'components': ' '.join(filter(None, [
            'V' if spell.get('verbal') in ('V', '✓') else '',
            'S' if spell.get('somatic') in ('S', '✓') else '',
            'M' if spell.get('material') in ('M', '✓') else '',
        ])) or '—',
        'ritual': '是' if spell.get('ritual') in ('✓', '是', 'R') else '否',
        'concentration': '是' if spell.get('concentration') in ('✓', '是', 'C') else '否',
        'classes': spell.get('classes', '?'),
        'source': spell.get('source', '?'),
        'detail_text': spell.get('detail_text', ''),
    })

@app.route('/api/character/<name_or_id>/weapon', methods=['POST'])
def api_add_weapon(name_or_id):
    """添加武器"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '武器名不能为空'}), 400

    from core.character import add_weapon as _add_weapon
    try:
        wid = _add_weapon(
            char['id'], name,
            attack_bonus=int(data.get('attack_bonus', 0)),
            damage_dice=data.get('damage', ''),
            damage_type=data.get('damage_type', ''),
            description=data.get('description', ''),
            effect=data.get('effect', ''),
        )
    except Exception as e:
        return jsonify({'error': f'添加失败: {str(e)}'}), 500
    return jsonify({'success': True, 'weapon_id': wid, 'name': name})


@app.route('/api/character/<name_or_id>/weapon/<int:weapon_id>', methods=['DELETE'])
def api_remove_weapon(name_or_id, weapon_id):
    """删除武器"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    from core.character import remove_weapon as _remove_weapon
    ok = _remove_weapon(weapon_id)
    if not ok:
        return jsonify({'error': '武器不存在或不属于该角色'}), 404
    return jsonify({'success': True})


# ━━━ 物品 API ━━━

@app.route('/api/character/<name_or_id>/item', methods=['POST'])
def api_add_item(name_or_id):
    """添加物品"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '物品名不能为空'}), 400

    from core.character import add_item as _add_item
    try:
        iid = _add_item(
            char['id'], name,
            quantity=int(data.get('quantity', 1)),
            weight=float(data.get('weight', 0)),
            location=data.get('location', '背包'),
            description=data.get('description', ''),
            effect=data.get('effect', ''),
        )
    except Exception as e:
        return jsonify({'error': f'添加失败: {str(e)}'}), 500
    return jsonify({'success': True, 'item_id': iid, 'name': name})


@app.route('/api/character/<name_or_id>/item/<int:item_id>', methods=['PUT'])
def api_update_item(name_or_id, item_id):
    """更新物品数量（设 quantity ≤ 0 则删除）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    qty = int(data.get('quantity', 0))

    from core.character import update_item_quantity as _update_qty, remove_item as _remove_item
    if qty <= 0:
        ok = _remove_item(item_id)
        if not ok:
            return jsonify({'error': '物品不存在'}), 404
        return jsonify({'success': True, 'deleted': True})
    else:
        ok = _update_qty(item_id, qty)
        if not ok:
            return jsonify({'error': '物品不存在'}), 404
        return jsonify({'success': True, 'quantity': qty})


@app.route('/api/character/<name_or_id>/item/<int:item_id>', methods=['DELETE'])
def api_remove_item(name_or_id, item_id):
    """删除物品"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    from core.character import remove_item as _remove_item
    ok = _remove_item(item_id)
    if not ok:
        return jsonify({'error': '物品不存在'}), 404
    return jsonify({'success': True})


@app.route('/api/character/<name_or_id>/inventory/stack', methods=['POST'])
def api_stack_inventory(name_or_id):
    """合并同名物品"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    from core.character import stack_inventory as _stack
    merged = _stack(char['id'])
    return jsonify({'success': True, 'merged': merged})


# ━━━ 钱币 API ━━━

@app.route('/api/character/<name_or_id>/coin', methods=['POST'])
def api_adjust_coin(name_or_id):
    """调整钱币（正数增加，负数减少）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    coin_type = data.get('coin_type', '').strip().lower()
    amount = int(data.get('amount', 0))

    if not coin_type or amount == 0:
        return jsonify({'error': '请提供 coin_type 和 amount'}), 400

    valid = {'cp', 'sp', 'ep', 'gp', 'pp', '铜币', '银币', '金银币', '金币', '白金币'}
    if coin_type not in valid:
        return jsonify({'error': f'无效币种: {coin_type}。可用: cp/sp/ep/gp/pp'}), 400

    from core.character import adjust_coin as _adjust_coin
    result = _adjust_coin(char['id'], coin_type, amount)
    if 'error' in result:
        return jsonify({'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ━━━ 头像 API ━━━

@app.route('/api/character/<name_or_id>', methods=['DELETE'])
def api_delete_character(name_or_id):
    """删除角色"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    char_name = char['name']
    char_id = char['id']
    delete_character(char_id)

    global active_char_id
    if active_char_id == char_id:
        active_char_id = None

    return jsonify({'success': True, 'name': char_name})


@app.route('/api/character/<name_or_id>/portrait', methods=['GET'])
def api_get_portrait(name_or_id):
    """获取角色头像图片"""
    try:
        char_id = int(name_or_id)
    except ValueError:
        char_id = name_or_id

    char = get_character(char_id)
    if not char:
        abort(404)

    path = char.get('portrait_path', '')
    if not path:
        abort(404)

    # 尝试解析路径
    resolved, _ = resolve_portrait_path(path)
    if not resolved:
        # 如果原始路径存在也接受
        if _os.path.exists(path) and _os.path.isfile(path):
            resolved = path
        else:
            abort(404)

    # 安全检查：限制在项目根目录内（尘封之卷-九子的注视/）
    project_root = _Path(__file__).parent.parent.parent.resolve()
    resolved_path = _Path(resolved).resolve()
    try:
        resolved_path.relative_to(project_root)
    except ValueError:
        # 不在项目目录内，拒绝访问
        abort(403)

    # 确定 mimetype
    ext = resolved_path.suffix.lower()
    mimetypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')

    return send_file(str(resolved_path), mimetype=mimetype)


@app.route('/api/character/<name_or_id>/portrait', methods=['PUT'])
def api_set_portrait(name_or_id):
    """设置角色头像路径"""
    data = request.get_json()
    path = data.get('path', '').strip()
    if not path:
        return jsonify({'error': '缺少路径参数'}), 400

    try:
        char_id = int(name_or_id)
    except ValueError:
        char = get_character(name_or_id)
        if not char:
            return jsonify({'error': '角色不存在'}), 404
        char_id = char['id']

    # 尝试解析路径
    resolved, tried = resolve_portrait_path(path)
    if resolved:
        update_character(char_id, portrait_path=resolved)
        return jsonify({'success': True, 'path': resolved})
    else:
        # 保存原始路径，但给出警告（含调试信息）
        tried_str = '\n已尝试搜索:\n' + '\n'.join(tried[-5:]) if tried else ''
        update_character(char_id, portrait_path=path)
        return jsonify({
            'warning': f'文件未找到，已保存原始路径{tried_str}',
            'path': path,
            'tried': tried[-5:] if tried else []
        })


@app.route('/api/character/<name_or_id>/portrait', methods=['DELETE'])
def api_clear_portrait(name_or_id):
    """清除角色头像"""
    try:
        char_id = int(name_or_id)
    except ValueError:
        char = get_character(name_or_id)
        if not char:
            return jsonify({'error': '角色不存在'}), 404
        char_id = char['id']

    update_character(char_id, portrait_path='')
    return jsonify({'success': True})


@app.route('/api/spells/search', methods=['GET'])
def api_search_spells_list():
    """模糊搜索法术列表（最多50条）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    from core.chm_search import search_spell as _search_spell
    results = _search_spell(query)
    items = []
    for s in results[:50]:
        items.append({
            'name': s.get('name_cn', s.get('name', '?')),
            'name_en': s.get('name_en', ''),
            'level': s.get('level', ''),
            'school': s.get('school', ''),
            'classes': s.get('classes', ''),
            'source': s.get('source', ''),
            'detail': f"{s.get('level','?')}环 {s.get('school','?')} | {s.get('classes','?')}",
        })
    # 补充自定义法术
    for e in _load_custom('spells'):
        if query.lower() in e['name'].lower():
            items.append({
                'name': e['name'], 'name_en': e.get('name_en', ''),
                'level': e.get('level', ''), 'school': e.get('school', ''),
                'classes': e.get('classes', ''), 'source': '自定义',
                'detail': e.get('description', '')[:100],
            })
    return jsonify({'query': query, 'results': items, 'total': len(items)})


@app.route('/api/spell/<name>', methods=['GET'])
def api_search_spell(name):
    """查询法术"""
    spell = search_spell(name)
    if not spell:
        return jsonify({'error': '未找到法术'}), 404
    return jsonify(spell)


@app.route('/api/monsters/search', methods=['GET'])
def api_search_monsters():
    """模糊搜索怪物列表（最多50条）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    from core.chm_search import search_monster as _search_monster
    results = _search_monster(query)
    items = []
    for m in results[:50]:
        items.append({
            'name': m.get('name_cn', m.get('name', '?')),
            'name_en': m.get('name_en', ''),
            'cr': m.get('cr', ''),
            'size': m.get('size', ''),
            'type': m.get('type', ''),
            'source': m.get('source', ''),
            'detail_link': m.get('detail_link', ''),
            'detail': f"CR:{m.get('cr','?')} {m.get('size','')} {m.get('type','')}",
        })
    # 补充自定义怪物
    for e in _load_custom('monsters'):
        if query.lower() in e['name'].lower():
            items.append({
                'name': e['name'],
                'name_en': e.get('name_en', ''),
                'cr': e.get('cr', ''),
                'size': e.get('size', ''),
                'type': e.get('type', ''),
                'source': '自定义',
                'detail_text': e.get('detail_text', ''),
                'detail': f"CR:{e.get('cr','?')} {e.get('size','')} {e.get('type','')}",
            })
    return jsonify({'query': query, 'results': items, 'total': len(items)})


@app.route('/api/monster/<name>', methods=['GET'])
def api_search_monster(name):
    """查询怪物（CHM 优先，读取详情页获取完整数据）"""
    # 先从 CHM 获取完整详情（含 detail_text）
    monster = chm_get_monster_detail(name)
    if monster:
        return jsonify({
            'name': monster.get('name_cn', monster.get('name', '?')),
            'name_en': monster.get('name_en', ''),
            'cr': monster.get('cr', '?'),
            'size': monster.get('size', '?'),
            'type': monster.get('type', '?'),
            'source': monster.get('source', '?'),
            'legendary': monster.get('legendary', ''),
            'detail_text': monster.get('detail_text', ''),
            'source_db': 'chm',
        })

    # CHM 没找到，尝试模糊搜索
    chm_results = chm_search_monster(name)
    if chm_results:
        m = chm_results[0]
        # 尝试读取详情
        detail_text = ''
        if m.get('detail_link'):
            from core.chm_search import read_detail_page
            detail_text = read_detail_page(m['detail_link']) or ''
        return jsonify({
            'name': m.get('name_cn', m.get('name', '?')),
            'name_en': m.get('name_en', ''),
            'cr': m.get('cr', '?'),
            'size': m.get('size', '?'),
            'type': m.get('type', '?'),
            'source': m.get('source', '?'),
            'legendary': m.get('legendary', ''),
            'detail_text': detail_text,
            'source_db': 'chm',
        })

    # 回退到 SRD
    monster = search_monster(name)
    if not monster:
        return jsonify({'error': '未找到怪物'}), 404
    return jsonify({**monster, 'source_db': 'srd'})


@app.route('/api/search', methods=['GET'])
def api_search():
    """综合搜索（CHM 资料库 + 项目文件）"""
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify({'error': '关键词至少2个字'}), 400

    from core.chm_search import search_all_combined as _combined, search_project_files as _search_files
    results = _combined(query)
    items = []
    seen = set()
    for r in results[:50]:
        rtype = r.get('type', '')
        name = r.get('name_cn', r.get('name', r.get('title', '?')))
        if name in seen: continue
        seen.add(name)
        items.append({
            'type': rtype,
            'name': name,
            'name_en': r.get('name_en', ''),
            'detail': r.get('detail', r.get('snippet', '')),
            'path': r.get('path', r.get('detail_link', '')),
            'cr': r.get('cr', ''),
            'level': r.get('level', ''),
            'school': r.get('school', ''),
            'source': r.get('source', ''),
        })

    # 补充项目文件
    files = _search_files(query)
    for f in files[:10]:
        name = f.get('name', '?')
        if name in seen: continue
        seen.add(name)
        snippet = f.get('snippet', '') or ''
        cat = f.get('cat_label', '')
        parent = f.get('parent', '')
        detail_parts = []
        if snippet: detail_parts.append(snippet[:200])
        if cat: detail_parts.append(cat)
        if parent: detail_parts.append(parent)
        items.append({
            'type': 'file',
            'name': name,
            'detail': ' | '.join(detail_parts) if detail_parts else '',
            'path': f.get('path', ''),
            'ext': f.get('ext', ''),
            'snippet': snippet,
        })

    # 补充 DND5E 物品表
    item_data = _load_items()
    for it in item_data:
        if it['name'] in seen: continue
        if query.lower() in it['name'].lower() or query.lower() in it['type'].lower():
            seen.add(it['name'])
            detail_parts = []
            if it['price']: detail_parts.append(f"💰{it['price']}")
            if it['damage']: detail_parts.append(f"⚔️{it['damage']}")
            if it['weight']: detail_parts.append(f"⚖️{it['weight']}")
            if it['type']: detail_parts.append(f"📦{it['type']}")
            items.append({
                'type': 'item',
                'name': it['name'],
                'detail': ' | '.join(detail_parts),
            })
        if len(items) >= 60: break

    # 补充自定义资料库条目
    for kind, itype in [('spells', 'spell'), ('monsters', 'monster'), ('items', 'item')]:
        for e in _load_custom(kind):
            if e['name'] in seen: continue
            if query.lower() in e['name'].lower():
                seen.add(e['name'])
                detail = e.get('description', e.get('detail_text', ''))[:100]
                items.append({
                    'type': itype,
                    'name': e['name'],
                    'detail': detail,
                    'source': '自定义',
                })

    return jsonify({'query': query, 'results': items, 'total': len(items)})


@app.route('/api/conditions', methods=['GET'])
def api_conditions():
    """获取状态列表"""
    return jsonify(load_conditions())


@app.route('/api/skills', methods=['GET'])
def api_skills():
    """获取技能列表"""
    return jsonify(SKILL_TO_ABILITY)


@app.route('/api/abilities', methods=['GET'])
def api_abilities():
    """获取属性列表"""
    return jsonify(ABILITY_ORDER)


@app.route('/api/character/from-monster', methods=['POST'])
def api_create_from_monster():
    """从怪物数据创建角色"""
    data = request.get_json()
    name = data.get('name', '')
    if not name:
        return jsonify({'error': '缺少怪物名称'}), 400

    # 估算属性
    cr_str = data.get('cr', '0')
    try:
        cr = float(cr_str)
    except ValueError:
        cr = 0

    # CR → 属性估算（粗略映射）
    import math
    prof_bonus = max(2, math.ceil((cr + 4) / 4)) if cr > 0 else 2
    # 估算 HP（每CR约15HP，至少10）
    hp_est = max(10, int(cr * 15 + 10)) if cr > 0 else 10
    # 估算 AC
    ac_est = min(22, 10 + int(cr / 2) + 3)
    # 估算属性值（基于CR粗略估算）
    base_score = min(20, 10 + int(cr))
    abilities = {
        'str': base_score, 'dex': min(20, base_score - 1),
        'con': min(20, base_score + 1), 'int': max(8, base_score - 2),
        'wis': min(20, base_score - 1), 'cha': max(8, base_score - 2),
    }

    size = data.get('size', '中型')
    mtype = data.get('type', '')
    race_str = f'{size} {mtype}'.strip() or '未知'
    created_by = data.get('created_by', '')

    char_id = create_character(name, level=max(1, int(cr)), cls='怪物/NPC', race=race_str, created_by=created_by)
    char = get_character(char_id)

    # 设置属性
    for key, score in abilities.items():
        set_ability(char_id, key, score)

    # 设置 HP 和 AC
    update_character(char_id, hp_max=hp_est, hp_current=hp_est, ac=ac_est)

    # 设置活跃角色
    global active_char_id
    active_char_id = char_id

    char = get_character(char_id)
    return jsonify({
        'id': char_id,
        'name': name,
        'hp_max': hp_est,
        'hp_current': hp_est,
        'ac': ac_est,
        'formatted': format_character_sheet(char),
    })


@app.route('/api/character/<name>/use', methods=['POST'])
def api_set_active(name):
    """设置活跃角色"""
    char = _resolve_char(name)
    if not char:
        return jsonify({'error': '角色不存在'}), 404
    global active_char_id
    active_char_id = char['id']
    # 同步 CLI 的活跃角色（随机事件自动添加物品需要）
    _bot.set_active_char(active_char_id)
    return jsonify({'success': True, 'name': char['name']})


@app.route('/api/character/import', methods=['POST'])
def api_import_character():
    """从 Excel 文件导入角色。

    接受 multipart/form-data，字段名 'file'。
    返回导入的角色信息。
    """
    if 'file' not in request.files:
        return jsonify({'error': '请上传文件（字段名: file）'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    # 检查文件扩展名
    ext = _os.path.splitext(file.filename)[1].lower()
    if ext not in ('.xlsx', '.xls'):
        return jsonify({'error': f'不支持的文件类型: {ext}，请上传 .xlsx 或 .xls 文件'}), 400

    # 保存临时文件
    import tempfile
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        file.save(tmp.name)
        tmp.close()

        # 预览
        preview = import_and_print_summary(tmp.name)
        # 导入
        data = import_character_from_excel(tmp.name)
        created_by = request.form.get('created_by', '')
        char_id = import_from_excel_data(data, source_file=_os.path.abspath(tmp.name), created_by=created_by)
        char = get_character(char_id)

        # 设为活跃角色
        global active_char_id
        active_char_id = char_id

        return jsonify({
            'id': char_id,
            'name': char['name'],
            'level': char.get('level', 1),
            'class': char.get('class', ''),
            'race': char.get('race', ''),
            'hp_current': char.get('hp_current', 0),
            'hp_max': char.get('hp_max', 0),
            'ac': char.get('ac', 10),
            'preview': preview,
            'formatted': format_character_sheet(char),
        })
    except Exception as e:
        return jsonify({'error': f'导入失败: {type(e).__name__}: {e}'}), 500
    finally:
        try:
            _os.unlink(tmp.name)
        except Exception:
            pass


# ━━━ 随机事件 API ━━━

def _call_event_command(cmd_func, args: str = '') -> tuple[str | None, str | None]:
    """调用事件命令函数，自动处理交互式 input 提示（web 环境默认通过）。

    同时捕获 stdout（CLI 代码中的 print() 调用），确保输出完整。
    """
    original_input = builtins.input
    original_stdout = sys.stdout
    builtins.input = lambda prompt='': 'y'
    # 同步活跃角色到 CLI（确保事件物品自动添加到角色背包）
    if active_char_id is not None or _bot._active_char_id is not None:
        cid = active_char_id or _bot._active_char_id
        if cid:
            _bot.set_active_char(cid)
    captured = _io.StringIO()
    sys.stdout = captured
    try:
        output, error = cmd_func(args)
        printed = captured.getvalue()
        if printed and output:
            output = printed.rstrip('\n') + '\n' + output
        elif printed:
            output = printed.rstrip('\n')
        return output, error
    finally:
        builtins.input = original_input
        sys.stdout = original_stdout


def _strip_ansi(text: str) -> str:
    """去除 ANSI 颜色码，转换为 HTML 友好格式。"""
    # 粗体: \033[1m...\033[0m → <b>...</b>
    text = _re.sub(r'\x1b\[1m(.*?)\x1b\[0m', r'<b>\1</b>', text)
    # 红色
    text = _re.sub(r'\x1b\[31m(.*?)\x1b\[0m', r'<span style="color:#f44336">\1</span>', text)
    # 绿色
    text = _re.sub(r'\x1b\[32m(.*?)\x1b\[0m', r'<span style="color:#4caf50">\1</span>', text)
    # 青色
    text = _re.sub(r'\x1b\[36m(.*?)\x1b\[0m', r'<span style="color:#00bcd4">\1</span>', text)
    # 黄色
    text = _re.sub(r'\x1b\[33m(.*?)\x1b\[0m', r'<span style="color:#ffd700">\1</span>', text)
    # 剩余的裸 \033[0m（关闭标记）
    text = text.replace('\x1b[0m', '')
    # 裸 \033[1m（开始粗体，无配对的情况）
    text = text.replace('\x1b[1m', '<b>')
    # 裸 ANSI 码（未匹配的颜色开始）
    text = _re.sub(r'\x1b\[31m', '<span style="color:#f44336">', text)
    text = _re.sub(r'\x1b\[32m', '<span style="color:#4caf50">', text)
    text = _re.sub(r'\x1b\[36m', '<span style="color:#00bcd4">', text)
    text = _re.sub(r'\x1b\[33m', '<span style="color:#ffd700">', text)
    return text


@app.route('/api/events/<command>', methods=['POST'])
def api_event(command: str):
    """随机事件掷表 API。

    URL 参数:
        command  — 事件命令名 (如 zy100, ts100, hj6 等)
    Body (JSON):
        args     — 可选，命令参数（wp 命令使用，传入物品编号）

    返回掷表结果（HTML 格式，ANSI 颜色码已转换）。
    """
    if command not in _EVENT_COMMANDS:
        return jsonify({'error': f'未知事件命令: .{command}'}), 404

    data = request.get_json(silent=True) or {}
    cmd_args = data.get('args', '').strip()

    label, dice, cmd_func = _EVENT_COMMANDS[command]

    # 确保 CLI 活跃角色已同步
    if active_char_id is not None:
        _bot.set_active_char(active_char_id)

    try:
        output, error = _call_event_command(cmd_func, cmd_args)
    except Exception as e:
        return jsonify({'error': f'{type(e).__name__}: {e}'}), 500

    if error:
        return jsonify({'error': error}), 400

    # 转换为 HTML
    html_output = _strip_ansi(output or '')
    # 将换行转为 <br>，保留缩进空格
    html_output = html_output.replace('\n', '<br>')
    html_output = html_output.replace('  ', '&nbsp;&nbsp;')

    return jsonify({
        'command': command,
        'label': label,
        'dice': dice,
        'output': output or '',
        'html': html_output,
    })


@app.route('/api/events', methods=['GET'])
def api_list_events():
    """列出所有可用事件命令及分组。"""
    groups = []
    for group_label, items in _EVENT_GROUPS:
        group_items = []
        for cmd, label, dice, desc in items:
            group_items.append({
                'command': cmd,
                'label': label,
                'dice': dice,
                'description': desc,
            })
        groups.append({'label': group_label, 'items': group_items})
    return jsonify({'groups': groups})


# ━━━ DND5E 物品表加载 ━━━
import openpyxl
import os as _os

_item_cache: list[dict] | None = None

def _load_items():
    """加载 DND5E 物品表 Excel"""
    global _item_cache
    if _item_cache is not None:
        return _item_cache

    script_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    path = _os.path.join(script_dir, 'data', 'DND5E物品表.xlsx')
    if not _os.path.exists(path):
        _item_cache = []
        return _item_cache

    try:
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb[wb.sheetnames[0]]
        items = []
        for row in ws.iter_rows(min_row=3, values_only=True):
            if not row[1]:
                continue
            items.append({
                'id': str(row[0] or ''),
                'name': str(row[1] or '').strip(),
                'price': str(row[2] or '').strip(),
                'damage': str(row[3] or '').strip(),
                'weight': str(row[4] or '').strip(),
                'type': str(row[5] or '').strip(),
            })
    except Exception:
        items = []

    # 合并随机事件表中的物品（29项），自动去重
    seen_names = {it['name'].lower() for it in items}
    for num, desc in sorted(_bot.ITEM_TABLE.items()):
        # 提取物品名和括号内描述
        name = desc.split('（')[0].split('(')[0].strip()
        # 提取括号内容作为描述
        detail = ''
        for sep in ['（', '(']:
            if sep in desc:
                rest = desc.split(sep, 1)[1]
                end = rest.rfind('）') if '）' in rest else rest.rfind(')')
                if end > 0:
                    detail = rest[:end].strip()
                else:
                    detail = rest.strip().rstrip('）').rstrip(')')
                break
        if name.lower() not in seen_names:
            seen_names.add(name.lower())
            items.append({
                'id': f'wp{num}',
                'name': name,
                'price': '',
                'damage': '',
                'weight': '',
                'type': '随机事件物品',
                'detail': detail,
            })

    _item_cache = items
    return items


# ━━━ 规则/文档详情 API ━━━

@app.route('/api/rule-detail', methods=['GET'])
def api_rule_detail():
    """读取 CHM 页面的完整内容"""
    path = request.args.get('path', '').strip()
    if not path:
        return jsonify({'error': '缺少 path 参数'}), 400

    from core.chm_search import read_detail_page as _read
    content = _read(path)
    if content is None:
        return jsonify({'error': '无法读取页面'}), 404
    return jsonify({'path': path, 'content': content[:50000]})


@app.route('/api/file-content', methods=['GET'])
def api_file_content():
    """读取项目文件内容"""
    path = request.args.get('path', '').strip()
    if not path:
        return jsonify({'error': '缺少 path 参数'}), 400

    # 安全检查
    script_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    project_root = _os.path.dirname(script_dir) if _os.path.basename(script_dir) == '骰娘' else script_dir
    full_path = _os.path.join(project_root, path)
    if not _os.path.exists(full_path):
        return jsonify({'error': '文件不存在'}), 404

    ext = _os.path.splitext(full_path)[1].lower()

    # 图片文件 → 返回文件内容供前端直接展示
    if ext in ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'):
        return jsonify({'path': path, 'type': 'image', 'content': f'/api/file-raw?path={path}'})

    try:
        if ext == '.txt':
            with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        elif ext in ('.md', '.markdown'):
            with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        elif ext == '.docx':
            try:
                import docx
                doc = docx.Document(full_path)
                content = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
            except ImportError:
                content = '[需要安装 python-docx 库来读取 .docx 文件]'
        else:
            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception:
                return jsonify({'error': f'不支持的文件类型: {ext}'}), 400
    except Exception as e:
        return jsonify({'error': f'读取失败: {str(e)}'}), 500

    return jsonify({'path': path, 'content': content[:50000]})


@app.route('/api/file-raw', methods=['GET'])
def api_file_raw():
    """直接返回项目文件的原始内容（图片等）"""
    path = request.args.get('path', '').strip()
    if not path:
        return jsonify({'error': '缺少 path 参数'}), 400

    script_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    project_root = _os.path.dirname(script_dir) if _os.path.basename(script_dir) == '骰娘' else script_dir
    full_path = _os.path.join(project_root, path)
    if not _os.path.exists(full_path):
        abort(404)

    ext = _os.path.splitext(full_path)[1].lower()
    mimetypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.pdf': 'application/pdf',
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')
    return send_file(full_path, mimetype=mimetype)


# ━━━ 物品/装备搜索 API ━━━

@app.route('/api/items/search', methods=['GET'])
def api_search_items():
    """搜索 DND5E 物品表（武器/装备/物品）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    items = _load_items()
    qlower = query.lower()
    results = []
    for item in items:
        name = item['name']
        dtype = item['type']
        if qlower in name.lower() or qlower in dtype.lower():
            detail_parts = []
            if item.get('price'): detail_parts.append(f"💰{item['price']}")
            if item.get('damage'): detail_parts.append(f"⚔️{item['damage']}")
            if item.get('weight'): detail_parts.append(f"⚖️{item['weight']}")
            if item.get('type'): detail_parts.append(f"📦{item['type']}")
            # 随机事件物品的描述（括号内内容）
            if item.get('detail'): detail_parts.append(item['detail'])
            results.append({
                'name': name,
                'type': 'item',
                'detail': ' | '.join(detail_parts),
                'price': item.get('price', ''),
                'damage': item.get('damage', ''),
                'weight': item.get('weight', ''),
                'item_type': item.get('type', ''),
            })
        if len(results) >= 50:
            break

    return jsonify({'query': query, 'results': results, 'total': len(results)})


# ━━━ 自定义资料库 API ━━━
import json as _json

_CUSTOM_DIR = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'data', 'custom')


def _load_custom(kind: str) -> list[dict]:
    path = _os.path.join(_CUSTOM_DIR, f'{kind}.json')
    if not _os.path.exists(path):
        return []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return _json.load(f)
    except Exception:
        return []


def _save_custom(kind: str, data: list[dict]):
    _os.makedirs(_CUSTOM_DIR, exist_ok=True)
    path = _os.path.join(_CUSTOM_DIR, f'{kind}.json')
    with open(path, 'w', encoding='utf-8') as f:
        _json.dump(data, f, ensure_ascii=False, indent=2)


@app.route('/api/custom/<kind>', methods=['GET'])
def api_list_custom(kind):
    """列出自定义条目（spells / monsters / items）"""
    if kind not in ('spells', 'monsters', 'items'):
        return jsonify({'error': '无效类型'}), 400
    return jsonify({'results': _load_custom(kind)})


@app.route('/api/custom/<kind>', methods=['POST'])
def api_add_custom(kind):
    """添加自定义条目"""
    if kind not in ('spells', 'monsters', 'items'):
        return jsonify({'error': '无效类型'}), 400
    data = request.get_json() or {}
    if not data.get('name', '').strip():
        return jsonify({'error': '名称不能为空'}), 400

    existing = _load_custom(kind)
    entry = {'name': data['name'].strip()}
    if kind == 'spells':
        entry.update({
            'name_en': data.get('name_en', ''),
            'level': data.get('level', ''),
            'school': data.get('school', ''),
            'casting_time': data.get('casting_time', ''),
            'range': data.get('range', ''),
            'duration': data.get('duration', ''),
            'components': data.get('components', ''),
            'ritual': data.get('ritual', '否'),
            'concentration': data.get('concentration', '否'),
            'classes': data.get('classes', ''),
            'description': data.get('description', ''),
            'source': '自定义',
        })
    elif kind == 'monsters':
        entry.update({
            'name_en': data.get('name_en', ''),
            'cr': data.get('cr', ''),
            'size': data.get('size', ''),
            'type': data.get('type', ''),
            'legendary': data.get('legendary', ''),
            'detail_text': data.get('detail_text', ''),
            'source': '自定义',
        })
    elif kind == 'items':
        entry['description'] = data.get('description', '')
    existing.append(entry)
    _save_custom(kind, existing)
    return jsonify({'success': True, 'name': entry['name']})


@app.route('/api/custom/<kind>', methods=['DELETE'])
def api_delete_custom(kind):
    """删除自定义条目"""
    if kind not in ('spells', 'monsters', 'items'):
        return jsonify({'error': '无效类型'}), 400
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'error': '缺少 name 参数'}), 400
    existing = _load_custom(kind)
    new_list = [e for e in existing if e.get('name') != name]
    if len(new_list) == len(existing):
        return jsonify({'error': '未找到该条目'}), 404
    _save_custom(kind, new_list)
    return jsonify({'success': True})


# ━━━ 服务器端地图加载 ━━━

MAPS_DIR = _Path(__file__).parent.parent / 'maps'
MAPS_DIR.mkdir(exist_ok=True)
_ALLOWED_MAP_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}


@app.route('/maps/<path:filename>')
def serve_map(filename):
    """Serve map image files from the maps/ directory."""
    filepath = (MAPS_DIR / filename).resolve()
    if not str(filepath).startswith(str(MAPS_DIR.resolve())):
        return jsonify({'error': 'Access denied'}), 403
    if not filepath.exists() or not filepath.is_file():
        return jsonify({'error': 'File not found'}), 404
    ext = filepath.suffix.lower()
    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'}
    return send_file(str(filepath), mimetype=mime_map.get(ext, 'image/png'))


@app.route('/api/server-maps')
def api_server_maps():
    """List all map files in the server maps/ directory."""
    maps = []
    for f in sorted(MAPS_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in _ALLOWED_MAP_EXTS:
            size_kb = f.stat().st_size / 1024
            maps.append({
                'name': f.name,
                'size_kb': round(size_kb, 1),
                'url': f'/maps/{f.name}',
            })
    return jsonify({'maps': maps})


# ━━━ 服务器端资源库 ━━━

RESOURCES_DIR = _Path(__file__).parent.parent / 'resources'
RESOURCES_DIR.mkdir(exist_ok=True)

_RESOURCE_CATEGORIES = {
    '.pdf': ('📄 PDF', 'pdf'),
    '.jpg': ('🖼 图片', 'image'), '.jpeg': ('🖼 图片', 'image'), '.png': ('🖼 图片', 'image'),
    '.gif': ('🖼 图片', 'image'), '.webp': ('🖼 图片', 'image'), '.bmp': ('🖼 图片', 'image'),
    '.txt': ('📝 文本', 'text'), '.md': ('📝 文本', 'text'),
    '.docx': ('📋 文档', 'doc'), '.doc': ('📋 文档', 'doc'),
    '.xlsx': ('📊 表格', 'sheet'), '.xls': ('📊 表格', 'sheet'),
    '.mp3': ('🎵 音频', 'audio'), '.wav': ('🎵 音频', 'audio'), '.ogg': ('🎵 音频', 'audio'),
}


@app.route('/api/resources')
def api_resources():
    """List all files in the resources directory, optionally filtered by category."""
    category = request.args.get('cat', '')
    items = []
    for f in sorted(RESOURCES_DIR.iterdir()):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        info = _RESOURCE_CATEGORIES.get(ext, ('📦 其他', 'other'))
        if category and info[1] != category:
            continue
        size_kb = f.stat().st_size / 1024
        items.append({
            'name': f.name,
            'size_kb': round(size_kb, 1),
            'size_display': f'{size_kb:.1f}KB' if size_kb < 1024 else f'{size_kb/1024:.1f}MB',
            'ext': ext.lstrip('.'),
            'icon': info[0].split()[0],
            'category': info[1],
            'url': f'/resources/{f.name}',
        })
    return jsonify({'resources': items})


@app.route('/resources/<path:filename>')
def serve_resource(filename):
    """Serve resource files from the resources/ directory."""
    filepath = (RESOURCES_DIR / filename).resolve()
    if not str(filepath).startswith(str(RESOURCES_DIR.resolve())):
        return jsonify({'error': 'Access denied'}), 403
    if not filepath.exists() or not filepath.is_file():
        return jsonify({'error': 'File not found'}), 404
    return send_file(str(filepath))


# ━━━ 聊天系统 API ━━━

def _is_dm_ip(ip: str) -> bool:
    """Check if the IP belongs to the DM (localhost or server's own LAN IP).

    注意：使用 frp/内网穿透时，所有远程连接的 remote_addr 都显示为 127.0.0.1，
    因此 _is_dm_ip() 对所有人返回 True。此时角色判定依赖用户选择而非 IP。
    """
    # 如果有多个用户共享同一 IP（frp 特征），IP 检测不可靠，回退到用户选择
    global _online_users
    same_ip_users = [n for n, u in _online_users.items() if u.get('ip') == ip]
    if len(same_ip_users) > 1:
        return False  # frp 环境：IP 不能区分用户，不自动提权

    if ip in ('127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1'):
        return True
    try:
        import socket
        hostname = socket.gethostname()
        local_ips = socket.gethostbyname_ex(hostname)[2]
        if ip in local_ips:
            return True
    except Exception:
        pass
    return False


@app.route('/api/chat/send', methods=['POST'])
def api_chat_send():
    """Send a chat message."""
    global _dm_name, _dm_ip
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    text = data.get('text', '').strip()
    role = data.get('role', 'PL')
    color = data.get('color', '') or ''
    if not name or not text:
        return jsonify({'ok': False, 'error': 'Name and text required'})
    if len(text) > 2000:
        return jsonify({'ok': False, 'error': 'Message too long (max 2000 chars)'})

    client_ip = request.remote_addr or 'unknown'
    is_dm_ip = _is_dm_ip(client_ip)

    # 只有第一个localhost用户是DM，锁定后不更改
    if is_dm_ip and _dm_name is None:
        _dm_name = name
        _dm_ip = client_ip

    # 只有已注册的DM本人才显示DM标识
    is_dm = (name == _dm_name)

    # 如果有人声称是DM的名字但不是DM的IP，拒绝
    if name == _dm_name and not is_dm and _dm_ip is not None:
        is_dm = False  # 不是真正的DM

    # 同步在线列表中的角色
    if name in _online_users:
        role = _online_users[name].get('role', role)
    msg = {
        'name': name,
        'text': text,
        'time': _time.strftime('%H:%M:%S'),
        'is_dm': is_dm,
        'color': color,
        'role': role,
        'ip': client_ip,
        '_ts': _time.time(),
    }
    _chat_messages.append(msg)

    # ━━ 解析 @提及 ━━
    import re as _re
    mentioned_names = set()
    for m in _re.finditer(r'@(\S+)', text):
        target = m.group(1).rstrip('，,。.！!？?：:）)】】》>')
        if target and target != name:  # 不提及自己
            mentioned_names.add(target)

    # 为每个被提及的在线用户创建通知
    for target_name in mentioned_names:
        if target_name in _online_users:
            _mentions.append({
                'target_name': target_name,
                'from_name': name,
                'text': text,
                'time': _time.strftime('%H:%M:%S'),
                '_ts': _time.time(),
            })
    # Trim old mentions
    while len(_mentions) > MAX_MENTIONS:
        _mentions.pop(0)
    # Trim old messages
    while len(_chat_messages) > MAX_CHAT_MSGS:
        _chat_messages.pop(0)
    # 异步保存聊天记录到磁盘
    _threading.Thread(target=_save_chat_log, daemon=True).start()
    return jsonify({'ok': True, 'msg': msg})


@app.route('/api/chat/messages')
def api_chat_messages():
    """Get chat messages. ?since=<timestamp_float> for incremental polling."""
    since = request.args.get('since', '')
    if since:
        try:
            since_ts = float(since)
            new_msgs = [m for m in _chat_messages if m.get('_ts', 0) > since_ts]
            return jsonify({'ok': True, 'messages': new_msgs})
        except ValueError:
            pass
    return jsonify({'ok': True, 'messages': _chat_messages[-50:]})  # Last 50


# ━━━ DM 状态 API ━━━

# ━━━ 骰点广播到聊天室 ━━━

@app.route('/api/dice-broadcast', methods=['POST'])
def api_dice_broadcast():
    """将掷骰结果广播到聊天室。hidden=true 时只有DM可见。"""
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    text = data.get('text', '').strip()
    hidden = data.get('hidden', False)
    color = data.get('color', '#888888')
    role = data.get('role', 'PL')

    if not name or not text:
        return jsonify({'ok': False, 'error': 'Name and text required'})

    msg = {
        'name': name,
        'text': text,
        'time': _time.strftime('%H:%M:%S'),
        'is_dm': False,
        'color': color,
        'role': role,
        'dice_roll': True,
        'hidden': hidden,
        'ip': 'system',
        '_ts': _time.time(),
    }
    _chat_messages.append(msg)
    while len(_chat_messages) > MAX_CHAT_MSGS:
        _chat_messages.pop(0)
    _threading.Thread(target=_save_chat_log, daemon=True).start()
    return jsonify({'ok': True})


# ━━━ @提及通知 API ━━━

@app.route('/api/mentions', methods=['GET'])
def api_get_mentions():
    """获取当前用户的@提及通知。?name=<用户名>&since=<时间戳>"""
    global _mentions
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    since = request.args.get('since', '')
    since_ts = 0.0
    if since:
        try:
            since_ts = float(since)
        except ValueError:
            pass

    # 获取该用户未读的提及
    user_mentions = [m for m in _mentions
                     if m['target_name'] == name and m['_ts'] > since_ts]

    return jsonify({
        'ok': True,
        'mentions': user_mentions,
        'count': len(user_mentions),
    })


@app.route('/api/mentions/clear', methods=['POST'])
def api_clear_mentions():
    """清除某个用户的所有提及通知。"""
    global _mentions
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    _mentions = [m for m in _mentions if m['target_name'] != name]
    return jsonify({'ok': True})


@app.route('/api/dm-status', methods=['GET'])
def api_dm_status():
    """返回当前DM信息。若已有DM则按名匹配，否则按IP判定。"""
    global _dm_name, _dm_ip
    client_ip = request.remote_addr or 'unknown'
    name = request.args.get('name', '').strip()

    if _dm_name is not None:
        # 已有DM认领：只对DM本人返回true
        is_dm = (name == _dm_name)
    else:
        # DM空缺：localhost可认领
        is_dm = _is_dm_ip(client_ip)

    return jsonify({
        'is_dm': is_dm,
        'dm_name': _dm_name,
        'client_ip': client_ip,
    })


# ━━━ 房间/在线用户 API ━━━

@app.route('/api/room/join', methods=['POST'])
def api_room_join():
    """用户加入房间。"""
    global _dm_name, _online_users
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#00bcd4')
    role = data.get('role', 'PL')
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    client_ip = request.remote_addr or 'unknown'
    is_new = name not in _online_users

    # 尊重用户选择的身份：只有明确选择DM且无人认领时才成为DM
    if role == 'DM' and _dm_name is None:
        _dm_name = name
        _dm_ip = client_ip
    elif role == 'DM' and _dm_name is not None and _dm_name != name:
        role = 'PL'  # 已有人认领DM，后来者降为PL
    # localhost不再自动成为DM——尊重用户的选择

    _online_users[name] = {
        'ip': client_ip,
        'color': color,
        'role': role,
        'last_heartbeat': _time.time(),
        'joined_at': _time.time(),
    }

    # 发送系统消息
    if is_new and _dm_name and name != _dm_name:
        _chat_messages.append({
            'name': '系统',
            'text': f'🔵 {name} 进入房间',
            'time': _time.strftime('%H:%M:%S'),
            'is_dm': False,
            'color': '#888888',
            'ip': 'system',
            '_ts': _time.time(),
            'system': True,
        })

    return jsonify({
        'ok': True,
        'is_new': is_new,
        'is_dm': (name == _dm_name),  # 只有实际DM才返回true
        'dm_name': _dm_name,
        'online_count': len(_online_users),
    })


@app.route('/api/room/heartbeat', methods=['POST'])
def api_room_heartbeat():
    """心跳：更新在线状态，返回在线用户列表。若用户不在列表中则自动补登。"""
    global _online_users, _dm_name
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#00bcd4')
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    client_ip = request.remote_addr or 'unknown'

    if name in _online_users:
        _online_users[name]['last_heartbeat'] = _time.time()
        if color:
            _online_users[name]['color'] = color
    else:
        role = data.get('role', 'PL')
        if role == 'DM' and _dm_name is not None and _dm_name != name:
            role = 'PL'
        if role == 'DM' and _dm_name is None:
            _dm_name = name
            _dm_ip = client_ip
        _online_users[name] = {
            'ip': client_ip,
            'color': color,
            'role': role,
            'last_heartbeat': _time.time(),
            'joined_at': _time.time(),
        }

    return jsonify({
        'ok': True,
        'online_users': [
            {'name': n, 'color': u['color'], 'role': u.get('role', 'PL')}
            for n, u in _online_users.items()
        ],
        'online_count': len(_online_users),
    })


@app.route('/api/room/leave', methods=['POST'])
def api_room_leave():
    """用户离开房间。"""
    global _online_users, _dm_name
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    if name in _online_users:
        del _online_users[name]

        if _dm_name and name != _dm_name:
            _chat_messages.append({
                'name': '系统',
                'text': f'🔴 {name} 退出房间',
                'time': _time.strftime('%H:%M:%S'),
                'is_dm': False,
                'color': '#888888',
                'ip': 'system',
                '_ts': _time.time(),
                'system': True,
            })

    return jsonify({'ok': True, 'online_count': len(_online_users)})


# ━━━ 地图状态同步 API ━━━

@app.route('/api/map-state', methods=['GET'])
def api_get_map_state():
    """玩家拉取主机推送的地图状态（不含战争迷雾内容）。"""
    global _map_state, _map_state_ts
    if _map_state is None:
        return jsonify({'ok': False, 'error': '主机尚未推送地图状态'}), 404
    return jsonify({
        'ok': True,
        'state': _map_state,
        'timestamp': _map_state_ts,
    })


@app.route('/api/map-state', methods=['POST'])
def api_push_map_state():
    """主机推送地图状态到服务器。"""
    global _map_state, _map_state_ts, _dm_name, _dm_ip
    data = request.get_json(silent=True) or {}
    client_ip = request.remote_addr or 'unknown'

    # 只有DM可以推送
    if not _is_dm_ip(client_ip):
        return jsonify({'ok': False, 'error': '只有DM可以推送地图状态'}), 403

    # 注册DM（如果尚未注册）
    if _dm_name is None:
        _dm_name = data.get('dm_name', 'DM')

    _map_state = data.get('state', {})
    _map_state_ts = _time.time()
    return jsonify({'ok': True, 'timestamp': _map_state_ts})


# ━━━ 战斗状态同步 API ━━━

@app.route('/api/combat-state', methods=['GET'])
def api_get_combat_state():
    """获取共享的战斗状态"""
    global _combat_state, _combat_state_ts
    if _combat_state is None:
        return jsonify({'ok': False, 'error': '暂无战斗状态'}), 404
    return jsonify({'ok': True, 'state': _combat_state, 'timestamp': _combat_state_ts})


@app.route('/api/combat-state', methods=['POST'])
def api_push_combat_state():
    """推送战斗状态（任何人可推送，最新覆盖）"""
    global _combat_state, _combat_state_ts
    data = request.get_json(silent=True) or {}
    _combat_state = data.get('state', {})
    _combat_state_ts = _time.time()
    return jsonify({'ok': True, 'timestamp': _combat_state_ts})


# ━━━ 资源上传 API ━━━

@app.route('/api/resources/upload', methods=['POST'])
def api_upload_resource():
    """上传资源文件到服务器资源库。

    接受 multipart/form-data，字段名 'file'。
    支持图片、PDF、文本、Excel等格式。
    """
    if 'file' not in request.files:
        return jsonify({'error': '请上传文件（字段名: file）'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    # 白名单：只允许特定格式
    ext = _os.path.splitext(file.filename)[1].lower()
    allowed = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',  # 图片
               '.pdf',                                              # PDF
               '.doc', '.docx',                                     # 文档
               '.xls', '.xlsx',                                     # 表格
               '.txt', '.md'}                                       # 文本
    if ext not in allowed:
        return jsonify({'error': f'不支持的文件格式: {ext}，仅支持图片/PDF/文档/表格/TXT'}), 400

    # 限制文件大小 (50MB)
    max_size = 50 * 1024 * 1024
    file.seek(0, 2)  # 移动到文件末尾
    size = file.tell()
    file.seek(0)     # 回到开头
    if size > max_size:
        return jsonify({'error': f'文件过大 ({size/1024/1024:.1f}MB)，最大50MB'}), 400

    # 确保目录存在
    RESOURCES_DIR.mkdir(exist_ok=True)

    # 处理重名
    safe_name = file.filename
    dest = RESOURCES_DIR / safe_name
    counter = 1
    name_base, name_ext = _os.path.splitext(safe_name)
    while dest.exists():
        safe_name = f"{name_base}_{counter}{name_ext}"
        dest = RESOURCES_DIR / safe_name
        counter += 1

    try:
        file.save(str(dest))
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500

    # 确定文件类别
    info = _RESOURCE_CATEGORIES.get(ext, ('📦 其他', 'other'))
    size_kb = dest.stat().st_size / 1024

    return jsonify({
        'success': True,
        'name': safe_name,
        'original_name': file.filename,
        'size_kb': round(size_kb, 1),
        'size_display': f'{size_kb:.1f}KB' if size_kb < 1024 else f'{size_kb/1024:.1f}MB',
        'ext': ext.lstrip('.'),
        'icon': info[0].split()[0],
        'category': info[1],
        'url': f'/resources/{safe_name}',
    })


# ━━━ 资源删除 API ━━━

@app.route('/api/resources/<path:filename>', methods=['DELETE'])
def api_delete_resource(filename):
    """删除服务器资源库中的文件。"""
    filepath = (RESOURCES_DIR / filename).resolve()
    if not str(filepath).startswith(str(RESOURCES_DIR.resolve())):
        return jsonify({'error': 'Access denied'}), 403
    if not filepath.exists() or not filepath.is_file():
        return jsonify({'error': 'File not found'}), 404
    try:
        filepath.unlink()
        return jsonify({'success': True, 'name': filename})
    except Exception as e:
        return jsonify({'error': f'删除失败: {e}'}), 500


def run_server():
    """启动 Web 服务器 + WebSocket 协作画布"""
    from .ws_server import run_ws_server
    import threading
    ws_thread = threading.Thread(target=run_ws_server, daemon=True, name='ws-canvas')
    ws_thread.start()
    # use_reloader=False 避免 Flask 重载器创建子进程导致 WebSocket 端口冲突
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)


if __name__ == '__main__':
    run_server()
