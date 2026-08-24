/* ━━━ 角色卡 · 特性模块 ━━━
 * 从 character.js 拆分（2026-08-17）
 * 特性区渲染/编辑；顶层函数，全局可见
 */

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

        async function addFeature(charId, category, catId) {
            const name = await showPromptDialog('输入特性名称:');
            if (!name || !name.trim()) return;
            const desc = await showPromptDialog('输入描述（可选）:', {defaultValue: ''}) || '';
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
            if (!await showConfirmDialog('删除此特性？')) return;
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
            const name = await showPromptDialog('修改特性名称:', {defaultValue: currentName});
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
            const desc = await showPromptDialog('修改描述:', {defaultValue: currentDesc || ''});
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
