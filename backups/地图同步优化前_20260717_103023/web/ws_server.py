"""WebSocket 协作画布服务器 — 实时广播绘制操作"""
import asyncio
import json
import threading
import websockets

from .shared_state import (
    get_shared_canvas,
    update_shared_canvas,
    append_shared_strokes,
)

_connected: set = set()


async def handler(websocket):
    """WebSocket 连接处理"""
    _connected.add(websocket)
    try:
        # 新连接：发送完整画布状态
        state = get_shared_canvas()
        await websocket.send(json.dumps({
            'type': 'init',
            'state': state
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                action_type = data.get('type')

                if action_type == 'stroke':
                    stroke = data.get('data', {})
                    append_shared_strokes([stroke])

                elif action_type == 'strokes_clear':
                    update_shared_canvas('strokes', [])

                elif action_type == 'layers_update':
                    update_shared_canvas('layers', data.get('data', []))

                elif action_type == 'tokens_update':
                    update_shared_canvas('tokens', data.get('data', []))

                elif action_type == 'texts_update':
                    update_shared_canvas('texts', data.get('data', []))

                elif action_type == 'fog_update':
                    update_shared_canvas('fog', data.get('data', []))

                elif action_type == 'canvas_update':
                    canvas = get_shared_canvas()
                    canvas['canvas'] = data.get('data', {'width': 5000, 'height': 5000})

                elif action_type == 'clear_all':
                    for key in ['strokes', 'layers', 'tokens', 'texts', 'fog']:
                        update_shared_canvas(key, [])
                    canvas = get_shared_canvas()
                    canvas['canvas'] = {'width': 5000, 'height': 5000}

                # 广播给所有其他客户端
                broadcast = json.dumps(data)
                for client in _connected:
                    if client != websocket:
                        try:
                            await client.send(broadcast)
                        except Exception:
                            pass

            except json.JSONDecodeError:
                pass
    finally:
        _connected.discard(websocket)


async def main_ws():
    """启动 WebSocket 服务器"""
    try:
        async with websockets.serve(handler, '0.0.0.0', 5001, max_size=50 * 1024 * 1024):
            await asyncio.Future()
    except Exception:
        pass  # reloader child process: port already bound by parent


def run_ws_server():
    """在独立线程中运行 WebSocket 服务器"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(main_ws())
    except Exception:
        pass
