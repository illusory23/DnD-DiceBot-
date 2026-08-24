"""尘封之卷 — 数据库初始化

统一管理 SQLAlchemy 引擎、会话和模型基类。
开发环境默认 SQLite，生产环境通过 DATABASE_URL 切换 PostgreSQL。

用法:
    from core.database import init_db, db
    init_db()                # 创建所有表
    from core.models import Character
    char = Character.query.get(1)
"""

from flask_sqlalchemy import SQLAlchemy
from flask import Flask

# 全局单例（在 init_db 时初始化）
db = SQLAlchemy()


def init_db(app: Flask = None, database_url: str = None):
    """初始化数据库引擎并创建所有表。

    Args:
        app: Flask 实例（可选，若提供则自动配置 SQLALCHEMY_DATABASE_URI）
        database_url: 数据库连接字符串（可选，覆盖 config.DATABASE_URL）
    """
    if database_url is None:
        from config import DATABASE_URL
        database_url = DATABASE_URL

    if app is not None:
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            'pool_size': 5,
            'pool_recycle': 3600,
            'pool_pre_ping': True,
        }
        db.init_app(app)
        # 在应用上下文中创建表
        with app.app_context():
            import core.models  # noqa: F401
            db.create_all()
    else:
        # 无 Flask app 时（CLI/测试），创建临时上下文
        temp_app = Flask(__name__)
        temp_app.config['SQLALCHEMY_DATABASE_URI'] = database_url
        temp_app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(temp_app)
        with temp_app.app_context():
            import core.models  # noqa: F401
            db.create_all()

    return db


def create_tables():
    """创建所有数据库表（幂等，已存在的表不会重复创建）。

    必须在 Flask 应用上下文中调用。
    """
    import core.models  # noqa: F401
    from flask import current_app
    # 如果有 current_app 上下文，使用它；否则需要外部提供
    db.create_all()
