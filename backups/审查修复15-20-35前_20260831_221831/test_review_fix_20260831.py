# -*- coding: utf-8 -*-
"""2026-08-31 审查修复验证：#15 骰子校验 / #20 set_hp 边界 / #35 README 同步
运行：python test_review_fix_20260831.py（需数据库可用，创建临时角色测后删除）
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, '.')

passed = failed = 0
def ok(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1; print('  ✅ ' + name)
    else:
        failed += 1; print('  ❌ ' + name + (('  → ' + str(extra)) if extra else ''))

print('══ 1. #15 骰子面数/数量校验（core/dice_engine.py） ══')
from core.dice_engine import roll, roll_die, DiceResult

# 非法表达式应抛 ValueError（明确信息），而非 random.randint 裸异常或静默归零
for bad, why in [('1d0', '面数0'), ('0d6', '数量0'), ('0d6-10', '数量0+负数（不再静默归零）'), ('d0', '面数0')]:
    try:
        roll(bad)
        ok(f'roll("{bad}") 抛 ValueError（{why}）', False, '未抛错')
    except ValueError as e:
        ok(f'roll("{bad}") 抛 ValueError（{why}）', '>=1' in str(e) or '无效' in str(e), str(e))
    except Exception as e:
        ok(f'roll("{bad}") 抛 ValueError（{why}）', False, f'抛了其他异常 {type(e).__name__}: {e}')

try:
    roll_die(0)
    ok('roll_die(0) 抛 ValueError', False, '未抛错')
except ValueError as e:
    ok('roll_die(0) 抛 ValueError', '>=1' in str(e), str(e))

# 正常表达式不受影响
r = roll('3d6')
ok('roll("3d6") 正常', isinstance(r, DiceResult) and 3 <= r.total <= 18 and len(r.rolls) == 3, r.total)
r = roll('d20 adv')
ok('roll("d20 adv") 正常（掷2取高）', len(r.rolls) == 2 and r.advantage is True, (r.rolls, r.advantage))
r = roll('4d6k3')
ok('roll("4d6k3") 正常（保留3）', len(r.kept_rolls) == 3, r.kept_rolls)
r = roll('5')
ok('roll("5") 纯数字正常（1d20+5）', r.groups_detail[0]['sides'] == 20 and r.modifier == 5, (r.groups_detail[0]['sides'], r.modifier))
r = roll('1d20+1d4+3')
ok('roll("1d20+1d4+3") 混合正常', len(r.groups_detail) == 2 and r.modifier == 3, r.total)

print('\n══ 2. #20 set_hp 边界校验（core/character.py，真实 DB 端到端） ══')
from web.app import app
c = app.test_client()

# 创建临时角色
resp = c.post('/api/character', json={'name': '测试角色_边界校验'})
data = resp.get_json()
char_id = data.get('id') or data.get('char_id')
if not char_id:
    ok('创建临时角色', False, str(data))
else:
    ok('创建临时角色', True)
    from core.character import set_hp, get_character, adjust_hp
    with app.app_context():
        # hp_max=20；hp_current=30 超上限 → 夹紧为 20；temp_hp=-5 → 0
        set_hp(char_id, hp_max=20, hp_current=30, temp_hp=-5)
        ch = get_character(char_id)
        ok('hp_current 超上限夹紧为 hp_max(20)', ch['hp_current'] == 20 and ch['hp_max'] == 20, (ch['hp_current'], ch['hp_max']))
        ok('temp_hp 负数归 0', ch['temp_hp'] == 0, ch['temp_hp'])
        # hp_current=-10 → 0
        set_hp(char_id, hp_current=-10)
        ch = get_character(char_id)
        ok('hp_current 负值归 0', ch['hp_current'] == 0, ch['hp_current'])
        # hp_max=-5 → 0（且 hp_current 同步 0）
        set_hp(char_id, hp_max=-5)
        ch = get_character(char_id)
        ok('hp_max 负值归 0', ch['hp_max'] == 0 and ch['hp_current'] == 0, (ch['hp_max'], ch['hp_current']))
        # 正常设置不受影响
        set_hp(char_id, hp_max=30, hp_current=15, temp_hp=8)
        ch = get_character(char_id)
        ok('正常设置不受影响（30/15/8）', ch['hp_max'] == 30 and ch['hp_current'] == 15 and ch['temp_hp'] == 8, (ch['hp_max'], ch['hp_current'], ch['temp_hp']))
        # adjust_hp 行为回归（不超上限）
        res = adjust_hp(char_id, 100)
        ok('adjust_hp(+100) 不超 hp_max(30)', res['hp_current'] == 30, res)
        res = adjust_hp(char_id, -100)
        ok('adjust_hp(-100) 不低于 0', res['hp_current'] == 0, res)
    # 清理
    resp = c.delete(f'/api/character/{char_id}')
    ok('清理临时角色', resp.status_code in (200, 204), resp.status_code)

print('\n══ 3. #35 README 路由与实际对照 ══')
readme = open('README.md', encoding='utf-8').read()
import re
route_table = readme.split('## 6. 页面路由')[1].split('## 7.')[0] if '## 6. 页面路由' in readme else ''
ok('README 含路由表', bool(route_table), route_table[:50])
ok('/dice3d → dice3d-e.html', '| `/dice3d` | `dice3d-e.html` |' in route_table)
ok('/ → portal/index.html', '| `/` | `portal/index.html` |' in route_table)
ok('/user → portal/user.html', '| `/user` | `portal/user.html` |' in route_table)
ok('/north-expedition 已更正', '| `/north-expedition` |' in route_table)
ok('/dice-help 已补充', '| `/dice-help` |' in route_table)
ok('无 /portal/ 错误路由', '/portal/' not in route_table)
ok('无 /portal/user 错误路由', '/portal/user' not in route_table)
ok('无 /north 错误路由（页面路由）', '| `/north` |' not in route_table)
ok('无 dice3d.html 错误模板', 'dice3d.html' not in route_table)
ok('无 /_test_dice 无路由条目', '| `/_test_dice` |' not in route_table)
ok('README 无 /portal/ 其他引用（正文）', readme.count('/portal/') == 0)
ok('README 章节标题已改 /north-expedition', '### 2.3 北境雪原 (`/north-expedition`)' in readme)
ok('README 主要入口表无 /portal/', '| `/portal/` |' not in readme)

print(f'\n════════ 结果：{passed} 通过 / {failed} 失败 ════════')
sys.exit(1 if failed else 0)
