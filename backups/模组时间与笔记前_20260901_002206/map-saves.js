/* ━━━ 战术地图 · 存档槽与地图存档模块 ━━━
 * 从 map.js 拆分（2026-08-16 二次治理）
 * 必须在 map.js 之前加载（boot 启动时调用 renderSaveMenu 等）
 * 引用 map.js 顶部的状态变量（STORAGE_KEY/DB_NAME/collectState 等）
 */
        // ━━━ 存档槽系统 ━━━
        const SLOTS_KEY = 'dnd_map_slots';
        let currentSaveId = null;
        let currentSaveName = null;

        function getSlotRegistry() {
            try {
                const raw = localStorage.getItem(SLOTS_KEY);
                if (!raw) return { slots: [], activeSlotId: null };
                return JSON.parse(raw);
            } catch(e) { return { slots: [], activeSlotId: null }; }
        }

        function saveSlotRegistry(reg) {
            try { localStorage.setItem(SLOTS_KEY, JSON.stringify(reg)); } catch(e) {}
        }

        function getSlotStorageKey(slotId) {
            return 'dnd_map_state_' + slotId;
        }

        function setActiveSave(id, name) {
            currentSaveId = id;
            currentSaveName = name || null;
            const badge = document.getElementById('save-name-badge');
            const btn = document.getElementById('save-btn');
            if (id && name) {
                badge.textContent = name;
                badge.style.color = 'var(--green)';
                btn.classList.add('has-active');
            } else {
                badge.textContent = '存档';
                badge.style.color = '';
                btn.classList.remove('has-active');
            }
        }

        async function confirmSwitchSave(slotId, name) {
            if (await showConfirmDialog(`确定切换到存档 "${name}" 吗？\n\n⚠ 当前未保存的修改将会丢失。建议先点击 💾 保存。`)) {
                loadMapSave(slotId);
            }
        }

        async function confirmOverwriteSave(slotId, name) {
            if (!await showConfirmDialog(`确定将当前地图保存到 "${name}" 吗？\n\n此操作将覆盖该存档的原有内容。`)) return;

            var state = collectState();
            state._slotName = name;
            const ok = await dbSetAndWait(getSlotStorageKey(slotId), state);
            if (!ok) {
                alert(`❌ 保存失败：无法写入数据库。`);
                return;
            }
            // 更新索引中的时间戳
            const reg = getSlotRegistry();
            const slot = reg.slots.find(s => s.id === slotId);
            if (slot) slot.timestamp = Date.now();
            saveSlotRegistry(reg);
            // 同步更新自动保存兜底
            dbSetSync(STORAGE_KEY, state);
            document.getElementById('save-dropdown-menu').classList.remove('show');
        }

        function renderSaveMenu() {
            const reg = getSlotRegistry();
            const listEl = document.getElementById('save-list-items');

            // 同步当前激活状态
            if (reg.activeSlotId) {
                const activeSlot = reg.slots.find(s => s.id === reg.activeSlotId);
                setActiveSave(reg.activeSlotId, activeSlot ? activeSlot.name : null);
            } else {
                setActiveSave(null, null);
            }

            if (!reg.slots.length) {
                listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.3rem 0.75rem;">（暂无存档）</div>';
                return;
            }

            listEl.innerHTML = reg.slots.map(s => {
                const isActive = s.id === reg.activeSlotId;
                const dateStr = new Date(s.timestamp).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
                return `
                <div class="save-entry${isActive ? ' active' : ''}">
                    <span class="save-name" title="${s.name} — ${dateStr}">
                        ${isActive ? '<span class="active-dot">●</span>' : ''}${s.name}
                    </span>
                    <span style="font-size:0.6rem;color:var(--text-dim);flex-shrink:0;" title="${new Date(s.timestamp).toLocaleString('zh-CN')}">${dateStr}</span>
                    ${isActive
                        ? '<span style="font-size:0.65rem;color:var(--green);flex-shrink:0;padding:0.1rem 0.35rem;">当前</span>'
                        : `<button class="save-action switch" onclick="event.stopPropagation();confirmSwitchSave('${s.id}','${s.name.replace(/'/g,"\\'")}')" title="切换到此存档">🔄</button>`
                    }
                    <button class="save-action save-overwrite" onclick="event.stopPropagation();confirmOverwriteSave('${s.id}','${s.name.replace(/'/g,"\\'")}')" title="覆盖保存到此存档">💾</button>
                    <button class="save-action" onclick="event.stopPropagation();renameMapSave('${s.id}')" title="重命名">✏️</button>
                    <button class="save-action delete" onclick="event.stopPropagation();deleteMapSave('${s.id}')" title="删除">✕</button>
                </div>`;
            }).join('');
        }

        function toggleSaveDropdown() {
            renderSaveMenu();
            const btn = document.getElementById('save-btn');
            const menu = document.getElementById('save-dropdown-menu');
            const willShow = !menu.classList.contains('show');
            if (willShow) positionDropdownMenu(btn, menu);
            menu.classList.toggle('show');
        }

        async function saveMapAs(name) {
            const reg = getSlotRegistry();
            if (!name) {
                const defaultName = '地图' + (reg.slots.length + 1);
                name = await showPromptDialog('请输入存档名称:', {defaultValue: defaultName});
                if (!name || !name.trim()) return;
            }
            name = name.trim();

            // 检查重名
            const existing = reg.slots.find(s => s.name === name);
            if (existing) {
                if (!await showConfirmDialog(`存档名 "${name}" 已存在。是否覆盖？`)) return;
                await dbDeleteSync(getSlotStorageKey(existing.id));
                reg.slots = reg.slots.filter(s => s.id !== existing.id);
            }

            const slotId = 'slot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

            // 写入 IndexedDB（等待确认，确保保存成功）
            var state = collectState();
            state._slotName = name;
            const ok = await dbSetAndWait(getSlotStorageKey(slotId), state);
            if (!ok) {
                alert('❌ 保存失败：无法写入数据库。\n请检查浏览器存储空间是否充足，或尝试刷新页面后重试。');
                return;
            }

            // 数据写入成功后再更新注册表（注册表保留在 localStorage，轻量）
            reg.slots.push({ id: slotId, name: name, timestamp: Date.now() });
            reg.activeSlotId = slotId;
            saveSlotRegistry(reg);
            setActiveSave(slotId, name);
            // 同步更新 dnd_map_state 到 IndexedDB
            dbSetSync(STORAGE_KEY, state);

            // 同步保存到服务器 跑团存档/地图/
            var username = '';
            try {
                var ident = JSON.parse(sessionStorage.getItem('dnd_joined_room') || '{}');
                username = ident.name || '';
            } catch(e) {}
            fetch('/api/map-saves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, state: state, username: username }),
            }).then(function(r) { return r.json(); }).then(function(d) {
                if (d.ok) {
                    console.log('[地图存档] 已同步到服务器: ' + name + ' (' + d.size_mb + ' MB)');
                }
            }).catch(function(e) {
                console.warn('[地图存档] 服务端同步失败（本地已保存）:', e.message);
            });

            document.getElementById('save-dropdown-menu').classList.remove('show');
            if (typeof Toast !== 'undefined') {
                Toast.success('已保存: ' + name + ' (本地 + 服务器)');
            }
        }

        async function loadMapSave(slotId) {
            const reg = getSlotRegistry();
            const slot = reg.slots.find(s => s.id === slotId);
            if (!slot) return;

            // 从 IndexedDB 加载目标存档（自动回退到 localStorage 并迁移）
            let state = null;
            try {
                state = await dbGetSync(getSlotStorageKey(slotId));
                // 回退：localStorage 旧格式
                if (!state) {
                    const raw = localStorage.getItem(getSlotStorageKey(slotId));
                    if (raw) {
                        try { state = JSON.parse(raw); } catch(e) {}
                        if (state) dbSetSync(getSlotStorageKey(slotId), state);
                    }
                }
                // 二次回退：尝试自动保存兜底（刚保存但 IndexedDB 未及时提交）
                if (!state && slotId === reg.activeSlotId) {
                    state = await dbGetSync(STORAGE_KEY);
                }
            } catch(e) {
                console.warn('读取存档失败:', e);
            }

            if (!state) {
                alert(`❌ 无法加载存档 "${slot.name}"：数据不存在或已损坏。\n\n可能原因：\n1. 保存时浏览器存储异常\n2. 浏览器数据被清理`);
                document.getElementById('save-dropdown-menu').classList.remove('show');
                return;
            }

            // 清除当前所有内容
            textBoxes.forEach(b => { if (b.el) b.el.remove(); });
            mapTokens.forEach(t => { if (t.el) t.el.remove(); });
            brushStrokes = []; textBoxes = []; mapTokens = [];
            mapLayers = []; clearAllFogLayers();
            selectedElement = null; clearMultiSelect();
            redrawCanvas();
            redrawFogCanvas();

            // 应用存档状态（等待图层图片异步加载完成）
            try {
                const applied = await applyState(state);
                if (!applied) {
                    alert('❌ 存档数据无法应用。');
                    initSaveSystem();  // 回退到自动保存
                    return;
                }
            } catch(e) {
                alert('❌ 应用存档数据失败: ' + e.message);
                return;
            }
            redrawCanvas();
            applyTransform();
            renderLayerList();
            updateAllFogCoverage();

            // 如果没有图层加载成功，尝试自适应视图
            if (!mapLayers.length && !brushStrokes.length && !mapTokens.length && !textBoxes.length) {
                zoomFit();
            }

            // 设为激活存档
            reg.activeSlotId = slotId;
            slot.timestamp = Date.now();
            saveSlotRegistry(reg);
            setActiveSave(slotId, slot.name);
            document.getElementById('save-dropdown-menu').classList.remove('show');
        }

        async function deleteMapSave(slotId) {
            const reg = getSlotRegistry();
            const slot = reg.slots.find(s => s.id === slotId);
            if (!slot) return;

            if (!await showConfirmDialog(`确定删除存档 "${slot.name}"？\n此操作不可撤销。`)) return;

            await dbDeleteSync(getSlotStorageKey(slotId));
            reg.slots = reg.slots.filter(s => s.id !== slotId);

            if (reg.slots.length > 0) {
                // 切换到最后一个存档
                const prevSlot = reg.slots[reg.slots.length - 1];
                reg.activeSlotId = prevSlot.id;
                saveSlotRegistry(reg);
                setActiveSave(prevSlot.id, prevSlot.name);
                // 加载该存档
                try {
                    const state = await dbGetSync(getSlotStorageKey(prevSlot.id));
                    if (state) {
                        textBoxes.forEach(b => { if (b.el) b.el.remove(); });
                        mapTokens.forEach(t => { if (t.el) t.el.remove(); });
                        brushStrokes = []; textBoxes = []; mapTokens = [];
                        mapLayers = []; clearAllFogLayers();
                        selectedElement = null; clearMultiSelect();
                        await applyState(state);
                        redrawCanvas();
                        applyTransform();
                        renderLayerList();
                    }
                } catch(e) {}
            } else {
                reg.activeSlotId = null;
                saveSlotRegistry(reg);
                setActiveSave(null, null);
            }

            document.getElementById('save-dropdown-menu').classList.remove('show');
        }

        async function renameMapSave(slotId) {
            const reg = getSlotRegistry();
            const slot = reg.slots.find(s => s.id === slotId);
            if (!slot) return;

            const newName = await showPromptDialog('新名称:', {defaultValue: slot.name});
            if (!newName || !newName.trim() || newName.trim() === slot.name) return;

            const trimmed = newName.trim();
            if (reg.slots.some(s => s.name === trimmed && s.id !== slotId)) {
                alert(`存档名 "${trimmed}" 已存在，请使用其他名称。`);
                return;
            }

            slot.name = trimmed;
            slot.timestamp = Date.now();
            saveSlotRegistry(reg);
            if (reg.activeSlotId === slotId) setActiveSave(slotId, trimmed);
            document.getElementById('save-dropdown-menu').classList.remove('show');
        }

        // ━━━ JSON 导出/导入 ━━━

        // 恢复存档附带的模组时间与笔记（导入/服务器加载共用）
        // 时间仅 DM 可写（403 时静默）；笔记需登录逐条写回
        async function restoreCampaignExtras(state) {
            if (!state) return;
            if (state.campaignTime && state.campaignTime.era) {
                try {
                    const s = JSON.parse(sessionStorage.getItem('dnd_joined_room') || '{}');
                    const resp = await fetch('/api/campaign-time', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            name: s.name || '', set: true,
                            era: state.campaignTime.era || '圣历',
                            year: state.campaignTime.year || 1,
                            month: state.campaignTime.month || 1,
                            day: state.campaignTime.day || 1,
                            hour: state.campaignTime.hour || 0,
                            minute: state.campaignTime.minute || 0,
                            minutes_per_hour: state.campaignTime.minutes_per_hour || 60,
                            hours_per_day: state.campaignTime.hours_per_day || 24,
                            days_per_month: state.campaignTime.days_per_month || 30,
                            months_per_year: state.campaignTime.months_per_year || 12
                        })
                    });
                    const d = await resp.json();
                    if (d && d.error && typeof Toast !== 'undefined') {
                        Toast.info('模组时间未恢复（' + d.error + '）');
                    }
                } catch(e) {}
            }
            if (Array.isArray(state.notes) && state.notes.length) {
                let restored = 0, failed = 0;
                for (const n of state.notes) {
                    if (!n || !n.title) continue;
                    try {
                        const resp = await fetch('/api/notes', {
                            method: 'POST', headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                kind: (n.kind === 'quest') ? 'quest' : 'clue',
                                title: n.title, description: n.description || '',
                                source: n.source || '', npc: n.npc || '', reward: n.reward || '',
                                status: n.status || '', visibility: (n.visibility === 'private') ? 'private' : 'public'
                            })
                        });
                        if (resp.ok) restored++; else failed++;
                    } catch(e) { failed++; }
                }
                if (typeof Toast !== 'undefined' && restored > 0) {
                    Toast.success('已恢复 ' + restored + ' 条笔记' + (failed ? '（' + failed + ' 条失败）' : ''));
                }
            }
        }

        /** 导出地图为 JSON 文件（浏览器下载，含画布/战斗/状态池/模组时间/笔记） */
        window.exportMapJSON = async function() {
            var state = collectState();
            state.layers = (state.layers || []).filter(function(l) { return l.dataURL || l.url; });
            // 附加模组时间与笔记（服务端数据，导入后恢复）
            try {
                const tr = await fetch('/api/campaign-time');
                const td = await tr.json();
                if (td && !td.empty) state.campaignTime = td;
            } catch(e) {}
            try {
                const nr = await fetch('/api/notes');
                const nd = await nr.json();
                if (Array.isArray(nd) && nd.length) state.notes = nd;
            } catch(e) {}
            state._meta = {
                version: 3, app: '尘封之卷', exportTime: new Date().toISOString(),
                canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight,
                layerCount: state.layers.length, strokeCount: (state.brushStrokes||[]).length,
                tokenCount: (state.mapTokens||[]).length,
                hasCampaignTime: !!state.campaignTime, noteCount: (state.notes||[]).length,
            };
            var dateStr = new Date().toISOString().slice(0, 10);
            var saveName = (currentSaveName || '地图存档').replace(/[<>:"/\\|?*]/g, '_');
            var filename = '尘封之卷_' + saveName + '_' + dateStr + '.json';

            var json = JSON.stringify(state, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            document.getElementById('save-dropdown-menu').classList.remove('show');
            if (typeof Toast !== 'undefined') {
                Toast.success('已下载 (' + (blob.size/1048576).toFixed(1) + ' MB)');
            }
        };

        /** 触发 JSON 文件导入选择 */
        window.importMapJSON = function() {
            document.getElementById('map-json-import').click();
            document.getElementById('save-dropdown-menu').classList.remove('show');
        };

        /** 处理 JSON 文件导入 */
        window.handleMapJSONImport = function(event) {
            var file = event.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    var state = JSON.parse(e.target.result);
                    // 校验格式
                    if (!state.brushStrokes && !state.layers && !state.canvasWidth) {
                        throw new Error('无效的存档文件：缺少必要数据');
                    }
                    // 确认覆盖
                    if (!await showConfirmDialog(
                        '即将导入地图存档:\n' +
                        '  图层: ' + ((state.layers||[]).length) + ' 个\n' +
                        '  笔画: ' + ((state.brushStrokes||[]).length) + ' 条\n' +
                        '  标记: ' + ((state.mapTokens||[]).length) + ' 个\n' +
                        '  画布: ' + (state.canvasWidth||'?') + 'x' + (state.canvasHeight||'?') + '\n\n' +
                        '⚠ 当前未保存的修改将丢失。是否继续？'
                    )) {
                        event.target.value = '';
                        return;
                    }
                    // 应用状态
                    applyState(state).then(function() {
                        saveState();
                        restoreCampaignExtras(state);   // 恢复模组时间与笔记（存档附带）
                        if (typeof Toast !== 'undefined') {
                            Toast.success('地图已导入');
                        }
                    });
                } catch(err) {
                    if (typeof Toast !== 'undefined') {
                        Toast.error('导入失败: ' + err.message);
                    } else {
                        alert('导入失败: ' + err.message);
                    }
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        };

        // ━━━ 服务端存档 ━━━

        /** 保存当前地图到服务器 */
        /** 从服务器加载地图存档列表 */
        window.loadMapFromServer = function() {
            var listEl = document.getElementById('server-save-list');
            listEl.style.display = 'block';
            listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.3rem 0.75rem;">加载中...</div>';
            fetch('/api/map-saves').then(function(r) { return r.json(); }).then(function(d) {
                if (!d.saves || !d.saves.length) {
                    listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.3rem 0.75rem;">（服务端无存档）</div>';
                    return;
                }
                listEl.innerHTML = d.saves.map(function(s) {
                    return '<div class="save-entry" style="display:flex;align-items:center;justify-content:space-between;padding:0.25rem 0.75rem;">' +
                        '<span class="save-name" style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="loadMapFromServerByName(\'' + s.name.replace(/'/g, "\\'") + '\')" title="点击加载">' +
                        '☁️ ' + s.name + '</span>' +
                        '<span style="font-size:0.6rem;color:var(--text-dim);margin:0 4px;">' + s.size_mb + 'MB</span>' +
                        '<span style="font-size:0.6rem;color:var(--text-dim);margin:0 4px;">' + s.time + '</span>' +
                        '<button class="save-action delete" onclick="event.stopPropagation();deleteServerMapSave(\'' + s.name.replace(/'/g, "\\'") + '\')" title="删除">✕</button>' +
                        '</div>';
                }).join('');
            }).catch(function(e) {
                listEl.innerHTML = '<div style="color:var(--red);font-size:0.75rem;padding:0.3rem 0.75rem;">加载失败</div>';
            });
        };

        /** 从服务器加载指定存档 */
        window.loadMapFromServerByName = async function(name) {
            if (!await showConfirmDialog('确定从服务器加载 "' + name + '" 吗？\n\n⚠ 当前未保存的修改将丢失。')) return;
            fetch('/api/map-saves/' + encodeURIComponent(name)).then(function(r) { return r.json(); }).then(function(d) {
                if (d.error) {
                    if (typeof Toast !== 'undefined') Toast.error(d.error);
                    else alert(d.error);
                    return;
                }
                applyState(d.state).then(function() {
                    saveState();
                    restoreCampaignExtras(d.state);   // 恢复模组时间与笔记（存档附带）
                    if (typeof Toast !== 'undefined') Toast.success('已加载: ' + name);
                    else alert('已加载: ' + name);
                });
            }).catch(function(e) {
                if (typeof Toast !== 'undefined') Toast.error('加载失败: ' + e.message);
                else alert('加载失败: ' + e.message);
            });
            document.getElementById('save-dropdown-menu').classList.remove('show');
            var listEl = document.getElementById('server-save-list');
            if (listEl) listEl.style.display = 'none';
        };

        /** 删除服务端存档 */
        window.deleteServerMapSave = async function(name) {
            if (!await showConfirmDialog('确定删除服务端存档 "' + name + '" 吗？此操作不可恢复。')) return;
            fetch('/api/map-saves/' + encodeURIComponent(name) + '?name=' + encodeURIComponent(name), {
                method: 'DELETE',
            }).then(function(r) { return r.json(); }).then(function(d) {
                if (d.ok) {
                    if (typeof Toast !== 'undefined') Toast.success('已删除: ' + name);
                    loadMapFromServer(); // 刷新列表
                }
            }).catch(function(e) {
                if (typeof Toast !== 'undefined') Toast.error('删除失败');
            });
        };
