        function getIdentity() {
            try {
                const saved = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                const role = (saved && saved.is_dm) ? 'DM' : ((saved && saved.role) || 'PL');
                return { name: (saved && saved.name) || '', role: role, user_id: (saved && saved.user_id) || null };
            } catch(e) { return { name: '', role: 'PL', user_id: null }; }
        }

        // ━━━ 笔画 ID 生成器（必须在文件最前面，避免前面代码出错导致未定义）━━
        let _strokeSeq = 0;
        function genStrokeId() {
            return 's' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '_' + (++_strokeSeq);
        }

        // 聊天加入按钮（顶层入口，boot 完成前也可响应）
        window.setChatUser = function() {
            var input = document.getElementById('chat-username');
            var name = input ? input.value.trim() : '';
            if (!name) return;
            window._chatUser = name;
            var ci = document.getElementById('chat-input');
            var cs = document.getElementById('chat-send-btn');
            if (ci) ci.disabled = false;
            if (cs) cs.disabled = false;
            // 通过心跳注册到服务器
            fetch('/api/room/heartbeat', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: name, color: '#00bcd4', role: 'PL'})
            }).catch(function(){});
            // 更新 sessionStorage
            try {
                var s = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                if (s) { s.name = name; sessionStorage.setItem('dnd_joined_room', JSON.stringify(s)); }
                else { sessionStorage.setItem('dnd_joined_room', JSON.stringify({name:name,color:'#00bcd4',is_dm:false,role:'PL'})); }
            } catch(e) {}
        };

        // 聊天颜色选择（顶层入口，boot 完成前也可响应）
        var _topColors = ['#00bcd4','#4caf50','#ff9800','#e91e63','#9c27b0','#2196f3','#ff5722','#607d8b','#795548','#cddc39','#00e5ff','#76ff03','#ffd740','#ff4081','#b388ff','#448aff','#ff6e40','#90a4ae','#8d6e63','#ffff00'];
        window.toggleColorPalette = function() {
            var p = document.getElementById('color-palette');
            if (!p) return;
            p.innerHTML = _topColors.map(function(c){return '<div class=\"color-swatch\" style=\"background:'+c+'\" onclick=\"window.selectChatColor(\\\''+c+'\\\');\"></div>';}).join('');
            p.classList.toggle('show');
        };
        window.selectChatColor = function(color) {
            var btn = document.getElementById('chat-color-btn');
            if (btn) btn.style.background = color;
            var p = document.getElementById('color-palette');
            if (p) p.classList.remove('show');
            try {
                var s = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                if (s) { s.color = color; sessionStorage.setItem('dnd_joined_room', JSON.stringify(s)); }
            } catch(e) {}
            var name = window._chatUser;
            if (name) {
                fetch('/api/room/heartbeat', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name, color: color, role: 'PL'})
                }).catch(function(){});
            }
        };

        // 聊天消息渲染和轮询（顶层，boot完成前即可工作）
        var _chatLastTs = Date.now() / 1000;
        window._renderChatMsg = function(msg) {
            var msgs = document.getElementById('chat-msgs');
            if (!msgs) return;
            var div = document.createElement('div');
            div.className = 'chat-msg';
            var roleBadge = (msg.role === 'DM' || msg.is_dm) ? ' <span style=\"background:var(--gold);color:#000;font-size:0.6rem;padding:0 2px;border-radius:3px;\">DM</span>' : ' <span style=\"background:#555;color:#ccc;font-size:0.6rem;padding:0 2px;border-radius:3px;\">PL</span>';
            var nameColor = msg.color || (msg.is_dm ? '#ffd700' : '#00bcd4');
            var escapedName = (msg.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            var displayText = (msg.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            div.innerHTML = '<span class=\"cm-time\">[' + (msg.time||'') + ']</span><span class=\"cm-name\" style=\"color:' + nameColor + ';\">' + escapedName + roleBadge + '</span>：<span class=\"cm-text\">' + displayText + '</span>';
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;
        };
        window._pollChat = function() {
            fetch('/api/chat/messages?since=' + _chatLastTs).then(function(r){return r.json();}).then(function(d){
                if (d.ok && d.messages) {
                    d.messages.forEach(function(msg){
                        if (msg._ts > _chatLastTs) _chatLastTs = msg._ts;
                        window._renderChatMsg(msg);
                    });
                }
            }).catch(function(){});
        };
        // 立即拉取历史消息 + 每2秒轮询
        fetch('/api/chat/messages').then(function(r){return r.json();}).then(function(d){
            if (d.ok && d.messages) {
                d.messages.forEach(function(msg){
                    if (msg._ts > _chatLastTs) _chatLastTs = msg._ts;
                    window._renderChatMsg(msg);
                });
            }
        }).catch(function(){});
        // 顶层消息轮询（boot完成后由 pollChat 接管）
        var _topPollTimer = setInterval(window._pollChat, 2000);

        // 聊天发送消息（顶层入口，boot 完成前也可响应）
        window.sendChatMsg = function() {
            var sender = window._chatUser;
            if (!sender) {
                try { var _s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (_s && _s.name) sender = _s.name; } catch(e) {}
            }
            if (!sender) return;
            var input = document.getElementById('chat-input');
            if (!input) return;
            var text = input.value.trim();
            if (!text) return;
            input.value = '';
            fetch('/api/chat/send', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: sender, text: text, color: '#00bcd4', role: 'PL'})
            }).catch(function(){});
        };

        // 聊天面板折叠按钮（顶层入口，boot 完成前也可响应）
        window.toggleChat = function() {
            var panel = document.getElementById('chat-panel');
            var toggleBtn = document.getElementById('chat-toggle-btn');
            if (!panel || !toggleBtn) return;
            var isOpen = panel.classList.contains('open');
            if (isOpen) {
                panel.classList.remove('open');
                toggleBtn.classList.remove('shifted');
            } else {
                panel.classList.add('open');
                toggleBtn.classList.add('shifted');
            }
            // 右推浮动面板
            var panels = document.querySelectorAll('#token-info-panel, #layer-panel');
            var _nowOpen = panel.classList.contains('open');
            for (var j = 0; j < panels.length; j++) {
                panels[j].style.left = _nowOpen ? '288px' : '';
            }
        };

        // ━━━ 核心状态 ━━━
        const mapArea = document.getElementById('map-area');
        const wrap = document.getElementById('canvas-wrap');
        const canvas = document.getElementById('map-canvas');
        const ctx = canvas.getContext('2d');
        const drawCanvas = document.getElementById('draw-canvas');
        const drawCtx = drawCanvas.getContext('2d');
        const fogCanvas = document.getElementById('fog-canvas');
        const fogCtx = fogCanvas.getContext('2d');
        const overlay = document.getElementById('map-overlay');

        let fogLayers = [];        // [{id, name, polygons: [{points,closed}], visible: true}]
        let fogLayerIdCounter = 0;
        let activeFogLayerId = null;  // 当前绘制的目标图层
        let currentFogPoints = null;  // 正在绘制的迷雾多边形
        let fogVisible = true;        // 迷雾总开关（全局可见性）

        let currentTool = 'select';
        let selectMode = 'single';    // 'single' | 'box'
        let mapLocked = false;
        let isDraggingPanel = false;  // 拖拽面板时禁止地图联动
        let brushColor = '#ff0000', brushSize = 3;
        let scale = 1, offsetX = 0, offsetY = 0;
        let mapLayers = [];  // [{id, name, image, dataURL, visible, offsetX, offsetY, scale}]
        let activeLayerId = null;
        let movingLayer = false;  // 图层移动模式
        let layerIdCounter = 0;
        let brushStrokes = [];
        let currentStroke = null;
        // 填充持久化：保存填充后的画布快照（base64），重绘时恢复
        let fillBaseImage = new Image();  // 填充基底图片
        let fillBaseDataURL = '';        // 基底 dataURL（用于持久化）
        let textBoxes = [];
        let textIdCounter = 0;
        let mapTokens = [];      // {id, charId, name, portraitUrl, x, y, size, rotation, selected, el}
        let tokenIdCounter = 0;
        let selectedElement = null; // {type:'text'|'token', ref}
        let multiSelected = [];  // [{type:'text'|'token', ref}] for box-select
        let charDataCache = {};  // charId → {name, hp_current, hp_max, ac, ...}

        // 交互状态
        let isPanning = false, panStart = {x:0,y:0}, offsetStart = {x:0,y:0};
        let isDrawing = false;
        let dragTarget = null, dragType = null, dragOffset = {x:0,y:0};
        // 框选
        let boxSelecting = false, boxSelectStart = {x:0,y:0}, boxSelectRect = null;
        // 旋转
        let isRotating = false, rotToken = null, rotStartAngle = 0, rotStartRotation = 0;
        // 群组拖拽
        let groupDragging = false, groupDragOffsets = [];
        let _justDropped = false;  // 防止 HTML5 拖放后合成 mousedown 粘住 token

        canvas.width = 5000; canvas.height = 5000; drawCanvas.width = 5000; drawCanvas.height = 5000; fogCanvas.width = 5000; fogCanvas.height = 5000;

        // ━━━ 状态持久化 (localStorage + IndexedDB) ━━━
        const STORAGE_KEY = 'dnd_map_state';
        const DB_NAME = 'dnd_map_db';
        const DB_VERSION = 1;
        const DB_STORE = 'map_states';

        // ━━ IndexedDB 封装（持久连接，避免页面卸载时事务被中断）━━
        let _dbReady = false;
        let _db = null;

        // 启动时打开一次连接，保持到页面关闭
        function initDB() {
            return new Promise((resolve) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    if (!e.target.result.objectStoreNames.contains(DB_STORE)) {
                        e.target.result.createObjectStore(DB_STORE);
                    }
                };
                req.onsuccess = (e) => {
                    _db = e.target.result;
                    _dbReady = true;
                    // 连接断开时标记为未就绪（浏览器可能在页面隐藏时强制关闭）
                    _db.onclose = () => { _dbReady = false; _db = null; };
                    resolve(true);
                };
                req.onerror = () => { _dbReady = false; resolve(false); };
            });
        }

        function dbGetSync(key) {
            if (!_dbReady || !_db) {
                // 连接已断开（如浏览器清理），异步重连后返回 null（下次调用正常）
                initDB();
                return Promise.resolve(null);
            }
            return new Promise((resolve) => {
                try {
                    const tx = _db.transaction(DB_STORE, 'readonly');
                    const req = tx.objectStore(DB_STORE).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch(e) { resolve(null); }
            });
        }

        function dbSetSync(key, value) {
            if (!_dbReady || !_db) { initDB(); return false; }
            try {
                const tx = _db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(value, key);
                return true;
            } catch(e) { return false; }
        }

        function dbSetAndWait(key, value) {
            // 返回 Promise，等待事务提交（用于需要确认保存成功的场合）
            if (!_dbReady || !_db) return Promise.resolve(false);
            return new Promise((resolve) => {
                try {
                    const tx = _db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).put(value, key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch(e) { resolve(false); }
            });
        }

        function dbDeleteSync(key) {
            if (!_dbReady || !_db) return false;
            try {
                const tx = _db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(key);
                return true;
            } catch(e) { return false; }
        }

        // ━━━ 状态收集/应用（可复用于存档槽系统）━━
        function collectState() {
            return {
                brushStrokes: brushStrokes.map(s => ({tool:s.tool, color:s.color, size:s.size, points:s.points})),
                textBoxes: textBoxes.map(b => ({id:b.id, x:b.x, y:b.y, text:b.text, fontSize:b.fontSize})),
                mapTokens: mapTokens.map(t => ({id:t.id, charId:t.charId, name:t.name, portraitUrl:t.portraitUrl, x:t.x, y:t.y, size:t.size, rotation:t.rotation||0})),
                tokenIdCounter, textIdCounter,
                canvasWidth: canvas.width, canvasHeight: canvas.height,
                scale, offsetX, offsetY,
                layers: mapLayers.map(l => ({id:l.id, name:l.name, dataURL:l.dataURL, url:l.url||'', visible:l.visible, offsetX:l.offsetX||0, offsetY:l.offsetY||0, scale:l.scale||1})),
                fogLayers: fogLayers.map(l => ({
                    id: l.id, name: l.name, visible: l.visible,
                    polygons: l.polygons.map(p => ({points: p.points, closed: p.closed}))
                })),
                fogLayerIdCounter, activeFogLayerId, fogVisible,
                layerIdCounter, activeLayerId,
                mapCombatants: mapCombatants.map(c => ({...c})),
                mapRound: document.getElementById('map-round-info')?.textContent || '',
            };
        }

        function applyState(state) {
            return new Promise((resolve, reject) => {
                if (!state) { resolve(false); return; }

                // 恢复画布尺寸
                canvas.width = state.canvasWidth || 5000;
                canvas.height = state.canvasHeight || 5000;
                drawCanvas.width = canvas.width; drawCanvas.height = canvas.height;
                fogCanvas.width = canvas.width; fogCanvas.height = canvas.height;
                fillBaseImage = new Image(); fillBaseDataURL = '';  // 尺寸变更后清除填充缓存
                // Canvas 尺寸变更后上下文状态全部重置，恢复绘制属性
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';

                // ━━ 先恢复非图片数据（立即显示），图片逐张后台加载 ━━
                try { restoreNonImageData(state); } catch(e) { console.error('恢复非图片数据失败:', e); }

                // 图层图片逐张加载（setTimeout 让出主线程，每张间隔 50ms）
                layerIdCounter = state.layerIdCounter || 0;
                activeLayerId = state.activeLayerId || null;
                mapLayers = [];
                var _brokenLayerIds = [];  // 收集加载失败的图层ID
                const layersToLoad = (state.layers || []).filter(ld => ld.dataURL || ld.url);
                if (layersToLoad.length > 0) {
                    let idx = 0;
                    function loadNext() {
                        if (idx >= layersToLoad.length) {
                            // ━━ 所有图层加载完毕 ━━
                            // 自动清理损坏的图层引用（从下次加载的存档中移除）
                            if (_brokenLayerIds.length > 0) {
                                console.warn('[地图存档] 清理 ' + _brokenLayerIds.length + ' 个损坏图层引用, ids=' + _brokenLayerIds.join(','));
                                // 延迟保存清理后的状态（等页面完全初始化后）
                                setTimeout(function() {
                                    // 从 mapLayers 中移除损坏的图层再保存
                                    var cleanedLayers = mapLayers.filter(function(l) {
                                        return _brokenLayerIds.indexOf(l.id) === -1;
                                    });
                                    // 临时替换 mapLayers 来保存清理后的状态
                                    var saved = mapLayers;
                                    mapLayers = cleanedLayers;
                                    saveState();
                                    mapLayers = saved;
                                    // Toast 提示用户
                                    if (typeof Toast !== 'undefined') {
                                        Toast.info('已自动清理 ' + _brokenLayerIds.length + ' 个失效的图层引用');
                                    }
                                }, 2000);
                            }
                            resolve(true);
                            return;
                        }
                        const ld = layersToLoad[idx++];
                        // 清理名称中已有的错误标记（防止反复刷新累积）
                        var cleanName = (ld.name || '').replace(/\s*⚠️加载失败/g, '');
                        const img = new Image();
                        var retried = false;  // 是否已完成回退重试
                        img.onload = function() {
                            try {
                                if (img.width > 0) {
                                    mapLayers.push({
                                        id: ld.id, name: cleanName, image: img,
                                        dataURL: ld.dataURL, url: ld.url || '', visible: ld.visible !== false,
                                        offsetX: ld.offsetX || 0, offsetY: ld.offsetY || 0, scale: ld.scale || 1
                                    });
                                }
                                redrawCanvas();
                            } catch(e) { console.error('图层 onload 处理失败:', e); }
                            setTimeout(loadNext, 50);
                        };
                        img.onerror = function() {
                            try {
                                // URL 加载失败 → 回退到服务端兼容端点
                                if (!retried && ld.url && !ld.dataURL) {
                                    retried = true;
                                    var fallbackUrl = '/api/shared-canvas/layer/' + ld.id;
                                    console.warn('图层 URL 加载失败，尝试兼容端点: ' + ld.url + ' → ' + fallbackUrl);
                                    img.src = fallbackUrl;
                                    return;
                                }
                                // 两轮都失败：记录损坏ID（不加入 mapLayers，不保存回存档）
                                console.warn('图层加载失败(已重试): id=' + ld.id + ' name=' + cleanName + ' url=' + ld.url);
                                _brokenLayerIds.push(ld.id);
                                // 标记为损坏，加入占位图层仅用于当前会话显示（不可见，不含图片）
                                mapLayers.push({
                                    id: ld.id, name: cleanName + ' ⚠️加载失败', image: null,
                                    dataURL: '', url: '', visible: false,
                                    offsetX: ld.offsetX || 0, offsetY: ld.offsetY || 0, scale: ld.scale || 1
                                });
                                redrawCanvas();
                            } catch(e) { console.error('图层 onerror 处理失败:', e); }
                            setTimeout(loadNext, 50);
                        };
                        img.src = ld.url || ld.dataURL;
                    }
                    loadNext();
                } else {
                    resolve(true);
                }
            });
        }

        // 提取自 finishRestore：恢复不需要图片解码的状态（立即可见）
        function restoreNonImageData(state) {
                    // 恢复笔画
                    brushStrokes = (state.brushStrokes || []).map(s => ({...s}));

                    // 恢复文字框（清除旧 DOM）
                    textBoxes.forEach(b => { if (b.el) b.el.remove(); });
                    textBoxes = [];
                    textIdCounter = state.textIdCounter || 0;
                    for (const b of (state.textBoxes || [])) {
                        const box = createTextBoxElement(b.id, b.x, b.y, b.text, b.fontSize);
                        textBoxes.push(box); overlay.appendChild(box.el);
                    }

                    // 恢复标记（清除旧 DOM）
                    mapTokens.forEach(t => { if (t.el) t.el.remove(); });
                    mapTokens = [];
                    tokenIdCounter = state.tokenIdCounter || 0;
                    for (const t of (state.mapTokens || [])) {
                        const token = createMapTokenElement(t.id, t.charId, t.name, t.portraitUrl, t.x, t.y, t.size, t.rotation||0);
                        mapTokens.push(token);
                        if (t.charId) {
                            fetchCharData(t.charId);  // 预加载角色数据到缓存
                        }
                    }

                    // 恢复迷雾（兼容旧格式）
                    if (state.fogLayers) {
                        fogLayers = state.fogLayers.map(l => ({
                            id: l.id, name: l.name, visible: l.visible !== false,
                            polygons: (l.polygons || []).map(p => ({points: p.points, closed: p.closed}))
                        }));
                        fogLayerIdCounter = state.fogLayerIdCounter || 0;
                        activeFogLayerId = state.activeFogLayerId || null;
                    } else if (state.fogPolygons) {
                        // 旧格式迁移：所有多边形归入一个默认图层
                        const id = ++fogLayerIdCounter;
                        fogLayers = [{ id, name: '迷雾 1', polygons: state.fogPolygons.map(p => ({points: p.points, closed: p.closed})), visible: true }];
                        activeFogLayerId = id;
                    } else {
                        fogLayers = [];
                        fogLayerIdCounter = 0;
                        activeFogLayerId = null;
                    }
                    fogVisible = state.fogVisible !== false;
                    document.getElementById('fog-canvas').style.display = fogVisible ? 'block' : 'none';
                    redrawFogCanvas();

                    // 恢复视图（校验合法性，防止 NaN/Infinity 导致比例异常）
                    scale = (typeof state.scale === 'number' && isFinite(state.scale) && state.scale > 0) ? state.scale : 1;
                    offsetX = (typeof state.offsetX === 'number' && isFinite(state.offsetX)) ? state.offsetX : 0;
                    offsetY = (typeof state.offsetY === 'number' && isFinite(state.offsetY)) ? state.offsetY : 0;

                    // 恢复战斗状态
                    if (state.mapCombatants && state.mapCombatants.length) {
                        mapCombatants = state.mapCombatants.map(c => ({...c}));
                        mapRenderInitiative();
                        mapUpdateDmgDropdown();
                        if (state.mapRound) {
                            document.getElementById('map-round-info').textContent = state.mapRound;
                        }
                    }

        }

        function saveState() {
            // 可靠保存：IndexedDB 等待事务确认，localStorage 保留 dataURL 作为兜底
            const state = collectState();
            dbSetAndWait(STORAGE_KEY, state).catch(function(e){ console.error('⚠ IndexedDB 保存失败:', e); });
            try {
                // _light 备份保留 dataURL（限制单层 ≤200KB 避免超出 localStorage 5MB 上限）
                const light = {
                    ...state,
                    layers: state.layers.map(function(l) {
                        var dataLen = (l.dataURL || '').length;
                        return {...l, dataURL: (dataLen > 0 && dataLen <= 200000) ? l.dataURL : ''};
                    }),
                };
                localStorage.setItem(STORAGE_KEY + '_light', JSON.stringify(light));
                // 紧急兜底：单独保存图层 dataURL（仅含图片数据，用于极端情况恢复）
                var emergency = { layers: [] };
                for (var ei = 0; ei < state.layers.length; ei++) {
                    var el = state.layers[ei];
                    if (el.dataURL && el.dataURL.length > 0) {
                        emergency.layers.push({id: el.id, dataURL: el.dataURL});
                    }
                }
                if (emergency.layers.length > 0) {
                    localStorage.setItem(STORAGE_KEY + '_emergency', JSON.stringify(emergency));
                }
            } catch(e) { console.error('⚠ localStorage 保存失败 (可能超出配额):', e); }

            // 同步到服务器（防浏览器数据丢失）
            _autoSaveToServer(state);
        }

        var _autoSaveTimer = null;
        function _autoSaveToServer(state) {
            // 防抖：2秒内不重复发送
            clearTimeout(_autoSaveTimer);
            _autoSaveTimer = setTimeout(function() {
                var username = '';
                try {
                    var ident = JSON.parse(sessionStorage.getItem('dnd_joined_room') || '{}');
                    username = ident.name || '';
                } catch(e) {}
                fetch('/api/map-saves', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: '_autosave', state: state, username: username }),
                }).catch(function() {});  // 静默失败，不打扰用户
            }, 2000);
        }

        // 带 IndexedDB 确认的完整保存（定时自动保存用，确保图层 dataURL 可靠落盘）
        async function saveStateFull() {
            const state = collectState();
            try {
                const light = {
                    ...state,
                    layers: state.layers.map(function(l) {
                        var dataLen = (l.dataURL || '').length;
                        return {...l, dataURL: (dataLen > 0 && dataLen <= 200000) ? l.dataURL : ''};
                    }),
                };
                localStorage.setItem(STORAGE_KEY + '_light', JSON.stringify(light));
            } catch(e) {}
            await dbSetAndWait(STORAGE_KEY, state);
        }

        function debouncedSave() {
            clearTimeout(debouncedSave._timer);
            debouncedSave._timer = setTimeout(() => {
                try {
                    const s = collectState();
                    const light = { ...s, layers: s.layers.map(function(l) {
                        var dataLen = (l.dataURL || '').length;
                        return {...l, dataURL: (dataLen > 0 && dataLen <= 200000) ? l.dataURL : ''};
                    })};
                    localStorage.setItem(STORAGE_KEY + '_light', JSON.stringify(light));
                } catch(e) {}
            }, 300);
        }

        async function restoreState() {
            try {
                // 1. 优先从 IndexedDB 读取完整数据
                let state = await dbGetSync(STORAGE_KEY);
                if (state) return await applyState(state);

                // 2. IndexedDB 无数据，回退到 localStorage 轻量备份
                const lightRaw = localStorage.getItem(STORAGE_KEY + '_light');
                if (lightRaw) {
                    state = JSON.parse(lightRaw);
                    // 轻量备份不含 dataURL，图层需从 IndexedDB 槽位恢复
                    const reg = getSlotRegistry();
                    if (reg.activeSlotId) {
                        const slotState = await dbGetSync(getSlotStorageKey(reg.activeSlotId));
                        if (slotState && slotState.layers) {
                            state.layers = slotState.layers;  // 用槽位中的完整图层数据
                        }
                    }
                    return await applyState(state);
                }

                // 3. 旧版 localStorage 格式
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    state = JSON.parse(raw);
                    await dbSetSync(STORAGE_KEY, state);
                    return await applyState(state);
                }
                return false;
            } catch(e) { return false; }
        }

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

        function confirmSwitchSave(slotId, name) {
            if (confirm(`确定切换到存档 "${name}" 吗？\n\n⚠ 当前未保存的修改将会丢失。建议先点击 💾 保存。`)) {
                loadMapSave(slotId);
            }
        }

        async function confirmOverwriteSave(slotId, name) {
            if (!confirm(`确定将当前地图保存到 "${name}" 吗？\n\n此操作将覆盖该存档的原有内容。`)) return;

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
                name = prompt('请输入存档名称:', defaultName);
                if (!name || !name.trim()) return;
            }
            name = name.trim();

            // 检查重名
            const existing = reg.slots.find(s => s.name === name);
            if (existing) {
                if (!confirm(`存档名 "${name}" 已存在。是否覆盖？`)) return;
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

            if (!confirm(`确定删除存档 "${slot.name}"？\n此操作不可撤销。`)) return;

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

        function renameMapSave(slotId) {
            const reg = getSlotRegistry();
            const slot = reg.slots.find(s => s.id === slotId);
            if (!slot) return;

            const newName = prompt('新名称:', slot.name);
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

        /** 导出地图为 JSON 文件（浏览器下载） */
        window.exportMapJSON = function() {
            var state = collectState();
            state.layers = (state.layers || []).filter(function(l) { return l.dataURL || l.url; });
            state._meta = {
                version: 2, app: '尘封之卷', exportTime: new Date().toISOString(),
                canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight,
                layerCount: state.layers.length, strokeCount: (state.brushStrokes||[]).length,
                tokenCount: (state.mapTokens||[]).length,
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
            reader.onload = function(e) {
                try {
                    var state = JSON.parse(e.target.result);
                    // 校验格式
                    if (!state.brushStrokes && !state.layers && !state.canvasWidth) {
                        throw new Error('无效的存档文件：缺少必要数据');
                    }
                    // 确认覆盖
                    if (!confirm(
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
        window.loadMapFromServerByName = function(name) {
            if (!confirm('确定从服务器加载 "' + name + '" 吗？\n\n⚠ 当前未保存的修改将丢失。')) return;
            fetch('/api/map-saves/' + encodeURIComponent(name)).then(function(r) { return r.json(); }).then(function(d) {
                if (d.error) {
                    if (typeof Toast !== 'undefined') Toast.error(d.error);
                    else alert(d.error);
                    return;
                }
                applyState(d.state).then(function() {
                    saveState();
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
        window.deleteServerMapSave = function(name) {
            if (!confirm('确定删除服务端存档 "' + name + '" 吗？此操作不可恢复。')) return;
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

        // ━━━ 坐标转换 ━━━
        function screenToCanvas(sx, sy) {
            const rect = mapArea.getBoundingClientRect();
            return { x: (sx - rect.left - offsetX) / scale, y: (sy - rect.top - offsetY) / scale };
        }
        function applyTransform() {
            wrap.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
        }

        // ━━━ 工具切换 ━━━
        function setTool(tool) {
            currentTool = tool;
            // 切工具时退出图层移动模式
            if (movingLayer && tool !== 'select') { toggleMoveLayer(); }
            document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
            const btn = document.querySelector(`[data-tool="${tool}"]`);
            if (btn) btn.classList.add('active');
            mapArea.classList.remove('cursor-grab','cursor-grabbing','cursor-text','cursor-brush');
            if (tool === 'select') mapArea.classList.add('cursor-grab');
            if (tool === 'text') mapArea.classList.add('cursor-text');
            if (tool === 'brush' || tool === 'eraser' || tool === 'fill') mapArea.classList.add('cursor-brush');
            if (tool === 'fog') { if (window._isDM !== true) { alert('⚠ 只有DM可以使用战争迷雾'); return; } mapArea.classList.add('cursor-brush'); currentFogPoints = null; redrawFogCanvas(); }
            if (tool !== 'select') { deselectAll(); clearMultiSelect(); }
            // 非选择工具时隐藏下拉菜单
            if (tool !== 'select') {
                document.getElementById('select-btn').classList.remove('active');
                document.getElementById('select-dropdown-menu').classList.remove('show');
            } else {
                document.getElementById('select-btn').classList.add('active');
            }
            saveState();
        }

        // ━━━ 下拉菜单 fixed 定位辅助（解决工具栏 overflow 裁剪问题）━━
        function positionDropdownMenu(btn, menu) {
            const btnRect = btn.getBoundingClientRect();
            // 检测是否右对齐（HTML 中设置了 right 属性的菜单）
            const isRightAligned = menu.style.right && menu.style.right !== 'auto';
            if (isRightAligned) {
                menu.style.left = 'auto';
                menu.style.right = (window.innerWidth - btnRect.right) + 'px';
            } else {
                menu.style.left = btnRect.left + 'px';
                menu.style.right = 'auto';
            }
            menu.style.top = (btnRect.bottom + 2) + 'px';
            // 等待渲染后修正越界
            requestAnimationFrame(() => {
                const mr = menu.getBoundingClientRect();
                if (mr.right > window.innerWidth - 4) {
                    menu.style.left = 'auto';
                    menu.style.right = '4px';
                }
                if (mr.left < 4) {
                    menu.style.left = '4px';
                    menu.style.right = 'auto';
                }
            });
        }

        // ━━━ 选择模式下拉菜单 ━━━
        function toggleSelectDropdown() {
            if (currentTool !== 'select') { setTool('select'); }
            const btn = document.getElementById('select-btn');
            const menu = document.getElementById('select-dropdown-menu');
            const willShow = !menu.classList.contains('show');
            if (willShow) positionDropdownMenu(btn, menu);
            menu.classList.toggle('show');
        }

        function setSelectMode(mode) {
            selectMode = mode;
            document.querySelectorAll('#select-dropdown-menu .menu-item').forEach(m => m.classList.remove('checked'));
            const item = document.querySelector(`#select-dropdown-menu [data-mode="${mode}"]`);
            if (item) item.classList.add('checked');
            document.getElementById('select-dropdown-menu').classList.remove('show');
            if (mode === 'box') {
                document.getElementById('select-btn').innerHTML = '⬜ 框选<span class="arrow">▾</span>';
            } else {
                document.getElementById('select-btn').innerHTML = '🖱 选择<span class="arrow">▾</span>';
            }
            deselectAll(); clearMultiSelect();
        }

        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#select-dropdown-wrap')) {
                document.getElementById('select-dropdown-menu').classList.remove('show');
            }
            if (!e.target.closest('#fog-dropdown-wrap')) {
                document.getElementById('fog-dropdown-menu').classList.remove('show');
            }
            if (!e.target.closest('#save-dropdown-wrap')) {
                document.getElementById('save-dropdown-menu').classList.remove('show');
            }
        });

        function updateBrush() {
            brushColor = document.getElementById('brush-color').value;
            brushSize = parseInt(document.getElementById('brush-size').value);
        }

        // ━━━ 画布绘制 ━━━
        function redrawCanvas() {
            // 背景画布：网格 + 图层
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
            for (let y = 0; y < canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
            for (const layer of mapLayers) {
                if (layer.visible !== false && layer.image && layer.image.complete && layer.image.naturalWidth > 0) {
                    const ox = layer.offsetX || 0;
                    const oy = layer.offsetY || 0;
                    const s = layer.scale || 1;
                    const dw = layer.image.naturalWidth * s;
                    const dh = layer.image.naturalHeight * s;
                    try { ctx.drawImage(layer.image, ox, oy, dw, dh); } catch(e) {}
                }
            }
            redrawDrawCanvas();
        }

        function redrawDrawCanvas() {
            // 1. 画填充基底（Image 避免 drawImage(超大离屏canvas) 静默失败）
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            drawCtx.globalCompositeOperation = 'source-over';
            if (fillBaseDataURL && fillBaseImage.complete && fillBaseImage.naturalWidth > 0) {
                try { drawCtx.drawImage(fillBaseImage, 0, 0); } catch(e) {}
            }
            // 2. 画笔画（含橡皮擦除，destination-out 会同时擦除填充基底——符合直觉）
            for (const s of brushStrokes) {
                if (s.points.length < 1) continue;
                drawCtx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
                drawCtx.strokeStyle = s.color; drawCtx.lineWidth = s.size;
                drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
                drawCtx.beginPath(); drawCtx.moveTo(s.points[0].x, s.points[0].y);
                for (let i = 1; i < s.points.length; i++) drawCtx.lineTo(s.points[i].x, s.points[i].y);
                drawCtx.stroke();
            }
            drawCtx.globalCompositeOperation = 'source-over';
        }

        // ━━━ 鼠标事件 ━━━
        function handleWheel(e) {
            if (mapLocked) return;
            // 检查鼠标是否在地图区域（不在面板上）
            const target = e.target;
            if (target.closest('#token-info-panel') || target.closest('#layer-panel') ||
                target.closest('#char-sidebar') || target.closest('.dice-popup') ||
                target.closest('.map-toolbar')) return;
            e.preventDefault();
            // Alt+滚轮 → 旋转选中的标记
            if (e.altKey && selectedElement && selectedElement.type === 'token') {
                const token = selectedElement.ref;
                const delta = e.deltaY > 0 ? -15 : 15;
                token.rotation = ((token.rotation || 0) + delta) % 360;
                if (token.rotation < 0) token.rotation += 360;
                applyTokenRotation(token);
                debouncedSave();
                return;
            }
            // 正常缩放
            const rect = mapArea.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const old = scale;
            scale *= e.deltaY < 0 ? 1.1 : 0.9;
            scale = Math.max(0.1, Math.min(10, scale));
            offsetX = mx - (mx - offsetX) * (scale / old);
            offsetY = my - (my - offsetY) * (scale / old);
            applyTransform();
            debouncedSave();
        }

        mapArea.addEventListener('wheel', handleWheel);
        wrap.addEventListener('wheel', handleWheel);

        mapArea.addEventListener('mousedown', (e) => {
            // 兜底清理：释放前一次可能未正确结束的拖拽状态
            if (dragTarget !== null) { dragTarget = null; dragType = null; }
            if (groupDragging) { groupDragging = false; groupDragOffsets = []; }
            // 点击面板时不处理地图事件
            if (e.target.closest('#token-info-panel') || e.target.closest('#layer-panel')) return;
            // 旋转手柄
            if (e.target.closest('.token-rotate')) {
                e.stopPropagation(); e.preventDefault();
                startRotate(e);
                return;
            }
            // 调整大小手柄（由 handle 事件处理，不要进入 pan）
            if (e.target.closest('.token-resize')) return;

            // 框选模式
            if (e.button === 0 && currentTool === 'select' && selectMode === 'box' &&
                !e.target.closest('.map-token, .map-text-box') && !e.target.closest('.token-rotate')) {
                boxSelecting = true;
                const rect = mapArea.getBoundingClientRect();
                boxSelectStart = {x: e.clientX - rect.left, y: e.clientY - rect.top};
                boxSelectRect = document.createElement('div');
                boxSelectRect.className = 'selection-rect';
                boxSelectRect.style.left = boxSelectStart.x + 'px';
                boxSelectRect.style.top = boxSelectStart.y + 'px';
                boxSelectRect.style.width = '0px';
                boxSelectRect.style.height = '0px';
                mapArea.appendChild(boxSelectRect);
                e.preventDefault(); return;
            }

            // 右键 或 选择工具+空白区 → 平移（锁定状态下禁止平移）
            if (!mapLocked && (e.button === 2 || (e.button === 0 && currentTool === 'select' && selectMode === 'single' &&
                !e.target.closest('.map-token, .map-text-box, .token-rotate')))) {
                isPanning = true; panStart = {x:e.clientX, y:e.clientY};
                offsetStart = {x:offsetX, y:offsetY};
                // 图层移动模式：记录活动图层初始偏移
                if (movingLayer && activeLayerId) {
                    const layer = mapLayers.find(l => l.id === activeLayerId);
                    if (layer) {
                        offsetStart.layerX = layer.offsetX || 0;
                        offsetStart.layerY = layer.offsetY || 0;
                    }
                }
                mapArea.classList.add('cursor-grabbing');
                e.preventDefault(); return;
            }

            // 单体选择工具：点击空白区取消选择
            if (e.button === 0 && currentTool === 'select' && selectMode === 'single') {
                deselectAll(); clearMultiSelect();
                if (e.target.closest('.map-token')) return;
                if (e.target.closest('.map-text-box')) return;
            }

            // 画笔/橡皮
            if (e.button === 0) {
                if (currentTool === 'brush' || currentTool === 'eraser') {
                    // 诊断：验证 drawCtx 是否可用
                    if (!window._brushDiagDone) {
                        window._brushDiagDone = true;
                        try {
                            drawCtx.fillStyle = '#ff0000';
                            drawCtx.fillRect(100, 100, 5, 5);
                            var testData = drawCtx.getImageData(100, 100, 1, 1);
                            console.log('🖌 画笔诊断: drawCtx可用, 测试像素RGBA=(' + testData.data[0] + ',' + testData.data[1] + ',' + testData.data[2] + ',' + testData.data[3] + ') drawCanvas尺寸=' + drawCanvas.width + 'x' + drawCanvas.height);
                            drawCtx.clearRect(100, 100, 5, 5);
                        } catch(err) {
                            console.error('❌ 画笔诊断失败: drawCtx不可用!', err);
                        }
                    }
                    isDrawing = true;
                    currentStroke = { id: genStrokeId(), tool: currentTool, color: currentTool==='eraser'?'#000':brushColor, size: brushSize, points: [] };
                    currentStroke.points.push(screenToCanvas(e.clientX, e.clientY));
                    e.preventDefault();
                }
                if (currentTool === 'text') {
                    if (e.target.closest('.map-token, .map-text-box')) return;
                    const pt = screenToCanvas(e.clientX, e.clientY);
                    addTextBox(pt.x, pt.y);
                    e.preventDefault();
                }
                if (currentTool === 'fill') {
                    const pt = screenToCanvas(e.clientX, e.clientY);
                    const fx = Math.round(pt.x), fy = Math.round(pt.y);
                    e.preventDefault();
                    // 洪水填充直接画在可见的 drawCtx 上（跳过 fillCanvas drawImage 的兼容性问题）
                    try {
                        var alpha = drawCtx.getImageData(fx, fy, 1, 1).data[3];
                        if (alpha === 0) {
                            floodFillTransparent(drawCtx, drawCanvas.width, drawCanvas.height, fx, fy, brushColor);
                        } else {
                            floodFillOnCanvas(drawCtx, drawCanvas.width, drawCanvas.height, fx, fy, brushColor);
                        }
                    } catch(err) { console.error('填充失败:', err); }
                    // 边界增强：先画深色粗线描边，再画原色细线，确保边界醒目
                    for (const s of brushStrokes) {
                        if (s.points.length < 1 || s.tool === 'eraser') continue;
                        drawCtx.globalCompositeOperation = 'source-over';
                        drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
                        // 底层：深色描边（宽度+2）
                        drawCtx.strokeStyle = 'rgba(0,0,0,0.5)'; drawCtx.lineWidth = s.size + 2;
                        drawCtx.beginPath(); drawCtx.moveTo(s.points[0].x, s.points[0].y);
                        for (let i = 1; i < s.points.length; i++) drawCtx.lineTo(s.points[i].x, s.points[i].y);
                        drawCtx.stroke();
                        // 顶层：原色原宽
                        drawCtx.strokeStyle = s.color; drawCtx.lineWidth = s.size;
                        drawCtx.beginPath(); drawCtx.moveTo(s.points[0].x, s.points[0].y);
                        for (let i = 1; i < s.points.length; i++) drawCtx.lineTo(s.points[i].x, s.points[i].y);
                        drawCtx.stroke();
                    }
                    // 持久化：保存 drawCanvas 快照为 Image，供后续 redrawDrawCanvas 恢复
                    fillBaseDataURL = drawCanvas.toDataURL('image/png');
                    fillBaseImage = new Image();
                    fillBaseImage.src = fillBaseDataURL;
                    window._markDirty('strokes'); window._onLocalChange();
                    debouncedSave();
                }
                if (currentTool === 'fog') {
                    if (window._isDM !== true) return;
                    if (e.shiftKey && currentFogPoints && currentFogPoints.length >= 3) {
                        // Shift+点击 → 闭合当前多边形
                        currentFogPoints.push(currentFogPoints[0]); // 闭合
                        getActiveFogLayer().polygons.push({points: currentFogPoints, closed: true});
                        currentFogPoints = null;
                        activeFogLayerId = null;  // 下次绘制自动创建新图层
                        renumberFogLayers();
                        renderLayerList();
                        debouncedSave();
                        window._markDirty('fog');
                    } else if (currentFogPoints === null) {
                        // 开始新多边形 → 自动创建独立图层（一处迷雾一个图层）
                        const newId = ++fogLayerIdCounter;
                        fogLayers.push({ id: newId, name: '迷雾 ' + newId, polygons: [], visible: true });
                        activeFogLayerId = newId;
                        currentFogPoints = [screenToCanvas(e.clientX, e.clientY)];
                    } else {
                        // 添加顶点
                        currentFogPoints.push(screenToCanvas(e.clientX, e.clientY));
                    }
                    redrawFogCanvas();
                    // 绘制当前未闭合多边形
                    if (currentFogPoints && currentFogPoints.length >= 2) {
                        fogCtx.strokeStyle = 'rgba(255,255,255,0.6)';
                        fogCtx.lineWidth = 2; fogCtx.setLineDash([5,5]);
                        fogCtx.beginPath(); fogCtx.moveTo(currentFogPoints[0].x, currentFogPoints[0].y);
                        for (let i = 1; i < currentFogPoints.length; i++) fogCtx.lineTo(currentFogPoints[i].x, currentFogPoints[i].y);
                        fogCtx.stroke(); fogCtx.setLineDash([]);
                    }
                    if (currentFogPoints === null) debouncedSave();
                    e.preventDefault();
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingPanel) return;
            if (_justDropped) return;
            if (isRotating) {
                updateRotate(e);
                return;
            }
            if (isPanning) {
                if (movingLayer && activeLayerId && offsetStart.hasOwnProperty('layerX')) {
                    // 移动当前图层
                    const layer = mapLayers.find(l => l.id === activeLayerId);
                    if (layer) {
                        layer.offsetX = offsetStart.layerX + (e.clientX - panStart.x);
                        layer.offsetY = offsetStart.layerY + (e.clientY - panStart.y);
                        redrawCanvas();
                        window._markDirty('layers');
                    }
                } else {
                    offsetX = offsetStart.x + (e.clientX - panStart.x);
                    offsetY = offsetStart.y + (e.clientY - panStart.y);
                    applyTransform();
                }
                return;
            }
            // 框选更新
            if (boxSelecting && boxSelectRect) {
                const rect = mapArea.getBoundingClientRect();
                const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
                const l = Math.min(boxSelectStart.x, cx), t = Math.min(boxSelectStart.y, cy);
                const w = Math.abs(cx - boxSelectStart.x), h = Math.abs(cy - boxSelectStart.y);
                boxSelectRect.style.left = l + 'px';
                boxSelectRect.style.top = t + 'px';
                boxSelectRect.style.width = w + 'px';
                boxSelectRect.style.height = h + 'px';
                return;
            }
            if (isDrawing && currentStroke) {
                currentStroke.points.push(screenToCanvas(e.clientX, e.clientY));
                redrawDrawCanvas();
                drawCtx.globalCompositeOperation = currentStroke.tool==='eraser'?'destination-out':'source-over';
                drawCtx.strokeStyle = currentStroke.color; drawCtx.lineWidth = currentStroke.size;
                drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
                drawCtx.beginPath(); drawCtx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
                for (let i=1; i<currentStroke.points.length; i++) drawCtx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
                drawCtx.stroke();
                drawCtx.globalCompositeOperation = 'source-over';
            }
            // 群组拖拽
            if (groupDragging) {
                const pt = screenToCanvas(e.clientX, e.clientY);
                for (const gd of groupDragOffsets) {
                    gd.ref.x = pt.x - gd.ox;
                    gd.ref.y = pt.y - gd.oy;
                    if (gd.type === 'text') {
                        gd.ref.el.style.left = gd.ref.x + 'px';
                        gd.ref.el.style.top = gd.ref.y + 'px';
                    } else if (gd.type === 'token') {
                        gd.ref.el.style.left = gd.ref.x + 'px';
                        gd.ref.el.style.top = gd.ref.y + 'px';
                    }
                }
                return;
            }
            // 单体拖拽
            if (dragTarget !== null) {
                const pt = screenToCanvas(e.clientX, e.clientY);
                if (dragType === 'text') {
                    dragTarget.x = pt.x - dragOffset.x;
                    dragTarget.y = pt.y - dragOffset.y;
                    dragTarget.el.style.left = dragTarget.x + 'px';
                    dragTarget.el.style.top = dragTarget.y + 'px';
                } else if (dragType === 'token') {
                    dragTarget.x = pt.x - dragOffset.x;
                    dragTarget.y = pt.y - dragOffset.y;
                    dragTarget.el.style.left = dragTarget.x + 'px';
                    dragTarget.el.style.top = dragTarget.y + 'px';
                    // 节流：每50ms发送一次位置更新，实现远程实时跟踪
                    var now = Date.now();
                    if (!dragTarget._lastSync || now - dragTarget._lastSync >= 50) {
                        dragTarget._lastSync = now;
                        try { window._wsSendOp('tokens', [tokenNetData(dragTarget)], []); } catch(e) {}
                    }
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (_justDropped) return;
            if (isRotating) { endRotate(); }
            if (isPanning) { isPanning = false; mapArea.classList.remove('cursor-grabbing'); if (currentTool==='select') mapArea.classList.add('cursor-grab'); debouncedSave(); }
            if (isDrawing && currentStroke) {
                isDrawing = false;
                if (currentStroke.points.length > 0) { brushStrokes.push(currentStroke); window._wsBroadcastStroke(currentStroke); window._markDirty('strokes'); }
                currentStroke = null; redrawCanvas();
                saveState();
            }
            // 框选结束
            if (boxSelecting) {
                boxSelecting = false;
                if (boxSelectRect) {
                    performBoxSelect();
                    boxSelectRect.remove(); boxSelectRect = null;
                }
            }
            if (dragTarget !== null) {
                // 先清空拖拽状态，防止后续操作异常导致 token 粘在鼠标上
                const doneTarget = dragTarget, doneType = dragType;
                dragTarget = null; dragType = null;
                if (doneType === 'token') { try { window._wsSendOp('tokens', [tokenNetData(doneTarget)], []); } catch(e) {} window._markDirty('tokens'); }
                else if (doneType === 'text') { try { window._wsSendOp('texts', [textNetData(doneTarget)], []); } catch(e) {} window._markDirty('texts'); }
                debouncedSave();
            }
            if (groupDragging) {
                var movedTokens = [], movedTexts = [];
                groupDragging = false;
                var offsets = groupDragOffsets; groupDragOffsets = [];
                offsets.forEach(function(gd) {
                    if (gd.type === 'token') movedTokens.push(tokenNetData(gd.ref));
                    else if (gd.type === 'text') movedTexts.push(textNetData(gd.ref));
                });
                if (movedTokens.length) { try { window._wsSendOp('tokens', movedTokens, []); } catch(e) {} window._markDirty('tokens'); }
                if (movedTexts.length) { try { window._wsSendOp('texts', movedTexts, []); } catch(e) {} window._markDirty('texts'); }
                debouncedSave();
            }
        });

        mapArea.addEventListener('contextmenu', e => e.preventDefault());

        // ━━━ 框选逻辑 ━━━
        function performBoxSelect() {
            clearMultiSelect();
            deselectAll();
            const rect = boxSelectRect.getBoundingClientRect();
            const mapRect = mapArea.getBoundingClientRect();

            // 将屏幕坐标转为画布坐标
            function elInRect(elRect) {
                const elL = elRect.left, elT = elRect.top, elR = elRect.right, elB = elRect.bottom;
                return !(elR < rect.left || elL > rect.right || elB < rect.top || elT > rect.bottom);
            }

            const selectedTokens = [];
            const selectedTexts = [];

            for (const t of mapTokens) {
                const er = t.el.getBoundingClientRect();
                if (elInRect(er)) {
                    t.selected = true;
                    t.el.classList.add('multi-selected');
                    selectedTokens.push({type:'token', ref:t});
                }
            }

            for (const b of textBoxes) {
                const er = b.el.getBoundingClientRect();
                if (elInRect(er)) {
                    b.selected = true;
                    b.el.style.borderColor = 'var(--cyan)';
                    b.el.style.boxShadow = '0 0 8px rgba(0,188,212,0.5)';
                    selectedTexts.push({type:'text', ref:b});
                }
            }

            multiSelected = [...selectedTokens, ...selectedTexts];
            if (multiSelected.length === 1) {
                // 只选了一个，转为单选
                selectedElement = multiSelected[0];
                if (selectedElement.type === 'token') {
                    selectedElement.ref.el.classList.remove('multi-selected');
                    selectedElement.ref.el.classList.add('selected');
                }
                multiSelected = [];
            }
        }

        function clearMultiSelect() {
            for (const ms of multiSelected) {
                if (ms.type === 'token') {
                    ms.ref.selected = false;
                    ms.ref.el.classList.remove('multi-selected');
                } else if (ms.type === 'text') {
                    ms.ref.selected = false;
                    ms.ref.el.style.borderColor = 'transparent';
                    ms.ref.el.style.boxShadow = 'none';
                }
            }
            multiSelected = [];
        }

        // ━━━ 战争迷雾（多图层）━━━━
        function ensureFogLayer() {
            if (fogLayers.length === 0) {
                const id = ++fogLayerIdCounter;
                fogLayers.push({ id, name: '迷雾 ' + id, polygons: [], visible: true });
                activeFogLayerId = id;
                renderLayerList();
            }
            if (!activeFogLayerId || !fogLayers.find(l => l.id === activeFogLayerId)) {
                activeFogLayerId = fogLayers[0].id;
            }
        }

        function getActiveFogLayer() {
            ensureFogLayer();
            return fogLayers.find(l => l.id === activeFogLayerId);
        }

        function clearAllFogLayers() {
            fogLayers = [];
            fogLayerIdCounter = 0;
            activeFogLayerId = null;
            currentFogPoints = null;
            updateAllFogCoverage();
            renderLayerList();
        }
        function redrawFogCanvas() {
            updateAllFogCoverage();
            if (!fogVisible) return;
            fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            var isPL = window._isDM !== true;
            var fillColor = isPL ? 'rgba(30,30,30,1)' : 'rgba(40,40,40,0.85)';
            var strokeColor = isPL ? 'rgba(200,200,200,0.7)' : 'rgba(180,180,180,0.9)';
            var fogLW = isPL ? 1 : 2;

            for (const layer of fogLayers) {
                if (!layer.visible) continue;
                for (let pi = 0; pi < layer.polygons.length; pi++) {
                    const poly = layer.polygons[pi];
                    if (poly.points.length < 2) continue;
                    fogCtx.fillStyle = fillColor;
                    fogCtx.strokeStyle = strokeColor;
                    fogCtx.lineWidth = fogLW;
                    fogCtx.beginPath();
                    fogCtx.moveTo(poly.points[0].x, poly.points[0].y);
                    for (let i = 1; i < poly.points.length; i++) {
                        fogCtx.lineTo(poly.points[i].x, poly.points[i].y);
                    }
                    if (poly.closed) {
                        fogCtx.closePath();
                        fogCtx.fill();
                        fogCtx.stroke();
                        // DM 可见：在多边形内部绘制图层序号
                        if (!isPL && poly.points.length >= 3) {
                            // 计算重心，如果不在多边形内则螺旋搜索内部点
                            var cx = 0, cy = 0;
                            for (const p of poly.points) { cx += p.x; cy += p.y; }
                            cx /= poly.points.length; cy /= poly.points.length;
                            if (!isPointInFogPolygon(cx, cy, poly)) {
                                // 螺旋搜索多边形内部点（步长 20px，最多 200 步）
                                for (var step = 1; step < 200; step++) {
                                    var angle = step * 0.5;
                                    var r = step * 20;
                                    var tx = cx + r * Math.cos(angle);
                                    var ty = cy + r * Math.sin(angle);
                                    if (isPointInFogPolygon(tx, ty, poly)) { cx = tx; cy = ty; break; }
                                }
                            }
                            fogCtx.save();
                            fogCtx.shadowColor = 'rgba(0,0,0,0.9)';
                            fogCtx.shadowBlur = 12;
                            fogCtx.fillStyle = '#ffffff';
                            fogCtx.font = 'bold 56px sans-serif';
                            fogCtx.textAlign = 'center';
                            fogCtx.textBaseline = 'middle';
                            fogCtx.fillText(layer.name, cx, cy);
                            fogCtx.restore();
                        }
                    } else {
                        fogCtx.stroke();
                    }
                }
            }
        }

        // ━━━ 迷雾遮盖检测（全局作用域，被 redrawFogCanvas 和 token 操作调用）━━
        function isPointInFogPolygon(x, y, polygon) {
            if (!polygon.closed || polygon.points.length < 3) return false;
            const pts = polygon.points;
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x, yi = pts[i].y;
                const xj = pts[j].x, yj = pts[j].y;
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            return inside;
        }

        function isUnderFog(item) {
            const cx = item.x + (item.size || 50) / 2;
            const cy = item.y + (item.size || 24) / 2;
            for (const layer of fogLayers) {
                if (!layer.visible) continue;
                for (const poly of layer.polygons) {
                    if (isPointInFogPolygon(cx, cy, poly)) return true;
                    if (isPointInFogPolygon(item.x, item.y, poly)) return true;
                    if (isPointInFogPolygon(item.x + (item.size || 50), item.y, poly)) return true;
                    if (isPointInFogPolygon(item.x, item.y + (item.size || 24), poly)) return true;
                    if (isPointInFogPolygon(item.x + (item.size || 50), item.y + (item.size || 24), poly)) return true;
                }
            }
            return false;
        }

        function updateAllFogCoverage() {
            const isPL = window._isDM !== true;
            for (const t of mapTokens) {
                if (t.el) {
                    if (isPL && fogVisible && isUnderFog(t)) {
                        t.el.style.display = 'none';
                    } else {
                        t.el.style.display = '';
                    }
                }
            }
            for (const b of textBoxes) {
                if (b.el) {
                    if (isPL && fogVisible && isUnderFog(b)) {
                        b.el.style.display = 'none';
                    } else {
                        b.el.style.display = '';
                    }
                }
            }
        }

        // ━━━ 填充工具（限定区域洪水填充，可指定目标 canvas 上下文）━━
        function floodFill(sx, sy, fillColor) {
            floodFillOnCanvas(drawCtx, drawCanvas.width, drawCanvas.height, sx, sy, fillColor);
        }
        // 填充透明区域（闭合笔画内部的空白），遇到非透明像素（笔画边界）即停止
        // 若填充触碰到采样框边缘 → 说明未闭合，撤销填充
        function floodFillTransparent(ctx, cw, ch, sx, sy, fillColor) {
            const boxSize = 800;
            const x0 = Math.max(0, sx - boxSize/2);
            const y0 = Math.max(0, sy - boxSize/2);
            const x1 = Math.min(cw, sx + boxSize/2);
            const y1 = Math.min(ch, sy + boxSize/2);
            const bw = x1 - x0, bh = y1 - y0;
            if (bw <= 0 || bh <= 0) return;

            const imageData = ctx.getImageData(x0, y0, bw, bh);
            const data = imageData.data;
            const lx = sx - x0, ly = sy - y0;

            // 获取填充颜色 RGBA
            const tmp = document.createElement('canvas'); tmp.width = 1; tmp.height = 1;
            const tctx = tmp.getContext('2d'); tctx.fillStyle = fillColor; tctx.fillRect(0,0,1,1);
            const fd = tctx.getImageData(0,0,1,1).data;
            const fillR = fd[0], fillG = fd[1], fillB = fd[2], fillA = fd[3];

            // 只填充透明像素（边界为非透明像素）
            const visited = new Uint8Array(bw * bh);
            const stack = [lx, ly];
            const maxOps = 500000;
            let ops = 0;
            let edgeTouched = false;  // 是否触碰到了采样框边缘（未闭合）

            while (stack.length > 0 && ops < maxOps) {
                const y = stack.pop();
                const x = stack.pop();
                ops++;
                if (x < 0 || x >= bw || y < 0 || y >= bh) continue;
                const vi = y * bw + x;
                if (visited[vi]) continue;
                const idx = vi * 4;
                if (data[idx+3] !== 0) continue;  // 遇到非透明像素（笔画边界），停止
                visited[vi] = 1;
                // 检测是否触碰到采样框边缘
                if (x <= 0 || x >= bw-1 || y <= 0 || y >= bh-1) edgeTouched = true;
                data[idx] = fillR; data[idx+1] = fillG; data[idx+2] = fillB; data[idx+3] = fillA;
                stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
            }
            if (!edgeTouched) {
                // 闭合区域内 → 应用填充
                ctx.putImageData(imageData, x0, y0);
                console.log('🪣 填充: 已应用 (闭合区域 ops='+ops+')');
            } else {
                // 触碰边缘 → 未闭合，不填充
                console.log('🪣 填充: 未闭合区域，跳过 (edgeTouched=true ops='+ops+')');
                // 不调用 putImageData，填充被丢弃
            }
        }
        function floodFillOnCanvas(ctx, cw, ch, sx, sy, fillColor) {
            // 限定采样区域：点击位置周围 800×800 像素
            const boxSize = 800;
            const x0 = Math.max(0, sx - boxSize/2);
            const y0 = Math.max(0, sy - boxSize/2);
            const x1 = Math.min(cw, sx + boxSize/2);
            const y1 = Math.min(ch, sy + boxSize/2);
            const bw = x1 - x0, bh = y1 - y0;

            const imageData = ctx.getImageData(x0, y0, bw, bh);
            const data = imageData.data;
            const lx = sx - x0, ly = sy - y0;
            const targetIdx = (ly * bw + lx) * 4;
            const targetR = data[targetIdx], targetG = data[targetIdx+1], targetB = data[targetIdx+2], targetA = data[targetIdx+3];

            const tmp = document.createElement('canvas'); tmp.width = 1; tmp.height = 1;
            const tctx = tmp.getContext('2d'); tctx.fillStyle = fillColor; tctx.fillRect(0,0,1,1);
            const fd = tctx.getImageData(0,0,1,1).data;
            const fillR = fd[0], fillG = fd[1], fillB = fd[2], fillA = fd[3];

            if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

            const visited = new Uint8Array(bw * bh);
            const stack = [lx, ly];
            const maxOps = 500000;
            let ops = 0;

            while (stack.length > 0 && ops < maxOps) {
                const y = stack.pop();
                const x = stack.pop();
                ops++;
                if (x < 0 || x >= bw || y < 0 || y >= bh) continue;
                const vi = y * bw + x;
                if (visited[vi]) continue;
                const idx = vi * 4;
                if (data[idx] !== targetR || data[idx+1] !== targetG || data[idx+2] !== targetB || data[idx+3] !== targetA) continue;
                visited[vi] = 1;
                data[idx] = fillR; data[idx+1] = fillG; data[idx+2] = fillB; data[idx+3] = fillA;
                stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
            }
            ctx.putImageData(imageData, x0, y0);

            // 如果填充满整个采样框，可能是大空白区域，用 fillRect 补充
            if (ops >= maxOps) {
                ctx.fillStyle = fillColor;
                ctx.fillRect(x0, y0, bw, bh);
            }
        }

        // ━━━ 键盘 ━━━
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
            switch(e.key.toLowerCase()) {
                case 'v': setTool('select'); break;
                case 'b': setTool('brush'); break;
                case 'e': setTool('eraser'); break;
                case 'f': setTool('fill'); break;
                case 'g': setTool('fog'); break;
                case 't': setTool('text'); break;
                case 'delete': case 'backspace':
                    if (multiSelected.length > 0) {
                        for (const ms of [...multiSelected]) {
                            if (ms.type === 'text') removeTextBox(ms.ref);
                            if (ms.type === 'token') removeMapToken(ms.ref);
                        }
                        clearMultiSelect(); saveState();
                    } else if (selectedElement) {
                        if (selectedElement.type === 'text') removeTextBox(selectedElement.ref);
                        if (selectedElement.type === 'token') removeMapToken(selectedElement.ref);
                        selectedElement = null; saveState();
                    }
                    break;
                case 'escape':
                    // 如果正在编辑文本框，先退出编辑模式
                    const editing = document.querySelector('.map-text-box.editing');
                    if (editing) { editing.contentEditable = 'false'; editing.classList.remove('editing'); }
                    deselectAll(); clearMultiSelect();
                    break;
                case '0': zoomFit(); break;
                // 旋转快捷键
                case 'r':
                    if (selectedElement && selectedElement.type === 'token') {
                        if (!e.ctrlKey && !e.metaKey) {
                            const token = selectedElement.ref;
                            token.rotation = ((token.rotation || 0) + 45) % 360;
                            if (token.rotation < 0) token.rotation += 360;
                            applyTokenRotation(token);
                            debouncedSave();
                        }
                    }
                    break;
            }
        });

        // ━━━ 文字框 ━━━
        function createTextBoxElement(id, x, y, text='文字', fontSize=16) {
            const box = { id, x, y, text, fontSize, selected: false };
            const el = document.createElement('div');
            el.className = 'map-text-box';
            el.textContent = text;
            el.style.cssText = `left:${x}px;top:${y}px;font-size:${fontSize}px;position:absolute;min-width:40px;min-height:24px;padding:4px 8px;background:rgba(0,0,0,0.65);border:2px solid transparent;border-radius:4px;color:#fff;font-family:'Segoe UI',sans-serif;white-space:nowrap;cursor:move;user-select:none;line-height:1.4;`;
            el.dataset.boxId = id;

            const handle = document.createElement('div');
            handle.style.cssText = 'position:absolute;bottom:-6px;right:-6px;width:12px;height:12px;background:var(--accent);border-radius:50%;cursor:nwse-resize;display:none;';
            el.appendChild(handle);

            el.addEventListener('mousedown', (e) => {
                if (e.target === handle) return;
                if (currentTool !== 'select') return;
                e.stopPropagation();
                // 如果已被多选且点击的是多选中的元素，开始群组拖拽
                if (multiSelected.length > 0 && multiSelected.some(ms => ms.ref === box)) {
                    startGroupDrag(e);
                    return;
                }
                selectElement('text', box);
                // 延迟拖拽：等鼠标实际移动后才开始，单击不触发拖拽
                const startX = e.clientX, startY = e.clientY;
                const origX = box.x, origY = box.y;
                const pt = screenToCanvas(e.clientX, e.clientY);
                const offX = pt.x - box.x, offY = pt.y - box.y;
                let dragging = false;
                function onMove(ev) {
                    if (!dragging) {
                        if (Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
                        dragging = true;
                    }
                    const p = screenToCanvas(ev.clientX, ev.clientY);
                    box.x = p.x - offX; box.y = p.y - offY;
                    box.el.style.left = box.x + 'px'; box.el.style.top = box.y + 'px';
                }
                function onUp() {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (dragging) {
                        window._wsSendOp('texts', [textNetData(box)], []); window._markDirty('texts'); debouncedSave();
                    }
                }
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                el.contentEditable = 'true'; el.classList.add('editing');
                el.focus();
                const range = document.createRange(); range.selectNodeContents(el);
                const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
            });
            el.addEventListener('blur', () => {
                el.contentEditable = 'false'; el.classList.remove('editing');
                box.text = el.textContent; box.fontSize = parseInt(el.style.fontSize) || 16;
                deselectAll();
                debouncedSave();
                window._wsSendOp('texts', [textNetData(box)], []);
                window._markDirty('texts');
            });
            handle.addEventListener('mousedown', (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const sx = ev.clientX, sSize = parseInt(el.style.fontSize) || 16;
                function mv(ev2) { const ns = Math.max(8, Math.min(500, sSize + (ev2.clientX-sx)/3)); el.style.fontSize = ns+'px'; box.fontSize = ns; }
                function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); debouncedSave(); }
                window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
            });
            box.el = el;
            return box;
        }

        function addTextBox(x, y, text='文字', fontSize=16) {
            const id = ++textIdCounter;
            const box = createTextBoxElement(id, x, y, text, fontSize);
            textBoxes.push(box); overlay.appendChild(box.el);
            debouncedSave();
            window._wsSendOp('texts', [textNetData(box)], []);
            window._markDirty('texts');
            return box;
        }

        // ━━━ 角色数据缓存 & HP标签 ━━━
        async function fetchCharData(charId) {
            if (charDataCache[charId]) return charDataCache[charId];
            try {
                const resp = await fetch(`/api/character/${charId}`);
                const data = await resp.json();
                if (!data.error) { charDataCache[charId] = data; return data; }
            } catch(e) {}
            return null;
        }

        async function updateTokenHpLabel(token, charData) {
            // 不在token下方显示血量（仅保留名称）
            const label = token.el.querySelector('.token-label');
            if (label) {
                label.textContent = token.name;
            }
        }

        function showTokenInfoPanel(token) {
            const charData = charDataCache[token.charId];
            if (!charData) { return; }

            const ab = charData.abilities || {};
            const mods = charData.ability_mods || {};
            const abbr = {str:'力', dex:'敏', con:'体', int:'智', wis:'感', cha:'魅'};
            const hpPct = charData.hp_max ? Math.round(charData.hp_current / charData.hp_max * 100) : 100;

            // 武器装备
            const weapons = charData.weapons || [];
            let weaponStr = weapons.length ? weapons.map(w => {
                const dmg = w.damage || w.damage_dice || '';
                const dmgType = w.damage_type || '';
                const dmgPart = dmg ? ` 伤害 ${dmg}${dmgType ? ' ' + dmgType : ''}` : '';
                return `⚔️ ${w.name||w.weapon_name}: 命中+${w.attack_bonus||0}${dmgPart}`;
            }).join('<br>') : '暂无';

            // 护甲
            const armor = charData.armor || {};
            let armorStr = '';
            if (armor.name || armor.armor_name) {
                armorStr = `🛡️ ${armor.name||armor.armor_name} AC${armor.ac||armor.armor_class||'?'}`;
            }

            const panel = document.getElementById('token-info-panel');
            const tipBody = document.getElementById('tip-body');
            tipBody.innerHTML = `
                <div class="tip-header">${charData.name}</div>
                <div class="tip-hp-bar">
                    <div class="tip-hp-fill" style="width:${hpPct}%"></div>
                    <div class="tip-hp-text">❤️ ${charData.hp_current||0}/${charData.hp_max||0}</div>
                </div>
                <div style="text-align:center;font-size:0.7rem;color:var(--text-dim);margin-bottom:0.3rem;">
                    🛡️ AC ${charData.ac||10} | 🏃 ${charData.speed||30}尺 | ⭐ +${charData.proficiency_bonus||2}
                </div>
                <div class="tip-abilities">
                    ${Object.entries(abbr).map(([k,label]) => {
                        const score = ab[k] || 10;
                        const mod = mods[k] || 0;
                        return `<div class="tip-ab"><div class="abn">${label}</div><div class="abs">${score}</div><div class="abm">${mod>=0?'+':''}${mod}</div></div>`;
                    }).join('')}
                </div>
                <div class="tip-section">
                    <div class="tip-section-title">⚔️ 装备</div>
                    <div class="tip-item">${weaponStr}</div>
                    ${armorStr ? `<div class="tip-item">${armorStr}</div>` : ''}
                </div>
            `;
            panel.classList.add('show');
        }

        function hideTokenInfoPanel() {
            document.getElementById('token-info-panel').classList.remove('show');
        }

        function selectElement(type, ref) {
            deselectAll(); clearMultiSelect();
            if (type === 'text') { ref.selected = true; ref.el.style.borderColor = 'var(--accent)'; ref.el.style.boxShadow = '0 0 8px rgba(233,68,96,0.5)'; ref.el.querySelector('div').style.display = 'block'; hideTokenInfoPanel(); }
            if (type === 'token') {
                ref.selected = true; ref.el.classList.add('selected');
                if (ref.charId) {
                    fetchCharData(ref.charId).then(() => showTokenInfoPanel(ref));
                }
            }
            selectedElement = { type, ref };
        }

        function deselectAll() {
            textBoxes.forEach(b => { b.selected = false; b.el.style.borderColor = 'transparent'; b.el.style.boxShadow = 'none'; const h = b.el.querySelector('div'); if (h) h.style.display = 'none'; });
            mapTokens.forEach(t => { t.selected = false; t.el.classList.remove('selected'); });
            selectedElement = null;
            // 不自动关闭角色信息面板，由用户手动点击 ✕ 关闭
        }

        function removeTextBox(box) {
            if (box.el) box.el.remove();
            textBoxes = textBoxes.filter(b => b.id !== box.id);
            if (selectedElement && selectedElement.type === 'text' && selectedElement.ref === box) selectedElement = null;
            multiSelected = multiSelected.filter(ms => ms.ref !== box);
            debouncedSave();
            window._wsSendOp('texts', [], [box.id]);
            window._markDirty('texts');
        }

        // ━━━ 群组拖拽 ━━━
        function startGroupDrag(e) {
            groupDragging = true;
            const pt = screenToCanvas(e.clientX, e.clientY);
            groupDragOffsets = multiSelected.map(ms => ({
                type: ms.type, ref: ms.ref,
                ox: pt.x - ms.ref.x, oy: pt.y - ms.ref.y
            }));
            e.stopPropagation();
        }

        // ━━━ 地图标记（角色头像）━━
        function createMapTokenElement(id, charId, name, portraitUrl, x, y, size, rotation) {
            const token = { id, charId, name, portraitUrl, x, y, size, rotation: rotation || 0, selected: false };
            const el = document.createElement('div');
            el.className = 'map-token';
            el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`;
            if (portraitUrl) el.style.backgroundImage = `url(${portraitUrl})`;
            else el.innerHTML = '<span style="font-size:1.5rem;">👤</span>';

            // 旋转手柄
            const rotLine = document.createElement('div');
            rotLine.className = 'token-rotate-line';
            el.appendChild(rotLine);
            const rotHandle = document.createElement('div');
            rotHandle.className = 'token-rotate';
            rotHandle.title = '拖拽旋转 (或 R键/Alt+滚轮)';
            el.appendChild(rotHandle);

            // 高亮箭头（侧边栏点击角色时显示）
            const arrow = document.createElement('div');
            arrow.className = 'token-arrow';
            el.appendChild(arrow);

            const label = document.createElement('div');
            label.className = 'token-label'; label.textContent = name;
            el.appendChild(label);

            const sizeHandle = document.createElement('div');
            sizeHandle.className = 'token-resize';
            el.appendChild(sizeHandle);

            // 应用旋转
            if (token.rotation) applyTokenRotation(token);

            el.addEventListener('mousedown', (e) => {
                if (_justDropped) return;
                if (e.target === sizeHandle || e.target === rotHandle) return;
                if (currentTool !== 'select') return;
                e.stopPropagation();
                // 如果已被多选且点击的是多选中的元素，开始群组拖拽
                if (multiSelected.length > 0 && multiSelected.some(ms => ms.ref === token)) {
                    startGroupDrag(e);
                    return;
                }
                selectElement('token', token);
                dragTarget = token; dragType = 'token';
                const pt = screenToCanvas(e.clientX, e.clientY);
                dragOffset = {x: pt.x - token.x, y: pt.y - token.y};
            });
            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                removeMapToken(token);
                if (selectedElement && selectedElement.type === 'token' && selectedElement.ref === token) selectedElement = null;
                multiSelected = multiSelected.filter(ms => ms.ref !== token);
                debouncedSave();
            });

            sizeHandle.addEventListener('mousedown', (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const sx = ev.clientX; const sy = ev.clientY;
                const sSize = token.size;
                function mv(ev2) { const d = Math.max(20, Math.min(200, sSize + (ev2.clientX-sx + ev2.clientY-sy)/2)); token.size = d; el.style.width = d+'px'; el.style.height = d+'px'; }
                function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); debouncedSave(); window._wsSendOp('tokens', [tokenNetData(token)], []); window._markDirty('tokens'); }
                window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
            });

            token.el = el; overlay.appendChild(el);
            return token;
        }

        function addMapToken(charId, name, portraitUrl, x, y, size = 48) {
            const id = ++tokenIdCounter;
            const token = createMapTokenElement(id, charId, name, portraitUrl, x, y, size, 0);
            mapTokens.push(token);
            updateAllFogCoverage();  // PL 视角下检查是否被迷雾遮盖
            fetchCharData(charId);  // 预加载角色数据到缓存
            debouncedSave();
            window._wsSendOp('tokens', [tokenNetData(token)], []);
            window._markDirty('tokens');
            return token;
        }

        function removeMapToken(token) {
            if (token.el) token.el.remove();
            mapTokens = mapTokens.filter(t => t.id !== token.id);
            multiSelected = multiSelected.filter(ms => ms.ref !== token);
            debouncedSave();
            window._wsSendOp('tokens', [], [token.id]);
            window._markDirty('tokens');
        }

        // ━━━ 旋转 ━━━
        function applyTokenRotation(token) {
            const deg = token.rotation || 0;
            token.el.style.transform = `rotate(${deg}deg)`;
        }

        function startRotate(e) {
            const handle = e.target.closest('.token-rotate');
            const tokenEl = handle.closest('.map-token');
            rotToken = mapTokens.find(t => t.el === tokenEl);
            if (!rotToken) return;
            isRotating = true;
            rotStartRotation = rotToken.rotation || 0;
            const rect = tokenEl.getBoundingClientRect();
            const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
            rotStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        }

        function updateRotate(e) {
            if (!rotToken) return;
            const rect = rotToken.el.getBoundingClientRect();
            const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
            const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
            let delta = currentAngle - rotStartAngle;
            rotToken.rotation = Math.round((rotStartRotation + delta) % 360);
            if (rotToken.rotation < 0) rotToken.rotation += 360;
            applyTokenRotation(rotToken);
        }

        function endRotate() {
            if (rotToken) { window._wsSendOp('tokens', [tokenNetData(rotToken)], []); window._markDirty('tokens'); }
            isRotating = false; rotToken = null;
            debouncedSave();
        }

        // ━━━ 角色侧边栏 ━━━
        let sidebarOpen = false;
        function toggleCharPanel() {
            sidebarOpen = !sidebarOpen;
            document.getElementById('char-sidebar').classList.toggle('open', sidebarOpen);
            document.getElementById('map-area').classList.toggle('sidebar-open', sidebarOpen);
            const btn = document.getElementById('char-panel-btn');
            if (sidebarOpen) {
                btn.classList.add('active');
                loadCharTokens();
                loadMapCombatCharSelect();
            } else {
                btn.classList.remove('active');
            }
        }

        function renderMapCharCard(c) {
            const portraitUrl = `/api/character/${c.id}/portrait?v=${encodeURIComponent(c.portrait_path||'')}`;
            const hp = c.hp_current ?? '?';
            const hpMax = c.hp_max ?? '?';
            return `
            <div class="char-token-card"
                 draggable="true"
                 data-char-id="${c.id}"
                 data-char-name="${c.name}"
                 data-portrait="${portraitUrl}"
                 onclick="onSidebarCharClick(${c.id}, event)"
                 ondragstart="onCharDragStart(event)"
                 ondblclick="placeCharOnMap(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${portraitUrl}')">
                <img class="token-thumb" src="${portraitUrl}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                     loading="lazy">
                <div class="token-thumb placeholder" style="display:none;">👤</div>
                <div class="token-info">
                    <div class="token-name">
                        ${c.name}
                        <button onclick="event.stopPropagation();event.preventDefault();showSidebarCharInfo(${c.id}, '${c.name.replace(/'/g, "\\'")}')"
                                style="background:var(--accent);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:0.6rem;padding:0.1rem 0.35rem;margin-left:0.2rem;vertical-align:middle;"
                                title="查看详细信息">📋</button>
                    </div>
                    <div class="token-meta">${c.level || 1}级 ${c.class || ''} | ❤️${hp}/${hpMax}</div>
                </div>
            </div>`;
        }

        async function loadCharTokens() {
            const list = document.getElementById('char-token-list');
            try {
                const identity = getIdentity();
                const resp = await fetch(`/api/characters?name=${encodeURIComponent(identity.name)}&role=${encodeURIComponent(identity.role)}`);
                const data = await resp.json();
                const chars = Array.isArray(data) ? data : (data.characters || []);
                const groups = (!Array.isArray(data) && data.groups) ? data.groups : [];

                if (!chars.length) { list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:1rem;">暂无角色</div>'; return; }

                let html = '';
                // 总角色组（全部角色）
                html += renderMapGroupHTML({id: '__all__', name: '总角色组'}, chars);
                // 各分组
                for (const g of groups) {
                    const groupChars = chars.filter(c => String(c.group_id) === String(g.id));
                    html += renderMapGroupHTML(g, groupChars);
                }

                list.innerHTML = html;
            } catch(e) { list.innerHTML = '<div style="color:var(--red);text-align:center;padding:1rem;">加载失败</div>'; }
        }

        function renderMapGroupHTML(g, groupChars) {
            const isAll = g.id === '__all__';
            const gid = isAll ? '__all__' : (g.id || '');
            const gname = g.name || '分组';
            const isEmpty = groupChars.length === 0;
            if (isEmpty && !isAll) return '';  // 跳过空分组
            const countBadge = `<span style="color:var(--text-dim);font-size:0.65rem;">${groupChars.length}</span>`;

            const items = groupChars.map(c => renderMapCharCard(c)).join('');
            const emptyHint = isEmpty ? '<div style="color:var(--text-dim);font-size:0.7rem;padding:0.2rem 0.5rem;opacity:0.5;">拖拽角色到地图上</div>' : '';

            return `
            <div class="map-char-group">
                <div class="map-group-header" onclick="toggleMapGroup(this)" title="点击折叠/展开">
                    <span class="map-group-arrow">▼</span>
                    <span class="map-group-name">${gname}</span>
                    ${countBadge}
                </div>
                <div class="map-group-body">
                    ${items}${emptyHint}
                </div>
            </div>`;
        }

        window.toggleMapGroup = function(header) {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.map-group-arrow');
            const isCollapsed = header.classList.toggle('collapsed');
            body.style.display = isCollapsed ? 'none' : '';
            arrow.textContent = isCollapsed ? '▶' : '▼';
        };

        // 点击侧边栏角色📋按钮 → 左侧弹出信息面板
        async function showSidebarCharInfo(charId, name) {
            try {
                const data = await fetchCharData(charId);
                if (!data) { alert('无法获取角色数据'); return; }
                const fakeToken = { charId, name };
                charDataCache[charId] = data;
                // 先取消选中（会隐藏面板），再重新显示
                deselectAll();
                showTokenInfoPanel(fakeToken);
            } catch(e) {
                alert('获取角色信息失败: ' + e.message);
            }
        }

        function onCharDragStart(e) {
            const card = e.target.closest('.char-token-card');
            if (!card) return;
            e.dataTransfer.setData('text/plain', JSON.stringify({
                charId: card.dataset.charId,
                name: card.dataset.charName,
                portrait: card.dataset.portrait,
            }));
            e.dataTransfer.effectAllowed = 'copy';
        }

        mapArea.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        mapArea.addEventListener('drop', (e) => {
            e.preventDefault();
            // 强制重置所有拖拽状态，防止 token 粘在鼠标上
            dragTarget = null; dragType = null; isPanning = false;
            groupDragging = false; groupDragOffsets = [];
            _justDropped = true;
            setTimeout(() => { _justDropped = false; }, 500);
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.charId) {
                    const pt = screenToCanvas(e.clientX, e.clientY);
                    addMapToken(parseInt(data.charId), data.name, data.portrait, pt.x - 24, pt.y - 24);
                }
            } catch(ex) {}
        });

        function placeCharOnMap(charId, name, portraitUrl) {
            const rect = mapArea.getBoundingClientRect();
            addMapToken(charId, name, portraitUrl, (rect.width/2 - offsetX)/scale - 24, (rect.height/2 - offsetY)/scale - 24);
        }

        // ━━━ 侧边栏与地图标记联动 ━━━
        function highlightCharOnMap(charId) {
            // 先清除所有高亮
            clearMapHighlight();
            // 高亮该角色在地图上的所有标记
            let found = false;
            for (const t of mapTokens) {
                if (t.charId == charId) {
                    t.el.classList.add('highlighted');
                    found = true;
                }
            }
            // 高亮侧边栏中对应的角色卡片
            const cards = document.querySelectorAll('.char-token-card');
            cards.forEach(card => {
                if (card.dataset.charId == charId) {
                    card.style.borderColor = 'var(--red)';
                    card.style.boxShadow = '0 0 8px rgba(244,67,54,0.5)';
                } else {
                    card.style.borderColor = '';
                    card.style.boxShadow = '';
                }
            });
            // 无标记时显示提示
            if (!found) {
                // 不做额外提示，仅不高亮
            }
        }

        function clearMapHighlight() {
            for (const t of mapTokens) {
                t.el.classList.remove('highlighted');
            }
            const cards = document.querySelectorAll('.char-token-card');
            cards.forEach(card => {
                card.style.borderColor = '';
                card.style.boxShadow = '';
            });
        }

        // 侧边栏角色卡片点击 → 高亮地图上对应标记
        function onSidebarCharClick(charId, e) {
            e.stopPropagation();
            highlightCharOnMap(charId);
        }

        // 点击地图空白处清除高亮
        const _origMapMouseDown = mapArea.onmousedown;
        mapArea.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.char-token-card, .map-token')) {
                clearMapHighlight();
            }
        });

        // ━━━ 图层管理 ━━━
        let layerPanelOpen = false;
        function toggleLayerPanel() {
            layerPanelOpen = !layerPanelOpen;
            document.getElementById('layer-panel').classList.toggle('show', layerPanelOpen);
            const btn = document.getElementById('layer-panel-btn');
            if (layerPanelOpen) { btn.classList.add('active'); renderLayerList(); }
            else btn.classList.remove('active');
        }

        function renderLayerList() {
            const el = document.getElementById('layer-list');
            let html = '';
            const isPL = window._isDM !== true;

            // ━━ 迷雾图层列表（独立管理，仅DM可见完整控制）━━
            ensureFogLayer();
            if (isPL) {
                // PL 只看到迷雾总开关
                html += '<div class="layer-item" style="border-color:rgba(180,180,180,0.5);">';
                html += '<span style="font-size:0.8rem;">🌫</span>';
                html += '<span class="layer-name" style="color:#aaa;">战争迷雾</span>';
                html += '<span style="font-size:0.6rem;color:var(--text-dim);flex-shrink:0;">' + (fogVisible ? '可见' : '隐藏') + '</span>';
                html += '</div>';
            } else {
                // DM 看到各迷雾图层（仅显示有内容的图层，空图层不展示）
                const activeLayers = fogLayers.filter(l => l.polygons.length > 0);
                if (activeLayers.length > 0) {
                    html += '<div style="font-size:0.7rem;color:var(--gold);padding:0.2rem 0.3rem;border-bottom:1px solid var(--border);margin-bottom:0.2rem;">🌫 迷雾图层</div>';
                }
                for (const layer of fogLayers) {
                    if (layer.polygons.length === 0) continue;  // 跳过空图层
                    const isActive = layer.id === activeFogLayerId;
                    html += '<div class="layer-item' + (isActive ? ' active' : '') + '" style="border-color:rgba(180,180,180,0.5);">';
                    html += '<button class="layer-btn" onclick="event.stopPropagation();toggleFogLayerVis(' + layer.id + ')" title="切换可见">' + (layer.visible ? '👁' : '🚫') + '</button>';
                    html += '<span class="layer-name" style="color:#ccc;' + (isActive ? 'font-weight:bold;' : '') + '" title="' + (isActive ? '当前绘制目标' : '点击切换') + '" onclick="event.stopPropagation();switchFogLayer(' + layer.id + ')">' + layer.name + '</span>';
                    if (fogLayers.length > 1) {
                        html += '<button class="layer-btn" onclick="event.stopPropagation();deleteFogLayerById(' + layer.id + ')" title="删除此迷雾层" style="color:var(--red);">✕</button>';
                    }
                    html += '</div>';
                }
                // 新建迷雾层按钮
                html += '<div style="padding:0.3rem;">';
                html += '<button onclick="setFogMode(\'newlayer\')" style="width:100%;padding:0.2rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer;font-size:0.7rem;">➕ 新建迷雾层</button>';
                html += '</div>';
                html += '<div style="border-top:1px solid var(--border);margin:0.3rem 0;"></div>';
            }

            if (!mapLayers.length) {
                html += '<div style="color:var(--text-dim);text-align:center;padding:0.5rem;">暂无图层</div>';
            } else if (isPL) {
                // PL 只读视图：仅显示图层名称和缩放比例，无操作按钮
                html += '<div style="font-size:0.7rem;color:var(--text-dim);padding:0.2rem 0.3rem;border-bottom:1px solid var(--border);margin-bottom:0.2rem;">🖼 地图图层（只读）</div>';
                html += mapLayers.map((l, i) => `
                    <div class="layer-item" style="opacity:${l.visible !== false ? '1' : '0.5'}">
                        <span style="font-size:0.8rem;">${l.visible !== false ? '👁' : '🚫'}</span>
                        <span class="layer-name" style="cursor:default;">${l.name}</span>
                        <span style="font-size:0.6rem;color:var(--cyan);flex-shrink:0;">${Math.round((l.scale||1)*100)}%</span>
                    </div>
                `).join('');
            } else {
                html += mapLayers.map((l, i) => `
                    <div class="layer-item${l.id === activeLayerId ? ' active' : ''}" onclick="setActiveLayer(${l.id})">
                        <button class="layer-btn" onclick="event.stopPropagation();toggleLayerVis(${l.id})" title="显示/隐藏">${l.visible !== false ? '👁' : '🚫'}</button>
                        <span class="layer-name" ondblclick="event.stopPropagation();startRenameLayer(${l.id})" title="双击改名">${l.name}</span>
                        <span style="font-size:0.6rem;color:var(--cyan);flex-shrink:0;">${Math.round((l.scale||1)*100)}%</span>
                        <button class="layer-btn" onclick="event.stopPropagation();scaleLayer(${l.id}, 0.1)" title="缩小图层">🔍-</button>
                        <button class="layer-btn" onclick="event.stopPropagation();scaleLayer(${l.id}, -0.1)" title="放大图层">🔍+</button>
                        <button class="layer-btn" onclick="event.stopPropagation();moveLayerUp(${l.id})" title="上移" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button class="layer-btn" onclick="event.stopPropagation();moveLayerDown(${l.id})" title="下移" ${i === mapLayers.length-1 ? 'disabled' : ''}>▼</button>
                        <button class="layer-btn" onclick="event.stopPropagation();removeLayer(${l.id})" title="删除" style="color:var(--red);">✕</button>
                    </div>
                `).join('');
            }
            // ━━ 损坏图层清理按钮 ━━
            var brokenCount = mapLayers.filter(function(l) { return !l.image; }).length;
            if (brokenCount > 0) {
                html += '<div style="padding:0.3rem;border-top:1px solid var(--red);margin-top:0.3rem;">';
                html += '<button onclick="event.stopPropagation();cleanupBrokenLayers()" style="width:100%;padding:0.3rem;background:rgba(220,53,69,0.15);border:1px solid var(--red);border-radius:4px;color:var(--red);cursor:pointer;font-size:0.7rem;">🗑 清理 ' + brokenCount + ' 个损坏图层</button>';
                html += '</div>';
            }

            el.innerHTML = html;
        }

        // ━━━ 清理损坏图层（无图片引用的占位图层）━━━
        window.cleanupBrokenLayers = function() {
            var before = mapLayers.length;
            mapLayers = mapLayers.filter(function(l) { return l.image !== null; });
            var removed = before - mapLayers.length;
            if (removed > 0) {
                console.log('[地图存档] 手动清理了 ' + removed + ' 个损坏图层');
                saveState();
                renderLayerList();
                redrawCanvas();
                if (typeof Toast !== 'undefined') {
                    Toast.success('已清理 ' + removed + ' 个损坏图层');
                } else {
                    alert('已清理 ' + removed + ' 个损坏图层');
                }
            }
        };

        function setActiveLayer(id) {
            activeLayerId = id;
            renderLayerList();
        }

        function addNewLayer() {
            document.getElementById('file-input').click();
        }

        function startRenameLayer(id) {
            const layer = mapLayers.find(l => l.id === id);
            if (!layer) return;
            const newName = prompt('图层名称:', layer.name);
            if (newName && newName.trim()) {
                layer.name = newName.trim();
                renderLayerList();
                debouncedSave();
                window._markDirty('layers');
            }
        }

        function scaleLayer(id, delta) {
            const layer = mapLayers.find(l => l.id === id);
            if (!layer) return;
            layer.scale = Math.max(0.1, Math.min(5, (layer.scale || 1) + delta));
            redrawCanvas();
            renderLayerList();
            debouncedSave();
            window._markDirty('layers');
        }

        function toggleLayerVis(id) {
            const layer = mapLayers.find(l => l.id === id);
            if (!layer) return;
            layer.visible = layer.visible === false ? true : false;
            redrawCanvas();
            renderLayerList();
            debouncedSave();
            window._markDirty('layers');
        }

        function moveLayerUp(id) {
            const idx = mapLayers.findIndex(l => l.id === id);
            if (idx <= 0) return;
            [mapLayers[idx-1], mapLayers[idx]] = [mapLayers[idx], mapLayers[idx-1]];
            redrawCanvas();
            renderLayerList();
            debouncedSave();
            window._markDirty('layers');
        }

        function moveLayerDown(id) {
            const idx = mapLayers.findIndex(l => l.id === id);
            if (idx < 0 || idx >= mapLayers.length - 1) return;
            [mapLayers[idx], mapLayers[idx+1]] = [mapLayers[idx+1], mapLayers[idx]];
            redrawCanvas();
            renderLayerList();
            debouncedSave();
            window._markDirty('layers');
        }

        function removeLayer(id) {
            if (!confirm('删除此图层？')) return;
            mapLayers = mapLayers.filter(l => l.id !== id);
            if (activeLayerId === id) activeLayerId = mapLayers.length ? mapLayers[mapLayers.length-1].id : null;
            redrawCanvas();
            renderLayerList();
            debouncedSave();
            window._markDirty('layers');
        }

        // ━━━ 导入地图（添加到图层）━━
        function importImage() { document.getElementById('file-input').click(); }
        function handleFileImport(event) {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const layerId = ++layerIdCounter;
                    const name = file.name.replace(/\.[^.]+$/, '');
                    // 计算初始缩放：画布的70%，保持图片宽高比
                    const imgRatio = img.width / img.height;
                    const canvasRatio = canvas.width / canvas.height;
                    let initScale;
                    if (imgRatio > canvasRatio) {
                        initScale = Math.round((canvas.width * 0.7 / img.width) * 100) / 100;
                    } else {
                        initScale = Math.round((canvas.height * 0.7 / img.height) * 100) / 100;
                    }
                    // 居中偏移
                    const scaledW = img.width * initScale;
                    const scaledH = img.height * initScale;
                    const cx = Math.round((canvas.width - scaledW) / 2);
                    const cy = Math.round((canvas.height - scaledH) / 2);

                    mapLayers.push({
                        id: layerId, name: name, image: img,
                        dataURL: e.target.result, url: '', visible: true,
                        offsetX: cx, offsetY: cy, scale: initScale
                    });
                    activeLayerId = layerId;
                    if (mapLayers.length === 1) { zoomFit(); }
                    redrawCanvas();
                    renderLayerList();
                    saveState();
                    // 上传图片到服务端（P0-1: 图片与状态分离）
                    var newLayer = mapLayers[mapLayers.length - 1];
                    try {
                        if (typeof uploadLayerImage === 'function') {
                            uploadLayerImage(newLayer).then(function() {
                                window._markDirty('layers');
                                window._onLocalChange();
                            });
                        }
                    } catch(e) { console.warn('图层上传跳过:', e.message); }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        }

        // ━━━ 服务器地图加载 ━━━
        function showServerMaps() {
            const modal = document.getElementById('server-maps-modal');
            modal.style.display = 'flex';
            fetchServerMaps();
        }

        function closeServerMaps() {
            document.getElementById('server-maps-modal').style.display = 'none';
        }

        async function fetchServerMaps() {
            const listEl = document.getElementById('server-maps-list');
            listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">加载中...</div>';
            try {
                const resp = await fetch('/api/server-maps');
                const data = await resp.json();
                if (!data.maps || data.maps.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">暂无服务器地图<br><small>将图片放入 骰娘/maps/ 目录</small></div>';
                    return;
                }
                listEl.innerHTML = data.maps.map(m => `
                    <div onclick="loadServerMap('${m.url}','${m.name}')"
                         style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:4px;cursor:pointer;border:1px solid var(--border);transition:all 0.15s;"
                         onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                        <span style="font-size:1.5rem;">🗺️</span>
                        <span style="flex:1;font-weight:bold;font-size:0.85rem;">${m.name}</span>
                        <span style="color:var(--text-dim);font-size:0.7rem;">${m.size_kb}KB</span>
                    </div>
                `).join('');
            } catch(e) {
                listEl.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px;">加载失败</div>';
            }
        }

        function loadServerMap(url, name) {
            closeServerMaps();
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const layerId = ++layerIdCounter;
                const cleanName = name.replace(/\.[^.]+$/, '');
                // Calculate initial scale to fit 70% of canvas
                const imgRatio = img.width / img.height;
                const canvasRatio = canvas.width / canvas.height;
                let initScale;
                if (imgRatio > canvasRatio) {
                    initScale = Math.round((canvas.width * 0.7 / img.width) * 100) / 100;
                } else {
                    initScale = Math.round((canvas.height * 0.7 / img.height) * 100) / 100;
                }
                const scaledW = img.width * initScale;
                const scaledH = img.height * initScale;
                const cx = Math.round((canvas.width - scaledW) / 2);
                const cy = Math.round((canvas.height - scaledH) / 2);

                // Convert to dataURL for save persistence
                const cvs = document.createElement('canvas');
                cvs.width = img.width; cvs.height = img.height;
                const cctx = cvs.getContext('2d');
                cctx.drawImage(img, 0, 0);
                const dataURL = cvs.toDataURL('image/png');

                mapLayers.push({
                    id: layerId, name: cleanName, image: img,
                    dataURL: dataURL, url: url, visible: true,
                    offsetX: cx, offsetY: cy, scale: initScale
                });
                activeLayerId = layerId;
                if (mapLayers.length === 1) { zoomFit(); }
                redrawCanvas();
                renderLayerList();
                saveState();
            window._onLocalChange();
            };
            img.onerror = () => {
                alert('加载地图失败: ' + name);
            };
            img.src = url;
        }


        // ━━━ 视图操作 ━━━
        // ━━━ 迷雾下拉菜单 ━━━
        function toggleFogDropdown() {
            const btn = document.getElementById('fog-btn');
            const menu = document.getElementById('fog-dropdown-menu');
            const willShow = !menu.classList.contains('show');
            if (willShow) positionDropdownMenu(btn, menu);
            menu.classList.toggle('show');
        }
        function toggleFogVisibility() {
            setFogMode(fogVisible ? 'hide' : 'show');
        }
        function deleteFogLayer() {
            setFogMode('delete');
        }
        function toggleFogLayerVis(id) {
            const layer = fogLayers.find(l => l.id === id);
            if (layer) { layer.visible = !layer.visible; redrawFogCanvas(); debouncedSave(); renderLayerList(); window._markDirty('fog'); }
        }
        function switchFogLayer(id) {
            if (fogLayers.find(l => l.id === id)) {
                activeFogLayerId = id;
                redrawFogCanvas();
                renderLayerList();
            }
        }
        function renumberFogLayers() {
            // 将非空迷雾图层重新编号为 迷雾1, 迷雾2...
            const active = fogLayers.filter(l => l.polygons.length > 0);
            for (let i = 0; i < active.length; i++) {
                active[i].name = '迷雾 ' + (i + 1);
            }
        }

        function deleteFogLayerById(id) {
            if (fogLayers.length <= 1) { alert('至少保留一个迷雾图层'); return; }
            const layer = fogLayers.find(l => l.id === id);
            if (!layer) return;
            if (!confirm('删除 "' + layer.name + '"（含 ' + layer.polygons.length + ' 个迷雾区域）？')) return;
            fogLayers = fogLayers.filter(l => l.id !== id);
            if (activeFogLayerId === id) activeFogLayerId = fogLayers[0] ? fogLayers[0].id : null;
            currentFogPoints = null;
            renumberFogLayers();
            redrawFogCanvas();
            debouncedSave();
            renderLayerList();
            window._markDirty('fog');
        }

        function setFogMode(mode) {
            document.getElementById('fog-dropdown-menu').classList.remove('show');
            const fogCanvas = document.getElementById('fog-canvas');
            ensureFogLayer();

            if (mode === 'draw') {
                setTool('fog');
            } else if (mode === 'show') {
                fogVisible = true;
                fogCanvas.style.display = 'block';
                updateAllFogCoverage();
                redrawFogCanvas();
                debouncedSave();
                window._markDirty('fog');
            } else if (mode === 'hide') {
                fogVisible = false;
                fogCanvas.style.display = 'none';
                updateAllFogCoverage();  // 显示所有被遮的 token
                redrawFogCanvas();
                debouncedSave();
                window._markDirty('fog');
            } else if (mode === 'delete') {
                if (window._isDM !== true) { alert('⚠ 只有DM可以管理战争迷雾'); return; }
                if (confirm('删除所有战争迷雾图层？此操作不可撤销。')) {
                    clearAllFogLayers();
                    redrawFogCanvas(); debouncedSave();
                    window._markDirty('fog');
                }
            } else if (mode === 'newlayer') {
                if (window._isDM !== true) { alert('⚠ 只有DM可以管理战争迷雾'); return; }
                const id = ++fogLayerIdCounter;
                fogLayers.push({ id, name: '迷雾 ' + id, polygons: [], visible: true });
                activeFogLayerId = id;
                redrawFogCanvas();
                debouncedSave();
                window._markDirty('fog');
            } else if (mode === 'nextlayer') {
                if (window._isDM !== true) return;
                const idx = fogLayers.findIndex(l => l.id === activeFogLayerId);
                const nextIdx = (idx + 1) % fogLayers.length;
                activeFogLayerId = fogLayers[nextIdx].id;
                redrawFogCanvas();
            } else if (mode === 'renamelayer') {
                if (window._isDM !== true) return;
                const layer = getActiveFogLayer();
                const newName = prompt('输入迷雾层名称:', layer.name);
                if (newName && newName.trim()) {
                    layer.name = newName.trim();
                    redrawFogCanvas();
                    debouncedSave();
                    window._markDirty('fog');
                }
            } else if (mode === 'togglevis') {
                if (window._isDM !== true) return;
                const layer = getActiveFogLayer();
                layer.visible = !layer.visible;
                redrawFogCanvas();
                debouncedSave();
                window._markDirty('fog');
            } else if (mode === 'deletelayer') {
                if (window._isDM !== true) { alert('⚠ 只有DM可以管理战争迷雾'); return; }
                if (fogLayers.length <= 1) {
                    alert('至少保留一个迷雾图层。如果要全部删除请选择"删除全部迷雾"。');
                    return;
                }
                const layer = getActiveFogLayer();
                if (confirm(`确定删除 "${layer.name}"（含 ${layer.polygons.length} 个迷雾区域）吗？`)) {
                    fogLayers = fogLayers.filter(l => l.id !== activeFogLayerId);
                    activeFogLayerId = fogLayers[0].id;
                    currentFogPoints = null;
                    renumberFogLayers();
                    redrawFogCanvas();
                    debouncedSave();
                    window._markDirty('fog');
                }
            }
        }

        function toggleMoveLayer() {
            movingLayer = !movingLayer;
            const btn = document.getElementById('move-layer-btn');
            if (movingLayer) {
                btn.classList.add('active');
                btn.textContent = '📌 移动中... (拖拽地图移动当前图层)';
                mapArea.style.cursor = 'move';
            } else {
                btn.classList.remove('active');
                btn.textContent = '📌 移动当前图层';
                mapArea.classList.add('cursor-grab');
            }
        }

        // ━━━ 掷骰弹窗 ━━━
        let dicePopupOpen = false;
        window.toggleDicePopup = function() {
            dicePopupOpen = !dicePopupOpen;
            document.getElementById('dice-popup').classList.toggle('show', dicePopupOpen);
            if (dicePopupOpen) loadDicePopupChars();
        };

        async function loadDicePopupChars() {
            try {
                const identity = getIdentity();
                const resp = await fetch(`/api/characters?name=${encodeURIComponent(identity.name)}&role=${encodeURIComponent(identity.role)}`);
                const data = await resp.json();
                const chars = Array.isArray(data) ? data : (data.characters || []);
                const select = document.getElementById('dicepop-char');
                select.innerHTML = '<option value="">⚡ 选择角色</option>';
                chars.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    select.appendChild(opt);
                });
            } catch(e) {}
        }

        window.dicePopupSetChar = async function() {
            const charId = document.getElementById('dicepop-char').value;
            if (!charId) return;
            await fetch('/api/character/' + charId + '/use', {method:'POST'});
        };

        window.getDicePopupAdv = function() {
            const active = document.querySelector('#dicepop-adv .active');
            return active ? active.dataset.adv : '';
        }

        // ━━ CSS骰子面渲染 ━━
        // d6及以下用点阵，d6以上显示数值
        var DICE_DOT_MAP = {
            1: [0,0,0, 0,1,0, 0,0,0],
            2: [1,0,0, 0,0,0, 0,0,1],
            3: [1,0,0, 0,1,0, 0,0,1],
            4: [1,0,1, 0,0,0, 1,0,1],
            5: [1,0,1, 0,1,0, 1,0,1],
            6: [1,0,1, 1,0,1, 1,0,1]
        };
        function renderDiceFace(value, rolling, sides) {
            var cls = rolling ? 'dice-face rolling' : 'dice-face';
            // 超过6面的骰子显示数值而非点阵
            if (sides && sides > 6) {
                return '<div class="' + cls + '" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:bold;color:#2c1810;">' + value + '</div>';
            }
            var dots = DICE_DOT_MAP[value] || DICE_DOT_MAP[6];
            var html = '<div class="' + cls + '">';
            for (var i = 0; i < 9; i++) {
                html += '<div class="dice-dot' + (dots[i] ? '' : ' hidden-dot') + '"></div>';
            }
            html += '</div>';
            return html;
        }
        function renderDiceAnimation(values, total, expr, charName, hidden, keepInfo, sides) {
            var html = '<div class="dice-anim-area">';
            var displaySides = sides || 6;
            for (var i = 0; i < values.length; i++) {
                html += '<div style="text-align:center;">';
                html += renderDiceFace(values[i], false, displaySides);
                html += '</div>';
            }
            html += '</div>';
            var prefix = charName ? charName + ' 投出了 ' : '';
            html += '<div class="dice-result-text">' + (hidden ? '🌫 ' : '') + expr + (keepInfo ? ' ' + keepInfo : '') + '</div>';
            html += '<div class="dice-total-badge">' + prefix + '[' + total + '] 点</div>';
            return html;
        }

        window.dicePopupRoll = async function() {
            let expr = document.getElementById('dicepop-expr').value.trim();
            if (!expr) return;
            const adv = window.getDicePopupAdv();
            if (adv === 'adv') expr = 'adv ' + expr;
            if (adv === 'dis') expr = 'dis ' + expr;
            const hidden = document.getElementById('dicepop-hidden').checked;
            const resultEl = document.getElementById('dicepop-result');

            // 显示滚动动画
            var shakeValues = [];
            var shakeCount = 3; // 固定3个摇晃骰子
            for (var si = 0; si < shakeCount; si++) {
                shakeValues.push(Math.floor(Math.random() * 6) + 1);
            }
            resultEl.innerHTML = '<div class="dice-anim-area">' +
                shakeValues.map(function(v) { return renderDiceFace(v, true, 6); }).join('') +
                '</div><div style="text-align:center;color:var(--cyan);font-size:0.85rem;">🎲 投掷中...</div>';

            try {
                const resp = await fetch('/api/roll', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({expression: expr})});
                const data = await resp.json();
                if (data.error) { resultEl.innerHTML = '<span style="color:var(--red);">❌ ' + data.error + '</span>'; return; }

                var rolls = data.rolls || [];
                var keepInfo = '';
                if (data.advantage === true) { keepInfo = '[' + rolls.join(',') + '] 取高'; }
                else if (data.advantage === false) { keepInfo = '[' + rolls.join(',') + '] 取低'; }

                // 解析骰子面数
                var parsedSides = 6;
                var m = expr.match(/d(\d+)/i);
                if (m) parsedSides = parseInt(m[1]) || 6;

                // 模式标签（复用上面的adv变量）
                var modeLabel = '';
                if (adv === 'adv') modeLabel = '<span style="display:inline-block;background:#27ae60;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:4px;">✨ 优势</span>';
                else if (adv === 'dis') modeLabel = '<span style="display:inline-block;background:#c0392b;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:4px;">💀 劣势</span>';
                else modeLabel = '<span style="display:inline-block;background:var(--surface2);color:var(--text-dim);padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:4px;">正常</span>';

                // 延迟显示结果
                setTimeout(function() {
                    resultEl.innerHTML = renderDiceAnimation(rolls, data.total, data.expression || expr, data.char_name || '', hidden, keepInfo, parsedSides) + modeLabel;
                }, 400);

                // 非暗骰广播到聊天室
                if (!hidden) {
                    var unameInput = document.getElementById('chat-username');
                    var broadcaster = (unameInput && unameInput.value.trim()) || '匿名';
                    var extra = '';
                    if (data.advantage === true) { extra = ' [' + rolls.join(',') + '] 取高'; }
                    else if (data.advantage === false) { extra = ' [' + rolls.join(',') + '] 取低'; }
                    var chatText = '🎲 ' + (data.char_name ? data.char_name + ' ' : '') + expr + ' = [' + data.total + ']' + extra;
                    var senderRole = 'PL';
                    try { var s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (s && s.role) senderRole = s.role; } catch(e) {}
                    fetch('/api/dice-broadcast', {method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({name: broadcaster, text: chatText, hidden: false, role: senderRole})
                    }).catch(() => {});
                }
            } catch(e) { resultEl.innerHTML = '<span style="color:var(--red);">网络错误</span>'; }
        }

        window.dicePopupQuick = function(expr) {
            document.getElementById('dicepop-expr').value = expr;
            document.querySelectorAll('#dicepop-adv button').forEach(b => b.classList.remove('active'));
            document.querySelector('#dicepop-adv button[data-adv=""]').classList.add('active');
            window.dicePopupRoll();
        }

        window.dicePopupQuickCheck = async function(skill) {
            var resultEl = document.getElementById('dicepop-result');
            resultEl.textContent = '...';
            try {
                var resp = await fetch('/api/check', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({target: skill, advantage: null})});
                var data = await resp.json();
                if (data.error) { resultEl.textContent = '❌ ' + data.error; return; }
                var modLabel = data.total_mod >= 0 ? '+' + data.total_mod : '' + data.total_mod;
                var prefix = data.char_name ? data.char_name + ' 投出了 ' : '';
                resultEl.textContent = prefix + '[' + data.total + '] 点 (' + skill + ' d20:' + data.d20_roll + ' ' + modLabel + ')';
                // 检定广播到聊天室
                var unameInput = document.getElementById('chat-username');
                var broadcaster = (unameInput && unameInput.value.trim()) || '匿名';
                var chatText = '🎯 ' + skill + '检定: [' + data.total + '] (d20:' + data.d20_roll + ' ' + modLabel + ')';
                if (data.char_name) chatText = data.char_name + ' ' + chatText;
                var senderRole = 'PL';
                try { var s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (s && s.role) senderRole = s.role; } catch(e) {}
                fetch('/api/dice-broadcast', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({name: broadcaster, text: chatText, hidden: false, role: senderRole})
                }).catch(() => {});
            } catch(e) { resultEl.textContent = '网络错误'; }
        }

        // ━━━ 工具栏第二行折叠 ━━━
        let toolbarRow2Visible = false;
        function toggleToolbarRow2() {
            toolbarRow2Visible = !toolbarRow2Visible;
            const row2 = document.getElementById('toolbar-row-2');
            const btn = document.getElementById('toolbar-toggle-btn');
            const delta = toolbarRow2Visible ? 48 : -48;  // 展开+48px，折叠-48px

            if (toolbarRow2Visible) {
                row2.classList.remove('collapsed');
                btn.textContent = '▲';
            } else {
                row2.classList.add('collapsed');
                btn.textContent = '▼';
            }

            // 对每个固定定位元素在其当前 top 值上偏移，保留各自初始偏移量和拖拽位置
            const els = ['map-area', 'char-sidebar', 'token-info-panel', 'layer-panel'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const cur = parseInt(getComputedStyle(el).top) || 0;
                el.style.top = (cur + delta) + 'px';
            });
            document.documentElement.style.setProperty('--toolbar-total', toolbarRow2Visible ? '96px' : '48px');
        }

        function toggleMapLock() {
            mapLocked = !mapLocked;
            const btn = document.getElementById('lock-btn');
            if (mapLocked) {
                btn.textContent = '🔒';
                btn.classList.add('active');
                mapArea.style.cursor = 'default';
            } else {
                btn.textContent = '🔓';
                btn.classList.remove('active');
                mapArea.classList.add('cursor-grab');
            }
        }

        function zoomIn() { if (mapLocked) return; scale = Math.min(10, scale * 1.25); applyTransform(); debouncedSave(); }
        function zoomOut() { if (mapLocked) return; scale = Math.max(0.1, scale * 0.8); applyTransform(); debouncedSave(); }

        // ━━━ 计算当前画布所有内容的边界框 ━━━
        function getContentBounds() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            // 1. 地图图层（含图层自身的偏移和缩放）
            for (const layer of mapLayers) {
                if (layer.visible === false || !layer.image) continue;
                const ox = layer.offsetX || 0;
                const oy = layer.offsetY || 0;
                const s = layer.scale || 1;
                const w = layer.image.width * s;
                const h = layer.image.height * s;
                minX = Math.min(minX, ox);
                minY = Math.min(minY, oy);
                maxX = Math.max(maxX, ox + w);
                maxY = Math.max(maxY, oy + h);
            }

            // 2. 画笔笔画
            for (const stroke of brushStrokes) {
                for (const pt of stroke.points) {
                    minX = Math.min(minX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxX = Math.max(maxX, pt.x);
                    maxY = Math.max(maxY, pt.y);
                }
            }

            // 3. 文字框（估算尺寸，文字框为绝对定位）
            for (const box of textBoxes) {
                minX = Math.min(minX, box.x);
                minY = Math.min(minY, box.y);
                if (box.el) {
                    maxX = Math.max(maxX, box.x + box.el.offsetWidth);
                    maxY = Math.max(maxY, box.y + box.el.offsetHeight);
                } else {
                    maxX = Math.max(maxX, box.x + 100);
                    maxY = Math.max(maxY, box.y + 28);
                }
            }

            // 4. 地图标记（角色头像）
            for (const token of mapTokens) {
                minX = Math.min(minX, token.x);
                minY = Math.min(minY, token.y);
                maxX = Math.max(maxX, token.x + token.size);
                maxY = Math.max(maxY, token.y + token.size);
            }

            if (!isFinite(minX)) return null;
            return { minX, minY, maxX, maxY };
        }

        // ━━━ 适应：根据当前画布内容调整视角 ━━━
        function zoomFit() {
            if (mapLocked) return;
            const bounds = getContentBounds();
            const rect = mapArea.getBoundingClientRect();
            const pad = 40;

            if (!bounds) {
                // 无内容时适应整个画布网格
                scale = Math.min((rect.width - pad*2) / canvas.width, (rect.height - pad*2) / canvas.height, 2);
                offsetX = (rect.width - canvas.width * scale) / 2;
                offsetY = (rect.height - canvas.height * scale) / 2;
            } else {
                const contentW = bounds.maxX - bounds.minX;
                const contentH = bounds.maxY - bounds.minY;
                // 画布坐标下的内边距
                const cp = Math.max(contentW, contentH) * 0.05 + 20;
                const totalW = contentW + cp * 2;
                const totalH = contentH + cp * 2;

                scale = Math.min((rect.width - pad*2) / totalW, (rect.height - pad*2) / totalH, 5);
                // 将内容中心对齐到视口中心
                const cx = bounds.minX + contentW / 2;
                const cy = bounds.minY + contentH / 2;
                offsetX = rect.width / 2 - cx * scale;
                offsetY = rect.height / 2 - cy * scale;
            }
            applyTransform();
            debouncedSave();
        }

        // ━━━ 重置：回到 1:1（100%）原始比例，内容居中 ━━━
        function resetView() {
            if (mapLocked) return;
            const bounds = getContentBounds();
            if (!bounds) {
                // 无内容时重置为默认视角
                scale = 1; offsetX = 0; offsetY = 0;
            } else {
                const rect = mapArea.getBoundingClientRect();
                // 重置为 100% 原始比例，内容居中
                scale = 1;
                const contentW = bounds.maxX - bounds.minX;
                const contentH = bounds.maxY - bounds.minY;
                const cx = bounds.minX + contentW / 2;
                const cy = bounds.minY + contentH / 2;
                offsetX = rect.width / 2 - cx * scale;
                offsetY = rect.height / 2 - cy * scale;
            }
            applyTransform();
            debouncedSave();
        }
        function toggleClearDropdown() {
            const btn = document.querySelector('#clear-dropdown-wrap > .tool-btn');
            const menu = document.getElementById('clear-dropdown-menu');
            if (!menu) return;
            const willShow = !menu.classList.contains('show');
            if (willShow && btn) positionDropdownMenu(btn, menu);
            menu.classList.toggle('show');
        }
        // 点击其他地方关闭清除下拉菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#clear-dropdown-wrap')) {
                const m = document.getElementById('clear-dropdown-menu');
                if (m) m.classList.remove('show');
            }
        });

        function clearDrawings() {
            if (window._isDM !== true) { alert('⚠ 只有DM可以清除内容'); return; }
            if (!confirm('清除所有涂画和文字？（角色标记和地图图片保留）')) return;
            brushStrokes = [];
            fillBaseImage = new Image(); fillBaseDataURL = '';  // 清除填充基底
            textBoxes.forEach(b => { if(b.el) b.el.remove(); }); textBoxes = [];
            selectedElement = null; clearMultiSelect(); redrawCanvas();
            window._wsSend({type: 'strokes_clear'});
            window._wsSend({type: 'texts_update', data: []});
            saveState();
        }
        function clearAll() {
            if (window._isDM !== true) { alert('⚠ 只有DM可以清除全部内容'); return; }
            if (!confirm('清除全部内容（包括地图图片和角色标记）？')) return;
            brushStrokes = [];
            fillBaseImage = new Image(); fillBaseDataURL = '';  // 清除填充基底
            textBoxes.forEach(b => { if(b.el) b.el.remove(); }); textBoxes = [];
            mapTokens.forEach(t => { if(t.el) t.el.remove(); }); mapTokens = [];
            selectedElement = null; clearMultiSelect(); mapLayers = []; activeLayerId = null;
            clearAllFogLayers(); redrawFogCanvas();
            canvas.width = 5000; canvas.height = 5000; drawCanvas.width = 5000; drawCanvas.height = 5000; fogCanvas.width = 5000; fogCanvas.height = 5000;
            renderLayerList();
            setActiveSave(null, null);
            var reg = getSlotRegistry(); reg.activeSlotId = null; saveSlotRegistry(reg);
            zoomFit(); redrawCanvas();
            wsSend({type: 'clear_all'});
            saveState();
        }

        // ━━━ 掷骰弹窗优势按钮 ━━━
        document.querySelectorAll('#dicepop-adv button').forEach(btn => {
            btn.addEventListener('click', function() {
                this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            });
        });
        makeDraggable(document.getElementById('dice-popup'), document.getElementById('dice-popup-drag'));

        // ━━━ 侧边栏标签切换 ━━━
        function switchSidebarTab(tab) {
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            document.querySelector(`.sidebar-tab[data-tab="${tab}"]`).classList.add('active');
            document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('sidebar-panel-' + tab).classList.add('active');

            if (tab === 'chars') loadCharTokens();
            if (tab === 'combat') loadMapCombatCharSelect();
        }

        // ━━━ 地图内嵌战斗面板（与战斗页共享 localStorage）━━
        const COMBAT_STORAGE_KEY = 'dnd_combat_state'; // 与 combat.html 共用
        let mapCombatants = [];
        let mapCharCache = {};
        var _mapLocalChangeTs = 0;
        var _mapCombatLastTs = 0;

        function saveMapCombatLocal() {
            if (!mapCombatants.length) {
                _mapCombatLastTs = 0;
                localStorage.removeItem(COMBAT_STORAGE_KEY);
                return;
            }
            try {
                localStorage.setItem(COMBAT_STORAGE_KEY, JSON.stringify({
                    combatants: mapCombatants.map(c => ({...c})),
                    round: document.getElementById('map-round-info')?.textContent || '',
                    _ts: _mapCombatLastTs
                }));
            } catch(e) {}
        }

        function restoreMapCombatLocal() {
            try {
                const raw = localStorage.getItem(COMBAT_STORAGE_KEY);
                if (!raw) return false;
                const state = JSON.parse(raw);
                if (!state.combatants || !state.combatants.length) return false;
                _mapCombatLastTs = state._ts || 0;
                mapCombatants = state.combatants.map(c => ({...c}));
                mapRenderInitiative();
                mapUpdateDmgDropdown();
                if (state.round) {
                    document.getElementById('map-round-info').textContent = state.round;
                }
                return true;
            } catch(e) { return false; }
        }

        async function loadMapCombatCharSelect() {
            const select = document.getElementById('map-combat-char-select');
            // 保留默认选项
            select.innerHTML = '<option value="">— 选择导入的角色 —</option>';
            try {
                const identity = getIdentity();
                const role = identity.name ? identity.role : 'DM';
                const resp = await fetch(`/api/characters?name=${encodeURIComponent(identity.name)}&role=${encodeURIComponent(role)}`);
                const data = await resp.json();
                const chars = Array.isArray(data) ? data : (data.characters || []);
                if (chars.length) {
                    chars.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = `${c.name} (${c.level || 1}级 ${c.class || ''})`;
                        select.appendChild(opt);
                    });
                }
            } catch(e) { console.error('加载角色列表失败', e); }
        }

        async function onMapCombatCharSelect() {
            const charId = document.getElementById('map-combat-char-select').value;
            if (!charId) {
                document.getElementById('map-combatant-name').value = '';
                document.getElementById('map-combatant-hp').value = '';
                document.getElementById('map-combatant-hp-max').value = '';
                document.getElementById('map-combatant-ac').value = '10';
                return;
            }
            if (!mapCharCache[charId]) {
                const resp = await fetch(`/api/character/${charId}`);
                const data = await resp.json();
                if (data.error) { alert(data.error); return; }
                mapCharCache[charId] = data;
            }
            const char = mapCharCache[charId];
            document.getElementById('map-combatant-name').value = char.name || '';
            document.getElementById('map-combatant-hp').value = char.hp_current || 0;
            document.getElementById('map-combatant-hp-max').value = char.hp_max || 0;
            document.getElementById('map-combatant-ac').value = char.ac || 10;
        }

        let mapCombatStarted = false;

        function mapAddCombatant() {
            const name = document.getElementById('map-combatant-name').value.trim();
            if (!name) { alert('请输入名称'); return; }

            const hp = parseInt(document.getElementById('map-combatant-hp').value) || 0;
            const hpMax = parseInt(document.getElementById('map-combatant-hp-max').value) || hp;
            const ac = parseInt(document.getElementById('map-combatant-ac').value) || 10;

            // 先攻：加入后手动在列表中填入
            const initiative = null;  // null = 未填入

            // 记录添加者
            const identity = typeof getIdentity === 'function' ? getIdentity() : { name: '', role: 'PL' };

            const charSelect = document.getElementById('map-combat-char-select');
            const selectedCharId = charSelect ? parseInt(charSelect.value) || null : null;
            mapCombatants.push({
                name, initiative,
                initDetail: '',
                hp, hpMax, ac, conditions: [],
                charId: selectedCharId,
                addedBy: identity.name || '',
                addedByRole: identity.role || 'PL'
            });
            // 不自动排序
            _mapLocalChangeTs = Date.now();
            mapRenderInitiative();
            mapUpdateDmgDropdown();
            document.getElementById('map-combat-char-select').value = '';
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapStartCombat() {
            if (!mapCombatants.length) { alert('请先添加战斗参与者'); return; }
            var missing = mapCombatants.filter(function(c) { return c.initiative === undefined || c.initiative === null || isNaN(c.initiative); });
            if (missing.length > 0) {
                alert('有 ' + missing.length + ' 位角色尚未准备好…\n请为所有参战者填入先攻值后再开始战斗。');
                return;
            }
            mapCombatants.sort((a, b) => b.initiative - a.initiative);
            mapCombatants.forEach(c => c.isCurrent = false);
            mapCombatants[0].isCurrent = true;
            mapCombatStarted = true;
            document.getElementById('map-round-info').textContent = '第 1 轮';
            mapRenderInitiative();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapNextCombatant() {
            if (!mapCombatants.length) return;
            const currentIdx = mapCombatants.findIndex(c => c.isCurrent);
            if (currentIdx >= 0) mapCombatants[currentIdx].isCurrent = false;
            const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % mapCombatants.length;
            mapCombatants[nextIdx].isCurrent = true;
            mapRenderInitiative();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapPrevCombatant() {
            if (!mapCombatants.length) return;
            const currentIdx = mapCombatants.findIndex(c => c.isCurrent);
            if (currentIdx >= 0) mapCombatants[currentIdx].isCurrent = false;
            const prevIdx = currentIdx <= 0 ? mapCombatants.length - 1 : currentIdx - 1;
            mapCombatants[prevIdx].isCurrent = true;
            mapRenderInitiative();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapPrevRound() {
            if (!mapCombatants.length) return;
            mapCombatants.forEach(c => c.isCurrent = false);
            mapCombatants[0].isCurrent = true;
            const round = Math.max(1, parseInt((document.getElementById('map-round-info').textContent.match(/\d+/) || ['1'])[0]) - 1);
            document.getElementById('map-round-info').textContent = `第 ${round} 轮`;
            mapRenderInitiative();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapNextRound() {
            if (!mapCombatants.length) return;
            mapCombatants.forEach(c => c.isCurrent = false);
            mapCombatants[0].isCurrent = true;
            const round = parseInt((document.getElementById('map-round-info').textContent.match(/\d+/) || ['1'])[0]) + 1;
            document.getElementById('map-round-info').textContent = `第 ${round} 轮`;
            mapRenderInitiative();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapRenderInitiative() {
            // 先攻输入框聚焦时跳过重渲染，防止用户输入被覆盖（"闪回"）
            if (document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('map-init-input-')) {
                return;
            }
            const el = document.getElementById('map-initiative-list');
            if (!mapCombatants.length) {
                mapCombatStarted = false;
                el.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:0.5rem;">添加参与者后填入先攻，点击"开始"</div>';
                return;
            }
            const isDM = window._isDM === true;
            const identity = typeof getIdentity === 'function' ? getIdentity() : { name: '' };
            el.innerHTML = mapCombatants.map((c, i) => {
                const hpPct = c.hpMax > 0 ? Math.round(c.hp / c.hpMax * 100) : 100;
                const hpColor = hpPct <= 25 ? 'var(--red)' : (hpPct <= 50 ? 'var(--gold)' : 'var(--green)');
                const canEdit = isDM || (c.addedBy && c.addedBy === identity.name);
                const initDisplay = canEdit
                    ? `<span style="color:var(--text-dim);font-size:0.7rem;">先攻:</span><input type="number" id="map-init-input-${i}" value="${c.initiative || ''}" placeholder="--"
                            style="width:40px;padding:0.1rem;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--gold);font-size:0.72rem;text-align:center;">
                       <button onclick="mapConfirmInitiative(${i})" title="确定先攻" style="background:var(--accent);border:none;color:#fff;cursor:pointer;padding:0.1rem 0.25rem;border-radius:3px;font-size:0.65rem;margin-left:1px;">✓</button>`
                    : `<span style="color:var(--text-dim);font-size:0.7rem;">先攻:</span><span style="color:var(--cyan);font-weight:bold;font-size:0.78rem;">${c.initiative || '--'}</span>`;
                return `
                <div class="combatant-row${c.isCurrent ? ' current' : ''}" style="font-size:0.78rem;padding:0.35rem 0.4rem;">
                    <span class="combatant-name" style="font-size:0.8rem;">${mapCombatStarted ? (i+1)+'. ' : ''}${c.name}${c.isCurrent ? ' ◀' : ''}</span>
                    ${initDisplay}
                    <span style="color:${hpColor};font-size:0.75rem;">❤️${c.hp}/${c.hpMax}</span>
                    <button onclick="mapRemoveCombatant(${i})" title="脱离战斗"
                            style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.9rem;padding:0 0.2rem;">✕</button>
                </div>`;
            }).join('');
        }

        function mapUpdateInitiative(index, value) {
            var v = (value !== '' && value !== null) ? parseInt(value) : null;
            if (isNaN(v)) v = null;
            mapCombatants[index].initiative = v;
            mapCombatants[index].initDetail = value !== '' ? '手动: ' + (parseInt(value)||0) : '';
        }

        function mapConfirmInitiative(index) {
            const input = document.getElementById('map-init-input-' + index);
            if (!input) return;
            const value = input.value;
            mapUpdateInitiative(index, value);
            _mapLocalChangeTs = Date.now();
            mapRenderInitiative();
            if (typeof saveMapCombatLocal === 'function') saveMapCombatLocal();
            if (typeof debouncedSave === 'function') debouncedSave();
            pushCombatState();  // 立即推送先攻变更到服务器，防止轮询覆盖
        }

        function mapUpdateDmgDropdown() {
            const select = document.getElementById('map-dmg-target');
            const currentVal = select.value;
            select.innerHTML = '<option value="">— 选择目标 —</option>';
            mapCombatants.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = `${c.name} (❤️${c.hp}/${c.hpMax})`;
                if (c.name === currentVal) opt.selected = true;
                select.appendChild(opt);
            });
        }

        async function mapApplyDamage() {
            const target = document.getElementById('map-dmg-target').value;
            if (!target) { alert('请选择目标'); return; }
            const amount = parseInt(document.getElementById('map-dmg-amount').value) || 0;
            if (amount <= 0) { alert('请输入有效伤害值'); return; }

            const c = mapCombatants.find(c => c.name === target);
            if (!c) { alert(`未找到: ${target}`); return; }

            c.hp = Math.max(0, c.hp - amount);
            const status = c.hp <= 0 ? ' 💀 已倒地!' : '';
            mapRenderInitiative();
            mapUpdateDmgDropdown();
            document.getElementById('map-dmg-amount').value = '';
            // 同步到角色数据库和地图标记
            await syncCombatantHP(c);
            alert(`${c.name} 受到 ${amount} 点伤害，剩余 HP: ${c.hp}/${c.hpMax}${status}`);
        }

        async function mapApplyHeal() {
            const target = document.getElementById('map-dmg-target').value;
            if (!target) { alert('请选择目标'); return; }
            const amount = parseInt(document.getElementById('map-dmg-amount').value) || 0;
            if (amount <= 0) { alert('请输入有效治疗值'); return; }

            const c = mapCombatants.find(c => c.name === target);
            if (!c) { alert(`未找到: ${target}`); return; }

            c.hp = Math.min(c.hpMax, c.hp + amount);
            mapRenderInitiative();
            mapUpdateDmgDropdown();
            document.getElementById('map-dmg-amount').value = '';
            // 同步到角色数据库和地图标记
            await syncCombatantHP(c);
            alert(`${c.name} 恢复 ${amount} 点HP，剩余 HP: ${c.hp}/${c.hpMax}`);
        }

        async function syncCombatantHP(c) {
            if (!c.charId) return;  // 非角色（手动输入名称的NPC）不同步
            try {
                await fetch(`/api/character/${c.charId}/hp`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({amount: c.hp, setAbsolute: true})
                });
                // 清除API缓存让下次查询获取最新数据
                delete charDataCache[c.charId];
            } catch(e) {}
        }

        function mapRemoveCombatant(index) {
            const c = mapCombatants[index];
            if (!confirm(`将 "${c.name}" 脱离战斗？`)) return;
            mapCombatants.splice(index, 1);
            if (c.isCurrent && mapCombatants.length > 0) {
                mapCombatants[index % mapCombatants.length].isCurrent = true;
            }
            _mapLocalChangeTs = Date.now();
            mapRenderInitiative();
            mapUpdateDmgDropdown();
            saveMapCombatLocal();
            debouncedSave();
        }

        function mapClearCombat() {
            if (!confirm('确认清空战斗？')) return;
            mapCombatants = [];
            document.getElementById('map-round-info').textContent = '';
            mapRenderInitiative();
            mapUpdateDmgDropdown();
            localStorage.removeItem(COMBAT_STORAGE_KEY);
            pushCombatState();
            debouncedSave();
        }

        // ━━━ 战斗状态服务器同步 ━━━
        function pushCombatState() {
            const state = {
                combatants: mapCombatants.map(c => ({...c})),
                round: document.getElementById('map-round-info')?.textContent || '',
                _ts: _mapCombatLastTs
            };
            if (!state.combatants.length) {
                fetch('/api/combat-state', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({state: {combatants:[], round:'', _ts:0}})}).catch(()=>{});
                return;
            }
            fetch('/api/combat-state', {method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({state: state})}).then(r=>r.json()).then(d => {
                    if (d.timestamp) _mapCombatLastTs = d.timestamp;
                }).catch(()=>{});
        }

        let combatSyncTimer = null;
        function startCombatSync() {
            if (combatSyncTimer) clearInterval(combatSyncTimer);
            combatSyncTimer = setInterval(() => {
                // 拉取服务器战斗状态
                fetch('/api/combat-state').then(r=>r.json()).then(data => {
                    if (!data.ok || !data.state) return;
                    const s = data.state;
                    if (!s.combatants) return;
                    const remoteTs = s._ts || 0;
                    // 本地最近3秒有编辑时跳过远程覆盖（防闪回）
                    if (Date.now() - _mapLocalChangeTs < 3000) return;
                    if (remoteTs <= _mapCombatLastTs + 1) return;
                    _mapCombatLastTs = remoteTs;
                    mapCombatants = s.combatants.map(c => ({...c}));
                    mapRenderInitiative();
                    mapUpdateDmgDropdown();
                    if (s.round) document.getElementById('map-round-info').textContent = s.round;
                    saveMapCombatLocal();
                }).catch(()=>{});
            }, 3000);
        }
        startCombatSync();

        // 在所有战斗修改后推送
        const _origMapAddCombatant = mapAddCombatant;
        mapAddCombatant = function() { _origMapAddCombatant(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapRemoveCombatant = mapRemoveCombatant;
        mapRemoveCombatant = function(i) { _origMapRemoveCombatant(i); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapStartCombat = mapStartCombat;
        mapStartCombat = function() { _origMapStartCombat(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapNextCombatant = mapNextCombatant;
        mapNextCombatant = function() { _origMapNextCombatant(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapPrevCombatant = mapPrevCombatant;
        mapPrevCombatant = function() { _origMapPrevCombatant(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapNextRound = mapNextRound;
        mapNextRound = function() { _origMapNextRound(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origMapPrevRound = mapPrevRound;
        mapPrevRound = function() { _origMapPrevRound(); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };
        const _origSyncCombatantHP = syncCombatantHP;
        syncCombatantHP = async function(c) { await _origSyncCombatantHP(c); saveMapCombatLocal(); pushCombatState(); debouncedSave(); };

        // ━━━ 面板拖拽 ━━━
        function makeDraggable(panelEl, headerEl) {
            let dragging = false, startX, startY, startLeft, startTop;
            headerEl.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                dragging = true; isDraggingPanel = true;
                e.stopPropagation(); e.preventDefault();
                startX = e.clientX; startY = e.clientY;
                startLeft = panelEl.offsetLeft; startTop = panelEl.offsetTop;
                panelEl.style.transition = 'none';
                panelEl.style.right = 'auto';
                panelEl.style.bottom = 'auto';
            });
            window.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                panelEl.style.left = (startLeft + e.clientX - startX) + 'px';
                panelEl.style.top = (startTop + e.clientY - startY) + 'px';
            });
            window.addEventListener('mouseup', () => {
                if (dragging) { dragging = false; isDraggingPanel = false; panelEl.style.transition = ''; }
            });
        }
        makeDraggable(document.getElementById('token-info-panel'), document.getElementById('tip-header'));
        makeDraggable(document.getElementById('layer-panel'), document.getElementById('layer-panel-header-drag'));

        // ━━━ 初始化 ━━━
        updateBrush(); redrawCanvas();

        // 存档槽系统初始化
        async function initSaveSystem() {
            // ━━ 启动时始终清除激活的存档槽 —— 显示"未加载存档"状态 ━━
            const reg = getSlotRegistry();
            if (reg.activeSlotId) {
                reg.activeSlotId = null;
                saveSlotRegistry(reg);
            }
            setActiveSave(null, null);

            // ━━ 步骤1：清空画布，确保从干净状态开始 ━━
            textBoxes.forEach(b => { if (b.el) b.el.remove(); });
            mapTokens.forEach(t => { if (t.el) t.el.remove(); });
            brushStrokes = [];
            textBoxes = [];
            mapTokens = [];
            mapLayers = [];
            clearAllFogLayers();
            selectedElement = null;
            clearMultiSelect();
            mapCombatants = [];
            redrawCanvas();
            redrawFogCanvas();
            renderLayerList();

            // ━━ 步骤2：恢复上次关闭/刷新时的状态（优先 _unload → _light → IndexedDB）━━
            let state = null;
            // 1. 优先：刷新前的紧急保存（_unload，beforeunload 时同步写入，包含完整状态）
            const unloadRaw = localStorage.getItem(STORAGE_KEY + '_unload');
            if (unloadRaw) {
                try { state = JSON.parse(unloadRaw); localStorage.removeItem(STORAGE_KEY + '_unload'); } catch(e) {}
            }
            // 2. 回退：轻量备份（_light，正常操作过程中频繁同步写入）
            if (!state) {
                const lightRaw = localStorage.getItem(STORAGE_KEY + '_light');
                if (lightRaw) {
                    try { state = JSON.parse(lightRaw); } catch(e) {}
                }
            }
            // 3. 兜底：IndexedDB 完整数据（异步写入，可能非最新）
            if (!state) {
                state = await dbGetSync(STORAGE_KEY);
            }
            // 4. 旧版格式兼容
            if (!state) {
                const legacyRaw = localStorage.getItem(STORAGE_KEY);
                if (legacyRaw) {
                    try { state = JSON.parse(legacyRaw); } catch(e) {}
                }
            }

            if (state) {
                try {
                    // 按层从 IndexedDB / _emergency 补全被 localStorage 截断的 dataURL
                    if (state.layers && state.layers.length > 0) {
                        const needsDataURL = state.layers.filter(l => !l.dataURL);
                        if (needsDataURL.length > 0) {
                            // 从 IndexedDB 补全
                            const dbState = await dbGetSync(STORAGE_KEY);
                            if (dbState && dbState.layers) {
                                const dbLayerMap = {};
                                for (const dl of dbState.layers) {
                                    if (dl.dataURL) dbLayerMap[dl.id] = dl.dataURL;
                                }
                                for (const l of needsDataURL) {
                                    if (dbLayerMap[l.id]) l.dataURL = dbLayerMap[l.id];
                                }
                            }
                            // _emergency 兜底补充仍未恢复的层
                            const stillMissing = needsDataURL.filter(l => !l.dataURL);
                            if (stillMissing.length > 0) {
                                const emergRaw = localStorage.getItem(STORAGE_KEY + '_emergency');
                                if (emergRaw) {
                                    try {
                                        const emerg = JSON.parse(emergRaw);
                                        if (emerg.layers) {
                                            const emergMap = {};
                                            for (const el of emerg.layers) {
                                                if (el.dataURL) emergMap[el.id] = el.dataURL;
                                            }
                                            for (const l of stillMissing) {
                                                if (emergMap[l.id]) l.dataURL = emergMap[l.id];
                                            }
                                        }
                                    } catch(e) {}
                                }
                            }
                        }
                    }

                    await applyState(state);
                    redrawCanvas();
                    applyTransform();
                    renderLayerList();

                    // 存档槽恢复：没有注册表时，扫描 IndexedDB 找回已存在的存档
                    var reg2 = getSlotRegistry();
                    if (reg2.slots.length === 0) {
                        // 尝试从 IndexedDB 恢复孤儿存档
                        try {
                            var allKeys = await new Promise(function(resolve) {
                                if (!_dbReady || !_db) { resolve([]); return; }
                                var tx = _db.transaction(DB_STORE, 'readonly');
                                var req = tx.objectStore(DB_STORE).getAllKeys();
                                req.onsuccess = function() { resolve(req.result || []); };
                                req.onerror = function() { resolve([]); };
                            });
                            for (var ki = 0; ki < allKeys.length; ki++) {
                                var key = allKeys[ki];
                                if (typeof key === 'string' && key.indexOf('slot_') > -1 && key !== STORAGE_KEY) {
                                    var slotId = key.replace('dnd_map_state_', '');
                                    if (slotId.indexOf('slot_') === 0) {
                                        // 尝试读取存档获取名称
                                        var slotState = await dbGetSync(key);
                                        var slotName = (slotState && slotState._slotName) || '恢复的存档';
                                        reg2.slots.push({ id: slotId, name: slotName, timestamp: Date.now() });
                                    }
                                }
                            }
                        } catch(e) {}
                        // 如果扫描后仍为空，创建默认自动存档
                        if (reg2.slots.length === 0) {
                            var slotId = 'slot_' + Date.now() + '_auto';
                            reg2.slots.push({ id: slotId, name: '自动存档', timestamp: Date.now() });
                            dbSetSync(getSlotStorageKey(slotId), state);
                        }
                        saveSlotRegistry(reg2);
                    }
                    // 同步 IndexedDB，确保最新数据有一份完整备份
                    dbSetSync(STORAGE_KEY, state);

                    console.log('✅ 已恢复上次关闭时的地图状态');
                    // 标记本地状态已恢复，阻止 WS init / HTTP 轮询用服务端旧数据覆盖
                    window._localStateRestored = true;
                    // 5 秒后自动清除保护标志，DM端强制推送本地状态到服务器确保PL同步
                    setTimeout(function() {
                        window._localStateRestored = false;
                        if (window._isDM && window._wsIsOpen && window._wsIsOpen()) {
                            _dirtyFlags.layers = _dirtyFlags.tokens = _dirtyFlags.texts = _dirtyFlags.fog = true;
                            window._pushSharedCanvas();
                        }
                    }, 5000);
                    return;
                } catch(e) {
                    console.warn('恢复状态失败，使用空白画布:', e);
                }
            }

            // ━━ 无任何数据：使用默认空白画布 ━━
            applyTransform();
            zoomFit();
            console.log('🆕 空白画布已就绪');
        }

        // ━━━ 启动：先建立 IndexedDB 连接，再恢复存档 ━━━
        (async function boot() {
            // ━━ 身份初始化（必须在 initSaveSystem 之前，确保迷雾渲染正确）━━
            let isDM = false;
            let userRole = 'PL';
            try {
                var _initSS = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                if (_initSS && _initSS.is_dm === true) { isDM = true; userRole = 'DM'; }
                else if (_initSS && _initSS.role === 'DM') { userRole = 'DM'; }
                else if (_initSS && _initSS.role === 'PL') { userRole = 'PL'; }
            } catch(e) {}
            window._isDM = isDM;
            window._roleLocked = !!(_initSS && _initSS.name);

            await initDB();
            await initSaveSystem();
            // 恢复共享战斗状态（localStorage，与 combat.html 共用同一键）
            if (!mapCombatants.length) {
                restoreMapCombatLocal();
            }
            setTool('select');
            setSelectMode('single');

            // 尽早应用角色限制（isDM默认false=PL，DM-status API返回后纠正）
            applyRoleRestrictions();

            // 定时自动保存（每3秒，等待 IndexedDB 确认以保护图层 dataURL）
            let autoSaveTimer = null;
            async function autoSaveLoop() {
                if (document.hidden) { autoSaveTimer = setTimeout(autoSaveLoop, 3000); return; }
                // 轻量保存到 localStorage（保留 dataURL ≤200KB 的图层），IndexedDB 异步备份
                try {
                    const s = collectState();
                    const light = { ...s, layers: s.layers.map(function(l) {
                        var dataLen = (l.dataURL || '').length;
                        return {...l, dataURL: (dataLen > 0 && dataLen <= 200000) ? l.dataURL : ''};
                    })};
                    localStorage.setItem(STORAGE_KEY + '_light', JSON.stringify(light));
                } catch(e) {}
                autoSaveTimer = setTimeout(autoSaveLoop, 3000);
            }
            // 延迟 3 秒后再开始定时保存，避免阻塞启动渲染
            autoSaveTimer = setTimeout(autoSaveLoop, 3000);
            // 页面切到后台时暂停，切回时立即保存一次
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) { clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(autoSaveLoop, 200); }
            });

            // 页面隐藏/跳转时立即保存（同步写专用键 + _light 确保刷新不丢数据）
            const saveOnUnload = () => {
                clearTimeout(autoSaveTimer);
                clearTimeout(debouncedSave._timer);
                // 写入专用 _unload 键（最高优先恢复），strip 大 dataURL 防止超出 localStorage 配额
                try {
                    const s = collectState();
                    s._unloadAt = Date.now();
                    // 与 _light 一样截断大 dataURL，确保可靠写入
                    s.layers = s.layers.map(function(l) {
                        var dataLen = (l.dataURL || '').length;
                        return {...l, dataURL: (dataLen > 0 && dataLen <= 200000) ? l.dataURL : ''};
                    });
                    localStorage.setItem(STORAGE_KEY + '_unload', JSON.stringify(s));
                } catch(e) { console.error('⚠ 紧急保存 _unload 失败:', e); }
                saveState(); saveMapCombatLocal();
                window._pushSharedCanvas();
            };
            window.addEventListener('pagehide', saveOnUnload);
            window.addEventListener('beforeunload', saveOnUnload);

            // 从 bfcache 恢复时重新连接 IndexedDB
            window.addEventListener('pageshow', (e) => {
                if (e.persisted) {
                    // 从缓存恢复，重新初始化 DB 连接
                    initDB().then(() => initSaveSystem());
                }
            });

            // ━━━ 聊天系统 ━━━
            let chatUser = '';
            window._chatUser = '';  // 暴露给 IIFE 和顶层代码
            let chatColor = '#00bcd4';
            let chatOpen = false;
            let dmName = '';

            // ━━ PL权限限制 ━━
            // ━━ 工具栏身份徽章刷新 ━━
            function refreshIdentityBadge() {
                const nameEl = document.getElementById('identity-name');
                const dotEl = document.getElementById('identity-dot');
                const roleEl = document.getElementById('identity-role');
                if (!nameEl || !dotEl || !roleEl) return;
                const name = chatUser || window._chatUser || getIdentity().name || '';
                if (name) {
                    nameEl.textContent = name;
                    nameEl.title = name;
                } else {
                    nameEl.textContent = '未登录';
                }
                dotEl.style.background = chatColor || '#888';
                roleEl.textContent = isDM ? 'DM' : (userRole === 'DM' ? 'DM' : 'PL');
                roleEl.style.color = isDM ? 'var(--gold)' : 'var(--text-dim)';
            }

            function applyRoleRestrictions() {
                var dm = (window._isDM === true);
                var fogWrap = document.getElementById('fog-dropdown-wrap');
                var clearWrap = document.getElementById('clear-dropdown-wrap');
                var layerFooter = document.getElementById('layer-panel-footer');
                var combatInputs = document.querySelectorAll('#sidebar-panel-combat input, #sidebar-panel-combat select, #sidebar-panel-combat button:not(.sidebar-tab)');

                if (dm) {
                    // DM：显示所有功能按钮
                    if (fogWrap) fogWrap.style.display = '';
                    if (clearWrap) clearWrap.style.display = '';
                    if (layerFooter) layerFooter.style.display = '';
                    combatInputs.forEach(function(el) { el.disabled = false; el.style.opacity = ''; });
                } else {
                    // PL：隐藏受限功能，但允许添加参战者、填入先攻
                    if (fogWrap) fogWrap.style.display = 'none';
                    if (clearWrap) clearWrap.style.display = 'none';
                    if (layerFooter) layerFooter.style.display = 'none';
                    combatInputs.forEach(function(el) {
                        if (el.closest('.pl-allowed')) return; // PL可用控件跳过
                        el.disabled = true; el.style.opacity = '0.5';
                    });
                }
            }

            // ━━ 颜色调色板 ━━
            const COLOR_PRESETS = [
                '#00bcd4', '#4caf50', '#ff9800', '#e91e63', '#9c27b0',
                '#2196f3', '#ff5722', '#607d8b', '#795548', '#cddc39',
                '#00e5ff', '#76ff03', '#ffd740', '#ff4081', '#b388ff',
                '#448aff', '#ff6e40', '#90a4ae', '#8d6e63', '#ffff00',
            ];

            function buildColorPalette() {
                const palette = document.getElementById('color-palette');
                palette.innerHTML = COLOR_PRESETS.map(c =>
                    `<div class="color-swatch${c === chatColor ? ' selected' : ''}"
                         style="background:${c};" onclick="selectChatColor('${c}')"
                         title="${c}"></div>`
                ).join('');
            }

            window.toggleColorPalette = function() {
                const palette = document.getElementById('color-palette');
                buildColorPalette();
                palette.classList.toggle('show');
            };

            window.selectChatColor = function(color) {
                chatColor = color;
                document.getElementById('chat-color-btn').style.background = color;
                refreshIdentityBadge();
                document.getElementById('color-palette').classList.remove('show');
                // 立即同步颜色到 sessionStorage 和服务端
                try {
                    var s = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                    if (s) { s.color = color; sessionStorage.setItem('dnd_joined_room', JSON.stringify(s)); }
                } catch(e) {}
                var _cu = chatUser || window._chatUser;
                if (_cu) {
                    fetch('/api/room/heartbeat', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: _cu, color: color, role: userRole || 'PL'})
                    }).catch(function(){});
                }
            };

            // 点击其他地方关闭调色板
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.color-picker-wrap')) {
                    document.getElementById('color-palette').classList.remove('show');
                }
            });

            window.toggleChat = function() {
                var panel = document.getElementById('chat-panel');
                var toggleBtn = document.getElementById('chat-toggle-btn');
                if (!panel || !toggleBtn) return;
                var isOpen = !panel.classList.contains('open');
                panel.classList.toggle('open', isOpen);
                toggleBtn.classList.toggle('shifted', isOpen);
                chatOpen = isOpen;
                // 聊天面板打开时，右推其他浮动面板
                var panels = document.querySelectorAll('#token-info-panel, #layer-panel');
                panels.forEach(function(p) {
                    if (isOpen) { p.style.left = '288px'; }
                    else { p.style.left = ''; }
                });
            };

            window.setChatUser = function() {
                const input = document.getElementById('chat-username');
                const name = input.value.trim();
                if (!name) return;
                var oldName = chatUser;
                chatUser = name;
                window._chatUser = name;
                refreshIdentityBadge();
                document.getElementById('chat-input').disabled = false;
                document.getElementById('chat-send-btn').disabled = false;
                document.getElementById('chat-input').focus();

                // 首次加入时从sessionStorage恢复颜色
                if (chatColor === '#00bcd4') {
                    try {
                        const saved = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                        if (saved && saved.color && saved.color !== '#00bcd4') {
                            chatColor = saved.color;
                            document.getElementById('chat-color-btn').style.background = chatColor;
                        }
                    } catch(e) {}
                }

                // 检测DM状态
                fetch('/api/dm-status?name=' + encodeURIComponent(chatUser || '')).then(r => r.json()).then(data => {
                    isDM = data.is_dm;
                    if (!window._roleLocked) { window._isDM = data.is_dm; }
                    dmName = data.dm_name || '';
                    if (isDM && !window._roleLocked) userRole = 'DM';
                    renderOnlineUsers();  // dmName获取后立即刷新在线列表
applyRoleRestrictions();
                    if (isDM) {
                        addSystemMsg('👑 你是主持人 (DM)');
                    } else {
                        if (dmName) {
                            addSystemMsg('👑 当前DM: ' + dmName);
                        }
                    }
                });

                // 改名时先离开旧名
                if (oldName && oldName !== name) {
                    fetch('/api/room/leave', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: oldName})
                    });
                }

                // 加入房间
                const joinColor = (chatColor !== '#00bcd4') ? chatColor : '';
                fetch('/api/room/join', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name, color: joinColor, role: userRole || 'PL'})
                });

                // 更新sessionStorage
                try {
                    sessionStorage.setItem('dnd_joined_room', JSON.stringify({name: name, color: chatColor, is_dm: isDM, role: userRole}));
                } catch(e) {}

                addSystemMsg(oldName ? '✅ 已改名为「' + name + '」' : '✅ 你已以「' + name + '」加入聊天');
            };

            window.sendChatMsg = function() {
                var sender = chatUser || window._chatUser;
                if (!sender) {
                    try { var _s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (_s && _s.name) sender = _s.name; } catch(e) {}
                }
                if (!sender) return;
                const input = document.getElementById('chat-input');
                if (!input) return;
                const text = input.value.trim();
                if (!text) return;
                input.value = '';
                var senderRole = 'PL';
                try { var s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (s && s.role) senderRole = s.role; } catch(e) {}
                fetch('/api/chat/send', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: sender, text: text, color: chatColor, role: senderRole})
                });
            };

            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') sendChatMsg();
                });
            }

            function addSystemMsg(text) {
                const div = document.createElement('div');
                div.className = 'chat-msg system';
                div.textContent = text;
                const msgs = document.getElementById('chat-msgs');
                msgs.appendChild(div);
                msgs.scrollTop = msgs.scrollHeight;
            }

            function renderChatMsg(msg) {
                const msgs = document.getElementById('chat-msgs');
                const div = document.createElement('div');
                if (msg.system) {
                    div.className = 'chat-msg system';
                    div.textContent = msg.text;
                    msgs.appendChild(div);
                    msgs.scrollTop = msgs.scrollHeight;
                    return;
                }
                div.className = 'chat-msg';
                var roleBadge = '';
                var msgRole = msg.role || (msg.is_dm ? 'DM' : 'PL');
                if (msgRole === 'DM') roleBadge = ' <span style="background:var(--gold);color:#000;font-size:0.6rem;padding:0 4px;border-radius:3px;">DM</span>';
                else roleBadge = ' <span style="background:#555;color:#ccc;font-size:0.6rem;padding:0 4px;border-radius:3px;">PL</span>';
                const nameColor = msg.color || (msg.is_dm ? '#ffd700' : '#00bcd4');
                let displayText = msg.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                displayText = displayText.replace(/@(\S+)/g, '<span class="mention">@$1</span>');
                div.innerHTML = '<span class="cm-time">[' + msg.time + ']</span>' +
                    '<span class="cm-name" style="color:' + nameColor + ';">' +
                    msg.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + roleBadge + '</span>' +
                    '：<span class="cm-text">' + displayText + '</span>';
                msgs.appendChild(div);
                msgs.scrollTop = msgs.scrollHeight;
            }

            // Chat polling
            let lastChatTs = Date.now() / 1000;
            function pollChat() {
                fetch('/api/chat/messages?since=' + lastChatTs)
                    .then(r => r.json())
                    .then(data => {
                        if (data.ok && data.messages) {
                            data.messages.forEach(function(msg) {
                                if (msg._ts > lastChatTs) lastChatTs = msg._ts;
                                // Don't render own join messages as chat bubbles
                                var _cu = chatUser || window._chatUser;
                                if (msg.name === _cu && (msg.text === '加入了聊天' || msg.text.indexOf('进入') >= 0)) return;
                                renderChatMsg(msg);
                            });
                        }
                    });
            }
            // 停止顶层轮询，boot 接管消息拉取
            if (typeof _topPollTimer !== 'undefined') { clearInterval(_topPollTimer); }
            setInterval(pollChat, 1500);
            setInterval(pollMentions, 2000);
            // Initial load
            fetch('/api/chat/messages').then(r => r.json()).then(data => {
                if (data.ok && data.messages) {
                    data.messages.forEach(function(msg) {
                        if (msg._ts > lastChatTs) lastChatTs = msg._ts;
                        renderChatMsg(msg);
                    });
                }
            });

            // ━━━ 房间心跳（保持在线状态 + 接收在线用户列表）━━
            let heartbeatTimer = null;
            function startHeartbeat() {
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                heartbeatTimer = setInterval(() => {
                    var _cu = chatUser || window._chatUser;
                    if (!_cu) return;
                    fetch('/api/room/heartbeat', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: _cu, color: chatColor, role: userRole})
                    }).then(r => r.json()).then(data => {
                        if (data.need_rejoin) {
                            var _uid=null; try{var _s=JSON.parse(sessionStorage.getItem('dnd_joined_room')); _uid=_s?(_s.user_id||null):null;}catch(e){}
                            fetch('/api/room/join', {
                                method: 'POST', headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({name: _cu, color: chatColor, role: userRole || 'PL', user_id: _uid})
                            }).catch(() => {});
                        }
                        if (data.ok && data.online_users) {
                            mapOnlineUsers = data.online_users;
                            renderOnlineUsers();
                        }
                    }).catch(() => {});
                }, 3000);  // 每3秒同步在线列表
            }

            // ━━━ 离开房间 ━━━
            let _hasLeft = false;
            function leaveRoom() {
                if (!chatUser || _hasLeft) return;
                _hasLeft = true;
                // 使用 sendBeacon 确保页面卸载时也能发送
                const data = JSON.stringify({name: chatUser});
                if (navigator.sendBeacon) {
                    navigator.sendBeacon('/api/room/leave', new Blob([data], {type: 'application/json'}));
                } else {
                    fetch('/api/room/leave', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: data
                    }).catch(() => {});
                }
            }

            // ━━━ WebSocket 实时协作画布 ━━━
            // 使用全局 _wsClient（wsSend 等全局函数需要访问）
            let wsReconnectTimer = null;
            let _wsHadConnected = false;
            function wsBroadcastFullState() {
                var s = collectState();
                wsSend({type: 'layers_update', data: mapLayers.map(layerNetData)});
                wsSend({type: 'tokens_update', data: s.mapTokens});
                wsSend({type: 'texts_update', data: s.textBoxes});
                wsSend({type: 'fog_update', data: {layers: s.fogLayers, visible: s.fogVisible}});
            }

            function onWsOpen() {
                wsFlushPending();  // 先发队列中的消息
                // 断线重连后主动对账：版本不一致时服务端会回发全量 init（P1-2）
                if (_wsHadConnected) {
                    try { _wsClient.send(JSON.stringify({type:'sync', version: sharedCanvasVer})); } catch(e) {}
                }
                _wsHadConnected = true;
                // 首次连接不立即推送完整本地状态——等待服务端 init→本地恢复→再决定是否需要推送
                // 避免空状态覆盖服务端数据导致其他客户端内容被清空
                // DM端：自动修复图层图片文件 + 推送最新状态到服务器确保PL同步
                if (window._isDM) {
                    var _hasLayerUpload = false;
                    mapLayers.forEach(function(l) {
                        if (l.dataURL && l.dataURL.length > 100) {
                            _hasLayerUpload = true;
                            fetch('/api/shared-canvas/layer-image', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({id: l.id, dataURL: l.dataURL})
                            }).catch(function(){});
                        }
                    });
                    // DM本地有数据时立即推送最新状态到服务器（PL可能正在等待）
                    if (_hasLayerUpload || mapLayers.length > 0 || mapTokens.length > 0) {
                        setTimeout(function() {
                            _dirtyFlags.layers = _dirtyFlags.tokens = _dirtyFlags.texts = _dirtyFlags.fog = true;
                            window._pushSharedCanvas();
                        }, 1500);  // 等图层上传完成再推送
                    }
                }
            }

            function connectWebSocket() {
                if (_wsClient && _wsClient.readyState === WebSocket.OPEN) return;
                // WebSocket 与 HTTP 共用 5000 端口（/ws 路径），frp 单隧道兼容
                var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                var wsUrl = protocol + '//' + location.host + '/ws';
                try {
                    _wsClient = new WebSocket(wsUrl);
                } catch(e) { scheduleWsReconnect(); return; }

                _wsClient.onopen = function() {
                    addSystemMsg('🟢 共享画布已连接（实时同步）');
                    onWsOpen();
                };

                _wsClient.onclose = function() {
                    scheduleWsReconnect();
                };

                _wsClient.onerror = function() {
                    try { _wsClient.close(); } catch(e) {}
                };

                _wsClient.onmessage = function(event) {
                    try {
                        var msg = JSON.parse(event.data);
                        // 跟踪服务端版本号（P1-1）
                        if (msg._ver !== undefined) sharedCanvasVer = msg._ver;
                        if (msg.version !== undefined) sharedCanvasVer = msg.version;
                        if (msg.type === 'init') {
                            // 同步时间戳 / 版本号，避免 WS 断开后 HTTP 轮询重复旧数据
                            sharedCanvasTs = Date.now() / 1000;
                            var state = msg.state || {};
                            // 如果刚从 localStorage 恢复了本地最新状态且当前为DM，跳过 init 的全量覆盖合并
                            // （服务端数据可能不是最新的，会覆盖本地 token 尺寸、图层比例等）
                            // PL 玩家始终以服务端数据为准（本地数据可能为空或过期）
                            if (window._localStateRestored && window._isDM) {
                                // 仅恢复服务端有而本地没有的笔画（新内容）
                                if (state.strokes && state.strokes.length > 0 && brushStrokes.length === 0) {
                                    brushStrokes = state.strokes.map(function(s) { return {...s}; });
                                    redrawDrawCanvas();
                                }
                                // 标记已处理，待标志清除后主动对账
                                if (!window.__initDeferred) {
                                    window.__initDeferred = true;
                                    var _check = setInterval(function() {
                                        if (!window._localStateRestored) {
                                            clearInterval(_check);
                                            window.__initDeferred = false;
                                            try { _wsClient.send(JSON.stringify({type:'sync', version: -1})); } catch(e) {}
                                        }
                                    }, 500);
                                }
                                return;
                            }
                            // 恢复笔画
                            if (state.strokes && state.strokes.length > 0) {
                                brushStrokes = state.strokes.map(function(s) { return {...s}; });
                                redrawDrawCanvas();
                            }
                            // 差量合并（带拖拽保护）；服务端为空时保留本地内容（等待 DM 推送）
                            if (state.tokens && state.tokens.length > 0) mergeRemoteTokens(state.tokens, [], true);
                            if (state.texts && state.texts.length > 0) mergeRemoteTexts(state.texts, [], true);
                            if (state.fog && (state.fog.layers !== undefined || state.fog.length > 0)) applyRemoteFog(state.fog);
                            if (state.layers && state.layers.length > 0) mergeRemoteLayers(state.layers, true);
                            redrawCanvas();
                            renderLayerList();
                        } else if (msg.type === 'stroke') {
                            // 远程笔画：按 id 去重后追加（P1-1）
                            var sd = msg.data || {};
                            if (!sd.id || !brushStrokes.some(function(s){ return s.id === sd.id; })) {
                                brushStrokes.push(sd);
                                redrawDrawCanvas();
                            }
                        } else if (msg.type === 'strokes_remove') {
                            var rmIds = {};
                            (msg.data||[]).forEach(function(id){ rmIds[id] = true; });
                            brushStrokes = brushStrokes.filter(function(s){ return !s.id || !rmIds[s.id]; });
                            redrawDrawCanvas();
                        } else if (msg.type === 'strokes_clear') {
                            brushStrokes = [];
                            redrawCanvas();
                        } else if (msg.type === 'op') {
                            // 操作语义消息：单体增删改（P1-1）
                            var op = msg.data || {};
                            if (op.key === 'tokens') mergeRemoteTokens(op.upsert, op.remove, false);
                            else if (op.key === 'texts') mergeRemoteTexts(op.upsert, op.remove, false);
                            else if (op.key === 'fog') applyRemoteFog(op.upsert);
                            else if (op.key === 'layers') mergeRemoteLayers(op.upsert, false);
                        } else if (msg.type === 'layers_update') {
                            mergeRemoteLayers(msg.data || [], true);
                        } else if (msg.type === 'tokens_update') {
                            mergeRemoteTokens(msg.data || [], [], true);
                        } else if (msg.type === 'texts_update') {
                            mergeRemoteTexts(msg.data || [], [], true);
                        } else if (msg.type === 'fog_update') {
                            applyRemoteFog(msg.data || {});
                        } else if (msg.type === 'clear_all') {
                            brushStrokes = []; fillBaseImage = new Image(); fillBaseDataURL = '';
                            textBoxes.forEach(function(b) { if(b.el) b.el.remove(); });
                            textBoxes = []; mapTokens.forEach(function(t) { if(t.el) t.el.remove(); });
                            mapTokens = []; mapLayers = []; clearAllFogLayers();
                            redrawCanvas(); redrawFogCanvas(); renderLayerList();
                        }
                    } catch(e) { console.error('[ws] onmessage 处理异常:', e, '原始消息:', (event.data||'').substring(0,200)); }
                };
            }

            function scheduleWsReconnect() {
                if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
                wsReconnectTimer = setTimeout(connectWebSocket, 3000);
            }

            // 笔画完成时广播
            // 图层/标记/文字变更时广播
            function wsBroadcastState(type, data) {
                if (_wsClient && _wsClient.readyState === WebSocket.OPEN) {
                    _wsClient.send(JSON.stringify({type: type, data: data}));
                }
            }

            // ━━━ 资源库 ━━━
            window.showResourceLibrary = function() {
                const modal = document.getElementById('resource-library-modal');
                if (!modal) { console.error('资源库弹窗未找到'); return; }
                modal.style.display = 'flex';
                fetchResourceLibrary();
            };

            window.showSaveUploadPanel = async function() {
                const panel = document.getElementById('save-upload-panel');
                const listEl = document.getElementById('save-upload-list');
                if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
                panel.style.display = 'block';
                listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:10px;">加载存档列表...</div>';

                // 收集所有存档（本地 + 全局注册表）
                const saves = [];
                const reg = getSlotRegistry();
                for (const s of reg.slots) {
                    const state = await dbGetSync(getSlotStorageKey(s.id));
                    if (state) saves.push({name: s.name, state: state, source: '本地存档'});
                }

                if (saves.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:10px;">暂无已保存的存档<br><small>请先在 💾 存档菜单中保存</small></div>';
                    return;
                }

                const username = window._chatUser || getIdentity().name || '未知用户';
                listEl.innerHTML = saves.map(s => {
                    const safeName = s.name.replace(/'/g, "\\'");
                    const filename = s.name + '_' + username + '.json';
                    return `
                    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface);border-radius:4px;margin-bottom:4px;border:1px solid var(--border);">
                        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8rem;">💾 ${s.name}</span>
                        <span style="font-size:0.65rem;color:var(--text-dim);flex-shrink:0;">→ ${filename}</span>
                        <button onclick="event.stopPropagation();uploadSaveToResource('${safeName}')" style="padding:0.2rem 0.5rem;background:var(--gold);border:none;border-radius:3px;color:#000;cursor:pointer;font-size:0.7rem;font-weight:bold;">📤 上传</button>
                    </div>`;
                }).join('');
            };

            window.uploadSaveToResource = async function(name) {
                const reg = getSlotRegistry();
                const slot = reg.slots.find(s => s.name === name);
                if (!slot) { alert('存档未找到: ' + name); return; }
                const state = await dbGetSync(getSlotStorageKey(slot.id));
                if (!state) { alert('存档数据为空: ' + name); return; }

                const username = window._chatUser || getIdentity().name || '未知用户';
                const filename = name + '_' + username + '.json';
                const blob = new Blob([JSON.stringify(state)], {type: 'application/json'});
                const fd = new FormData();
                fd.append('file', blob, filename);

                const listEl = document.getElementById('save-upload-list');
                listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:10px;">上传中...</div>';

                try {
                    const resp = await fetch('/api/resources/upload', {method: 'POST', body: fd});
                    const data = await resp.json();
                    if (data.error) { alert('❌ ' + data.error); showSaveUploadPanel(); return; }
                    alert('✅ 存档已上传: ' + filename);
                    document.getElementById('save-upload-panel').style.display = 'none';
                    fetchResourceLibrary();
                } catch(e) {
                    alert('❌ 上传失败: ' + e.message);
                    showSaveUploadPanel();
                }
            };

            window.closeResourceLibrary = function() {
                const modal = document.getElementById('resource-library-modal');
                if (modal) modal.style.display = 'none';
            };

            window.uploadResource = function() {
                document.getElementById('resource-file-input').click();
            };

            window.handleResourceUpload = function(event) {
                const file = event.target.files[0];
                if (!file) return;
                if (file.size > 50 * 1024 * 1024) {
                    alert('❌ 文件过大 (' + (file.size/1024/1024).toFixed(1) + 'MB)，最大50MB');
                    event.target.value = '';
                    return;
                }
                const formData = new FormData();
                formData.append('file', file);

                const listEl = document.getElementById('resource-library-list');
                listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">上传中...</div>';

                fetch('/api/resources/upload', {method: 'POST', body: formData})
                    .then(r => r.json())
                    .then(data => {
                        if (data.error) { alert('❌ ' + data.error); fetchResourceLibrary(); return; }
                        addSystemMsg('📤 上传成功: ' + data.name + ' (' + data.size_display + ')');
                        fetchResourceLibrary();
                    })
                    .catch(e => { alert('❌ 上传失败: ' + e.message); fetchResourceLibrary(); });
                event.target.value = '';
            };

            window.fetchResourceLibrary = function() {
                const listEl = document.getElementById('resource-library-list');
                if (!listEl) return;
                const catEl = document.getElementById('resource-cat-filter');
                const cat = catEl ? catEl.value : '';
                listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">加载中...</div>';

                const url = cat ? '/api/resources?cat=' + encodeURIComponent(cat) : '/api/resources';
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);  // 10秒超时

                fetch(url, {signal: controller.signal})
                    .then(r => { clearTimeout(timeout); return r.json(); })
                    .then(data => {
                        if (!data.resources || !Array.isArray(data.resources) || data.resources.length === 0) {
                            listEl.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">暂无资源<br><small>点击「📤 上传文件」添加资源</small></div>';
                            return;
                        }
                        listEl.innerHTML = data.resources.map(res => {
                            const isImage = res.category === 'image';
                            const safeName = (res.name || '').replace(/'/g, "\\'");
                            const safeUrl = (res.url || '').replace(/'/g, "\\'");
                            const actions = [];
                            if (isImage) {
                                actions.push(`<button class="res-action-btn load-map" onclick="event.stopPropagation();loadResourceAsMap('${safeUrl}','${safeName}')" title="加载为地图图层">🗺️</button>`);
                            }
                            if (res.ext === 'json') {
                                actions.push(`<button class="res-action-btn load-map" onclick="event.stopPropagation();loadResourceAsSave('${safeUrl}','${safeName}')" title="加载存档" style="color:var(--gold);">💾</button>`);
                            }
                            if (res.ext === 'pdf' || res.ext === 'txt' || res.ext === 'md') {
                                actions.push(`<button class="res-action-btn" onclick="event.stopPropagation();window.open('${safeUrl}','_blank')" title="打开文件">📖</button>`);
                            } else {
                                actions.push(`<button class="res-action-btn" onclick="event.stopPropagation();window.open('${safeUrl}','_blank')" title="下载/查看">🔗</button>`);
                            }
                            actions.push(`<button class="res-action-btn delete" onclick="event.stopPropagation();deleteResource('${safeName}')" title="删除">✕</button>`);
                            return `
                            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg);border-radius:8px;margin-bottom:4px;border:1px solid var(--border);transition:all 0.15s;"
                                 onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                                <span style="font-size:1.5rem;">${res.icon || '📦'}</span>
                                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85rem;" title="${(res.name||'').replace(/"/g,'&quot;')}">${res.name || '?'}</span>
                                <span style="color:var(--text-dim);font-size:0.7rem;flex-shrink:0;">${res.size_display || ''}</span>
                                ${actions.join('')}
                            </div>`;
                        }).join('');
                    })
                    .catch(e => {
                        clearTimeout(timeout);
                        if (e.name === 'AbortError') {
                            listEl.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px;">⏰ 加载超时<br><small>请检查服务器是否运行正常</small></div>';
                        } else {
                            listEl.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px;">❌ 加载失败: ' + (e.message || '未知错误') + '</div>';
                        }
                    });
            };

            window.loadResourceAsSave = function(url, name) {
                closeResourceLibrary();
                if (!confirm(`确定加载存档 "${name}" 吗？\n\n⚠ 当前未保存的地图内容将被替换。`)) return;
                fetch(url)
                    .then(r => r.json())
                    .then(async state => {
                        textBoxes.forEach(b => { if (b.el) b.el.remove(); });
                        mapTokens.forEach(t => { if (t.el) t.el.remove(); });
                        brushStrokes = []; textBoxes = []; mapTokens = [];
                        mapLayers = []; clearAllFogLayers();
                        selectedElement = null; clearMultiSelect();
                        redrawCanvas(); redrawFogCanvas();
                        await applyState(state);
                        redrawCanvas();
                        applyTransform();
                        renderLayerList();
                        updateAllFogCoverage();
                        alert('✅ 已加载存档: ' + name);
                    })
                    .catch(e => { alert('❌ 加载失败: ' + e.message); });
            };

            window.loadResourceAsMap = function(url, name) {
                closeResourceLibrary();
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const layerId = ++layerIdCounter;
                    const cleanName = name.replace(/\.[^.]+$/, '');
                    const imgRatio = img.width / img.height;
                    const canvasRatio = canvas.width / canvas.height;
                    let initScale;
                    if (imgRatio > canvasRatio) {
                        initScale = Math.round((canvas.width * 0.7 / img.width) * 100) / 100;
                    } else {
                        initScale = Math.round((canvas.height * 0.7 / img.height) * 100) / 100;
                    }
                    const scaledW = img.width * initScale;
                    const scaledH = img.height * initScale;
                    const cx = Math.round((canvas.width - scaledW) / 2);
                    const cy = Math.round((canvas.height - scaledH) / 2);

                    const cvs = document.createElement('canvas');
                    cvs.width = img.width; cvs.height = img.height;
                    const cctx = cvs.getContext('2d');
                    cctx.drawImage(img, 0, 0);
                    const dataURL = cvs.toDataURL('image/png');

                    mapLayers.push({
                        id: layerId, name: cleanName, image: img,
                        dataURL: dataURL, url: url, visible: true,
                        offsetX: cx, offsetY: cy, scale: initScale
                    });
                    activeLayerId = layerId;
                    if (mapLayers.length === 1) { zoomFit(); }
                    redrawCanvas();
                    renderLayerList();
                    saveState();
                    window._markDirty('layers');
                };
                img.onerror = () => { alert('加载资源失败: ' + name); };
                img.src = url;
            };

            window.deleteResource = function(name) {
                if (!confirm('确定删除资源 "' + name + '"？此操作不可撤销。')) return;
                fetch('/api/resources/' + encodeURIComponent(name), {method: 'DELETE'})
                    .then(r => r.json())
                    .then(data => {
                        if (data.error) { alert('❌ ' + data.error); return; }
                        addSystemMsg('🗑 已删除: ' + name);
                        fetchResourceLibrary();
                    })
                    .catch(e => { alert('❌ 删除失败: ' + e.message); });
            };

            // ━━━ 在线用户列表渲染 ━━━
            let mapOnlineUsers = [];
            function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

            function renderOnlineUsers() {
                const el = document.getElementById('chat-online-users');
                const badge = document.getElementById('chat-online-count');
                if (!el || !badge) return;
                if (mapOnlineUsers.length === 0) {
                    el.innerHTML = '<span>—</span>';
                    badge.textContent = '';
                    return;
                }
                badge.textContent = mapOnlineUsers.length + '人在线';
                el.innerHTML = mapOnlineUsers.map(u => {
                    var isDmUser = (u.role === 'DM');
                    var color = u.color || (isDmUser ? '#ffd700' : '#00bcd4');
                    var roleBadge = isDmUser ? '<span style="background:var(--gold);color:#000;font-size:0.55rem;padding:0 2px;border-radius:2px;">DM</span>' : '<span style="background:#555;color:#ccc;font-size:0.55rem;padding:0 2px;border-radius:2px;">PL</span>';
                    return `<span style="color:${color};font-size:0.7rem;">● ${_escHtml(u.name)} ${roleBadge}</span>`;
                }).join(' ');
            }

            // ━━━ @提及通知 ━━━
            let lastMentionTs = Date.now() / 1000;
            let mentionQueue = [];
            let showingMention = false;

            function pollMentions() {
                if (!chatUser) return;
                fetch('/api/mentions?name=' + encodeURIComponent(chatUser) + '&since=' + lastMentionTs)
                    .then(r => r.json())
                    .then(data => {
                        if (data.ok && data.mentions && data.mentions.length > 0) {
                            data.mentions.forEach(function(m) {
                                if (m._ts > lastMentionTs) lastMentionTs = m._ts;
                                mentionQueue.push(m);
                            });
                            if (!showingMention) showNextMention();
                        }
                    }).catch(() => {});
            }

            function showNextMention() {
                if (mentionQueue.length === 0) { showingMention = false; return; }
                showingMention = true;
                const m = mentionQueue.shift();
                const toast = document.getElementById('mention-toast');
                document.getElementById('mention-title').textContent = '📢 呼叫 ' + m.from_name + '，有人找你';
                document.getElementById('mention-detail').textContent = '「' + m.text + '」 — ' + m.time;
                toast.classList.add('show');
                // 播放提示音（可选）
                try {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain); gain.connect(audioCtx.destination);
                    osc.frequency.value = 880; osc.type = 'sine';
                    gain.gain.value = 0.3;
                    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
                    setTimeout(() => {
                        const osc2 = audioCtx.createOscillator();
                        osc2.connect(gain); gain.connect(audioCtx.destination);
                        osc2.frequency.value = 1100; osc2.type = 'sine';
                        osc2.start(); osc2.stop(audioCtx.currentTime + 0.2);
                    }, 180);
                } catch(e) {}
                // 3秒后自动消失
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => showNextMention(), 500);
                }, 4000);
            }

            window.dismissMention = function() {
                document.getElementById('mention-toast').classList.remove('show');
                setTimeout(() => showNextMention(), 500);
            };

            // ━━━ 自动恢复心跳（如果已通过加入覆盖层登录）━━
            try {
                const saved = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
                if (saved && saved.name) {
                    chatUser = saved.name;
                    window._chatUser = saved.name;
                    if (saved.color) {
                        chatColor = saved.color;
                        document.getElementById('chat-color-btn').style.background = saved.color;
                    }
                    if (saved.is_dm === true) { isDM = true; userRole = 'DM'; window._isDM = true; }
                    else if (saved.role) userRole = saved.role;
                    document.getElementById('chat-username').value = saved.name;
                    document.getElementById('chat-input').disabled = false;
                    document.getElementById('chat-send-btn').disabled = false;
                    refreshIdentityBadge();
                    applyRoleRestrictions();
                    // 自动加入房间（心跳可能延迟10秒，先主动join）
                    fetch('/api/room/join', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: chatUser, color: chatColor, role: userRole || 'PL'})
                    }).catch(function(){});
                    // 自动启动心跳保持在线
                    startHeartbeat();
                    // 二次确认DM状态（不覆盖sessionStorage已设置的可靠值）
                    if (isDM === false) {
                        var _dmName2 = chatUser || window._chatUser;
                        if (!_dmName2) { try { var _ss2 = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (_ss2 && _ss2.name) _dmName2 = _ss2.name; } catch(e) {} }
                        fetch('/api/dm-status?name=' + encodeURIComponent(_dmName2 || '')).then(r => r.json()).then(data => {
                            if (data.is_dm) { isDM = true; userRole = 'DM'; }
                            if (!window._roleLocked) { window._isDM = data.is_dm; }
                            dmName = data.dm_name || '';
                            renderOnlineUsers();
                        });
                    }
                }
            } catch(e) {}

            // 二次确认DM状态（仅在sessionStorage未提供可靠值时调用，不覆盖已有值）
            if (isDM === false && userRole === 'PL') {
                var _dmCheckName = chatUser || window._chatUser;
                if (!_dmCheckName) { try { var _ss = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (_ss && _ss.name) _dmCheckName = _ss.name; } catch(e) {} }
                fetch('/api/dm-status?name=' + encodeURIComponent(_dmCheckName || '')).then(r => r.json()).then(data => {
                    if (data.is_dm) { isDM = true; userRole = 'DM'; }
                    if (!window._roleLocked) { window._isDM = data.is_dm; }
                    dmName = data.dm_name || '';
                    renderOnlineUsers();
                    redrawFogCanvas();
                    applyRoleRestrictions();
                }).catch(function(){});
            }

            // ━━━ 页面离开时通知退房 ━━━
            window.addEventListener('pagehide', (e) => { if (!e.persisted) leaveRoom(); });

            // ━━━ 动作驱动画布同步（WS 实时为主，HTTP 轮询降级）━━
            let sharedCanvasTs = 0;
            let sharedCanvasVer = -1;  // 服务端单调版本号（P1-1）
        // ━━━ WebSocket 安全包装（全局作用域，带消息队列）━━
        let _wsClient = null;
        let wsPendingMessages = [];

        function wsIsOpen() {
            return !!(_wsClient && _wsClient.readyState === WebSocket.OPEN);
        }

        function wsSend(msg) {
            if (window._wsIsOpen()) {
                _wsClient.send(JSON.stringify(msg));
            } else {
                wsPendingMessages.push(msg);
            }
        }

        function wsFlushPending() {
            while (wsPendingMessages.length > 0) {
                var msg = wsPendingMessages.shift();
                if (window._wsIsOpen()) {
                    _wsClient.send(JSON.stringify(msg));
                } else {
                    break;
                }
            }
        }

        // ━━━ 网络序列化辅助（P1-1：干净的数据结构，图层只传 url 不传 base64）━━
        // _strokeSeq / genStrokeId 已移至文件顶部

        function layerNetData(l) {
            var d = {id:l.id, name:l.name, url:l.url||'', dataURL:'',
                     offsetX:l.offsetX||0, offsetY:l.offsetY||0, scale:l.scale||1, visible:l.visible!==false};
            // 始终携带 dataURL（限制大小），以便服务端文件丢失时自愈重建
            var du = l.dataURL || '';
            if (du && du.length <= 500000) d.dataURL = du;
            if (!d.url) d.dataURL = du;  // 未上传成功时不受大小限制
            return d;
        }

        function tokenNetData(t) {
            return {id:t.id, charId:t.charId, name:t.name, portraitUrl:t.portraitUrl,
                    x:t.x, y:t.y, size:t.size||48, rotation:t.rotation||0};
        }

        function textNetData(b) {
            return {id:b.id, x:b.x, y:b.y, text:b.text, fontSize:b.fontSize};
        }

        // 操作语义消息：单体增删改，避免全量广播（P1-1）
        // 同时登记"本地最近编辑"，用于防回弹（他人稍旧的全量消息不覆盖本地刚做的修改）
        let _recentLocalEdit = { tokens: {}, texts: {} };
        let _recentLocalRemove = { tokens: {}, texts: {} };
        var _EDIT_GRACE_MS = 4000;

        function _isRecent(reg, key, id) {
            var t = reg[key] && reg[key][id];
            if (!t) return false;
            if (Date.now() - t > _EDIT_GRACE_MS) { delete reg[key][id]; return false; }
            return true;
        }
        function isRecentLocalEdit(key, id) { return _isRecent(_recentLocalEdit, key, id); }
        function isRecentLocalRemove(key, id) { return _isRecent(_recentLocalRemove, key, id); }

        function wsSendOp(key, upsert, remove) {
            if (_recentLocalEdit[key]) {
                (upsert||[]).forEach(function(it){ if (it && it.id !== undefined) _recentLocalEdit[key][it.id] = Date.now(); });
                (remove||[]).forEach(function(id){ _recentLocalRemove[key][id] = Date.now(); delete _recentLocalEdit[key][id]; });
            }
            wsSend({type:'op', data:{key:key, upsert:upsert||[], remove:remove||[]}});
        }

        // 图层图片上传（P0-1：图片与状态分离，状态中只存 url）
        function uploadLayerImage(layer) {
            if (!layer || !layer.dataURL || layer.url) return Promise.resolve(layer);
            return fetch('/api/shared-canvas/layer-image', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({id: layer.id, dataURL: layer.dataURL})
            }).then(function(r){ return r.json(); }).then(function(d){
                if (d.ok && d.url) layer.url = d.url;
                return layer;
            }).catch(function(){ return layer; });
        }

        function ensureLayersUploaded() {
            return Promise.all(mapLayers.map(function(l){ return uploadLayerImage(l); }));
        }

        function wsBroadcastStroke(stroke) {
            wsSend({type: 'stroke', data: {id:stroke.id, tool:stroke.tool, color:stroke.color, size:stroke.size, points:stroke.points.slice(-100)}});
        }

        // ━━━ 共享画布脏状态追踪（全局作用域，供 addTextBox/removeTextBox 等调用）━━
        let _pushDebounce = null;
        let _pushInFlight = false;
        let _dirtyFlags = { strokes: false, layers: false, tokens: false, texts: false, fog: false };

        function _anyDirty() {
            return _dirtyFlags.strokes || _dirtyFlags.layers || _dirtyFlags.tokens || _dirtyFlags.texts || _dirtyFlags.fog;
        }

        function markDirty(component) {
            if (_dirtyFlags.hasOwnProperty(component)) _dirtyFlags[component] = true;
            window._pushSharedCanvas();
        }

        function pushSharedCanvas() {
            if (_pushDebounce) clearTimeout(_pushDebounce);
            _pushDebounce = setTimeout(function() {
                _pushDebounce = null;
                if (!window._anyDirty()) return;

                var s = collectSyncState();

                // WS 连接时走 WS 单通道（P1-2），不再重复发 HTTP POST
                if (window._wsIsOpen()) {
                    // strokes 已在落笔时逐条广播（带 id 去重），此处无需重发
                    _dirtyFlags.strokes = false;
                    if (_dirtyFlags.layers) { wsSend({type:'layers_update', data: mapLayers.map(layerNetData)}); _dirtyFlags.layers = false; }
                    if (_dirtyFlags.tokens) { wsSend({type:'tokens_update', data: s.mapTokens}); _dirtyFlags.tokens = false; }
                    if (_dirtyFlags.texts)  { wsSend({type:'texts_update', data: s.textBoxes}); _dirtyFlags.texts = false; }
                    if (_dirtyFlags.fog)    { wsSend({type:'fog_update', data: {layers: s.fogLayers, visible: s.fogVisible}}); _dirtyFlags.fog = false; }
                    // 本地状态已推送至服务器，可以恢复正常的服务端同步
                    window._localStateRestored = false;
                    return;
                }

                // HTTP 降级通道
                var body = {_mode: 'incremental'};
                if (_dirtyFlags.strokes) { body.strokes = s.brushStrokes.slice(-200); _dirtyFlags.strokes = false; }
                if (_dirtyFlags.layers) { body.layers = mapLayers.map(layerNetData); _dirtyFlags.layers = false; }
                if (_dirtyFlags.tokens) { body.tokens = s.mapTokens; _dirtyFlags.tokens = false; }
                if (_dirtyFlags.texts) { body.texts = s.textBoxes; _dirtyFlags.texts = false; }
                if (_dirtyFlags.fog) { body.fog = s.fogLayers; _dirtyFlags.fog = false; }

                fetch('/api/shared-canvas', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify(body)
                }).then(function(r){ return r.json(); }).then(function(d){
                    _pushInFlight = false;
                    if (d && d.version !== undefined) sharedCanvasVer = d.version;
                    window._localStateRestored = false;
                }).catch(function(){ _pushInFlight = false; });
                _pushInFlight = true;
            }, 100);
        }

        function onLocalChange() { _dirtyFlags.strokes = _dirtyFlags.layers = _dirtyFlags.tokens = _dirtyFlags.texts = _dirtyFlags.fog = true; window._pushSharedCanvas(); }

        // ━━━ 轻量状态收集（同步用，图层不含 base64 dataURL）━━
        function collectSyncState() {
            var s = collectState();
            // 图层只保留 url，去除 dataURL（减少 WS 消息体积）
            if (s.layers) {
                s.layers = s.layers.map(function(l) {
                    return {id:l.id, name:l.name, url:l.url||'', dataURL:'', visible:l.visible, offsetX:l.offsetX||0, offsetY:l.offsetY||0, scale:l.scale||1};
                });
            }
            return s;
        }

        // ━━━ 暴露关键函数到全局 window（事件处理器在 IIFE 外部，通过 window._xxx 访问）━━
        window._wsBroadcastStroke = wsBroadcastStroke;
        window._wsSendOp = wsSendOp;
        window._markDirty = markDirty;
        window._onLocalChange = onLocalChange;
        window._pushSharedCanvas = pushSharedCanvas;
        window._wsSend = wsSend;
        window._wsIsOpen = wsIsOpen;
        window._anyDirty = _anyDirty;

            // ━━━ 远程数据差量合并（P1-3：按 id diff 更新 DOM，保护拖拽中的对象）━━
            function _isDraggingRef(ref) {
                if (dragTarget !== null && dragTarget === ref) return true;
                if (groupDragging && groupDragOffsets.some(function(g){ return g.ref === ref; })) return true;
                return false;
            }

            function mergeRemoteTokens(list, removeIds, removeMissing) {
                var incoming = {};
                (list||[]).forEach(function(td){ if (td && td.id !== undefined) incoming[td.id] = td; });
                var removeSet = {};
                (removeIds||[]).forEach(function(id){ removeSet[id] = true; });
                var maxId = 0;
                // 更新/删除现有
                mapTokens = mapTokens.filter(function(t) {
                    if (_isDraggingRef(t)) { delete incoming[t.id]; return true; }  // 本地拖拽优先
                    // 防回弹：全量消息不覆盖/删除本地保护期内刚编辑的对象（op 精确操作不受限）
                    if (removeMissing && isRecentLocalEdit('tokens', t.id)) { delete incoming[t.id]; return true; }
                    if (removeSet[t.id] || (removeMissing && !(t.id in incoming))) {
                        if (t.el) t.el.remove();
                        return false;
                    }
                    var td = incoming[t.id];
                    if (td) {
                        t.x = td.x; t.y = td.y; t.size = td.size||48; t.rotation = td.rotation||0;
                        t.name = td.name;
                        if (t.el) {
                            t.el.style.left = td.x + 'px'; t.el.style.top = td.y + 'px';
                            t.el.style.width = t.size + 'px'; t.el.style.height = t.size + 'px';
                            applyTokenRotation(t);
                        }
                        delete incoming[t.id];
                    }
                    return true;
                });
                // 新增（防回弹：本地刚删除的对象不因他人稍旧的全量而复活）
                Object.keys(incoming).forEach(function(id) {
                    var td = incoming[id];
                    if (removeMissing && isRecentLocalRemove('tokens', td.id)) return;
                    mapTokens.push(createMapTokenElement(td.id, td.charId, td.name, td.portraitUrl, td.x, td.y, td.size||48, td.rotation||0));
                });
                mapTokens.forEach(function(t){ maxId = Math.max(maxId, t.id||0); });
                tokenIdCounter = Math.max(tokenIdCounter, maxId);
                updateAllFogCoverage();
            }

            function mergeRemoteTexts(list, removeIds, removeMissing) {
                var incoming = {};
                (list||[]).forEach(function(td){ if (td && td.id !== undefined) incoming[td.id] = td; });
                var removeSet = {};
                (removeIds||[]).forEach(function(id){ removeSet[id] = true; });
                textBoxes = textBoxes.filter(function(b) {
                    if (_isDraggingRef(b)) { delete incoming[b.id]; return true; }
                    // 防回弹：全量消息不覆盖/删除本地保护期内刚编辑的对象
                    if (removeMissing && isRecentLocalEdit('texts', b.id)) { delete incoming[b.id]; return true; }
                    if (removeSet[b.id] || (removeMissing && !(b.id in incoming))) {
                        if (b.el) b.el.remove();
                        return false;
                    }
                    var td = incoming[b.id];
                    if (td) {
                        b.x = td.x; b.y = td.y; b.text = td.text; b.fontSize = td.fontSize;
                        if (b.el) {
                            b.el.style.left = td.x + 'px'; b.el.style.top = td.y + 'px';
                            if (b.el.textContent !== td.text) b.el.textContent = td.text;
                        }
                        delete incoming[b.id];
                    }
                    return true;
                });
                Object.keys(incoming).forEach(function(id) {
                    var td = incoming[id];
                    if (removeMissing && isRecentLocalRemove('texts', td.id)) return;
                    var box = createTextBoxElement(td.id, td.x, td.y, td.text, td.fontSize);
                    textBoxes.push(box); overlay.appendChild(box.el);
                });
                var maxId = 0;
                textBoxes.forEach(function(b){ maxId = Math.max(maxId, b.id||0); });
                textIdCounter = Math.max(textIdCounter, maxId);
            }

            function mergeRemoteLayers(list, removeMissing) {
                var incoming = {};
                (list||[]).forEach(function(ld){ if (ld && (ld.dataURL || ld.url || ld.id !== undefined)) incoming[ld.id] = ld; });
                var changed = false;
                mapLayers = mapLayers.filter(function(l) {
                    if (removeMissing && !(l.id in incoming)) { changed = true; return false; }
                    var ld = incoming[l.id];
                    if (ld) {
                        l.name = ld.name; l.visible = ld.visible !== false;
                        l.offsetX = ld.offsetX||0; l.offsetY = ld.offsetY||0; l.scale = ld.scale||1;
                        var src = ld.url || ld.dataURL;
                        var curSrc = l.url || l.dataURL;
                        if (src && src !== curSrc) {
                            var img = new Image();
                            var oldImage = l.image;  // 保留旧图，新图加载失败时回退
                            img.onload = function(){ redrawCanvas(); };
                            img.onerror = function(){
                                console.warn('远程图层更新失败(保留旧图): id=' + ld.id + ' src=' + src);
                                l.image = oldImage;  // 回退到旧图
                            };
                            img.src = src;
                            l.image = img; l.url = ld.url||''; l.dataURL = ld.dataURL||'';
                        }
                        delete incoming[l.id];
                        changed = true;
                    }
                    return true;
                });
                Object.keys(incoming).forEach(function(id) {
                    var ld = incoming[id];
                    var src = ld.url || ld.dataURL;
                    if (!src) return;
                    var img = new Image();
                    img.onload = function(){ redrawCanvas(); renderLayerList(); };
                    img.onerror = function(){
                        console.warn('远程新图层加载失败: id=' + ld.id + ' name=' + ld.name + ' src=' + src);
                        // 标记为加载失败（可见但无图片，待后续修复）
                        ld._loadFailed = true;
                    };
                    img.src = src;
                    mapLayers.push({id:ld.id, name:ld.name, image:img, url:ld.url||'', dataURL:ld.dataURL||'',
                                    visible:ld.visible!==false, offsetX:ld.offsetX||0, offsetY:ld.offsetY||0, scale:ld.scale||1});
                    changed = true;
                });
                if (mapLayers.length > 0 && !mapLayers.some(function(l){ return l.id === activeLayerId; })) {
                    activeLayerId = mapLayers[0].id;
                }
                var maxId = 0;
                mapLayers.forEach(function(l){ maxId = Math.max(maxId, l.id||0); });
                layerIdCounter = Math.max(layerIdCounter, maxId);
                if (changed) { redrawCanvas(); renderLayerList(); }
            }

            function applyRemoteFog(fd) {
                // 兼容新格式 {layers, visible} 和旧格式（纯数组）
                var layers = fd;
                if (fd && typeof fd.layers !== 'undefined') {
                    layers = fd.layers;
                    if (typeof fd.visible !== 'undefined') {
                        fogVisible = !!fd.visible;
                        document.getElementById('fog-canvas').style.display = fogVisible ? 'block' : 'none';
                    }
                }
                layers = layers || [];
                if (layers.length > 0 && layers[0].polygons !== undefined) {
                    fogLayers = layers.map(function(l) { return {id:l.id,name:l.name,visible:l.visible!==false,polygons:(l.polygons||[]).map(function(p){return{points:p.points,closed:p.closed};})}; });
                } else if (layers.length > 0) {
                    fogLayers = [{id:1,name:'迷雾 1',visible:true,polygons:layers.map(function(p){return{points:p.points,closed:p.closed};})}];
                } else {
                    fogLayers = [];
                }
                fogLayerIdCounter = fogLayers.length;
                activeFogLayerId = fogLayers[0] ? fogLayers[0].id : null;
                redrawFogCanvas();
            }

            function mergeRemoteStrokes(list) {
                // 按 id 去重合并（P1-1）；对无 id 的旧数据退回长度差追加
                var localIds = {};
                brushStrokes.forEach(function(s){ if (s.id) localIds[s.id] = true; });
                var fresh = (list||[]).filter(function(s){ return s.id && !localIds[s.id]; });
                if (fresh.length === 0 && (list||[]).length > brushStrokes.length) {
                    fresh = list.slice(brushStrokes.length).filter(function(s){ return !s.id; });
                }
                if (fresh.length > 0) {
                    brushStrokes = brushStrokes.concat(fresh);
                    redrawDrawCanvas();
                }
            }

            function pullSharedCanvas() {
                // WebSocket 连接时跳过 HTTP 轮询（WS 实时推送增量，避免冲突闪回）
                if (window._wsIsOpen()) return;
                // 防回弹：本地有未推送的修改或推送在途时暂停拉取，等状态推完再对齐
                if (window._anyDirty() || _pushDebounce || _pushInFlight) return;
                // 本地状态刚从磁盘恢复且当前为DM时跳过拉取，防止服务端旧数据覆盖本地最新状态
                // PL 玩家始终以服务端数据为准
                if (window._localStateRestored && window._isDM) return;
                fetch('/api/shared-canvas?since_ver=' + sharedCanvasVer).then(function(r) { return r.json(); }).then(function(data) {
                    if (!data.ok || !data.changed) return;
                    sharedCanvasTs = data.timestamp;
                    if (data.version !== undefined) sharedCanvasVer = data.version;
                    var state = data.state;
                    // 笔画：按 id 合并
                    if (state.strokes) {
                        if (state.strokes.length === 0) { brushStrokes = []; redrawCanvas(); }
                        else mergeRemoteStrokes(state.strokes);
                    }
                    // 图层/标记/文字：按 id 差量合并（全量语义：本地多余的删除）
                    if (state.layers) mergeRemoteLayers(state.layers, true);
                    if (state.tokens) mergeRemoteTokens(state.tokens, [], true);
                    if (state.texts) mergeRemoteTexts(state.texts, [], true);
                    // 迷雾：直接替换
                    if (state.fog) applyRemoteFog(state.fog);
                }).catch(function(){});
            }
            // 立即拉取一次 + 每1.5秒轮询（仅 WS 断开时实际发请求；WS 在线时直接跳过）
            pullSharedCanvas();
            setInterval(pullSharedCanvas, 1500);

            // 通用变更通知

            // 启动WebSocket实时协作画布（与HTTP共用5000端口 /ws路径）
            connectWebSocket();

            // 画笔诊断：启动后 3 秒测试 drawCtx 是否可用
            setTimeout(function() {
                try {
                    var testCtx = drawCanvas.getContext('2d');
                    testCtx.fillStyle = '#ff0000';
                    testCtx.fillRect(50, 50, 10, 10);
                    var pixel = testCtx.getImageData(50, 50, 1, 1).data;
                    testCtx.clearRect(50, 50, 10, 10);
                    if (pixel[0] === 255 && pixel[3] === 255) {
                        console.log('🖌 画笔诊断通过: drawCtx 正常, drawCanvas=' + drawCanvas.width + 'x' + drawCanvas.height);
                    } else {
                        console.warn('⚠ 画笔诊断异常: drawCtx 绘制结果RGBA=(' + pixel.join(',') + '), canvas尺寸=' + drawCanvas.width + 'x' + drawCanvas.height);
                    }
                } catch(e) {
                    console.error('❌ 画笔诊断失败: drawCtx 测试抛出异常', e);
                }
            }, 3000);

            // 2秒后检测同步状态
            setTimeout(function() {
                var wsOk = (_wsClient && _wsClient.readyState === WebSocket.OPEN);
                fetch('/api/shared-canvas?since=0').then(function(r){return r.json();}).then(function(d){
                    var sc = d.state || {};
                    var hasData = (sc.strokes||[]).length > 0 || (sc.layers||[]).length > 0 || (sc.tokens||[]).length > 0;
                    if (wsOk && hasData) addSystemMsg('✅ 共享画布就绪 (' + (sc.strokes||[]).length + '笔/' + (sc.layers||[]).length + '层/' + (sc.tokens||[]).length + '标记)');
                    else if (wsOk) addSystemMsg('🟢 实时同步已连接，等待内容...');
                    else if (hasData) addSystemMsg('🌐 画布已就绪（HTTP同步模式）');
                    else addSystemMsg('📋 画布就绪，等待绘制');
                }).catch(function(){});
            }, 2000);

// ━━━ 当用户设置聊天名后启动心跳 ━━━
            const _origSetChatUser = window.setChatUser;
            window.setChatUser = function() {
                _origSetChatUser();
                setTimeout(() => { startHeartbeat(); }, 2000);
            };
        })();

        // ━━ 3D骰子快捷入口 ━━
        window.open3DDice = function() {
            var expr = document.getElementById('dicepop-expr').value.trim() || 'd20';
            window.open('/dice3d?expr=' + encodeURIComponent(expr), '_blank', 'width=900,height=700');
        };
