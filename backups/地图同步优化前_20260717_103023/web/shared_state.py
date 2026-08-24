"""共享画布状态 — app.py 与 ws_server.py 共用，带磁盘持久化"""
import json
import os
import threading
import time
from pathlib import Path

_SAVE_FILE = Path(__file__).parent / 'shared_canvas.json'
_SAVE_DEBOUNCE = 3.0  # 秒，避免频繁写入大文件


def _load_from_disk():
    """启动时从磁盘恢复共享画布。"""
    try:
        if _SAVE_FILE.exists():
            with open(_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                canvas = {
                    'strokes': data.get('strokes', []),
                    'layers': data.get('layers', []),
                    'tokens': data.get('tokens', []),
                    'texts': data.get('texts', []),
                    'fog': data.get('fog', []),
                }
                # 如果有图层但 dataURL 为空，保留元数据
                return canvas, data.get('_ts', 0.0)
    except Exception:
        pass
    return {
        'strokes': [],
        'layers': [],
        'tokens': [],
        'texts': [],
        'fog': [],
    }, 0.0


def _save_to_disk():
    """保存共享画布到磁盘（后台线程）。"""
    global _shared_canvas, _shared_canvas_ts
    try:
        data = {
            'strokes': _shared_canvas.get('strokes', []),
            'layers': _shared_canvas.get('layers', []),
            'tokens': _shared_canvas.get('tokens', []),
            'texts': _shared_canvas.get('texts', []),
            'fog': _shared_canvas.get('fog', []),
            '_ts': _shared_canvas_ts,
        }
        # 不保存空画布（避免覆盖有效文件）
        has_content = any(len(data[k]) > 0 for k in ['strokes', 'layers', 'tokens', 'texts', 'fog'])
        if not has_content:
            return
        tmp = _SAVE_FILE.with_suffix('.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        tmp.replace(_SAVE_FILE)
    except Exception:
        pass


# ━━━ 模块初始化：从磁盘恢复 ━━━
_shared_canvas, _shared_canvas_ts = _load_from_disk()

# 防抖保存
_save_timer = None
_save_lock = threading.Lock()


def _debounced_save():
    global _save_timer
    with _save_lock:
        if _save_timer is not None:
            _save_timer.cancel()
        _save_timer = threading.Timer(_SAVE_DEBOUNCE, _save_to_disk)
        _save_timer.daemon = True
        _save_timer.start()


def update_shared_canvas(key: str, value):
    global _shared_canvas, _shared_canvas_ts
    if key in _shared_canvas:
        _shared_canvas[key] = value
    _shared_canvas_ts = time.time()
    _debounced_save()


def append_shared_strokes(strokes: list):
    global _shared_canvas, _shared_canvas_ts
    _shared_canvas['strokes'].extend(strokes)
    if len(_shared_canvas['strokes']) > 5000:
        _shared_canvas['strokes'] = _shared_canvas['strokes'][-5000:]
    _shared_canvas_ts = time.time()
    _debounced_save()


def get_shared_canvas() -> dict:
    return _shared_canvas


def get_shared_canvas_ts() -> float:
    return _shared_canvas_ts
