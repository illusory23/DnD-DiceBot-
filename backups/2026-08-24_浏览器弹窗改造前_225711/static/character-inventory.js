/* ━━━ 角色卡 · 武器/物品/钱币模块 ━━━
 * 从 character.js 拆分（2026-08-17）
 * 武器/物品/钱币编辑 + 物品搜索；顶层函数，全局可见
 */

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
