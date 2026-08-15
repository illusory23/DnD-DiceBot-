# -*- coding: utf-8 -*-
"""全量迁移: SQLite(characters.db) + JSON 运行数据 → PostgreSQL(dicebot)

用法:
    python _migrate_pg.py          # 幂等: 目标表已有数据则跳过
    python _migrate_pg.py --force  # 清空目标表后重迁

迁移内容:
  1. SQLite 17 表 (users/characters/.../north_saves) → PG 同名表
  2. 12 个 JSON 运行数据文件 → PG 新表 (chat/dm/stats/canvas/topics/公告/酒馆/工坊/收藏)
  3. web/chat_archive/*.json → chat_archives 表
"""
import sys, io, json, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

BASE = Path(__file__).parent.parent          # 项目根
SQLITE = BASE / 'data' / 'characters.db'
PG_URL = 'postgresql+psycopg2://postgres:asd204402@localhost:5432/dicebot'

# 在 PG 创建全部表（含新增 14 表；create_all 幂等）
sys.path.insert(0, str(BASE))
from core.database import init_db as _init_db
_init_db(database_url=PG_URL)

FORCE = '--force' in sys.argv

pg = create_engine(PG_URL)
sess = Session(pg)

def q(sql, *args, **kwargs):
    if kwargs:
        return sess.execute(text(sql), kwargs)
    return sess.execute(text(sql), args)

def table_count(table: str) -> int:
    return q(f'SELECT COUNT(*) FROM {table}').scalar() or 0

def has_table(table: str) -> bool:
    r = q("SELECT 1 FROM information_schema.tables WHERE table_name = :t", t=table)
    return r.scalar() is not None

def reset_seq(table: str, id_col: str = 'id'):
    """重置 PG 序列到 max(id)，保证后续自增不冲突。"""
    q(f"SELECT setval(pg_get_serial_sequence('{table}', '{id_col}'), "
      f"(SELECT COALESCE(MAX({id_col}), 1) FROM {table}))")

def migrate_sqlite_table(name: str):
    """SQLite 表 → PG 同名表（显式 id，幂等）。"""
    if not has_table(name):
        print(f'  !! PG 无表 {name}，跳过')
        return 0
    if table_count(name) > 0 and not FORCE:
        print(f'  - {name}: PG 已有 {table_count(name)} 行，跳过')
        return 0
    if FORCE:
        sess.execute(text(f'DELETE FROM {name}'))
        sess.commit()
    conn = sqlite3.connect(str(SQLITE))
    rows = conn.execute(f'SELECT * FROM {name}').fetchall()
    cols = [d[0] for d in conn.execute(f'SELECT * FROM {name}').description]
    conn.close()
    if not rows:
        print(f'  - {name}: 源为空')
        return 0
    # 布尔列转换: SQLite 存 0/1 整数, PG BOOLEAN 需 bool
    from sqlalchemy import inspect as _sa_inspect
    pg_cols = {c['name']: str(c['type']).upper() for c in _sa_inspect(pg).get_columns(name)}
    # 逐行插入（JSON 类型列由 SQLAlchemy 自动处理；其余原样）
    for row in rows:
        kv = dict(zip(cols, row))
        for cname, ctype in pg_cols.items():
            if cname in kv and kv[cname] is not None and ctype.startswith('BOOLEAN'):
                kv[cname] = bool(kv[cname])
        col_list = ', '.join(kv.keys())
        ph = ', '.join(':' + k for k in kv)
        sess.execute(text(f'INSERT INTO {name} ({col_list}) VALUES ({ph})'), kv)
    sess.commit()
    reset_seq(name)
    sess.commit()
    print(f'  ✓ {name}: {len(rows)} 行迁入 (id 1-{rows[-1][0]})')
    return len(rows)

print('═══ 迁移到 PostgreSQL(dicebot) ═══')
print('SQLite 库:', SQLITE)

# ━━ 1. SQLite → PG（FK 顺序） ━━
print('\n[1/3] SQLite 17 表 → PG')
SQLITE_TABLES = [
    'users', 'character_groups', 'characters',
    'abilities', 'skill_proficiencies', 'save_proficiencies',
    'spell_slots', 'death_saves', 'weapons', 'armor', 'coins',
    'prepared_spells', 'learned_spells', 'background_details',
    'inventory', 'character_features', 'north_saves',
]
total_orm = 0
for t in SQLITE_TABLES:
    total_orm += migrate_sqlite_table(t)
print(f'  合计迁移 {total_orm} 行')

# ━━ 2. JSON → PG ━━
print('\n[2/3] JSON 运行数据 → PG')
# 聊天室（chat_log 有 500 条上限，迁移全部）
if table_count('chat_messages') == 0 or FORCE:
    if FORCE:
        sess.execute(text('DELETE FROM chat_messages'))
        sess.commit()
    n_chat = 0
    chat_file = BASE / 'web' / 'chat_log.json'
    if chat_file.exists():
        for m in json.load(open(chat_file, encoding='utf-8')):
            sess.execute(text(
                'INSERT INTO chat_messages (channel, name, text, time, is_dm, color, role, ip, ts, event_id, recalled, data) '
                'VALUES (\'chat\', :name, :text, :time, :is_dm, :color, :role, :ip, :ts, :event_id, :recalled, :data)'),
                {'name': m.get('name', ''), 'text': m.get('text', ''), 'time': m.get('time', ''),
                 'is_dm': bool(m.get('is_dm')), 'color': m.get('color', ''), 'role': m.get('role', ''),
                 'ip': m.get('ip', ''), 'ts': m.get('_ts', 0) or 0,
                 'event_id': m.get('event_id'), 'recalled': bool(m.get('_recalled')), 'data': json.dumps(m, ensure_ascii=False)})
            n_chat += 1
        sess.commit()
        print(f'  ✓ chat_messages(chat): {n_chat} 行迁入')
    # tavern
    n_tv = 0
    tv_file = BASE / 'web' / 'tavern_chat_log.json'
    if tv_file.exists():
        for m in json.load(open(tv_file, encoding='utf-8')):
            sess.execute(text(
                'INSERT INTO chat_messages (channel, name, text, time, is_dm, color, role, ip, ts, event_id, recalled, data) '
                'VALUES (\'tavern\', :name, :text, :time, :is_dm, :color, :role, :ip, :ts, :event_id, :recalled, :data)'),
                {'name': m.get('name', ''), 'text': m.get('text', ''), 'time': m.get('time', ''),
                 'is_dm': bool(m.get('is_dm')), 'color': m.get('color', ''), 'role': m.get('role', ''),
                 'ip': m.get('ip', ''), 'ts': m.get('_ts', 0) or 0,
                 'event_id': m.get('event_id'), 'recalled': bool(m.get('_recalled')), 'data': json.dumps(m, ensure_ascii=False)})
            n_tv += 1
        sess.commit()
        print(f'  ✓ chat_messages(tavern): {n_tv} 行迁入')
    if n_chat or n_tv:
        reset_seq('chat_messages')
        sess.commit()
else:
    print(f'  - chat_messages: PG 已有 {table_count("chat_messages")} 行，跳过')

# DM 事件
def _dm_events():
    t = 'dm_events'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'web' / 'dm_event_list.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or []
    for it in data:
        sess.execute(text('INSERT INTO dm_events (id, title, content, created_at) VALUES (:id,:title,:content,:created_at)'),
            {'id': it.get('id'), 'title': it.get('title', ''), 'content': it.get('content', ''),
             'created_at': it.get('created_at', '')})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_dm_events()

def _dm_published():
    t = 'dm_published_events'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'web' / 'dm_published_events.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or []
    for it in data:
        sess.execute(text('INSERT INTO dm_published_events (id, title, content, published_at, recalled_at, pinned) '
                          'VALUES (:id,:title,:content,:published_at,:recalled_at,:pinned)'),
            {'id': it.get('id'), 'title': it.get('title', ''), 'content': it.get('content', ''),
             'published_at': it.get('published_at', ''), 'recalled_at': it.get('recalled_at'),
             'pinned': bool(it.get('pinned'))})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_dm_published()

# 事件统计 / 骰子统计（dict 嵌套）
def _event_stats():
    t = 'event_stats'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'web' / 'event_stats.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or {}
    n = 0
    for uname, v in data.items():
        sess.execute(text('INSERT INTO event_stats (username, data) VALUES (:u, :d)'),
                     {'u': uname, 'd': json.dumps(v, ensure_ascii=False)})
        n += 1
    sess.commit()
    print(f'  ✓ {t}: {n} 行迁入')
_event_stats()

def _dice_stats():
    t = 'dice_stats'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'web' / 'dice_stats.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or {}
    n = 0
    for uname, v in data.items():
        sess.execute(text('INSERT INTO dice_stats (username, total, crit20, crit1) VALUES (:u,:t,:c2,:c1)'),
                     {'u': uname, 't': v.get('total', 0), 'c2': v.get('crit20', 0), 'c1': v.get('crit1', 0)})
        n += 1
    sess.commit()
    print(f'  ✓ {t}: {n} 行迁入')
_dice_stats()

# 战斗状态 / 共享画布（单行）
def _single_row_json(table: str, file: Path, cols: dict):
    """单行表: id=1 + data JSON。cols: {列名: 值}"""
    if table_count(table) > 0 and not FORCE:
        print(f'  - {table}: PG 已有 {table_count(table)} 行，跳过')
        return
    if FORCE:
        sess.execute(text(f'DELETE FROM {table}')); sess.commit()
    if not file.exists():
        print(f'  - {table}: 源文件不存在'); return
    data = json.load(open(file, encoding='utf-8'))
    if not data:
        print(f'  - {table}: 源为空'); return
    col_list = ', '.join(['id', 'data'] + list(cols.keys()))
    ph = ', '.join([':id', ':data'] + [':' + k for k in cols])
    sess.execute(text(f'INSERT INTO {table} ({col_list}) VALUES ({ph})'),
                 {'id': 1, 'data': json.dumps(data, ensure_ascii=False), **cols})
    sess.commit()
    print(f'  ✓ {table}: 单行迁入 ({len(data)} 键)')

_single_row_json('combat_state', BASE / 'web' / 'combat_state.json',
                 {'ts': (json.load(open(BASE / 'web' / 'combat_state.json', encoding='utf-8')) or {}).get('_ts', 0)} if (BASE / 'web' / 'combat_state.json').exists() else {})
_single_row_json('shared_canvas', BASE / 'web' / 'shared_canvas.json',
                 {'ver': (json.load(open(BASE / 'web' / 'shared_canvas.json', encoding='utf-8')) or {}).get('_ver', 0),
                  'ts': (json.load(open(BASE / 'web' / 'shared_canvas.json', encoding='utf-8')) or {}).get('_ts', 0)} if (BASE / 'web' / 'shared_canvas.json').exists() else {})

# 话题 / 公告 / 帖子 / 工坊 / 收藏
def _topics():
    t = 'topics'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'data' / 'topics.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = (json.load(open(f, encoding='utf-8')) or {}).get('topics', [])
    for it in data:
        sess.execute(text('INSERT INTO topics (id, title, content, images, author, created_at, updated_at, comments) '
                          'VALUES (:id,:title,:content,:images,:author,:created_at,:updated_at,:comments)'),
            {'id': it.get('id'), 'title': it.get('title', ''), 'content': it.get('content', ''),
             'images': json.dumps(it.get('images') or [], ensure_ascii=False), 'author': it.get('author', ''),
             'created_at': it.get('created_at', ''), 'updated_at': it.get('updated_at', ''),
             'comments': json.dumps(it.get('comments') or [], ensure_ascii=False)})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_topics()

def _announcements():
    t = 'announcements'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'data' / 'announcements.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = (json.load(open(f, encoding='utf-8')) or {}).get('announcements', [])
    for it in data:
        sess.execute(text('INSERT INTO announcements (id, title, content, created_at, active) '
                          'VALUES (:id,:title,:content,:created_at,:active)'),
            {'id': it.get('id'), 'title': it.get('title', ''), 'content': it.get('content', ''),
             'created_at': it.get('created_at', ''), 'active': bool(it.get('active', True))})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_announcements()

def _community():
    t = 'community_posts'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'data' / 'community.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or []
    for it in data:
        sess.execute(text('INSERT INTO community_posts (id, board, title, content, images, author, created_at, reply_count, comments, likes) '
                          'VALUES (:id,:board,:title,:content,:images,:author,:created_at,:reply_count,:comments,:likes)'),
            {'id': it.get('id'), 'board': it.get('board', 'discuss'), 'title': it.get('title', ''),
             'content': it.get('content', ''), 'images': json.dumps(it.get('images') or [], ensure_ascii=False),
             'author': it.get('author', ''), 'created_at': it.get('created_at', ''),
             'reply_count': it.get('reply_count', 0), 'comments': json.dumps(it.get('comments') or [], ensure_ascii=False),
             'likes': json.dumps(it.get('likes') or [], ensure_ascii=False)})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_community()

def _workshop():
    t = 'workshop_items'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'data' / 'workshop.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = json.load(open(f, encoding='utf-8')) or []
    for it in data:
        sess.execute(text('INSERT INTO workshop_items (id, title, "desc", file_url, author, created_at, cat, comments, likes) '
                          'VALUES (:id,:title,:desc,:file_url,:author,:created_at,:cat,:comments,:likes)'),
            {'id': it.get('id'), 'title': it.get('title', ''), 'desc': it.get('desc', ''),
             'file_url': it.get('file_url', ''), 'author': it.get('author', ''),
             'created_at': it.get('created_at', ''), 'cat': it.get('cat', 'user'),
             'comments': json.dumps(it.get('comments') or [], ensure_ascii=False), 'likes': json.dumps(it.get('likes') or [], ensure_ascii=False)})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_workshop()

def _favorites():
    t = 'favorites'
    if table_count(t) > 0 and not FORCE:
        print(f'  - {t}: PG 已有 {table_count(t)} 行，跳过')
        return
    f = BASE / 'data' / 'favorites.json'
    if FORCE:
        sess.execute(text(f'DELETE FROM {t}')); sess.commit()
    if not f.exists():
        print(f'  - {t}: 源文件不存在'); return
    data = (json.load(open(f, encoding='utf-8')) or {}).get('favorites', [])
    for it in data:
        sess.execute(text('INSERT INTO favorites (id, user_id, type, item_id, created_at) '
                          'VALUES (:id,:user_id,:type,:item_id,:created_at)'),
            {'id': it.get('id'), 'user_id': it.get('user_id'), 'type': it.get('type', 'post'),
             'item_id': it.get('item_id'), 'created_at': it.get('created_at', '')})
    sess.commit()
    if data:
        reset_seq(t); sess.commit()
    print(f'  ✓ {t}: {len(data)} 行迁入')
_favorites()

# ━━ 3. chat_archive → chat_archives ━━
print('\n[3/3] 聊天归档 → PG')
arch_dir = BASE / 'web' / 'chat_archive'
if table_count('chat_archives') > 0 and not FORCE:
    print(f'  - chat_archives: PG 已有 {table_count("chat_archives")} 行，跳过')
else:
    if FORCE:
        sess.execute(text('DELETE FROM chat_archives'))
        sess.commit()
    files = sorted(glob.glob(str(arch_dir / 'chat_*.json')))
    n = 0
    for fp in files:
        fname = os.path.basename(fp)
        msgs = json.load(open(fp, encoding='utf-8'))
        created = fname.replace('chat_', '').replace('.json', '')
        created = f'{created[:4]}-{created[4:6]}-{created[6:8]} {created[9:11]}:{created[11:13]}:{created[13:15]}'
        sess.execute(text('INSERT INTO chat_archives (channel, filename, messages, created_at) '
                          'VALUES (\'chat\', :fn, :msgs, :ca)'),
                     {'fn': fname, 'msgs': json.dumps(msgs, ensure_ascii=False), 'ca': created})
        n += 1
    sess.commit()
    print(f'  ✓ chat_archives: {n} 行迁入')

print('\n═══ 核对 ═══')
for t in SQLITE_TABLES + ['chat_messages', 'chat_archives', 'dm_events', 'dm_published_events',
                          'event_stats', 'dice_stats', 'combat_state', 'shared_canvas',
                          'topics', 'announcements', 'community_posts', 'workshop_items', 'favorites']:
    print(f'  {t}: {table_count(t)} 行')
print('\n迁移完成 ✅')
sess.close()
