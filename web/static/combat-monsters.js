/* ━━━ 战斗 · 怪物搜索模块 ━━━
 * 从 combat.js 拆分（2026-08-17）
 * 怪物搜索/详情/加入战斗；顶层函数，全局可见
 */

        async function searchMonster() {
            const query = document.getElementById('monster-search').value.trim();
            if (query.length < 2) { alert('至少输入2个字'); return; }

            const resultsEl = document.getElementById('search-results');
            resultsEl.innerHTML = '<div style="color:var(--text-dim);padding:0.5rem;">搜索中...</div>';

            try {
                // 先用精确搜索
                const resp = await fetch(`/api/monster/${encodeURIComponent(query)}`);
                const data = await resp.json();

                if (!data.error) {
                    // 精确匹配 — 直接显示详情
                    selectedMonster = data;
                    resultsEl.innerHTML = '';
                    showMonsterInfo(data);
                    return;
                }

                // 模糊搜索
                const searchResp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                const searchData = await searchResp.json();

                if (!searchData.results || !searchData.results.length) {
                    resultsEl.innerHTML = '<div style="color:var(--text-dim);padding:0.5rem;">未找到匹配的生物</div>';
                    document.getElementById('monster-info').innerHTML = '';
                    return;
                }

                // 过滤只显示怪物
                const monsters = searchData.results.filter(r => r.type === 'monster');
                if (!monsters.length) {
                    resultsEl.innerHTML = '<div style="color:var(--text-dim);padding:0.5rem;">未找到匹配的生物（可尝试其他关键词）</div>';
                    return;
                }

                resultsEl.innerHTML = monsters.map(m => `
                    <div class="search-result-item" onclick="selectMonsterResult('${m.name.replace(/'/g, "\\'")}')">
                        <span class="name">👹 ${m.name}</span>
                        <span class="meta">CR:${m.cr || '?'} | ${m.source || ''}</span>
                    </div>
                `).join('');

            } catch(e) {
                resultsEl.innerHTML = `<div style="color:var(--red);">搜索失败: ${e.message}</div>`;
            }
        }

        async function selectMonsterResult(name) {
            document.getElementById('monster-search').value = name;
            const resp = await fetch(`/api/monster/${encodeURIComponent(name)}`);
            const data = await resp.json();
            if (!data.error) {
                selectedMonster = data;
                document.getElementById('search-results').innerHTML = '';
                showMonsterInfo(data);
            }
        }

        function showMonsterInfo(monster) {
            const el = document.getElementById('monster-info');
            el.innerHTML = `
                <div class="monster-info-card">
                    <div class="title">👹 ${monster.name}${monster.name_en ? ' <small style="color:var(--text-dim)">' + monster.name_en + '</small>' : ''}</div>
                    <div style="color:var(--gold);margin-bottom:0.5rem;">
                        挑战等级: ${monster.cr || '?'} | ${monster.size || '?'} ${monster.type || '?'}
                        ${monster.legendary ? ' | 传奇: ' + monster.legendary : ''}
                    </div>
                    ${monster.detail_text ? `<div class="detail">${monster.detail_text}</div>` : ''}
                    <div style="color:var(--text-dim);font-size:0.8rem;">📚 来源: ${monster.source || '未知'}</div>
                    <div class="btn-row">
                        <button class="btn btn-primary" onclick="addMonsterToCombat()">➕ 加入战斗</button>
                    </div>
                </div>`;
        }

        function addMonsterToCombat() {
            if (!selectedMonster) { alert('请先搜索并选择一个生物'); return; }

            // 估算HP和AC
            let hpEst = 10, acEst = 10;
            const detailText = selectedMonster.detail_text || '';
            const hpMatch = detailText.match(/生命值[：:]\s*(\d+)/) || detailText.match(/HP[：:]\s*(\d+)/i);
            const acMatch = detailText.match(/AC[：:]\s*(\d+)/i) || detailText.match(/护甲等级[：:]\s*(\d+)/);
            if (hpMatch) hpEst = parseInt(hpMatch[1]);
            if (acMatch) acEst = parseInt(acMatch[1]);

            // 填充表单（先攻加入后在列表中手动填入）
            document.getElementById('combatant-name').value = selectedMonster.name || '';
            document.getElementById('combatant-hp').value = hpEst;
            document.getElementById('combatant-hp-max').value = hpEst;
            document.getElementById('combatant-ac').value = acEst;
            document.getElementById('char-select').value = '';
            // 自动加入战斗
            addCombatant();
        }
