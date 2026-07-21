"""骰娘动态掷骰Mod — 注册到 Flask 的代理路由

启动独立的 FastAPI 服务（默认端口 8001），并将关键功能代理到 Flask。
"""

import sys
import os
import threading
import time
import logging

from flask import request

logger = logging.getLogger("dicebot.mod.dicebot-mod")

# FastAPI 服务引用
_fastapi_thread: threading.Thread | None = None
_fastapi_running = False
FASTAPI_PORT = 8001
FASTAPI_URL = f"http://localhost:{FASTAPI_PORT}"


def _start_fastapi_server():
    """在后台线程启动 FastAPI 服务"""
    global _fastapi_running
    try:
        # __file__ = .../骰娘/mods/dicebot-mod/backend/router.py
        # 向上 5 层到项目根目录，再进入 骰娘动态掷骰mod/backend
        backend_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
                os.path.dirname(os.path.abspath(__file__)))))),
            '骰娘动态掷骰mod', 'backend'
        )
        if not os.path.isdir(backend_dir):
            logger.warning(f"FastAPI backend 目录不存在: {backend_dir}")
            return

        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        import uvicorn
        from app.main import app as fastapi_app

        logger.info(f"启动 FastAPI 服务: {FASTAPI_URL}")
        _fastapi_running = True
        uvicorn.run(fastapi_app, host="0.0.0.0", port=FASTAPI_PORT, log_level="warning")

    except Exception as e:
        _fastapi_running = False
        logger.error(f"FastAPI 启动失败: {e}")


def register(app, mod_id, mod_info):
    """注册 Mod 路由到 Flask 应用"""

    @app.route(f'/api/mod/{mod_id}/status')
    def dicebot_mod_status():
        """FastAPI 服务状态查询"""
        try:
            import requests as _requests
            resp = _requests.get(f"{FASTAPI_URL}/health", timeout=3)
            data = resp.json()
            return {
                'fastapi_running': True,
                'fastapi_url': FASTAPI_URL,
                'fastapi_version': data.get('version', '?'),
                'active_engine': data.get('active_engine', '?'),
                'mods_loaded': data.get('mods_loaded', 0),
            }
        except Exception:
            return {
                'fastapi_running': False,
                'fastapi_url': FASTAPI_URL,
                'fastapi_version': '?',
                'help': 'FastAPI 服务未运行。调用 POST /api/mod/dicebot-mod/start 启动。',
            }

    @app.route(f'/api/mod/{mod_id}/start', methods=['POST'])
    def dicebot_mod_start():
        """启动 FastAPI 服务"""
        global _fastapi_thread, _fastapi_running
        if _fastapi_running:
            return {'status': 'already_running', 'url': FASTAPI_URL}

        _fastapi_thread = threading.Thread(
            target=_start_fastapi_server, daemon=True
        )
        _fastapi_thread.start()
        time.sleep(2)
        return {'status': 'starting', 'url': FASTAPI_URL, 'api_docs': f'{FASTAPI_URL}/docs'}

    @app.route(f'/api/mod/{mod_id}/stop', methods=['POST'])
    def dicebot_mod_stop():
        """停止 FastAPI 服务"""
        global _fastapi_running
        _fastapi_running = False
        return {'status': 'stopped', 'note': '后台线程已标记停止，重启Flask可完全释放'}

    # ━━ 代理端点：将 Flask 请求转发到 FastAPI ━━

    @app.route(f'/api/mod/{mod_id}/roll', methods=['POST'])
    def dicebot_mod_roll():
        """掷骰代理（支持 d20 adv/dis, 4d6k3, 爆炸骰等）"""
        try:
            import requests as _requests
            data = request.get_json() or {}
            expr = data.get('expression', '1d20')
            resp = _requests.post(
                f"{FASTAPI_URL}/api/roll",
                json={'expression': expr},
                timeout=10,
            )
            return resp.json() if resp.ok else ({'error': resp.text}, resp.status_code)
        except Exception as e:
            return {'error': f'FastAPI 服务不可用: {e}'}, 503

    @app.route(f'/api/mod/{mod_id}/engines')
    def dicebot_mod_engines():
        """规则引擎列表代理"""
        try:
            import requests as _requests
            resp = _requests.get(f"{FASTAPI_URL}/api/rules/engines", timeout=5)
            return resp.json()
        except Exception as e:
            return {'error': f'FastAPI 服务不可用: {e}'}, 503

    @app.route(f'/api/mod/{mod_id}/mods')
    def dicebot_mod_mods():
        """FastAPI Mod 列表代理"""
        try:
            import requests as _requests
            resp = _requests.get(f"{FASTAPI_URL}/api/mods", timeout=5)
            return resp.json()
        except Exception as e:
            return {'error': f'FastAPI 服务不可用: {e}'}, 503

    logger.info(f"骰娘动态掷骰Mod 已注册 (FastAPI: {FASTAPI_URL})")
    logger.info(f"  状态: /api/mod/{mod_id}/status")
    logger.info(f"  启动: POST /api/mod/{mod_id}/start")
    logger.info(f"  掷骰: POST /api/mod/{mod_id}/roll")
