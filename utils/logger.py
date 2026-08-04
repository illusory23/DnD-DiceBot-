"""尘封之卷 — 统一日志系统

提供:
  - 按日期轮转的文件日志
  - 分级日志 (DEBUG/INFO/WARNING/ERROR)
  - Flask 请求日志中间件
  - 前端错误收集
  - 关键操作审计日志
"""

import logging
import logging.handlers
import os
import json as _json
import time as _time
from pathlib import Path
from datetime import datetime

# ━━━ 日志目录 ━━━
LOG_DIR = Path(__file__).parent.parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

# ━━━ 日志格式 ━━━
LOG_FORMAT = '[%(asctime)s] [%(levelname)s] %(name)s: %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# 已初始化的 logger 缓存
_loggers: dict[str, logging.Logger] = {}


def get_logger(name: str = 'dicebot', level: int = logging.INFO) -> logging.Logger:
    """获取或创建 logger 实例。

    自动配置:
      - 按日期轮转的文件日志 (logs/<name>.log)
      - 控制台输出（仅 WARNING 以上）
      - 错误日志单独记录 (logs/error.log)
    """
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)
    if logger.handlers:
        _loggers[name] = logger
        return logger

    logger.setLevel(level)

    # ━━ 文件日志：按日期轮转（每天一个文件，保留30天） ━━
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=LOG_DIR / f'{name}.log',
        when='midnight',
        interval=1,
        backupCount=30,
        encoding='utf-8',
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(file_handler)

    # ━━ 错误日志：ERROR 以上单独记录 ━━
    error_handler = logging.handlers.TimedRotatingFileHandler(
        filename=LOG_DIR / 'error.log',
        when='midnight',
        interval=1,
        backupCount=30,
        encoding='utf-8',
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(error_handler)

    # ━━ 控制台日志：仅开发环境 ━━
    if os.environ.get('FLASK_ENV') != 'production':
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.WARNING)
        console_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
        logger.addHandler(console_handler)

    _loggers[name] = logger
    return logger


# ━━━ Flask 请求日志中间件 ━━━

def setup_request_logging(app, logger: logging.Logger | None = None):
    """为 Flask 应用安装请求日志中间件。

    自动记录每个 API 调用的:
      - 方法、路径、参数、IP
      - 响应状态码
      - 处理耗时
    """
    if logger is None:
        logger = get_logger('dicebot')

    import flask

    @app.before_request
    def _log_request_start():
        flask.g._req_start = _time.time()

    @app.after_request
    def _log_request_end(response):
        duration = (_time.time() - flask.g.get('_req_start', _time.time())) * 1000
        # 仅记录 API 请求，跳过静态资源
        path = flask.request.path
        if path.startswith('/api/') or path.startswith('/ws'):
            logger.info(
                f'[{flask.request.method}] {path} '
                f'→ {response.status_code} '
                f'({duration:.1f}ms) '
                f'IP={flask.request.remote_addr} '
                f'UA={flask.request.user_agent.string[:80] if flask.request.user_agent else "?"}'
            )
            # 记录慢请求
            if duration > 1000:
                logger.warning(f'慢请求: [{flask.request.method}] {path} ({duration:.0f}ms)')
            # 记录错误响应
            if response.status_code >= 500:
                logger.error(f'服务端错误: [{flask.request.method}] {path} → {response.status_code}')
        return response

    logger.info('Flask 请求日志中间件已安装')
    return logger


# ━━━ 前端错误收集 ━━━

_FRONTEND_ERROR_FILE = LOG_DIR / 'frontend_errors.jsonl'


def log_frontend_error(data: dict):
    """记录前端上报的错误。

    data 格式:
      { message, source, lineno, colno, stack, url, userAgent, username, page }
    """
    try:
        entry = {
            'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'message': data.get('message', '')[:500],
            'source': data.get('source', '')[:200],
            'lineno': data.get('lineno', 0),
            'colno': data.get('colno', 0),
            'url': data.get('url', '')[:300],
            'page': data.get('page', '')[:100],
            'username': data.get('username', '')[:50],
            'userAgent': data.get('userAgent', '')[:200],
            'stack': (data.get('stack', '') or '')[:2000],
        }
        with open(_FRONTEND_ERROR_FILE, 'a', encoding='utf-8') as f:
            f.write(_json.dumps(entry, ensure_ascii=False) + '\n')
    except Exception:
        pass  # 不因日志写入失败影响主流程


def get_frontend_errors(limit: int = 100) -> list[dict]:
    """读取最近的前端错误记录"""
    errors = []
    try:
        if _FRONTEND_ERROR_FILE.exists():
            with open(_FRONTEND_ERROR_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            errors.append(_json.loads(line))
                        except _json.JSONDecodeError:
                            pass
            errors = errors[-limit:]
    except Exception:
        pass
    return errors


# ━━━ 审计日志 ━━━

_AUDIT_FILE = LOG_DIR / 'audit.log'


def audit_log(action: str, username: str = '', detail: str = '', ip: str = ''):
    """记录关键操作审计日志。

    action: 操作类型 (如 'character.delete', 'archive.clear', 'stats.reset')
    """
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        entry = f'[{timestamp}] [{action}] user={username} ip={ip} {detail}'
        with open(_AUDIT_FILE, 'a', encoding='utf-8') as f:
            f.write(entry.strip() + '\n')
    except Exception:
        pass
