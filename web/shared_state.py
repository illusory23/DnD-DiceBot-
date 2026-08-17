"""共享画布状态 — app.py 使用，带磁盘持久化（线程安全）

改造要点:
- P0-3: 模块级 RLock 保护所有读写，落盘前在锁内深拷贝
- P0-1: 图层图片不再以 base64 存于 JSON，落地为 maps/layers/ 下的文件，
        状态中只存 url；启动时自动迁移旧数据中的 dataURL
- P1-1: 单调递增版本号 version，替代纯时间戳做变更检测；
        增量合并支持删除语义 (apply_incremental)
- P2:   防抖保存 + 最长间隔强制落盘兜底 + atexit 退出保存；
        clear_all 后允许保存空画布（避免旧内容复活）
"""
import atexit
import base64
import copy
import json
import re
import threading
import time
from pathlib import Path

# 2026-08-15 PostgreSQL 迁移：画布持久化改 PG shared_canvas 单行表。
# 本模块独立于 Flask 使用（模块级初始化无 app context），
# 因此用 config.DATABASE_URL 建立独立 SQLAlchemy 引擎，不依赖 Flask-SQLAlchemy。
from sqlalchemy import create_engine
try:
    from config import DATABASE_URL as _DATABASE_URL
    _PG_ENGINE = create_engine(_DATABASE_URL)
except Exception:
    _PG_ENGINE = None

_SAVE_FILE = Path(__file__).parent / 'shared_canvas.json'  # 历史兼容（不再读写）
_LAYER_IMG_DIR = Path(__file__).parent.parent / 'maps' / 'layers'
_SAVE_DEBOUNCE = 3.0      # 秒，防抖窗口
_SAVE_MAX_INTERVAL = 15.0  # 秒，持续修改时最长多久必须落盘一次

_EMPTY_CANVAS = {
    'strokes': [],
    'layers': [],
    'tokens': [],
    'texts': [],
    'fog': [],
}

_lock = threading.RLock()


# ━━━ 图层图片外置存储 ━━━

_DATAURL_RE = re.compile(r'^data:image/(png|jpeg|jpg|gif|webp);base64,(.+)$', re.DOTALL)


def save_layer_image(layer_id, data_url: str) -> str | None:
    """将图层的 base64 dataURL 落地为图片文件，返回可访问的 URL 路径。

    失败返回 None（调用方保留 dataURL 作为回退）。
    """
    m = _DATAURL_RE.match(data_url or '')
    if not m:
        return None
    ext = m.group(1)
    if ext == 'jpg':
        ext = 'jpeg'
    try:
        raw = base64.b64decode(m.group(2), validate=False)
        _LAYER_IMG_DIR.mkdir(parents=True, exist_ok=True)
        # 文件名只保留安全字符，避免路径注入
        safe_id = re.sub(r'[^0-9A-Za-z_\-]', '_', str(layer_id))[:64] or 'layer'
        filename = f'{safe_id}.{ext}'
        with open(_LAYER_IMG_DIR / filename, 'wb') as f:
            f.write(raw)
        return f'/maps/layers/{filename}'
    except Exception:
        return None


def _externalize_layer_images(layers: list) -> bool:
    """把 layers 中内嵌的 dataURL 迁移为外部文件 + url。返回是否有改动。"""
    changed = False
    for layer in layers or []:
        if not isinstance(layer, dict):
            continue
        data_url = layer.get('dataURL') or ''
        if data_url.startswith('data:image'):
            url = save_layer_image(layer.get('id', 'layer'), data_url)
            if url:
                layer['url'] = url
                layer['dataURL'] = ''
                changed = True
    return changed


def _load_layer_meta_from_backups() -> dict[int, dict]:
    """扫描 backups/ 目录中的旧 shared_canvas.json，提取图层元数据。

    返回 {layer_id: {name, offsetX, offsetY, scale}} 的映射。
    仅在恢复孤立图层时用于补全位置/缩放参数。
    """
    backups_dir = Path(__file__).parent.parent / 'backups'
    if not backups_dir.exists():
        return {}
    meta = {}
    try:
        for backup_dir in sorted(backups_dir.iterdir(), reverse=True):
            candidate = backup_dir / 'web' / 'shared_canvas.json'
            if not candidate.exists():
                # 也检查直接在 backup_dir 下的
                candidate = backup_dir / 'shared_canvas.json'
            if not candidate.exists():
                continue
            try:
                with open(candidate, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
            except Exception:
                continue
            for l in old_data.get('layers', []) or []:
                lid = l.get('id') if isinstance(l, dict) else None
                if lid is not None and lid not in meta:
                    meta[lid] = {
                        'name': l.get('name', ''),
                        'offsetX': l.get('offsetX', 0),
                        'offsetY': l.get('offsetY', 0),
                        'scale': l.get('scale', 1),
                    }
            if meta:
                break  # 找到第一个有效备份即停止
    except OSError:
        pass
    return meta


def _recover_orphan_layer_images(layers: list) -> list:
    """扫描 maps/layers/ 目录，恢复 JSON 中缺失引用的孤立图层图片。

    场景：迁移后图片已落地为文件，但 shared_canvas.json 的 layers 被清空
    （如全量推送空列表覆盖），导致服务端"忘记"了图层。此函数重新发现这些
    文件并重建图层条目，同时从 backups/ 目录提取原始位置/缩放参数。
    """
    if not _LAYER_IMG_DIR.exists():
        return layers
    # 收集已有的 url 引用
    existing_urls = set()
    for l in (layers or []):
        if isinstance(l, dict):
            url = l.get('url', '')
            if url:
                existing_urls.add(url)
    # 尝试从旧备份中提取图层元数据（位置/缩放/名称）
    backup_meta = _load_layer_meta_from_backups()
    # 扫描目录中的图片文件
    recovered = []
    _IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
    try:
        for f in sorted(_LAYER_IMG_DIR.iterdir()):
            if not f.is_file():
                continue
            if f.suffix.lower() not in _IMG_EXTS:
                continue
            # 跳过损坏的 1×1 占位图（≤120 字节）
            fsize = f.stat().st_size
            if fsize <= 120:
                print(f'[shared_state] 跳过疑似损坏文件(仅{fsize}字节): {f.name}')
                continue
            url = f'/maps/layers/{f.name}'
            if url in existing_urls:
                continue
            # 从文件名提取 id（2.png → 2, layer_5.jpg → 5）
            try:
                lid = int(re.sub(r'[^0-9]', '', f.stem) or '0')
            except ValueError:
                lid = 0
            if lid == 0:
                lid = abs(hash(f.stem)) % 1000000  # 回退：hash 生成唯一 id
            # 从备份提取元数据，没有则用默认值
            bm = backup_meta.get(lid, {})
            layer = {
                'id': lid,
                'name': bm.get('name') or f.stem,
                'url': url,
                'dataURL': '',
                'visible': True,
                'offsetX': bm.get('offsetX', 0),
                'offsetY': bm.get('offsetY', 0),
                'scale': bm.get('scale', 1),
            }
            recovered.append(layer)
            print(f'[shared_state] 恢复孤立图层: {f.name} → id={lid}')
    except OSError as e:
        print(f'[shared_state] 扫描 {_LAYER_IMG_DIR} 失败: {e}')
    return layers + recovered


# ━━━ 磁盘读写 ━━━

def _load_from_disk():
    """启动时从 PostgreSQL 恢复共享画布（原 shared_canvas.json），并迁移旧格式的内嵌图片。

    用独立引擎直连（模块级调用时无 Flask app context）。
    """
    try:
        from core.models import SharedCanvas as _SC
        with _PG_ENGINE.connect() as conn:
            row = conn.execute(_SC.__table__.select().where(_SC.id == 1)).mappings().first()
        if row and isinstance(row['data'], dict):
            data = row['data']
            canvas = {k: data.get(k, []) for k in _EMPTY_CANVAS}
            migrated = _externalize_layer_images(canvas.get('layers', []))
            # 恢复 JSON 中缺失但磁盘上存在的图层图片
            old_count = len(canvas.get('layers', []))
            canvas['layers'] = _recover_orphan_layer_images(canvas.get('layers', []))
            if len(canvas['layers']) > old_count:
                migrated = True  # 有恢复则标记为已迁移，触发回写
            return canvas, float(row['ts'] or data.get('_ts', 0.0)), int(row['ver'] or data.get('_ver', 0)), migrated
    except Exception as e:
        print(f'[shared_state] 读取画布失败: {e}')
    return copy.deepcopy(_EMPTY_CANVAS), 0.0, 0, False


def _snapshot_for_save():
    """在锁内深拷贝需要持久化的数据。"""
    with _lock:
        data = {k: copy.deepcopy(_shared_canvas.get(k, [])) for k in _EMPTY_CANVAS}
        data['_ts'] = _shared_canvas_ts
        data['_ver'] = _version
        cleared = _explicitly_cleared
    return data, cleared


def _save_to_disk():
    """保存共享画布到 PostgreSQL（单行 upsert，后台线程调用）。"""
    global _last_save_time
    try:
        data, cleared = _snapshot_for_save()
        # 未经用户确认的空画布不保存（避免异常状态覆盖有效数据）；
        # 用户主动清空 (mark_cleared) 后允许保存空画布
        has_content = any(len(data[k]) > 0 for k in _EMPTY_CANVAS)
        if not has_content and not cleared:
            return
        from core.models import SharedCanvas as _SC
        with _PG_ENGINE.begin() as conn:
            exists = conn.execute(_SC.__table__.select().where(_SC.id == 1)).first()
            if exists:
                conn.execute(_SC.__table__.update().where(_SC.id == 1).values(
                    data=data, ver=data.get('_ver', 0), ts=data.get('_ts', 0)))
            else:
                conn.execute(_SC.__table__.insert().values(
                    id=1, data=data, ver=data.get('_ver', 0), ts=data.get('_ts', 0)))
        _last_save_time = time.time()
    except Exception as e:
        print(f'[shared_state] 保存画布失败: {e}')


# ━━━ 模块初始化：从磁盘恢复 ━━━
_shared_canvas, _shared_canvas_ts, _version, _migrated = _load_from_disk()
_explicitly_cleared = False
_last_save_time = time.time()

# 防抖保存
_save_timer = None


def _debounced_save():
    """防抖保存；若距上次落盘超过 _SAVE_MAX_INTERVAL 则立即保存（兜底）。"""
    global _save_timer
    with _lock:
        if time.time() - _last_save_time >= _SAVE_MAX_INTERVAL:
            if _save_timer is not None:
                _save_timer.cancel()
                _save_timer = None
            threading.Thread(target=_save_to_disk, daemon=True).start()
            return
        if _save_timer is not None:
            _save_timer.cancel()
        _save_timer = threading.Timer(_SAVE_DEBOUNCE, _save_to_disk)
        _save_timer.daemon = True
        _save_timer.start()


def _bump() -> int:
    """更新时间戳与版本号（须在锁内调用），并触发防抖保存。"""
    global _shared_canvas_ts, _version
    _shared_canvas_ts = time.time()
    _version += 1
    _debounced_save()
    return _version


# ━━━ 对外接口（全部加锁） ━━━

def update_shared_canvas(key: str, value) -> int:
    """全量替换某一类数据。layers 中的内嵌图片自动外置。返回新版本号。"""
    global _explicitly_cleared
    with _lock:
        if key in _shared_canvas:
            if key == 'layers':
                _externalize_layer_images(value)
            _shared_canvas[key] = value
            _explicitly_cleared = False
        return _bump()


def apply_incremental(key: str, items: list, removed_ids: list | None = None) -> int:
    """按 id 增量合并一类数据，支持删除语义。返回新版本号。

    - items: 新增或更新的条目（按 id 覆盖）
    - removed_ids: 需要删除的条目 id 列表
    """
    global _explicitly_cleared
    with _lock:
        if key not in _shared_canvas:
            return _version
        if key == 'layers':
            _externalize_layer_images(items)
        existing = {it.get('id'): it for it in _shared_canvas[key]
                    if isinstance(it, dict) and it.get('id') is not None}
        for it in items or []:
            if isinstance(it, dict) and it.get('id') is not None:
                existing[it['id']] = it
        for rid in removed_ids or []:
            existing.pop(rid, None)
        _shared_canvas[key] = list(existing.values())
        _explicitly_cleared = False
        return _bump()


def apply_fog_incremental(strokes: list, erasures: list,
                          remove_stroke_ids: list | None = None,
                          remove_erase_ids: list | None = None) -> int:
    """迷雾增量合并（按 id 去重/删除），兼容旧无 id / 列表格式数据。

    迷雾元素（雾笔/擦除轨迹）各自带唯一 id；增量只传新增/删除的元素，
    避免每次绘制/擦除都全量重传整个迷雾数组（远程延迟与带宽的关键优化）。
    """
    global _explicitly_cleared
    with _lock:
        cur = _shared_canvas.get('fog')
        if not isinstance(cur, dict):
            # 旧格式兼容：空或列表（视为旧雾笔数组）→ 规范为 {strokes, erasures, visible}
            if isinstance(cur, list):
                cur = {'strokes': list(cur), 'erasures': [], 'visible': True}
            else:
                cur = {'strokes': [], 'erasures': [], 'visible': True}
        s_map = {s.get('id'): s for s in cur.get('strokes', [])
                 if isinstance(s, dict) and s.get('id')}
        for s in strokes or []:
            if isinstance(s, dict) and s.get('id'):
                s_map[s['id']] = s
        for rid in remove_stroke_ids or []:
            s_map.pop(rid, None)
        e_map = {e.get('id'): e for e in cur.get('erasures', [])
                 if isinstance(e, dict) and e.get('id')}
        for e in erasures or []:
            if isinstance(e, dict) and e.get('id'):
                e_map[e['id']] = e
        for rid in remove_erase_ids or []:
            e_map.pop(rid, None)
        cur['strokes'] = list(s_map.values())
        cur['erasures'] = list(e_map.values())
        _shared_canvas['fog'] = cur
        _explicitly_cleared = False
        return _bump()


def append_shared_strokes(strokes: list) -> int:
    """追加笔迹（按 id 去重），超限截断。返回新版本号。"""
    global _explicitly_cleared
    with _lock:
        seen = {s.get('id') for s in _shared_canvas['strokes']
                if isinstance(s, dict) and s.get('id')}
        for s in strokes or []:
            sid = s.get('id') if isinstance(s, dict) else None
            if sid and sid in seen:
                continue  # 已有同 id 笔迹，跳过（防重复合并）
            _shared_canvas['strokes'].append(s)
            if sid:
                seen.add(sid)
        if len(_shared_canvas['strokes']) > 5000:
            _shared_canvas['strokes'] = _shared_canvas['strokes'][-5000:]
        _explicitly_cleared = False
        return _bump()


def remove_shared_strokes(stroke_ids: list) -> int:
    """按 id 删除笔迹。返回新版本号。"""
    with _lock:
        ids = set(stroke_ids or [])
        if ids:
            _shared_canvas['strokes'] = [
                s for s in _shared_canvas['strokes']
                if not (isinstance(s, dict) and s.get('id') in ids)
            ]
        return _bump()


def clear_shared_canvas() -> int:
    """清空全部画布内容（用户主动操作），立即落盘。返回新版本号。"""
    global _shared_canvas, _explicitly_cleared
    with _lock:
        for k in _EMPTY_CANVAS:
            _shared_canvas[k] = []
        _explicitly_cleared = True
        ver = _bump()
    _save_to_disk()  # 主动清空立即持久化，避免重启后旧内容复活
    return ver


def get_state_snapshot() -> dict:
    """获取画布状态的深拷贝快照（用于序列化发送，避免并发修改）。"""
    with _lock:
        snap = {k: copy.deepcopy(_shared_canvas.get(k, [])) for k in _EMPTY_CANVAS}
        snap['_ver'] = _version
        return snap


def get_shared_canvas() -> dict:
    """获取内部状态字典（仅限持锁场景的轻量读取；序列化请用 get_state_snapshot）。"""
    return _shared_canvas


def get_shared_canvas_ts() -> float:
    with _lock:
        return _shared_canvas_ts


def get_version() -> int:
    with _lock:
        return _version


def flush_save():
    """立即落盘（供退出钩子/关键操作调用）。"""
    global _save_timer
    with _lock:
        if _save_timer is not None:
            _save_timer.cancel()
            _save_timer = None
    _save_to_disk()


# 启动时如做过旧数据迁移，立即回写瘦身后的 JSON
if _migrated:
    print('[shared_state] 已将图层内嵌图片迁移至 maps/layers/，JSON 已瘦身')
    _save_to_disk()

# 退出时强制保存，避免防抖窗口内的数据丢失
atexit.register(flush_save)
