"""尘封之卷 — Flask Web UI"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import os as _os
import io as _io
import builtins
import re as _re
from pathlib import Path as _Path

from flask import Flask, render_template, request, jsonify, send_file, abort, redirect
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
    list_character_groups, create_character_group,
    update_character_group, delete_character_group,
    set_character_group,
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
# 请求体大小上限（资源上传最大 50MB，留余量；防止恶意超大 JSON 耗尽内存）
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024

# ━━━ 静态文件缓存（浏览器缓存1小时，减少重复加载）━━━
@app.after_request
def add_cache_header(response):
    if response.content_type and ('text/css' in response.content_type or 'application/javascript' in response.content_type):
        response.cache_control.max_age = 3600
        response.cache_control.public = True
    return response

# ━━━ WebSocket 实时协作（flask-sock，与 HTTP 共用 5000 端口）━━━
from flask_sock import Sock
sock = Sock(app)

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

# ━━━ 共享画布状态（WebSocket 实时为主 + HTTP 轮询降级）━━
from .shared_state import (
    get_shared_canvas, get_shared_canvas_ts, update_shared_canvas,
    append_shared_strokes, apply_incremental, remove_shared_strokes,
    clear_shared_canvas, get_state_snapshot, get_version, save_layer_image,
)

_ws_connected: set = set()
_ws_lock = _threading.Lock()
_canvas_meta: dict = {'width': 5000, 'height': 5000}  # 画布尺寸元数据（不持久化）


def _ws_broadcast(payload: str, exclude=None):
    """向所有 WebSocket 客户端广播；发送失败的死连接立即清理。"""
    with _ws_lock:
        clients = list(_ws_connected)
    for client in clients:
        if client is exclude:
            continue
        try:
            client.send(payload)
        except Exception:
            with _ws_lock:
                _ws_connected.discard(client)


def _ws_send_init(ws):
    """向单个客户端发送全量初始状态（含版本号）。"""
    state = get_state_snapshot()
    state['canvas'] = dict(_canvas_meta)
    ws.send(_json.dumps({'type': 'init', 'state': state, 'version': state.get('_ver', 0)}))


def _apply_canvas_message(data: dict) -> tuple[int | None, bool]:
    """将一条画布消息应用到权威状态。

    返回 (新版本号或None, 是否需要广播)。
    """
    global _canvas_meta
    action_type = data.get('type')

    if action_type == 'stroke':
        return append_shared_strokes([data.get('data', {})]), True
    if action_type == 'strokes_remove':
        return remove_shared_strokes(data.get('data', [])), True
    if action_type == 'strokes_clear':
        return update_shared_canvas('strokes', []), True
    if action_type == 'op':
        # 操作语义消息: {type:'op', key, upsert:[...], remove:[ids]}
        payload = data.get('data', {}) if isinstance(data.get('data'), dict) else data
        key = payload.get('key')
        if key in ('layers', 'tokens', 'texts', 'fog'):
            ver = apply_incremental(key, payload.get('upsert') or [],
                                    payload.get('remove') or [])
            return ver, True
        return None, False
    if action_type in ('layers_update', 'tokens_update', 'texts_update', 'fog_update'):
        key = action_type.split('_')[0]
        return update_shared_canvas(key, data.get('data', [])), True
    if action_type == 'canvas_update':
        _canvas_meta = data.get('data', {'width': 5000, 'height': 5000})
        return get_version(), True
    if action_type == 'clear_all':
        ver = clear_shared_canvas()
        _canvas_meta = {'width': 5000, 'height': 5000}
        return ver, True
    return None, False


# ━━━ 确定性骰子帧同步消息处理 ━━━
def _handle_dice_sync_message(data: dict, ws) -> bool:
    """处理骰子帧同步消息。返回 True 表示已处理（不应继续走画布逻辑）。"""
    msg_type = data.get('type', '')

    if msg_type == 'dice_roll_result':
        print(f'[dice-sync] result: {data.get("roller")} {data.get("notation")}={data.get("total")}')
        _ws_broadcast(_json.dumps(data), exclude=ws)
        return True

    if msg_type == 'dice_roll_animate' or msg_type == 'dice_roll_det':
        _ws_broadcast(_json.dumps(data), exclude=ws)
        return True

    if msg_type == 'dice_roll':
        # 投掷者发起掷骰 → 广播同步开始给所有其他客户端
        seed = data.get('seed')
        dice = data.get('dice', [])
        notation = data.get('notation', '')
        roller = data.get('roller', 'anonymous')

        sync_start = _json.dumps({
            'type': 'dice_sync_start',
            'seed': seed,
            'dice': dice,
            'notation': notation,
            'roller': roller,
            'frameStart': 0,
            'timestamp': _time.time(),
        })
        # 广播给所有客户端（包括投掷者自己，用于确认）
        _ws_broadcast(sync_start)
        print(f'[dice-sync] 掷骰开始: {notation} (种子:{seed}, 投掷者:{roller})')
        return True

    if msg_type == 'dice_result':
        # 投掷者本地模拟完成 → 广播权威结果
        results = data.get('results', [])
        total = data.get('total', 0)
        seed = data.get('seed')
        notation = data.get('notation', '')
        roller = data.get('roller', 'anonymous')

        sync_result = _json.dumps({
            'type': 'dice_sync_result',
            'results': results,
            'total': total,
            'seed': seed,
            'notation': notation,
            'roller': roller,
            'timestamp': _time.time(),
        })
        _ws_broadcast(sync_result)
        print(f'[dice-sync] 掷骰结果: {notation} = {total} (种子:{seed})')
        return True

    if msg_type == 'dice_sync_frame':
        # 周期性帧号广播（可选：用于锁步同步校准）
        frame = data.get('frame', 0)
        sync_frame = _json.dumps({
            'type': 'dice_sync_frame',
            'frame': frame,
            'checksum': data.get('checksum', ''),
        })
        _ws_broadcast(sync_frame, exclude=ws)
        return True

    return False


@sock.route('/ws')
def ws_canvas(ws):
    """WebSocket 画布同步 + 骰子帧同步，与 HTTP 共用 5000 端口。frp 单隧道兼容。"""
    with _ws_lock:
        _ws_connected.add(ws)
    try:
        _ws_send_init(ws)

        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                data = _json.loads(raw)
            except (ValueError, TypeError):
                continue
            try:
                # 断线重连后的状态对账：版本不一致则单发全量
                if data.get('type') == 'sync':
                    if int(data.get('version', -1)) != get_version():
                        _ws_send_init(ws)
                    continue

                # ━━ 骰子帧同步消息 ━━
                if _handle_dice_sync_message(data, ws):
                    continue

                # ━━ 战斗状态同步 ━━
                if data.get('type') == 'combat_update':
                    state = data.get('state', {})
                    if state and state.get('combatants'):
                        global _combat_state, _combat_state_ts
                        _combat_state = state
                        _combat_state_ts = _time.time()
                        state['_ts'] = _combat_state_ts
                        _save_combat_state()
                        _ws_broadcast(_json.dumps(data), exclude=ws)
                    continue

                # ━━ 画布同步消息 ━━
                ver, should_broadcast = _apply_canvas_message(data)
                if should_broadcast:
                    if ver is not None:
                        data['_ver'] = ver
                    # 图层消息剥离 base64（图片应走 /api/shared-canvas/layer-image 上传）
                    if data.get('type') == 'layers_update':
                        for l in data.get('data', []):
                            if isinstance(l, dict) and l.get('url') and l.get('dataURL'):
                                l['dataURL'] = ''
                    _ws_broadcast(_json.dumps(data), exclude=ws)
            except Exception as e:
                print(f'[ws] 处理消息失败: {type(e).__name__}: {e}')
    finally:
        with _ws_lock:
            _ws_connected.discard(ws)


@app.route('/api/shared-canvas', methods=['GET'])
def api_get_shared_canvas():
    """获取共享画布状态。

    支持 ?since=<时间戳> 或 ?since_ver=<版本号>；未变化时只返回轻量应答，
    不携带全量状态（P1-2：降低轮询流量）。
    """
    ts = get_shared_canvas_ts()
    ver = get_version()

    since_ver = request.args.get('since_ver')
    if since_ver is not None:
        try:
            unchanged = int(since_ver) == ver
        except ValueError:
            unchanged = False
    else:
        try:
            since_ts = float(request.args.get('since', '0'))
        except ValueError:
            since_ts = 0.0
        unchanged = not (ts > since_ts)

    if unchanged:
        return jsonify({'ok': True, 'changed': False, 'timestamp': ts, 'version': ver})

    state = get_state_snapshot()
    state['canvas'] = dict(_canvas_meta)
    # 兼容旧数据：仍残留 dataURL 的图层替换为图片端点 URL，不内嵌 base64
    for l in state.get('layers', []):
        if isinstance(l, dict) and l.get('dataURL'):
            if not l.get('url'):
                l['url'] = '/api/shared-canvas/layer/' + str(l.get('id'))
            l['dataURL'] = ''
    return jsonify({
        'ok': True,
        'state': state,
        'timestamp': ts,
        'version': state.get('_ver', ver),
        'changed': True,
    })


@app.route('/api/shared-canvas', methods=['POST'])
def api_push_shared_canvas():
    """推送画布更新（HTTP 降级通道，WS 断开时使用）。

    支持 _mode: 'full'（全量替换）或 'incremental'（按 id 合并）；
    增量模式可带 _removed: {key: [id, ...]} 实现删除同步（P1-1）。
    """
    data = request.get_json(silent=True) or {}
    updates = data.get('updates', data)
    mode = updates.get('_mode', data.get('_mode', 'incremental'))
    removed = updates.get('_removed') or data.get('_removed') or {}

    ver = get_version()
    for key in ['strokes', 'layers', 'tokens', 'texts', 'fog']:
        items = updates.get(key)
        removed_ids = removed.get(key) or []
        if items is None and not removed_ids:
            continue

        if mode == 'full' or key == 'fog':
            ver = update_shared_canvas(key, items or [])
        elif key == 'strokes':
            if items:
                ver = append_shared_strokes(items)
            if removed_ids:
                ver = remove_shared_strokes(removed_ids)
        else:
            ver = apply_incremental(key, items or [], removed_ids)

    # 有变更则通知 WS 在线客户端拉取（HTTP 推送方通常自身无 WS 连接）
    return jsonify({'ok': True, 'timestamp': get_shared_canvas_ts(), 'version': ver})


@app.route('/api/shared-canvas/layer-image', methods=['POST'])
def api_upload_layer_image():
    """上传图层图片（P0-1：图片与画布状态分离，只在状态中保存 URL）。

    请求体: {id: <图层id>, dataURL: 'data:image/png;base64,...'}
    响应:  {ok: true, url: '/maps/layers/xxx.png'}
    """
    data = request.get_json(silent=True) or {}
    layer_id = data.get('id')
    data_url = data.get('dataURL', '')
    if layer_id is None or not data_url.startswith('data:image'):
        return jsonify({'ok': False, 'error': '参数无效：需要 id 和 dataURL'}), 400
    url = save_layer_image(layer_id, data_url)
    if not url:
        return jsonify({'ok': False, 'error': '图片保存失败（格式不支持或磁盘错误）'}), 500
    return jsonify({'ok': True, 'url': url})


@app.route('/api/shared-canvas/layer/<int:layer_id>', methods=['GET'])
def api_get_layer_image(layer_id):
    """获取共享画布图层图片（兼容端点；dataURL 为空时回退到 maps/layers/ 文件）。"""
    canvas = get_shared_canvas()
    for layer in canvas.get('layers', []):
        if layer.get('id') == layer_id:
            data_url = layer.get('dataURL', '')
            if data_url:
                import base64
                try:
                    header, b64 = data_url.split(',', 1)
                    img_data = base64.b64decode(b64)
                except Exception:
                    break  # dataURL 损坏，尝试文件回退
                else:
                    mime = 'image/png'
                    if 'image/jpeg' in header or 'image/jpg' in header:
                        mime = 'image/jpeg'
                    elif 'image/gif' in header:
                        mime = 'image/gif'
                    elif 'image/webp' in header:
                        mime = 'image/webp'
                    return app.response_class(img_data, mimetype=mime)
            # dataURL 为空或损坏，回退到 maps/layers/ 文件
            for ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
                fpath = MAPS_DIR / 'layers' / f'{layer_id}{ext}'
                if fpath.exists() and fpath.is_file():
                    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                                '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'}
                    return send_file(str(fpath), mimetype=mime_map.get(ext, 'image/png'))
            break
    abort(404)


# ━━━ 战斗状态同步 ━━━
_combat_state: dict | None = None  # 共享的战斗状态
_combat_state_ts: float = 0.0


def get_active():
    global active_char_id
    if active_char_id is None:
        return None
    return get_character(active_char_id)


# ━━━ 页面路由 ━━━


# 临时：为Vite chunk文件提供/assets/路径服务
@app.route('/assets/<path:filename>')
def serve_vite_assets(filename):
    from flask import send_from_directory
    import os
    asset_dir = os.path.join(os.path.dirname(__file__), 'static', 'dice-v2', 'assets')
    return send_from_directory(asset_dir, filename)

@app.route('/')
def index():
    """官网门户首页"""
    return render_template('portal/index.html')


@app.route('/test4')
def test4_page():
    """北境雪原"""
    return render_template('test4.html')


@app.route('/user')
def user_page():
    """用户中心"""
    return render_template('portal/user.html')


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


@app.route('/dice3d-e')
def dice3d_e_page():
    """3D 确定性多人骰子"""
    return render_template('dice3d-e.html')


@app.route('/dice3d')
def dice3d_redirect():
    """重定向到新版3D骰子页面，保留查询参数"""
    qs = request.query_string.decode('utf-8')
    target = '/dice3d-e' + ('?' + qs if qs else '')
    return redirect(target)


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
    char_id = data.get('char_id')  # 可选：指定角色（优先级高于全局 active_char_id）

    char = None
    if char_id:
        try:
            char = get_character(int(char_id))
        except (ValueError, TypeError):
            char = get_character(char_id)
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
    """列出角色和分组。DM 可看到全部；PL 只能看到自己创建/导入的角色和分组。"""
    name = request.args.get('name', '').strip()
    role = request.args.get('role', 'PL')
    client_ip = request.remote_addr or ''

    # DM 可看全部（明确声明为 DM 才放行，不再按 IP 自动提权）
    if role == 'DM':
        chars = list_characters()
        groups = list_character_groups()
    elif name:
        # PL 有用户名 → 只看自己创建的
        chars = list_characters(created_by=name)
        groups = list_character_groups(created_by=name)
    else:
        # PL 未设置用户名 → 看不到任何角色（安全性）
        chars = []
        groups = []

    return jsonify({'characters': chars, 'groups': groups})


@app.route('/api/characters/reorder', methods=['POST'])
def api_reorder_characters():
    """角色列表拖动排序。接收按新顺序排列的角色 ID 列表。"""
    data = request.get_json(silent=True) or {}
    ordered_ids = data.get('ids', [])
    if not ordered_ids or not isinstance(ordered_ids, list):
        return jsonify({'error': '请提供角色ID列表'}), 400

    from core.character import get_db
    conn = get_db()
    cursor = conn.cursor()
    for i, char_id in enumerate(ordered_ids):
        cursor.execute("UPDATE characters SET sort_order = ? WHERE id = ?", (i, char_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ━━━ 角色分组管理 ━━━

@app.route('/api/character-groups', methods=['POST'])
def api_create_group():
    """创建角色分组"""
    data = request.get_json(silent=True) or {}
    name = data.get('name', '新分组').strip()
    if not name:
        return jsonify({'error': '分组名不能为空'}), 400
    created_by = data.get('created_by', '')
    gid = create_character_group(name, created_by)
    return jsonify({'ok': True, 'id': gid, 'name': name})


@app.route('/api/character-groups/<int:group_id>', methods=['PUT'])
def api_update_group(group_id):
    """更新分组（重命名）"""
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '分组名不能为空'}), 400
    update_character_group(group_id, name=name)
    return jsonify({'ok': True})


@app.route('/api/character-groups/<int:group_id>', methods=['DELETE'])
def api_delete_group(group_id):
    """删除分组，角色移回未分组"""
    delete_character_group(group_id)
    return jsonify({'ok': True})


@app.route('/api/character-groups/reorder', methods=['POST'])
def api_reorder_groups():
    """分组拖动排序"""
    data = request.get_json(silent=True) or {}
    ordered_ids = data.get('ids', [])
    if not ordered_ids or not isinstance(ordered_ids, list):
        return jsonify({'error': '请提供分组ID列表'}), 400
    for i, gid in enumerate(ordered_ids):
        update_character_group(gid, sort_order=i)
    return jsonify({'ok': True})


@app.route('/api/character/<int:char_id>/group', methods=['PUT'])
def api_set_char_group(char_id):
    """将角色移入/移出分组"""
    data = request.get_json(silent=True) or {}
    group_id = data.get('group_id')  # None 表示移回未分组
    set_character_group(char_id, group_id)
    return jsonify({'ok': True})


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
    group_id = data.get('group_id')

    if not name:
        return jsonify({'error': '角色名不能为空'}), 400

    char_id = create_character(name, level, cls, race, background, created_by=created_by, group_id=group_id)
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
    """设置技能熟练和加值"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    skill_name = data.get('skill', '').strip()
    is_proficient = bool(data.get('proficient', True))
    is_expertise = bool(data.get('expertise', False))
    bonus = int(data.get('bonus', 0) or 0)

    skill = normalize_skill(skill_name)
    if not skill:
        return jsonify({'error': f'无效技能: {skill_name}'}), 400

    from core.character import set_skill_proficiency as _set_skill
    ok = _set_skill(char['id'], skill, is_proficient or is_expertise, is_expertise, bonus)
    if not ok:
        return jsonify({'error': '设置失败'}), 400

    return jsonify({
        'success': True,
        'skill': skill,
        'is_proficient': is_proficient or is_expertise,
        'is_expertise': is_expertise,
        'bonus': bonus,
    })


@app.route('/api/character/<name_or_id>/save-prof', methods=['POST'])
def api_toggle_save_prof(name_or_id):
    """设置豁免熟练和加值"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    ability_name = data.get('ability', '').strip()
    is_proficient = bool(data.get('proficient', True))
    save_bonus = int(data.get('save_bonus', 0) or 0)

    ability = normalize_ability(ability_name)
    if not ability:
        return jsonify({'error': f'无效属性: {ability_name}'}), 400

    from core.character import set_save_proficiency as _set_save
    ok = _set_save(char['id'], ability, is_proficient, save_bonus)
    if not ok:
        return jsonify({'error': '设置失败'}), 400

    return jsonify({
        'success': True, 'ability': ability,
        'is_proficient': is_proficient, 'save_bonus': save_bonus,
    })


# ━━━ 角色特性 API（职业能力/专长/种族特性/特殊能力/其他）━━━

@app.route('/api/character/<name_or_id>/features/<category>', methods=['GET'])
def api_get_features(name_or_id, category):
    """获取角色某类特性"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404
    features = char.get('features', {}).get(category, [])
    return jsonify({'features': features})


@app.route('/api/character/<name_or_id>/features/<category>', methods=['POST'])
def api_add_feature(name_or_id, category):
    """添加角色特性"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '特性名不能为空'}), 400

    from core.character import add_feature as _add_feat
    fid = _add_feat(char['id'], category, name, data.get('description', ''))
    return jsonify({'success': True, 'id': fid, 'name': name})


@app.route('/api/character/<name_or_id>/features/<int:feature_id>', methods=['PUT'])
def api_update_feature(name_or_id, feature_id):
    """更新特性"""
    data = request.get_json(silent=True) or {}
    from core.character import update_feature as _upd_feat
    ok = _upd_feat(feature_id, **{k: v for k, v in data.items() if k in ('name', 'description', 'category')})
    if not ok:
        return jsonify({'error': '更新失败'}), 400
    return jsonify({'success': True})


@app.route('/api/character/<name_or_id>/features/<int:feature_id>', methods=['DELETE'])
def api_delete_feature(name_or_id, feature_id):
    """删除特性"""
    from core.character import delete_feature as _del_feat
    ok = _del_feat(feature_id)
    if not ok:
        return jsonify({'error': '删除失败'}), 404
    return jsonify({'success': True})


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


@app.route('/api/character/<name_or_id>/weapon/<int:weapon_id>', methods=['PUT'])
def api_update_weapon(name_or_id, weapon_id):
    """更新武器字段（名称/命中/伤害/类型/描述/效果）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    field = data.get('field', '')
    value = data.get('value', '')

    allowed = ['name', 'attack_bonus', 'damage', 'damage_type', 'description', 'effect']
    if field not in allowed:
        return jsonify({'error': f'不允许修改字段: {field}'}), 400

    from core.character import get_db
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            f"UPDATE weapons SET {field} = ? WHERE id = ? AND character_id = ?",
            (value, weapon_id, char['id'])
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': '武器不存在或不属于该角色'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
    return jsonify({'success': True})


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
    """更新物品（数量/字段均可）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json() or {}
    field = data.get('field', '')
    value = data.get('value')

    from core.character import update_item_quantity as _update_qty, remove_item as _remove_item, get_db

    # 字段编辑模式
    if field:
        allowed = ['item_name', 'quantity', 'location', 'weight', 'description', 'effect']
        if field not in allowed:
            return jsonify({'error': f'不允许修改字段: {field}'}), 400
        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE inventory SET {field} = ? WHERE id = ? AND character_id = ?",
                (value, item_id, char['id'])
            )
            conn.commit()
            if cursor.rowcount == 0:
                return jsonify({'error': '物品不存在'}), 404
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()
        return jsonify({'success': True})

    # 数量模式（兼容旧接口）
    qty = int(data.get('quantity', 1))
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


@app.route('/api/character/<name_or_id>/copy', methods=['POST'])
def api_copy_character(name_or_id):
    """复制角色"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json(silent=True) or {}
    new_name = data.get('name', '').strip()

    from core.character import copy_character as _copy
    new_id = _copy(char['id'], new_name)
    new_char = get_character(new_id)
    return jsonify({'id': new_id, 'name': new_char['name']})


@app.route('/api/character/<name_or_id>/field', methods=['PUT'])
def api_update_character_field(name_or_id):
    """更新角色单个字段（AC/速度/熟练/身高/体重/被动察觉等）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json(silent=True) or {}
    field = data.get('field', '').strip()
    value = data.get('value')

    if not field:
        return jsonify({'error': '缺少 field 参数'}), 400

    # 允许更新的字段
    int_fields = {
        'ac', 'speed', 'proficiency_bonus', 'passive_perception', 'initiative_bonus',
        'level', 'spell_save_dc', 'spell_attack_bonus', 'hp_max', 'hp_current', 'temp_hp',
    }
    str_fields = {
        'height', 'weight_field', 'name', 'class', 'race', 'subrace',
        'alignment', 'faith', 'gender', 'resistances', 'key_abilities',
    }
    if field not in int_fields and field not in str_fields:
        return jsonify({'error': f'不允许修改字段: {field}'}), 400

    # 数值字段
    if field in int_fields:
        try:
            value = int(value)
        except (TypeError, ValueError):
            return jsonify({'error': f'{field} 必须是整数'}), 400
    else:
        value = str(value)

    # HP限制：当前HP不能超过上限
    if field == 'hp_current':
        hp_max = char.get('hp_max', 10)
        value = max(0, min(value, hp_max))
    elif field == 'hp_max':
        value = max(1, value)

    update_character(char['id'], **{field: value})
    return jsonify({'success': True, 'field': field, 'value': value})


@app.route('/api/character/<name_or_id>/spell-slots', methods=['PUT'])
def api_update_spell_slots(name_or_id):
    """直接设置法术位（x/y格式，x为当前已用，y为最大）"""
    char = _resolve_char(name_or_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    data = request.get_json(silent=True) or {}
    slots = data.get('slots', {})  # {'1': {'max': 4, 'used': 2}, '2': {...}}

    conn = get_db_conn()
    cursor = conn.cursor()

    # 确保所有1-9环都存在（先删后插，兼容旧表无唯一约束）
    for level in range(1, 10):
        level_str = str(level)
        slot_data = slots.get(level_str, {})
        max_slots = int(slot_data.get('max', 0))
        used_slots = int(slot_data.get('used', 0))
        used_slots = max(0, min(used_slots, max_slots))  # x不能超过y

        # 检查是否存在
        cursor.execute(
            "SELECT id FROM spell_slots WHERE character_id = ? AND slot_level = ?",
            (char['id'], level_str))
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE spell_slots SET max_slots = ?, used_slots = ? WHERE id = ?",
                (max_slots, used_slots, existing['id']))
        else:
            cursor.execute(
                "INSERT INTO spell_slots (character_id, slot_level, max_slots, used_slots) VALUES (?, ?, ?, ?)",
                (char['id'], level_str, max_slots, used_slots))

    conn.commit()
    conn.close()
    return jsonify({'success': True})


def get_db_conn():
    """获取数据库连接（用于直接SQL操作）"""
    import sqlite3
    from pathlib import Path
    db_path = Path(__file__).parent.parent / "data" / "characters.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


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


@app.route('/api/character/<name_or_id>/portrait/upload', methods=['POST'])
def api_upload_portrait(name_or_id):
    """上传角色头像图片到资源库头像子文件夹，自动命名为角色名。"""
    try:
        char_id = int(name_or_id)
    except ValueError:
        char = get_character(name_or_id)
        if not char:
            return jsonify({'error': '角色不存在'}), 404
        char_id = char['id']

    char = get_character(char_id)
    if not char:
        return jsonify({'error': '角色不存在'}), 404

    if 'file' not in request.files:
        return jsonify({'error': '请选择图片文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    ext = _os.path.splitext(file.filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'):
        return jsonify({'error': f'不支持的图片格式: {ext}'}), 400

    # 保存到 resources/头像/<角色名><ext>
    avatar_dir = RESOURCES_DIR / '头像'
    avatar_dir.mkdir(exist_ok=True)
    safe_name = ''.join(c for c in char['name'] if c not in r'<>:"/\|?*')
    filename = f'{safe_name}{ext}'
    save_path = avatar_dir / filename

    try:
        file.save(str(save_path))
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500

    # 更新数据库中的头像路径
    update_character(char_id, portrait_path=str(save_path))

    return jsonify({
        'success': True,
        'path': str(save_path),
        'url': f'/resources/头像/{filename}',
    })


@app.route('/api/spells/search', methods=['GET'])
def api_search_spells_list():
    """模糊搜索法术列表（按匹配质量排序）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    from core.chm_search import search_spell as _search_spell, _calc_spell_score

    scored_items = []
    seen_names = set()

    # 1. CHM法术（自带评分排序）
    for s in _search_spell(query):
        name = s.get('name_cn', s.get('name', '?'))
        if name in seen_names: continue
        score = _calc_spell_score(query, name, s.get('name_en', ''), s.get('name', ''), s.get('tags', ''))
        seen_names.add(name)
        scored_items.append((score, {
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
            'detail': f"{s.get('level','?')}环 {s.get('school','?')} | {s.get('classes','?')}",
        }))

    # 2. 自定义法术（评分排序）
    for e in _load_custom('spells'):
        name = e['name']
        if name in seen_names: continue
        score = _calc_spell_score(query, name, e.get('name_en', ''))
        if score > 0:
            seen_names.add(name)
            scored_items.append((score, {
                'name': name, 'name_en': e.get('name_en', ''),
                'level': e.get('level', ''), 'school': e.get('school', ''),
                'classes': e.get('classes', ''), 'source': '自定义',
                'detail': e.get('description', '')[:100],
            }))

    # 按得分降序
    scored_items.sort(key=lambda x: x[0], reverse=True)
    items = [item for _, item in scored_items]

    return jsonify({'query': query, 'results': items[:200], 'total': len(items)})


@app.route('/api/spell/<name>', methods=['GET'])
def api_search_spell(name):
    """查询法术（自定义数据优先）"""
    # 1. 先检查自定义法术
    for e in _load_custom('spells'):
        if e['name'].lower() == name.lower():
            return jsonify({
                'name': e['name'],
                'name_en': e.get('name_en', ''),
                'level': e.get('level', ''),
                'school': e.get('school', ''),
                'casting_time': e.get('casting_time', ''),
                'range': e.get('range', ''),
                'duration': e.get('duration', ''),
                'components': e.get('components', ''),
                'ritual': e.get('ritual', ''),
                'concentration': e.get('concentration', ''),
                'classes': e.get('classes', ''),
                'detail_text': e.get('description', ''),
                'source': e.get('source', '自定义'),
            })

    # 2. CHM搜索
    spell = search_spell(name)
    if not spell:
        return jsonify({'error': '未找到法术'}), 404
    return jsonify(spell)


@app.route('/api/monsters/search', methods=['GET'])
def api_search_monsters():
    """模糊搜索怪物列表（按匹配质量排序——匹配字数越多越靠前）"""
    query = request.args.get('q', '').strip()
    if len(query) < 1:
        return jsonify({'error': '请输入搜索关键词'}), 400

    from core.chm_search import search_monster as _search_monster, _calc_match_score

    scored_items = []  # (score, item_dict)
    seen_names = set()

    def _make_item(name, name_en='', cr='', size='', mtype='', source='', detail='', detail_text='', detail_link=''):
        return {
            'name': name, 'name_en': name_en, 'cr': cr,
            'size': size, 'type': mtype, 'source': source,
            'detail': detail or f"CR:{cr or '?'} {size or ''} {mtype or ''}",
            'detail_text': detail_text,
            'detail_link': detail_link,
        }

    # 1. 自定义怪物（评分排序）
    for e in _load_custom('monsters'):
        name = e['name']
        if name in seen_names: continue
        score = _calc_match_score(query, name, e.get('name_en', ''))
        if score > 0:
            seen_names.add(name)
            scored_items.append((score, _make_item(
                name, e.get('name_en', ''), e.get('cr', ''), e.get('size', ''),
                e.get('type', ''), '自定义', '', e.get('detail_text', ''),
            )))

    # 2. CHM 怪物（已自带评分排序）
    for m in _search_monster(query):
        name = m.get('name_cn', m.get('name', '?'))
        if name in seen_names: continue
        score = _calc_match_score(query, name, m.get('name_en', ''))
        if score > 0:
            seen_names.add(name)
            scored_items.append((score, _make_item(
                name, m.get('name_en', ''), m.get('cr', ''), m.get('size', ''),
                m.get('type', ''), m.get('source', ''),
                detail_link=m.get('detail_link', ''),
            )))

    # 3. SRD 怪物（评分排序）
    try:
        from utils.data_loader import load_monsters as _load_srd
        for m in _load_srd():
            name = m.get('name', '')
            if name in seen_names: continue
            score = _calc_match_score(query, name, m.get('name_en', ''))
            if score > 0:
                seen_names.add(name)
                scored_items.append((score, _make_item(
                    name, m.get('name_en', ''), m.get('cr', ''), m.get('size', ''),
                    m.get('type', ''), 'SRD',
                )))
    except Exception:
        pass

    # 按得分降序排列
    scored_items.sort(key=lambda x: x[0], reverse=True)
    items = [item for _, item in scored_items]

    return jsonify({'query': query, 'results': items[:200], 'total': len(items)})


@app.route('/api/monster/<name>', methods=['GET'])
def api_search_monster(name):
    """查询怪物（自定义数据优先，CHM 次之，SRD 兜底）"""
    # 1. 先检查自定义怪物（精确/包含匹配优先）
    custom_monsters = _load_custom('monsters')
    for e in custom_monsters:
        if e['name'].lower() == name.lower():
            return jsonify({
                'name': e['name'],
                'name_en': e.get('name_en', ''),
                'cr': e.get('cr', '?'),
                'size': e.get('size', '?'),
                'type': e.get('type', '?'),
                'source': e.get('source', '自定义'),
                'legendary': e.get('legendary', ''),
                'detail_text': e.get('detail_text', ''),
                'source_db': 'custom',
            })
    for e in custom_monsters:
        if name.lower() in e['name'].lower():
            return jsonify({
                'name': e['name'],
                'name_en': e.get('name_en', ''),
                'cr': e.get('cr', '?'),
                'size': e.get('size', '?'),
                'type': e.get('type', '?'),
                'source': e.get('source', '自定义'),
                'legendary': e.get('legendary', ''),
                'detail_text': e.get('detail_text', ''),
                'source_db': 'custom',
            })

    # 2. 从 CHM 获取完整详情（含 detail_text）
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

    # 3. CHM 模糊搜索
    chm_results = chm_search_monster(name)
    if chm_results:
        m = chm_results[0]
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

    # 4. 回退到 SRD
    monster = search_monster(name)
    if not monster:
        return jsonify({'error': '未找到怪物'}), 404
    return jsonify({**monster, 'source_db': 'srd'})


@app.route('/api/search', methods=['GET'])
def api_search():
    """综合搜索（CHM 资料库 + 项目文件 + 自定义资料库，按匹配质量排序）"""
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify({'error': '关键词至少2个字'}), 400

    from core.chm_search import (
        search_all_combined as _combined,
        search_project_files as _search_files,
        _calc_match_score,
        _calc_spell_score,
    )

    scored_items = []  # (score, item_dict)
    seen = set()

    def _add(score, item):
        name = item.get('name', '')
        if name in seen: return
        seen.add(name)
        scored_items.append((score, item))

    # 1. 自定义怪物优先（评分排序，排在最前面）
    for e in _load_custom('monsters'):
        name = e['name']
        score = _calc_match_score(query, name, e.get('name_en', ''))
        if score > 0:
            _add(score + 200, {  # 自定义数据高优先级
                'type': 'monster',
                'name': name,
                'name_en': e.get('name_en', ''),
                'detail': e.get('detail_text', '')[:100],
                'cr': e.get('cr', ''),
                'source': e.get('source', '自定义'),
            })

    # 2. 自定义法术优先（评分排序）
    for e in _load_custom('spells'):
        name = e['name']
        score = _calc_spell_score(query, name, e.get('name_en', ''))
        if score > 0:
            _add(score + 200, {
                'type': 'spell',
                'name': name,
                'name_en': e.get('name_en', ''),
                'detail': e.get('description', '')[:100],
                'level': e.get('level', ''),
                'school': e.get('school', ''),
                'source': e.get('source', '自定义'),
            })

    # 3. CHM综合搜索（自带评分，去重）
    for r in _combined(query):
        rtype = r.get('type', '')
        name = r.get('name_cn', r.get('name', r.get('title', '?')))
        base_score = 85
        _add(base_score, {
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

    # 4. 项目文件
    files = _search_files(query)
    for i, f in enumerate(files[:10]):
        name = f.get('name', '?')
        snippet = f.get('snippet', '') or ''
        cat = f.get('cat_label', '')
        parent = f.get('parent', '')
        detail_parts = []
        if snippet: detail_parts.append(snippet[:200])
        if cat: detail_parts.append(cat)
        if parent: detail_parts.append(parent)
        _add(max(0, 40 - i), {
            'type': 'file',
            'name': name,
            'detail': ' | '.join(detail_parts) if detail_parts else '',
            'path': f.get('path', ''),
            'ext': f.get('ext', ''),
            'snippet': snippet,
        })

    # 5. DND物品表（评分排序） + 自定义物品优先
    item_data = _load_items()
    for it in item_data:
        name = it['name']
        score = _calc_match_score(query, name, it.get('name_en', ''))
        if score > 0 and len(scored_items) < 200:
            detail_parts = []
            if it['price']: detail_parts.append(f"💰{it['price']}")
            if it['damage']: detail_parts.append(f"⚔️{it['damage']}")
            if it['weight']: detail_parts.append(f"⚖️{it['weight']}")
            if it['type']: detail_parts.append(f"📦{it['type']}")
            _add(score + 30, {
                'type': 'item',
                'name': name,
                'detail': ' | '.join(detail_parts),
            })

    # 6. 自定义物品
    for e in _load_custom('items'):
        name = e['name']
        score = _calc_match_score(query, name)
        if score > 0 and len(scored_items) < 200:
            _add(score + 40, {
                'type': 'item',
                'name': name,
                'detail': e.get('description', '')[:100],
                'source': '自定义',
            })

    # 按得分降序排列
    scored_items.sort(key=lambda x: x[0], reverse=True)
    items = [item for _, item in scored_items]

    return jsonify({'query': query, 'results': items[:200], 'total': len(items)})


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

    # ━━ 将无法直接填入的怪物详细数据写入背景特性 ━━
    detail_text = data.get('detail_text', '')
    source = data.get('source', '')
    monster_size = data.get('size', '')
    monster_type = data.get('type', '')
    legendary = data.get('legendary', '')

    bg_parts = []
    if detail_text:
        bg_parts.append(f"【怪物数据】\n{detail_text}")
    else:
        info_parts = []
        if source: info_parts.append(f"来源：{source}")
        if monster_size: info_parts.append(f"体型：{monster_size}")
        if monster_type: info_parts.append(f"类型：{monster_type}")
        if legendary == '有': info_parts.append("传奇动作：有")
        if cr_str: info_parts.append(f"挑战等级：{cr_str}")
        if info_parts:
            bg_parts.append(f"【怪物数据】\n{' | '.join(info_parts)}")
            # 估算属性信息
            bg_parts.append(f"估算属性：力{abilities['str']} 敏{abilities['dex']} 体{abilities['con']} 智{abilities['int']} 感{abilities['wis']} 魅{abilities['cha']}")

    if bg_parts:
        from core.character import set_background
        set_background(char_id, background_feature='\n\n'.join(bg_parts))

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
    if not file or not file.filename or file.filename.strip() == '':
        return jsonify({'error': '未选择文件'}), 400

    # 检查文件扩展名
    try:
        ext = _os.path.splitext(file.filename)[1].lower()
    except Exception:
        return jsonify({'error': '无法解析文件名'}), 400
    if ext not in ('.xlsx', '.xls'):
        return jsonify({'error': f'不支持的文件类型: {ext}，请上传 .xlsx 或 .xls 文件'}), 400

    # 保存临时文件
    import tempfile
    tmp = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
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
        if tmp is not None:
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


# ━━━ 事件统计数据 ━━━
# 数据模型: {用户名: {表名: {事件内容: 次数}}}
# 例如: {"张三": {"随机环境": {"雪坑（需要过被动察觉...）": 3, "暴风雪...": 2}}}
_EVENT_STATS_FILE = _Path(__file__).parent / 'event_stats.json'


def _load_event_stats() -> dict:
    """加载所有用户的事件统计数据"""
    try:
        if _EVENT_STATS_FILE.exists():
            with open(_EVENT_STATS_FILE, 'r', encoding='utf-8') as f:
                return _json.load(f)
    except Exception:
        pass
    return {}


def _save_event_stats(stats: dict):
    """保存事件统计数据到文件"""
    try:
        with open(_EVENT_STATS_FILE, 'w', encoding='utf-8') as f:
            _json.dump(stats, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _extract_event_name(text: str) -> str:
    """从事件描述文本中提取简短的事件名称。

    例如 "商队（可交易）" → "商队"
         "雪坑（需要过被动察觉...）" → "雪坑"
         "冰原狼（1d2只）" → "冰原狼"
    """
    if not text:
        return text
    # 取括号前的内容作为事件名称
    idx = text.find('（')
    if idx > 0:
        return text[:idx].strip()
    idx = text.find('(')
    if idx > 0:
        return text[:idx].strip()
    return text.strip()


@app.route('/api/events/stats', methods=['POST'])
def api_record_event():
    """记录事件触发（含具体事件内容）。

    请求体: { name, command, events: [{table, content}] }
       table   — 表名（如"随机环境"）
       content — 事件内容描述（将提取短名称存储）
    同一次掷表可能产生多个事件（含链式子表），一次性全部记录。
    """
    data = request.get_json(silent=True) or {}
    username = data.get('name', '').strip()

    # 清空统计
    if data.get('clear'):
        if not username:
            return jsonify({'error': '需要 name 参数'}), 400
        stats = _load_event_stats()
        if username in stats:
            del stats[username]
            _save_event_stats(stats)
            return jsonify({'ok': True})
        return jsonify({'ok': True, 'message': '用户无统计数据'})

    command = data.get('command', '')
    event_list = data.get('events', [])

    if not username:
        return jsonify({'error': '需要 name 参数'}), 400
    if not event_list:
        return jsonify({'error': '需要 events 参数'}), 400

    stats = _load_event_stats()
    user_stats = stats.setdefault(username, {})

    # 每次点击事件按钮计数一次（不含链式子事件）
    user_stats['_clicks'] = user_stats.get('_clicks', 0) + 1

    for evt in event_list:
        table = evt.get('table', '').strip()
        content = evt.get('content', '').strip()
        if not table or not content:
            continue
        short_name = _extract_event_name(content)
        table_events = user_stats.setdefault(table, {})
        table_events[short_name] = table_events.get(short_name, 0) + 1

    _save_event_stats(stats)
    return jsonify({'ok': True})


@app.route('/api/events/stats', methods=['GET'])
def api_get_event_stats():
    """获取指定用户的事件内容统计数据。

    URL 参数: name — 用户名
    返回:
      { name, total, groups: [{table, dice, total_in_table, events: [{content, count, probability}]}] }
      probability = 该事件次数 / 全局总事件次数 × 100
    """
    username = request.args.get('name', '').strip()
    if not username:
        return jsonify({'error': '需要 name 参数'}), 400

    stats = _load_event_stats()
    user_stats = stats.get(username, {})

    # 总点击次数（不含链式子事件）
    total_clicks = user_stats.get('_clicks', 0)
    # 兼容旧数据：没有 _clicks 时用事件总和
    if total_clicks == 0:
        for table_events in user_stats.values():
            if isinstance(table_events, dict):
                total_clicks += sum(table_events.values())
    global_total = total_clicks

    # 构建分组数据
    groups = []
    # 按表的事件总数降序排列（排除 _clicks 等非字典字段）
    table_order = sorted(
        [(k, v) for k, v in user_stats.items() if isinstance(v, dict)],
        key=lambda x: -sum(x[1].values())
    )

    for table_name, table_events in table_order:
        if not isinstance(table_events, dict):
            continue
        table_total = sum(table_events.values())
        # 获取该表的骰子信息
        dice = ''
        for cmd, (label, d, _) in _EVENT_COMMANDS.items():
            if label == table_name:
                dice = d
                break

        events = []
        for content, count in sorted(table_events.items(), key=lambda x: -x[1]):
            table_prob = (count / table_total * 100) if table_total > 0 else 0
            global_prob = (count / global_total * 100) if global_total > 0 else 0
            events.append({
                'content': content,
                'count': count,
                'probability': round(table_prob, 1),
                'global_probability': round(global_prob, 1),
            })

        groups.append({
            'table': table_name,
            'dice': dice,
            'total_in_table': table_total,
            'events': events,
        })

    return jsonify({
        'name': username,
        'total': global_total,
        'groups': groups,
    })


# ━━━ DND 物品表加载 ━━━
import openpyxl
import os as _os

_item_cache: list[dict] | None = None

def _load_items():
    """加载 DND 物品表 Excel"""
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
    """搜索 DND 物品表（武器/装备/物品）"""
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
    '.jpg': ('🖼 图片', 'img'), '.jpeg': ('🖼 图片', 'img'), '.png': ('🖼 图片', 'img'),
    '.gif': ('🖼 图片', 'img'), '.webp': ('🖼 图片', 'img'), '.bmp': ('🖼 图片', 'img'),
    '.svg': ('🖼 图片', 'img'),
    '.txt': ('📝 文本', 'text'), '.md': ('📝 文本', 'text'),
    '.docx': ('📋 文档', 'doc'), '.doc': ('📋 文档', 'doc'), '.pptx': ('📋 文档', 'doc'), '.ppt': ('📋 文档', 'doc'),
    '.xlsx': ('📊 表格', 'sheet'), '.xls': ('📊 表格', 'sheet'), '.csv': ('📊 表格', 'sheet'),
    '.json': ('💾 存档', 'save'),
    '.mp3': ('🎵 音频', 'audio'), '.wav': ('🎵 音频', 'audio'), '.ogg': ('🎵 音频', 'audio'), '.flac': ('🎵 音频', 'audio'),
}


@app.route('/api/resources')
def api_resources():
    """List all files in the resources directory, optionally filtered by category."""
    category = request.args.get('cat', '')
    items = []
    try:
        files = sorted(RESOURCES_DIR.iterdir())
    except Exception as e:
        return jsonify({'error': f'无法读取资源目录: {e}', 'resources': []}), 500
    for f in files:
        if not f.is_file():
            continue
        try:
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
        except Exception:
            continue
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
    """返回当前DM信息。有name时按名匹配，无name时按IP回退。"""
    global _dm_name, _dm_ip
    client_ip = request.remote_addr or 'unknown'
    name = request.args.get('name', '').strip()

    if name and _dm_name is not None:
        is_dm = (name == _dm_name)
    elif _dm_name is not None:
        is_dm = _is_dm_ip(client_ip) and (client_ip == _dm_ip)
    else:
        is_dm = _is_dm_ip(client_ip)

    return jsonify({
        'is_dm': is_dm,
        'dm_name': _dm_name,
        'client_ip': client_ip,
    })


# ━━━ 房间/在线用户 API ━━━

def _prune_stale_users():
    """清理过期在线记录（超过10秒无心跳视为离线），并发送退出消息。"""
    global _dm_name
    _now = _time.time()
    stale_names = [n for n, u in _online_users.items() if _now - u.get('last_heartbeat', 0) > 10]
    for n in stale_names:
        del _online_users[n]
        # 发送退出消息（与 api_room_leave 保持一致）
        if _dm_name and n != _dm_name:
            _chat_messages.append({
                'name': '系统',
                'text': f'🔴 {n} 退出房间',
                'time': _time.strftime('%H:%M:%S'),
                'is_dm': False,
                'color': '#888888',
                'ip': 'system',
                '_ts': _time.time(),
                'system': True,
            })


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
    _prune_stale_users()

    is_new = name not in _online_users

    # ID 唯一性检测：同名且同IP（刷新页面）或旧记录已过期则允许
    if not is_new:
        existing = _online_users.get(name, {})
        existing_ip = existing.get('ip', '')
        if existing_ip and existing_ip == client_ip:
            del _online_users[name]
            is_new = True
        else:
            return jsonify({'ok': False, 'error': f'「{name}」已被使用，请更换ID'})

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

    # 发送系统消息（仅首次加入，重连不重复通知）
    _now = _time.time()
    was_offline = name not in [n for n, u in _online_users.items() if _now - u.get('last_heartbeat', 0) <= 15]
    if was_offline and _dm_name and name != _dm_name:
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
    """心跳：更新在线状态，返回在线用户列表。用户不在列表中时返回 need_rejoin 标志。"""
    global _online_users, _dm_name
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#00bcd4')
    if not name:
        return jsonify({'ok': False, 'error': 'Name required'})

    # 清理超时用户，确保离线玩家从所有人的在线列表中消失
    _prune_stale_users()

    if name in _online_users:
        _online_users[name]['last_heartbeat'] = _time.time()
        if color:
            _online_users[name]['color'] = color
    else:
        # 不自动重新注册——避免 leaveRoom 后又被心跳拉回来导致重复退出消息
        return jsonify({
            'ok': True,
            'need_rejoin': True,
            'online_users': [
                {'name': n, 'color': u['color'], 'role': u.get('role', 'PL')}
                for n, u in _online_users.items()
            ],
            'online_count': len(_online_users),
        })

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


# ━━━ 战斗状态同步 API（带磁盘持久化）━━

_COMBAT_SAVE_FILE = _Path(__file__).parent / 'combat_state.json'


def _load_combat_state():
    """启动时从磁盘恢复战斗状态，防止重启丢失和控制台 404 刷屏。"""
    try:
        if _COMBAT_SAVE_FILE.exists():
            with open(_COMBAT_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = _json.load(f)
            if isinstance(data, dict) and data.get('combatants') is not None:
                return data, data.get('_ts', 0.0)
    except Exception:
        pass
    return {'combatants': [], 'round': ''}, 0.0


def _save_combat_state():
    """保存战斗状态到磁盘。"""
    global _combat_state, _combat_state_ts
    try:
        data = dict(_combat_state) if _combat_state else {'combatants': [], 'round': ''}
        data['_ts'] = _combat_state_ts
        tmp = _COMBAT_SAVE_FILE.with_suffix('.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            _json.dump(data, f, ensure_ascii=False)
        tmp.replace(_COMBAT_SAVE_FILE)
    except Exception as e:
        print(f'[combat-state] 保存失败: {e}')


# 模块加载时恢复战斗状态
_combat_state, _combat_state_ts = _load_combat_state()
if _combat_state.get('combatants'):
    print(f'[combat-state] 已从磁盘恢复战斗状态 ({len(_combat_state["combatants"])} 名参战者)')


@app.route('/api/combat-state', methods=['GET'])
def api_get_combat_state():
    """获取共享的战斗状态（从内存返回，首次启动从磁盘加载，不再是 None）。"""
    global _combat_state, _combat_state_ts
    return jsonify({'ok': True, 'state': _combat_state, 'timestamp': _combat_state_ts})


@app.route('/api/combat-state', methods=['POST'])
def api_push_combat_state():
    """推送战斗状态（用服务器时间戳标记版本），自动持久化到磁盘。"""
    global _combat_state, _combat_state_ts
    data = request.get_json(silent=True) or {}
    state = data.get('state', {})
    _combat_state_ts = _time.time()
    state['_ts'] = _combat_state_ts
    _combat_state = state
    _save_combat_state()
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
               '.txt', '.md',                                       # 文本
               '.json'}                                             # 存档
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

    # 清理文件名：替换 Windows/Linux 非法字符
    import re as _re
    raw_name = file.filename
    # 替换路径分隔符和非法字符为下划线
    safe_name = _re.sub(r'[\\/:*?"<>|]', '_', raw_name)
    # 合并连续下划线，去除首尾下划线和空格
    safe_name = _re.sub(r'_+', '_', safe_name).strip('_ .')
    if not safe_name:
        safe_name = 'unnamed'
    # 保留扩展名（如果原来的扩展名还在）
    if '.' in raw_name:
        raw_ext = _os.path.splitext(raw_name)[1]
        safe_base = _os.path.splitext(safe_name)[0]
        safe_name = safe_base + raw_ext

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


# ━━━ Mod 系统 ━━━
from core.mod_loader import ModLoader

_MODS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'mods')
_mod_loader = ModLoader(_MODS_DIR)

# 应用启动时加载所有Mod
_manifests = _mod_loader.discover()
_loaded_count = 0
for _m in _manifests:
    if _mod_loader.load_mod(_m, app):
        _loaded_count += 1
print(f"[Mod] 发现 {len(_manifests)} 个Mod，成功加载 {_loaded_count} 个")


# ━━━ Mod 管理 API ━━━
@app.route('/api/mods')
def api_list_mods():
    """列出所有已加载的Mod"""
    all_mods = _mod_loader.get_loaded_mods()
    # 添加未加载的Mod信息
    loaded_ids = {m['id'] for m in all_mods}
    for m in _manifests:
        if m.get('id') not in loaded_ids:
            backend = m.get('backend', {})
            all_mods.append({
                'id': m.get('id', '?'),
                'name': m.get('name', '?'),
                'version': m.get('version', '?'),
                'description': m.get('description', ''),
                'author': m.get('author', ''),
                'backend_enabled': backend.get('enabled', False),
                'frontend_enabled': m.get('frontend', {}).get('enabled', False),
            })
    return jsonify({'mods': all_mods, 'loaded_count': _loaded_count})


@app.route('/api/mods/<mod_id>')
def api_get_mod(mod_id):
    """获取单个Mod的详细信息"""
    info = _mod_loader.loaded.get(mod_id)
    if info is None:
        return jsonify({'error': f'Mod不存在或未加载: {mod_id}'}), 404
    return jsonify({
        'id': mod_id,
        'name': info.get('name', mod_id),
        'version': info.get('version', '?'),
        'description': info.get('description', ''),
        'author': info.get('author', ''),
        'dependencies': info.get('dependencies', {}),
        'backend': info.get('backend', {}),
        'frontend': info.get('frontend', {}),
    })


@app.route('/api/mods/<mod_id>/reload', methods=['POST'])
def api_reload_mod(mod_id):
    """重新加载Mod"""
    if mod_id not in _mod_loader.loaded:
        return jsonify({'error': f'Mod未加载: {mod_id}'}), 404
    info = _mod_loader.loaded[mod_id]
    _mod_loader.unload_mod(mod_id)
    ok = _mod_loader.load_mod(info, app)
    return jsonify({'mod_id': mod_id, 'reloaded': ok})


# ━━━ Mod 管理页面 ━━━
@app.route('/mods')
def mods_page():
    """Mod 管理界面"""
    return render_template('mods.html')


# ━━━ 骰子数据统计 API ━━━
import os as _os
_STATS_FILE = _Path(__file__).parent / 'dice_stats.json'
_stats_lock = _threading.Lock()

def _load_stats():
    try:
        if _STATS_FILE.exists():
            with open(_STATS_FILE, 'r', encoding='utf-8') as f:
                return _json.load(f)
    except Exception:
        pass
    return {}

def _save_stats(stats):
    try:
        with open(_STATS_FILE, 'w', encoding='utf-8') as f:
            _json.dump(stats, f, ensure_ascii=False)
    except Exception:
        pass

@app.route('/api/dice-stats', methods=['GET'])
def api_get_dice_stats():
    """获取所有玩家的骰子统计数据（排行榜）"""
    with _stats_lock:
        stats = _load_stats()
    # 计算每个玩家的概率并排序
    leaderboard = []
    for name, data in stats.items():
        total = data.get('total', 0)
        crit20 = data.get('crit20', 0)
        crit1 = data.get('crit1', 0)
        leaderboard.append({
            'name': name,
            'total': total,
            'crit20': crit20,
            'crit1': crit1,
            'rate20': round(crit20 / total * 100, 1) if total > 0 else 0,
            'rate1': round(crit1 / total * 100, 1) if total > 0 else 0,
        })
    leaderboard.sort(key=lambda x: x['crit20'], reverse=True)
    return jsonify({'ok': True, 'leaderboard': leaderboard[:50]})

@app.route('/api/dice-stats', methods=['POST'])
def api_record_dice_stats():
    """记录一次d20掷骰结果"""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    roll_val = data.get('roll')  # d20结果值
    if not name or roll_val is None:
        return jsonify({'ok': False, 'error': '缺少参数'}), 400
    try:
        roll_val = int(roll_val)
    except (ValueError, TypeError):
        return jsonify({'ok': False}), 400

    with _stats_lock:
        stats = _load_stats()
        if name not in stats:
            stats[name] = {'total': 0, 'crit20': 0, 'crit1': 0}
        stats[name]['total'] += 1
        if roll_val == 20:
            stats[name]['crit20'] += 1
        elif roll_val == 1:
            stats[name]['crit1'] += 1
        _save_stats(stats)
    return jsonify({'ok': True})

@app.route('/api/dice-stats', methods=['DELETE'])
def api_clear_dice_stats():
    """清空所有骰子统计数据"""
    with _stats_lock:
        _save_stats({})
    return jsonify({'ok': True})


def run_server():
    """启动 Web 服务器（HTTP + WebSocket 共用 5000 端口）"""
    # Flask-Sock + simple-websocket 自动处理 /ws 路径的 WebSocket 升级
    # debug=False：生产使用；避免 Werkzeug 调试器暴露远程执行入口
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)


if __name__ == '__main__':
    run_server()
