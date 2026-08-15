"""尘封之卷 — 应用配置

支持通过环境变量覆盖，方便开发/生产切换。
"""

import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent

# ━━━ 数据库 ━━━
# 默认使用 SQLite，设置 DATABASE_URL 环境变量可切换到 PostgreSQL
#   SQLite:      sqlite:///data/characters.db
#   PostgreSQL:  postgresql://user:pass@localhost:5432/dicebot
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    f'sqlite:///{BASE_DIR / "data" / "characters.db"}'
)

# ━━━ 服务器 ━━━
SERVER_HOST = os.getenv('SERVER_HOST', '0.0.0.0')
SERVER_PORT = int(os.getenv('SERVER_PORT', '5000'))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# ━━━ 聊天 ━━━
CHAT_MAX_MESSAGES = int(os.getenv('CHAT_MAX_MESSAGES', '500'))

# ━━━ 画布 ━━━
CANVAS_SAVE_DEBOUNCE = float(os.getenv('CANVAS_SAVE_DEBOUNCE', '3.0'))
CANVAS_SAVE_MAX_INTERVAL = float(os.getenv('CANVAS_SAVE_MAX_INTERVAL', '15.0'))

# ━━━ WebSocket ━━━
WS_HEARTBEAT_SECONDS = int(os.getenv('WS_HEARTBEAT_SECONDS', '8'))
WS_TIMEOUT_SECONDS = int(os.getenv('WS_TIMEOUT_SECONDS', '10'))
