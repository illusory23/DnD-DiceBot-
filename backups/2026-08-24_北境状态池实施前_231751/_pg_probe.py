# -*- coding: utf-8 -*-
"""PG9.3 兼容性侦察: SQLAlchemy 连接 / JSON 类型 / SERIAL / 建表"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from sqlalchemy import create_engine, text, Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import declarative_base, Session

URL = 'postgresql+psycopg2://postgres:asd204402@localhost:5432/postgres'
engine = create_engine(URL)

with engine.connect() as conn:
    v = conn.execute(text('SELECT version()')).scalar()
    print('SQLAlchemy 连接 OK:', v[:45])
    enc = conn.execute(text('SHOW server_encoding')).scalar()
    print('服务器编码:', enc)
    j = conn.execute(text("SELECT '{\"a\": 1}'::json")).scalar()
    print('JSON 类型 OK:', j)

# 临时表测试: JSON 列 + SERIAL + 中文
Base = declarative_base()

class _Probe(Base):
    __tablename__ = '_pg_probe_tmp'
    id = Column(Integer, primary_key=True)  # SERIAL 由方言自动处理
    name = Column(String(100))
    payload = Column(JSON)          # PG JSON
    created_at = Column(DateTime)

Base.metadata.create_all(engine)
with Session(engine) as s:
    s.add(_Probe(name='中文测试🎲', payload={'comments': [{'id': 1, 'text': '评论'}]}))
    s.commit()
    row = s.query(_Probe).first()
    print('插入+查询 OK:', row.name, '| JSON列:', row.payload['comments'][0]['text'])

# 清理
_Probe.__table__.drop(engine)
print('侦察完成: PG 9.3 可用(SQLAlchemy + JSON + SERIAL + 中文)')
