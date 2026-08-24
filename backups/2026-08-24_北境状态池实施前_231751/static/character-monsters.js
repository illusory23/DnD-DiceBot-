/* ━━━ 角色卡 · 怪物搜索模块 ━━━
 * 从 character.js 拆分（2026-08-17）
 * 顶层函数，全局可见；由 character.html 引入
 */

        async function searchMonster() {
            const query = document.getElementById('monster-search').value.trim();
            if (query.length < 2) { alert('至少输入2个字'); return; }

            const resultsEl = document.getElementById('search-results');
            const infoEl = document.getElementById('monster-info');
            infoEl.innerHTML = '';
            resultsEl.innerHTML = '<div style="color:var(--cyan);font-size:0.85rem;padding:0.25rem;">搜索中...</div>';

            try {
                // 短关键词(<=2字) → 直接列列表
                if (query.length <= 2) {
                    const listResp = await fetch(`/api/monsters/search?q=${encodeURIComponent(query)}`);
                    const listData = await listResp.json();
                    if (listData.results && listData.results.length) {
                        monsterSearchResults = listData.results;
                        renderMonsterList(resultsEl, monsterSearchResults, query);
                        return;
                    }
                }

                // 1. 先尝试精确匹配（返回词条名须与输入一致，
                //    否则是模糊命中（如"亡灵僵尸"命中"骚灵"），一律走列表确认）
                const resp = await fetch(`/api/monster/${encodeURIComponent(query)}`);
                const data = await resp.json();
                if (!data.error && data.name === query) {
                    // 检查是否有多个匹配
                    const listResp = await fetch(`/api/monsters/search?q=${encodeURIComponent(query)}`);
                    const listData = await listResp.json();
                    if (listData.results && listData.results.length > 1) {
                        monsterSearchResults = listData.results;
                        renderMonsterList(resultsEl, monsterSearchResults, query);
                    } else {
                        resultsEl.innerHTML = '';
                        showMonsterInfo(data);
                    }
                    return;
                }

                // 2. 精确匹配失败，模糊搜索
                const searchResp = await fetch(`/api/monsters/search?q=${encodeURIComponent(query)}`);
                const searchData = await searchResp.json();
                const monsters = (searchData.results || []);

                if (!monsters.length) {
                    resultsEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;">未找到匹配的生物</div>';
                    return;
                }
                monsterSearchResults = monsters;
                renderMonsterList(resultsEl, monsters, query);
            } catch(e) {
                resultsEl.innerHTML = `<div style="color:var(--red);">搜索失败</div>`;
            }
        }

        function renderMonsterList(el, monsters, queryName) {
            const needCollapse = monsters.length > 6;
            const listId = 'monster-result-list';
            const toggleId = 'monster-toggle-btn';

            el.innerHTML = `
                <div class="monster-result-count">找到 ${monsters.length} 个匹配 "${queryName.replace(/"/g, '&quot;')}" 的生物（点击查看详情）</div>
                <div id="${listId}" class="${needCollapse ? 'search-collapsed' : ''}">${monsters.map(m => `
                <div class="monster-result-row" onclick="selectMonsterResult('${m.name.replace(/'/g, "\\'")}', '${(m.source||'').replace(/'/g, "\\'")}')">
                    <span style="font-weight:bold;color:var(--gold);">👹 ${m.name}</span>
                    <span style="font-size:0.8rem;color:var(--text-dim);">CR:${m.cr || '?'} | ${m.size || ''} ${m.type || ''}${m.source ? ' | ' + m.source : ''}</span>
                </div>
                `).join('')}</div>
                ${needCollapse ? `<button class="search-toggle-btn" id="${toggleId}" onclick="toggleMonsterList('${listId}', '${toggleId}', ${monsters.length})">▼ 展开全部 (${monsters.length}条)</button>` : ''}
            `;
        }

        function toggleMonsterList(listId, toggleId, total) {
            const list = document.getElementById(listId);
            const btn = document.getElementById(toggleId);
            if (!list || !btn) return;
            if (list.classList.contains('search-collapsed')) {
                list.classList.remove('search-collapsed');
                btn.textContent = '▲ 收起列表';
            } else {
                list.classList.add('search-collapsed');
                btn.textContent = `▼ 展开全部 (${total}条)`;
            }
        }

        async function selectMonsterResult(name, source) {
            document.getElementById('monster-search').value = name;
            const resultsEl = document.getElementById('search-results');
            resultsEl.innerHTML = '<div style="color:var(--cyan);font-size:0.85rem;padding:0.25rem;">加载详情...</div>';

            // 带 source 精确打开对应规则版本（5e MM / 5r MM25 同名并存）
            const srcQ = source ? `?source=${encodeURIComponent(source)}` : '';
            const resp = await fetch(`/api/monster/${encodeURIComponent(name)}${srcQ}`);
            const data = await resp.json();
            if (!data.error) {
                resultsEl.innerHTML = '';
                showMonsterInfo(data);
            } else {
                resultsEl.innerHTML = '<div style="color:var(--red);">加载失败</div>';
            }
        }

        function showMonsterInfo(monster) {
            // 保存在全局变量中以便后续操作
            window._selectedMonster = monster;

            const el = document.getElementById('monster-info');
            el.innerHTML = `
                <div style="background:var(--bg);border:1px solid var(--accent);border-radius:8px;
                            padding:0.75rem;margin-top:0.5rem;">
                    <div style="color:var(--accent);font-weight:bold;margin-bottom:0.35rem;">
                        👹 ${monster.name}
                        ${monster.name_en ? `<small style="color:var(--text-dim);font-weight:normal;">${monster.name_en}</small>` : ''}
                    </div>
                    <div style="color:var(--gold);font-size:0.85rem;margin-bottom:0.5rem;">
                        CR: ${monster.cr || '?'} | ${monster.size || '?'} ${monster.type || '?'}
                        ${monster.legendary ? ' | 传奇: ' + monster.legendary : ''}
                    </div>
                    ${monster.detail_text ? `<div style="font-size:0.8rem;color:var(--text-dim);line-height:1.5;white-space:pre-wrap;max-height:250px;overflow-y:auto;">${monster.detail_text}</div>` : '<div style="font-size:0.8rem;color:var(--text-dim);">（无详细描述数据）</div>'}
                    <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.35rem;">📚 ${monster.source || '未知'}${monster.rule_version && monster.rule_version !== monster.source ? ' <span style="color:#d4a860;">[' + monster.rule_version + ']</span>' : ''}</div>
                    <button class="btn btn-primary btn-small" onclick="createCharFromMonster()" style="margin-top:0.5rem;">📋 创建为角色</button>
                </div>`;
        }

        async function createCharFromMonster() {
            const monster = window._selectedMonster;
            if (!monster) { alert('请先搜索生物'); return; }

            try {
                const identity = getIdentity();
                const resp = await fetch('/api/character/from-monster', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: monster.name,
                        cr: monster.cr || '0',
                        size: monster.size || '',
                        type: monster.type || '',
                        detail_text: monster.detail_text || '',
                        source: monster.source || '',
                        legendary: monster.legendary || '',
                        // 真实怪物数据（SRD 怪物返回 hp/ac/abilities），
                        // 后端优先使用，缺失时从词条文本解析或按 CR 估算
                        hp: monster.hp || '',
                        ac: monster.ac ?? '',
                        abilities: monster.abilities || null,
                        created_by: identity.name || '',
                    })
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                alert(`✅ 角色 "${monster.name}" 已创建！\nHP: ${data.hp_current}/${data.hp_max} | AC: ${data.ac}${data.hp_dice ? `\n（HP 按词条 ${data.hp_dice} 投掷生成）` : ''}`);
                loadCharList();
                selectChar(data.id);  // 获取完整角色数据
            } catch(e) {
                alert('创建失败: ' + e.message);
            }
        }
