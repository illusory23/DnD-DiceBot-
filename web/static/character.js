        let currentChar = null;

        function getIdentity() {
            try {
                const saved = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                const role = (saved && saved.is_dm) ? 'DM' : ((saved && saved.role) || 'PL');
                return { name: (saved && saved.name) || '', role: role };
            } catch(e) { return { name: '', role: 'PL' }; }
        }

        let charListGroups = [];
        let charListChars = [];

        function renderCharItem(c) {
            return `
                <div class="char-list-item" draggable="true"
                     data-char-id="${c.id}" data-group-id="${c.group_id || ''}">
                    <span class="drag-handle" title="拖动排序">⠿</span>
                    <img src="/api/character/${c.id}/portrait"
                         style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border);"
                         onerror="this.style.display='none'"
                         loading="lazy">
                    <span style="flex:1;cursor:pointer;" onclick="selectChar(${c.id})">${c.name}</span>
                    <span style="color:var(--text-dim);font-size:0.75rem;">${c.level}级 ${c.class || '-'}</span>
                    <button class="btn btn-small" onclick="event.stopPropagation();copyCharFromList(${c.id}, '${(c.name||'').replace(/'/g, "\\'")}')" title="复制角色" style="padding:0.1rem 0.3rem;font-size:0.65rem;">📋</button>
                    <button class="btn btn-small btn-danger" onclick="event.stopPropagation();deleteCharFromList(${c.id}, '${(c.name||'').replace(/'/g, "\\'")}')" title="删除角色" style="padding:0.1rem 0.3rem;font-size:0.65rem;">🗑</button>
                </div>`;
        }

        function renderCharListHTML() {
            const groups = charListGroups;
            const chars = charListChars;
            let html = '';

            // 总角色组（显示全部角色，不可拖动/删除）
            html += renderGroupHTML({id: '__all__', name: '总角色组', _isDefault: true, _collapsed: false}, chars);

            // 各分组及其角色（类型归一化比较，group_id 可能是字符串或数字）
            for (const g of groups) {
                const groupChars = chars.filter(c => String(c.group_id) === String(g.id));
                html += renderGroupHTML(g, groupChars);
            }

            return html;
        }

        function renderGroupHTML(g, groupChars) {
            const isDefault = g._isDefault;
            const gid = g.id || '';
            const gname = g.name || '分组';
            const collapsed = g._collapsed ? ' collapsed' : '';
            const arrow = g._collapsed ? '▶' : '▼';
            const countBadge = `<span style="color:var(--text-dim);font-size:0.7rem;margin-left:0.3rem;">${groupChars.length}</span>`;

            let headerActions = '';
            if (!isDefault) {
                headerActions = `
                    <button class="group-action-btn" onclick="event.stopPropagation();startRenameGroup('${gid}')" title="重命名分组">✏️</button>
                    <button class="group-action-btn group-delete-btn" onclick="event.stopPropagation();deleteGroup('${gid}')" title="删除分组">✕</button>`;
            }

            const items = groupChars.map(c => renderCharItem(c)).join('');
            const emptyHint = groupChars.length === 0
                ? '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.3rem 0.5rem;opacity:0.5;">拖动角色到此处</div>'
                : '';

            return `
                <div class="char-group" data-group-id="${gid}" draggable="${isDefault ? 'false' : 'true'}">
                    <div class="group-header${collapsed}" onclick="toggleGroup('${gid}')">
                        <span class="drag-handle group-drag-handle" title="拖动排序" onclick="event.stopPropagation()" style="${isDefault ? 'visibility:hidden;' : ''}">⠿</span>
                        <span class="group-arrow">${arrow}</span>
                        <span class="group-name" data-gid="${gid}">${gname}</span>
                        ${countBadge}
                        <span style="flex:1;"></span>
                        ${headerActions}
                    </div>
                    <div class="group-body">
                        ${items}${emptyHint}
                    </div>
                </div>`;
        }

        function applyCharListEvents() {
            const el = document.getElementById('char-list');
            // 角色项拖拽
            let dragCharId = null;
            const charItems = el.querySelectorAll('.char-list-item');
            charItems.forEach(item => {
                item.addEventListener('dragstart', function(e) {
                    dragCharId = parseInt(this.dataset.charId);
                    this.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'char:' + this.dataset.charId);
                    setTimeout(() => { this.style.opacity = '0.4'; }, 0);
                });
                item.addEventListener('dragend', function(e) {
                    this.classList.remove('dragging');
                    this.style.opacity = '';
                    el.querySelectorAll('.char-list-item').forEach(it => it.classList.remove('drag-over'));
                    el.querySelectorAll('.group-body').forEach(b => b.classList.remove('drag-target-group'));
                    dragCharId = null;
                });
                item.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this.classList.add('drag-over');
                });
                item.addEventListener('dragleave', function(e) {
                    this.classList.remove('drag-over');
                });
                item.addEventListener('drop', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.classList.remove('drag-over');
                    if (!dragCharId || dragCharId === parseInt(this.dataset.charId)) return;
                    // 总角色组内不支持跨组拖放
                    const targetGroup = this.closest('.char-group');
                    const targetGroupId = targetGroup ? targetGroup.dataset.groupId : null;
                    if (targetGroupId === '__all__') {
                        // 全部组内：仅排序，不改变分组归属
                        this.parentNode.insertBefore(
                            el.querySelector(`.char-list-item[data-char-id="${dragCharId}"]`),
                            this.nextSibling
                        );
                        const allChars = [...el.querySelectorAll('.char-list-item')];
                        saveCharOrder(allChars.map(it => parseInt(it.dataset.charId)));
                        return;
                    }
                    // 移动 DOM
                    this.parentNode.insertBefore(
                        el.querySelector(`.char-list-item[data-char-id="${dragCharId}"]`),
                        this.nextSibling
                    );
                    // 发送排序
                    const allChars = [...el.querySelectorAll('.char-list-item')];
                    const orderedIds = allChars.map(it => parseInt(it.dataset.charId));
                    saveCharOrder(orderedIds);
                    // 更新分组归属（如果跨越了分组）
                    updateCharGroupAfterDrop(dragCharId, this.closest('.char-group').dataset.groupId);
                });
            });

            // 分组体接受角色拖放
            const groupBodies = el.querySelectorAll('.group-body');
            groupBodies.forEach(body => {
                const groupEl = body.closest('.char-group');
                const gid = groupEl ? groupEl.dataset.groupId : null;
                body.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this.classList.add('drag-target-group');
                });
                body.addEventListener('dragleave', function(e) {
                    if (!this.contains(e.relatedTarget)) this.classList.remove('drag-target-group');
                });
                body.addEventListener('drop', function(e) {
                    e.preventDefault();
                    this.classList.remove('drag-target-group');
                    if (!dragCharId) return;
                    const groupId = this.closest('.char-group').dataset.groupId || null;
                    const item = el.querySelector(`.char-list-item[data-char-id="${dragCharId}"]`);
                    if (item) this.appendChild(item);
                    updateCharGroup(dragCharId, groupId);
                });
            });

            // 分组拖拽排序
            let dragGroupId = null;
            const groups = el.querySelectorAll('.char-group[draggable="true"]');
            groups.forEach(g => {
                g.addEventListener('dragstart', function(e) {
                    dragGroupId = this.dataset.groupId;
                    this.classList.add('group-dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'group:' + this.dataset.groupId);
                    setTimeout(() => { this.style.opacity = '0.4'; }, 0);
                });
                g.addEventListener('dragend', function(e) {
                    this.classList.remove('group-dragging');
                    this.style.opacity = '';
                    el.querySelectorAll('.char-group').forEach(gr => gr.classList.remove('group-drag-over'));
                    dragGroupId = null;
                });
                g.addEventListener('dragover', function(e) {
                    if (dragGroupId === this.dataset.groupId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this.classList.add('group-drag-over');
                });
                g.addEventListener('dragleave', function(e) {
                    this.classList.remove('group-drag-over');
                });
                g.addEventListener('drop', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.classList.remove('group-drag-over');
                    if (!dragGroupId || dragGroupId === this.dataset.groupId) return;
                    const srcGroup = el.querySelector(`.char-group[data-group-id="${dragGroupId}"]`);
                    if (srcGroup) this.parentNode.insertBefore(srcGroup, this.nextSibling || this);
                    // 发送新排序
                    const orderedGroupIds = [...el.querySelectorAll('.char-group[draggable="true"]')].map(gr => parseInt(gr.dataset.groupId));
                    saveGroupOrder(orderedGroupIds);
                });
            });
        }

        // 归一化 groupId：整数或 null
        function normGroupId(gid) {
            if (gid === null || gid === undefined || gid === '' || gid === '__all__') return null;
            const n = parseInt(gid);
            return isNaN(n) ? null : n;
        }

        async function updateCharGroup(charId, groupId) {
            const gid = normGroupId(groupId);
            // 先更新本地数据和 DOM，再异步通知服务器（体验优先）
            const c = charListChars.find(c => c.id === charId);
            if (c) c.group_id = gid;
            // 移动 DOM 元素到目标分组体（无需等待刷新）
            const el = document.getElementById('char-list');
            const item = el.querySelector(`.char-list-item[data-char-id="${charId}"]`);
            if (item) {
                const targetBody = el.querySelector(`.char-group[data-group-id="${groupId || ''}"] .group-body`);
                if (targetBody) targetBody.appendChild(item);
            }
            // 异步持久化
            try {
                await fetch(`/api/character/${charId}/group`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({group_id: gid})
                });
            } catch(e) {}
            // 刷新以确保数据一致
            refreshCharListDisplay();
        }

        function updateCharGroupAfterDrop(charId, targetGroupId) {
            const gid = normGroupId(targetGroupId);
            const c = charListChars.find(c => c.id === charId);
            if (!c) return;
            if (c.group_id === gid) return;
            updateCharGroup(charId, gid);
        }

        function refreshCharListDisplay() {
            const el = document.getElementById('char-list');
            if (!charListChars.length) {
                el.innerHTML = '<div style="color:var(--text-dim)">暂无角色</div>';
                return;
            }
            el.innerHTML = renderCharListHTML();
            applyCharListEvents();
        }

        // ━━ 分组操作 ━━

        window.toggleGroup = function(gid) {
            const group = document.querySelector(`.char-group[data-group-id="${gid}"]`);
            if (!group) return;
            const header = group.querySelector('.group-header');
            const arrow = group.querySelector('.group-arrow');
            const isCollapsed = header.classList.toggle('collapsed');
            arrow.textContent = isCollapsed ? '▶' : '▼';
            // 保存折叠状态
            const g = charListGroups.find(g => String(g.id) === String(gid));
            if (g) g._collapsed = isCollapsed;
        };

        window.startRenameGroup = function(gid) {
            const nameEl = document.querySelector(`.group-name[data-gid="${gid}"]`);
            if (!nameEl) return;
            const currentName = nameEl.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'group-name-input';
            input.style.cssText = 'width:120px;padding:0.15rem 0.3rem;background:var(--bg);border:1px solid var(--accent);border-radius:3px;color:var(--text);font-size:0.82rem;';
            input.addEventListener('blur', () => finishRenameGroup(gid, input.value.trim()));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRenameGroup(gid, input.value.trim());
                if (e.key === 'Escape') { input.replaceWith(nameEl); }
            });
            input.addEventListener('click', (e) => e.stopPropagation());
            nameEl.replaceWith(input);
            input.focus();
            input.select();
        };

        async function finishRenameGroup(gid, newName) {
            if (!newName) { refreshCharListDisplay(); return; }
            try {
                await fetch(`/api/character-groups/${gid}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: newName})
                });
                const g = charListGroups.find(g => String(g.id) === String(gid));
                if (g) g.name = newName;
            } catch(e) {}
            refreshCharListDisplay();
        }

        window.deleteGroup = async function(gid) {
            if (!confirm('删除分组后，组内角色将移出该分组。确定删除？')) return;
            try {
                await fetch(`/api/character-groups/${gid}`, { method: 'DELETE' });
                charListGroups = charListGroups.filter(g => String(g.id) !== String(gid));
                charListChars.forEach(c => { if (String(c.group_id) === String(gid)) c.group_id = null; });
                updateQuickGroupSelects();
            } catch(e) { alert('删除失败: ' + e.message); }
            refreshCharListDisplay();
        };

        window.createNewGroup = async function() {
            const name = prompt('请输入分组名称:', '新分组');
            if (!name || !name.trim()) return;
            try {
                const identity = getIdentity();
                const resp = await fetch('/api/character-groups', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name.trim(), created_by: identity.role === 'DM' ? '' : identity.name})
                });
                const data = await resp.json();
                if (data.ok) {
                    charListGroups.push({id: data.id, name: data.name});
                }
            } catch(e) { alert('创建失败: ' + e.message); }
            refreshCharListDisplay();
        };

        async function saveGroupOrder(orderedIds) {
            try {
                await fetch('/api/character-groups/reorder', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ids: orderedIds})
                });
            } catch(e) {}
        }

        // ━━ 快速分组选择器（创建角色时可选择分组）━━
        function updateQuickGroupSelects() {
            const sel1 = document.getElementById('new-char-group');
            if (!sel1) return;
            const currentVal = sel1.value;
            sel1.innerHTML = '<option value="">— 无分组 —</option>' +
                charListGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            sel1.value = currentVal;
        }

        async function loadCharList() {
            try {
                const identity = getIdentity();
                const resp = await fetch(`/api/characters?name=${encodeURIComponent(identity.name)}&role=${encodeURIComponent(identity.role)}`);
                const data = await resp.json();
                // 兼容旧格式（纯数组）和新格式（{characters, groups}）
                if (Array.isArray(data)) {
                    charListChars = data;
                    charListGroups = [];
                } else {
                    charListChars = data.characters || [];
                    charListGroups = (data.groups || []).map(g => ({...g, _collapsed: false}));
                }
                updateQuickGroupSelects();
                refreshCharListDisplay();
            } catch(e) {
                document.getElementById('char-list').innerHTML = '<div style="color:var(--red)">加载失败</div>';
            }
        }

        async function saveCharOrder(orderedIds) {
            try {
                await fetch('/api/characters/reorder', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ids: orderedIds})
                });
            } catch(e) { /* 静默失败，排序已在本地生效 */ }
        }

        async function createChar() {
            const name = document.getElementById('char-name').value.trim();
            if (!name) { alert('请输入角色名'); return; }

            const groupId = document.getElementById('new-char-group')?.value || null;
            const identity = getIdentity();
            const resp = await fetch('/api/character', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name,
                    level: parseInt(document.getElementById('char-level').value) || 1,
                    class: document.getElementById('char-class').value,
                    race: document.getElementById('char-race').value,
                    created_by: identity.name,
                    group_id: groupId ? parseInt(groupId) : null,
                })
            });

            const data = await resp.json();
            if (data.error) { alert(data.error); return; }

            currentChar = data;
            loadCharList();
            selectChar(data.id);  // 重新获取完整角色数据（含abilities）
        }

        async function selectChar(id) {
            try {
                const resp = await fetch(`/api/character/${id}`);
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                currentChar = data;
                fetch(`/api/character/${encodeURIComponent(data.name)}/use`, {method:'POST'}).catch(()=>{});
                renderCharDetail(data);
            } catch(e) {
                alert('加载角色失败: ' + e.message);
            }
        }

        async function copyCharFromList(id, name) {
            // 生成序号命名：原名 → 原名2号 → 原名3号...
            var baseName = name.replace(/(\d+)号$/, '').trim();
            var maxNum = 1;
            charListChars.forEach(function(c) {
                var m = c.name.match(new RegExp('^' + baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)号$'));
                if (m) { var n = parseInt(m[1]); if (n > maxNum) maxNum = n; }
            });
            var newName = baseName + (maxNum + 1) + '号';
            if (!confirm(`复制角色 "${name}" → "${newName}"？`)) return;
            try {
                const resp = await fetch(`/api/character/${id}/copy`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: newName})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                alert(`已复制为: ${data.name}`);
                loadCharList();
            } catch(e) { alert('复制失败: ' + e.message); }
        }

        async function deleteCharFromList(id, name) {
            if (!confirm(`确认删除角色 "${name}"？此操作不可撤销！`)) return;
            // 记录滚动位置：删除后列表重渲染，保持当前浏览位置不回顶
            const savedScroll = window.scrollY;
            try {
                const resp = await fetch(`/api/character/${id}`, { method: 'DELETE' });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                alert(`已删除: ${data.name}`);
                if (currentChar && currentChar.id === id) {
                    currentChar = null;
                    document.getElementById('char-detail').innerHTML = `
                        <div class="card-header">📋 角色详情</div>
                        <div style="color:var(--text-dim);text-align:center;padding:2rem;">请选择一个角色</div>`;
                }
                await loadCharList();
                if (window.scrollY === 0 && savedScroll > 0) window.scrollTo(0, savedScroll);
            } catch(e) { alert('删除失败: ' + e.message); }
        }

        function renderCharDetail(char) {
            const el = document.getElementById('char-detail');
            if (!char || !char.abilities) {
                el.innerHTML = '<div class="card-header">📋 角色详情</div><div style="color:var(--text-dim);text-align:center;padding:2rem;">请选择一个角色</div>';
                return;
            }

            const abilities = char.abilities;
            const mods = char.ability_mods || {};
            const abbr = {str:'力量', dex:'敏捷', con:'体质', 'int':'智力', wis:'感知', cha:'魅力'};

            // ━━ 属性格 ━━
            const abilityHtml = Object.entries(abbr).map(([key, label]) => {
                const score = abilities[key] || 10;
                const mod = mods[key] || 0;
                return `<div class="ability-box" onclick="editAbility(${char.id}, '${key}', ${score})" title="点击修改${label}值" style="cursor:pointer;">
                    <div class="ability-name">${label}</div>
                    <div class="ability-score">${score}</div>
                    <div class="ability-mod">${mod >= 0 ? '+' : ''}${mod}</div>
                </div>`;
            }).join('');

            // ━━ 技能熟练 ━━
            const skillProfs = char.skill_proficiencies || {};
            const skillNames = ['运动','特技','巧手','隐匿','奥秘','历史','调查','自然','宗教',
                               '驯兽','洞悉','医药','察觉','生存','欺诈','威吓','表演','游说'];
            const skMap = {运动:'str',特技:'dex',巧手:'dex',隐匿:'dex',奥秘:'int',历史:'int',调查:'int',自然:'int',宗教:'int',
                          驯兽:'wis',洞悉:'wis',医药:'wis',察觉:'wis',生存:'wis',欺诈:'cha',威吓:'cha',表演:'cha',游说:'cha'};
            const skillHtml = skillNames.map(s => {
                const prof = skillProfs[s] || {};
                const isProf = prof.is_proficient;
                const isExp = prof.is_expertise;
                const rawBonus = prof.bonus || 0;
                let cls = '';
                let toggleTitle = `点击切换熟练 (当前: ${isExp?'专精':isProf?'熟练':'非熟练'})`;
                if (isExp) { cls = 'proficient expertise'; }
                else if (isProf) { cls = 'proficient'; }
                const ab = char.ability_mods || {};
                const amod = ab[skMap[s]] || 0;
                // 熟练技能显示存储总值（已含修正+熟练），未熟练显示属性修正
                const totalBonus = isProf ? rawBonus : amod;
                return `<span class="skill-tag${cls ? ' ' + cls : ''}" title="${toggleTitle}" style="cursor:pointer;display:inline-flex;align-items:center;gap:0.15rem;">
                    <span onclick="toggleSkill(${char.id}, '${s}', ${!isProf || isExp})">${s}</span>
                    <span class="editable-field" onclick="event.stopPropagation();editSkillBonus(${char.id}, '${s}', ${rawBonus}, ${isProf||false}, ${isExp||false})" title="点击修改加值(当前额外加值:${rawBonus>=0?'+':''}${rawBonus})" style="font-size:0.75rem;">${totalBonus>=0?'+':''}${totalBonus}</span>
                </span>`;
            }).join('');

            // ━━ 武器装备 ━━
            const weapons = char.weapons || [];
            const armor = char.armor || {};
            let weaponHtml = '';
            if (weapons.length > 0) {
                weaponHtml = weapons.map(w => `
                    <div class="detail-row" style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap;">
                        <input value="${w.name || w.weapon_name || ''}" placeholder="武器名"
                            onchange="updateWeapon(${char.id}, ${w.id || w.weapon_id}, 'name', this.value)"
                            style="width:80px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <span style="font-size:0.75rem;color:var(--text-dim);">命中</span>
                        <input value="${w.attack_bonus || 0}" placeholder="命中"
                            onchange="updateWeapon(${char.id}, ${w.id || w.weapon_id}, 'attack_bonus', parseInt(this.value)||0)"
                            style="width:40px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <span style="font-size:0.75rem;color:var(--text-dim);">伤害</span>
                        <input value="${w.damage || w.damage_dice || ''}" placeholder="1d6"
                            onchange="updateWeapon(${char.id}, ${w.id || w.weapon_id}, 'damage', this.value)"
                            style="width:50px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input value="${w.damage_type || ''}" placeholder="类型"
                            onchange="updateWeapon(${char.id}, ${w.id || w.weapon_id}, 'damage_type', this.value)"
                            style="width:45px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <button class="btn btn-small btn-danger" onclick="removeWeapon(${char.id}, ${w.id || w.weapon_id}, '${(w.name || '').replace(/'/g, "\\'")}')" style="padding:0.15rem 0.4rem;font-size:0.7rem;">✕</button>
                    </div>
                    ${w.description ? `<input value="${w.description}" placeholder="描述" onchange="updateWeapon(${char.id}, ${w.id||w.weapon_id}, 'description', this.value)" style="width:100%;padding:0.15rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.7rem;margin-top:2px;">` : ''}
                    ${w.effect ? `<input value="${w.effect}" placeholder="效果" onchange="updateWeapon(${char.id}, ${w.id||w.weapon_id}, 'effect', this.value)" style="width:100%;padding:0.15rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.7rem;margin-top:2px;">` : ''}
                `).join('');
            } else {
                weaponHtml = '<div class="detail-row" style="color:var(--text-dim);">暂无武器</div>';
            }
            if (armor && (armor.name || armor.armor_name)) {
                weaponHtml += `<div class="detail-row"><span class="detail-label">🛡️ ${armor.name || armor.armor_name || '护甲'}</span>
                    <span class="detail-val">AC ${armor.ac || armor.armor_class || '?'} | ${armor.type || armor.armor_type || ''}</span></div>`;
            }
            // 添加武器表单
            weaponHtml += `
                <div class="detail-row" style="margin-top:0.5rem;border-top:1px solid var(--border);padding-top:0.5rem;">
                    <div style="display:flex;gap:0.3rem;flex-wrap:wrap;width:100%;align-items:center;">
                        <input id="new-weapon-name-${char.id}" placeholder="武器名" style="width:80px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input id="new-weapon-atk-${char.id}" placeholder="命中" value="0" style="width:45px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input id="new-weapon-dmg-${char.id}" placeholder="伤害" value="1d6" style="width:50px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input id="new-weapon-type-${char.id}" placeholder="类型" value="挥砍" style="width:50px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <button class="btn btn-small btn-success" onclick="addWeapon(${char.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;">+添加</button>
                    </div>
                </div>`;

            // ━━ 背包物品 ━━
            const inventory = char.inventory || [];
            let invHtml = '';
            if (inventory.length > 0) {
                invHtml = inventory.map(item => {
                    const iname = item.item_name || item.name || '?';
                    const qty = item.quantity || 1;
                    const iid = item.id;
                    const loc = item.location || '背包';
                    const wt = item.weight || '';
                    const desc = item.description || '';
                    const eff = item.effect || '';
                    return `<div class="detail-row" style="display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap;">
                            <input value="${iname}" placeholder="物品名"
                                onchange="updateItem(${char.id}, ${iid}, 'item_name', this.value)"
                                style="flex:1;min-width:60px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                            <input value="${loc}" placeholder="位置"
                                onchange="updateItem(${char.id}, ${iid}, 'location', this.value)"
                                style="width:50px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                            <span style="font-size:0.7rem;color:var(--text-dim);">x</span>
                            <input value="${qty}" type="number" placeholder="数量"
                                onchange="updateItem(${char.id}, ${iid}, 'quantity', parseInt(this.value)||1)"
                                style="width:40px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                            <span style="font-size:0.7rem;color:var(--text-dim);">${wt ? wt+'磅' : ''}</span>
                            <button class="btn btn-small btn-danger" onclick="removeItem(${char.id}, ${iid}, '${iname.replace(/'/g, "\\'")}')" style="padding:0.15rem 0.35rem;font-size:0.65rem;">✕</button>
                        </div>
                        <input value="${desc||''}" placeholder="描述（可选）"
                            onchange="updateItem(${char.id}, ${iid}, 'description', this.value)"
                            style="width:100%;padding:0.15rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.7rem;">
                        <input value="${eff||''}" placeholder="效果（可选）"
                            onchange="updateItem(${char.id}, ${iid}, 'effect', this.value)"
                            style="width:100%;padding:0.15rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--gold);font-size:0.7rem;">
                    </div>`;
                }).join('');
            } else {
                invHtml = '<div class="detail-row" style="color:var(--text-dim);">暂无物品</div>';
            }
            // 添加物品表单 + 合并按钮
            invHtml += `
                <div class="detail-row" style="margin-top:0.5rem;border-top:1px solid var(--border);padding-top:0.5rem;">
                    <div style="display:flex;gap:0.3rem;flex-wrap:wrap;width:100%;align-items:center;">
                        <input id="new-item-name-${char.id}" placeholder="物品名" style="flex:1;min-width:70px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input id="new-item-qty-${char.id}" placeholder="数量" value="1" style="width:40px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <input id="new-item-loc-${char.id}" placeholder="位置" value="背包" style="width:50px;padding:0.25rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <button class="btn btn-small btn-success" onclick="addItem(${char.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;">+添加</button>
                        ${inventory.length > 1 ? `<button class="btn btn-small" onclick="stackInventory(${char.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;background:var(--surface2);color:var(--text);">合并</button>` : ''}
                    </div>
                </div>`;

            // ━━ 钱币 ━━
            const coins = char.coins || {};
            const coinNames = {cp:'铜币', sp:'银币', ep:'金银币', gp:'金币', pp:'白金币'};
            const coinOrder = ['cp','sp','ep','gp','pp'];
            const coinEntries = coinOrder.filter(k => coins[k] !== null && coins[k] !== undefined);
            let coinHtml = '';
            if (coinEntries.length > 0) {
                coinHtml = coinEntries.map(k => {
                    const v = coins[k] || 0;
                    return `<div style="display:inline-flex;align-items:center;gap:0.15rem;margin-right:0.5rem;margin-bottom:0.2rem;">
                        <span class="coin-badge">${coinNames[k]}: <b>${v}</b></span>
                        <button class="btn btn-small" onclick="adjCoin(${char.id}, '${k}', 1)" style="padding:0.05rem 0.3rem;font-size:0.65rem;background:var(--surface2);line-height:1;" title="+1">+</button>
                        <button class="btn btn-small" onclick="adjCoin(${char.id}, '${k}', -1)" style="padding:0.05rem 0.3rem;font-size:0.65rem;background:var(--surface2);line-height:1;" title="-1">−</button>
                    </div>`;
                }).join('');
            }
            if (!coinHtml) coinHtml = '<span style="color:var(--text-dim);">暂无钱币</span>';
            // 自定义金额调整
            coinHtml += `
                <div style="margin-top:0.4rem;display:flex;gap:0.3rem;align-items:center;">
                    <select id="coin-type-${char.id}" style="padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                        <option value="cp">铜币 CP</option><option value="sp">银币 SP</option>
                        <option value="ep">金银币 EP</option><option value="gp" selected>金币 GP</option>
                        <option value="pp">白金币 PP</option>
                    </select>
                    <input id="coin-amount-${char.id}" type="number" placeholder="±数量" style="width:55px;padding:0.2rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:0.75rem;">
                    <button class="btn btn-small btn-success" onclick="adjCoinInput(${char.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;">调整</button>
                </div>`;

            // ━━ 已准备法术 ━━
            const preparedSpells = char.prepared_spells || [];
            let spellsHtml = '';
            if (preparedSpells.length > 0) {
                spellsHtml = preparedSpells.map(s => {
                    const sname = s.spell_name || s.name || '?';
                    const slevel = s.spell_level || 0;
                    const lvlLabel = slevel > 0 ? `${slevel}环` : '戏法';
                    return `<span class="skill-tag proficient">${sname}<small> [${lvlLabel}]</small></span>`;
                }).join('');
            } else {
                spellsHtml = '<span style="color:var(--text-dim);">暂无已准备法术</span>';
            }

            // ━━ 法术位（1-9环 x/y格式）━━
            const spellSlots = char.spell_slots || {};
            let slotsHtml = '<div class="spell-slot-grid">';
            for (let i = 1; i <= 9; i++) {
                const info = spellSlots[i] || spellSlots[String(i)] || {max: 0, used: 0};
                const max = info.max || 0;
                const used = info.used || 0;
                slotsHtml += `<div class="spell-slot-item">
                    <span style="width:32px;color:var(--text-dim);">${i}环:</span>
                    <input id="spell-slot-used-${i}" type="number" min="0" max="${max}" value="${used}"
                           onchange="var mx=parseInt(document.getElementById('spell-slot-max-${i}').value)||0;var v=parseInt(this.value)||0;if(v>mx)this.value=mx;if(v<0)this.value=0;"
                           style="width:28px;">
                    <span style="color:var(--text-dim);">/</span>
                    <input id="spell-slot-max-${i}" type="number" min="0" value="${max}"
                           onchange="var v=parseInt(this.value)||0;if(v<0)this.value=0;var u=parseInt(document.getElementById('spell-slot-used-${i}').value)||0;if(u>v)document.getElementById('spell-slot-used-${i}').value=v;"
                           style="width:28px;">
                </div>`;
            }
            slotsHtml += '</div>';
            slotsHtml += `<button class="btn btn-small btn-primary" onclick="saveSpellSlots(${char.id})" style="margin-top:0.4rem;width:100%;">💾 保存法术位</button>`;

            // ━━ 背景信息（可编辑）━━
            const bg = char.background || {};
            const bgFields = [
                {key:'personality_traits', label:'个性'},
                {key:'personality_traits_ext', label:'个性(补充)'},
                {key:'ideals', label:'理念'},
                {key:'bonds', label:'羁绊'},
                {key:'flaws', label:'缺陷'},
                {key:'background_feature', label:'背景特性'},
                {key:'appearance', label:'外貌'},
                {key:'origin', label:'出身'},
                {key:'languages', label:'语言'},
                {key:'tool_proficiencies', label:'熟练工具'},
                {key:'backstory', label:'背景故事'},
            ];
            const longFields = ['backstory', 'appearance', 'personality_traits', 'personality_traits_ext',
                               'ideals', 'bonds', 'flaws', 'background_feature'];
            let bgHtml = bgFields.map(f => {
                const val = bg[f.key] || '';
                const isLong = longFields.includes(f.key);
                return `<div class="bg-edit-row">
                    <div class="bg-edit-label">📝 ${f.label}</div>
                    ${isLong
                        ? `<textarea class="bg-edit-input bg-textarea" id="bg-${f.key}-${char.id}" rows="${Math.max(2, Math.min(6, (val.match(/\n/g)||[]).length + 1))}">${val}</textarea>`
                        : `<input class="bg-edit-input" id="bg-${f.key}-${char.id}" value="${val.replace(/"/g, '&quot;')}">`
                    }
                </div>`;
            }).join('');
            bgHtml += `<button class="btn btn-primary btn-small" onclick="saveBackground(${char.id})" style="margin-top:0.5rem;width:100%;">💾 保存背景</button>`;

            // ━━ 豁免熟练 ━━
            const saveProfs = char.save_proficiencies || {};
            const saveAbbr = ['力量','敏捷','体质','智力','感知','魅力'];
            const saveTags = saveAbbr.map(s => {
                const akey = {力量:'str',敏捷:'dex',体质:'con',智力:'int',感知:'wis',魅力:'cha'}[s];
                // API 返回的 save_proficiencies 键为英文（str/dex/...），兼容旧中文键数据
                const prof = saveProfs[akey] || saveProfs[s] || {};
                const isProf = prof.is_proficient;
                const rawBonus = prof.save_bonus || 0;
                const amod = mods[akey] || 0;
                // 熟练豁免显示存储总值（含熟练），未熟练显示属性修正
                const totalBonus = isProf ? rawBonus : amod;
                const toggleTitle = `点击切换豁免熟练 (当前: ${isProf?'熟练':'非熟练'})`;
                return `<span class="skill-tag${isProf ? ' proficient' : ''}" title="${toggleTitle}" style="cursor:pointer;display:inline-flex;align-items:center;gap:0.15rem;">
                    <span onclick="toggleSaveProf(${char.id}, '${s}', ${!isProf})">${s}</span>
                    <span class="editable-field" onclick="event.stopPropagation();editSaveBonus(${char.id}, '${s}', ${rawBonus}, ${isProf||false})" title="点击修改加值(当前额外加值:${rawBonus>=0?'+':''}${rawBonus})" style="font-size:0.75rem;">${totalBonus>=0?'+':''}${totalBonus}</span>
                </span>`;
            }).join('');

            // ━━ 组装完整HTML ━━
            const hpPct = char.hp_max ? Math.round(char.hp_current / char.hp_max * 100) : 100;
            const portraitUrl = `/api/character/${char.id}/portrait`;

            // 基础信息行
            const metaParts = [];
            if (char.alignment) metaParts.push(`🏷️ ${char.alignment}`);
            if (char.faith) metaParts.push(`🙏 ${char.faith}`);
            if (char.gender) metaParts.push(`👤 ${char.gender}`);
            if (char.subrace) metaParts.push(`🧬 ${char.subrace}`);
            if (char.age) metaParts.push(`🎂 ${char.age}岁`);
            if (char.player) metaParts.push(`🎮 ${char.player}`);
            const metaLine = metaParts.length > 0 ? `<div style="color:var(--text-dim);font-size:0.8rem;margin-bottom:0.3rem;">${metaParts.join(' | ')}</div>` : '';

            // 基础信息编辑行
            const editMetaFields = [
                {label:'阵营', field:'alignment', val:char.alignment || '', type:'text'},
                {label:'信仰', field:'faith', val:char.faith || '', type:'text'},
                {label:'性别', field:'gender', val:char.gender || '', type:'text'},
                {label:'亚种', field:'subrace', val:char.subrace || char.subrace || '', type:'text'},
            ];
            const metaEditLine = `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.3rem;font-size:0.72rem;">
                ${editMetaFields.map(f => `
                <span style="background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:0.1rem 0.3rem;">
                    <span style="color:var(--text-dim);">${f.label}:</span>
                    <span class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, '${f.field}')" data-val="${(f.val||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" title="点击修改${f.label}">${f.val || '-'}</span>
                </span>
                `).join('')}
            </div>`;

            el.innerHTML = `
                <div class="card-header">📋 <span class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'name')" data-val="${(char.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改角色名">${char.name}</span> — <span class="editable-field" onclick="editCharField(${char.id}, 'level', ${char.level || 1})" title="点击修改等级">${char.level || 1}级</span> <span class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'class')" data-val="${(char.class || '未知').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改职业">${char.class || '未知'}</span> ${char.race || ''}</div>

                <div class="char-detail-grid">
                    <!-- 左：头像+基础 -->
                    <div class="char-detail-left">
                        <div class="portrait-container">
                            <img src="${portraitUrl}" alt="${char.name}头像"
                                 class="char-portrait"
                                 onerror="this.style.display='none'">
                        </div>
                        ${metaLine}
                        ${metaEditLine}
                        <!-- HP x/y + 临时HP + 关键属性 -->
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
                            <span style="font-size:0.85rem;color:var(--text-dim);">❤️</span>
                            <span class="editable-field" onclick="editCharField(${char.id}, 'hp_current', ${char.hp_current || 0})" title="点击修改当前HP" style="font-size:1.1rem;font-weight:bold;color:var(--accent);">${char.hp_current || 0}</span>
                            <span style="font-size:1.1rem;color:var(--text-dim);">/</span>
                            <span class="editable-field" onclick="editCharField(${char.id}, 'hp_max', ${char.hp_max || 10})" title="点击修改HP上限" style="font-size:1.1rem;font-weight:bold;color:var(--green);">${char.hp_max || 10}</span>
                            <span style="font-size:0.75rem;color:var(--text-dim);">HP</span>
                            <span style="font-size:0.8rem;color:var(--cyan);">💙 <span class="editable-field" onclick="editCharField(${char.id}, 'temp_hp', ${char.temp_hp || 0})" title="点击修改临时HP">${char.temp_hp || 0}</span></span>
                        </div>
                        <!-- 死亡豁免 -->
                        ${(() => {
                            const ds = char.death_saves || {};
                            return `<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:0.4rem;">
                                💀 死亡豁免: 成功 <b style="color:var(--green);">${ds.successes || 0}/3</b> | 失败 <b style="color:var(--red);">${ds.failures || 0}/3</b>
                                ${ds.is_stable ? ' <span style=\"color:var(--cyan);\">[稳定]</span>' : ''}
                            </div>`;
                        })()}
                        <!-- 关键属性 -->
                        <div style="font-size:0.72rem;margin-bottom:0.4rem;">
                            <span style="color:var(--text-dim);">🎯 关键属性: </span>
                            <span class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'key_abilities')" data-val="${(char.key_abilities || char.spellcasting_ability || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改关键属性" style="color:var(--gold);">${char.key_abilities || char.spellcasting_ability || '-'}</span>
                        </div>
                        <!-- 抗性 -->
                        <div style="font-size:0.72rem;margin-bottom:0.4rem;">
                            <span style="color:var(--text-dim);">🛡️ 抗性: </span>
                            <span class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'resistances')" data-val="${(char.resistances || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改抗性（用逗号分隔）" style="color:var(--text);">${char.resistances || '无'}</span>
                        </div>
                        <div class="char-quick-stats">
                            <span>🛡️ AC: <b class="editable-field" onclick="editCharField(${char.id}, 'ac', ${char.ac || 10})" title="点击修改">${char.ac || 10}</b></span>
                            <span>🏃 速度: <b class="editable-field" onclick="editCharField(${char.id}, 'speed', ${char.speed || 30})" title="点击修改">${char.speed || 30}尺</b></span>
                            <span>⭐ 熟练: <b class="editable-field" onclick="editCharField(${char.id}, 'proficiency_bonus', ${char.proficiency_bonus || 2})" title="点击修改">+${char.proficiency_bonus || 2}</b></span>
                        </div>
                        <div class="char-quick-stats" style="margin-top:0.2rem;">
                            <span>📏 身高: <b class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'height')" data-val="${(char.height || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改">${char.height || '?'}</b></span>
                            <span>⚖️ 体重: <b class="editable-field" onclick="editTextFieldFromData(this, ${char.id}, 'weight_field')" data-val="${(char.weight_field || char.weight || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" title="点击修改">${char.weight_field || char.weight || '?'}</b></span>
                            <span>👁️ 被动察觉: <b class="editable-field" onclick="editCharField(${char.id}, 'passive_perception', ${char.passive_perception || 10})" title="点击修改">${char.passive_perception || 10}</b></span>
                        </div>
                        <div class="char-quick-stats" style="margin-top:0.2rem;">
                            <span>🔮 法术DC: <b class="editable-field" onclick="editCharField(${char.id}, 'spell_save_dc', ${char.spell_save_dc || 10})" title="点击修改">${char.spell_save_dc || 10}</b></span>
                            <span>🎯 法术命中: <b class="editable-field" onclick="editCharField(${char.id}, 'spell_attack_bonus', ${char.spell_attack_bonus || 0})" title="点击修改">+${char.spell_attack_bonus || 0}</b></span>
                        </div>

                        <div class="ability-grid" style="margin-top:0.6rem;">${abilityHtml}</div>

                        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
                            <button class="btn btn-small btn-success" onclick="adjustHpModal(${char.id})">❤️ 调整HP</button>
                            <button class="btn btn-small btn-primary" onclick="charLongRest('${char.name}')">🛌 长休</button>
                            <button class="btn btn-small btn-danger" onclick="deleteCharModal(${char.id}, '${char.name.replace(/'/g, "\\'")}')">🗑 删除</button>
                        </div>

                        <div class="portrait-actions" style="margin-top:0.75rem;">
                            <div style="display:flex;gap:0.5rem;align-items:center;">
                                <input type="file" id="portrait-file-input" accept="image/*" onchange="uploadPortrait(${char.id})" style="flex:1;padding:0.3rem;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:0.8rem;">
                                <button class="btn btn-small btn-danger" onclick="clearPortrait(${char.id})">清除</button>
                            </div>
                        </div>
                    </div>

                    <!-- 右：详细信息 -->
                    <div class="char-detail-right">
                        <details class="char-section" open>
                            <summary class="char-section-header">🎯 技能熟练 & 豁免</summary>
                            <div class="char-section-body">
                                <div class="detail-label-sm">技能</div>
                                <div class="skill-tag-cloud">${skillHtml}</div>
                                <div class="detail-label-sm" style="margin-top:0.5rem;">豁免</div>
                                <div class="skill-tag-cloud">${saveTags}</div>
                            </div>
                        </details>

                        <details class="char-section">
                            <summary class="char-section-header">⚔️ 武器装备</summary>
                            <div class="char-section-body">${weaponHtml}</div>
                        </details>

                        <details class="char-section">
                            <summary class="char-section-header">🎒 背包物品 & 钱币</summary>
                            <div class="char-section-body">
                                <div class="detail-label-sm">💰 钱币</div>
                                <div style="margin-bottom:0.5rem;">${coinHtml}</div>
                                <div class="detail-label-sm">📦 物品 (${inventory.length}件)</div>
                                ${invHtml}
                            </div>
                        </details>

                        <details class="char-section">
                            <summary class="char-section-header">📖 法术 (${preparedSpells.length}个)</summary>
                            <div class="char-section-body">
                                <div class="detail-label-sm">✨ 法术位</div>
                                <div style="margin-bottom:0.5rem;">${slotsHtml}</div>
                                <div class="detail-label-sm">📜 已准备法术</div>
                                <div class="skill-tag-cloud">${spellsHtml}</div>
                            </div>
                        </details>

                        <details class="char-section">
                            <summary class="char-section-header">📝 背景信息</summary>
                            <div class="char-section-body">${bgHtml}</div>
                        </details>

                        ${renderFeatureSection(char, 'class_feature', '🎯 职业能力')}
                        ${renderFeatureSection(char, 'feat', '⭐ 专长')}
                        ${renderFeatureSection(char, 'racial_trait', '🧬 种族特性')}
                        ${renderFeatureSection(char, 'special_ability', '✨ 特殊能力')}
                        ${renderFeatureSection(char, 'other', '📋 其他特性')}
                    </div>
                </div>
            `;
        }

        // 缓存特性数据，避免重复生成HTML
        let _featureCache = {};

        function renderFeatureSection(char, category, title) {
            const features = (char.features && char.features[category]) || [];
            const catId = category.replace(/_/g, '-');
            const cacheKey = `${char.id}-${category}`;
            // 缓存特性数据
            _featureCache[cacheKey] = { features, charId: char.id, category, catId, title };
            // 渲染最小HTML（仅标题和占位）
            return `<details class="char-section" data-feature-key="${cacheKey}" ontoggle="loadFeatureContent(this)">
                <summary class="char-section-header">${title} (${features.length})</summary>
                <div class="char-section-body" data-loaded="0">
                    <div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:0.3rem;">展开查看...</div>
                </div>
            </details>`;
        }

        function loadFeatureContent(detailsEl) {
            if (!detailsEl.open) return; // 只处理展开
            const body = detailsEl.querySelector('.char-section-body');
            if (!body || body.getAttribute('data-loaded') === '1') return;
            body.setAttribute('data-loaded', '1');

            const cacheKey = detailsEl.getAttribute('data-feature-key');
            const cached = _featureCache[cacheKey];
            if (!cached) return;

            const { features, charId, category, catId } = cached;
            if (features.length > 0) {
                body.innerHTML = features.map(f => `
                    <div style="display:flex;align-items:flex-start;gap:0.3rem;margin-bottom:0.25rem;padding:0.3rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:bold;color:var(--gold);font-size:0.8rem;cursor:pointer;"
                                 onclick="editFeatureName(${charId}, ${f.id}, this.getAttribute('data-val'))"
                                 data-val="${(f.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"
                                 title="点击修改名称">${f.name}</div>
                            <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.15rem;cursor:pointer;min-height:0.5rem;word-break:break-all;"
                                 onclick="editFeatureDesc(${charId}, ${f.id}, this.getAttribute('data-val'))"
                                 data-val="${(f.description || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"
                                 title="点击修改描述">${f.description || '<span style="color:var(--text-dim);font-style:italic;">点击添加描述...</span>'}</div>
                        </div>
                        <button class="btn btn-small btn-danger" onclick="deleteFeature(${charId}, ${f.id}, '${catId}')" style="padding:0.1rem 0.3rem;font-size:0.65rem;flex-shrink:0;" title="删除">✕</button>
                    </div>
                `).join('');
            } else {
                body.innerHTML = '<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:0.3rem;">暂无</div>';
            }
            body.innerHTML += `<button class="btn btn-small btn-success" onclick="addFeature(${charId}, '${category}', '${catId}')" style="margin-top:0.3rem;width:100%;">+ 添加</button>`;
        }

        // 特性增删后刷新对应区域
        function refreshFeatureSection(charId, category) {
            const cacheKey = `${charId}-${category}`;
            const detailsEl = document.querySelector(`details[data-feature-key="${cacheKey}"]`);
            if (detailsEl && detailsEl.open) {
                const body = detailsEl.querySelector('.char-section-body');
                if (body) body.setAttribute('data-loaded', '0');
                loadFeatureContent(detailsEl);
            }
        }

        // 兼容旧调用
        function lazyLoadFeatures(detailsEl, charId, category, catId, title) {}

        async function adjustHpModal(charId) {
            if (!currentChar) return;
            const currentHp = currentChar.hp_current || 0;
            const maxHp = currentChar.hp_max || 10;
            const input = prompt(`设置HP (当前: ${currentHp}/${maxHp}, 范围 0-${maxHp}):`, currentHp);
            if (input === null) return;

            const newHp = parseInt(input);
            if (isNaN(newHp) || newHp < 0 || newHp > maxHp) {
                alert(`HP必须在 0 到 ${maxHp} 之间`);
                return;
            }

            const resp = await fetch(`/api/character/${charId}/hp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({amount: newHp, setAbsolute: true})
            });

            const data = await resp.json();
            if (data.error) { alert(data.error); return; }
            if (currentChar && currentChar.id === charId) {
                selectChar(charId);
            }
        }

        async function charLongRest(name) {
            const resp = await fetch(`/api/character/${name}/longrest`, {method:'POST'});
            const data = await resp.json();
            if (data.error) { alert(data.error); return; }
            alert('长休完成！HP和法术位已恢复。');
            if (currentChar) selectChar(currentChar.id);
        }

        async function deleteCharModal(id, name) {
            if (!confirm(`确认删除角色 "${name}"？\n此操作不可撤销，将永久删除该角色及其所有数据。`)) return;

            // 记录滚动位置：删除后重渲染保持当前位置不回顶
            const savedScroll = window.scrollY;
            try {
                const resp = await fetch(`/api/character/${id}`, { method: 'DELETE' });
                const data = await resp.json();
                if (data.error) { alert('删除失败: ' + data.error); return; }
                alert(`已删除角色: ${data.name}`);
                currentChar = null;
                await loadCharList();
                document.getElementById('char-detail').innerHTML = `
                    <div class="card-header">📋 角色详情</div>
                    <div style="color:var(--text-dim);text-align:center;padding:2rem;">
                        请创建或选择一个角色
                    </div>`;
                if (window.scrollY === 0 && savedScroll > 0) window.scrollTo(0, savedScroll);
            } catch(e) {
                alert('删除失败: ' + e.message);
            }
        }

        async function saveBackground(charId) {
            const bgFields = ['personality_traits','personality_traits_ext','ideals','bonds','flaws',
                             'background_feature','appearance','origin','languages','tool_proficiencies','backstory'];
            const bg = {};
            for (const key of bgFields) {
                const el = document.getElementById(`bg-${key}-${charId}`);
                if (el) bg[key] = el.value;
            }
            const resp = await fetch(`/api/character/${charId}/background`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(bg)
            });
            const data = await resp.json();
            if (data.error) { alert(data.error); return; }
            alert('✅ 背景信息已保存');
        }

        async function uploadPortrait(charId) {
            const fileInput = document.getElementById('portrait-file-input');
            const file = fileInput.files[0];
            if (!file) { alert('请选择图片文件'); return; }

            const formData = new FormData();
            formData.append('file', file);

            const resp = await fetch(`/api/character/${charId}/portrait/upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await resp.json();
            if (data.error) { alert(data.error); return; }

            // 成功：刷新头像图片
            const img = document.querySelector('.char-portrait');
            if (img) {
                img.src = `/api/character/${charId}/portrait`;
                img.style.display = '';
            }
            // 同步更新角色列表中的缩略图
            const thumbs = document.querySelectorAll(`#char-list img[src*=\"/api/character/${charId}/portrait\"]`);
            thumbs.forEach(t => { t.src = `/api/character/${charId}/portrait`; t.style.display = ''; });
            alert('✅ 头像已上传');
        }

        async function clearPortrait(charId) {
            if (!confirm('确认清除头像？')) return;
            const resp = await fetch(`/api/character/${charId}/portrait`, {method: 'DELETE'});
            const data = await resp.json();
            if (data.error) { alert(data.error); return; }
            // 隐藏头像图片，清空输入框
            const img = document.querySelector('.char-portrait');
            if (img) img.style.display = 'none';
            const input = document.getElementById('portrait-path-input');
            if (input) input.value = '';
        }

        // ━━━ 怪物搜索（参考界面风格）━━━
        let monsterSearchResults = [];

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

                // 1. 先尝试精确匹配
                const resp = await fetch(`/api/monster/${encodeURIComponent(query)}`);
                const data = await resp.json();
                if (!data.error) {
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
                <div class="monster-result-row" onclick="selectMonsterResult('${m.name.replace(/'/g, "\\'")}')">
                    <span style="font-weight:bold;color:var(--gold);">👹 ${m.name}</span>
                    <span style="font-size:0.8rem;color:var(--text-dim);">CR:${m.cr || '?'} | ${m.size || ''} ${m.type || ''}</span>
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

        async function selectMonsterResult(name) {
            document.getElementById('monster-search').value = name;
            const resultsEl = document.getElementById('search-results');
            resultsEl.innerHTML = '<div style="color:var(--cyan);font-size:0.85rem;padding:0.25rem;">加载详情...</div>';

            const resp = await fetch(`/api/monster/${encodeURIComponent(name)}`);
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
                    <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.35rem;">📚 ${monster.source || '未知'}</div>
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
                        created_by: identity.name || '',
                    })
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                alert(`✅ 角色 "${monster.name}" 已创建！\nHP: ${data.hp_current}/${data.hp_max} | AC: ${data.ac}`);
                loadCharList();
                selectChar(data.id);  // 获取完整角色数据
            } catch(e) {
                alert('创建失败: ' + e.message);
            }
        }

        // ━━━ 字段编辑 ━━━
        async function editCharField(charId, field, currentVal) {
            const labelMap = {hp_current:'当前HP', hp_max:'HP上限', ac:'AC', speed:'速度', proficiency_bonus:'熟练加值',
                              passive_perception:'被动察觉', level:'等级', spell_save_dc:'法术DC', spell_attack_bonus:'法术命中'};
            const label = labelMap[field] || field;
            const newVal = prompt(`修改 ${label} (当前: ${currentVal}):`, currentVal);
            if (newVal === null) return;
            const val = parseInt(newVal);
            if (isNaN(val)) { alert('请输入整数'); return; }

            // HP特殊处理：当前HP不得高于上限
            if (field === 'hp_current') {
                try {
                    const resp = await fetch(`/api/character/${charId}/hp`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({amount: val, setAbsolute: true})
                    });
                    const data = await resp.json();
                    if (data.error) { alert(data.error); return; }
                    selectChar(charId);
                } catch(e) { alert('修改失败: ' + e.message); }
                return;
            }

            try {
                const resp = await fetch(`/api/character/${charId}/field`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({field, value: val})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        // 通用文本字段编辑（通过data属性传值，避免转义问题）
        function editCharTextField(charId, field, currentVal) {
            const displayVal = currentVal || '';
            const newVal = prompt('修改 ' + field + ' (当前: ' + displayVal + '):', displayVal);
            if (newVal === null) return;
            fetch('/api/character/' + charId + '/field', {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({field: field, value: newVal})
            }).then(r => r.json()).then(data => {
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            }).catch(e => { alert('修改失败: ' + e.message); });
        }

        // 从data属性读取当前值再编辑
        function editTextFieldFromData(el, charId, field) {
            const currentVal = el.getAttribute('data-val') || '';
            editCharTextField(charId, field, currentVal);
        }

        // ━━━ 特性管理 ━━━
        async function addFeature(charId, category, catId) {
            const name = prompt('输入特性名称:');
            if (!name || !name.trim()) return;
            const desc = prompt('输入描述（可选）:', '') || '';
            try {
                const resp = await fetch(`/api/character/${charId}/features/${category}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name.trim(), description: desc})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                // 局部刷新：重新加载角色数据后刷新该区域
                const resp2 = await fetch(`/api/character/${charId}`);
                const char = await resp2.json();
                currentChar = char;
                const cacheKey = `${charId}-${category}`;
                _featureCache[cacheKey] = { features: (char.features && char.features[category]) || [], charId, category, catId, title: '' };
                refreshFeatureSection(charId, category);
                // 更新section标题中的计数
                updateFeatureCount(charId, category);
            } catch(e) { alert('添加失败: ' + e.message); }
        }

        async function deleteFeature(charId, featureId, catId) {
            if (!confirm('删除此特性？')) return;
            try {
                const resp = await fetch(`/api/character/${charId}/features/${featureId}`, { method: 'DELETE' });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                const category = catId.replace(/-/g, '_');
                const resp2 = await fetch(`/api/character/${charId}`);
                const char = await resp2.json();
                currentChar = char;
                const cacheKey = `${charId}-${category}`;
                _featureCache[cacheKey] = { features: (char.features && char.features[category]) || [], charId, category, catId, title: '' };
                refreshFeatureSection(charId, category);
                updateFeatureCount(charId, category);
            } catch(e) { alert('删除失败: ' + e.message); }
        }

        async function editFeatureName(charId, featureId, currentName) {
            const name = prompt('修改特性名称:', currentName);
            if (!name || !name.trim()) return;
            try {
                await fetch(`/api/character/${charId}/features/${featureId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name.trim()})
                });
                // 局部刷新：重新获取角色数据
                const resp2 = await fetch(`/api/character/${charId}`);
                const char = await resp2.json();
                currentChar = char;
                // 找到feature所属的category并刷新
                for (const cat of ['class_feature','feat','racial_trait','special_ability','other']) {
                    const feats = (char.features && char.features[cat]) || [];
                    if (feats.some(f => f.id === featureId)) {
                        const cacheKey = `${charId}-${cat}`;
                        _featureCache[cacheKey] = { features: feats, charId, category: cat, catId: cat.replace(/_/g,'-'), title: '' };
                        refreshFeatureSection(charId, cat);
                        break;
                    }
                }
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        async function editFeatureDesc(charId, featureId, currentDesc) {
            const desc = prompt('修改描述:', currentDesc || '');
            if (desc === null) return;
            try {
                await fetch(`/api/character/${charId}/features/${featureId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({description: desc})
                });
                const resp2 = await fetch(`/api/character/${charId}`);
                const char = await resp2.json();
                currentChar = char;
                for (const cat of ['class_feature','feat','racial_trait','special_ability','other']) {
                    const feats = (char.features && char.features[cat]) || [];
                    if (feats.some(f => f.id === featureId)) {
                        const cacheKey = `${charId}-${cat}`;
                        _featureCache[cacheKey] = { features: feats, charId, category: cat, catId: cat.replace(/_/g,'-'), title: '' };
                        refreshFeatureSection(charId, cat);
                        break;
                    }
                }
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        function updateFeatureCount(charId, category) {
            const cacheKey = `${charId}-${category}`;
            const detailsEl = document.querySelector(`details[data-feature-key="${cacheKey}"]`);
            if (detailsEl) {
                const summary = detailsEl.querySelector('.char-section-header');
                const cached = _featureCache[cacheKey];
                if (summary && cached) {
                    summary.textContent = summary.textContent.replace(/\(\d+\)/, `(${cached.features.length})`);
                }
            }
        }

        async function saveSpellSlots(charId) {
            const slots = {};
            for (let i = 1; i <= 9; i++) {
                const usedEl = document.getElementById(`spell-slot-used-${i}`);
                const maxEl = document.getElementById(`spell-slot-max-${i}`);
                const used = parseInt(usedEl?.value) || 0;
                const max = parseInt(maxEl?.value) || 0;
                slots[i] = {used: Math.min(used, max), max};
            }
            try {
                const resp = await fetch(`/api/character/${charId}/spell-slots`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({slots})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('保存失败: ' + e.message); }
        }

        // ━━━ 技能/豁免加值编辑 ━━━
        async function editSkillBonus(charId, skillName, currentBonus, isProf, isExp) {
            const input = prompt(`修改 "${skillName}" 额外加值 (当前: ${currentBonus>=0?'+':''}${currentBonus}):`, currentBonus);
            if (input === null) return;
            const bonus = parseInt(input) || 0;
            try {
                const resp = await fetch(`/api/character/${charId}/skill`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({skill: skillName, proficient: isProf || isExp, expertise: isExp, bonus})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        async function editSaveBonus(charId, abilityName, currentBonus, isProf) {
            const input = prompt(`修改 "${abilityName}" 豁免额外加值 (当前: ${currentBonus>=0?'+':''}${currentBonus}):`, currentBonus);
            if (input === null) return;
            const bonus = parseInt(input) || 0;
            try {
                const resp = await fetch(`/api/character/${charId}/save-prof`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ability: abilityName, proficient: isProf, save_bonus: bonus})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        // ━━━ 属性/技能/豁免交互 ━━━
        async function editAbility(charId, ability, currentScore) {
            const newScore = prompt(`修改属性值 (当前: ${currentScore}, 范围 1-30):`, currentScore);
            if (newScore === null) return;
            const score = parseInt(newScore);
            if (isNaN(score) || score < 1 || score > 30) { alert('属性值范围 1-30'); return; }

            try {
                const resp = await fetch(`/api/character/${charId}/ability`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ability, score})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('修改失败: ' + e.message); }
        }

        async function toggleSkill(charId, skillName, makeProficient) {
            // 保留现有加值和专精状态；切换时重算加值（熟练=修正+熟练，非熟练=修正）
            const profs = currentChar && currentChar.skill_proficiencies || {};
            const existing = profs[skillName] || {};
            const isExp = makeProficient && existing.is_expertise;
            const skAttr = {运动:'str',特技:'dex',巧手:'dex',隐匿:'dex',调查:'int',奥秘:'int',
                           历史:'int',自然:'wis',宗教:'int',察觉:'wis',洞悉:'wis',驯兽:'wis',
                           医药:'wis',求生:'wis',游说:'cha',欺瞒:'cha',威吓:'cha',表演:'cha'};
            const amod = (currentChar.ability_mods || {})[skAttr[skillName]] || 0;
            const profB = currentChar.proficiency_bonus || 2;
            let bonus = existing.bonus || 0;
            if (makeProficient && !existing.is_proficient) {
                bonus = amod + (isExp ? profB * 2 : profB);  // 新熟练：总值
            } else if (!makeProficient && existing.is_proficient) {
                bonus = amod;  // 取消熟练：仅修正
            }
            try {
                const resp = await fetch(`/api/character/${charId}/skill`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({skill: skillName, proficient: makeProficient, expertise: isExp, bonus: bonus})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('操作失败: ' + e.message); }
        }

        async function toggleSaveProf(charId, abilityName, makeProficient) {
            const profs = currentChar && currentChar.save_proficiencies || {};
            const akey = {力量:'str',敏捷:'dex',体质:'con',智力:'int',感知:'wis',魅力:'cha'}[abilityName] || abilityName;
            const existing = profs[akey] || profs[abilityName] || {};
            // 切换时重算加值（熟练=属性修正+熟练，非熟练=属性修正）
            const amod = (currentChar.ability_mods || {})[akey] || 0;
            const saveBonus = makeProficient ? (amod + (currentChar.proficiency_bonus || 2)) : amod;
            try {
                const resp = await fetch(`/api/character/${charId}/save-prof`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ability: akey, proficient: makeProficient, save_bonus: saveBonus})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('操作失败: ' + e.message); }
        }

        // ━━━ 武器装备管理 ━━━
        async function updateWeapon(charId, weaponId, field, value) {
            try {
                const resp = await fetch(`/api/character/${charId}/weapon/${weaponId}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({field, value})
                });
                if (!resp.ok) { const d = await resp.json(); if (d.error) { alert(d.error); selectChar(charId); } }
            } catch(e) { /* silent */ }
        }
        async function addWeapon(charId) {
            const name = document.getElementById(`new-weapon-name-${charId}`).value.trim();
            if (!name) { alert('请输入武器名'); return; }
            const atk = parseInt(document.getElementById(`new-weapon-atk-${charId}`).value) || 0;
            const dmg = document.getElementById(`new-weapon-dmg-${charId}`).value.trim() || '1d6';
            const dtype = document.getElementById(`new-weapon-type-${charId}`).value.trim() || '挥砍';

            try {
                const resp = await fetch(`/api/character/${charId}/weapon`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, attack_bonus: atk, damage: dmg, damage_type: dtype})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('添加失败: ' + e.message); }
        }

        async function removeWeapon(charId, weaponId, name) {
            if (!confirm(`确认删除武器 "${name}"？`)) return;
            try {
                const resp = await fetch(`/api/character/${charId}/weapon/${weaponId}`, { method: 'DELETE' });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('删除失败: ' + e.message); }
        }

        // ━━━ 物品管理 ━━━
        async function addItem(charId) {
            const name = document.getElementById(`new-item-name-${charId}`).value.trim();
            if (!name) { alert('请输入物品名'); return; }
            const qty = parseInt(document.getElementById(`new-item-qty-${charId}`).value) || 1;
            const loc = document.getElementById(`new-item-loc-${charId}`).value.trim() || '背包';

            try {
                const resp = await fetch(`/api/character/${charId}/item`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, quantity: qty, location: loc})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('添加失败: ' + e.message); }
        }

        async function updateItem(charId, itemId, field, value) {
            try {
                const resp = await fetch(`/api/character/${charId}/item/${itemId}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({field, value})
                });
                if (!resp.ok) { const d = await resp.json(); if (d.error) { alert(d.error); selectChar(charId); } }
            } catch(e) { /* silent */ }
        }
        async function adjItemQty(charId, itemId, newQty) {
            if (newQty < 0) return;
            try {
                const resp = await fetch(`/api/character/${charId}/item/${itemId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({quantity: newQty})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('更新失败: ' + e.message); }
        }

        async function removeItem(charId, itemId, name) {
            if (!confirm(`确认删除物品 "${name}"？`)) return;
            try {
                const resp = await fetch(`/api/character/${charId}/item/${itemId}`, { method: 'DELETE' });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('删除失败: ' + e.message); }
        }

        async function stackInventory(charId) {
            try {
                const resp = await fetch(`/api/character/${charId}/inventory/stack`, { method: 'POST' });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                alert(`已合并 ${data.merged} 个重复物品`);
                selectChar(charId);
            } catch(e) { alert('合并失败: ' + e.message); }
        }

        // ━━━ 钱币管理 ━━━
        async function adjCoin(charId, coinType, amount) {
            try {
                const resp = await fetch(`/api/character/${charId}/coin`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({coin_type: coinType, amount})
                });
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                selectChar(charId);
            } catch(e) { alert('调整失败: ' + e.message); }
        }

        async function adjCoinInput(charId) {
            const type = document.getElementById(`coin-type-${charId}`).value;
            const amount = parseInt(document.getElementById(`coin-amount-${charId}`).value) || 0;
            if (amount === 0) { alert('请输入调整金额（正数增加，负数减少）'); return; }
            await adjCoin(charId, type, amount);
        }

        // ━━━ 文件导入 ━━━
        async function handleCharFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const statusEl = document.getElementById('import-status');
            statusEl.innerHTML = '<span style="color:var(--cyan);">⏳ 导入中...</span>';

            try {
                const formData = new FormData();
                formData.append('file', file);
                const identity = getIdentity();
                if (identity.name) formData.append('created_by', identity.name);

                const resp = await fetch('/api/character/import', {
                    method: 'POST',
                    body: formData,
                });
                const data = await resp.json();

                if (data.error) {
                    statusEl.innerHTML = `<span style="color:var(--red);">❌ ${data.error}</span>`;
                    return;
                }

                statusEl.innerHTML = `<span style="color:var(--green);">✅ ${data.name} 导入成功！</span>`;
                loadCharList();
                selectChar(data.id);  // 获取完整角色数据

                // 3秒后清除状态
                setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
            } catch(e) {
                statusEl.innerHTML = `<span style="color:var(--red);">❌ 导入失败: ${e.message}</span>`;
            }

            // 清空文件选择器
            event.target.value = '';
        }

        // ━━━ 物品搜索 ━━━
        let itemSearchResults = [];

        async function doItemSearch() {
            const q = document.getElementById('item-search-input').value.trim();
            if (!q) return;
            const el = document.getElementById('item-search-results');
            el.innerHTML = '<div style="color:var(--cyan);text-align:center;padding:0.25rem;">搜索中...</div>';
            try {
                // 先查物品表
                const resp1 = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`);
                const data1 = await resp1.json();
                let results = (data1.results || []).slice(0, 30);

                // 无结果时回退到综合搜索（CHM + 项目文件）
                if (!results.length) {
                    const resp2 = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                    const data2 = await resp2.json();
                    results = (data2.results || []).map(r => ({
                        name: r.name, type: r.type,
                        detail: r.detail || '', price: '', damage: '', weight: '', item_type: r.type
                    })).slice(0, 30);
                }

                if (!results.length) { el.innerHTML = '<div style="color:var(--text-dim);text-align:center;">未找到</div>'; return; }
                itemSearchResults = results;
                el.innerHTML = results.map((r, i) => {
                    const isWpn = !!(r.damage && r.damage.trim());
                    const btnLabel = isWpn ? '⚔️武器' : '+背包';
                    return `
                    <div class="item-result-row" onclick="viewItemDetail(${i})">
                        <span style="font-weight:bold;color:var(--gold);">${isWpn ? '⚔️' : '📦'} ${r.name}</span>
                        <span style="display:flex;gap:0.2rem;">
                            ${currentChar ? '<button class="btn btn-success btn-small" onclick="event.stopPropagation();addItemToCharByIdx(' + i + ')" style="padding:0.1rem 0.35rem;font-size:0.6rem;">' + btnLabel + '</button>' : ''}
                        </span>
                    </div>`;
                }).join('');
            } catch(e) { el.innerHTML = `<div style="color:var(--red);">搜索失败</div>`; }
        }

        function viewItemDetail(index) {
            const item = itemSearchResults[index];
            if (!item) return;
            const idx = index;
            const isWpn = !!(item.damage && item.damage.trim());
            const btnLabel = isWpn ? '⚔️ 添加为武器' : '➕ 添加到背包';
            document.getElementById('item-detail').innerHTML =
                '<div style="background:var(--bg);border:1px solid var(--accent);border-radius:6px;padding:0.5rem;margin-top:0.3rem;font-size:0.8rem;">' +
                    '<div style="font-weight:bold;color:var(--accent);">' + (isWpn ? '⚔️ ' : '📦 ') + item.name + '</div>' +
                    (item.detail ? '<div style="color:var(--text-dim);margin-top:0.2rem;">' + item.detail + '</div>' : '') +
                    '<div style="margin-top:0.3rem;display:flex;gap:0.3rem;">' +
                        (currentChar ? '<button class="btn btn-success btn-small" onclick="addItemToCharByIdx(' + idx + ')">' + btnLabel + '</button>' : '<span style="color:var(--text-dim);font-size:0.7rem;">请先选择角色</span>') +
                        '<button class="btn btn-small" style="background:var(--surface2);color:var(--text);" onclick="document.getElementById(\'item-detail\').innerHTML=\'\'">关闭</button>' +
                    '</div>' +
                '</div>';
        }

        function addItemToCharByIdx(index) {
            const item = itemSearchResults[index];
            if (!item) return;
            addItemToChar(item);
        }

        async function addItemToChar(item) {
            if (!currentChar || !currentChar.id) { alert('请先选择一个角色'); return; }
            const itemName = item.name || item;
            // 判断是否为武器（有伤害字段）
            const isWeapon = !!(item.damage && item.damage.trim());

            try {
                if (isWeapon) {
                    // 根据角色属性自动计算攻击加值（力量+熟练）
                    const strScore = (currentChar.abilities && currentChar.abilities.str) || 10;
                    const strMod = Math.floor((strScore - 10) / 2);
                    const profBonus = currentChar.proficiency_bonus || 2;
                    const atkBonus = strMod + profBonus;
                    // 添加为武器
                    const resp = await fetch(`/api/character/${currentChar.id}/weapon`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            name: itemName,
                            attack_bonus: atkBonus,
                            damage: item.damage || '1d6',
                            damage_type: item.type || '挥砍',
                            description: item.detail || ''
                        })
                    });
                    if (!resp.ok) throw new Error((await resp.text()).substring(0, 100));
                    const data = await resp.json();
                    if (data.error) { alert(data.error); return; }
                    alert('✅ "' + itemName + '" 已添加到武器装备');
                    selectChar(currentChar.id);
                } else {
                    // 添加为背包物品
                    const resp = await fetch(`/api/character/${currentChar.id}/item`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: itemName, quantity: 1, location: '背包',
                            description: item.detail || '', weight: parseFloat(item.weight) || 0})
                    });
                    if (!resp.ok) throw new Error((await resp.text()).substring(0, 100));
                    const data = await resp.json();
                    if (data.error) { alert(data.error); return; }
                    alert('✅ "' + itemName + '" 已添加到背包');
                    selectChar(currentChar.id);
                }
            } catch(e) { alert('添加失败: ' + e.message); }
        }

        // 初始加载
        loadCharList();
