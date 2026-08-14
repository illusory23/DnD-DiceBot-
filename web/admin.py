"""尘封之卷 — 管理员后台

Flask Blueprint，挂载于 /admin/*。
所有管理路由统一使用 @admin_required 鉴权装饰器。
"""

import os as _os
import sys as _sys
import re as _re
import json as _json
import time as _time
import shutil as _shutil
from pathlib import Path as _Path
from functools import wraps
from datetime import datetime

from flask import (
    Blueprint, render_template, request, jsonify,
    redirect, url_for, session as _flask_session,
)

# 确保项目根在 sys.path 中
_script_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _script_dir not in _sys.path:
    _sys.path.insert(0, _script_dir)

from core.database import db
from core.models import User as _UserModel, Character as _CharModel, CharacterGroup, NorthSave

admin_bp = Blueprint(
    'admin',
    __name__,
    template_folder='templates/admin',
    static_folder='static/admin',
    url_prefix='/admin',
)


# ═══════════════════════════════════════════════════════════════════
# 鉴权装饰器
# ═══════════════════════════════════════════════════════════════════

def _get_current_admin() -> _UserModel | None:
    """从 session 获取当前登录的管理员用户。"""
    user_id = _flask_session.get('user_id')
    if user_id:
        user = db.session.get(_UserModel, user_id)
        # 被禁用的账号（含管理员）不允许进入后台，与前台登录语义一致
        if user and user.is_admin and (user.is_active if user.is_active is not None else True):
            return user
    return None


def admin_required(f):
    """管理后台鉴权装饰器。

    页面路由 → 未登录重定向到 /admin/login
    API 路由  → 返回 401/403 JSON
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        admin = _get_current_admin()
        if not admin:
            # 判断是 API 请求还是页面请求
            if request.path.startswith('/admin/api/'):
                return jsonify({'ok': False, 'error': '需要管理员权限'}), 403
            return redirect(url_for('admin.login_page'))
        # 注入 admin 到视图参数（仅限接受它的函数）
        if 'admin' in f.__code__.co_varnames[:f.__code__.co_argcount]:
            return f(admin=admin, *args, **kwargs)
        return f(*args, **kwargs)
    return decorated


def _parse_bool(value) -> bool | None:
    """宽松解析布尔值：接受 JSON 布尔与 'true'/'false'/'1'/'0' 字符串。

    返回 None 表示无法解析（调用方应拒绝请求）。
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ('true', '1', 'yes', 'on'):
            return True
        if v in ('false', '0', 'no', 'off'):
            return False
    return None


# ═══════════════════════════════════════════════════════════════════
# 登录 / 登出
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/login')
def login_page():
    """管理员登录页面"""
    admin = _get_current_admin()
    if admin:
        return redirect(url_for('admin.dashboard_page'))
    return render_template('login.html')


@admin_bp.route('/api/login', methods=['POST'])
def api_login():
    """管理员登录 API"""
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()

    if not username or not password:
        return jsonify({'ok': False, 'error': '请填写用户名和密码'}), 400

    user = _UserModel.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'ok': False, 'error': '用户名或密码错误'}), 401
    if not user.is_admin:
        return jsonify({'ok': False, 'error': '此账号没有管理员权限'}), 403
    if not (user.is_active if user.is_active is not None else True):
        return jsonify({'ok': False, 'error': '账号已被禁用，请联系管理员'}), 403

    _flask_session['user_id'] = user.id
    _flask_session['username'] = user.username

    # 更新最后登录时间
    user.last_login = datetime.utcnow()
    db.session.commit()

    from utils.logger import audit_log
    audit_log('admin.login', username=username, ip=request.remote_addr or 'unknown',
              detail='管理员登录')

    return jsonify({'ok': True, 'user': user.to_dict()})


@admin_bp.route('/api/logout', methods=['POST'])
@admin_required
def api_logout():
    """管理员登出"""
    _flask_session.pop('user_id', None)
    _flask_session.pop('username', None)
    return jsonify({'ok': True})


@admin_bp.route('/logout')
def logout_page():
    """退出并跳回登录页"""
    _flask_session.pop('user_id', None)
    _flask_session.pop('username', None)
    return redirect(url_for('admin.login_page'))


# ═══════════════════════════════════════════════════════════════════
# 页面路由
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/')
@admin_required
def dashboard_page():
    """系统总览仪表盘"""
    return render_template('dashboard.html')


@admin_bp.route('/users')
@admin_required
def users_page():
    """用户管理"""
    return render_template('users.html')


@admin_bp.route('/users/<int:user_id>')
@admin_required
def user_detail_page(user_id):
    """用户详情"""
    user = db.session.get(_UserModel, user_id)
    if not user:
        return render_template('dashboard.html', error='用户不存在')
    return render_template('user_detail.html', target_user_id=user_id, target_username=user.username)


@admin_bp.route('/characters')
@admin_required
def characters_page():
    """角色管理"""
    return render_template('characters.html')


@admin_bp.route('/characters/<int:char_id>')
@admin_required
def character_detail_page(char_id):
    """角色详情（只读）"""
    char = db.session.get(_CharModel, char_id)
    if not char:
        return render_template('dashboard.html', error='角色不存在')
    return render_template('character_detail.html', target_char_id=char_id, target_char_name=char.name)


@admin_bp.route('/chat')
@admin_required
def chat_page():
    """聊天管理"""
    return render_template('chat.html')


@admin_bp.route('/stats')
@admin_required
def stats_page():
    """统计中心"""
    return render_template('stats.html')


@admin_bp.route('/errors')
@admin_required
def errors_page():
    """错误监控"""
    return render_template('errors.html')


@admin_bp.route('/system')
@admin_required
def system_page():
    """系统维护"""
    return render_template('system.html')


@admin_bp.route('/audit')
@admin_required
def audit_page():
    """审计日志"""
    return render_template('audit.html')


@admin_bp.route('/backups')
@admin_required
def backups_page():
    """数据备份"""
    return render_template('backups.html')


@admin_bp.route('/topics')
@admin_required
def topics_page():
    """每周话题管理"""
    return render_template('topics.html')


@admin_bp.route('/community')
@admin_required
def community_page():
    """社区内容管理（酒馆帖子 + 工坊投稿）"""
    return render_template('community.html')


@admin_bp.route('/content')
@admin_required
def content_page():
    """内容管理"""
    return render_template('content.html')


@admin_bp.route('/announcements')
@admin_required
def announcements_page():
    """平台公告管理（发布/启停/删除，前端调用 /api/admin/announcements 与 /api/announcements）"""
    return render_template('admin/announcements.html')


# ═══════════════════════════════════════════════════════════════════
# API — 仪表盘
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/dashboard')
@admin_required
def api_dashboard():
    """仪表盘聚合数据。"""
    # 用户数
    total_users = _UserModel.query.count()

    # 角色数
    total_chars = _CharModel.query.count()

    # 北境存档数
    total_saves = NorthSave.query.count()

    # 在线用户（全站在线机制：打开任意页面即在线，按用户名去重）
    online_count = 0
    try:
        import web.app as _app
        with _app._online_lock:
            _app._prune_online_sessions()
            online_count = len({s['username'] for s in _app._online_sessions.values()})
    except Exception:
        pass

    # 聊天消息数
    chat_count = 0
    try:
        import web.app as _app
        chat_count = len(_app._chat_messages)
    except Exception:
        pass

    # 骰子统计
    dice_records = 0
    try:
        import web.app as _app
        with _app._stats_lock:
            dice_stats = _app._load_stats()
        dice_records = sum(s.get('total', 0) for s in dice_stats.values())
    except Exception:
        pass

    # 归档数
    archive_count = 0
    archive_size = 0
    try:
        import web.app as _app
        if _app._CHAT_ARCHIVE_DIR.exists():
            for f in _app._CHAT_ARCHIVE_DIR.glob('chat_*.json'):
                archive_count += 1
                archive_size += f.stat().st_size
    except Exception:
        pass

    # 最近24小时前端错误
    recent_errors = 0
    try:
        cutoff = _time.time() - 86400
        from utils.logger import _FRONTEND_ERROR_FILE
        if _FRONTEND_ERROR_FILE.exists():
            with open(_FRONTEND_ERROR_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        try:
                            err = _json.loads(line.strip())
                            if err.get('time', '') >= _time.strftime('%Y-%m-%d', _time.localtime(cutoff)):
                                recent_errors += 1
                        except _json.JSONDecodeError:
                            pass
    except Exception:
        pass

    return jsonify({
        'ok': True,
        'total_users': total_users,
        'total_characters': total_chars,
        'total_saves': total_saves,
        'online_users': online_count,
        'chat_messages': chat_count,
        'dice_records': dice_records,
        'chat_archives': archive_count,
        'chat_archives_size_mb': round(archive_size / 1048576, 2),
        'frontend_errors_24h': recent_errors,
    })


# ═══════════════════════════════════════════════════════════════════
# API — 用户管理
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/users')
@admin_required
def api_users_list():
    """用户列表（分页 + 搜索）。"""
    page = max(1, request.args.get('page', 1, type=int))
    per_page = max(1, min(200, request.args.get('per_page', 20, type=int)))
    q = (request.args.get('q') or '').strip()

    query = _UserModel.query

    if q:
        query = query.filter(
            db.or_(
                _UserModel.username.contains(q),
                _UserModel.email.contains(q),
            )
        )

    total = query.count()
    users = query.order_by(_UserModel.id.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    return jsonify({
        'ok': True,
        'users': [u.to_dict() for u in users],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': max(1, (total + per_page - 1) // per_page),
    })


@admin_bp.route('/api/users/<int:user_id>')
@admin_required
def api_user_detail(user_id):
    """用户详情 + 角色列表 + 北境存档。"""
    user = db.session.get(_UserModel, user_id)
    if not user:
        return jsonify({'ok': False, 'error': '用户不存在'}), 404

    # 角色
    characters = _CharModel.query.filter(
        db.or_(
            _CharModel.user_id == user.id,
            db.and_(_CharModel.user_id.is_(None),
                     _CharModel.created_by == user.username),
        )
    ).order_by(_CharModel.id.desc()).all()

    # 北境存档
    saves = NorthSave.query.filter_by(user_id=user.id).order_by(
        NorthSave.updated_at.desc()
    ).all()

    return jsonify({
        'ok': True,
        'user': user.to_dict(),
        'characters': [
            {
                'id': c.id,
                'name': c.name,
                'level': c.level,
                'class_': c.class_,
                'race': c.race,
                'hp_current': c.hp_current,
                'hp_max': c.hp_max,
            }
            for c in characters
        ],
        'saves': [
            {
                'save_name': s.save_name,
                'updated_at': s.updated_at.isoformat() if s.updated_at else '',
                'size': len(s.save_data) if s.save_data else 0,
            }
            for s in saves
        ],
    })


@admin_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def api_user_update(user_id):
    """更新用户（管理员权限、启用/禁用、重置密码、邮箱）。"""
    user = db.session.get(_UserModel, user_id)
    if not user:
        return jsonify({'ok': False, 'error': '用户不存在'}), 404

    data = request.get_json(silent=True) or {}
    current_admin = _get_current_admin()

    if 'is_admin' in data:
        is_admin = _parse_bool(data['is_admin'])
        if is_admin is None:
            return jsonify({'ok': False, 'error': 'is_admin 必须是布尔值'}), 400
        # 不能取消自己的管理员权限
        if user.id == current_admin.id and not is_admin:
            return jsonify({'ok': False, 'error': '不能取消自己的管理员权限'}), 400
        user.is_admin = is_admin

    if 'is_active' in data:
        is_active = _parse_bool(data['is_active'])
        if is_active is None:
            return jsonify({'ok': False, 'error': 'is_active 必须是布尔值'}), 400
        # 不能禁用自己
        if user.id == current_admin.id and not is_active:
            return jsonify({'ok': False, 'error': '不能禁用当前登录的管理员账号'}), 400
        user.is_active = is_active

    if 'password' in data and data['password']:
        new_pwd = str(data['password']).strip()
        if len(new_pwd) < 6:
            return jsonify({'ok': False, 'error': '新密码至少 6 位'}), 400
        user.set_password(new_pwd)

    if 'email' in data:
        new_email = (data.get('email') or '').strip()
        if not new_email:
            return jsonify({'ok': False, 'error': '邮箱不能为空'}), 400
        exists = _UserModel.query.filter(
            _UserModel.email == new_email,
            _UserModel.id != user.id,
        ).first()
        if exists:
            return jsonify({'ok': False, 'error': '该邮箱已被其他用户使用'}), 400
        user.email = new_email

    db.session.commit()

    from utils.logger import audit_log
    # 审计日志不回显密码（避免明文泄露）
    log_data = {k: '***' if k == 'password' else v for k, v in data.items()}
    audit_log('admin.user_update',
              username=current_admin.username,
              ip=request.remote_addr or 'unknown',
              detail=f'更新用户 #{user_id} ({user.username}): {_json.dumps(log_data, ensure_ascii=False)}')

    return jsonify({'ok': True, 'user': user.to_dict()})


@admin_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def api_user_delete(user_id):
    """删除用户（其角色保留，user_id 置空）。"""
    user = db.session.get(_UserModel, user_id)
    if not user:
        return jsonify({'ok': False, 'error': '用户不存在'}), 404

    current_admin = _get_current_admin()
    if user.id == current_admin.id:
        return jsonify({'ok': False, 'error': '不能删除当前登录的管理员账号'}), 400
    if user.is_admin:
        return jsonify({'ok': False, 'error': '请先取消该用户的管理员权限再删除'}), 400

    username = user.username
    # 角色保留，解除关联
    _CharModel.query.filter_by(user_id=user.id).update({'user_id': None})
    # 北境存档绑定账号，随账号删除（SQLite 外键未启用，需显式清理）
    NorthSave.query.filter_by(user_id=user.id).delete()
    db.session.delete(user)
    db.session.commit()

    from utils.logger import audit_log
    audit_log('admin.user_delete',
              username=current_admin.username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除用户 #{user_id} ({username})')

    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════════
# API — 角色管理
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/characters')
@admin_required
def api_characters_list():
    """全局角色列表（分页 + 搜索 + 筛选）。"""
    page = max(1, request.args.get('page', 1, type=int))
    per_page = max(1, min(200, request.args.get('per_page', 20, type=int)))
    q = (request.args.get('q') or '').strip()
    class_filter = (request.args.get('class') or '').strip()
    race_filter = (request.args.get('race') or '').strip()

    query = _CharModel.query

    if q:
        query = query.filter(
            db.or_(
                _CharModel.name.contains(q),
                _CharModel.player.contains(q),
                _CharModel.created_by.contains(q),
            )
        )
    if class_filter:
        query = query.filter(_CharModel.class_.contains(class_filter))
    if race_filter:
        query = query.filter(_CharModel.race.contains(race_filter))

    total = query.count()
    chars = query.order_by(_CharModel.id.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    return jsonify({
        'ok': True,
        'characters': [
            {
                'id': c.id,
                'name': c.name,
                'player': c.player,
                'created_by': c.created_by,
                'level': c.level,
                'class_': c.class_,
                'race': c.race,
                'hp_current': c.hp_current,
                'hp_max': c.hp_max,
                'ac': c.ac,
                'created_at': c.created_at.isoformat() if c.created_at else '',
            }
            for c in chars
        ],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': max(1, (total + per_page - 1) // per_page),
    })


@admin_bp.route('/api/characters/stats')
@admin_required
def api_characters_stats():
    """角色统计数据（职业分布、等级分布、种族分布）。"""
    chars = _CharModel.query.all()

    # 职业分布
    class_dist = {}
    for c in chars:
        cls = c.class_ or '未知'
        class_dist[cls] = class_dist.get(cls, 0) + 1

    # 等级分布
    level_dist = {}
    for c in chars:
        lvl = str(c.level or 1)
        level_dist[lvl] = level_dist.get(lvl, 0) + 1

    # 种族分布
    race_dist = {}
    for c in chars:
        race = c.race or '未知'
        race_dist[race] = race_dist.get(race, 0) + 1

    return jsonify({
        'ok': True,
        'class_distribution': class_dist,
        'level_distribution': level_dist,
        'race_distribution': race_dist,
        'total': len(chars),
    })


@admin_bp.route('/api/characters/<int:char_id>')
@admin_required
def api_character_detail(char_id):
    """角色详情（只读，管理员视角）。"""
    char = db.session.get(_CharModel, char_id)
    if not char:
        return jsonify({'ok': False, 'error': '角色不存在'}), 404

    # Character 模型无 to_dict，这里手动构造管理员视角字段
    char_data = {
        'id': char.id,
        'name': char.name,
        'player': char.player,
        'created_by': char.created_by,
        'level': char.level,
        'class_': char.class_,
        'race': char.race,
        'subrace': char.subrace,
        'background': char.background_field,
        'alignment': char.alignment,
        'faith': char.faith,
        'gender': char.gender,
        'age': char.age,
        'height': char.height,
        'weight': char.weight_field,
        'hp_max': char.hp_max,
        'hp_current': char.hp_current,
        'temp_hp': char.temp_hp,
        'ac': char.ac,
        'initiative_bonus': char.initiative_bonus,
        'speed': char.speed,
        'proficiency_bonus': char.proficiency_bonus,
        'hit_dice': char.hit_dice,
        'hd_count': char.hd_count,
        'xp': char.xp,
        'passive_perception': char.passive_perception,
        'spellcasting_ability': char.spellcasting_ability,
        'spell_attack_bonus': char.spell_attack_bonus,
        'spell_save_dc': char.spell_save_dc,
        'resistances': char.resistances,
        'key_abilities': char.key_abilities,
        'created_at': char.created_at.isoformat() if char.created_at else '',
    }

    return jsonify({
        'ok': True,
        'character': char_data,
    })


@admin_bp.route('/api/characters/<int:char_id>', methods=['DELETE'])
@admin_required
def api_character_delete(char_id):
    """删除角色（管理员强制删除）。"""
    char = db.session.get(_CharModel, char_id)
    if not char:
        return jsonify({'ok': False, 'error': '角色不存在'}), 404

    char_name = char.name
    db.session.delete(char)
    db.session.commit()

    from utils.logger import audit_log
    audit_log('admin.character_delete',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除角色 #{char_id} ({char_name})')

    return jsonify({'ok': True})


# 管理员可编辑的角色字段白名单: {字段名: (类型, 最小值, 最大值)}
_CHAR_EDITABLE_FIELDS = {
    'name': ('str', None, None),
    'player': ('str', None, None),
    'class_': ('str', None, None),
    'race': ('str', None, None),
    'subrace': ('str', None, None),
    'alignment': ('str', None, None),
    'faith': ('str', None, None),
    'background_field': ('str', None, None),
    'resistances': ('str', None, None),
    'hit_dice': ('str', None, None),
    'level': ('int', 1, 40),
    'hp_max': ('int', 1, 100000),
    'hp_current': ('int', 0, 100000),
    'temp_hp': ('int', 0, 100000),
    'ac': ('int', 0, 100),
    'xp': ('int', 0, 1000000000),
    'initiative_bonus': ('int', -100, 100),
    'speed': ('int', 0, 1000),
    'proficiency_bonus': ('int', 0, 30),
    'spell_save_dc': ('int', 0, 100),
    'spell_attack_bonus': ('int', -100, 100),
    'passive_perception': ('int', 0, 100),
    'hd_count': ('int', 1, 100),
}


@admin_bp.route('/api/characters/<int:char_id>', methods=['PUT'])
@admin_required
def api_character_update(char_id):
    """编辑角色（管理员视角，白名单字段）。"""
    char = db.session.get(_CharModel, char_id)
    if not char:
        return jsonify({'ok': False, 'error': '角色不存在'}), 404

    data = request.get_json(silent=True) or {}
    changed = {}

    for field, (ftype, fmin, fmax) in _CHAR_EDITABLE_FIELDS.items():
        if field not in data or data[field] is None:
            continue  # None 表示不修改该字段
        value = data[field]
        if ftype == 'int':
            try:
                value = int(value)
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': f'字段 {field} 必须是整数'}), 400
            if fmin is not None and value < fmin:
                return jsonify({'ok': False, 'error': f'字段 {field} 不能小于 {fmin}'}), 400
            if fmax is not None and value > fmax:
                return jsonify({'ok': False, 'error': f'字段 {field} 不能大于 {fmax}'}), 400
        else:
            value = str(value)[:200]
        setattr(char, field, value)
        changed[field] = value

    if 'name' in changed and not (changed['name'] or '').strip():
        return jsonify({'ok': False, 'error': '角色名称不能为空'}), 400

    if changed:
        db.session.commit()

    from utils.logger import audit_log
    audit_log('admin.character_update',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'编辑角色 #{char_id} ({char.name}): {_json.dumps(changed, ensure_ascii=False)}')

    return jsonify({'ok': True, 'changed': list(changed.keys())})


# ═══════════════════════════════════════════════════════════════════
# API — 系统信息
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/system/info')
@admin_required
def api_system_info():
    """系统运行信息。"""
    import platform as _platform
    from config import DATABASE_URL, SERVER_PORT, DEBUG

    # 数据库各表行数
    table_counts = {}
    try:
        tables = [
            ('users', _UserModel),
            ('characters', _CharModel),
            ('character_groups', CharacterGroup),
            ('north_saves', NorthSave),
        ]
        for name, model in tables:
            table_counts[name] = model.query.count()
    except Exception:
        pass

    # 数据库文件大小
    db_size_mb = 0
    try:
        db_path = _Path(__file__).parent.parent / 'data' / 'characters.db'
        if db_path.exists():
            db_size_mb = round(db_path.stat().st_size / 1048576, 2)
    except Exception:
        pass

    # 日志目录大小
    log_size_mb = 0
    try:
        log_dir = _Path(__file__).parent.parent / 'logs'
        if log_dir.exists():
            total = sum(
                f.stat().st_size for f in log_dir.glob('*')
                if f.is_file()
            )
            log_size_mb = round(total / 1048576, 2)
    except Exception:
        pass

    return jsonify({
        'ok': True,
        'python_version': _platform.python_version(),
        'platform': _platform.system(),
        'database_url': DATABASE_URL.split('://')[0],
        'port': SERVER_PORT,
        'debug': DEBUG,
        'table_counts': table_counts,
        'db_size_mb': db_size_mb,
        'log_size_mb': log_size_mb,
    })


# ═══════════════════════════════════════════════════════════════════
# API — 聊天管理
# ═══════════════════════════════════════════════════════════════════

_CHAT_ARCHIVE_DIR = _Path(__file__).parent / 'chat_archive'


@admin_bp.route('/api/chat/messages', methods=['DELETE'])
@admin_required
def api_admin_clear_chat_messages():
    """清空当前内存中的聊天消息。"""
    try:
        import web.app as _app
        _app._chat_messages.clear()
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.chat_clear',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail='清空全部聊天消息')

    return jsonify({'ok': True})


@admin_bp.route('/api/chat-archives')
@admin_required
def api_admin_chat_archives():
    """列出聊天归档文件（按时间倒序，最近20个）。"""
    archives = []
    try:
        if _CHAT_ARCHIVE_DIR.exists():
            for f in sorted(_CHAT_ARCHIVE_DIR.glob('chat_*.json'), reverse=True):
                archives.append({
                    'filename': f.name,
                    'size': f.stat().st_size,
                    'time': _time.strftime('%Y-%m-%d %H:%M:%S', _time.localtime(f.stat().st_mtime)),
                })
    except Exception:
        pass
    return jsonify({'ok': True, 'archives': archives[:20]})


@admin_bp.route('/api/chat-archives', methods=['DELETE'])
@admin_required
def api_admin_clean_chat_archives():
    """清理聊天归档（保留最近 N 天，默认30天，最小7天）。

    URL参数: ?days=30
    """
    days = request.args.get('days', '30')
    try:
        days = max(7, int(days))
    except ValueError:
        days = 30

    cleaned = 0
    cutoff = _time.time() - days * 86400
    try:
        if _CHAT_ARCHIVE_DIR.exists():
            for f in _CHAT_ARCHIVE_DIR.glob('chat_*.json'):
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    cleaned += 1
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.chat_archive_clean',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'清理{days}天前的聊天归档，删除{cleaned}个文件')

    return jsonify({'ok': True, 'cleaned': cleaned, 'retention_days': days})


# ═══════════════════════════════════════════════════════════════════
# API — 统计归档
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/archive-stats', methods=['POST'])
@admin_required
def api_admin_archive_stats():
    """将当前统计（骰子/事件）生成快照归档，然后重置。

    快照文件保存在 data/stats_archive/ 目录。
    """
    data_dir = _Path(__file__).parent.parent / 'data' / 'stats_archive'
    data_dir.mkdir(parents=True, exist_ok=True)

    ts = _time.strftime('%Y%m%d_%H%M%S')
    result = {'archived': []}

    try:
        import web.app as _app
        # 归档骰子统计
        with _app._stats_lock:
            dice_stats = _app._load_stats()
            if dice_stats:
                snapshot_file = data_dir / f'dice_stats_{ts}.json'
                snapshot_file.write_text(_json.dumps(dice_stats, ensure_ascii=False), encoding='utf-8')
                result['archived'].append('dice_stats')
                _app._save_stats({})

        # 归档事件统计（加锁防并发竞态）
        with _app._event_stats_lock:
            event_stats = _app._load_event_stats()
            if event_stats:
                snapshot_file = data_dir / f'event_stats_{ts}.json'
                snapshot_file.write_text(_json.dumps(event_stats, ensure_ascii=False), encoding='utf-8')
                result['archived'].append('event_stats')
                _app._save_event_stats({})
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.stats_archive',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'归档统计快照 ({ts})')

    result['snapshot_time'] = ts
    return jsonify({'ok': True, **result})


# ═══════════════════════════════════════════════════════════════════
# API — 前端错误日志
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/frontend-errors')
@admin_required
def api_admin_frontend_errors():
    """查询前端错误日志（按时间正序，取最近 N 条）。"""
    limit = request.args.get('limit', 100, type=int)
    limit = max(1, min(500, limit))

    from utils.logger import get_frontend_errors
    errors = get_frontend_errors(limit)

    return jsonify({'ok': True, 'errors': errors, 'total': len(errors)})


@admin_bp.route('/api/frontend-errors', methods=['DELETE'])
@admin_required
def api_admin_clear_frontend_errors():
    """清空前端错误日志。"""
    from utils.logger import _FRONTEND_ERROR_FILE
    try:
        if _FRONTEND_ERROR_FILE.exists():
            _FRONTEND_ERROR_FILE.unlink()
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.frontend_errors_clear',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail='清空前端错误日志')

    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════════
# API — 事件统计（后台聚合视图）
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/event-stats')
@admin_required
def api_admin_event_stats():
    """聚合所有用户的事件表触发统计。

    数据源 web/event_stats.json: {用户名: {表名: {事件: 次数}, _clicks: N}}
    """
    try:
        import web.app as _app
        with _app._event_stats_lock:
            stats = _app._load_event_stats()
    except Exception:
        stats = {}

    users = []
    for username, user_stats in stats.items():
        if not isinstance(user_stats, dict):
            continue
        tables = []
        total = 0
        for table, events in user_stats.items():
            if table == '_clicks' or not isinstance(events, dict):
                continue
            evt_list = [{'event': evt, 'count': cnt} for evt, cnt in events.items()]
            table_total = sum(events.values())
            total += table_total
            tables.append({'table': table, 'total': table_total, 'events': evt_list})
        users.append({
            'name': username,
            'total': total,
            'tables': sorted(tables, key=lambda t: -t['total']),
        })

    users.sort(key=lambda u: -u['total'])
    return jsonify({'ok': True, 'users': users})


# ═══════════════════════════════════════════════════════════════════
# API — 每周话题管理
# ═══════════════════════════════════════════════════════════════════

_TOPICS_FILE = _Path(__file__).parent.parent / 'data' / 'topics.json'


def _admin_load_topics() -> dict:
    try:
        if _TOPICS_FILE.exists():
            with open(_TOPICS_FILE, 'r', encoding='utf-8') as f:
                data = _json.load(f)
            if isinstance(data, dict) and 'topics' in data:
                return data
    except Exception:
        pass
    return {'topics': []}


def _admin_save_topics(data: dict):
    _TOPICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_TOPICS_FILE, 'w', encoding='utf-8') as f:
        _json.dump(data, f, ensure_ascii=False, indent=2)


def _topic_validate(data: dict):
    """校验话题字段，返回 (title, content, images) 或抛 ValueError。"""
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    images = data.get('images') or []
    if not isinstance(images, list):
        images = []
    images = [str(i).strip()[:300] for i in images if str(i).strip()]
    if not title:
        raise ValueError('标题不能为空')
    if len(title) > 100:
        raise ValueError('标题最多 100 字')
    if not content:
        raise ValueError('内容不能为空')
    if len(content) > 50000:
        raise ValueError('内容过长（最多 5 万字）')
    return title, content, images[:10]


@admin_bp.route('/api/topics')
@admin_required
def api_admin_topics_list():
    """每周话题管理列表（含完整数据）。"""
    data = _admin_load_topics()
    return jsonify({'ok': True, 'topics': data.get('topics', [])})


@admin_bp.route('/api/topics', methods=['POST'])
@admin_required
def api_admin_topic_create():
    """发布每周话题。"""
    data = request.get_json(silent=True) or {}
    try:
        title, content, images = _topic_validate(data)
    except ValueError as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

    topics = _admin_load_topics()['topics']
    now = _time.strftime('%Y-%m-%d %H:%M:%S')
    new_id = max([t.get('id', 0) for t in topics], default=0) + 1
    topic = {
        'id': new_id,
        'title': title,
        'content': content,
        'images': images,
        'author': _get_current_admin().username,
        'created_at': now,
        'updated_at': now,
        'comments': [],
    }
    topics.insert(0, topic)
    _admin_save_topics({'topics': topics})

    from utils.logger import audit_log
    audit_log('admin.topic_create',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'发布每周话题 #{new_id}: {title}')

    return jsonify({'ok': True, 'topic': topic})


@admin_bp.route('/api/topics/<int:topic_id>', methods=['PUT'])
@admin_required
def api_admin_topic_update(topic_id):
    """更新每周话题。"""
    data = request.get_json(silent=True) or {}
    try:
        title, content, images = _topic_validate(data)
    except ValueError as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

    topics = _admin_load_topics()['topics']
    for t in topics:
        if t.get('id') == topic_id:
            t['title'] = title
            t['content'] = content
            t['images'] = images
            t['updated_at'] = _time.strftime('%Y-%m-%d %H:%M:%S')
            _admin_save_topics({'topics': topics})

            from utils.logger import audit_log
            audit_log('admin.topic_update',
                      username=_get_current_admin().username,
                      ip=request.remote_addr or 'unknown',
                      detail=f'更新每周话题 #{topic_id}: {title}')
            return jsonify({'ok': True, 'topic': t})

    return jsonify({'ok': False, 'error': '话题不存在'}), 404


@admin_bp.route('/api/topics/<int:topic_id>', methods=['DELETE'])
@admin_required
def api_admin_topic_delete(topic_id):
    """删除每周话题。"""
    topics = _admin_load_topics()['topics']
    topic = next((t for t in topics if t.get('id') == topic_id), None)
    if not topic:
        return jsonify({'ok': False, 'error': '话题不存在'}), 404

    topics = [t for t in topics if t.get('id') != topic_id]
    _admin_save_topics({'topics': topics})

    from utils.logger import audit_log
    audit_log('admin.topic_delete',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除每周话题 #{topic_id}: {topic.get("title", "")}')

    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════════
# API — 社区内容管理（酒馆帖子 + 工坊投稿）
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/community')
@admin_required
def api_admin_community():
    """后台：酒馆帖子与工坊投稿全量列表。"""
    posts, items = [], []
    boards = {}
    try:
        import web.app as _app
        with _app._community_lock:
            posts = _app._load_json_file(_app._COMMUNITY_FILE, [])
            items = _app._load_json_file(_app._WORKSHOP_FILE, [])
        boards = {b['id']: b['name'] for b in _app._COMMUNITY_BOARDS}
    except Exception:
        pass
    for p in posts:
        p['boardName'] = boards.get(p.get('board'), p.get('board', ''))
    return jsonify({'ok': True, 'posts': posts, 'items': items})


@admin_bp.route('/api/community/posts/<int:post_id>', methods=['DELETE'])
@admin_required
def api_admin_community_post_delete(post_id):
    """后台删除酒馆帖子。"""
    try:
        import web.app as _app
        with _app._community_lock:
            posts = _app._load_json_file(_app._COMMUNITY_FILE, [])
            post = next((p for p in posts if p.get('id') == post_id), None)
            if not post:
                return jsonify({'ok': False, 'error': '帖子不存在'}), 404
            posts = [p for p in posts if p.get('id') != post_id]
            _app._save_json_file(_app._COMMUNITY_FILE, posts)
    except Exception:
        return jsonify({'ok': False, 'error': '删除失败'}), 500

    from utils.logger import audit_log
    audit_log('admin.post_delete',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除酒馆帖子 #{post_id}')

    return jsonify({'ok': True})


@admin_bp.route('/api/community/items/<int:item_id>', methods=['DELETE'])
@admin_required
def api_admin_workshop_item_delete(item_id):
    """后台删除工坊投稿。"""
    try:
        import web.app as _app
        with _app._community_lock:
            items = _app._load_json_file(_app._WORKSHOP_FILE, [])
            item = next((s for s in items if s.get('id') == item_id), None)
            if not item:
                return jsonify({'ok': False, 'error': '投稿不存在'}), 404
            items = [s for s in items if s.get('id') != item_id]
            _app._save_json_file(_app._WORKSHOP_FILE, items)
    except Exception:
        return jsonify({'ok': False, 'error': '删除失败'}), 500

    from utils.logger import audit_log
    audit_log('admin.item_delete',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除工坊投稿 #{item_id}')

    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════════
# API — 审计日志
# ═══════════════════════════════════════════════════════════════════

@admin_bp.route('/api/audit-logs')
@admin_required
def api_admin_audit_logs():
    """查询审计日志（logs/audit.log），支持筛选。"""
    limit = request.args.get('limit', 200, type=int)
    limit = max(1, min(1000, limit))
    q = (request.args.get('q') or '').strip()
    action = (request.args.get('action') or '').strip()
    username = (request.args.get('username') or '').strip()

    audit_file = _Path(__file__).parent.parent / 'logs' / 'audit.log'
    entries = []
    try:
        if audit_file.exists():
            # ip 后接空格（IP 不含空格），避免用户名/详情中的 " ip=" 干扰解析
            pat = _re.compile(r'^\[(.+?)\] \[(.+?)\] user=(.*?) ip=([^ ]+) (.*)$')
            with open(audit_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    m = pat.match(line)
                    if not m:
                        entries.append({'time': '', 'action': '-', 'username': '', 'ip': '', 'detail': line})
                        continue
                    entries.append({
                        'time': m.group(1),
                        'action': m.group(2),
                        'username': m.group(3),
                        'ip': m.group(4),
                        'detail': m.group(5),
                    })
    except Exception:
        pass

    # 筛选（按时间倒序）
    entries.reverse()
    if action:
        entries = [e for e in entries if action in e['action']]
    if username:
        entries = [e for e in entries if username in e['username']]
    if q:
        entries = [e for e in entries if q in e['detail'] or q in e['time']]

    total = len(entries)
    return jsonify({
        'ok': True,
        'entries': entries[:limit],
        'total': total,
        'limit': limit,
    })


# ═══════════════════════════════════════════════════════════════════
# API — 数据备份中心
# ═══════════════════════════════════════════════════════════════════

_BACKUP_ROOT = _Path(__file__).parent.parent / 'backups'
_PROJECT_ROOT = _Path(__file__).parent.parent

# 备份内容清单: (源相对路径, 是否目录)
_BACKUP_SOURCES = [
    ('data/custom', True),
    ('web/chat_log.json', False),
    ('web/tavern_chat_log.json', False),
    ('web/dice_stats.json', False),
    ('web/event_stats.json', False),
    ('web/combat_state.json', False),
    ('web/shared_canvas.json', False),
    ('web/chat_archive', True),
    ('logs', True),
]

# 恢复时备份文件名 → 目标相对路径
_RESTORE_MAP = {
    'characters.db': 'data/characters.db',
    'chat_log.json': 'web/chat_log.json',
    'tavern_chat_log.json': 'web/tavern_chat_log.json',
    'dice_stats.json': 'web/dice_stats.json',
    'event_stats.json': 'web/event_stats.json',
    'combat_state.json': 'web/combat_state.json',
    'shared_canvas.json': 'web/shared_canvas.json',
    'custom': 'data/custom',
    'chat_archive': 'web/chat_archive',
    'logs': 'logs',
}


def _backup_name_valid(name: str) -> bool:
    """备份名只允许字母数字下划线连字符。"""
    return bool(name) and not any(c in name for c in ('/', '\\', '.', ' '))


def _sqlite_backup(src_path: _Path, dst_path: _Path) -> None:
    """用 sqlite3 在线备份 API 复制数据库（Windows 下文件占用也能成功）。"""
    import sqlite3 as _sqlite3
    src_conn = _sqlite3.connect(str(src_path))
    try:
        dst_conn = _sqlite3.connect(str(dst_path))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


@admin_bp.route('/api/backups')
@admin_required
def api_admin_list_backups():
    """列出所有备份（按时间倒序）。"""
    backups = []
    try:
        if _BACKUP_ROOT.exists():
            for d in sorted(_BACKUP_ROOT.iterdir(),
                            key=lambda p: p.stat().st_mtime, reverse=True):
                if not d.is_dir():
                    continue
                files = [f for f in d.rglob('*') if f.is_file()]
                backups.append({
                    'name': d.name,
                    'time': _time.strftime('%Y-%m-%d %H:%M:%S', _time.localtime(d.stat().st_mtime)),
                    'size_mb': round(sum(f.stat().st_size for f in files) / 1048576, 2),
                    'file_count': len(files),
                    'is_auto': d.name.startswith('admin_') or d.name.startswith('pre_restore_'),
                })
    except Exception:
        pass
    return jsonify({'ok': True, 'backups': backups})


@admin_bp.route('/api/backups', methods=['POST'])
@admin_required
def api_admin_create_backup():
    """创建一键备份（数据库 + 聊天/统计/画布/日志）。"""
    name = f"admin_{_time.strftime('%Y%m%d_%H%M%S')}"
    backup_dir = _BACKUP_ROOT / name
    backup_dir.mkdir(parents=True, exist_ok=True)

    created, failed = [], []

    # 数据库单独走 sqlite 在线备份
    db_src = _PROJECT_ROOT / 'data' / 'characters.db'
    if db_src.exists():
        try:
            _sqlite_backup(db_src, backup_dir / 'characters.db')
            created.append('data/characters.db')
        except Exception as e:
            failed.append(f'data/characters.db: {e}')

    # 其余文件直接复制
    for rel_path, is_dir in _BACKUP_SOURCES:
        src = _PROJECT_ROOT / rel_path
        if not src.exists():
            continue
        try:
            dst = backup_dir / src.name
            if is_dir:
                _shutil.copytree(src, dst)
            else:
                _shutil.copy2(src, dst)
            created.append(rel_path)
        except Exception as e:
            failed.append(f'{rel_path}: {e}')

    from utils.logger import audit_log
    audit_log('admin.backup_create',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'创建备份 {name}: {_json.dumps(created, ensure_ascii=False)}')

    return jsonify({'ok': True, 'name': name, 'created': created, 'failed': failed})


@admin_bp.route('/api/backups/<name>/download')
@admin_required
def api_admin_download_backup(name):
    """打包下载备份 (zip)。"""
    import io as _io
    import zipfile as _zipfile
    from flask import send_file

    if not _backup_name_valid(name):
        return jsonify({'ok': False, 'error': '非法的备份名'}), 400
    backup_dir = _BACKUP_ROOT / name
    if not backup_dir.is_dir():
        return jsonify({'ok': False, 'error': '备份不存在'}), 404

    buf = _io.BytesIO()
    with _zipfile.ZipFile(buf, 'w', _zipfile.ZIP_DEFLATED) as zf:
        for f in backup_dir.rglob('*'):
            if f.is_file():
                zf.write(f, f.relative_to(backup_dir).as_posix())
    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{name}.zip')


@admin_bp.route('/api/backups/<name>', methods=['DELETE'])
@admin_required
def api_admin_delete_backup(name):
    """删除备份目录。"""
    if not _backup_name_valid(name):
        return jsonify({'ok': False, 'error': '非法的备份名'}), 400
    backup_dir = _BACKUP_ROOT / name
    if not backup_dir.is_dir():
        return jsonify({'ok': False, 'error': '备份不存在'}), 404

    _shutil.rmtree(backup_dir)

    from utils.logger import audit_log
    audit_log('admin.backup_delete',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'删除备份 {name}')

    return jsonify({'ok': True})


@admin_bp.route('/api/backups/<name>/restore', methods=['POST'])
@admin_required
def api_admin_restore_backup(name):
    """恢复备份（覆盖当前数据，恢复前自动备份当前状态）。"""
    if not _backup_name_valid(name):
        return jsonify({'ok': False, 'error': '非法的备份名'}), 400
    backup_dir = _BACKUP_ROOT / name
    if not backup_dir.is_dir():
        return jsonify({'ok': False, 'error': '备份不存在'}), 404

    # 安全网：恢复前自动备份当前数据库
    safety_name = f"pre_restore_{_time.strftime('%Y%m%d_%H%M%S')}"
    safety_dir = _BACKUP_ROOT / safety_name
    safety_dir.mkdir(parents=True, exist_ok=True)
    db_src = _PROJECT_ROOT / 'data' / 'characters.db'
    try:
        if db_src.exists():
            _sqlite_backup(db_src, safety_dir / 'characters.db')
    except Exception:
        pass

    restored, failed = [], []
    for item in backup_dir.iterdir():
        target_rel = _RESTORE_MAP.get(item.name)
        if not target_rel:
            continue
        target = _PROJECT_ROOT / target_rel
        try:
            if item.is_dir():
                if target.exists():
                    _shutil.rmtree(target)
                _shutil.copytree(item, target)
            elif item.name == 'characters.db':
                # 数据库用 sqlite 在线恢复（目标可能被连接占用）
                _sqlite_backup(item, target)
            else:
                if not target.parent.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                _shutil.copy2(item, target)
            restored.append(target_rel)
        except Exception as e:
            failed.append(f'{target_rel}: {e}')

    # 数据库被覆盖后，清空 SQLAlchemy 会话缓存，避免读到旧数据
    try:
        db.session.remove()
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.backup_restore',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'恢复备份 {name}（安全网: {safety_name}）: {_json.dumps(restored, ensure_ascii=False)}')

    return jsonify({'ok': True, 'restored': restored, 'failed': failed,
                    'safety_backup': safety_name,
                    'restart_required': True})


@admin_bp.route('/api/logs/cleanup', methods=['POST'])
@admin_required
def api_admin_cleanup_logs():
    """清理 logs/ 下超过 N 天的轮转日志文件。"""
    days = request.args.get('days', '30')
    try:
        days = max(1, int(days))
    except ValueError:
        days = 30

    cutoff = _time.time() - days * 86400
    cleaned = []
    log_dir = _PROJECT_ROOT / 'logs'
    try:
        if log_dir.exists():
            for f in log_dir.iterdir():
                if not f.is_file():
                    continue
                # 轮转文件形如 dicebot.log.2026-08-05 / error.log.2026-08-04
                suffix = f.name.rsplit('.', 1)[-1]
                if len(suffix) == 10 and suffix[4] == '-' and f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    cleaned.append(f.name)
    except Exception:
        pass

    from utils.logger import audit_log
    audit_log('admin.logs_cleanup',
              username=_get_current_admin().username,
              ip=request.remote_addr or 'unknown',
              detail=f'清理 {days} 天前的轮转日志，删除 {len(cleaned)} 个文件')

    return jsonify({'ok': True, 'cleaned': cleaned, 'days': days})


# ═══════════════════════════════════════════════════════════════════
# 上下文注入：所有管理模板共享
# ═══════════════════════════════════════════════════════════════════

@admin_bp.context_processor
def inject_admin_context():
    """注入到管理后台模板的全局变量。"""
    admin = _get_current_admin()
    return {
        'admin_user': admin,
        'admin_username': admin.username if admin else None,
    }
