"""WebSocket 协作画布服务器 — 实时广播绘制操作"""
import asyncio
import json
import threading
import websockets

# 共享画布历史：{strokes: [...], layers: [...], tokens: [...], texts: [...], fog: [...]}
_paint_state = {
    'strokes': [],   # [{tool, color, size, points: [{x,y},...]}]
    'layers': [],    # [{id, name, dataURL, offsetX, offsetY, scale, visible}]
    'tokens': [],    # [{id, charId, name, portraitUrl, x, y, size, rotation}]
    'texts': [],     # [{id, x, y, text, fontSize}]
    'fog': [],       # [{points: [{x,y},...], closed}]
    'canvas': {'width': 5000, 'height': 5000},
}

_connected: set = set()

async def handler(websocket):
    """WebSocket 连接处理"""
    _connected.add(websocket)
    try:
        # 新连接：发送完整画布状态
        await websocket.send(json.dumps({
            'type': 'init',
            'state': _paint_state
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                action_type = data.get('type')

                if action_type == 'stroke':
                    # 单笔画追加
                    stroke = data.get('data', {})
                    _paint_state['strokes'].append(stroke)
                    # 限制笔画数量
                    if len(_paint_state['strokes']) > 5000:
                        _paint_state['strokes'] = _paint_state['strokes'][-5000:]

                elif action_type == 'strokes_clear':
                    _paint_state['strokes'] = []

                elif action_type == 'layers_update':
                    _paint_state['layers'] = data.get('data', [])

                elif action_type == 'tokens_update':
                    _paint_state['tokens'] = data.get('data', [])

                elif action_type == 'texts_update':
                    _paint_state['texts'] = data.get('data', [])

                elif action_type == 'fog_update':
                    _paint_state['fog'] = data.get('data', [])

                elif action_type == 'canvas_update':
                    _paint_state['canvas'] = data.get('data', {'width': 5000, 'height': 5000})

                elif action_type == 'clear_all':
                    _paint_state.update({
                        'strokes': [], 'layers': [], 'tokens': [],
                        'texts': [], 'fog': [],
                        'canvas': {'width': 5000, 'height': 5000},
                    })

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
        async with websockets.serve(handler, '0.0.0.0', 5001, max_size=50*1024*1024):
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
