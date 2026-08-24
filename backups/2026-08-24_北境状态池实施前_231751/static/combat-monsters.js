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
                // 先用精确搜索（返回词条名须与输入一致，否则是模糊命中
                // 如"亡灵僵尸"命中"骚灵"，继续走模糊搜索列表确认）
                const resp = await fetch(`/api/monster/${encodeURIComponent(query)}`);
                const data = await resp.json();

                if (!data.error && data.name === query) {
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
                    <div class="search-result-item" onclick="selectMonsterResult('${m.name.replace(/'/g, "\\'")}', '${(m.source||'').replace(/'/g, "\\'")}')">
                        <span class="name">👹 ${m.name}</span>
                        <span class="meta">CR:${m.cr || '?'} | ${m.source || ''}</span>
                    </div>
                `).join('');

            } catch(e) {
                resultsEl.innerHTML = `<div style="color:var(--red);">搜索失败: ${e.message}</div>`;
            }
        }

        async function selectMonsterResult(name, source) {
            document.getElementById('monster-search').value = name;
            const srcQ = source ? `?source=${encodeURIComponent(source)}` : '';
            const resp = await fetch(`/api/monster/${encodeURIComponent(name)}${srcQ}`);
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
                    <div style="color:var(--text-dim);font-size:0.8rem;">📚 来源: ${monster.source || '未知'}${monster.rule_version && monster.rule_version !== monster.source ? ' <span style="color:#d4a860;">[' + monster.rule_version + ']</span>' : ''}</div>
                    <div class="btn-row">
                        <button class="btn btn-primary" onclick="addMonsterToCombat()">➕ 加入战斗</button>
                    </div>
                </div>`;
        }

        function addMonsterToCombat() {
            if (!selectedMonster) { alert('请先搜索并选择一个生物'); return; }

            // 估算HP和AC：真实字段优先（SRD 怪物返回 hp/ac），
            // 其次 CHM 词条文本解析（兼容 "HP 19（3d8+6）" 无冒号格式）
            let hpEst = 10, acEst = 10;
            const detailText = selectedMonster.detail_text || '';
            let hpMatch = String(selectedMonster.hp || '').match(/\d+/);
            let acMatch = (selectedMonster.ac !== undefined && selectedMonster.ac !== null
                        && selectedMonster.ac !== '' && selectedMonster.ac !== '?')
                ? String(selectedMonster.ac).match(/\d+/) : null;
            if (!hpMatch) {
                const m = detailText.match(/HP\s*[：:]?\s*(\d+)/i) || detailText.match(/生命值\s*[：:]?\s*(\d+)/);
                if (m) hpMatch = m;
            }
            if (!acMatch) {
                const m = detailText.match(/AC\s*[：:]?\s*(\d+)/i) || detailText.match(/护甲等级\s*[：:]?\s*(\d+)/);
                if (m) acMatch = m;
            }
            if (hpMatch) hpEst = parseInt(hpMatch[1] || hpMatch[0]);
            if (acMatch) acEst = parseInt(acMatch[1] || acMatch[0]);

            // 填充表单（先攻加入后在列表中手动填入）
            document.getElementById('combatant-name').value = selectedMonster.name || '';
            document.getElementById('combatant-hp').value = hpEst;
            document.getElementById('combatant-hp-max').value = hpEst;
            document.getElementById('combatant-ac').value = acEst;
            document.getElementById('char-select').value = '';
            // 自动加入战斗
            addCombatant();
        }
