"""共享画布状态 — app.py 与 ws_server.py 共用"""
import time

# HTTP 共享画布状态（同时也是 WebSocket 画布的持久化副本）
_shared_canvas: dict = {
    'strokes': [],
    'layers': [],
    'tokens': [],
    'texts': [],
    'fog': [],
}
_shared_canvas_ts: float = 0.0


def update_shared_canvas(key: str, value):
    """更新共享画布的某个字段并刷新时间戳。ws_server 调用此函数同步 WebSocket 状态到 HTTP。"""
    global _shared_canvas, _shared_canvas_ts
    if key in _shared_canvas:
        _shared_canvas[key] = value
    _shared_canvas_ts = time.time()


def append_shared_strokes(strokes: list):
    """追加笔画到共享画布。"""
    global _shared_canvas, _shared_canvas_ts
    _shared_canvas['strokes'].extend(strokes)
    if len(_shared_canvas['strokes']) > 5000:
        _shared_canvas['strokes'] = _shared_canvas['strokes'][-5000:]
    _shared_canvas_ts = time.time()


def get_shared_canvas() -> dict:
    return _shared_canvas


def get_shared_canvas_ts() -> float:
    return _shared_canvas_ts
