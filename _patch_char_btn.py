# -*- coding: utf-8 -*-
"""临时补丁：character.js 三处 header 加导出按钮（测完删除）"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src = open('web/static/character.js', encoding='utf-8').read()

BTN = ('<button onclick="exportCharExcel()" title="导出为悲灵模板 Excel" '
       'style="float:right;padding:0.15rem 0.5rem;font-size:0.7rem;'
       'background:var(--surface2);border:1px solid var(--border);border-radius:3px;'
       'color:var(--gold);cursor:pointer;font-weight:normal;margin-left:0.5rem;">📥 导出 Excel</button>')

# 1. 动态详情 header：race span 结束后、</div> 前插入按钮
old1 = ">${char.race || '未知种族'}</span></div>"
new1 = ">${char.race || '未知种族'}</span>" + BTN + '</div>'
assert src.count(old1) == 1, 'old1 count=' + str(src.count(old1))
src = src.replace(old1, new1)

# 2. 空态 header（"请选择一个角色"）
old2 = "el.innerHTML = '<div class=\"card-header\">📋 角色详情</div><div style=\"color:var(--text-dim);text-align:center;padding:2rem;\">请选择一个角色</div>';"
new2 = ("el.innerHTML = '<div class=\"card-header\">📋 角色详情' + " + repr(BTN) +
        " + '</div><div style=\"color:var(--text-dim);text-align:center;padding:2rem;\">请选择一个角色</div>';")
assert src.count(old2) == 1, 'old2 count=' + str(src.count(old2))
src = src.replace(old2, new2)

# 3. 删除后重置 header
old3 = '<div class="card-header">📋 角色详情</div>'
new3 = '<div class="card-header">📋 角色详情' + BTN + '</div>'
assert src.count(old3) == 1, 'old3 count=' + str(src.count(old3))
src = src.replace(old3, new3)

open('web/static/character.js', 'w', encoding='utf-8').write(src)
print('3 处替换完成')
