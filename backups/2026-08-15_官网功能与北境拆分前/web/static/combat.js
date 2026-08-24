        function getIdentity() {
            try {
                const saved = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                const role = (saved && saved.is_dm) ? 'DM' : ((saved && saved.role) || 'PL');
                return { name: (saved && saved.name) || '', role: role };
            } catch(e) { return { name: '', role: 'PL' }; }
        }

        let combatants = [];
        let charCache = {};
        let combatStarted = false;

        // ━━━ 角色下拉框 ━━━
        async function loadCharSelect() {
            try {
                const identity = getIdentity();
                // 未登录时也能看到所有角色（用于快速加入战斗）
                const role = identity.name ? identity.role : 'DM';
                const resp = await fetch(`/api/characters?name=${encodeURIComponent(identity.name)}&role=${encodeURIComponent(role)}`);
                const data = await resp.json();
                const chars = Array.isArray(data) ? data : (data.characters || []);
                const select = document.getElementById('char-select');
                if (!select) return;
                // 清除旧选项，保留默认项
                select.innerHTML = '<option value="">— 手动输入 —</option>';
                if (chars.length) {
                    chars.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = `${c.name} (${c.level}级 ${c.class || ''} | HP:${c.hp_current || 0}/${c.hp_max || 0})`;
                        select.appendChild(opt);
                    });
                }
            } catch(e) { console.error('加载角色列表失败', e); }
        }

        async function onCharSelect() {
            const charId = document.getElementById('char-select').value;
            if (!charId) {
                document.getElementById('combatant-name').value = '';
                document.getElementById('combatant-hp').value = '';
                document.getElementById('combatant-hp-max').value = '';
                document.getElementById('combatant-ac').value = '10';
                return;
            }
            if (!charCache[charId]) {
                const resp = await fetch(`/api/character/${charId}`);
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                charCache[charId] = data;
            }
            const char = charCache[charId];
            document.getElementById('combatant-name').value = char.name || '';
            document.getElementById('combatant-hp').value = char.hp_current || 0;
            document.getElementById('combatant-hp-max').value = char.hp_max || 0;
            document.getElementById('combatant-ac').value = char.ac || 10;
        }

        // ━━━ 添加/管理战斗参与者 ━━━
        function addCombatant() {
            const name = document.getElementById('combatant-name').value.trim();
            if (!name) { alert('请输入名称'); return; }

            const hp = parseInt(document.getElementById('combatant-hp').value) || 0;
            const hpMax = parseInt(document.getElementById('combatant-hp-max').value) || hp;
            const ac = parseInt(document.getElementById('combatant-ac').value) || 10;

            // 先攻：加入后手动在列表中填入
            const initiative = null;  // null = 未填入，用户必须手动输入

            // 记录添加者
            const identity = getIdentity();

            // 检查是否从角色下拉框选择
            const charSelect = document.getElementById('char-select');
            const selectedCharId = charSelect ? parseInt(charSelect.value) || null : null;
            combatants.push({
                name, initiative,
                initDetail: '',
                hp, hpMax, ac, conditions: [],
                charId: selectedCharId,
                addedBy: identity.name || '',
                addedByRole: identity.role || 'PL'
            });
            // 不自动排序，等点击"开始"后再排
            _localChangeTs = Date.now();
            renderInitiative();
            updateDmgDropdown();
            document.getElementById('char-select').value = '';
        }

        function startCombat() {
            if (!combatants.length) { alert('请先添加战斗参与者'); return; }
            // 检查所有角色是否都已填入先攻值
            var missing = combatants.filter(function(c) { var v = c.initiative; return v === undefined || v === null || v === '' || isNaN(v); });
            if (missing.length > 0) {
                alert('有 ' + missing.length + ' 位角色尚未准备好…\n请为所有参战者填入先攻值后再开始战斗。');
                return;
            }
            // 按先攻从高到低排序
            combatants.sort((a, b) => b.initiative - a.initiative);
            combatants.forEach(c => c.isCurrent = false);
            combatants[0].isCurrent = true;
            combatStarted = true;
            document.getElementById('round-info').textContent = '第 1 轮';
            renderInitiative();
        }

        function nextCombatant() {
            // 下一位角色；若已是最后一位则自动进入下一轮
            if (!combatants.length) return;
            const currentIdx = combatants.findIndex(c => c.isCurrent);
            if (currentIdx >= 0) combatants[currentIdx].isCurrent = false;
            const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % combatants.length;
            // 如果下一位是先攻最高（绕回第一位），轮数自动+1
            if (nextIdx === 0 && currentIdx >= 0 && combatants.length > 1) {
                const round = parseInt((document.getElementById('round-info').textContent.match(/\d+/) || ['1'])[0]) + 1;
                document.getElementById('round-info').textContent = `第 ${round} 轮`;
            }
            combatants[nextIdx].isCurrent = true;
            renderInitiative();
        }

        function prevCombatant() {
            // 返回上一位角色
            if (!combatants.length) return;
            const currentIdx = combatants.findIndex(c => c.isCurrent);
            if (currentIdx >= 0) combatants[currentIdx].isCurrent = false;
            const prevIdx = currentIdx <= 0 ? combatants.length - 1 : currentIdx - 1;
            combatants[prevIdx].isCurrent = true;
            renderInitiative();
        }

        function prevRound() {
            // 上一回合：回合数-1（最少第1轮），回到先攻最高
            if (!combatants.length) return;
            combatants.forEach(c => c.isCurrent = false);
            combatants[0].isCurrent = true;
            const round = Math.max(1, parseInt((document.getElementById('round-info').textContent.match(/\d+/) || ['1'])[0]) - 1);
            document.getElementById('round-info').textContent = `第 ${round} 轮`;
            renderInitiative();
        }

        function nextRound() {
            // 下一回合：回合数+1，回到先攻最高
            if (!combatants.length) return;
            combatants.forEach(c => c.isCurrent = false);
            combatants[0].isCurrent = true;
            const round = parseInt((document.getElementById('round-info').textContent.match(/\d+/) || ['1'])[0]) + 1;
            document.getElementById('round-info').textContent = `第 ${round} 轮`;
            renderInitiative();
        }

        function renderInitiative() {
            const el = document.getElementById('initiative-list');
            if (!combatants.length) {
                combatStarted = false;
                el.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:2rem;">添加参与者后填入先攻，点击"开始"</div>';
                return;
            }
            const identity = getIdentity();
            const isDM = identity.role === 'DM';
            el.innerHTML = combatants.map((c, i) => {
                const hpPct = c.hpMax > 0 ? Math.round(c.hp / c.hpMax * 100) : 100;
                const hpColor = hpPct <= 25 ? 'var(--red)' : (hpPct <= 50 ? 'var(--gold)' : 'var(--green)');
                // DM可编辑所有先攻，PL只能编辑自己添加的
                const canEdit = isDM || (c.addedBy && c.addedBy === identity.name);
                const initDisplay = canEdit
                    ? `<span style="color:var(--text-dim);font-size:0.78rem;">先攻:</span><input type="number" id="init-input-${i}" value="${c.initiative || ''}" placeholder="--"
                            style="width:45px;padding:0.15rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--gold);font-size:0.8rem;text-align:center;">
                       <button onclick="confirmInitiative(${i})" title="确定先攻" style="background:var(--accent);border:none;color:#fff;cursor:pointer;padding:0.15rem 0.3rem;border-radius:3px;font-size:0.7rem;margin-left:2px;">✓</button>`
                    : `<span style="color:var(--text-dim);font-size:0.78rem;">先攻:</span><span style="color:var(--cyan);font-weight:bold;font-size:0.85rem;">${c.initiative || '--'}</span>`;
                return `
                <div class="combatant-row${c.isCurrent ? ' current' : ''}">
                    <span class="combatant-name">${combatStarted ? (i + 1) + '. ' : ''}${c.name}${c.isCurrent ? ' ◀' : ''}</span>
                    ${initDisplay}
                    <span class="combatant-hp" style="color:${hpColor}">❤️ ${c.hp}/${c.hpMax}</span>
                    <span class="combatant-ac">🛡️ AC ${c.ac}</span>
                    ${c.conditions.length ? `<span style="color:var(--red)">[${c.conditions.join(',')}]</span>` : ''}
                    <button onclick="removeCombatant(${i})" title="脱离战斗"
                            style="background:none;border:none;color:var(--red);cursor:pointer;font-size:1.1rem;padding:0 0.25rem;"
                            onmouseover="this.style.color='#ff0000'" onmouseout="this.style.color='var(--red)'">✕</button>
                </div>`;
            }).join('');
        }

        function updateInitiative(index, value) {
            var v = (value !== '' && value !== null) ? parseInt(value) : null;
            if (isNaN(v)) v = null;
            combatants[index].initiative = v;
            combatants[index].initDetail = (v !== null) ? '手动: ' + v : '';
            _localChangeTs = Date.now();
        }

        function confirmInitiative(index) {
            const input = document.getElementById('init-input-' + index);
            if (!input) return;
            const value = input.value;
            updateInitiative(index, value);
            _localChangeTs = Date.now();  // 标记本地修改时间
            // 立即保存到localStorage和服务器
            if (typeof saveCombatState === 'function') saveCombatState();
            // 然后再渲染
            renderInitiative();
        }

        // ━━━ 伤害下拉框（从参战者列表动态更新）━━
        function updateDmgDropdown() {
            const select = document.getElementById('dmg-target');
            const currentVal = select.value;
            select.innerHTML = '<option value="">— 选择目标 —</option>';
            combatants.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = `${c.name} (HP:${c.hp}/${c.hpMax})`;
                if (c.name === currentVal) opt.selected = true;
                select.appendChild(opt);
            });
        }

        async function applyDamage() {
            const target = document.getElementById('dmg-target').value;
            if (!target) { alert('请选择目标'); return; }
            const amount = parseInt(document.getElementById('dmg-amount').value) || 0;
            if (amount <= 0) { alert('请输入有效伤害值'); return; }

            const c = combatants.find(c => c.name === target);
            if (!c) { alert(`未找到: ${target}`); return; }

            c.hp = Math.max(0, c.hp - amount);
            const status = c.hp <= 0 ? ' 💀 已倒地!' : '';
            renderInitiative();
            updateDmgDropdown();
            document.getElementById('dmg-amount').value = '';
            await syncCombatantHP(c);
            alert(`${c.name} 受到 ${amount} 点伤害，剩余 HP: ${c.hp}/${c.hpMax}${status}`);
        }

        async function applyHeal() {
            const target = document.getElementById('dmg-target').value;
            if (!target) { alert('请选择目标'); return; }
            const amount = parseInt(document.getElementById('dmg-amount').value) || 0;
            if (amount <= 0) { alert('请输入有效治疗值'); return; }

            const c = combatants.find(c => c.name === target);
            if (!c) { alert(`未找到: ${target}`); return; }

            const maxHp = c.hpMax || c.hp;
            c.hp = Math.min(maxHp, c.hp + amount);
            renderInitiative();
            updateDmgDropdown();
            document.getElementById('dmg-amount').value = '';
            await syncCombatantHP(c);
            alert(`${c.name} 恢复 ${amount} 点HP，剩余 HP: ${c.hp}/${c.hpMax}`);
        }

        async function syncCombatantHP(c) {
            if (!c.charId) return;
            try {
                await fetch(`/api/character/${c.charId}/hp`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({amount: c.hp, setAbsolute: true})
                });
                delete charCache[c.charId];
            } catch(e) {}
        }

        function removeCombatant(index) {
            const c = combatants[index];
            if (!confirm(`将 "${c.name}" 脱离战斗？`)) return;
            combatants.splice(index, 1);
            if (c.isCurrent && combatants.length > 0) {
                combatants[index % combatants.length].isCurrent = true;
            }
            _localChangeTs = Date.now();  // 保护本地删除
            renderInitiative();
            updateDmgDropdown();
        }

        function clearCombat() {
            if (!confirm('确认清空战斗？')) return;
            combatants = [];
            document.getElementById('round-info').textContent = '';
            renderInitiative();
            updateDmgDropdown();
            localStorage.removeItem(COMBAT_STORAGE);
        }

        // ━━━ 怪物搜索 ━━━
        let selectedMonster = null;

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

        // ━━━ 快速骰 ━━━
        async function quickRoll() {
            const expr = document.getElementById('quick-dice').value.trim();
            if (!expr) return;
            const resp = await fetch('/api/roll', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({expression: expr})
            });
            const data = await resp.json();
            alert(`🎲 ${expr} = ${data.total}`);
        }

        // ━━━ 战斗状态持久化 ━━━
        const COMBAT_STORAGE = 'dnd_combat_state';

        var _combatLastTs = 0;  // 上次同步的时间戳（服务器提供）

        function saveCombatState() {
            if (!combatants.length) {
                _combatLastTs = 0;
                localStorage.removeItem(COMBAT_STORAGE);
                fetch('/api/combat-state', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({state: {combatants:[], round:'', _ts:0}})}).catch(()=>{});
                return;
            }
            try {
                var state = {combatants: combatants.map(c => ({...c})), round: document.getElementById('round-info')?.textContent || '', _ts: _combatLastTs};
                localStorage.setItem(COMBAT_STORAGE, JSON.stringify(state));
                // POST到服务器，服务器会返回新时间戳
                fetch('/api/combat-state', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({state: state})}).then(r=>r.json()).then(d => {
                        if (d.timestamp) _combatLastTs = d.timestamp;
                    }).catch(()=>{});
            } catch(e) {}
        }

        var _localChangeTs = 0;  // 本地修改时间戳，防止被远程覆盖

        // 定时拉取服务器战斗状态
        setInterval(function() {
            fetch('/api/combat-state').then(function(r) { return r.json(); }).then(function(data) {
                if (!data.ok || !data.state || !data.state.combatants) return;
                var s = data.state;
                var remoteTs = s._ts || 0;
                if (remoteTs <= _combatLastTs + 1) return;
                _combatLastTs = remoteTs;
                combatants = s.combatants.map(function(rc, i) {
                    var lc = combatants[i];
                    return {name: rc.name, initiative: rc.initiative, initDetail: rc.initDetail, hp: rc.hp, hpMax: rc.hpMax, ac: rc.ac, conditions: rc.conditions, charId: rc.charId, isCurrent: rc.isCurrent, addedBy: (lc && lc.addedBy) || rc.addedBy || '', addedByRole: (lc && lc.addedByRole) || rc.addedByRole || 'PL'};
                });
                renderInitiative();
                updateDmgDropdown();
                if (s.round) document.getElementById('round-info').textContent = s.round;
                localStorage.setItem(COMBAT_STORAGE, JSON.stringify(s));
            }).catch(function() {});
        }, 3000);

        function restoreCombatState() {
            try {
                const raw = localStorage.getItem(COMBAT_STORAGE);
                if (!raw) return false;
                const state = JSON.parse(raw);
                if (!state.combatants || !state.combatants.length) return false;
                _combatLastTs = state._ts || 0;
                combatants = state.combatants.map(c => ({...c}));
                renderInitiative();
                updateDmgDropdown();
                if (state.round) {
                    document.getElementById('round-info').textContent = state.round;
                }
                return true;
            } catch(e) { return false; }
        }

        // 初始加载
        window.loadCharSelect = loadCharSelect;
        loadCharSelect();
        const restored = restoreCombatState();

        // 每次界面刷新后即时保存（所有战斗操作最终都会调用 renderInitiative）
        const _origRenderInitiative = renderInitiative;
        renderInitiative = function() { _origRenderInitiative(); saveCombatState(); };

        // 页面隐藏/关闭前保存
        window.addEventListener('pagehide', saveCombatState);
        window.addEventListener('beforeunload', saveCombatState);

        // ━━━ WebSocket 实时同步战斗状态 ━━━
        var _combatWs = null;
        var _combatWsReconnect = null;

        function combatWsConnect() {
            if (_combatWs && _combatWs.readyState === WebSocket.OPEN) return;
            try {
                var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
                _combatWs = new WebSocket(proto + '//' + location.host + '/ws');
                _combatWs.onopen = function() {
                    // WS就绪后推送一次当前状态
                    if (combatants.length) {
                        _combatWs.send(JSON.stringify({
                            type: 'combat_update',
                            state: {combatants: combatants.map(function(c) { return {name:c.name, initiative:c.initiative, initDetail:c.initDetail, hp:c.hp, hpMax:c.hpMax, ac:c.ac, conditions:c.conditions, charId:c.charId, isCurrent:c.isCurrent}; }),
                                    round: document.getElementById('round-info') ? document.getElementById('round-info').textContent : ''}
                        }));
                    }
                };
                _combatWs.onmessage = function(e) {
                    try {
                        var msg = JSON.parse(e.data);
                        if (msg.type === 'combat_update') {
                            var s = msg.state;
                            if (!s || !s.combatants) return;
                            // 合并远程状态（保留本地添加者信息）
                            combatants = s.combatants.map(function(rc, i) {
                                var lc = combatants[i];
                                return {name: rc.name, initiative: rc.initiative, initDetail: rc.initDetail, hp: rc.hp, hpMax: rc.hpMax, ac: rc.ac, conditions: rc.conditions, charId: rc.charId, isCurrent: rc.isCurrent, addedBy: (lc && lc.addedBy) || rc.addedBy || '', addedByRole: (lc && lc.addedByRole) || rc.addedByRole || 'PL'};
                            });
                            renderInitiative();
                            updateDmgDropdown();
                            if (s.round) document.getElementById('round-info').textContent = s.round;
                            if (s._ts) _combatLastTs = s._ts;
                            try { localStorage.setItem(COMBAT_STORAGE, JSON.stringify(s)); } catch(e) {}
                        }
                    } catch(ex) {}
                };
                _combatWs.onclose = function() {
                    if (_combatWsReconnect) clearTimeout(_combatWsReconnect);
                    _combatWsReconnect = setTimeout(combatWsConnect, 3000);
                };
                _combatWs.onerror = function() { try { _combatWs.close(); } catch(e) {} };
            } catch(e) {}
        }

        // 启动 WS（延迟1秒等页面就绪）
        setTimeout(combatWsConnect, 1000);

        // 包装 saveCombatState，添加 WS 广播
        var _origSaveCombatState = saveCombatState;
        saveCombatState = function() {
            _origSaveCombatState();
            // 通过 WS 实时广播（不等 HTTP 轮询）
            if (_combatWs && _combatWs.readyState === WebSocket.OPEN && combatants.length) {
                try {
                    _combatWs.send(JSON.stringify({
                        type: 'combat_update',
                        state: {combatants: combatants.map(function(c) { return {name:c.name, initiative:c.initiative, initDetail:c.initDetail, hp:c.hp, hpMax:c.hpMax, ac:c.ac, conditions:c.conditions, charId:c.charId, isCurrent:c.isCurrent}; }),
                                round: document.getElementById('round-info') ? document.getElementById('round-info').textContent : '',
                                _ts: _combatLastTs}
                    }));
                } catch(e) {}
            }
        };
