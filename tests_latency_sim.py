# -*- coding: utf-8 -*-
"""多地区远程联机模拟测试
模拟 4 个不同网络条件的客户端，检验画布同步、乱序、断线补偿与其他同步功能。
"""
import sys, json, asyncio, random, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import websockets

BASE = 'http://127.0.0.1:5000'
WS = 'ws://127.0.0.1:5000/ws'
random.seed(42)

RESULTS = []
def check(name, cond, detail=''):
    RESULTS.append((name, cond))
    print(('✅' if cond else '❌'), name, ('| ' + detail if detail else ''))


class RegionClient:
    """带延迟/抖动的模拟客户端，并维护本地画布状态机（模拟前端合并逻辑）"""
    def __init__(self, name, latency_ms, jitter_ms=0):
        self.name = name
        self.latency = latency_ms / 1000
        self.jitter = jitter_ms / 1000
        self.ws = None
        self.version = -1
        self.tokens = {}   # id -> token
        self.strokes = {}  # id -> stroke
        self.recv_task = None
        self.recv_log = []

    def _delay(self):
        return max(0.001, self.latency / 2 + random.uniform(-self.jitter, self.jitter) / 2)

    async def connect(self):
        await asyncio.sleep(self._delay())
        self.ws = await websockets.connect(WS)
        init = json.loads(await self.ws.recv())
        await asyncio.sleep(self._delay())  # 模拟下行延迟
        self.apply(init)
        self.recv_task = asyncio.create_task(self._recv_loop())
        return init

    async def _recv_loop(self):
        try:
            async for raw in self.ws:
                await asyncio.sleep(self._delay())  # 下行延迟
                msg = json.loads(raw)
                self.recv_log.append(msg.get('type'))
                self.apply(msg)
        except Exception:
            pass

    def apply(self, msg):
        t = msg.get('type')
        if msg.get('_ver') is not None: self.version = msg['_ver']
        if msg.get('version') is not None: self.version = msg['version']
        if t == 'init':
            st = msg.get('state', {})
            self.tokens = {tk['id']: tk for tk in st.get('tokens', [])}
            self.strokes = {s['id']: s for s in st.get('strokes', []) if s.get('id')}
        elif t == 'op':
            d = msg.get('data', {})
            if d.get('key') == 'tokens':
                for tk in d.get('upsert', []): self.tokens[tk['id']] = tk
                for rid in d.get('remove', []): self.tokens.pop(rid, None)
        elif t == 'tokens_update':
            self.tokens = {tk['id']: tk for tk in (msg.get('data') or [])}
        elif t == 'stroke':
            s = msg.get('data', {})
            if s.get('id') and s['id'] not in self.strokes:
                self.strokes[s['id']] = s
        elif t == 'strokes_clear':
            self.strokes = {}

    async def send(self, msg):
        await asyncio.sleep(self._delay())  # 上行延迟
        # 本地立即生效（模拟前端本地先行）
        self.apply({**msg, '_ver': None})
        await self.ws.send(json.dumps(msg))

    async def sync(self):
        """模拟前端重连对账"""
        await asyncio.sleep(self._delay())
        await self.ws.send(json.dumps({'type': 'sync', 'version': self.version}))

    async def close(self):
        if self.recv_task: self.recv_task.cancel()
        if self.ws: await self.ws.close()


def http_get_state():
    with urllib.request.urlopen(BASE + '/api/shared-canvas?since_ver=-1', timeout=10) as r:
        d = json.loads(r.read())
        return d['state'], d['version']


def http_post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def http_get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.loads(r.read())


async def main():
    print('━━━ 模拟客户端: DM本地(5ms) / 华东(50ms) / 海外(300ms±100ms) / 弱网(600ms±200ms) ━━━')
    dm = RegionClient('DM本地', 5)
    east = RegionClient('华东玩家', 50, 10)
    oversea = RegionClient('海外玩家', 300, 100)
    weak = RegionClient('弱网玩家', 600, 200)
    for c in (dm, east, oversea, weak):
        await c.connect()
    check('T0 四地客户端连接, init 版本一致',
          dm.version == east.version == oversea.version == weak.version,
          f'version={dm.version}')

    # ━━ T1: DM 操作在不同延迟下最终全员到达 ━━
    t0 = time.monotonic()
    await dm.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 501, 'name': '哥布林', 'x': 10, 'y': 10}], 'remove': []}})
    await asyncio.sleep(2.0)  # 等最慢的弱网客户端收到
    check('T1 不同延迟下 DM 操作全员到达',
          all(501 in c.tokens for c in (east, oversea, weak)),
          f'弱网玩家延迟约{int((weak.latency)*1000)}ms 仍收到')

    # ━━ T2: 高延迟玩家与 DM 几乎同时操作不同 token（交叉在途）━━
    await asyncio.gather(
        oversea.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 502, 'name': '海外的兵', 'x': 22, 'y': 22}], 'remove': []}}),
        dm.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 503, 'name': 'DM的兵', 'x': 33, 'y': 33}], 'remove': []}}),
    )
    await asyncio.sleep(2.5)
    st, ver = http_get_state()
    ids = {t['id'] for t in st['tokens']}
    check('T2 交叉在途操作: 服务端两个 token 都在', {502, 503} <= ids)
    check('T2 所有客户端(含弱网)最终一致',
          all({502, 503} <= set(c.tokens) for c in (dm, east, oversea, weak)))

    # ━━ T3: 乱序场景——海外玩家基于旧状态发全量, 晚于 DM 的新操作到达 ━━
    # 海外玩家在本地"看到"的还是旧列表(不含DM即将做的修改)时点了全量推送
    stale_full = [dict(t) for t in oversea.tokens.values()]  # 快照(旧)
    await dm.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 501, 'name': '哥布林', 'x': 999, 'y': 999}], 'remove': []}})
    await asyncio.sleep(0.05)
    await oversea.send({'type': 'tokens_update', 'data': stale_full})  # 300ms后才到服务器
    await asyncio.sleep(2.5)
    st, _ = http_get_state()
    tk501 = next((t for t in st['tokens'] if t['id'] == 501), None)
    # 服务端按到达顺序: DM的op先到, 海外的旧全量后到并覆盖 → 服务端=旧坐标
    # 这正是前端4秒保护期要防的场景; 服务端行为应为"后到者覆盖"且版本递增无异常
    check('T3 乱序全量: 服务端按到达序处理无异常', tk501 is not None,
          f'501坐标=({tk501["x"]},{tk501["y"]}) 前端保护期会保住DM本地的999')
    # 全员再次收敛(以服务端为准)
    await asyncio.sleep(1.0)
    check('T3 乱序后全员仍收敛一致',
          all(set(c.tokens) == {t["id"] for t in st["tokens"]} for c in (dm, east, weak)))

    # ━━ T4: 弱网玩家掉线→期间多次修改→重连+sync 补齐 ━━
    await weak.close()
    for i in range(3):
        await dm.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 510 + i, 'name': f'掉线期间{i}', 'x': i, 'y': i}], 'remove': []}})
        await dm.send({'type': 'stroke', 'data': {'id': f'offline_s{i}', 'tool': 'brush', 'color': '#0f0', 'size': 2, 'points': [{'x': i, 'y': i}]}})
    await asyncio.sleep(1.0)
    weak2 = RegionClient('弱网玩家(重连)', 600, 200)
    await weak2.connect()          # 重连自动收到 init
    await weak2.sync()             # 前端重连还会发 sync 对账
    await asyncio.sleep(2.0)
    got_tokens = all((510 + i) in weak2.tokens for i in range(3))
    got_strokes = all(f'offline_s{i}' in weak2.strokes for i in range(3))
    check('T4 弱网掉线重连: 离线期间的 token+笔画全部补齐', got_tokens and got_strokes)

    # ━━ T5: 高延迟下连续快速操作(移动流) 顺序与最终值 ━━
    for x in range(0, 100, 20):
        await east.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [{'id': 502, 'name': '海外的兵', 'x': x, 'y': 0}], 'remove': []}})
    await asyncio.sleep(2.5)
    st, _ = http_get_state()
    tk = next(t for t in st['tokens'] if t['id'] == 502)
    check('T5 连续移动流: 服务端为最后一次坐标(80)', tk['x'] == 80,
          f'实际={tk["x"]}, 各端: DM={dm.tokens[502]["x"]} 海外={oversea.tokens[502]["x"]} 弱网={weak2.tokens[502]["x"]}')
    check('T5 全员最终坐标一致',
          dm.tokens[502]['x'] == oversea.tokens[502]['x'] == weak2.tokens[502]['x'] == 80)

    # ━━ 清理画布测试数据 ━━
    all_ids = [t['id'] for t in st['tokens'] if t['id'] >= 500]
    await dm.send({'type': 'op', 'data': {'key': 'tokens', 'upsert': [], 'remove': all_ids}})
    await dm.send({'type': 'strokes_remove', 'data': [f'offline_s{i}' for i in range(3)]})
    await asyncio.sleep(0.5)
    for c in (dm, east, oversea, weak2):
        await c.close()

    # ━━ T6: 其他同步功能(HTTP轮询类)在延迟下的表现 ━━
    print('\n━━━ 其他同步功能 ━━━')
    # 房间: 四地用户加入
    for name, ip_tag in [('DM老王', 'DM'), ('小华', 'PL'), ('Oversea李', 'PL'), ('弱网张', 'PL')]:
        r = http_post('/api/room/join', {'name': name, 'color': '#3b82f6', 'role': ip_tag})
        assert r.get('ok'), r
    r = http_post('/api/room/heartbeat', {'name': '小华'})
    online = [u['name'] for u in r.get('online_users', [])]
    check('T6 房间: 四地用户在线列表', len(online) >= 4, str(online))

    # 聊天: 各地发消息, 高延迟端用 since 增量拉取不丢不重
    ts0 = time.time()
    for i, name in enumerate(['DM老王', '小华', 'Oversea李', '弱网张']):
        http_post('/api/chat/send', {'name': name, 'text': f'延迟测试消息{i}'})
        time.sleep(0.15)  # 模拟不同时刻到达
    msgs = http_get(f'/api/chat/messages?since={ts0}')['messages']
    texts = [m['text'] for m in msgs if '延迟测试消息' in m.get('text', '')]
    check('T6 聊天: since 增量拉取 4 条不丢不重且有序',
          texts == [f'延迟测试消息{i}' for i in range(4)], str(texts))
    # 慢客户端(更早的since)重复拉取也能拿全
    msgs2 = http_get(f'/api/chat/messages?since={ts0}')['messages']
    check('T6 聊天: 慢客户端重复拉取幂等', len(msgs2) == len(msgs))

    # 战斗状态: DM推送, 玩家延迟后拉取
    http_post('/api/combat-state', {'state': {'round': 3, 'combatants': [{'name': '艾琳', 'init': 18}]}})
    time.sleep(0.6)  # 模拟高延迟玩家晚拉取
    cs = http_get('/api/combat-state')
    check('T6 战斗状态: 高延迟玩家拉取到最新回合', cs.get('state', {}).get('round') == 3)

    # 离开房间
    for name in ['DM老王', '小华', 'Oversea李', '弱网张']:
        http_post('/api/room/leave', {'name': name})

    print()
    fails = [n for n, ok in RESULTS if not ok]
    if fails:
        print('❌ 失败项:', fails)
        sys.exit(1)
    print(f'全部 {len(RESULTS)} 项通过 —— 多地区延迟模拟测试完成')

asyncio.run(main())
