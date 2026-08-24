"""尘封之卷 — 应用配置

支持通过环境变量覆盖，方便开发/生产切换。
"""

import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent

# ━━━ 数据库 ━━━
# 2026-08-15 已全量迁移 PostgreSQL；DATABASE_URL 环境变量仍可覆盖
#   PostgreSQL:  postgresql://user:pass@localhost:5432/dicebot
#   SQLite(回滚): sqlite:///data/characters.db
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql+psycopg2://postgres:asd204402@localhost:5432/dicebot'
)

# ━━━ 服务器 ━━━
SERVER_HOST = os.getenv('SERVER_HOST', '0.0.0.0')
SERVER_PORT = int(os.getenv('SERVER_PORT', '5000'))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# ━━━ 公网基址（分享链接用）━━━
# FRP/ZeroTier 等内网穿透场景：填远程可访问的地址（如 https://xxx.frp.io），
# 分享的链接将以此开头而非 localhost；留空则回退当前访问地址
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')

# ━━━ 聊天 ━━━
CHAT_MAX_MESSAGES = int(os.getenv('CHAT_MAX_MESSAGES', '500'))

# ━━━ 画布 ━━━
CANVAS_SAVE_DEBOUNCE = float(os.getenv('CANVAS_SAVE_DEBOUNCE', '3.0'))
CANVAS_SAVE_MAX_INTERVAL = float(os.getenv('CANVAS_SAVE_MAX_INTERVAL', '15.0'))

# ━━━ WebSocket ━━━
WS_HEARTBEAT_SECONDS = int(os.getenv('WS_HEARTBEAT_SECONDS', '8'))
WS_TIMEOUT_SECONDS = int(os.getenv('WS_TIMEOUT_SECONDS', '10'))
