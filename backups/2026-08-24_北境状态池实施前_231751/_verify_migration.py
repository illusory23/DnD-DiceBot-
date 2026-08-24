# -*- coding: utf-8 -*-
"""PostgreSQL 迁移完整性核对: SQLite/JSON 源数据 vs PG 目标数据

逐表核对: 行数 + 按主键样本对比（列值/JSON 内容逐字段一致）
"""
import sys, io, json, sqlite3, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from pathlib import Path
BASE = Path(__file__).parent.parent
SQLITE = BASE / 'data' / 'characters.db'
PG_URL = 'postgresql+psycopg2://postgres:asd204402@localhost:5432/dicebot'

from sqlalchemy import create_engine, text

pg = create_engine(PG_URL)
sqlite = sqlite3.connect(str(SQLITE))
sqlite.row_factory = sqlite3.Row

ok_count = 0
fail_count = 0

def norm(v):
    """规范化值用于比较: bytes/bytearray 转 hex, datetime 转 iso, dict/list 递归排序"""
    if isinstance(v, (bytes, bytearray)):
        return hashlib.md5(bytes(v)).hexdigest()
    if isinstance(v, dict):
        return {k: norm(v[k]) for k in sorted(v.keys())}
    if isinstance(v, (list, tuple)):
        return [norm(x) for x in v]
    if hasattr(v, 'isoformat'):  # datetime → 与 SQLite 存储格式一致（空格分隔）
        return str(v).replace('T', ' ')
    if isinstance(v, float) or isinstance(v, int):
        return round(float(v), 2)  # PG float64 精度损失容差(时间戳用途毫秒级足够)
    if v is None:
        return None
    return v

def compare(name, src_rows, dst_rows, key_col='id', skip_cols=()):
    """按主键对比行集合: 行数 + 每行全字段（JSON 列解析后递归比较）"""
    global ok_count, fail_count
    s_map = {}
    for r in src_rows:
        d = dict(r)
        if d.get(key_col) is not None:
            s_map[d[key_col]] = d
    d_map = {}
    for r in dst_rows:
        d = dict(r)
        if d.get(key_col) is not None:
            d_map[d[key_col]] = d
    if len(s_map) != len(d_map):
        print(f'  ❌ {name}: 行数不一致 源{len(s_map)} vs PG{len(d_map)}')
        fail_count += 1
        return
    mism = 0
    for kid in s_map:
        if kid not in d_map:
            mism += 1
            continue
        sd, dd = s_map[kid], d_map[kid]
        for k, v in sd.items():
            if k in skip_cols:
                continue
            dv = dd.get(k)
            # JSON 列: PG 读出已是解析后的 dict/list
            if norm(v) != norm(dv):
                mism += 1
                if mism <= 3:
                    sv = json.dumps(v, ensure_ascii=False)[:80]
                    dv2 = json.dumps(dv, ensure_ascii=False)[:80]
                    print(f'  ⚠ {name} id={kid} 列 {k}: 源[{sv}] ≠ PG[{dv2}]')
                break
    if mism:
        print(f'  ❌ {name}: {len(s_map)} 行中 {mism} 行有字段差异')
        fail_count += 1
    else:
        print(f'  ✅ {name}: {len(s_map)} 行全部一致')
        ok_count += 1

print('═══ 1. SQLite vs PostgreSQL（ORM 17 表）═══')
SQLITE_TABLES = [
    'users', 'character_groups', 'characters',
    'abilities', 'skill_proficiencies', 'save_proficiencies',
    'spell_slots', 'death_saves', 'weapons', 'armor', 'coins',
    'prepared_spells', 'learned_spells', 'background_details',
    'inventory', 'character_features', 'north_saves',
]
for t in SQLITE_TABLES:
    try:
        s_rows = sqlite.execute(f'SELECT * FROM {t}').fetchall()
    except Exception as e:
        print(f'  - {t}: 源读取失败 {e}')
        continue
    with pg.connect() as conn:
        d_rows = conn.execute(text(f'SELECT * FROM {t}')).mappings().all()
    compare(t, s_rows, d_rows)

print('\n═══ 2. JSON 运行数据 vs PostgreSQL ═══')

# 聊天消息: 文件 vs chat_messages(channel=chat)
def cmp_chat_file(file_path, channel):
    global ok_count, fail_count
    if not file_path.exists():
        print(f'  - chat_messages({channel}): 源文件不存在, 跳过')
        return
    msgs = json.load(open(file_path, encoding='utf-8'))
    with pg.connect() as conn:
        rows = conn.execute(text(
            f"SELECT * FROM chat_messages WHERE channel = '{channel}' ORDER BY id")).mappings().all()
    # 文件顺序 = 原插入顺序, PG id 顺序应一致
    if len(msgs) != len(rows):
        print(f'  ❌ chat_messages({channel}): 行数 源{len(msgs)} vs PG{len(rows)}')
        fail_count += 1
        return
    mism = 0
    for m, r in zip(msgs, rows):
        md = r['data'] if isinstance(r['data'], dict) else {}
        if norm(m) != norm(md):
            mism += 1
            if mism <= 3:
                print(f'  ⚠ chat_messages({channel}) 第{len([x for x in []])}条差异: '
                      f'{json.dumps(m, ensure_ascii=False)[:60]}')
        if m.get('_ts') is not None and abs(float(r['ts'] or 0) - float(m['_ts'])) > 0.001:
            mism += 1
        if bool(m.get('_recalled')) != bool(r['recalled']):
            mism += 1
    if mism:
        print(f'  ❌ chat_messages({channel}): {len(msgs)} 条中 {mism} 条差异')
        fail_count += 1
    else:
        print(f'  ✅ chat_messages({channel}): {len(msgs)} 条全部一致')
        ok_count += 1

cmp_chat_file(BASE / 'web' / 'chat_log.json', 'chat')
cmp_chat_file(BASE / 'web' / 'tavern_chat_log.json', 'tavern')

# DM 事件
def cmp_json_list(name, file_path, pg_table, fields, key='id'):
    global ok_count, fail_count
    if not file_path.exists():
        print(f'  - {name}: 源文件不存在, 跳过')
        return
    data = json.load(open(file_path, encoding='utf-8'))
    if isinstance(data, dict):
        data = next((v for k, v in data.items() if isinstance(v, list)), [])
    with pg.connect() as conn:
        rows = conn.execute(text(f'SELECT * FROM {pg_table}')).mappings().all()
    if len(data) != len(rows):
        print(f'  ❌ {name}: 行数 源{len(data)} vs PG{len(rows)}')
        fail_count += 1
        return
    mism = 0
    for it, r in zip(data, rows):
        for f in fields:
            if norm(it.get(f)) != norm(r[f]):
                mism += 1
                if mism <= 3:
                    print(f'  ⚠ {name} id={it.get(key)} 列 {f} 差异')
                break
    if mism:
        print(f'  ❌ {name}: {len(data)} 行中 {mism} 行差异')
        fail_count += 1
    else:
        print(f'  ✅ {name}: {len(data)} 行全部一致')
        ok_count += 1

cmp_json_list('dm_events', BASE / 'web' / 'dm_event_list.json', 'dm_events',
              ['id', 'title', 'content', 'created_at'])
cmp_json_list('dm_published_events', BASE / 'web' / 'dm_published_events.json', 'dm_published_events',
              ['id', 'title', 'content', 'published_at', 'recalled_at', 'pinned'])

# event_stats: {username: data}；dice_stats: {username: {total, crit20, crit1}}
def cmp_stats_dict(name, file_path, pg_table, field_map=None):
    """field_map: {源值key: PG列名}；None 表示整包存 data 列"""
    global ok_count, fail_count
    if not file_path.exists():
        print(f'  - {name}: 源文件不存在, 跳过')
        return
    data = json.load(open(file_path, encoding='utf-8')) or {}
    with pg.connect() as conn:
        rows = conn.execute(text(f'SELECT * FROM {pg_table}')).mappings().all()
    if len(data) != len(rows):
        print(f'  ❌ {name}: 行数 源{len(data)} vs PG{len(rows)}')
        fail_count += 1
        return
    mism = 0
    for it, r in zip(data.items(), rows):
        uname, v = it
        if uname != r['username']:
            mism += 1
            continue
        if field_map:
            for sk, pk in field_map.items():
                if norm(v.get(sk)) != norm(r[pk]):
                    mism += 1
                    break
        else:
            if norm(v) != norm(r['data']):
                mism += 1
    if mism:
        print(f'  ❌ {name}: {len(data)} 行中 {mism} 行差异')
        fail_count += 1
    else:
        print(f'  ✅ {name}: {len(data)} 行全部一致')
        ok_count += 1

cmp_stats_dict('event_stats', BASE / 'web' / 'event_stats.json', 'event_stats')
cmp_stats_dict('dice_stats', BASE / 'web' / 'dice_stats.json', 'dice_stats',
               field_map={'total': 'total', 'crit20': 'crit20', 'crit1': 'crit1'})

# combat_state / shared_canvas 单行
def cmp_single_row(name, file_path, pg_table, extra_fields=None):
    global ok_count, fail_count
    if not file_path.exists():
        print(f'  - {name}: 源文件不存在, 跳过')
        return
    data = json.load(open(file_path, encoding='utf-8'))
    with pg.connect() as conn:
        row = conn.execute(text(f'SELECT * FROM {pg_table}')).mappings().first()
    if not row:
        print(f'  ❌ {name}: PG 无数据')
        fail_count += 1
        return
    mism = 0
    if norm(data) != norm(row['data']):
        mism += 1
        print(f'  ⚠ {name}: data 内容差异')
    if extra_fields:
        for k, v in extra_fields.items():
            if norm(data.get(k)) != norm(row[v]):
                mism += 1
                print(f'  ⚠ {name}: {v} 列差异')
    if mism:
        print(f'  ❌ {name}: {mism} 处差异')
        fail_count += 1
    else:
        print(f'  ✅ {name}: 单行数据一致')
        ok_count += 1

cmp_single_row('combat_state', BASE / 'web' / 'combat_state.json', 'combat_state',
               extra_fields={'_ts': 'ts'})
cmp_single_row('shared_canvas', BASE / 'web' / 'shared_canvas.json', 'shared_canvas',
               extra_fields={'_ver': 'ver', '_ts': 'ts'})

# topics / announcements / community / workshop / favorites
cmp_json_list('topics', BASE / 'data' / 'topics.json', 'topics',
              ['id', 'title', 'content', 'images', 'author', 'created_at', 'updated_at', 'comments'])
cmp_json_list('announcements', BASE / 'data' / 'announcements.json', 'announcements',
              ['id', 'title', 'content', 'created_at', 'active'])
cmp_json_list('community_posts', BASE / 'data' / 'community.json', 'community_posts',
              ['id', 'board', 'title', 'content', 'images', 'author', 'created_at', 'reply_count', 'comments', 'likes'])
cmp_json_list('workshop_items', BASE / 'data' / 'workshop.json', 'workshop_items',
              ['id', 'title', 'desc', 'file_url', 'author', 'created_at', 'cat', 'comments', 'likes'])
cmp_json_list('favorites', BASE / 'data' / 'favorites.json', 'favorites',
              ['id', 'user_id', 'type', 'item_id', 'created_at'])

# chat_archives: 目录文件 vs PG 行
print('\n═══ 3. chat_archive 目录 vs chat_archives 表 ═══')
arch_dir = BASE / 'web' / 'chat_archive'
files = sorted(arch_dir.glob('chat_*.json'))
with pg.connect() as conn:
    rows = conn.execute(text("SELECT * FROM chat_archives WHERE channel='chat' ORDER BY filename")).mappings().all()
pg_files = {r['filename'] for r in rows}
src_files = {f.name for f in files}
if len(files) != len(rows) or src_files != pg_files:
    print(f'  ❌ chat_archives: 文件{len(files)} vs PG{len(rows)}, 文件名差集: '
          f'{list(src_files - pg_files)[:3]} / {list(pg_files - src_files)[:3]}')
    fail_count += 1
else:
    mism = 0
    for f, r in zip(files, rows):
        msgs = json.load(open(f, encoding='utf-8'))
        if norm(msgs) != norm(r['messages']):
            mism += 1
            if mism <= 3:
                print(f'  ⚠ chat_archives {f.name}: 内容差异')
    if mism:
        print(f'  ❌ chat_archives: {len(files)} 行中 {mism} 行内容差异')
        fail_count += 1
    else:
        print(f'  ✅ chat_archives: {len(files)} 行全部一致')
        ok_count += 1

print(f'\n═══ 结果: {ok_count} 项通过, {fail_count} 项失败 ═══')
sys.exit(1 if fail_count else 0)
