        // 声音开关（HTML onclick 调用，需全局作用域）
        var _northSoundOn = false;
        function toggleNorthSound() {
            _northSoundOn = !_northSoundOn;
            var bgVideo = document.getElementById('bgVideo');
            var icon = document.getElementById('soundPromptIcon');
            var icon2 = document.getElementById('soundToggleBtn');
            var text = document.getElementById('soundPromptText');
            if (bgVideo) bgVideo.muted = !_northSoundOn;
            if (icon) icon.textContent = _northSoundOn ? '🔊' : '🔇';
            if (icon2) icon2.textContent = _northSoundOn ? '🔊' : '🔇';
            if (text) text.textContent = _northSoundOn ? '声音已开启' : '点击开启声音';
        }

        window.onerror = function(msg, src, line, col, err) {
            (document.getElementById('outputArea')||{}).innerHTML = '<div style=\"color:#e0556a;padding:1rem;\">⚠️ 脚本错误: ' + msg + '<br>文件: ' + src + '<br>行号: ' + line + '</div>';
            console.error(msg, src, line, col, err);
            try { navigator.sendBeacon('/api/error-report', JSON.stringify({message:String(msg||''), source:String(src||''), lineno:line||0, url:location.href, page:'/north'})); } catch(e) {}
        };
        (function() {
            'use strict';

            // =========================================================================
            // 零、工具函数 & 自定义弹窗（替换浏览器 alert/confirm/prompt）
            // =========================================================================

            // 自定义弹窗组件 — 北境冰霜主题
            function northDialog(options) {
                var o = options || {};
                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
                var card = document.createElement('div');
                card.style.cssText = 'background:linear-gradient(180deg,#1a1a2e 0%,#12122a 100%);border:2px solid #e94460;border-radius:12px;padding:24px 20px;max-width:380px;width:90%;box-shadow:0 8px 40px rgba(233,68,96,0.25);text-align:center;';
                var title = o.title || '';
                var msg = o.msg || '';
                var type = o.type || 'alert'; // alert | confirm | prompt
                var defaultVal = o.defaultVal || '';
                var placeholder = o.placeholder || '';
                card.innerHTML = '<h3 style="color:#ffd700;margin-bottom:10px;font-size:1rem;">' + title + '</h3>'
                    + '<p style="color:#c0c0d0;font-size:0.82rem;margin-bottom:16px;line-height:1.5;white-space:pre-wrap;">' + msg + '</p>'
                    + (type === 'prompt'
                        ? '<input type="text" id="__nd_input" value="' + defaultVal.replace(/"/g,'&quot;') + '" placeholder="' + placeholder + '" style="width:100%;padding:9px 12px;background:#0a0a14;border:1px solid #2a2a40;border-radius:6px;color:#e0e0e0;font-size:0.9rem;text-align:center;box-sizing:border-box;margin-bottom:14px;" maxlength="100">'
                        : '')
                    + '<div style="display:flex;gap:8px;justify-content:center;">'
                    + (type === 'confirm'
                        ? '<button id="__nd_cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:1px solid #2a2a40;border-radius:6px;color:#888;cursor:pointer;font-size:0.85rem;">取消</button>'
                        : (type === 'prompt'
                            ? '<button id="__nd_cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:1px solid #2a2a40;border-radius:6px;color:#888;cursor:pointer;font-size:0.85rem;">取消</button>'
                            : ''))
                    + '<button id="__nd_ok" style="flex:1;padding:10px;background:#e94460;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;">' + (o.okText || '确定') + '</button>'
                    + '</div>';
                overlay.appendChild(card);
                document.body.appendChild(overlay);
                overlay.onclick = function(e) { if (e.target === overlay && type === 'alert') { overlay.remove(); if (o.onOk) o.onOk(); } };
                var okBtn = document.getElementById('__nd_ok');
                var cancelBtn = document.getElementById('__nd_cancel');
                var input = document.getElementById('__nd_input');
                function close(result) {
                    overlay.remove();
                    if (o.onOk && result !== false) o.onOk(type === 'prompt' ? (input ? input.value.trim() : '') : true);
                    if (o.onCancel && result === false) o.onCancel();
                }
                if (okBtn) okBtn.addEventListener('click', function() { close(true); });
                if (cancelBtn) cancelBtn.addEventListener('click', function() { close(false); });
                if (input) { input.focus(); input.select(); input.addEventListener('keydown', function(e) { if (e.key === 'Enter') close(true); if (e.key === 'Escape') close(false); }); }
                document.addEventListener('keydown', function _ndk(e) { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', _ndk); } });
            }

            // 直接替换 alert — 仅通知
            var _origAlert = window.alert;
            window.alert = function(msg) { northDialog({ title: '❄️ 北境雪原', msg: String(msg||''), type: 'alert' }); };

            // ━━━ 以下为原有工具函数 ━━━
            // =========================================================================
            // 零、工具函数（需在 IIFE 顶部声明，供全作用域使用）
            // =========================================================================
            function fmtCoinHtml(gp, sp, cp) {
                gp = gp || 0; sp = sp || 0; cp = cp || 0;
                var parts = [];
                if (gp) parts.push('<span style=\"color:#ffd700;\">' + gp + ' GP</span>');
                if (sp) parts.push('<span style=\"color:#c0c0c0;\">' + sp + ' SP</span>');
                if (cp) parts.push('<span style=\"color:#cd7f32;\">' + cp + ' CP</span>');
                if (parts.length === 0) parts.push('<span style=\"color:#7a6a5a;\">0 GP</span>');
                return parts.join(' ');
            }

            // =========================================================================
            // 一、完整事件表
            // =========================================================================
            // =========================================================================
            // 一、完整事件表（数据定义已移入 /static/north-data.js，经 window.NORTH_DATA 注入）
            // =========================================================================
            const TABLES = window.NORTH_DATA.TABLES;
            const TABLE_NAMES = window.NORTH_DATA.TABLE_NAMES;


            // =========================================================================
            // 二、工具函数
            // =========================================================================
            function rand(max) { return Math.floor(Math.random() * max) + 1; }

            function rollDice(expr) {
                const match = expr.match(/^d(\d+)$/i);
                if (!match) return { expr, total: rand(100), rolls: [rand(100)] };
                const sides = parseInt(match[1], 10);
                const val = rand(sides);
                return { expr, total: val, rolls: [val] };
            }

            function rollDiceExpr(expr) {
                // 支持 1d4, 2d6+3 等
                const match = expr.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
                if (!match) return rand(parseInt(expr) || 6);
                const count = parseInt(match[1]) || 1;
                const sides = parseInt(match[2]);
                const mod = parseInt(match[3] || '0');
                let total = 0;
                for (let i = 0; i < count; i++) {
                    total += rand(sides);
                }
                return total + mod;
            }

            function findClosestKey(items, val) {
                const keys = Object.keys(items).map(Number).sort((a, b) => a - b);
                let closest = keys[0];
                for (const k of keys) {
                    if (k <= val) closest = k;
                    else break;
                }
                return closest;
            }

            function abilityMod(score) {
                return Math.floor((score - 10) / 2);
            }

            // =========================================================================
            // 三、生存系统核心
            // =========================================================================

            // 燃料物品映射（双向：物品名↔survival.fuel键）
            const FUEL_NAME_TO_KEY = { '松枝':'pine_branch', '松脂':'resin', '铁松松脂':'iron_resin', '荧光苔':'glow_moss', '柴火/石块':'firewood' };
            const FUEL_KEY_TO_NAME = { pine_branch:'松枝', resin:'松脂', iron_resin:'铁松松脂', glow_moss:'荧光苔', firewood:'柴火/石块' };

            // 生存状态
            let survival = {
                gameHour: 5, // 游戏内时间（小时），默认上午5:00
                coldLevel: 0, // 0-3
                rations: 3,
                fuel: { pine_branch: 0, resin: 0, iron_resin: 0, glow_moss: 0, firewood: 0 },
                lightActive: false,
                lightType: null,
                lightRemaining: 0,
                isLost: false,
                lostEventsRemaining: 0,
                lostDcPenalty: 0,
                isInShelter: false,
                shelterType: null, // 'hunter_hut' | 'hot_spring' | 'cave'
                isInBlizzard: false,
                isNight: true,
                // 计数器
                eventsSinceCold: 0,
                eventsSinceRation: 0,
                eventsSinceOrient: 0,
                eventsSinceFuel: 0,
                totalEvents: 0,
                // 断粮状态
                isStarving: false,
                starvationCount: 0,
                // 探索深度
                exploreDepth: 0,       // 深入雪原+1，返回成功-1
                // 火把效果
                torchChecks: 0,       // 剩余免疫严寒检定次数
                // 驱寒药膏效果
                coldResist: 0,        // 剩余抵抗寒冷事件次数（含严寒考验）
                // 寒鸦庇护
                ravenProtection: 0,  // 剩余庇护事件次数
                // 恶霜现象 — 持续效果追踪
                evilFrostActive: false,
                // 难度
                difficulty: 'standard' // 'light' | 'standard' | 'hardcore'
            };

            // 角色数据（v5.5：移除内置默认角色，新号进入无角色，需在营地新建或导入Excel）
            const charData = {};
            // 默认角色模板
            function defaultCharTemplate(name) {
                return { name, rank:'青羽', level:1, class:'战士', race:'人类', hp:10, hpMax:10, tempHp:0, ac:10, speed:30, profBonus:2, passivePerception:10, str:10, dex:10, con:10, int:10, wis:10, cha:10, height:'', weight:'', alignment:'', faith:'', gender:'', languages:'通用语', keyAbilities:'', resistances:'', spellSaveDc:10, spellAttackBonus:0, skillProfs:{}, saveProfs:{}, weapons:[], inventory:[], coins:{cp:0,sp:0,gp:0}, spells:[], background:{personality:'',ideals:'',bonds:'',flaws:'',appearance:'',backstory:''}, features:[] };
            }

            let activeChar = null;
            let activeCharId = null;
            // 状态池：道具使用后产生的临时状态（如"下次体质检定优势"），
            // 匹配检定时自动生效并消耗。[{key, name, source, uses}]
            let statusPool = [];
            let statsData = { total: 0, groups: {} };
            let rollCount = 0;
            let deepCount = 0; // 调查附近连续次数
            let fullLog = [];
            let displayLog = [];
            const MAX_DISPLAY = 16;

            // 书页系统全局状态
            let bookOpen = false;
            let activeBookTab = 'rules';
            let bookPages = [
                { title: '苍白大地', content: '北境，亚罗帝国以北的极寒之地。\n\n这片被冰雪覆盖的荒原埋藏着无数秘密——远古战场、巨兽骨骸、神秘祭坛，以及那被称为"九子"的古老注视。\n\n冒险者，你踏上的是一条不归路。' }
            ];
            let currentPageIdx = 0;
            let discoveredItems = []; // 所有探索获得过的物品
            let eventSubStats = {}; // 事件子结果统计 { "发现材料": { "松枝": 8, "药草": 5 }, ... }
            let campStorage = []; // 营地仓库独立存储（物品）
            let campStorageCoins = { gp: 0, sp: 0, cp: 0 }; // 营地仓库资金
            // 营地仓库数据规范化：旧存档/异常数据可能把 campStorage 存成对象 {物品名: 数量}，
            // 统一转回数组 [{name, qty}]，避免渲染时 (inv||[]).map 崩溃
            // （定义在此层：collectNorthSaveData/loadNorthFromServer 等存档函数需调用）
            function normalizeCampStorage(v) {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                if (typeof v === 'object') {
                    var arr = [];
                    Object.keys(v).forEach(function(k) {
                        var val = v[k];
                        var qty = (val && typeof val === 'object') ? (val.qty || val.quantity || 1) : val;
                        qty = parseInt(qty) || 1;
                        if (qty > 0) arr.push({ name: k, qty: qty, location: '仓库', weight: 1 });
                    });
                    return arr;
                }
                return [];
            }
            let shopBpCollapsed = { supply: true, smith: true, alchemy: true }; // 背包折叠状态
            let shopFundsGP = 1000, shopFundsSP = 0, shopFundsCP = 0; // 商店资金
            let shopCurrentPrices = {};  // {物品名: {gp, sp}}
            let shopCurrentStock = {};   // {物品名: qty}
            let shopCaravanItems = [];   // [{name, priceGP, priceSP, qty, desc}]
            let caravanReturnCounter = 0; // 商队返回计数
            let wsSmeltOre = null, wsSmeltCoal = 0, wsSmeltBars = 0, wsSmeltIngot = null;
            let wsSmeltTimer = null, wsSmeltProgress = 0;
            let craftedItems = {}; // 已解锁的配方 { 物品名: [配方名, ...] }
            // 物品合成配方（每个材料可有多个配方）
            const ITEM_SYNTHESIS = {
                '药草': [{ recipe:'治疗药水', text:'药草×4 + 魔法泉水×2 → 治疗药水（恢复2d4+2生命）' },
                        { recipe:'驱寒药膏', text:'药草×2 + 松脂×1 → 驱寒药膏（消除2级严寒，6次抵抗含严寒考验）' }],
                '魔法泉水': [{ recipe:'治疗药水', text:'魔法泉水×2 + 药草×4 → 治疗药水（恢复2d4+2生命）' },
                    { text:'单独饮用后下次智力相关检定优势，也许可以调配为药水' }],
                '松枝': [{ recipe:'火把', text:'松枝×1 + 燃料×2 → 火把（免疫2次严寒考验，消除2级严寒）' },
                        { recipe:'网兜', text:'松枝×1 + 银蛛蛛网×2 → 网兜（可触10尺）' },
                        { recipe:'长柄网兜', text:'松枝×2 + 银蛛蛛网×3 → 长柄网兜（15尺）' }],
                '银蛛蛛网': [{ recipe:'网兜', text:'松枝×1 + 银蛛蛛网×2 → 网兜（可触10尺）' },
                            { recipe:'长柄网兜', text:'松枝×2 + 银蛛蛛网×3 → 长柄网兜（15尺）' }],
                '松脂': [{ recipe:'驱寒药膏', text:'药草×2 + 松脂×1 → 驱寒药膏（消除2级严寒，6次抵抗含严寒考验）' },
                        { recipe:'火把', text:'可作为燃料合成火把（松枝×1 + 燃料×2）' }],
                '火把': [{ recipe:'火把', text:'效果：点燃免疫2次严寒考验，点燃时消除2级严寒等级' }],
                '治疗药水': [{ recipe:'治疗药水', text:'效果：恢复2d4+2生命值' }],
                '网兜': [{ recipe:'网兜', text:'效果：可触距离10尺，可制作陷阱捕获生物' }],
                '长柄网兜': [{ recipe:'长柄网兜', text:'效果：可触距离15尺，容量更大' }],
                '驱寒药膏': [{ recipe:'驱寒药膏', text:'效果：消除2级严寒，接下来6次事件抵抗寒冷体质豁免（包括严寒考验）' }],
            };
            let discoveredCreatures = []; // 所有遭遇过的生物
            // 生物分类：敌对/中立
            const CREATURE_CATEGORY = {
                '冰原狼':'hostile','野猪':'hostile','柯莫得白熊':'hostile','卡佐巨熊':'hostile','冈达尔巨鹰':'hostile','寒脊蛇':'hostile',
                '雪蹄兔':'neutral','野鹿':'neutral','雪鸮':'neutral','都灵寒鸦':'neutral','雪狐':'neutral','霜鼠':'neutral','雪貂':'neutral','麝牛':'neutral','银蛛':'neutral','霜羽雉':'neutral','绒蜂巢':'neutral',
                '霜巨魔':'hostile','恶尸':'hostile','瘦鹿':'hostile','冬之氏族精灵':'neutral','霜灵':'neutral','水星守卫':'neutral'
            };

            // 掷骰加载动画（六点弹跳，约3秒）
            function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
            async function showLoadingAnimation(label) {
                const div = document.createElement('div');
                div.className = 'log-entry';
                div.style.textAlign = 'center';
                div.innerHTML = '<span style="color:#88ccff;font-size:1rem;font-weight:500;">🎲 ' + label + '中</span><span id="load-dots" style="color:#6abf8a;font-size:1.1rem;"></span>';
                outputEl.appendChild(div);
                outputEl.scrollTop = outputEl.scrollHeight;
                const dotsEl = document.getElementById('load-dots');
                // 阶段1：逐字显示六个点
                for (let i = 1; i <= 6; i++) {
                    dotsEl.innerHTML = '<span>' + Array(i).fill('<dot>.</dot>').join('') + '</span>';
                    await sleep(55);
                }
                const allDots = dotsEl.querySelectorAll('dot');
                allDots.forEach(function(d) { d.style.display = 'inline-block'; });
                const order = [1, 3, 5, 0, 2, 4];
                const upMs = 42, downMs = 42, gapMs = 35;
                for (let wave = 0; wave < 2; wave++) {
                    for (let step = 0; step < order.length; step++) {
                        const idx = order[step];
                        allDots[idx].style.transition = 'transform ' + (upMs/1000) + 's ease-out';
                        allDots[idx].style.transform = 'translateY(-10px)';
                        if (step > 0) {
                            const prevIdx = order[step - 1];
                            allDots[prevIdx].style.transition = 'transform ' + (downMs/1000) + 's ease-in';
                            allDots[prevIdx].style.transform = 'translateY(0)';
                        }
                        await sleep(gapMs + upMs);
                    }
                    allDots[order[order.length-1]].style.transition = 'transform ' + (downMs/1000) + 's ease-in';
                    allDots[order[order.length-1]].style.transform = 'translateY(0)';
                    await sleep(downMs + 80);
                }
                return div;
            }

            // 昏迷倒下状态
            let _knockedDown = false;
            let _knockedDownDate = null;
            let _knockedDownDuringEvent = false;

            function isKnockedDown() {
                if (!_knockedDown || !_knockedDownDate) return false;
                const now = new Date();
                const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
                // 还是同一天 → 仍然昏迷
                if (today === _knockedDownDate) return true;
                // 已经到第二天 → 自动恢复
                recoverFromKnockdown();
                return false;
            }

            function knockDown() {
                _knockedDown = true;
                const now = new Date();
                _knockedDownDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
                // 不清除已有消息，在下方追加昏迷提示
                addSystemLog('💀 冒险者你已昏迷倒下，请等待路过的好心人救助带回营地。', 'danger');
                addSystemLog(`⏳ 北京时间 ${_knockedDownDate} 24:00 之后方可继续探索`, 'system');
                // 锁定事件
                lockEvents();
                // 标记：如果正在执行事件，阻止后续 displayResult 显示
                _knockedDownDuringEvent = true;
            }

            function recoverFromKnockdown() {
                _knockedDown = false;
                _knockedDownDate = null;
                _knockedDownDuringEvent = false;
                // 恢复满状态
                if (activeChar) {
                    activeChar.hp = activeChar.hpMax;
                    activeChar.tempHp = 0;
                    renderCharDetail(activeCharId);
                }
                if (activeCharId && charData[activeCharId]) {
                    charData[activeCharId].hp = charData[activeCharId].hpMax;
                    charData[activeCharId].tempHp = 0;
                }
                // 重置生存状态
                survival.coldLevel = 0;
                survival.isStarving = false;
                survival.starvationCount = 0;
                survival.isLost = false;
                survival.lostEventsRemaining = 0;
                survival.lostDcPenalty = 0;
                survival.ravenProtection = 0;
                survival.evilFrostActive = false;
                survival.isInShelter = true;
                survival.shelterType = 'camp';
                updateSurvivalUI();
                // 显示恢复消息
                addSystemLog('💚 好心人将你救回营地，状态已完全恢复。', 'success');
                unlockEvents();
                // 自动切换到营地
                document.getElementById('exploreTab').classList.remove('active');
                document.getElementById('campTab').classList.add('active');
                document.getElementById('exploreView').style.display = 'none';
                document.getElementById('campView').style.display = '';
                renderStats();
                renderCampCharSheet();
            }

            // 检查并处理昏迷状态
            function checkKnockdown() {
                if (isKnockedDown()) {
                    addSystemLog(`💀 你仍在昏迷中，无法行动……北京时间 ${_knockedDownDate} 24:00 之后方可恢复`, 'danger');
                    return true;
                }
                return false;
            }

            // 检查活跃角色HP
            function checkHpZero() {
                if (activeChar && activeChar.hp <= 0) {
                    knockDown();
                    return true;
                }
                return false;
            }

            // 探索中锁定角色切换：仅在营地（深度0）或昏迷倒下时允许切换
            function canSwitchChar() {
                if (survival.exploreDepth > 0 && !isKnockedDown()) return false;
                return true;
            }

            // 事件结算锁：动画播放中 或 材料未确认时，禁止下一次事件
            let _eventLocked = false;
            let pendingGains = []; // 待确认的物品/钱币收益
            function lockEvents() {
                _eventLocked = true;
                document.querySelectorAll('.event-card').forEach(function(c) { c.style.opacity = '0.5';
                    c.style.pointerEvents = 'none'; });
            }
            function unlockEvents() {
                _eventLocked = false;
                document.querySelectorAll('.event-card').forEach(function(c) {
                    if (c.dataset.cmd === 'deep' && deepCount > 5) {
                        // 调查附近已穷尽，保持锁定
                        c.style.opacity = '';
                        c.style.pointerEvents = 'none';
                        c.classList.add('exhausted');
                    } else {
                        c.style.opacity = '1';
                        c.style.pointerEvents = 'auto';
                        c.classList.remove('exhausted');
                    }
                });
            }
            function isEventLocked() { return _eventLocked; }

            // DOM refs
            const outputEl = document.getElementById('outputArea');
            // 事件委托：检定按钮点击
            outputEl.addEventListener('click', function(e) {
                var btn = e.target.closest('.check-roll-btn');
                if (btn && !btn.disabled) {
                    e.preventDefault();
                    e.stopPropagation();
                    btn.disabled = true;
                    btn.textContent = '🎲 掷骰中...';
                    var cid = btn.dataset.checkid;
                    var step = parseInt(btn.dataset.step) || 0;
                    handleStepCheck(cid, step);
                }
                var ebtn = e.target.closest('.check-effect-btn');
                if (ebtn && !ebtn.disabled) {
                    e.preventDefault();
                    handleCheckEffect(ebtn.dataset.checkid);
                }
            });
            const rollCounter = document.getElementById('rollCounter');
            const statsList = document.getElementById('statsList');
            const statTotal = document.getElementById('statTotal');
            const charSelect = document.getElementById('charSelect');
            const charStatus = document.getElementById('charStatus');
            const charDetailContainer = document.getElementById('charDetailContainer');
            const survivalBadge = document.getElementById('survivalBadge');

            // =========================================================================
            // 四、生存系统函数
            // =========================================================================


            // =========================================================================
            // 五、事件联动系统
            // =========================================================================

            // 联动规则（仅处理唯一效果，燃料/物品已由 confirmGains/runCheckChain 统一处理）
            const LINK_RULES = [{
                trigger: { table: 'dc100', keyword: '发现踪迹' },
                action: () => {
                    if (survival.isLost) {
                        survival.isLost = false;
                        survival.lostEventsRemaining = 0;
                        survival.lostDcPenalty = 0;
                        addSystemLog('🧭 发现踪迹，迷失状态已解除！', 'success');
                    }
                }
            }, {
                trigger: { table: 'fx100', keyword: '猎人小屋' },
                action: () => {
                    addSystemLog('🏠 发现猎人小屋，可在此休整', 'success');
                }
            }, {
                trigger: { table: 'fx100', keyword: '天然温泉' },
                action: () => {
                    if (survival.coldLevel > 0) {
                        const removed = survival.coldLevel;
                        survival.coldLevel = 0;
                        survival.eventsSinceCold = 0;
                        addSystemLog(`♨️ 发现天然温泉，解除全部${removed}级严寒！`, 'success');
                    }
                }
            }, {
                trigger: { table: 'fx100', keyword: '岩洞' },
                action: () => {
                    addSystemLog('🏔️ 发现岩洞，可在此躲避恶劣天气', 'system');
                }
            }, {
                trigger: { table: 'sj6', keyword: '陷阱' },
                action: () => {
                    if (rand(6) === 6 && activeChar) {
                        const meat = rollDiceExpr('1d2');
                        var stacked = false;
                        for (var si = 0; si < activeChar.inventory.length; si++) {
                            if (activeChar.inventory[si].name === '兽肉') { activeChar.inventory[si].qty += meat;
                                stacked = true; break; }
                        }
                        if (!stacked) activeChar.inventory.push({name:'兽肉', qty:meat, location:'背包', weight:1});
                        addSystemLog(`🍖 陷阱中捕获兽肉×${meat}（已存入背包）`, 'success');
                    }
                }
            }];

            function processLinks(table, desc) {
                for (const rule of LINK_RULES) {
                    if (rule.trigger.table === table && desc.includes(rule.trigger.keyword)) {
                        rule.action();
                        updateSurvivalUI();
                    }
                }
            }

            // =========================================================================
            // 六、材料自动拾取 TABLE_ITEM_ACTIONS
            // =========================================================================
            // 模拟 dnd_bot.py 的 TABLE_ITEM_ACTIONS：事件表 → 掷骰值 → 物品/钱币
            // =========================================================================
            // 六、材料自动拾取 TABLE_ITEM_ACTIONS（数据定义已移入 north-data.js）
            const ITEM_ACTIONS = window.NORTH_DATA.ITEM_ACTIONS;
            // =========================================================================
            // 检定交互表：CHECK_ACTIONS[表键][骰值] = { title, desc, steps }
            // 每个step: { label, ability, dc, skill?, save?, damage?, passMsg, failMsg, passDone, failDone, passExtra?, failExtra? }
            // =========================================================================
            // =========================================================================
            // 检定交互表：CHECK_ACTIONS[表键][骰值] = { title, desc, steps }
            // 每个step: { label, ability, dc, skill?, save?, damage?, passMsg, failMsg, passDone, failDone, passExtra?, failExtra? }
            // 数据定义已移入 north-data.js（含闭包回调，经 window.NORTH_CTX 注入运行期上下文）
            // =========================================================================
            const CHECK_ACTIONS = window.NORTH_DATA.CHECK_ACTIONS;

            // =========================================================================
            // 〇、冒险者等级系统（青羽→白羽 7 级，等级数据在 north-data.js）
            // 基准：statsData.total（累计事件数）；等级为队伍全局进度，存档兼容（charData.rank 字段保留不动）
            // =========================================================================

            function findItemAction(cmd, rollVal) {
                const config = ITEM_ACTIONS[cmd];
                if (!config) return null;
                for (const [lo, hi, action] of config.ranges) {
                    if (rollVal >= lo && rollVal <= hi) return action;
                }
                return null;
            }

            // 根据物品名查找WP编号
            function findWpNum(name) {
                const wpItems = TABLES['wp'] ? TABLES['wp'].items : {};
                for (var k = 1; k <= 37; k++) {
                    if (wpItems[k] && wpItems[k].includes(name)) return parseInt(k);
                }
                return 0;
            }

            // 从输出文本提取材料名
            function extractMaterialName(text) {
                const lines = (text||'').split('\n');
                for (const line of lines) {
                    const t = line.trim();
                    if (t && !t.startsWith('🎲') && !t.startsWith('↳') && !t.startsWith('⏱') && !t.startsWith('📦') && !t.startsWith('💰')) {
                        const idx = t.indexOf('（');
                        return idx > 0 ? t.substring(0, idx).trim() : t.substring(0, 30).trim();
                    }
                }
                return '';
            }

            // =========================================================================
            // 七、事件执行核心（支持5层链式）
            // =========================================================================

            // 将描述文本中的骰子表达式替换为实际掷骰结果
            // 注意：物品效果描述中的骰子（如"1d6火焰伤害"）不替换
            function rollDiceInText(text) {
                if (!text) return text;
                var effectSuffixes = ['伤害','火焰','寒冷','穿刺','钝击','挥砍','生命','力竭'];
                return text.replace(/(\d+)d(\d+)(?:([+-])(\d+))?/g, function(match, count, sides, op, mod, offset, fullText) {
                    // 检查后4个字符是否为效果类关键词
                    var after = fullText.substring(offset + match.length, offset + match.length + 4);
                    for (var ei = 0; ei < effectSuffixes.length; ei++) {
                        if (after.indexOf(effectSuffixes[ei]) === 0) return match; // 物品属性，保留原文
                    }
                    var total = 0;
                    var cnt = parseInt(count);
                    var sid = parseInt(sides);
                    for (var i = 0; i < cnt; i++) {
                        total += Math.floor(Math.random() * sid) + 1;
                    }
                    if (op && mod) {
                        if (op === '+') total += parseInt(mod);
                        else total -= parseInt(mod);
                    }
                    return total;
                });
            }

            function executeEvent(cmd, args, depth, probe) {
                depth = depth || 0;
                probe = !!probe; // 探测模式：只计算不产生副作用（供寒鸦庇护重掷使用）
                if (depth > 5) return { output: '⚠️ 链式嵌套过深（超过5层）' };

                const table = TABLES[cmd];
                if (!table) return { error: `未知事件表: ${cmd}` };

                if (cmd === 'wp') {
                    let num = parseInt(args, 10);
                    if (isNaN(num) || num < 1 || num > 32) {
                        const lines = ['📦 物品表（1-32）'];
                        const items = table.items;
                        for (let k = 1; k <= 37; k++) {
                            lines.push(`  ${k.toString().padStart(2)}  ${items[k] || '（空）'}`);
                        }
                        return { output: lines.join('\n'), gains: [] };
                    }
                    const item = table.items[num] || '未知物品';
                    return { output: `📦 物品 #${num}\n   ${item}`, gains: [] };
                }

                const dice = table.dice || 'd100';
                // 支持强制掷骰值（用于检定成功后的链式奖励）
                var forceVal = parseInt(args, 10);
                var val;
                if (!isNaN(forceVal) && forceVal > 0 && table.items[forceVal] !== undefined) {
                    val = forceVal;
                } else {
                    val = rollDice(dice).total;
                }
                const items = table.items;
                const key = findClosestKey(items, val);
                let entry = items[key];
                if (!entry) return { output: `🎲 ${table.label} [${dice}: ${val}]\n   （未定义条目）` };

                let desc, chainCmd;
                if (Array.isArray(entry)) {
                    desc = entry[0];
                    chainCmd = entry[1];
                } else {
                    desc = entry;
                    chainCmd = null;
                }

                // 追踪生物遭遇（probe 时只收集数据，不写入）
                const creatureTables = ['ys10','zl12','sw100'];
                const effects = {};
                if (creatureTables.includes(cmd)) {
                    const cm = desc.match(/^(\d+)只?\s*(.+?)(?:[（(]|$)/);
                    if (cm) {
                        const count = parseInt(cm[1]) || 1;
                        const name = cm[2].trim();
                        effects.creature = { name: name, count: count, times: 1 };
                        if (!probe) {
                            const existing = discoveredCreatures.find(function(c) { return c.name === name; });
                            if (existing) { existing.totalCount += count;
                                existing.times++; }
                            else { discoveredCreatures.push({name:name, totalCount:count, times:1, cat:CREATURE_CATEGORY[name]||'neutral'}); }
                        }
                    }
                }

                const indent = '   '.repeat(depth);
                let outputLines = [];
                // 仅顶层显示事件标题，链式内容不对外展示（保持神秘感）
                if (depth === 0) {
                    outputLines.push(`🎲 ${table.label}`);
                    outputLines.push(`${desc}`);
                }

                // 记录统计（顶层才记录）
                if (depth === 0) {
                    const shortName = desc.split('（')[0].split('(')[0].trim();
                    effects.statTable = table.label;
                    effects.statEvent = shortName || desc.slice(0, 12);
                    effects.isContinue = desc.includes('深入雪原');

                    // ★ 迷失状态：'深入雪原'/'返回' 无效，重新检定（不产生任何记录与消耗）
                    if (survival.isLost && survival.lostEventsRemaining > 0 &&
                        (effects.isContinue || desc.includes('返回'))) {
                        return executeEvent(cmd, args, depth, probe);
                    }

                    if (!probe) {
                        recordStat(effects.statTable, effects.statEvent);

                        // ★ 生存系统：事件后处理
                        // 1. 检查是否"深入雪原"（纯文本事件，不触发消耗）
                        if (!effects.isContinue) {
                            // 触发生存检查
                            window.NORTH_SURVIVAL.checkCold();
                            window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation();
                            window.NORTH_SURVIVAL.checkOrient();
                            window.NORTH_SURVIVAL.checkFuel();
                            // 驱寒药膏：每事件递减抵抗计数
                            if (survival.coldResist > 0) {
                                survival.coldResist--;
                                if (survival.coldResist === 0) addSystemLog('🧴 驱寒药膏效果已消散', 'system');
                            }
                            survival.totalEvents++;
                            advanceTime(1);
                        }
                        // 更新UI（所有事件都刷新）
                        updateSurvivalUI();

                        // 2. 恶霜持续效果：每事件生存DC15方向辨别，失败损失1d4生命
                        if (survival.evilFrostActive && !effects.isContinue) {
                            var efBonus = 0, efProf = 0;
                            if (activeChar) { efBonus = abilityMod(activeChar.wis);
                                var efSkills = activeChar.skillProfs || {};
                                if (efSkills['生存']) efProf = activeChar.profBonus || 0; }
                            var efD20 = rand(20);
                            var efTotal = efD20 + efBonus + efProf;
                            if (efTotal >= 15) {
                                survival.evilFrostActive = false;
                                addSystemLog('👻 恶霜现象：方向辨别成功（d20=' + efD20 + '+' + (efBonus+efProf) + '=' + efTotal + ' ≥ DC15），恶霜消散！', 'success');
                            } else {
                                var efDmg = rollDiceExpr('1d4');
                                if (activeChar) { activeChar.hp = Math.max(0, activeChar.hp - efDmg);
                                    renderCharDetail(activeCharId);
                                    if (activeChar.hp <= 0) checkHpZero(); }
                                addSystemLog('👻 恶霜现象：方向辨别失败（d20=' + efD20 + '+' + (efBonus+efProf) + '=' + efTotal + ' < DC15），失去' + efDmg + '生命', 'danger');
                            }
                            updateSurvivalUI();
                        }

                        // 3. 处理联动（修正：规则按表键匹配）
                        processLinks(cmd, desc);

                        // 3. 迷失状态影响：每次有效事件递减1，剩余0次时解除
                        if (survival.isLost && survival.lostEventsRemaining > 0) {
                            survival.lostEventsRemaining--;
                            if (survival.lostEventsRemaining === 0) {
                                survival.isLost = false;
                                addSystemLog('🧭 迷失状态已解除', 'success');
                                updateSurvivalUI();
                            }
                        }
                    } else {
                        // 探测模式：记录需后置应用的迷失递减
                        effects.applyLost = survival.isLost && survival.lostEventsRemaining > 0;
                    }
                }

                // 链式调用：仍然执行完整链，但只传递最终层的描述
                let chainGains = [];
                let finalDesc = desc;
                let isHostile = false;
                let checkAction = null; // 检定交互（提前声明，供链式传播和本表检测共用）
                let feedable = null; // 可喂食生物名（提前声明，避免链式传播时的TDZ错误）
                if (chainCmd && TABLE_NAMES.includes(chainCmd)) {
                    const subResult = executeEvent(chainCmd, '', depth + 1, probe);
                    if (subResult.gains) chainGains = subResult.gains;
                    if (subResult.finalDesc) finalDesc = subResult.finalDesc;
                    if (subResult.isHostile) isHostile = true;
                    if (subResult.feedable) feedable = subResult.feedable;
                    if (subResult.checkAction) checkAction = subResult.checkAction;
                    // 收集链式表的联动规则（温泉消寒、猎人小屋、岩洞等），探测模式统一后置应用
                    effects.linkCalls = effects.linkCalls || [];
                    if (subResult.effects && subResult.effects.linkCalls) {
                        effects.linkCalls = effects.linkCalls.concat(subResult.effects.linkCalls);
                    }
                    effects.linkCalls.push({ table: chainCmd, desc: finalDesc });
                    if (!probe) processLinks(chainCmd, finalDesc);
                    // 记录子结果到 eventSubStats（用于冒险记录详情展示）
                    if (depth === 0 && effects.statEvent && finalDesc) {
                        var subName = finalDesc.split('（')[0].split('(')[0].trim();
                        if (subName && subName !== effects.statEvent) {
                            if (!eventSubStats[effects.statEvent]) eventSubStats[effects.statEvent] = {};
                            eventSubStats[effects.statEvent][subName] = (eventSubStats[effects.statEvent][subName] || 0) + 1;
                        }
                    }
                }

                // 本表自身的联动规则：probe 模式下推迟到 applyEventEffects 执行
                if (probe && !chainCmd) {
                    effects.linkCalls = effects.linkCalls || [];
                    effects.linkCalls.push({ table: cmd, desc: desc });
                }

                // 检查本表是否有物品/钱币产出（仅最终层）
                let myGain = null;
                if (cmd !== 'wp' && !chainCmd) {
                    const action = findItemAction(cmd, val);
                    if (action) { if (action.qty_roll) action._rolledQty = rollDiceExpr(action.qty_roll); if (action.coin_roll) action._rolledCoin = rollDiceExpr(action.coin_roll);
                        myGain = { cmd, val, action }; }
                    // 检测检定交互（用 findClosestKey 匹配区间表）
                    var checkKey = key; // key 已经是 findClosestKey(items, val) 的结果
                    if (CHECK_ACTIONS[cmd] && CHECK_ACTIONS[cmd][checkKey]) {
                        checkAction = CHECK_ACTIONS[cmd][checkKey];
                    }
                }
                // 掷出描述中的骰子表达式（有gain时用预掷值替换，避免重复掷骰）
                if (myGain) {
                    // 先替换物品数量骰子
                    if (myGain.action._rolledQty && myGain.action.qty_roll) {
                        desc = desc.replace(new RegExp(myGain.action.qty_roll.replace(/[+]/g, '\\+'), 'g'), myGain.action._rolledQty);
                    }
                    // 再替换金币骰子
                    if (myGain.action._rolledCoin && myGain.action.coin_roll) {
                        desc = desc.replace(new RegExp(myGain.action.coin_roll.replace(/[+]/g, '\\+'), 'g'), myGain.action._rolledCoin);
                    }
                    // 替换剩余未处理的骰子
                    desc = rollDiceInText(desc);
                } else if (!chainCmd) {
                    desc = rollDiceInText(desc);
                }
                if (!chainCmd) finalDesc = desc; // 仅叶子节点同步最终描述

                // 顶层输出：只显示最终链结果，隐藏中间过程
                let output;
                if (depth === 0) {
                    // 生物遭遇加上"遭遇"前缀
                    const displayDesc = (isHostile || (!chainCmd && creatureTables.includes(cmd))) ? `遭遇${finalDesc}` : finalDesc;
                    output = `🎲 ${table.label}\n${displayDesc}`;
                } else {
                    output = ''; // 中间层不产生输出
                }

                // 检测是否为敌对生物遭遇（仅在叶子节点判断）
                if (!chainCmd && creatureTables.includes(cmd)) {
                    const cname = desc.replace(/^\d+只?\s*/, '').split('（')[0].trim();
                    if (CREATURE_CATEGORY[cname] === 'hostile') isHostile = true;
                    if (cname === '都灵寒鸦' || cname === '雪狐') feedable = cname;
                }

                // 特殊效果：寒鸦报信 — 设置庇护状态
                if (cmd === 'sj6' && desc.includes('寒鸦报信')) {
                    if (!probe) {
                        survival.ravenProtection = 2;
                        addSystemLog('🪶 寒鸦报信：接下来2次事件不会遭遇危险', 'success');
                    } else {
                        effects.raven = true;
                    }
                }

                // 聚合收益：链式收益优先
                const allGains = chainGains.length > 0 ? chainGains : (myGain ? [myGain] : []);
                return { output: (depth===0 ? output : ''), gains: allGains, finalDesc: finalDesc, isHostile: isHostile, feedable: feedable, checkAction: checkAction, effects: effects };
            }

            // 安全执行事件：寒鸦庇护下重骰敌对生物（过程不展示）
            function runEventSafe(cmd, args) {
                let result;
                let safeAttempts = 0;
                const maxAttempts = 30;
                do {
                    // probe=true：只计算不落库，避免庇护重掷导致统计/生存检查重复消耗
                    result = executeEvent(cmd, args, 0, true);
                    safeAttempts++;
                } while (result.isHostile && survival.ravenProtection > 0 && safeAttempts < maxAttempts);

                // 探测阶段副作用全部未生效，此处一次性应用最终结果
                applyEventEffects(result);

                if (safeAttempts > 1) {
                    // 寒鸦庇护生效：避开了敌对遭遇
                    survival.ravenProtection--;
                    addSystemLog(`🪶 寒鸦的庇护让你避开了危险（剩余庇护: ${survival.ravenProtection}次）`, 'success');
                } else if (survival.ravenProtection > 0 && !result.isHostile) {
                    // 庇护期间的安全事件
                    survival.ravenProtection--;
                }

                if (survival.ravenProtection <= 0 && safeAttempts === 1 && !result.isHostile) {
                    // 最后一个庇护耗尽
                    if (survival.ravenProtection < 0) survival.ravenProtection = 0;
                }
                updateSurvivalUI();
                return result;
            }

            // 应用探测结果的副作用（统计、生存检查、联动、迷失、庇护、生物图鉴）
            function applyEventEffects(result) {
                if (!result || !result.effects) return;
                const fx = result.effects;

                // 生物图鉴追踪
                if (fx.creature) {
                    const existing = discoveredCreatures.find(function(c) { return c.name === fx.creature.name; });
                    if (existing) { existing.totalCount += fx.creature.count;
                        existing.times++; }
                    else { discoveredCreatures.push({name: fx.creature.name, totalCount: fx.creature.count, times: 1, cat: CREATURE_CATEGORY[fx.creature.name] || 'neutral'}); }
                }

                // 统计记录
                if (fx.statTable) {
                    recordStat(fx.statTable, fx.statEvent || fx.statTable);
                }

                // 生存系统（'深入雪原' 纯文本事件不触发消耗）
                if (fx.isContinue) {
                    survival.exploreDepth++;
                    addSystemLog('⬇ 探索深度 ' + survival.exploreDepth, 'system');
                } else {
                    window.NORTH_SURVIVAL.checkCold();
                    window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation();
                    window.NORTH_SURVIVAL.checkOrient();
                    window.NORTH_SURVIVAL.checkFuel();
                    if (survival.coldResist > 0) {
                        survival.coldResist--;
                        if (survival.coldResist === 0) addSystemLog('🧴 驱寒药膏效果已消散', 'system');
                    }
                    survival.totalEvents++;
                    advanceTime(1);
                }
                updateSurvivalUI();

                // 联动规则（含链式表）
                (fx.linkCalls || []).forEach(function(lc) {
                    processLinks(lc.table, lc.desc);
                    updateSurvivalUI();
                });

                // 迷失状态递减（仅有效结果）
                if (fx.applyLost) {
                    survival.lostEventsRemaining--;
                    if (survival.lostEventsRemaining === 0) {
                        survival.isLost = false;
                        addSystemLog('🧭 迷失状态已解除', 'success');
                        updateSurvivalUI();
                    }
                }

                // 寒鸦报信
                if (fx.raven) {
                    survival.ravenProtection = 2;
                    addSystemLog('🪶 寒鸦报信：接下来2次事件不会遭遇危险', 'success');
                }
            }

            // =========================================================================
            // 七、UI 渲染函数
            // =========================================================================

            function recordStat(table, event) {
                const oldTotal = statsData.total;
                if (!statsData.groups[table]) statsData.groups[table] = {};
                statsData.groups[table][event] = (statsData.groups[table][event] || 0) + 1;
                statsData.total += 1;
                // 冒险者积分：每完成 1 次事件 +1（与等级统计同口径）
                statsData.guildPoints = (statsData.guildPoints || 0) + 1;
                window.NORTH_GUILD.checkRankUp(oldTotal, window.NORTH_CTX.statsData.total);
                window.NORTH_GUILD.updateRankUI();
                renderStats();
                // 若公会面板当前可见，同步刷新积分/等级显示
                const gv = document.getElementById('guildView');
                if (gv && gv.style.display !== 'none') window.NORTH_GUILD.renderGuild();
            }

            function renderStats() {
                const total = statsData.total;
                const statTotalEl = document.getElementById('statTotal');
                if (statTotalEl) statTotalEl.textContent = total + ' 次';
                const groups = statsData.groups;
                const keys = Object.keys(groups);
                // 同时更新旧 statsList（向后兼容）
                const statsListEl = document.getElementById('statsList');
                if (statsListEl) {
                    if (keys.length === 0) {
                        statsListEl.innerHTML = '<div class="camp-empty">尚无冒险记录</div>';
                    } else {
                        let html = '';
                        for (const table of keys) {
                            const events = groups[table];
                            const totalInTable = Object.values(events).reduce((a,b)=>a+b,0);
                            html += `<div class="stats-group">${table} <span class="sub">(${totalInTable})</span></div>`;
                            for (const [ev, cnt] of Object.entries(events)) {
                                html += `<div class="stats-item"><span>${ev}</span><span class="count">${cnt}</span></div>`;
                            }
                        }
                        statsListEl.innerHTML = html;
                    }
                }
                // 如果书翻开着且在笔记标签，刷新内容（安全调用）
                if (bookOpen && activeBookTab === 'notes') { try { renderBookContent(); } catch(e) {} }
            }

            function renderCharDetail(id) {
                const data = charData[id];
                if (!data) {
                    charDetailContainer.innerHTML =
                        '<div style="color:#5a7a9a; font-size:0.8rem; text-align:center; padding:0.8rem 0;">请选择或创建角色</div>';
                    charStatus.textContent = '未选择';
                    document.getElementById('charNameInHeader').textContent = _northUsername ? '· ' + _northUsername : '';
                    activeChar = null;
                    activeCharId = null;
                    return;
                }

                activeChar = data;
                activeCharId = id;
                // 冒险者等级徽章：全局等级（青羽→白羽），charData.rank 字段保留兼容
                window.NORTH_GUILD.updateRankUI();
                /* charName now always shows username */

                const mods = {
                    str: abilityMod(data.str),
                    dex: abilityMod(data.dex),
                    con: abilityMod(data.con),
                    int: abilityMod(data.int),
                    wis: abilityMod(data.wis),
                    cha: abilityMod(data.cha)
                };

                const carry = data.str * 15;

                let html = `
                    <div class="char-hp-row">
                        <span class="label">❤️ HP</span>
                        <span class="value">${data.hp} / ${data.hpMax}</span>
                    </div>
                    <div class="char-temp-hp">
                        <span class="label">🛡️ 临时生命</span>
                        <span class="value">${data.tempHp || 0}</span>
                    </div>
                    <div class="char-detail-grid">
                        <span class="section-title">📋 基本信息</span>
                        <span class="label">等级</span><span class="value highlight">${data.level}</span>
                        <span class="label">职业</span><span class="value">${data.class}</span>
                        <span class="label">种族</span><span class="value">${data.race}</span>
                        <span class="label">熟练加值</span><span class="value highlight">+${data.profBonus}</span>
                        <span class="label">速度</span><span class="value">${data.speed} 尺</span>
                        <span class="label">AC</span><span class="value highlight">${data.ac}</span>
                        <span class="label">被动察觉</span><span class="value highlight">${data.passivePerception}</span>
                        <span class="label">💰 资金</span><span class="value highlight">${fmtCoinHtml(data.coins.gp||0, data.coins.sp||0, data.coins.cp||0)}</span>

                        <span class="section-title">⚔️ 属性</span>
                    </div>
                    <div class="char-abilities">
                        <div class="ability"><span class="abbr">力量</span><span class="score">${data.str}</span><span class="mod">(${mods.str >= 0 ? '+' : ''}${mods.str})</span></div>
                        <div class="ability"><span class="abbr">敏捷</span><span class="score">${data.dex}</span><span class="mod">(${mods.dex >= 0 ? '+' : ''}${mods.dex})</span></div>
                        <div class="ability"><span class="abbr">体质</span><span class="score">${data.con}</span><span class="mod">(${mods.con >= 0 ? '+' : ''}${mods.con})</span></div>
                        <div class="ability"><span class="abbr">智力</span><span class="score">${data.int}</span><span class="mod">(${mods.int >= 0 ? '+' : ''}${mods.int})</span></div>
                        <div class="ability"><span class="abbr">感知</span><span class="score">${data.wis}</span><span class="mod">(${mods.wis >= 0 ? '+' : ''}${mods.wis})</span></div>
                        <div class="ability"><span class="abbr">魅力</span><span class="score">${data.cha}</span><span class="mod">(${mods.cha >= 0 ? '+' : ''}${mods.cha})</span></div>
                    </div>
                `;
                charDetailContainer.innerHTML = html;
                updateSurvivalUI();
            }

            // ━━ 时间系统 ━━
            let _lastDayNight = null;
            function advanceTime(hours) {
                var oldDN = isNightTime();
                survival.gameHour = (survival.gameHour + hours) % 24;
                var newDN = isNightTime();
                if (_lastDayNight !== null && oldDN !== newDN) {
                    if (newDN) {
                        showDayNightAlert('🌙 入夜了', '黑暗与寂静统治了这片大地，千万要小心，愿水星护佑你！', '🌙');
                    } else {
                        showDayNightAlert('☀️ 黎明', '大日重新升起，邪恶之物逐渐退避...', '☀️');
                    }
                }
                _lastDayNight = newDN;
            }
            function showDayNightAlert(title, msg, icon) {
                var old = document.getElementById('daynightAlert');
                if (old) old.remove();
                var overlay = document.createElement('div');
                overlay.id = 'daynightAlert';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(5,8,18,0.6);animation:dnFadeIn .4s ease-out;';
                overlay.innerHTML = '<div style="background:linear-gradient(160deg,#1a2238,#252d42);border:1px solid rgba(212,168,96,0.45);border-radius:16px;padding:2rem 2.5rem;text-align:center;box-shadow:0 12px 60px rgba(0,0,0,0.7);max-width:420px;animation:dnPopIn .5s cubic-bezier(.2,.8,.3,1.1);">' +
                    '<div style="font-size:2.5rem;margin-bottom:0.6rem;">'+icon+'</div>' +
                    '<div style="color:#e8d9b8;font-size:1.2rem;font-weight:700;letter-spacing:2px;margin-bottom:0.5rem;">'+title+'</div>' +
                    '<div style="color:#8fa3ba;font-size:0.85rem;line-height:1.6;">'+msg+'</div>' +
                '</div>';
                document.body.appendChild(overlay);
                setTimeout(function() {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.6s ease-out';
                    setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 600);
                }, 2500);
            }
            // 注入昼夜提示动画
            (function() {
                var st = document.createElement('style');
                st.textContent = '@keyframes dnFadeIn{from{opacity:0}to{opacity:1}}@keyframes dnPopIn{from{opacity:0;transform:scale(0.9)translateY(-10px)}to{opacity:1;transform:scale(1)translateY(0)}}';
                document.head.appendChild(st);
            })();
            function isNightTime() {
                return survival.gameHour >= 21 || survival.gameHour < 5;
            }
            function formatGameTime() {
                var h = survival.gameHour;
                var period = h >= 5 && h < 12 ? '上午' : (h >= 12 && h < 18 ? '下午' : (h >= 18 && h < 21 ? '傍晚' : '夜晚'));
                var displayH = h % 12;
                if (displayH === 0) displayH = 12;
                var timeStr = period + ' ' + displayH + ':00';
                var dayNight = isNightTime() ? '夜晚' : '白天';
                return { timeStr: timeStr, dayNight: dayNight, icon: isNightTime() ? '🌙' : '☀️' };
            }

            // 从背包同步 survival.fuel（确保生存物资与背包数据一致）
            function reconcileSurvivalFuel() {
                if (!activeChar || !activeChar.inventory) return;
                // 清零所有燃料
                for (var fk in survival.fuel) survival.fuel[fk] = 0;
                // 从背包累加
                for (var fi = 0; fi < activeChar.inventory.length; fi++) {
                    var it = activeChar.inventory[fi];
                    if (it.qty <= 0) continue;
                    var fk = FUEL_NAME_TO_KEY[it.name];
                    if (fk) survival.fuel[fk] += it.qty;
                }
            }

            // 从背包中扣减燃料物品（与 survival.fuel 同步）
            function consumeFuelFromInventory(fk, qty) {
                if (!activeChar || !activeChar.inventory || qty <= 0) return;
                var itemName = FUEL_KEY_TO_NAME[fk];
                if (!itemName) return;
                for (var si = 0; si < activeChar.inventory.length && qty > 0; si++) {
                    if (activeChar.inventory[si].name === itemName && activeChar.inventory[si].qty > 0) {
                        var use = Math.min(activeChar.inventory[si].qty, qty);
                        activeChar.inventory[si].qty -= use;
                        qty -= use;
                        if (activeChar.inventory[si].qty <= 0) activeChar.inventory.splice(si, 1);
                    }
                }
            }

            function updateSurvivalUI() {
                reconcileSurvivalFuel();
                // 严寒
                const coldDots = document.querySelectorAll('#coldMeter .cold-dot');
                coldDots.forEach((dot, i) => {
                    dot.classList.toggle('active', i < survival.coldLevel);
                    dot.classList.toggle('danger', survival.coldLevel >= 3);
                    dot.classList.toggle('warning', survival.coldLevel === 2);
                });
                document.getElementById('coldDisplay').textContent = `${survival.coldLevel}/3`;
                document.getElementById('coldEffect').textContent = window.NORTH_SURVIVAL.getColdEffect();

                // 口粮
                document.getElementById('rationDisplay').textContent = `${survival.rations} 份`;
                const rationNext = 4 - survival.eventsSinceRation;
                var bpFood = 0;
                if (activeChar && activeChar.inventory) {
                    var foodNames = ['浆果/野菜','兽肉'];
                    activeChar.inventory.forEach(function(it) { if (foodNames.includes(it.name)) bpFood += it.qty; });
                }
                document.getElementById('bpFoodDisplay').textContent = `食物 ${bpFood} 份`;
                document.getElementById('rationCountdown').textContent =
                    survival.isStarving ? '⚠️ 断粮中！' : `下次消耗: ${rationNext}次事件后`;

                // 燃料
                const fuelTotal = Object.values(survival.fuel).reduce((a, b) => a + b, 0);
                const fuelNames = [];
                if (survival.fuel.firewood > 0) fuelNames.push(`柴火/石块×${survival.fuel.firewood}`);
                if (survival.fuel.pine_branch > 0) fuelNames.push(`松枝×${survival.fuel.pine_branch}`);
                if (survival.fuel.resin > 0) fuelNames.push(`松脂×${survival.fuel.resin}`);
                if (survival.fuel.iron_resin > 0) fuelNames.push(`铁松脂×${survival.fuel.iron_resin}`);
                if (survival.fuel.glow_moss > 0) fuelNames.push(`荧光苔×${survival.fuel.glow_moss}`);
                var ironVal = (survival.fuel.iron_resin || 0) * 2;
                var fuelCount = (survival.fuel.pine_branch||0) + (survival.fuel.resin||0) + (survival.fuel.glow_moss||0) + ironVal + (survival.fuel.firewood||0);
                document.getElementById('fuelDisplay').textContent = (fuelTotal > 0 ? fuelNames.join(' ') : '无') + ' ｜共 ' + fuelCount + ' 份';
                document.getElementById('fuelStatus').textContent =
                    survival.lightActive ? `🔥 燃烧中 (剩余${survival.lightRemaining}次事件)` : '未点燃';

                // 方向感
                const orientEl = document.getElementById('orientDisplay');
                if (survival.isLost) {
                    orientEl.textContent = `⚠️ 迷失 (剩余${survival.lostEventsRemaining}次)`;
                    orientEl.className = 'value warning';
                } else {
                    orientEl.textContent = '✅ 正常';
                    orientEl.className = 'value success';
                }
                const orientNext = 5 - survival.eventsSinceOrient;
                document.getElementById('orientDetail').textContent =
                    survival.isLost ? `DC惩罚 +${survival.lostDcPenalty}` : `下次检定: ${orientNext}次事件后`;

                // 负重计算
                const maxCarry = activeChar ? activeChar.str * 15 : 150;
                let totalWeight = 0;
                if (activeChar && activeChar.inventory) {
                    activeChar.inventory.forEach(function(it) {
                        totalWeight += (it.weight || 1) * (it.qty || 0);
                    });
                }
                // 装备重量：武器+护甲
                if (activeChar && activeChar.weapons) {
                    activeChar.weapons.forEach(function(w) { totalWeight += (w.weight || 2); });
                }
                if (activeChar && activeChar.armor && activeChar.armor.name) {
                    totalWeight += (activeChar.armor.weight || 10);
                }
                const weightPct = maxCarry > 0 ? Math.round(totalWeight / maxCarry * 100) : 0;
                const weightColor = weightPct > 100 ? '#e0556a' : (weightPct > 75 ? '#f0c060' : '#7aacd8');
                document.getElementById('weightDisplay').innerHTML = `<span style="color:${weightColor}">${totalWeight}</span><span style="color:#5a7a9a;"> / ${maxCarry} 磅</span>`;
                document.getElementById('weightDetail').textContent = weightPct > 100 ? '⚠️ 超重！移速-10尺' : `负载 ${weightPct}%`;

                // 总览徽章（多状态排列）
                const badges = window.NORTH_SURVIVAL.getSurvivalBadges();
                // 状态池徽章（✨ 前缀绿色展示，含剩余次数）
                statusPool.forEach(function(s) {
                    badges.push({ text: '✨' + s.name + ((s.uses || 1) > 1 ? '×' + s.uses : ''), cls: 'status-pool' });
                });
                survivalBadge.className = 'badge badge-multi';
                survivalBadge.innerHTML = badges.map(function(b) {
                    return `<span class="badge-flag ${b.cls}">${b.text}</span>`;
                }).join('');

                // 生火按钮状态
                const hasFuel = fuelTotal > 0;
                document.getElementById('lightBtn').disabled = !hasFuel;
                document.getElementById('orientBtn').disabled = !survival.isLost;
                // 返回按钮：深度>0时可用
                var backCard = document.querySelector('.event-card[data-cmd="back"]');
                if (backCard) {
                    backCard.style.opacity = survival.exploreDepth <= 0 ? '0.4' : '';
                    backCard.style.pointerEvents = survival.exploreDepth <= 0 ? 'none' : '';
                }
                // 进食按钮：有口粮或背包有食物时可用
                var hasFood = survival.rations > 0;
                if (!hasFood && activeChar && activeChar.inventory) {
                    for (var si = 0; si < activeChar.inventory.length; si++) {
                        var invName = activeChar.inventory[si].name;
                        if ((invName === '浆果/野菜' || invName === '兽肉') && activeChar.inventory[si].qty > 0) {
                            hasFood = true; break;
                        }
                    }
                }
                document.getElementById('consumeRationBtn').disabled = !hasFood;
                // 涂药膏按钮：背包有驱寒药膏时可用
                var hasOintment = false;
                if (activeChar && activeChar.inventory) {
                    for (var si2 = 0; si2 < activeChar.inventory.length; si2++) {
                        if (activeChar.inventory[si2].name === '驱寒药膏' && activeChar.inventory[si2].qty > 0) {
                            hasOintment = true; break;
                        }
                    }
                }
                var ointBtn = document.getElementById('useOintmentBtn');
                if (ointBtn) {
                    ointBtn.disabled = !hasOintment;
                    ointBtn.textContent = survival.coldResist > 0 ? '🧴 药膏中(' + survival.coldResist + ')' : '🧴 涂药膏';
                }
                // 治疗药水按钮：背包有治疗药水时可用
                var hasPotion = false;
                if (activeChar && activeChar.inventory) {
                    for (var si3 = 0; si3 < activeChar.inventory.length; si3++) {
                        if (activeChar.inventory[si3].name === '治疗药水' && activeChar.inventory[si3].qty > 0) {
                            hasPotion = true; break;
                        }
                    }
                }
                var potionBtn = document.getElementById('usePotionBtn');
                // 满血不禁用：点击后弹确认弹窗（"您现在状态完好无损，确定要使用吗"）
                if (potionBtn) potionBtn.disabled = !hasPotion;

                // 时间显示
                var ti = formatGameTime();
                document.getElementById('timeDisplay').textContent = ti.timeStr;
                document.getElementById('timeDetail').textContent = ti.dayNight;
                document.getElementById('timeIcon').textContent = ti.icon;
                // 探索深度
                document.getElementById('depthDisplay').textContent = survival.exploreDepth;
            }

            // 独立小界面弹窗提示（2秒自动关闭，可手动关闭）
            let _popupTimer = null;
            function showPopup(msg, type) {
                var old = document.getElementById('depthPopup');
                if (old) old.remove();
                if (_popupTimer) clearTimeout(_popupTimer);
                var popup = document.createElement('div');
                popup.id = 'depthPopup';
                popup.className = 'depth-popup depth-popup-' + (type || 'info');
                popup.innerHTML = '<span class="depth-popup-text">' + msg + '</span>' +
                    '<button class="depth-popup-close" onclick="document.getElementById(\'depthPopup\').remove()">✕</button>';
                document.body.appendChild(popup);
                // 动画入场
                requestAnimationFrame(function() { popup.classList.add('show'); });
                _popupTimer = setTimeout(function() {
                    if (popup.parentNode) popup.remove();
                }, 2000);
                updateSurvivalUI();
            }

            // 确认弹窗（独立小界面，带确定/取消按钮，不写入事件回响）
            function showConfirmPopup(msg, onConfirm) {
                var old = document.getElementById('confirmPopup');
                if (old) old.remove();
                var popup = document.createElement('div');
                popup.id = 'confirmPopup';
                popup.className = 'depth-popup depth-popup-warn confirm-popup';
                popup.innerHTML = '<span class="depth-popup-text">' + msg + '</span>' +
                    '<div class="confirm-popup-btns">' +
                    '<button class="confirm-popup-ok">✅ 确定使用</button>' +
                    '<button class="confirm-popup-cancel">✕ 取消</button>' +
                    '</div>';
                document.body.appendChild(popup);
                // 动画入场
                requestAnimationFrame(function() { popup.classList.add('show'); });
                popup.querySelector('.confirm-popup-ok').addEventListener('click', function() {
                    if (popup.parentNode) popup.remove();
                    if (typeof onConfirm === 'function') onConfirm();
                });
                popup.querySelector('.confirm-popup-cancel').addEventListener('click', function() {
                    if (popup.parentNode) popup.remove();
                });
            }

            // =========================================================================
            // 八、日志与显示
            // =========================================================================

            function addSystemLog(msg, type) {
                const entry = {
                    time: new Date().toLocaleTimeString(),
                    label: '系统',
                    output: msg,
                    // 紧凑单行 html（output-area 为 white-space:pre-wrap，
                    // 模板字符串的换行/缩进会被原样显示，必须单行拼接）
                    html: '<div class="log-entry"><span class="log-time">' + new Date().toLocaleTimeString() + '</span><span class="log-label">系统</span><div class="log-content ' + (type || 'system') + '-msg">' + msg + '</div></div>'
                };
                fullLog.push({ time: entry.time, label: '系统', output: msg });
                displayLog.push(entry);
                if (displayLog.length > MAX_DISPLAY) displayLog.shift();
                renderDisplayLog();
            }

            function displayResult(result, label) {
                // 如果事件执行过程中触发了昏迷，不显示此次事件结果
                if (_knockedDownDuringEvent) { _knockedDownDuringEvent = false; return; }
                if (result.error) {
                    outputEl.innerHTML = `<div style="color:#e0556a;">❌ ${result.error}</div>`;
                    return;
                }
                if (!result.output) return;

                const timeStr = new Date().toLocaleTimeString();
                const lines = result.output.split('\n');
                const gains = result.gains || [];

                let contentHtml = '';
                for (const line of lines) {
                    if (line.startsWith('🎲')) {
                        contentHtml += `<div class="l0">${line}</div>`;
                    } else if (line.startsWith('↳')) {
                        const indentMatch = line.match(/^(\s*)/);
                        const indentLen = indentMatch ? indentMatch[1].length : 0;
                        let level = Math.min(Math.floor(indentLen / 3) + 1, 5);
                        contentHtml += `<div class="l${level}">${line.trim()}</div>`;
                    } else if (line.trim().length > 0 && !line.startsWith('   ')) {
                        contentHtml += `<div class="desc-line">${line}</div>`;
                    } else if (line.trim().length > 0) {
                        contentHtml += `<div>${line}</div>`;
                    }
                }

                // 敌对生物遭遇：显示战斗/逃离选项
                let combatHtml = '';
                if (result.isHostile) {
                    const combatId = 'combat_' + Date.now();
                    combatHtml = `<div id="${combatId}" style="margin-top:0.5rem;padding:0.5rem 0.7rem;background:rgba(200,60,80,0.08);border:1px solid rgba(200,60,80,0.25);border-radius:6px;font-size:0.75rem;">
                        <div style="color:#e0556a;margin-bottom:0.3rem;">⚔️ 遭遇敌对生物！</div>
                        <button style="padding:3px 14px;background:rgba(200,60,80,0.15);color:#e0556a;border:1px solid rgba(200,60,80,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;margin-right:8px;font-family:inherit;" onclick="campCombat('${combatId}')">⚔️ 战斗</button>
                        <button style="padding:3px 14px;background:rgba(60,140,220,0.15);color:#88ccff;border:1px solid rgba(74,128,184,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="campFlee('${combatId}')">🏃 逃离（隐匿DC15）</button>
                    </div>`;
                }

                // 检定交互：显示掷骰按钮
                let checkHtml = '';
                let checkId = null; // 提升到函数级作用域，供日志条目关联使用
                if (result.checkAction) {
                    try {
                    const ca = result.checkAction;
                    checkId = 'check_' + Date.now();
                    const hasSteps = ca.steps && ca.steps.length > 0;
                    checkHtml = `<div id="${checkId}" style="margin-top:0.5rem;padding:0.5rem 0.7rem;background:rgba(200,150,100,0.08);border:1px solid rgba(200,150,100,0.25);border-radius:6px;font-size:0.75rem;">
                        <div style="color:#d4a860;margin-bottom:0.3rem;">🎯 ${ca.title}：${ca.desc}</div>
                        <div class="check-steps" id="${checkId}_steps" style="color:#b0c8d8;margin-bottom:0.4rem;">`;
                    if (hasSteps) {
                        ca.steps.forEach(function(step, si) {
                            if (step.dc) {
                                const d20 = step.passive ? '被动' : (step.save ? '豁免' : '检定');
                                checkHtml += `<div class="check-step-line" style="margin:2px 0;">${si+1}. ${step.label} DC${step.dc} (${d20}) <span id="${checkId}_s${si}" style="color:#5a7a9a;">—</span></div>`;
                            } else {
                                checkHtml += `<div class="check-step-line" style="margin:2px 0;">${si+1}. ${step.label || step.desc} <span id="${checkId}_s${si}" style="color:#5a7a9a;">—</span></div>`;
                            }
                        });
                        checkHtml += `</div><button class="check-roll-btn" style="padding:3px 16px;background:rgba(200,150,100,0.15);color:#d4a860;border:1px solid rgba(200,150,100,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" data-checkid="${checkId}" data-step="0">🎲 开始掷骰</button>`;
                    } else {
                        checkHtml += `<div style="color:#aaccee;">${ca.desc}</div></div>`;
                        checkHtml += `<button class="check-effect-btn" style="padding:3px 16px;background:rgba(200,150,100,0.15);color:#d4a860;border:1px solid rgba(200,150,100,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" data-checkid="${checkId}">确认</button>`;
                    }
                    checkHtml += `</div>`;
                    } catch(e) {
                        console.error('checkHtml生成失败:', e);
                        checkHtml = `<div style="color:#e0556a;font-size:0.75rem;">⚠️ 检定界面错误: ${e.message}</div>`;
                    }
                }

                // 可喂食生物遭遇：显示喂食选项
                let feedHtml = '';
                if (result.feedable) {
                    const feedId = 'feed_' + Date.now();
                    const feedName = result.feedable;
                    // 检查可用的食物
                    let hasRation = survival.rations > 0;
                    let bpFoodNames = [];
                    if (activeChar && activeChar.inventory) {
                        ['浆果/野菜','兽肉'].forEach(function(fn) {
                            for (var si = 0; si < activeChar.inventory.length; si++) {
                                if (activeChar.inventory[si].name === fn && activeChar.inventory[si].qty > 0) {
                                    bpFoodNames.push(fn); break;
                                }
                            }
                        });
                    }
                    const hasFood = bpFoodNames.length > 0;
                    if (hasRation || hasFood) {
                        feedHtml = `<div id="${feedId}" style="margin-top:0.5rem;padding:0.5rem 0.7rem;background:rgba(100,180,120,0.08);border:1px solid rgba(100,180,120,0.25);border-radius:6px;font-size:0.75rem;">
                            <div style="color:#8ccfa0;margin-bottom:0.3rem;">🕊️ ${feedName}对你表示友善，是否喂食？</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
                        if (hasRation) {
                            feedHtml += `<button style="padding:3px 12px;background:rgba(100,180,120,0.15);color:#8ccfa0;border:1px solid rgba(100,180,120,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="campFeed('${feedId}','${feedName}','ration')">🍖 喂1份口粮</button>`;
                        }
                        bpFoodNames.forEach(function(fn) {
                            feedHtml += `<button style="padding:3px 12px;background:rgba(100,180,120,0.15);color:#8ccfa0;border:1px solid rgba(100,180,120,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="campFeed('${feedId}','${feedName}','${fn}')">🍇 喂1份${fn}</button>`;
                        });
                        feedHtml += `<button style="padding:3px 12px;background:rgba(150,150,150,0.1);color:#999;border:1px solid rgba(150,150,150,0.2);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="campFeed('${feedId}','${feedName}','ignore')">不喂食</button>
                            </div>
                        </div>`;
                    } else {
                        feedHtml = `<div id="${feedId}" style="margin-top:0.5rem;padding:0.5rem 0.7rem;background:rgba(150,150,150,0.05);border:1px solid rgba(150,150,150,0.15);border-radius:6px;font-size:0.75rem;">
                            <div style="color:#999;">🕊️ ${feedName}对你表示友善，但你没有任何食物可喂</div>
                            <button style="padding:3px 12px;margin-top:4px;background:rgba(150,150,150,0.1);color:#999;border:1px solid rgba(150,150,150,0.2);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="campFeed('${feedId}','${feedName}','ignore')">离开</button>
                        </div>`;
                    }
                }

                // 如果有物品/钱币收益且满足条件，生成收益提示
                let gainInfoHtml = '';
                if (gains.length > 0) {
                    let gainDescs = [];
                    gains.forEach(function(g) {
                        const a = g.action;
                        if (!a) return;
                        if (a.coin) {
                            const cn = {gp:'金币',sp:'银币',cp:'铜币'};
                            const cc = {gp:'#ffd700',sp:'#c0c0c0',cp:'#cd7f32'};
                            const qty = a._rolledCoin || (a.coin_roll ? rollDiceExpr(a.coin_roll) : 1);
                            gainDescs.push({type:'coin', coin:a.coin, qty:qty, cname:cn[a.coin]||a.coin, text:'💰 <span style="color:' + (cc[a.coin]||'#ffd700') + ';">+' + qty + ' ' + (cn[a.coin]||a.coin) + '</span>'});
                        } else if (a.item) {
                            const qty = a._rolledQty || (a.qty_roll ? rollDiceExpr(a.qty_roll) : (a.qty||1));
                            const unit = a.unit||'份';
                            var wpNum = findWpNum(a.item);
                            gainDescs.push({type:'item', item:a.item, qty:qty, unit:unit, wpNum:wpNum, text:`📦 +${qty}${unit} ${a.item}`});
                            // 额外奖励
                            if (a.bonus) {
                                const broll = rollDiceExpr(a.bonus.dice);
                                if (broll === a.bonus.target) {
                                    gainDescs.push({type:'item', item:a.bonus.item, qty:a.bonus.qty||1, unit:a.bonus.unit||'份', wpNum:findWpNum(a.bonus.item), text:`   🎲 额外: +${a.bonus.qty||1}${a.bonus.unit||'份'} ${a.bonus.item}`});
                                }
                            }
                        }
                    });
                    if (gainDescs.length > 0) {
                        const gainId = 'gain_' + Date.now();
                        gainInfoHtml = `<div class="gain-confirm" id="${gainId}" style="margin-top:0.5rem;padding:0.5rem 0.7rem;background:rgba(60,140,220,0.08);border:1px solid rgba(74,128,184,0.2);border-radius:6px;font-size:0.75rem;">
                            <div style="color:#88ccff;margin-bottom:0.3rem;">🎒 获得材料？</div>
                            <div style="color:#b0d4f0;margin-bottom:0.4rem;">${gainDescs.map(function(g){return g.text;}).join('<br>')}</div>
                            <button style="padding:3px 14px;background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid rgba(76,175,80,0.3);border-radius:3px;cursor:pointer;font-size:0.72rem;margin-right:8px;font-family:inherit;" onclick="confirmGains('${gainId}',true)">✅ 获得</button>
                            <button style="padding:3px 14px;background:rgba(244,67,54,0.1);color:#f44336;border:1px solid rgba(244,67,54,0.2);border-radius:3px;cursor:pointer;font-size:0.72rem;font-family:inherit;" onclick="confirmGains('${gainId}',false)">❌ 未获得</button>
                        </div>`;
                        // 存储待确认收益
                        const gainKey = gainId;
                        pendingGains.push({key:gainKey, gains:gainDescs});
                    }
                }

                const entry = {
                    time: timeStr,
                    label: label,
                    output: result.output,
                    gains: gains,
                    // 紧凑单行 html（output-area 为 white-space:pre-wrap，换行会被显示）
                    html: '<div class="log-entry"><span class="log-time">' + timeStr + '</span><span class="log-label">' + label + '</span><div class="log-content">' + contentHtml + combatHtml + checkHtml + feedHtml + gainInfoHtml + '</div></div>'
                };

                // 保存收益快照（action 为共享对象，_rolledQty 会被后续事件覆盖，导出日志时必须用当时值）
                var logEntry = {
                    time: timeStr,
                    label: label,
                    output: result.output,
                    gains: (gains || []).map(function(g) {
                        if (!g || !g.action) return g;
                        return { cmd: g.cmd, val: g.val, action: Object.assign({}, g.action) };
                    })
                };
                if (result.checkAction) {
                    logEntry._checkAction = result.checkAction;
                    logEntry._checkId = checkId;
                }
                fullLog.push(logEntry);

                displayLog.push(entry);
                if (displayLog.length > MAX_DISPLAY) {
                    displayLog.shift();
                }

                renderDisplayLog();
                rollCount += 1;
                rollCounter.textContent = `掷表 ${rollCount} 次`;
                return gains.length > 0 && gainInfoHtml !== '';
            }

            // 战斗/逃离处理
            // 检定交互：逐步骤处理
            window.handleStepCheck = async function(checkId, stepIdx) {
                try {
                var el = document.getElementById(checkId);
                if (!el) { console.error('handleStepCheck: el not found', checkId); return; }
                if (el.dataset.done) return;
                var ca = null;
                for (var fi = fullLog.length - 1; fi >= 0; fi--) {
                    var le = fullLog[fi];
                    if (le._checkAction) {
                        if (le._checkId === checkId) { ca = le._checkAction; break; }
                        if (!ca) ca = le._checkAction;
                    }
                }
                if (!ca) { el.innerHTML = '<span style="color:#e0556a;">⚠️ 检定数据丢失</span>'; unlockEvents(); return; }

                var step = ca.steps[stepIdx];
                if (!step) { finishChecks(el, ca); return; }

                // 无DC的纯效果步骤：直接执行
                if (!step.dc) {
                    var stepEl2 = document.getElementById(checkId + '_s' + stepIdx);
                    if (stepEl2) stepEl2.innerHTML = '<span style="color:#d4a860;">✨ ' + (step.label || '') + '</span>';
                    if (step.effect) step.effect(el);
                    if (step.passMsg) {
                        var rl2 = document.createElement('div');
                        rl2.style.cssText = 'color:#6abf8a;font-size:0.7rem;margin-top:2px;';
                        rl2.textContent = '→ ' + step.passMsg;
                        if (stepEl2) stepEl2.parentNode.appendChild(rl2);
                    }
                    if (step.passDone) { finishChecks(el, ca); return; }
                    setTimeout(function() { handleStepCheck(checkId, stepIdx + 1); }, 400);
                    return;
                }

                // 掷d20（优先使用3D骰子）
                var btnEl = document.getElementById(checkId + '_btn');
                if (btnEl) { btnEl.disabled = true;
                    btnEl.textContent = '🎲 请在3D界面掷骰'; }
                var useDice3D = window._diceReady;
                // 状态池优势检测：技能检定匹配 adv:skill:<技能>，属性检定匹配 adv:<属性>
                var poolAdvKey = null;
                if (!step.passive) {
                    if (step.skill) poolAdvKey = 'adv:skill:' + step.skill;
                    else if (step.ability) poolAdvKey = 'adv:' + step.ability;
                    if (poolAdvKey && !findStatus(poolAdvKey)) poolAdvKey = null;
                }
                var poolAdvText = '';
                var d20;
                if (step.passive) {
                    d20 = 10;
                } else if (poolAdvKey) {
                    // 状态池优势：掷两次取高（3D 掷两次，任一次取消则回退单次）
                    if (useDice3D) {
                        var r1 = null, r2 = null;
                        try { r1 = await window.roll3DDice('1d20'); } catch(e) {}
                        if (r1 && r1.total >= 1) {
                            try { r2 = await window.roll3DDice('1d20'); } catch(e) {}
                            d20 = (r2 && r2.total >= 1) ? Math.max(r1.total, r2.total) : r1.total;
                            poolAdvText = ' [状态优势' + (r2 && r2.total >= 1 ? r1.total + '/' + r2.total : r1.total) + ']';
                        } else { d20 = 0; }
                    } else {
                        var d1 = rand(20), d2 = rand(20);
                        d20 = Math.max(d1, d2);
                        poolAdvText = ' [状态优势' + d1 + '/' + d2 + ']';
                    }
                    if (d20 <= 0) { if (btnEl) { btnEl.disabled = false;
                        btnEl.textContent = '🎲 继续掷骰'; } unlockEvents(); return; }
                } else if (useDice3D) {
                    try {
                        var roll3DResult = await window.roll3DDice('1d20');
                        if (roll3DResult && roll3DResult.total >= 1) {
                            d20 = roll3DResult.total;
                        } else {
                            d20 = 0;
                        }
                    } catch(e) { d20 = 0; }
                    if (d20 <= 0) { if (btnEl) { btnEl.disabled = false;
                        btnEl.textContent = '🎲 继续掷骰'; } unlockEvents(); return; }
                } else {
                    d20 = rand(20);
                }
                if (btnEl) { btnEl.disabled = false;
                    btnEl.textContent = '🎲 继续掷骰'; }
                var bonus = 0;
                var profBonus = 0;
                var profText = '';
                if (activeChar) {
                    bonus = abilityMod(activeChar[step.ability] || 10);
                    if (step.skill) {
                        var skills = activeChar.skillProfs || {};
                        if (skills[step.skill]) profBonus = activeChar.profBonus || 0;
                    }
                    if (step.save) {
                        var saves = activeChar.saveProfs || {};
                        var saveNames = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
                        if (saves[saveNames[step.ability]]) profBonus = activeChar.profBonus || 0;
                    }
                    bonus += profBonus;
                    if (profBonus > 0) profText = '(熟练+' + profBonus + ')';
                }
                var total = d20 + bonus;
                var passed = total >= step.dc;
                // 状态池状态检定后自动消耗（无论成败）
                if (poolAdvKey) consumeStatus(poolAdvKey);

                // 更新步骤显示
                var stepEl = document.getElementById(checkId + '_s' + stepIdx);
                if (stepEl) {
                    stepEl.innerHTML = passed ?
                        '<span style="color:#6abf8a;">✅ d20=' + d20 + '+' + bonus + profText + '=' + total + poolAdvText + ' ≥ DC' + step.dc + '</span>' :
                        '<span style="color:#e0556a;">❌ d20=' + d20 + '+' + bonus + profText + '=' + total + poolAdvText + ' < DC' + step.dc + '</span>';
                }

                // 处理结果
                if (passed) {
                    if (step.passMsg) {
                        var resultLine = document.createElement('div');
                        resultLine.style.cssText = 'color:#6abf8a;font-size:0.7rem;margin-top:2px;';
                        resultLine.textContent = '→ ' + step.passMsg;
                        stepEl.parentNode.appendChild(resultLine);
                    }
                    if (step.passEffect) step.passEffect(el);
                    if (step.passDone) { finishChecks(el, ca); return; }
                    // 继续下一步
                    setTimeout(function() { handleStepCheck(checkId, stepIdx + 1); }, 400);
                } else {
                    if (step.failMsg) {
                        var msg = step.failMsg;
                        if (step.damage) {
                            var dmg = rollDiceExpr(step.damage);
                            msg = msg.replace('{damage}', dmg);
                            if (activeChar) {
                                activeChar.hp = Math.max(0, activeChar.hp - dmg);
                                renderCharDetail(activeCharId);
                                if (activeChar.hp <= 0) checkHpZero();
                            }
                        }
                        var resultLine = document.createElement('div');
                        resultLine.style.cssText = 'color:#e0556a;font-size:0.7rem;margin-top:2px;';
                        resultLine.textContent = '→ ' + msg;
                        stepEl.parentNode.appendChild(resultLine);
                    }
                    if (step.failEffect) step.failEffect(el);
                    // 失败后额外步骤（如雪坑→运动DC12爬出）
                    if (step.failExtra) {
                        var extraStep = step.failExtra;
                        // 动态追加到 steps 数组末尾
                        ca.steps.push(extraStep);
                        // 渲染新步骤行
                        var stepsDiv = el.querySelector('.check-steps');
                        if (stepsDiv) {
                            var si = ca.steps.length - 1;
                            var d20Label = extraStep.passive ? '被动' : (extraStep.save ? '豁免' : '检定');
                            var newLine = document.createElement('div');
                            newLine.className = 'check-step-line';
                            newLine.style.cssText = 'margin:2px 0;';
                            newLine.innerHTML = (si+1) + '. ' + extraStep.label + ' DC' + extraStep.dc + ' (' + d20Label + ') <span id="' + checkId + '_s' + si + '" style="color:#5a7a9a;">—</span>';
                            stepsDiv.appendChild(newLine);
                        }
                        // 更新按钮步骤索引
                        var rollBtn = el.querySelector('.check-roll-btn');
                        if (rollBtn) { rollBtn.dataset.step = String(ca.steps.length - 1); }
                        updateSurvivalUI();
                        return;
                    }
                    if (step.failDone) { finishChecks(el, ca); return; }
                    // 继续下一步
                    setTimeout(function() { handleStepCheck(checkId, stepIdx + 1); }, 400);
                }
                updateSurvivalUI();
                } catch(e) {
                    var el2 = document.getElementById(checkId);
                    if (el2) el2.innerHTML = '<span style="color:#e0556a;">⚠️ 检定异常: ' + e.message + '</span>';
                    console.error('handleStepCheck error:', e);
                    unlockEvents();
                }
            };

            // 纯效果条目（无掷骰步骤）：点击确认后直接执行
            window.handleCheckEffect = function(checkId) {
                var el = document.getElementById(checkId);
                if (!el || el.dataset.done) return;
                var ca = null;
                for (var fi = fullLog.length - 1; fi >= 0; fi--) {
                    var le = fullLog[fi];
                    if (le._checkAction) {
                        if (le._checkId === checkId) { ca = le._checkAction; break; }
                        if (!ca) ca = le._checkAction;
                    }
                }
                if (!ca) { el.innerHTML = '<span style="color:#e0556a;">⚠️ 数据丢失</span>'; unlockEvents(); return; }
                finishChecks(el, ca);
            };

            function finishChecks(el, ca) {
                el.dataset.done = '1';
                var btn = el.querySelector('button');
                if (btn) { btn.disabled = true;
                    btn.style.opacity = '0.4';
                    btn.textContent = '✅ 检定完成'; }
                if (ca.effect) ca.effect(el);
                if (activeChar) {
                    if (activeCharId) charData[activeCharId] = activeChar;
                    renderCharDetail(activeCharId);
                }
                updateSurvivalUI();
                unlockEvents();
                // 同步日志存储并立即刷新显示
                // 注意：runCheckChain 中的 executeEvent 可能触发 addSystemLog→renderDisplayLog，
                // 导致 el 脱离 DOM（stale 引用）。此处用 el.outerHTML 修补 displayLog 后立即重渲染，
                // 确保检定结果（如采集资源获得的材料）立即可见，无需等到下一次事件。
                if (el && el.id) {
                    try { _patchDisplayLogDiv(el.id, el.outerHTML); } catch(e) { console.warn('同步检定状态失败:', e.message); }
                }
                renderDisplayLog();
            }

            // 检定成功后链式执行子表并显示结果
            function runCheckChain(el, tableKey, forceVal) {
                // depth=1 跳过统计/生存检查/processLinks，避免系统消息重复
                var subResult = executeEvent(tableKey, forceVal || '', 1);
                // 手动构造显示文本（depth=1 不产生输出）
                if (subResult && subResult.finalDesc) {
                    addCheckResult(el, '');
                    var table = TABLES[tableKey];
                    addCheckResult(el, '🎲 ' + (table ? table.label : tableKey), '#88ccbb');
                    addCheckResult(el, subResult.finalDesc, '#88ccbb');
                }
                if (subResult) {
                    // 处理子表的gains（对齐 confirmGains 逻辑）
                    if (subResult.gains && subResult.gains.length > 0 && activeChar) {
                        activeChar.inventory = activeChar.inventory || [];
                        var fuelMap = { '松枝':'pine_branch', '松脂':'resin', '铁松松脂':'iron_resin', '荧光苔':'glow_moss', '柴火/石块':'firewood' };
                        subResult.gains.forEach(function(g) {
                            if (!g || !g.action) return;
                            var a = g.action;
                            if (a.coin) {
                                activeChar.coins = activeChar.coins || {cp:0,sp:0,gp:0};
                                var cq = a._rolledCoin || 1;
                                activeChar.coins[a.coin] = (activeChar.coins[a.coin]||0) + cq;
                            } else if (a.item) {
                                var qty = a._rolledQty || a.qty || 1;
                                // 口粮 → 生存系统
                                if (a.item === '口粮') {
                                    survival.rations += qty;
                                    if (survival.rations > 0) { survival.isStarving = false;
                                        survival.starvationCount = 0; }
                                } else {
                                    // 燃料 → 同步到 survival.fuel
                                    if (fuelMap[a.item]) {
                                        survival.fuel[fuelMap[a.item]] = (survival.fuel[fuelMap[a.item]]||0) + qty;
                                    }
                                    // 添加到背包
                                    var stacked = false;
                                    for (var si = 0; si < activeChar.inventory.length; si++) {
                                        if (activeChar.inventory[si].name === a.item) { activeChar.inventory[si].qty += qty;
                                            stacked = true; break; }
                                    }
                                    if (!stacked) activeChar.inventory.push({name:a.item, qty:qty, location:'背包', weight:1});
                                }
                                // 记录到雪原馈赠
                                if (a.item !== '口粮') {
                                    var wpNum = findWpNum(a.item);
                                    var existing = discoveredItems.find(function(d) { return d.name === a.item; });
                                    if (existing) { existing.totalQty += qty;
                                        existing.times++; }
                                    else { discoveredItems.push({name:a.item, totalQty:qty, wpNum:wpNum, times:1}); }
                                }
                                // 额外奖励（如寒铁矿出寒铁髓）
                                if (a.bonus) {
                                    var broll = rollDiceExpr(a.bonus.dice);
                                    if (broll === a.bonus.target) {
                                        var bname = a.bonus.item, bqty = a.bonus.qty || 1;
                                        if (fuelMap[bname]) survival.fuel[fuelMap[bname]] = (survival.fuel[fuelMap[bname]]||0) + bqty;
                                        addCheckResult(el, '   🎲 额外获得: ' + bname + '×' + bqty, '#ffcc80');
                                        var bstacked = false;
                                        for (var bi = 0; bi < activeChar.inventory.length; bi++) {
                                            if (activeChar.inventory[bi].name === bname) { activeChar.inventory[bi].qty += bqty;
                                                bstacked = true; break; }
                                        }
                                        if (!bstacked) activeChar.inventory.push({name:bname, qty:bqty, location:'背包', weight:1});
                                    }
                                }
                            }
                        });
                        if (activeCharId) charData[activeCharId] = activeChar;
                    }
                    // 仅地点类触发联动（燃料已在上面 gains 处理，避免重复）
                    if (tableKey === 'fx100' || tableKey === 'dc100') {
                        processLinks(tableKey, subResult.finalDesc || '');
                    }
                }
                updateSurvivalUI();
            }

            function addCheckResult(el, msg, color) {
                color = color || '#aaccee';
                var div = document.createElement('div');
                div.style.cssText = 'color:' + color + ';font-size:0.68rem;margin-top:2px;';
                div.textContent = msg || '';
                el.querySelector('.check-steps').appendChild(div);
            }

            window.campCombat = function(combatId) {
                const el = document.getElementById(combatId);
                if (!el || el.dataset.done) return;
                el.dataset.done = '1';
                el.querySelectorAll('button').forEach(function(b) { b.disabled = true;
                    b.style.opacity = '0.5'; });
                var resultHtml = '<div style="color:#e0556a;font-size:0.75rem;margin-top:0.3rem;">⚔️ 进入战斗...</div>';
                if (activeChar) {
                    const dmg = rollDiceExpr('1d6') + 2;
                    activeChar.hp = Math.max(0, activeChar.hp - dmg);
                    renderCharDetail(activeCharId);
                    resultHtml = '<div style="color:#e0556a;font-size:0.7rem;margin-top:0.3rem;">⚔️ 战斗中受到 ' + dmg + ' 点伤害</div>';
                }
                el.innerHTML += resultHtml;
                _patchDisplayLogDiv(combatId, el.outerHTML);
                if (activeChar && activeChar.hp <= 0) checkHpZero();
                updateSurvivalUI();
                unlockEvents();
            };
            window.campFlee = async function(combatId) {
                const el = document.getElementById(combatId);
                if (!el || el.dataset.done) return;
                el.dataset.done = '1';
                el.querySelectorAll('button').forEach(function(b) { b.disabled = true;
                    b.style.opacity = '0.5'; });
                let bonus = 0, profText = '';
                if (activeChar) { bonus = abilityMod(activeChar.dex);
                    const skills = activeChar.skillProfs || {};
                    if (skills['隐匿']) { bonus += activeChar.profBonus || 0;
                        profText = '(熟练+' + (activeChar.profBonus||0) + ')'; } }
                var d20;
                if (window._diceReady) {
                    try {
                        var roll3DResult = await window.roll3DDice('1d20');
                        if (roll3DResult && roll3DResult.total >= 1) {
                            d20 = roll3DResult.total;
                        } else {
                            d20 = 0;
                        }
                    } catch(e) { d20 = 0; }
                    if (d20 <= 0) { if (btnEl) { btnEl.disabled = false;
                        btnEl.textContent = '🎲 继续掷骰'; } unlockEvents(); return; }
                } else {
                    d20 = rand(20);
                }
                const total = d20 + bonus;
                var resultHtml = '';
                if (total >= 15) {
                    resultHtml = '<div style="color:#6abf8a;font-size:0.7rem;margin-top:0.3rem;">🏃 隐匿检定 d20=' + d20 + ' + ' + bonus + profText + ' = ' + total + ' ≥ DC15 → 逃离成功！</div>';
                } else {
                    resultHtml = '<div style="color:#e0556a;font-size:0.7rem;margin-top:0.3rem;">🏃 隐匿检定 d20=' + d20 + ' + ' + bonus + profText + ' = ' + total + ' < DC15 → 逃离失败！</div>';
                    if (activeChar) {
                        const dmg = rollDiceExpr('1d6') + 2;
                        activeChar.hp = Math.max(0, activeChar.hp - dmg);
                        renderCharDetail(activeCharId);
                        resultHtml += '<div style="color:#e0556a;font-size:0.7rem;">⚔️ 战斗中受到 ' + dmg + ' 点伤害</div>';
                    }
                }
                el.innerHTML += resultHtml;
                _patchDisplayLogDiv(combatId, el.outerHTML);
                if (activeChar && activeChar.hp <= 0) checkHpZero();
                updateSurvivalUI();
                unlockEvents();
            };
            // 喂食友善生物
            window.campFeed = function(feedId, creatureName, foodType) {
                const el = document.getElementById(feedId);
                if (!el || el.dataset.done) return;
                el.dataset.done = '1';
                el.querySelectorAll('button').forEach(function(b) { b.disabled = true;
                    b.style.opacity = '0.5'; });

                let resultHtml = '';
                if (foodType === 'ignore') {
                    resultHtml = '<div style="color:#999;font-size:0.7rem;margin-top:0.3rem;">你选择不喂食，' + creatureName + '离开了</div>';
                } else {
                    // 消耗食物
                    let consumed = false;
                    if (foodType === 'ration') {
                        if (survival.rations > 0) {
                            survival.rations--;
                            consumed = true;
                        }
                    } else if (activeChar && activeChar.inventory) {
                        for (var si = 0; si < activeChar.inventory.length; si++) {
                            if (activeChar.inventory[si].name === foodType && activeChar.inventory[si].qty > 0) {
                                activeChar.inventory[si].qty--;
                                if (activeChar.inventory[si].qty <= 0) activeChar.inventory.splice(si, 1);
                                consumed = true;
                                break;
                            }
                        }
                    }

                    if (consumed) {
                        const foodLabel = foodType === 'ration' ? '1份口粮' : ('1份' + foodType);
                        resultHtml = '<div style="color:#8ccfa0;font-size:0.7rem;margin-top:0.3rem;">🍖 喂食' + foodLabel + '给' + creatureName + '</div>';
                        // 效果
                        if (creatureName === '都灵寒鸦') {
                            survival.ravenProtection = 2;
                            resultHtml += '<div style="color:#88ccff;font-size:0.7rem;margin-top:0.15rem;">🪶 寒鸦为你示警：接下来2次事件不会遭遇危险</div>';
                            addSystemLog('🪶 寒鸦报信：接下来2次事件不会遭遇危险', 'success');
                        } else if (creatureName === '雪狐') {
                            // 雪狐引路：执行特殊发现
                            const fxResult = executeEvent('fx100', '', 0);
                            if (fxResult && fxResult.output) {
                                resultHtml += '<div style="color:#c8b088;font-size:0.7rem;margin-top:0.15rem;">🦊 雪狐引路，带你找到了一处特殊地点...</div>';
                                resultHtml += '<div style="margin-top:0.3rem;padding-left:0.5rem;border-left:2px solid rgba(200,176,136,0.3);">';
                                const fxLines = fxResult.output.split('\n');
                                fxLines.forEach(function(l) { resultHtml += '<div style="font-size:0.7rem;color:#b0c8d8;">' + l + '</div>'; });
                                resultHtml += '</div>';
                                // 处理发现物的收益
                                if (fxResult.gains && fxResult.gains.length > 0) {
                                    fxResult.gains.forEach(function(g) {
                                        if (g && g.action) {
                                            const a = g.action;
                                            if (a.coin) {
                                                activeChar.coins = activeChar.coins || {cp:0,sp:0,gp:0};
                                                const qty = a._rolledCoin || 1;
                                                activeChar.coins[a.coin] = (activeChar.coins[a.coin]||0) + qty;
                                            } else if (a.item) {
                                                activeChar.inventory = activeChar.inventory || [];
                                                const qty = a._rolledQty || a.qty || 1;
                                                var stacked = false;
                                                for (var si2 = 0; si2 < activeChar.inventory.length; si2++) {
                                                    if (activeChar.inventory[si2].name === a.item) { activeChar.inventory[si2].qty += qty;
                                                        stacked = true; break; }
                                                }
                                                if (!stacked) activeChar.inventory.push({name:a.item, qty:qty, location:'背包', weight:1});
                                            }
                                        }
                                    });
                                    if (activeCharId) charData[activeCharId] = activeChar;
                                }
                            } else {
                                resultHtml += '<div style="color:#999;font-size:0.7rem;margin-top:0.15rem;">🦊 雪狐离开了，没发现什么特别的东西</div>';
                            }
                        }
                    } else {
                        resultHtml = '<div style="color:#e0556a;font-size:0.7rem;margin-top:0.3rem;">⚠️ 没有可用的食物</div>';
                    }
                }
                el.innerHTML += resultHtml;
                _patchDisplayLogDiv(feedId, el.outerHTML);
                updateSurvivalUI();
                unlockEvents();
            };
            function _patchDisplayLogDiv(divId, resultHtml) {
                for (var di = displayLog.length - 1; di >= 0; di--) {
                    var idx = displayLog[di].html.indexOf('id="' + divId + '"');
                    if (idx === -1) continue;
                    var divStart = displayLog[di].html.lastIndexOf('<div', idx);
                    var depth = 0, pos = divStart;
                    while (pos < displayLog[di].html.length) {
                        var nextOpen = displayLog[di].html.indexOf('<div', pos + 1);
                        var nextClose = displayLog[di].html.indexOf('</div>', pos + 1);
                        if (nextClose === -1) break;
                        if (nextOpen !== -1 && nextOpen < nextClose) { depth++;
                            pos = nextOpen; }
                        else { if (depth === 0) { pos = nextClose; break; }
                            depth--;
                            pos = nextClose; }
                    }
                    displayLog[di].html = displayLog[di].html.substring(0, divStart) + resultHtml + displayLog[di].html.substring(pos + 6);
                    break;
                }
            }

            // 确认收益：✅获得 → 存入角色背包；❌未获得 → 仅标记
            window.confirmGains = function(gainId, accepted) {
                const el = document.getElementById(gainId);
                if (!el) return;
                var newInner = accepted ? '<span style="color:#4caf50;font-size:0.75rem;">✅ 已获得，材料已存入背包</span>' : '<span style="color:var(--text-dim);font-size:0.75rem;">❌ 未获得材料</span>';
                _patchDisplayLogDiv(gainId, newInner);
                el.innerHTML = newInner;
                if (accepted) {
                    const pg = pendingGains.find(function(p) { return p.key === gainId; });
                    if (pg && activeChar) {
                        pg.gains.forEach(function(g) {
                            if (g.type === 'item') {
                                activeChar.inventory = activeChar.inventory || [];
                                // 堆叠：同名同位置物品合并数量
                                var stacked = false;
                                for (var si = 0; si < activeChar.inventory.length; si++) {
                                    if (activeChar.inventory[si].name === g.item && activeChar.inventory[si].location === '背包') {
                                        activeChar.inventory[si].qty += g.qty;
                                        stacked = true; break;
                                    }
                                }
                                if (!stacked) activeChar.inventory.push({name:g.item, qty:g.qty, location:'背包', weight:1});
                                // 记录到雪原馈赠（口粮本身不记，只记录来源材料）
                                if (g.item !== '口粮') {
                                var wpNum = g.wpNum || findWpNum(g.item);
                                var existing = discoveredItems.find(function(d) { return d.name === g.item; });
                                if (existing) { existing.totalQty += g.qty;
                                    existing.times++; }
                                else { discoveredItems.push({name:g.item, totalQty:g.qty, wpNum:wpNum, times:1}); }
                                } // end g.item !== '口粮'
                                // 同步生存状态：口粮（独立于 discoveredItems 追踪）
                                if (g.item === '口粮') {
                                    survival.rations += g.qty;
                                    if (survival.rations > 0) { survival.isStarving = false;
                                        survival.starvationCount = 0; }
                                }
                                // 同步生存状态：燃料
                                const fuelMap = { '松枝': 'pine_branch', '松脂': 'resin', '铁松松脂': 'iron_resin', '荧光苔': 'glow_moss', '柴火/石块': 'firewood' };
                                if (fuelMap[g.item]) {
                                    const fk = fuelMap[g.item];
                                    survival.fuel[fk] = (survival.fuel[fk] || 0) + g.qty;
                                } // end if g.item !== '口粮'
                            } else if (g.type === 'coin') {
                                activeChar.coins = activeChar.coins || {cp:0,sp:0,gp:0};
                                activeChar.coins[g.coin] = (activeChar.coins[g.coin]||0) + g.qty;
                            }
                        });
                        updateSurvivalUI();
                        // 同步到charData
                        if (activeCharId) charData[activeCharId] = activeChar;
                        // 同步刷新所有工坊背包和商店
                        window.NORTH_CAMP.refreshAllShopBackpacks();

                    } else if (pg && !activeChar) {
                        pg.gains.forEach(function(g) {
                            addSystemLog(`${g.text}（无活跃角色）`, 'system');
                        });
                    }
                }
                // 清理并解锁
                pendingGains = pendingGains.filter(function(p) { return p.key !== gainId; });
                unlockEvents();
            };

            let _displayRendered = 0;  // 已渲染条数（增量追加，避免整体重绘）
            function renderDisplayLog(forceFull) {
                if (displayLog.length === 0) {
                    outputEl.innerHTML = `<div class="empty-hint">❄️ 寒风低语，等待你的骰声……<br>点击下方事件卡开始冒险</div>`;
                    _displayRendered = 0;
                    return;
                }
                // 存档恢复/导入后日志重建，强制全量重绘；
                // 注意：displayLog 满 MAX_DISPLAY 后 push+shift 条数不变，
                // 此时"已渲染条数==总条数"不能跳过渲染，必须全量重绘（否则新事件不显示）
                if (forceFull || _displayRendered >= displayLog.length) {
                    outputEl.innerHTML = displayLog.map(e => e.html).join('');
                    _displayRendered = displayLog.length;
                } else {
                    const fresh = displayLog.slice(_displayRendered);
                    if (fresh.length === 0) return;
                    if (_displayRendered === 0) outputEl.innerHTML = '';
                    outputEl.insertAdjacentHTML('beforeend', fresh.map(e => e.html).join(''));
                    _displayRendered = displayLog.length;
                }
                outputEl.scrollTop = outputEl.scrollHeight;
            }

            // =========================================================================
            // 九、事件卡片渲染
            // =========================================================================

            function renderEvents() {
                const container = document.getElementById('eventCardContainer');
                const tabContainer = document.getElementById('eventTabContainer');
                // 隐藏标签栏（只有4个按钮，不需要切换）
                tabContainer.style.display = 'none';

                const buttons = [
                    { cmd: 'ts100', label: '⬇ 深入雪原', dice: '', desc: '探索苍白大地的未知领域' },
                    { cmd: 'deep', label: '🔍 调查附近', dice: '', desc: '仔细观察周围环境' },
                    { cmd: 'rest', label: '⛺ 原地休整', dice: '', desc: '在此处扎营休整' },
                    { cmd: 'back', label: '↩ 返回', dice: '', desc: '沿原路返回' },
                ];

                container.innerHTML = buttons.map(b => `
                    <div class="event-card" data-cmd="${b.cmd}" data-label="${b.label}">
                        <div class="cmd">${b.label}</div>
                        ${b.dice ? `<span class="dice-label">${b.dice}</span>` : ''}
                        <div class="desc">${b.desc || ''}</div>
                    </div>
                `).join('');

                container.querySelectorAll('.event-card').forEach(el => {
                    el.addEventListener('click', async function() {
                        if (isEventLocked()) return;
                        if (checkKnockdown()) return;
                        if (!activeChar) { alert('请先选择或创建角色'); return; }
                        lockEvents();
                        try {
                        const cmd = this.dataset.cmd;
                        const label = this.dataset.label;

                        if (cmd === 'ts100') {
                            // 离开当前庇护所（如有）
                            if (survival.isInShelter) {
                                var sName = survival.shelterType === 'hunter_hut' ? '猎人小屋' : (survival.shelterType === 'hot_spring' ? '天然温泉' : (survival.shelterType === 'cave' ? '岩洞' : '营地'));
                                survival.isInShelter = false;
                                survival.shelterType = null;
                                addSystemLog('🏕️ 离开' + sName + '，继续深入雪原', 'system');
                            }
                            // 首次探索：深度 0→1，显示出发提示
                            if (survival.exploreDepth === 0) {
                                survival.exploreDepth = 1;
                                showPopup('🏕️ 您已出发进行探索', 'start');
                            }
                            deepCount = 0;
                            const shortLabels = {ts100:'探索'};
                            const shortLabel = shortLabels[cmd] || label;
                            const loadingDiv = await showLoadingAnimation(shortLabel);
                            loadingDiv.remove();
                            const result = runEventSafe('ts100', '');
                            if (!_knockedDownDuringEvent) {
                                const hasGains = displayResult(result, label);
                                updateSurvivalUI();
                                if (activeChar && activeCharId) charData[activeCharId] = activeChar;
                                // 敌对生物遭遇、材料确认或喂食交互时不解锁，等用户交互后解锁
                                if (!hasGains && !result.isHostile && !result.feedable && !result.checkAction) unlockEvents();
                            }
                        } else if (cmd === 'deep') {
                            if (deepCount > 5) {
                                addSystemLog('🔍 附近已经没什么能调查的了', 'warning');
                                unlockEvents(); return;
                            }
                            deepCount++;
                            if (deepCount > 5) {
                                addSystemLog('🔍 附近没有什么能调查的了', 'warning');
                                unlockEvents(); return;
                            }
                            const loadingDiv = await showLoadingAnimation('调查');
                            loadingDiv.remove();
                            const result = runEventSafe('dc100', '');
                            if (!_knockedDownDuringEvent) {
                                const hasGains = displayResult(result, '🔍 调查附近');
                                updateSurvivalUI();
                                if (activeChar && activeCharId) charData[activeCharId] = activeChar;
                                if (!hasGains && !result.isHostile && !result.feedable && !result.checkAction) unlockEvents();
                            }
                        } else if (cmd === 'rest') {
                            deepCount = 0;
                            const loadingDiv2 = await showLoadingAnimation('休整');
                            loadingDiv2.remove();
                            var fuelPriority = ['firewood','pine_branch','resin','glow_moss','iron_resin'];
                            function countFuel() {
                                var t = 0;
                                for (var fk of fuelPriority) t += (survival.fuel[fk]||0) * (fk === 'iron_resin' ? 2 : 1);
                                return t;
                            }
                            function consumeFuel(need) {
                                var remaining = need;
                                // 记录每种燃料消耗了多少（用于同步背包）
                                var consumed = {};
                                for (var fk of fuelPriority) {
                                    var val = (survival.fuel[fk]||0) * (fk === 'iron_resin' ? 2 : 1);
                                    if (val <= 0) continue;
                                    if (val >= remaining) {
                                        var realConsume = (fk === 'iron_resin') ? Math.ceil(remaining / 2) : remaining;
                                        survival.fuel[fk] -= realConsume;
                                        consumed[fk] = (consumed[fk]||0) + realConsume;
                                        // 同步扣减背包
                                        consumeFuelFromInventory(fk, realConsume);
                                        return true;
                                    } else { remaining -= val;
                                        var all = survival.fuel[fk];
                                        survival.fuel[fk] = 0;
                                        consumed[fk] = (consumed[fk]||0) + all;
                                        consumeFuelFromInventory(fk, all); }
                                }
                                return false;
                            }
                            var totalFuel = countFuel();
                            // 计算可用口粮/食物总数
                            var totalFood = survival.rations;
                            if (activeChar && activeChar.inventory) {
                                ['浆果/野菜','兽肉'].forEach(function(fn) {
                                    for (var si2 = 0; si2 < activeChar.inventory.length; si2++) {
                                        if (activeChar.inventory[si2].name === fn) totalFood += activeChar.inventory[si2].qty;
                                    }
                                });
                            }
                            var inShelterRest = survival.isInShelter;
                            var canLong = inShelterRest || (totalFuel >= 4 && totalFood >= 2);
                            var canShort = inShelterRest || totalFuel >= 1;
                            if (!canShort) {
                                addSystemLog('⛺ 无法原地休整：燃料不足（至少需1份，长休需4份燃料+2份口粮）', 'warning');
                                unlockEvents(); return;
                            }
                            if (!inShelterRest) {
                                survival.isInShelter = true;
                                survival.shelterType = 'camp';
                            }
                            var restId = 'rest_' + Date.now();
                            var longBtnDisabled = canLong ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"';
                            var shortBtnDisabled = canShort ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"';
                            var longLabel = inShelterRest ? '🛌 长休（庇护所内，免消耗）' : '🛌 长休（需4燃料+2口粮）';
                            var shortLabel = inShelterRest ? '☕ 短休（庇护所内，免消耗）' : '☕ 短休（需1燃料）';
                            var fuelInfo = inShelterRest ? '🛖 庇护所内休息免消耗' : ('可用燃料: ' + totalFuel + ' | 可用口粮/食物: ' + totalFood);
                            var entry = {
                                time: new Date().toLocaleTimeString(),
                                label: '⛺ 原地休整',
                                output: '选择休整方式',
                                html: '<div class="log-entry"><span class="log-time">' + new Date().toLocaleTimeString() + '</span><span class="log-label">⛺ 原地休整</span><div class="log-content"><div style="color:#b0d4f0;margin-bottom:0.4rem;">' + fuelInfo + '</div><div id="' + restId + '" style="display:flex;gap:8px;"><button ' + longBtnDisabled + ' style="padding:4px 16px;background:rgba(60,140,220,0.15);color:#88ccff;border:1px solid rgba(74,128,184,0.3);border-radius:4px;cursor:pointer;font-size:0.75rem;font-family:inherit;" data-resttype="long">' + longLabel + '</button><button ' + shortBtnDisabled + ' style="padding:4px 16px;background:rgba(60,140,220,0.15);color:#88ccff;border:1px solid rgba(74,128,184,0.3);border-radius:4px;cursor:pointer;font-size:0.75rem;font-family:inherit;" data-resttype="short">' + shortLabel + '</button></div></div></div>'
                            };
                            fullLog.push({ time: entry.time, label: entry.label, output: entry.output });
                            displayLog.push(entry);
                            if (displayLog.length > MAX_DISPLAY) displayLog.shift();
                            renderDisplayLog();
                            setTimeout(function() {
                                var btns = document.getElementById(restId);
                                if (!btns) { unlockEvents(); return; }
                                btns.querySelectorAll('button').forEach(function(b) {
                                    b.addEventListener('click', function() {
                                        var type = this.dataset.resttype;
                                        var inShelter = survival.isInShelter;
                                        if (type === 'long') {
                                            // 长休：庇护所内免消耗，野外需4燃料+2口粮/食物
                                            if (!inShelter) {
                                                if (countFuel() < 4) {
                                                    btns.innerHTML = '<span style="color:#e0556a;font-size:0.75rem;">⛔ 燃料不足（需4份）</span>';
                                                    updateSurvivalUI(); unlockEvents(); return;
                                                }
                                                var availFood = survival.rations;
                                                if (activeChar && activeChar.inventory) {
                                                    ['浆果/野菜','兽肉'].forEach(function(fn) {
                                                        for (var si3 = 0; si3 < activeChar.inventory.length; si3++) {
                                                            if (activeChar.inventory[si3].name === fn) availFood += activeChar.inventory[si3].qty;
                                                        }
                                                    });
                                                }
                                                if (availFood < 2) {
                                                    btns.innerHTML = '<span style="color:#e0556a;font-size:0.75rem;">⛔ 口粮/食物不足（需2份）</span>';
                                                    updateSurvivalUI(); unlockEvents(); return;
                                                }
                                            }
                                            // 先执行长休效果
                                            if (activeChar) { activeChar.hp = activeChar.hpMax;
                                                activeChar.tempHp = 0;
                                                renderCharDetail(activeCharId); }
                                            if (survival.coldLevel > 0) { survival.coldLevel = 0;
                                                survival.eventsSinceCold = 0;
                                                addSystemLog('❄️ 长休完成，严寒全部解除', 'success'); }
                                            if (survival.evilFrostActive) { survival.evilFrostActive = false;
                                                addSystemLog('👻 长休完成，恶霜现象消散', 'success'); }
                                            addSystemLog('🛌 长休完成，HP已恢复', 'success');
                                            if (!inShelter) {
                                                // 后消耗：4燃料
                                                consumeFuel(4);
                                                // 后消耗：2口粮/食物（优先口粮）
                                                var rationUsed = Math.min(survival.rations, 2);
                                                survival.rations -= rationUsed;
                                                var foodNeeded = 2 - rationUsed;
                                                if (foodNeeded > 0 && activeChar && activeChar.inventory) {
                                                    ['浆果/野菜','兽肉'].forEach(function(fn) {
                                                        if (foodNeeded <= 0) return;
                                                        for (var si4 = 0; si4 < activeChar.inventory.length; si4++) {
                                                            if (foodNeeded <= 0) break;
                                                            if (activeChar.inventory[si4].name === fn && activeChar.inventory[si4].qty > 0) {
                                                                var use = Math.min(activeChar.inventory[si4].qty, foodNeeded);
                                                                activeChar.inventory[si4].qty -= use;
                                                                foodNeeded -= use;
                                                                if (activeChar.inventory[si4].qty <= 0) activeChar.inventory.splice(si4, 1);
                                                            }
                                                        }
                                                    });
                                                }
                                                var consumeMsg = '（消耗4燃料';
                                                if (rationUsed > 0) consumeMsg += '+' + rationUsed + '口粮';
                                                if ((2-rationUsed-foodNeeded) > 0) consumeMsg += '+' + (2-rationUsed-foodNeeded) + '食物';
                                                consumeMsg += '）';
                                            }
                                            // 结束庇护所状态
                                            survival.isInShelter = false;
                                            survival.shelterType = null;
                                            var doneMsg = '<span style="color:#6abf8a;font-size:0.75rem;">🛌 长休完成' + (inShelter ? '（庇护所内，免消耗）' : consumeMsg) + '</span>';
                                            btns.innerHTML = doneMsg;
                                            _patchDisplayLogDiv(restId, doneMsg);
                                        } else {
                                            // 短休：庇护所内免消耗，野外燃料优先、火把兜底
                                            var hasT2 = hasTorch();
                                            if (!inShelter && countFuel() < 1 && !hasT2) {
                                                btns.innerHTML = '<span style="color:#e0556a;font-size:0.75rem;">⛔ 燃料和火把均不足</span>';
                                                updateSurvivalUI(); unlockEvents(); return;
                                            }
                                            var useFuelHere = !inShelter && countFuel() >= 1;
                                            if (!inShelter && !useFuelHere) useTorch();
                                            // 先执行短休效果
                                            if (activeChar) { var healVal = rollDiceExpr('1d8') + abilityMod(activeChar.con);
                                                activeChar.hp = Math.min(activeChar.hp + healVal, activeChar.hpMax);
                                                renderCharDetail(activeCharId);
                                                addSystemLog('☕ 短休恢复 ' + healVal + ' HP', 'success'); }
                                            if (inShelter && survival.coldLevel > 0) { survival.coldLevel = Math.max(0, survival.coldLevel - 2);
                                                addSystemLog('❄️ 庇护所短休解除2级严寒', 'success'); }
                                            else if (useFuelHere && survival.coldLevel > 0) { survival.coldLevel = Math.max(0, survival.coldLevel - 1);
                                                addSystemLog('❄️ 短休解除1级严寒', 'success'); }
                                            // 后消耗
                                            if (useFuelHere) consumeFuel(1);
                                            // 结束庇护所状态
                                            survival.isInShelter = false;
                                            survival.shelterType = null;
                                            var costLabel2 = inShelter ? '（庇护所内，免消耗）' : (useFuelHere ? '（消耗1燃料）' : '（使用火把）');
                                            var doneMsg2 = '<span style="color:#6abf8a;font-size:0.75rem;">☕ 短休完成' + costLabel2 + '</span>';
                                            btns.innerHTML = doneMsg2;
                                            _patchDisplayLogDiv(restId, doneMsg2);
                                        }
                                        // 计数事件
                                        rollCount++;
                                        document.getElementById('rollCounter').textContent = `掷表 ${rollCount} 次`;
                                        survival.totalEvents++;
                                        advanceTime(1);
                                        window.NORTH_SURVIVAL.checkCold(); window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation(); window.NORTH_SURVIVAL.checkOrient(); window.NORTH_SURVIVAL.checkFuel();
                                        updateSurvivalUI();
                                        unlockEvents();
                                    });
                                });
                            }, 50);
                        } else if (cmd === 'back') {
                            if (survival.exploreDepth <= 0) {
                                addSystemLog('🏕️ 您已在营地，无需返回', 'system');
                                unlockEvents(); return;
                            }
                            deepCount = 0;
                            const loadingDiv3 = await showLoadingAnimation('返回');
                            loadingDiv3.remove();
                            addSystemLog('↩ 队伍沿原路返回……', 'system');
                            // 生存检定DC12
                            var survBonus = 0, survProf = '';
                            if (activeChar) {
                                survBonus = abilityMod(activeChar.wis);
                                if ((activeChar.skillProfs||{})['生存'] || (activeChar.saveProfs||{})['感知']) {
                                    survBonus += activeChar.profBonus || 0;
                                    survProf = '(熟练+' + (activeChar.profBonus||0) + ')';
                                }
                            }
                            var survD20 = rand(20);
                            var survTotal = survD20 + survBonus;
                            if (survTotal < 10) {
                                addSystemLog('🧭 返回时迷失方向（生存检定 ' + survD20 + '+' + survBonus + survProf + '=' + survTotal + ' < DC10），自动深入雪原', 'warning');
                                // 自动执行深入雪原
                                const autoResult = runEventSafe('ts100', '');
                                if (!_knockedDownDuringEvent) {
                                    displayResult(autoResult, '⬇ 深入雪原');
                                    updateSurvivalUI();
                                    if (activeChar && activeCharId) charData[activeCharId] = activeChar;
                                }
                                unlockEvents(); return;
                            }
                            addSystemLog('🧭 返回成功（生存检定 ' + survD20 + '+' + survBonus + survProf + '=' + survTotal + ' ≥ DC10）', 'success');
                            // 探索深度-1
                            if (survival.exploreDepth > 0) {
                                survival.exploreDepth--;
                                if (survival.exploreDepth === 0) {
                                    showPopup('🏕️ 您已成功返回营地', 'back');
                                    // 返回营地自动清除所有负面生存状态
                                    var cleared = [];
                                    if (survival.coldLevel > 0) { survival.coldLevel = 0;
                                        survival.eventsSinceCold = 0;
                                        cleared.push('严寒解除'); }
                                    if (survival.isStarving) { survival.isStarving = false;
                                        survival.starvationCount = 0;
                                        cleared.push('断粮解除'); }
                                    if (survival.isLost) { survival.isLost = false;
                                        survival.lostEventsRemaining = 0;
                                        survival.lostDcPenalty = 0;
                                        cleared.push('迷失解除'); }
                                    if (survival.evilFrostActive) { survival.evilFrostActive = false;
                                        cleared.push('恶霜消散'); }
                                    if (cleared.length > 0) addSystemLog('🏕️ 返回营地：' + cleared.join('、'), 'success');
                                    // 回到营地庇护所
                                    survival.isInShelter = true;
                                    survival.shelterType = 'camp';
                                }
                                var dd2 = document.getElementById('depthDisplay');
                                if (dd2) dd2.textContent = survival.exploreDepth;
                            }
                            rollCount++;
                            document.getElementById('rollCounter').textContent = `掷表 ${rollCount} 次`;
                            survival.totalEvents++;
                            advanceTime(1);
                            if (survival.isInShelter && survival.shelterType !== 'camp') {
                                var shelterName2 = survival.shelterType === 'hunter_hut' ? '猎人小屋' : (survival.shelterType === 'hot_spring' ? '天然温泉' : (survival.shelterType === 'cave' ? '岩洞' : '庇护所'));
                                survival.isInShelter = false;
                                survival.shelterType = null;
                                addSystemLog('🏕️ 离开' + shelterName2 + '区域', 'system');
                            }
                            window.NORTH_SURVIVAL.checkCold(); window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation(); window.NORTH_SURVIVAL.checkOrient(); window.NORTH_SURVIVAL.checkFuel();
                            updateSurvivalUI();
                            unlockEvents();
                        }
                        } catch(e) { addSystemLog('⚠️ 事件异常: ' + e.message, 'danger');
                            unlockEvents(); }
                    });
                });

            }

            // =========================================================================
            // 十、操作函数
            // =========================================================================

            // 工作间状态（声明前置，供 exportSave 引用）
            let wsUnlockedRecipes = {};
            let wsCraftSlots = [null,null,null,null,null,null];
            let wsBrewSlots = [null,null,null,null,null,null];
            let wsCraftResult = null, wsBrewResult = null;

            function exportSave() {
                const now = new Date();
                const dateStr = now.toLocaleDateString('zh-CN').replace(/\//g, '-');
                // 清理fullLog中的html字段（可重新生成）
                const cleanLog = fullLog.map(function(e) {
                    return { time: e.time, label: e.label, output: e.output };
                });
                const saveData = {
                    version: 2,
                    exportTime: now.toISOString(),
                    _advAvatar: _advAvatarUrl,
                    charData: charData,
                    activeCharId: activeCharId,
                    statusPool: statusPool,
                    survival: survival,
                    fullLog: cleanLog,
                    bookPages: bookPages,
                    currentPageIdx: currentPageIdx,
                    statsData: statsData,
                    discoveredItems: discoveredItems,
                    eventSubStats: eventSubStats,
                    discoveredCreatures: discoveredCreatures,
                    craftedItems: craftedItems,
                    rollCount: rollCount,
                    deepCount: deepCount,
                    bookOpen: bookOpen,
                    activeBookTab: activeBookTab,
                    evilFrostActive: survival.evilFrostActive || false,
                    wsUnlockedRecipes: wsUnlockedRecipes,
                    wsCraftSlots: wsCraftSlots,
                    wsBrewSlots: wsBrewSlots,
                    wsCraftResult: wsCraftResult,
                    wsBrewResult: wsBrewResult,
                    campStorage: normalizeCampStorage(campStorage),
                    campStorageCoins: campStorageCoins,
                    // 商店状态
                    shopFundsGP: shopFundsGP,
                    shopFundsSP: shopFundsSP,
                    shopFundsCP: shopFundsCP,
                    shopCurrentPrices: shopCurrentPrices,
                    shopCurrentStock: shopCurrentStock,
                    shopCaravanItems: shopCaravanItems,
                    caravanReturnCounter: caravanReturnCounter,
                    // 熔炼炉状态
                    wsSmeltOre: wsSmeltOre,
                    wsSmeltCoal: wsSmeltCoal,
                    wsSmeltBars: wsSmeltBars,
                    wsSmeltIngot: wsSmeltIngot
                };
                const json = JSON.stringify(saveData, null, 2);
                const blob = new Blob([json], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                var charName = activeChar ? activeChar.name : '未命名';
                var userId = activeCharId || 0;
                a.download = `${userId}_${charName}_${dateStr}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                addSystemLog('💾 存档已导出', 'success');
            }

            function importSave(event) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const saveData = JSON.parse(e.target.result);
                        if (!saveData.version) { alert('无效的存档文件'); return; }
                        // 恢复数据（兼容 v1/v2）
                        if (saveData.charData) Object.assign(charData, saveData.charData);
                        if (saveData.statusPool && Array.isArray(saveData.statusPool)) statusPool = saveData.statusPool;
                        if (saveData.survival) {
                            Object.assign(survival, saveData.survival);
                            // v1兼容：v1存档可能没有 evilFrostActive
                            if (survival.evilFrostActive === undefined) survival.evilFrostActive = false;
                        }
                        // v2新增：工作间数据
                        if (saveData.wsUnlockedRecipes) wsUnlockedRecipes = saveData.wsUnlockedRecipes;
                        if (saveData.wsCraftSlots) wsCraftSlots = saveData.wsCraftSlots;
                        if (saveData.wsBrewSlots) wsBrewSlots = saveData.wsBrewSlots;
                        if (saveData.wsCraftResult) wsCraftResult = saveData.wsCraftResult;
                        if (saveData.wsBrewResult) wsBrewResult = saveData.wsBrewResult;
                        if (saveData.campStorage) campStorage = normalizeCampStorage(saveData.campStorage);
                        if (saveData.campStorageCoins) campStorageCoins = saveData.campStorageCoins;
                        // 商店状态
                        if (saveData.shopFundsGP !== undefined) shopFundsGP = saveData.shopFundsGP;
                        if (saveData.shopFundsSP !== undefined) shopFundsSP = saveData.shopFundsSP;
                        if (saveData.shopFundsCP !== undefined) shopFundsCP = saveData.shopFundsCP;
                        if (saveData.shopCurrentPrices) shopCurrentPrices = saveData.shopCurrentPrices;
                        if (saveData.shopCurrentStock) shopCurrentStock = saveData.shopCurrentStock;
                        if (saveData.shopCaravanItems) shopCaravanItems = saveData.shopCaravanItems;
                        if (saveData.caravanReturnCounter !== undefined) caravanReturnCounter = saveData.caravanReturnCounter;
                        // 熔炼炉状态
                        if (saveData.wsSmeltOre !== undefined) wsSmeltOre = saveData.wsSmeltOre;
                        if (saveData.wsSmeltCoal !== undefined) wsSmeltCoal = saveData.wsSmeltCoal;
                        if (saveData.wsSmeltBars !== undefined) wsSmeltBars = saveData.wsSmeltBars;
                        if (saveData.wsSmeltIngot !== undefined) wsSmeltIngot = saveData.wsSmeltIngot;
                        if (saveData.fullLog) {
                            fullLog = saveData.fullLog;
                            // 重建displayLog（从fullLog尾部截取，重新生成html）
                            displayLog = fullLog.slice(-MAX_DISPLAY).map(function(e) {
                                var lines = (e.output||'').split('\n');
                                var h = '';
                                for (var li = 0; li < lines.length; li++) {
                                    var line = lines[li];
                                    if (line.startsWith('🎲')) h += '<div class="l0">' + line + '</div>';
                                    else if (line.startsWith('↳')) { var im = line.match(/^(\s*)/);
                                        var il = im ? Math.min(Math.floor(im[1].length/3)+1, 5) : 1;
                                        h += '<div class="l' + il + '">' + line.trim() + '</div>'; }
                                    else if (line.trim().length > 0 && !line.startsWith('   ')) h += '<div class="desc-line">' + line + '</div>';
                                    else if (line.trim().length > 0) h += '<div>' + line + '</div>';
                                }
                                return { time: e.time, label: e.label, output: e.output, html: '<div class="log-entry"><span class="log-time">' + e.time + '</span><span class="log-label">' + e.label + '</span><div class="log-content">' + h + '</div></div>' };
                            });
                        }
                        if (saveData.bookPages) bookPages = saveData.bookPages;
                        if (saveData.statsData) statsData = saveData.statsData;
                        // 冒险者头像（徽章）
                        if (saveData._advAvatar !== undefined) { _advAvatarUrl = saveData._advAvatar || ''; applyAdvAvatar(); }
                        window.NORTH_GUILD.updateRankUI(); // 等级随存档事件数恢复
                        if (saveData.discoveredItems) discoveredItems = saveData.discoveredItems;
                        if (saveData.eventSubStats) eventSubStats = saveData.eventSubStats;
                        if (saveData.discoveredCreatures) discoveredCreatures = saveData.discoveredCreatures;
                        if (saveData.craftedItems) {
                            // v1→v2 迁移：旧存档 craftedItems 为 {name:true}，转为 {name:[name]}
                            craftedItems = {};
                            Object.keys(saveData.craftedItems).forEach(function(k) {
                                var v = saveData.craftedItems[k];
                                craftedItems[k] = Array.isArray(v) ? v : (v ? [k] : []);
                            });
                        }
                        activeCharId = saveData.activeCharId || null;
                        currentPageIdx = saveData.currentPageIdx || 0;
                        rollCount = saveData.rollCount || 0;
                        deepCount = saveData.deepCount || 0;
                        bookOpen = saveData.bookOpen === true;
                        activeBookTab = saveData.activeBookTab || 'rules';
                        // 刷新所有UI
                        activeChar = activeCharId ? charData[activeCharId] : null;
                        // 重建角色选择下拉框（探索和营地两边）
                        [charSelect, document.getElementById('campCharSelect')].forEach(function(sel) {
                            if (!sel) return;
                            sel.innerHTML = '<option value="">— 选择角色 —</option>';
                            Object.keys(charData).forEach(function(id) {
                                var c = charData[id];
                                sel.innerHTML += '<option value="' + id + '">' + c.name + '</option>';
                            });
                        });
                        if (activeCharId) {
                            charSelect.value = activeCharId;
                            var ccs = document.getElementById('campCharSelect');
                            if (ccs) { ccs.value = activeCharId;
                                ccs.dispatchEvent(new Event('change')); }
                        }
                        // 刷新UI（存档恢复后强制全量重绘日志）
                        renderDisplayLog(true);
                        updateSurvivalUI();
                        window.NORTH_GUILD.updateRankUI();
                        renderStats();
                        renderCharDetail(activeCharId);
                        if (typeof renderCampCharSheet === 'function') { try { renderCampCharSheet(); } catch(e) {} }
                        document.getElementById('rollCounter').textContent = `掷表 ${rollCount} 次`;
                        // 恢复手札状态（仅记录打开状态，切换到营地时自动渲染）
                        if (bookOpen && typeof renderBookContent === 'function') {
                            try { renderBookContent(); } catch(e) {}
                        }
                        addSystemLog('📥 冒险者已就绪（' + (saveData.fullLog ? saveData.fullLog.length : 0) + '条记录）', 'success');
                    } catch (err) {
                        alert('存档文件解析失败: ' + err.message);
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            }

            /* ━━ Excel 角色卡导入（北境独立端点，不写入跑团平台数据库）━━━ */
            function importFromExcel(event) {
                var file = event.target.files[0];
                if (!file) return;
                var ext = file.name.split('.').pop().toLowerCase();
                if (ext !== 'xlsx' && ext !== 'xls') {
                    alert('请上传 .xlsx 或 .xls 格式的 Excel 文件');
                    event.target.value = '';
                    return;
                }
                var formData = new FormData();
                formData.append('file', file);
                addSystemLog('📊 正在导入Excel角色卡: ' + file.name + '...', 'system');
                fetch('/api/tavern/character/import', {
                    method: 'POST',
                    body: formData
                }).then(function(r) { return r.json(); }).then(function(d) {
                    if (d.error) { alert('导入失败: ' + d.error); addSystemLog('❌ Excel导入失败: ' + d.error, 'danger'); return; }
                    // 将导入的角色加入本地 charData（不写入服务端 characters 表）
                    var newId = 'camp_' + Date.now();
                    charData[newId] = {
                        name: d.name,
                        rank: '青羽',
                        level: d.level || 1,
                        class: d.class || '未知',
                        race: d.race || '未知',
                        hp: d.hp_current || d.hp_max || 10,
                        hpMax: d.hp_max || 10,
                        tempHp: 0,
                        ac: d.ac || 10,
                        speed: d.speed || 30,
                        profBonus: d.proficiency_bonus || 2,
                        passivePerception: d.passive_perception || 10,
                        spellSaveDc: d.spell_save_dc || 10,
                        spellAttackBonus: d.spell_attack_bonus || 0,
                        initiativeBonus: d.initiative_bonus || 0,
                        str: (d.abilities && d.abilities.str) || 10,
                        dex: (d.abilities && d.abilities.dex) || 10,
                        con: (d.abilities && d.abilities.con) || 10,
                        int: (d.abilities && d.abilities.int) || 10,
                        wis: (d.abilities && d.abilities.wis) || 10,
                        cha: (d.abilities && d.abilities.cha) || 10,
                        height: d.height || '', weight: d.weight || '',
                        alignment: d.alignment || '', faith: d.faith || '', gender: d.gender || '',
                        languages: d.languages || '通用语', keyAbilities: d.key_abilities || '',
                        resistances: d.resistances || '',
                        skillProfs: d.skill_proficiencies || {},
                        saveProfs: d.save_proficiencies || {},
                        weapons: d.weapons || [],
                        inventory: d.inventory || [],
                        coins: d.coins || {cp:0, sp:0, gp:0},
                        spells: d.prepared_spells || [],
                        spellSlots: d.spell_slots || {},
                        features: d.features || [],
                        background: d.background || {personality:'', ideals:'', bonds:'', flaws:'', appearance:'', backstory:''}
                    };
                    renderCharSelect();
                    if (typeof renderCampCharSheet === 'function') { try { renderCampCharSheet(); } catch(e) {} }
                    addSystemLog('✅ ' + d.name + ' 已从Excel导入（Lv.' + d.level + ' ' + d.class + ' ' + d.race + '）', 'success');
                    // 自动选中新导入的角色
                    setTimeout(function() {
                        var cs = document.getElementById('campCharSelect');
                        if (cs) { cs.value = newId; cs.dispatchEvent(new Event('change')); }
                    }, 800);
                }).catch(function(e) {
                    alert('导入失败: 网络错误');
                    addSystemLog('❌ Excel导入失败: 网络错误', 'danger');
                });
                event.target.value = '';
            }

            // ━━━ 服务端持久化 ━━━
            var _northServerSyncTimer = null;

            const MAX_SAVE_LOG = 500;  // 存档日志裁剪上限（v3：超出丢弃最旧，控制存档体积）
            function collectNorthSaveData() {
                var cleanLog = fullLog.map(function(e) {
                    return { time: e.time, label: e.label, output: e.output, gains: e.gains };
                });
                // v3 日志裁剪：只保留最近 MAX_SAVE_LOG 条（事件越多存档不无限膨胀）
                var trimmed = cleanLog.length > MAX_SAVE_LOG;
                if (trimmed) cleanLog = cleanLog.slice(-MAX_SAVE_LOG);
                return {
                    version: 3,
                    _northName: _northUsername,
                    _advAvatar: _advAvatarUrl,
                    charData: charData,
                    activeCharId: activeCharId,
                    statusPool: statusPool,
                    survival: survival,
                    fullLog: cleanLog,
                    logTrimmed: trimmed,
                    bookPages: bookPages,
                    currentPageIdx: currentPageIdx,
                    statsData: statsData,
                    discoveredItems: discoveredItems,
                    eventSubStats: eventSubStats,
                    discoveredCreatures: discoveredCreatures,
                    craftedItems: craftedItems,
                    rollCount: rollCount,
                    deepCount: deepCount,
                    wsUnlockedRecipes: wsUnlockedRecipes,
                    wsCraftSlots: wsCraftSlots,
                    wsBrewSlots: wsBrewSlots,
                    wsCraftResult: wsCraftResult,
                    wsBrewResult: wsBrewResult,
                    campStorage: normalizeCampStorage(campStorage),
                    campStorageCoins: campStorageCoins,
                    shopFundsGP: shopFundsGP,
                    shopFundsSP: shopFundsSP,
                    shopFundsCP: shopFundsCP,
                    shopCurrentPrices: shopCurrentPrices,
                    shopCurrentStock: shopCurrentStock,
                    shopCaravanItems: shopCaravanItems,
                    caravanReturnCounter: caravanReturnCounter,
                    wsSmeltOre: wsSmeltOre,
                    wsSmeltCoal: wsSmeltCoal,
                    wsSmeltBars: wsSmeltBars,
                    wsSmeltIngot: wsSmeltIngot,
                };
            }

            var _saveFailCount = 0;  // 连续保存失败计数（异常处理：提示+指数退避重试）
            var _saveRetryTimer = null;
            function saveNorthToServer() {
                if (!_northUserId) return;  // 未登录不同步
                var data = collectNorthSaveData();
                fetch('/api/north/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ save_name: 'auto', save_data: data }),
                }).then(function(r) {
                    if (r.ok) {
                        if (_saveFailCount > 0) {
                            addSystemLog('💾 存档已恢复同步', 'success');
                            _saveFailCount = 0;
                        }
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                }).catch(function() {
                    _saveFailCount += 1;
                    if (_saveFailCount === 1) {
                        addSystemLog('⚠️ 存档保存失败，正在自动重试…', 'error');
                    } else if (_saveFailCount === 3) {
                        addSystemLog('⚠️ 存档连续保存失败，请检查网络/服务器', 'error');
                    }
                    // 指数退避重试：10s / 30s / 60s（封顶 60s），失败期间不无限叠加
                    if (_saveFailCount <= 3 && !_saveRetryTimer) {
                        var waitMs = Math.min(10000 * Math.pow(3, _saveFailCount - 1), 60000);
                        _saveRetryTimer = setTimeout(function() {
                            _saveRetryTimer = null;
                            saveNorthToServer();
                        }, waitMs);
                    }
                });
            }

            function loadNorthFromServer() {
                if (!_northUserId) return;
                fetch('/api/north/load?save_name=auto').then(function(r){return r.json();}).then(function(d){
                    if (!d.ok || !d.save_data) return;
                    var sd = d.save_data;
                    try {
                        if (sd.charData) Object.assign(charData, sd.charData);
                        if (sd.statusPool && Array.isArray(sd.statusPool)) statusPool = sd.statusPool;
                        if (sd.survival) Object.assign(survival, sd.survival);
                        if (sd.fullLog) {
                            fullLog = sd.fullLog;
                            displayLog = fullLog.slice(-16).map(function(e) {
                                var lines = (e.output||'').split('\n');
                                var h = '';
                                for (var li = 0; li < lines.length; li++) {
                                    var line = lines[li];
                                    if (line.indexOf('🎲')===0) h += '<div class=\"l0\">' + line + '</div>';
                                    else if (line.indexOf('↳')===0) { var im = line.match(/^(\s*)/); var il = im ? Math.min(Math.floor(im[1].length/3)+1, 5) : 1; h += '<div class=\"l' + il + '\">' + line.trim() + '</div>'; }
                                    else if (line.trim().length > 0 && line.indexOf('   ')!==0) h += '<div class=\"desc-line\">' + line + '</div>';
                                    else if (line.trim().length > 0) h += '<div>' + line + '</div>';
                                }
                                return { time: e.time, label: e.label, output: e.output, html: '<div class=\"log-entry\"><span class=\"log-time\">' + e.time + '</span><span class=\"log-label\">' + e.label + '</span><div class=\"log-content\">' + h + '</div></div>' };
                            });
                        }
                        if (sd.bookPages) bookPages = sd.bookPages;
                        if (sd.currentPageIdx !== undefined) currentPageIdx = sd.currentPageIdx;
                        if (sd.statsData) statsData = sd.statsData;
                        if (sd.discoveredItems) discoveredItems = sd.discoveredItems;
                        if (sd.eventSubStats) eventSubStats = sd.eventSubStats;
                        if (sd.discoveredCreatures) discoveredCreatures = sd.discoveredCreatures;
                        if (sd.craftedItems) craftedItems = sd.craftedItems;
                        if (sd.rollCount !== undefined) rollCount = sd.rollCount;
                        if (sd.deepCount !== undefined) deepCount = sd.deepCount;
                        if (sd.wsUnlockedRecipes) wsUnlockedRecipes = sd.wsUnlockedRecipes;
                        if (sd.wsCraftSlots) wsCraftSlots = sd.wsCraftSlots;
                        if (sd.wsBrewSlots) wsBrewSlots = sd.wsBrewSlots;
                        if (sd.wsCraftResult) wsCraftResult = sd.wsCraftResult;
                        if (sd.wsBrewResult) wsBrewResult = sd.wsBrewResult;
                        if (sd.campStorage) campStorage = normalizeCampStorage(sd.campStorage);
                        if (sd.campStorageCoins) campStorageCoins = sd.campStorageCoins;
                        if (sd.shopFundsGP !== undefined) shopFundsGP = sd.shopFundsGP;
                        if (sd.shopFundsSP !== undefined) shopFundsSP = sd.shopFundsSP;
                        if (sd.shopFundsCP !== undefined) shopFundsCP = sd.shopFundsCP;
                        if (sd.shopCurrentPrices) shopCurrentPrices = sd.shopCurrentPrices;
                        if (sd.shopCurrentStock) shopCurrentStock = sd.shopCurrentStock;
                        if (sd.shopCaravanItems) shopCaravanItems = sd.shopCaravanItems;
                        if (sd.caravanReturnCounter !== undefined) caravanReturnCounter = sd.caravanReturnCounter;
                        if (sd.wsSmeltOre !== undefined) wsSmeltOre = sd.wsSmeltOre;
                        if (sd.wsSmeltCoal !== undefined) wsSmeltCoal = sd.wsSmeltCoal;
                        if (sd.wsSmeltBars !== undefined) wsSmeltBars = sd.wsSmeltBars;
                        if (sd.wsSmeltIngot !== undefined) wsSmeltIngot = sd.wsSmeltIngot;
                        // 冒险者头像（徽章）
                        if (sd._advAvatar !== undefined) { _advAvatarUrl = sd._advAvatar || ''; applyAdvAvatar(); }
                        // 刷新UI（存档恢复后强制全量重绘日志）
                        renderDisplayLog(true);
                        updateSurvivalUI();
                        window.NORTH_GUILD.updateRankUI();
                        renderStats();
                        if (activeCharId && charData[activeCharId]) {
                            activeChar = charData[activeCharId];
                            renderCharDetail(activeCharId);
                        }
                        renderCharSelect();
                        document.getElementById('rollCounter').textContent = '掷表 ' + (rollCount||0) + ' 次';
                        addSystemLog('🏕️ 冒险者已返回', 'success');
                    } catch(e) { console.error('加载存档失败:', e); }
                }).catch(function(){});
            }

            // 每30秒自动保存到服务器
            _northServerSyncTimer = setInterval(saveNorthToServer, 30000);
            // 每次事件后保存（关键时机)
            var _origAddSystemLog = addSystemLog;
            addSystemLog = function(msg, type) {
                _origAddSystemLog(msg, type);
                // 延迟2秒保存，避免连续事件频繁请求
                clearTimeout(addSystemLog._saveTimer);
                addSystemLog._saveTimer = setTimeout(saveNorthToServer, 2000);
            };

            function clearDisplay() { displayLog = [];
                renderDisplayLog(); }

            function exportFullLog() {
                if (fullLog.length === 0) { alert('暂无记录可导出'); return; }
                const now = new Date();
                const dateStr = now.toLocaleDateString('zh-CN');
                const timeStr = now.toLocaleTimeString('zh-CN', {hour12: false});
                const sep = '═'.repeat(64);
                const lines = [];
                lines.push(sep);
                lines.push(`  北境雪原 · 完整跑团记录`);
                lines.push(`  导出时间: ${dateStr} ${timeStr}`);
                lines.push(`  Powered by 尘封之卷 · 骰娘 Web 版`);
                lines.push(sep);
                lines.push('');
                lines.push(`┏${'━'.repeat(62)}┓`);
                lines.push(`┃               📑 目  录                        ┃`);
                lines.push(`┗${'━'.repeat(62)}┛`);
                lines.push('');
                lines.push(`  总事件数: ${fullLog.length} 条`);
                lines.push('');

                // 统计各类事件
                const cmdStats = {};
                fullLog.forEach(function(e) {
                    const key = e.label || '其他';
                    if (!cmdStats[key]) cmdStats[key] = 0;
                    cmdStats[key]++;
                });
                for (const [key, cnt] of Object.entries(cmdStats)) {
                    lines.push(`  ${key}: ${cnt} 条`);
                }
                lines.push('');

                // 收获总结（基于日志条目中保存的收益快照）
                const allGains = [];
                fullLog.forEach(function(e) {
                    (e.gains || []).forEach(function(g) {
                        if (!g || !g.action) return;
                        const a = g.action;
                        if (a.coin) {
                            const cn = {gp:'金币',sp:'银币',cp:'铜币'};
                            const qty = a._rolledCoin || (a.coin_roll ? rollDiceExpr(a.coin_roll) : 1);
                            allGains.push(`   钱币: +${qty} ${cn[a.coin]||a.coin}`);
                        } else if (a.item) {
                            const qty = a._rolledQty || (a.qty_roll ? rollDiceExpr(a.qty_roll) : (a.qty||1));
                            const unit = a.unit||'份';
                            allGains.push(`   物品: ${a.item} x${qty}${unit}`);
                            if (a.bonus) {
                                const broll = rollDiceExpr(a.bonus.dice);
                                if (broll === a.bonus.target) {
                                    allGains.push(`   物品: ${a.bonus.item} x${a.bonus.qty||1}${a.bonus.unit||'份'}`);
                                }
                            }
                        }
                    });
                });
                if (allGains.length > 0) {
                    lines.push(`┏${'━'.repeat(62)}┓`);
                    lines.push(`┃               🎒 收获总结                      ┃`);
                    lines.push(`┗${'━'.repeat(62)}┛`);
                    lines.push('');
                    const gainCounts = {};
                    allGains.forEach(function(g) { gainCounts[g] = (gainCounts[g]||0)+1; });
                    for (const [gain, count] of Object.entries(gainCounts)) {
                        lines.push(count > 1 ? `${gain}  (×${count})` : gain);
                    }
                    lines.push('');
                }

                // 详细记录
                lines.push('─'.repeat(64));
                lines.push('');
                lines.push(`┏${'━'.repeat(62)}┓`);
                lines.push(`┃               📜 详细记录                      ┃`);
                lines.push(`┗${'━'.repeat(62)}┛`);
                lines.push('');
                for (let i = 0; i < fullLog.length; i++) {
                    const entry = fullLog[i];
                    lines.push(`  [${entry.time}] ▶ ${entry.label}`);
                    const clean = (entry.output||'').split('\n');
                    clean.forEach(function(l) { if (l.trim()) lines.push(`      ${l.trim()}`); });
                    lines.push('');
                }
                lines.push('─'.repeat(64));
                lines.push(`  记录导出时间: ${dateStr} ${timeStr}`);
                lines.push(sep);

                const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const fnDate = now.toISOString().slice(0,10);
                const fnTime = now.toTimeString().slice(0,8).replace(/:/g,'-');
                a.download = `北境跑团记录_${fnDate}_${fnTime}.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
            }

            async function clearStats() {
                if (!await showConfirmDialog('确认清空所有统计数据？')) return;
                statsData = { total: 0, groups: {} };
                eventSubStats = {};
                window.NORTH_GUILD.updateRankUI(); // 清空统计后等级回落青羽
                renderStats();
            }

            function adjustHp(amount) {
                if (!activeChar) { alert('请先选择角色'); return; }
                const newHp = Math.max(0, Math.min(activeChar.hp + amount, activeChar.hpMax));
                const actualChange = newHp - activeChar.hp;
                activeChar.hp = newHp;
                renderCharDetail(activeCharId);
                if (newHp <= 0) { checkHpZero(); return; }

                const label = amount > 0 ? '治疗' : '伤害';
                const sign = actualChange > 0 ? '+' : '';
                const entry = {
                    time: new Date().toLocaleTimeString(),
                    label: label,
                    output: `${label} ${activeChar.name}: ${sign}${actualChange} HP → ${activeChar.hp}/${activeChar.hpMax}`,
                    // 紧凑单行 html（output-area 为 white-space:pre-wrap，换行会被显示）
                    html: '<div class="log-entry"><span class="log-time">' + new Date().toLocaleTimeString() + '</span><span class="log-label">' + label + '</span><div class="log-content" style="color:' + (amount > 0 ? '#6abf8a' : '#e0556a') + ';">' + activeChar.name + ' ' + label + ': ' + sign + actualChange + ' HP → ' + activeChar.hp + '/' + activeChar.hpMax + '</div></div>'
                };
                fullLog.push({ time: entry.time, label: label, output: entry.output });
                displayLog.push(entry);
                if (displayLog.length > MAX_DISPLAY) displayLog.shift();
                renderDisplayLog();
                updateSurvivalUI();
            }

            function longRest() {
                if (checkKnockdown()) return;
                if (!activeChar) { alert('请先选择角色'); return; }
                // 需要4燃料 + 2口粮/食物
                var fuelTotal = 0;
                ['firewood','pine_branch','resin','glow_moss','iron_resin'].forEach(function(fk) { fuelTotal += (survival.fuel[fk]||0) * (fk==='iron_resin'?2:1); });
                if (fuelTotal < 4) { addSystemLog('⛔ 长休失败：燃料不足（需4份，可用'+fuelTotal+'）', 'warning'); return; }
                var availFood = survival.rations;
                if (activeChar.inventory) {
                    ['浆果/野菜','兽肉'].forEach(function(fn) {
                        for (var si=0; si<activeChar.inventory.length; si++) {
                            if (activeChar.inventory[si].name===fn) availFood+=activeChar.inventory[si].qty;
                        }
                    });
                }
                if (availFood < 2) { addSystemLog('⛔ 长休失败：口粮/食物不足（需2份）', 'warning'); return; }
                // 野外长休
                if (!survival.isInShelter) {
                    const dc = 12;
                    const conMod = abilityMod(activeChar.con);
                    const roll = rand(20) + conMod;
                    if (roll < dc) {
                        const heal = Math.floor(activeChar.hpMax / 2);
                        activeChar.hp = Math.min(activeChar.hp + heal, activeChar.hpMax);
                        addSystemLog(`⛺ 野外长休：体质豁免失败 (${roll}<DC${dc})，只恢复一半HP (${heal})`, 'warning');
                        // 即使失败也消耗
                        consumeRestCosts();
                        survival.isInShelter = false;
                        survival.shelterType = null;
                        renderCharDetail(activeCharId); updateSurvivalUI();
                        return;
                    }
                }
                activeChar.hp = activeChar.hpMax;
                activeChar.tempHp = 0;
                if (survival.coldLevel > 0) {
                    survival.coldLevel = 0;
                    survival.eventsSinceCold = 0;
                    addSystemLog('❄️ 长休完成，严寒等级全部解除', 'success');
                }
                if (survival.evilFrostActive) { survival.evilFrostActive = false;
                    addSystemLog('👻 长休完成，恶霜现象消散', 'success'); }
                // 后消耗
                consumeRestCosts();
                // 结束庇护所状态
                survival.isInShelter = false;
                survival.shelterType = null;
                renderCharDetail(activeCharId);
                updateSurvivalUI();
                addSystemLog(`🛌 ${activeChar.name} 完成长休！HP 已恢复至 ${activeChar.hpMax}`, 'success');
            }

            // 检查背包中是否有火把
            function hasTorch() {
                if (!activeChar || !activeChar.inventory) return false;
                for (var i = 0; i < activeChar.inventory.length; i++) {
                    if (activeChar.inventory[i].name === '火把' && activeChar.inventory[i].qty > 0) return true;
                }
                return false;
            }
            // 使用火把：激活效果并消耗1个
            function useTorch() {
                // 消耗1个火把
                if (activeChar && activeChar.inventory) {
                    for (var i = 0; i < activeChar.inventory.length; i++) {
                        if (activeChar.inventory[i].name === '火把' && activeChar.inventory[i].qty > 0) {
                            activeChar.inventory[i].qty--;
                            if (activeChar.inventory[i].qty <= 0) activeChar.inventory.splice(i, 1);
                            break;
                        }
                    }
                }
                survival.torchChecks = 2;
                if (survival.coldLevel > 0) {
                    survival.coldLevel = Math.max(0, survival.coldLevel - 2);
                    addSystemLog('🔥 点燃火把（-1），消除2级严寒（剩余严寒' + survival.coldLevel + '级），免疫2次严寒检定', 'success');
                } else {
                    addSystemLog('🔥 点燃火把（-1），免疫2次严寒检定', 'success');
                }
            }

            function shortRest() {
                if (checkKnockdown()) return false;
                if (!activeChar) { alert('请先选择角色'); return false; }
                // 庇护所内休息不消耗燃料
                var inShelter = survival.isInShelter;
                // 检查资源：燃料优先，火把兜底
                var fuelTotal = 0;
                if (!inShelter) {
                    ['firewood','pine_branch','resin','glow_moss','iron_resin'].forEach(function(fk) { fuelTotal += (survival.fuel[fk]||0) * (fk==='iron_resin'?2:1); });
                }
                var hasT = hasTorch();
                if (!inShelter && fuelTotal < 1 && !hasT) { addSystemLog('⛔ 短休失败：燃料和火把均不足', 'warning'); return false; }
                var useFuel = !inShelter && fuelTotal >= 1;
                if (useFuel) {
                    // 消耗1燃料（同步扣减背包）
                    var fuelPriority = ['firewood','pine_branch','resin','glow_moss','iron_resin'];
                    var need = 1;
                    for (var fi=0; fi<fuelPriority.length && need>0; fi++) {
                        var fk = fuelPriority[fi];
                        var val = (survival.fuel[fk]||0) * (fk==='iron_resin'?2:1);
                        if (val<=0) continue;
                        var realConsume;
                        if (fk==='iron_resin') { realConsume = Math.ceil(need/2);
                            survival.fuel[fk] -= realConsume; }
                        else { realConsume = Math.min(survival.fuel[fk],need);
                            survival.fuel[fk] -= realConsume;
                            need -= realConsume; }
                        consumeFuelFromInventory(fk, realConsume);
                        if (need<=0) break;
                        need -= val;
                        survival.fuel[fk] = 0;
                    }
                } else if (!inShelter) {
                    useTorch();
                }
                const heal = rollDiceExpr('1d8') + abilityMod(activeChar.con);
                const actual = Math.min(heal, activeChar.hpMax - activeChar.hp);
                activeChar.hp += actual;
                // 结束庇护所状态（休息后离开庇护所）
                survival.isInShelter = false;
                survival.shelterType = null;
                renderCharDetail(activeCharId);
                var costMsg = inShelter ? '（庇护所内，免燃料）' : (useFuel ? '（消耗1燃料）' : '（使用火把）');
                addSystemLog(`☕ ${activeChar.name} 短休，恢复 ${actual} HP` + costMsg, 'success');
                if (inShelter && survival.coldLevel > 0) {
                    survival.coldLevel = Math.max(0, survival.coldLevel - 2);
                    addSystemLog('❄️ 庇护所短休解除2级严寒', 'success');
                } else if (useFuel && survival.coldLevel > 0) {
                    survival.coldLevel = Math.max(0, survival.coldLevel - 1);
                    addSystemLog('❄️ 短休解除1级严寒', 'success');
                }
                updateSurvivalUI();
            }

            // 使用驱寒药膏
            function doUseOintment() {
                if (checkKnockdown()) return;
                if (!activeChar || !activeChar.inventory) { alert('请先选择角色'); return; }
                var found = false;
                for (var i = 0; i < activeChar.inventory.length; i++) {
                    if (activeChar.inventory[i].name === '驱寒药膏' && activeChar.inventory[i].qty > 0) {
                        activeChar.inventory[i].qty--;
                        if (activeChar.inventory[i].qty <= 0) activeChar.inventory.splice(i, 1);
                        found = true; break;
                    }
                }
                if (!found) { alert('🧴 背包中没有驱寒药膏'); return; }
                // 消除2级严寒
                if (survival.coldLevel > 0) {
                    survival.coldLevel -= Math.min(survival.coldLevel, 2);
                }
                // 6次事件抵抗
                survival.coldResist = 6;
                updateSurvivalUI();
            }

            // ━━━ 状态池工具 ━━━
            // 状态键规则：adv:<属性>（str/dex/con/int/wis/cha）属性检定优势；
            //            adv:skill:<技能名> 技能检定优势
            function findStatus(key) {
                for (var si = 0; si < statusPool.length; si++) {
                    if (statusPool[si].key === key) return statusPool[si];
                }
                return null;
            }
            // 检定后消耗状态（无论成败都移除一次；uses 归零移除整条）
            function consumeStatus(key) {
                var s = findStatus(key);
                if (!s) return false;
                s.uses = (s.uses || 1) - 1;
                if (s.uses <= 0) {
                    statusPool = statusPool.filter(function(x) { return x !== s; });
                    addSystemLog('✨ 状态已生效并消散：' + s.name, 'system');
                }
                return true;
            }
            // 使用状态类物品：把状态写入状态池（同名状态叠加次数）
            function grantStatuses(itemName, list) {
                list.forEach(function(st) {
                    var ex = findStatus(st.key);
                    if (ex) { ex.uses = (ex.uses || 1) + (st.uses || 1); }
                    else { statusPool.push({ key: st.key, name: st.name, source: itemName, uses: st.uses || 1 }); }
                });
                var names = list.map(function(st) { return st.name + ((st.uses || 1) > 1 ? '×' + st.uses : ''); }).join('、');
                addSystemLog('✨ 获得状态：' + names + '（下一次匹配检定时自动生效）', 'success');
            }

            // 实际执行使用（不写事件回响日志：事件回响只显示事件信息）
            function applyUseBackpackItem(itemName, cfg) {
                var found = false;
                for (var i = 0; i < activeChar.inventory.length; i++) {
                    if (activeChar.inventory[i].name === itemName && activeChar.inventory[i].qty > 0) {
                        activeChar.inventory[i].qty--;
                        if (activeChar.inventory[i].qty <= 0) activeChar.inventory.splice(i, 1);
                        found = true; break;
                    }
                }
                if (!found) { alert('🎒 背包中没有' + itemName); return; }
                if (cfg.heal) {
                    var heal = rollDiceExpr(cfg.heal);
                    var hpBefore = activeChar.hp || 0;
                    activeChar.hp = Math.min(hpBefore + heal, activeChar.hpMax || hpBefore);
                }
                if (cfg.coldResist) {
                    survival.coldResist = Math.max(survival.coldResist || 0, cfg.coldResist);
                }
                // 状态类物品：写入状态池（如松茸→力量/体质检定优势、魔法泉水→智力检定优势）
                if (cfg.status) {
                    grantStatuses(itemName, cfg.status);
                }
                // 回写存档引用 + 刷新 UI（addSystemLog 已触发 2 秒防抖存档）
                if (charData[activeCharId]) charData[activeCharId] = activeChar;
                refreshBagUseUI();
            }

            // 使用背包中的可交互物品（治疗/驱寒类，效果表见 north-data.js ITEM_USE_TABLE）
            // 所有道具使用前均弹确认弹窗（不写入事件回响）
            function useBackpackItem(itemName) {
                if (checkKnockdown()) return;
                var table = (window.NORTH_DATA && window.NORTH_DATA.ITEM_USE_TABLE) || {};
                var cfg = table[itemName];
                if (!cfg) { return; }
                if (!activeChar || !activeChar.inventory) { alert('⚠️ 请先选择角色'); return; }
                // 弹窗文案：满血回复型道具特别提示；其余附带效果描述
                var msg;
                if (cfg.heal && (activeChar.hp || 0) >= (activeChar.hpMax || 0)) {
                    msg = '您现在状态完好无损，确定要使用' + itemName + '吗？';
                } else {
                    msg = '确定要使用' + itemName + '吗？';
                    if (cfg.desc) msg += '<br><span style="color:#b0d4f0;font-size:0.72rem;">（' + cfg.desc + '）</span>';
                }
                showConfirmPopup(msg, function() {
                    // 驱寒药膏走既有全套逻辑（扣减/严寒/抵抗）
                    if (cfg.ointment) {
                        doUseOintment();
                        refreshBagUseUI();
                        return;
                    }
                    applyUseBackpackItem(itemName, cfg);
                });
            }

            // 使用物品后的 UI 刷新（生存面板/角色面板/营地各背包）
            // 每步独立 try-catch：单步失败不影响其他区域刷新
            function refreshBagUseUI() {
                try { updateSurvivalUI(); } catch (e) { console.error('[北境] updateSurvivalUI 刷新失败:', e); }
                // 探索页角色面板：仅角色有效且面板存在时渲染
                // （renderCharDetail 对无效 id 会把 activeChar 置 null，必须先守卫）
                try {
                    if (typeof renderCharDetail === 'function' && activeCharId && charData[activeCharId]
                        && document.getElementById('charDetailContainer')) {
                        renderCharDetail(activeCharId);
                    }
                } catch (e) { console.error('[北境] renderCharDetail 刷新失败:', e); }
                try {
                    if (document.getElementById('campCharDetail')) renderCampCharSheet();
                } catch (e) { console.error('[北境] renderCampCharSheet 刷新失败:', e); }
                try {
                    if (window.NORTH_CAMP) {
                        if (window.NORTH_CAMP.refreshAllShopBackpacks) window.NORTH_CAMP.refreshAllShopBackpacks();
                        if (window.NORTH_CAMP.storageRender) window.NORTH_CAMP.storageRender();
                    }
                } catch (e) { console.error('[北境] 营地背包刷新失败:', e); }
            }

            // 长休消耗：4燃料 + 2口粮/食物（优先口粮）
            function consumeRestCosts() {
                var fuelPriority = ['firewood','pine_branch','resin','glow_moss','iron_resin'];
                var need = 4;
                for (var fi=0; fi<fuelPriority.length && need>0; fi++) {
                    var fk = fuelPriority[fi];
                    var val = (survival.fuel[fk]||0) * (fk==='iron_resin'?2:1);
                    if (val<=0) continue;
                    if (val >= need) {
                        var realConsume = (fk==='iron_resin') ? Math.ceil(need/2) : need;
                        survival.fuel[fk] -= realConsume;
                        // 同步扣减背包
                        consumeFuelFromInventory(fk, realConsume);
                        need=0; break;
                    } else { need-=val;
                        var all = survival.fuel[fk];
                        survival.fuel[fk]=0;
                        consumeFuelFromInventory(fk, all); }
                }
                var rationUsed = Math.min(survival.rations, 2);
                survival.rations -= rationUsed;
                var foodNeeded = 2 - rationUsed;
                if (foodNeeded>0 && activeChar && activeChar.inventory) {
                    ['浆果/野菜','兽肉'].forEach(function(fn) {
                        if (foodNeeded<=0) return;
                        for (var si=0; si<activeChar.inventory.length; si++) {
                            if (foodNeeded<=0) break;
                            if (activeChar.inventory[si].name===fn && activeChar.inventory[si].qty>0) {
                                var use = Math.min(activeChar.inventory[si].qty, foodNeeded);
                                activeChar.inventory[si].qty-=use;
                                foodNeeded-=use;
                                if (activeChar.inventory[si].qty<=0) activeChar.inventory.splice(si,1);
                            }
                        }
                    });
                }
                var msg = '🛌 长休消耗：4燃料';
                if (rationUsed>0) msg+='+'+rationUsed+'口粮';
                if ((2-rationUsed-foodNeeded)>0) msg+='+'+(2-rationUsed-foodNeeded)+'食物';
                addSystemLog(msg, 'system');
            }

            // =========================================================================
            // 十一、生存操作
            // =========================================================================

            function doOrient() {
                if (checkKnockdown()) return;
                if (!survival.isLost) { addSystemLog('🧭 当前未迷失，无需方向判断', 'system'); return; }
                let dc = 15; // 方向判断固定DC15
                let bonus = 0;
                if (activeChar) {
                    const wisMod = abilityMod(activeChar.wis);
                    const hasProf = (activeChar.skillProfs || {})['生存'] || (activeChar.saveProfs || {})['感知'];
                    bonus = wisMod + (hasProf ? (activeChar.profBonus || 0) : 0);
                }
                const roll = rand(20) + bonus;
                const success = roll >= dc;
                if (success) {
                    survival.isLost = false;
                    survival.lostEventsRemaining = 0;
                    survival.lostDcPenalty = 0;
                    addSystemLog(`🧭 方向判断成功！迷失状态已解除 (DC${dc}, 骰出 ${roll})`, 'success');
                } else {
                    addSystemLog(`🧭 方向判断失败 (DC${dc}, 骰出 ${roll})，迷失持续`, 'danger');
                }
                // 视为一次事件，触发生存检定
                rollCount++;
                document.getElementById('rollCounter').textContent = `掷表 ${rollCount} 次`;
                survival.totalEvents++;
                advanceTime(1);
                window.NORTH_SURVIVAL.checkCold(); window.NORTH_SURVIVAL.checkRation(); window.NORTH_SURVIVAL.checkStarvation(); window.NORTH_SURVIVAL.checkOrient(); window.NORTH_SURVIVAL.checkFuel();
                updateSurvivalUI();
            }

            function doLight() {
                if (checkKnockdown()) return;
                const fuelTypes = [];
                if (survival.fuel.firewood > 0) fuelTypes.push({ key: 'firewood', label: '柴火/石块' });
                if (survival.fuel.pine_branch > 0) fuelTypes.push({ key: 'pine_branch', label: '松枝' });
                if (survival.fuel.resin > 0) fuelTypes.push({ key: 'resin', label: '松脂' });
                if (survival.fuel.iron_resin > 0) fuelTypes.push({ key: 'iron_resin', label: '铁松松脂' });
                if (survival.fuel.glow_moss > 0) fuelTypes.push({ key: 'glow_moss', label: '荧光苔' });

                if (fuelTypes.length === 0) { addSystemLog('🔥 没有可用燃料', 'warning'); return; }

                // 简单选择第一个可用燃料
                const choice = fuelTypes[0];
                survival.fuel[choice.key]--;
                consumeFuelFromInventory(choice.key, 1);
                survival.lightActive = true;
                survival.lightType = choice.label;
                survival.lightRemaining = 2;
                addSystemLog(`🔥 点燃 ${choice.label}，持续2次事件`, 'success');
                if (survival.coldLevel > 0) {
                    survival.coldLevel = Math.max(0, survival.coldLevel - 1);
                    addSystemLog('❄️ 生火取暖，解除1级严寒', 'success');
                }
                updateSurvivalUI();
            }

            function doConsumeRation() {
                if (checkKnockdown()) return;

                // 优先消耗口粮
                if (survival.rations > 0) {
                    survival.rations--;
                    survival.isStarving = false;
                    survival.starvationCount = 0;
                    // 恢复少量HP
                    if (activeChar) {
                        const heal = rollDiceExpr('1d4') + 2;
                        activeChar.hp = Math.min(activeChar.hp + heal, activeChar.hpMax);
                        renderCharDetail(activeCharId);
                        addSystemLog(`🍖 进食口粮，恢复 ${heal} HP（剩余口粮: ${survival.rations}）`, 'success');
                    } else {
                        addSystemLog(`🍖 消耗1份口粮，剩余 ${survival.rations} 份`, 'system');
                    }
                } else if (activeChar && activeChar.inventory) {
                    // 无口粮但背包有食物，消耗背包食物
                    var foodItems = ['浆果/野菜','兽肉'];
                    var consumed = false;
                    for (var fi = 0; fi < foodItems.length; fi++) {
                        for (var si = 0; si < activeChar.inventory.length; si++) {
                            if (activeChar.inventory[si].name === foodItems[fi] && activeChar.inventory[si].qty > 0) {
                                activeChar.inventory[si].qty--;
                                survival.isStarving = false;
                                survival.starvationCount = 0;
                                if (activeChar) {
                                    const heal = rollDiceExpr('1d4') + 2;
                                    activeChar.hp = Math.min(activeChar.hp + heal, activeChar.hpMax);
                                    renderCharDetail(activeCharId);
                                    addSystemLog(`🍖 进食${foodItems[fi]}，恢复 ${heal} HP，断粮状态解除`, 'success');
                                }
                                if (activeChar.inventory[si].qty <= 0) activeChar.inventory.splice(si, 1);
                                consumed = true;
                                break;
                            }
                        }
                        if (consumed) break;
                    }
                    if (!consumed) {
                        addSystemLog('🍖 没有口粮或食物可食用', 'warning');
                    }
                } else {
                    addSystemLog('🍖 没有口粮或食物可食用', 'warning');
                }
                updateSurvivalUI();
                return true;
            }

            function doCamp() {
                if (checkKnockdown()) return;
                addSystemLog('⛺ 扎营休息... (短休效果)', 'system');
                var restOk = shortRest();
                if (!restOk) return;
                // 设置庇护所状态（简易营地）
                if (!survival.isInShelter) {
                    survival.isInShelter = true;
                    survival.shelterType = 'camp';
                    addSystemLog('⛺ 搭建临时营地，获得基本庇护', 'system');
                    updateSurvivalUI();
                }
            }

            // =========================================================================
            // 十二、角色管理
            // =========================================================================

            function renderCharSelect() {
                const options = Object.keys(charData).map(id => ({ value: id, name: charData[id].name }));
                // 探索页角色选择器
                const current = charSelect.value;
                charSelect.innerHTML = '<option value="">— 选择角色 —</option>' +
                    options.map(o => `<option value="${o.value}">${o.name}</option>`).join('');
                if (current && charData[current]) charSelect.value = current;
                if (!charSelect.value && options.length) {
                    charSelect.value = options[0].value;
                    renderCharDetail(options[0].value);
                } else if (charSelect.value) {
                    renderCharDetail(charSelect.value);
                }
                // 营地角色选择器
                const campSel = document.getElementById('campCharSelect');
                if (campSel) {
                    const campCur = campSel.value;
                    campSel.innerHTML = '<option value="">— 选择角色 —</option>' +
                        options.map(o => `<option value="${o.value}">${o.name}</option>`).join('');
                    if (campCur && charData[campCur]) campSel.value = campCur;
                    else if (!campCur && options.length) campSel.value = options[0].value;
                }
            }

            // =========================================================================
            // 十三、初始化
            // =========================================================================

            // ━━ 视频开幕：播完一遍后内容淡入 ━━
            let _introDone = false;
            const bgVideo = document.getElementById('bgVideo');
            const appContainer = document.querySelector('.app-container');

            var _northUsername = '';
            var _northUserId = null;
            var _advAvatarUrl = '';   // 冒险者头像（徽章）URL，随存档保存

            // 应用冒险者头像：有 URL 显示图片，无则恢复默认徽章 🐺
            function applyAdvAvatar() {
                const av = document.getElementById('advAvatar');
                if (!av) return;
                if (_advAvatarUrl) {
                    av.style.backgroundImage = 'url(' + _advAvatarUrl + ')';
                    av.textContent = '';
                } else {
                    av.style.backgroundImage = '';
                    av.textContent = '🐺';
                }
            }

            // 上传冒险者头像（徽章）→ 保存 URL → 触发自动存档
            function uploadAdvAvatar(file) {
                if (!file) return;
                var fd = new FormData();
                fd.append('avatar', file);
                fetch('/api/north/avatar', { method: 'POST', body: fd }).then(function(r){ return r.json(); }).then(function(d){
                    if (d.ok && d.url) {
                        _advAvatarUrl = d.url + '?t=' + Date.now();
                        applyAdvAvatar();
                        addSystemLog('🖼️ 冒险者头像（徽章）已更新', 'success');
                        // 头像变更触发自动存档（未登录仅会话内生效）
                        clearTimeout(addSystemLog._saveTimer);
                        addSystemLog._saveTimer = setTimeout(saveNorthToServer, 2000);
                    } else {
                        alert('头像上传失败：' + (d.error || '未知错误'));
                    }
                }).catch(function(){
                    alert('头像上传失败：网络错误');
                });
            }

            function showContent() {
                if (_introDone) return;
                _introDone = true;
                if (appContainer) appContainer.classList.add('visible');
                if (bgVideo) { bgVideo.loop = true; bgVideo.play().catch(function() {}); }
                var sp = document.getElementById('soundPrompt');
                if (sp) sp.classList.add('hidden');
                // 显示用户名输入弹窗
                setTimeout(showNameDialog, 300);
            }

            var _nameDialogShown = false;
            function showNameDialog() {
                if (_nameDialogShown) return;
                fetch('/api/auth/me').then(function(r){return r.json();}).then(function(d){
                    if (d.ok && d.user) {
                        _northUserId = d.user.id;
                        fetch('/api/north/load?save_name=auto').then(function(r){return r.json();}).then(function(sd){
                            if (sd.ok && sd.save_data && sd.save_data._northName) {
                                // 有存档记录 → 跳过弹窗，直接恢复
                                _nameDialogShown = true;
                                _northUsername = sd.save_data._northName;
                                document.getElementById('charNameInHeader').textContent = '· ' + _northUsername;
                                document.getElementById('campCharNameInHeader').textContent = '· ' + _northUsername;
                                loadNorthFromServer();
                            } else {
                                _nameDialogShown = true;
                                showNameInput(d.user.username);
                            }
                        }).catch(function(){ _nameDialogShown = true; showNameInput(d.user.username); });
                    }
                }).catch(function(){});
            }

            function showNameInput(defaultName) {
                var overlay = document.createElement('div');
                overlay.id = '__name_overlay';
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
                var card = document.createElement('div');
                card.style.cssText = 'background:#12122a;border:2px solid #e94460;border-radius:16px;padding:28px 24px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(233,68,96,0.3);';
                var title = _northUserId ? '已绑定官网账号：' + defaultName : '输入冒险者名称';
                card.innerHTML = '<h2 style=\"color:#ffd700;margin-bottom:6px;font-size:1.1rem;\">❄️ ' + title + '</h2>' +
                    '<p style=\"color:#888;font-size:0.75rem;margin-bottom:16px;\">' + (_northUserId ? '已关联您的官网账号，可修改冒险者显示名' : '未登录官网，将作为本地冒险者') + '</p>' +
                    '<input type=\"text\" id=\"__name_input\" value=\"' + defaultName + '\" placeholder=\"冒险者名称\" maxlength=\"20\" style=\"width:100%;padding:10px 14px;background:#0a0a14;border:1px solid #2a2a40;border-radius:8px;color:#e0e0e0;font-size:0.95rem;text-align:center;box-sizing:border-box;margin-bottom:12px;\">' +
                    '<button id=\"__name_btn\" style=\"width:100%;padding:12px;background:#e94460;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:1rem;font-weight:bold;\">⚔️ 进入北境</button>';
                overlay.appendChild(card);
                document.body.appendChild(overlay);
                var inp = document.getElementById('__name_input');
                inp.focus(); inp.select();
                inp.addEventListener('keydown', function(e){ if(e.key==='Enter') confirmName(); });
                document.getElementById('__name_btn').addEventListener('click', confirmName);
                function confirmName() {
                    var n = inp.value.trim();
                    if (!n) { inp.style.borderColor = '#f44336'; return; }
                    var btn = document.getElementById('__name_btn');
                    btn.disabled = true; btn.textContent = '⏳ 保存中...';
                    _northUsername = n;
                    document.getElementById('charNameInHeader').textContent = '· ' + n;
                    document.getElementById('campCharNameInHeader').textContent = '· ' + n;
                    if (_northUserId) {
                        // 先保存名字到服务器，确保刷新后能识别
                        fetch('/api/north/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ save_name: 'auto', save_data: { _northName: n } }),
                        }).then(function() {
                            overlay.remove();
                            loadNorthFromServer();
                        }).catch(function() {
                            overlay.remove();
                        });
                    } else {
                        overlay.remove();
                    }
                }
            }

            // ━━ 公会修改冒险者名（首次进入输入的名字可随时修改）━━
            window.northRenameAdventurer = async function() {
                const current = _northUsername || '';
                const newName = await showPromptDialog('修改冒险者名称：', {defaultValue: current});
                if (newName === null) return;
                const n = newName.trim();
                if (!n) { alert('冒险者名称不能为空'); return; }
                if (n.length > 20) { alert('名称最多 20 个字符'); return; }
                _northUsername = n;
                document.getElementById('charNameInHeader').textContent = '· ' + n;
                document.getElementById('campCharNameInHeader').textContent = '· ' + n;
                const advEl = document.getElementById('guildAdventurerName');
                if (advEl) advEl.textContent = n;
                if (_northUserId) {
                    // 已登录：先加载现有存档，合并名字后保存（防止覆盖整个存档）
                    fetch('/api/north/load?save_name=auto').then(function(r){ return r.json(); }).then(function(sd){
                        const saveData = (sd.ok && sd.save_data) ? sd.save_data : {};
                        saveData._northName = n;
                        return fetch('/api/north/save', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ save_name: 'auto', save_data: saveData })
                        });
                    }).then(function(){ alert('✅ 冒险者名已修改为：' + n); })
                      .catch(function(){ alert('✅ 已修改（但保存到服务器失败，刷新后可能恢复旧名）'); });
                } else {
                    alert('✅ 冒险者名已修改为：' + n + '（未登录官网，仅本次会话生效）');
                }
            };

            // 老访客快速进入：有存档或已登录 → 跳过开幕视频
            fetch('/api/auth/me').then(function(r){return r.json();}).then(function(d){
                if (d.ok && d.user) {
                    fetch('/api/north/load?save_name=auto').then(function(r){return r.json();}).then(function(sd){
                        if (sd.ok && sd.save_data) { showContent(); }
                    }).catch(function(){});
                }
            }).catch(function(){});

            if (bgVideo) {
                bgVideo.addEventListener('ended', function() {
                    showContent();
                });
                bgVideo.addEventListener('error', showContent);
                bgVideo.addEventListener('click', showContent);
                bgVideo.style.cursor = 'pointer';
            }
            document.addEventListener('click', function _earlySkip(e) {
                if (_introDone) { document.removeEventListener('click', _earlySkip); return; }
                if (e.target.closest('#soundPrompt')) return;
                showContent();
            });

            setTimeout(showContent, 8000);

            // 防护：确保 app-container 的 pointer-events 不因异常丢失
            document.addEventListener('click', function() {
                if (appContainer && !appContainer.classList.contains('visible')) {
                    appContainer.classList.add('visible');
                }
                // 清除可能残留的3D骰子遮罩
                var diceOverlay = document.getElementById('dice3dOverlay');
                if (diceOverlay && diceOverlay.style.display === 'flex' && diceOverlay.dataset.done) {
                    diceOverlay.style.display = 'none';
                }
            }, true);
            // 防护：鼠标抬起后清除文本选择，防止浏览器卡在选择模式
            document.addEventListener('mouseup', function() {
                var sel = window.getSelection();
                if (sel && !sel.isCollapsed) {
                    setTimeout(function() { sel.removeAllRanges(); }, 50);
                }
            });

            // ━━ 声音开关 ━━
            let _soundOn = false;
            // 5秒后自动隐藏声音提示
            setTimeout(function() {
                const sp = document.getElementById('soundPrompt');
                if (sp && !_soundOn) sp.classList.add('hidden');
            }, 5000);
            window.toggleNorthSound = function() {
                const prompt = document.getElementById('soundPrompt');
                const soundBtn = document.getElementById('soundToggleBtn');
                _soundOn = !_soundOn;
                bgVideo.muted = !_soundOn;
                if (_soundOn) {
                    bgVideo.play().catch(function(){});
                    if (prompt) prompt.classList.add('hidden');
                    if (soundBtn) soundBtn.textContent = '🔊';
                } else {
                    if (soundBtn) soundBtn.textContent = '🔇';
                }
            };

            // ━━ 背景视频暂停/播放 ━━
            window.toggleBgVideo = function() {
                const btn = document.getElementById('videoToggleBtn');
                if (!bgVideo) return;
                if (bgVideo.paused) {
                    bgVideo.play().catch(function(){});
                    if (btn) btn.textContent = '⏯️';
                } else {
                    bgVideo.pause();
                    if (btn) btn.textContent = '▶️';
                }
            };

            function init() {
                renderEvents();
                renderCharSelect();
                renderStats();
                renderDisplayLog();
                updateSurvivalUI();
                // 公会标签：探索/营地头衔徽章初始渲染（等级基于存档 statsData，随登录账号恢复）
                window.NORTH_GUILD.updateRankUI();

                document.getElementById('clearOutputBtn').addEventListener('click', clearDisplay);
                document.getElementById('exportSaveBtn').addEventListener('click', exportSave);
                document.getElementById('importSaveBtn').addEventListener('click', function() {
                    document.getElementById('importFileInput').click();
                });
                document.getElementById('importFileInput').addEventListener('change', importSave);
                // Excel 导入
                document.getElementById('importExcelBtn').addEventListener('click', function() {
                    document.getElementById('excelFileInput').click();
                });
                document.getElementById('excelFileInput').addEventListener('change', importFromExcel);
                const csb = document.getElementById('clearStatsBtn');
                if (csb) csb.addEventListener('click', clearStats);

                charSelect.addEventListener('change', function() {
                    if (this.value) {
                        // 探索中锁定角色切换：回到营地或昏迷倒下后才可切换
                        if (!canSwitchChar()) {
                            addSystemLog('🚫 探索中无法切换角色，请先返回营地', 'warning');
                            this.value = activeCharId || '';
                            return;
                        }
                        renderCharDetail(this.value);
                        // 同步到营地界面
                        var campSel = document.getElementById('campCharSelect');
                        if (campSel) { campSel.value = this.value; renderCampCharDetail(this.value); }
                    }
                });

                // 冒险者头像（徽章）上传：点击头像 → 选择图片 → 上传并展示
                const advAvatarEl = document.getElementById('advAvatar');
                const advAvatarInput = document.getElementById('advAvatarInput');
                if (advAvatarEl && advAvatarInput) {
                    advAvatarEl.addEventListener('click', function() {
                        advAvatarInput.click();
                    });
                    advAvatarInput.addEventListener('change', function() {
                        uploadAdvAvatar(this.files && this.files[0]);
                        this.value = '';
                    });
                }
                applyAdvAvatar();

                document.getElementById('healBtn').addEventListener('click', async function() {
                    const amount = await showPromptDialog('输入治疗量（正数）:', {defaultValue: '5'});
                    if (amount !== null) adjustHp(parseInt(amount) || 0);
                });
                document.getElementById('damageBtn').addEventListener('click', async function() {
                    const amount = await showPromptDialog('输入伤害量（正数）:', {defaultValue: '3'});
                    if (amount !== null) adjustHp(-(parseInt(amount) || 0));
                });

                // 生存操作
                document.getElementById('orientBtn').addEventListener('click', doOrient);
                document.getElementById('lightBtn').addEventListener('click', doLight);
                document.getElementById('consumeRationBtn').addEventListener('click', doConsumeRation);
                document.getElementById('useOintmentBtn').addEventListener('click', doUseOintment);
                document.getElementById('usePotionBtn').addEventListener('click', function() { useBackpackItem('治疗药水'); });
                // 顶部标签切换
                const exploreView = document.getElementById('exploreView');
                const campView = document.getElementById('campView');
                const guildView = document.getElementById('guildView');
                const guildBg = document.getElementById('guildBg');
                const tavernPanel = document.getElementById('tavernPanel');
                const exploreTab = document.getElementById('exploreTab');
                const campTab = document.getElementById('campTab');
                const tavernTab = document.getElementById('tavernTab');
                const guildTab = document.getElementById('guildTab');

                /* ━━ 北境加载覆盖页 ━━ */
                var _northLoadingTimer=null;
                var NORTH_LOADING_CONFIG={
                  tavern:{bg:'/static/portal/loading_tavern.png',sub:'瑟伦瑞达酒馆',hint:'正在进入瑟伦瑞达酒馆...'},
                  camp:{bg:'/static/portal/loading_camp.png',sub:'冒险者营地',hint:'正在进入冒险者营地...'},
                  guild:{bg:'/static/portal/loading_guild.png',sub:'冒险者公会',hint:'正在进入冒险者公会...'}
                };
                function showNorthLoading(type,callback){
                  var cfg=NORTH_LOADING_CONFIG[type]||NORTH_LOADING_CONFIG['camp'];
                  var overlay=document.getElementById('northLoadingOverlay');
                  var bg=document.getElementById('northLoadingBg');
                  var bar=document.getElementById('northLoadingBarFill');
                  var sub=document.getElementById('northLoadingSub');
                  var hint=document.getElementById('northLoadingHint');
                  bg.style.backgroundImage='url('+cfg.bg+')';
                  sub.textContent=cfg.sub;
                  hint.textContent=cfg.hint;
                  bar.style.width='0%';
                  overlay.classList.remove('fade-out','hidden');
                  var start=Date.now();
                  var duration=1500;
                  if(_northLoadingTimer)clearInterval(_northLoadingTimer);
                  _northLoadingTimer=setInterval(function(){
                    var elapsed=Date.now()-start;
                    var pct=Math.min(100,Math.round((elapsed/duration)*100));
                    bar.style.width=pct+'%';
                    if(pct>=100){
                      clearInterval(_northLoadingTimer);
                      _northLoadingTimer=null;
                      setTimeout(function(){
                        overlay.classList.add('fade-out');
                        setTimeout(function(){
                          overlay.classList.add('hidden');
                          if(callback)callback();
                        },400);
                      },150);
                    }
                  },50);
                }

                function deactivateAll() {
                    exploreTab.classList.remove('active');
                    campTab.classList.remove('active');
                    tavernTab.classList.remove('active');
                    guildTab.classList.remove('active');
                    exploreView.style.display = 'none';
                    campView.style.display = 'none';
                    guildView.style.display = 'none';
                    guildBg.style.display = 'none';
                    tavernPanel.classList.remove('active');
                }
                function activateTab(tabName) {
                    if (tabName === 'camp') {
                        deactivateAll();
                        showNorthLoading('camp',function(){
                            campTab.classList.add('active'); campView.style.display = '';
                            var campSel = document.getElementById('campCharSelect');
                            if (campSel && campSel.value && charData[campSel.value]) {
                                activeCharId = campSel.value; activeChar = charData[activeCharId];
                            } else if (activeCharId && charData[activeCharId]) {
                                activeChar = charData[activeCharId];
                            }
                            renderStats(); renderCampCharSheet();
                            window.NORTH_CAMP.refreshAllShopBackpacks();
                            window.NORTH_CAMP.restoreShopBpState();
                            sessionStorage.setItem('north_active_tab', tabName);
                        });
                    } else if (tabName === 'tavern') {
                        deactivateAll();
                        showNorthLoading('tavern',function(){
                            tavernTab.classList.add('active'); tavernPanel.classList.add('active'); window.NORTH_TAVERN.refresh();
                            // 每次进入酒馆默认收拢左侧菜单
                            var tm = document.getElementById('tavernMenu');
                            if (tm) tm.classList.remove('open');
                            var tmBtn = document.getElementById('tavernMenuBtn');
                            if (tmBtn) tmBtn.classList.remove('in-menu');
                            sessionStorage.setItem('north_active_tab', tabName);
                        });
                    } else if (tabName === 'guild') {
                        deactivateAll();
                        showNorthLoading('guild',function(){
                            guildTab.classList.add('active'); guildBg.style.display = ''; guildView.style.display = '';
                            window.NORTH_GUILD.renderGuild();
                            sessionStorage.setItem('north_active_tab', tabName);
                        });
                    } else {
                        deactivateAll();
                        exploreTab.classList.add('active'); exploreView.style.display = '';
                        sessionStorage.setItem('north_active_tab', tabName);
                    }
                }
                exploreTab.addEventListener('click', function() { activateTab('explore'); });
                campTab.addEventListener('click', function() { activateTab('camp'); });
                tavernTab.addEventListener('click', function() { activateTab('tavern'); });
                guildTab.addEventListener('click', function() { activateTab('guild'); });

                // 刷新后立即恢复到上次的标签页
                var savedTab = sessionStorage.getItem('north_active_tab');
                if (savedTab && savedTab !== 'explore') {
                    activateTab(savedTab);
                }


                // ━━ 营地底部标签（补给站 / 工作间 / 仓库）━━
                // campStorage / shopBpCollapsed 已提升至全局作用域
                var bottomTabs = document.getElementById('campBottomTabs');
                if (bottomTabs) bottomTabs.addEventListener('click', function(e) {
                    var tab = e.target.closest('.camp-bottom-tab');
                    if (!tab) return;
                    var tabName = tab.dataset.bottomtab;
                    document.querySelectorAll('.camp-bottom-tab').forEach(function(t) { t.classList.remove('active'); });
                    tab.classList.add('active');
                    document.getElementById('supplyShop').style.display = tabName === 'supply' ? '' : 'none';
                    document.getElementById('craftingWorkshop').style.display = tabName === 'craft' ? '' : 'none';
                    document.getElementById('smithForge').style.display = tabName === 'smith' ? '' : 'none';
                    document.getElementById('alchemyLab').style.display = tabName === 'alchemy' ? '' : 'none';
                    document.getElementById('campStorage').style.display = tabName === 'storage' ? '' : 'none';
                    // 同步当前角色
                    var campSel = document.getElementById('campCharSelect');
                    if (campSel && campSel.value && charData[campSel.value]) {
                        activeCharId = campSel.value;
                        activeChar = charData[activeCharId];
                    }
                    if (tabName === 'craft') {
                        window.NORTH_CAMP.wsRenderBackpack();
                        window.NORTH_CAMP.wsRenderRecipes();
                    }
                    if (tabName === 'storage') {
                        window.NORTH_CAMP.storageRender();
                    }
                    if (tabName === 'supply' || tabName === 'smith' || tabName === 'alchemy') {
                        window.NORTH_CAMP.refreshAllShopBackpacks();
                    }
                    // 切换标签时重置封面（回到封面页）
                    ['supply','craft','smith','alchemy'].forEach(function(k) {
                        if (k !== tabName) window.NORTH_CAMP.resetWorkshopCover(k);
                    });
                });

                // ━━ 共享背包渲染（补给站/铁匠/炼金）━━
                // ━━ 背包渲染变化检测（无数据变化时跳过重绘，避免高频无谓 innerHTML 重建）━━
            // ━━ 营地系统上下文桥（north-camp.js 依赖，2026-08-17 第五次拆分）━━
            window.NORTH_CAMP_CTX = {};
            Object.defineProperty(window.NORTH_CAMP_CTX, 'activeChar', { get: function () { return activeChar; }, set: function (v) { activeChar = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'activeCharId', { get: function () { return activeCharId; }, set: function (v) { activeCharId = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'charData', { get: function () { return charData; }, set: function (v) { charData = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'survival', { get: function () { return survival; }, set: function (v) { survival = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'discoveredItems', { get: function () { return discoveredItems; }, set: function (v) { discoveredItems = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopFundsGP', { get: function () { return shopFundsGP; }, set: function (v) { shopFundsGP = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopFundsSP', { get: function () { return shopFundsSP; }, set: function (v) { shopFundsSP = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopFundsCP', { get: function () { return shopFundsCP; }, set: function (v) { shopFundsCP = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopCurrentStock', { get: function () { return shopCurrentStock; }, set: function (v) { shopCurrentStock = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopCurrentPrices', { get: function () { return shopCurrentPrices; }, set: function (v) { shopCurrentPrices = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopCaravanItems', { get: function () { return shopCaravanItems; }, set: function (v) { shopCaravanItems = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'caravanReturnCounter', { get: function () { return caravanReturnCounter; }, set: function (v) { caravanReturnCounter = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'shopBpCollapsed', { get: function () { return shopBpCollapsed; }, set: function (v) { shopBpCollapsed = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'campStorage', { get: function () { return campStorage; }, set: function (v) { campStorage = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'campStorageCoins', { get: function () { return campStorageCoins; }, set: function (v) { campStorageCoins = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'craftedItems', { get: function () { return craftedItems; }, set: function (v) { craftedItems = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsCraftSlots', { get: function () { return wsCraftSlots; }, set: function (v) { wsCraftSlots = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsBrewSlots', { get: function () { return wsBrewSlots; }, set: function (v) { wsBrewSlots = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltOre', { get: function () { return wsSmeltOre; }, set: function (v) { wsSmeltOre = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltCoal', { get: function () { return wsSmeltCoal; }, set: function (v) { wsSmeltCoal = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltBars', { get: function () { return wsSmeltBars; }, set: function (v) { wsSmeltBars = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltIngot', { get: function () { return wsSmeltIngot; }, set: function (v) { wsSmeltIngot = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltProgress', { get: function () { return wsSmeltProgress; }, set: function (v) { wsSmeltProgress = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsSmeltTimer', { get: function () { return wsSmeltTimer; }, set: function (v) { wsSmeltTimer = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsUnlockedRecipes', { get: function () { return wsUnlockedRecipes; }, set: function (v) { wsUnlockedRecipes = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsCraftResult', { get: function () { return wsCraftResult; }, set: function (v) { wsCraftResult = v; }, configurable: true });
            Object.defineProperty(window.NORTH_CAMP_CTX, 'wsBrewResult', { get: function () { return wsBrewResult; }, set: function (v) { wsBrewResult = v; }, configurable: true });
            window.NORTH_CAMP_CTX.showPopup = showPopup;
            window.NORTH_CAMP_CTX.addSystemLog = addSystemLog;
            window.NORTH_CAMP_CTX.fmtCoinHtml = fmtCoinHtml;
            window.NORTH_CAMP_CTX.renderCharDetail = renderCharDetail;
            window.NORTH_CAMP_CTX.renderCampCharSheet = renderCampCharSheet;
            window.NORTH_CAMP_CTX.findWpNum = findWpNum;
            window.NORTH_CAMP_CTX.useBackpackItem = useBackpackItem;

                // ━━ 皮革旧书系统 ━━
                // 状态变量已移至全局（bookOpen, activeBookTab, bookPages, currentPageIdx）

                window.openBook = function() {
                    bookOpen = true;
                    document.getElementById('bookCover').classList.add('opened');
                    document.getElementById('bookOpen').classList.add('visible');
                    renderBookContent();
                };
                window.closeBook = function() {
                    bookOpen = false;
                    document.getElementById('bookCover').classList.remove('opened');
                    document.getElementById('bookOpen').classList.remove('visible');
                };

                // 书页标签切换
                document.querySelector('.book-page-header').addEventListener('click', function(e) {
                    const tab = e.target.closest('.book-tab');
                    if (!tab) return;
                    const tabName = tab.dataset.booktab;
                    if (!tabName) return;
                    activeBookTab = tabName;
                    document.querySelectorAll('.book-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    if (tabName === 'journal') currentPageIdx = 0;
                    renderBookContent();
                });

                // 渲染右页：事件详情统计
                function renderBookDetail(table, event) {
                    const rightEl = document.getElementById('bookRightContent');
                    if (!rightEl) return;
                    const groups = statsData.groups;
                    if (!groups[table]) { rightEl.innerHTML = '<div style="color:#6b5a3e;text-align:center;padding:2rem;">无数据</div>'; return; }
                    const evts = groups[table];
                    if (event) {
                        // 点击具体事件 → 显示该事件的详细统计
                        const cnt = evts[event] || 0;
                        let html = '<div style="padding:0.5rem;">';
                        html += `<div style="font-size:0.95rem;color:#4a3a22;font-weight:600;margin-bottom:0.3rem;">📋 ${event}</div>`;
                        html += `<div style="font-size:0.72rem;color:#6b5a3e;margin-bottom:0.5rem;">来源：${table}</div>`;
                        html += `<div style="font-size:0.85rem;color:#5a4a30;margin-bottom:0.5rem;">触发次数：<b style="color:#8b6914;">${cnt}</b> 次（占 ${((cnt / statsData.total) * 100).toFixed(1)}%）</div>`;
                        // 子结果详情
                        var subs = eventSubStats[event];
                        if (subs && Object.keys(subs).length > 0) {
                            var subEntries = Object.entries(subs).sort(function(a, b) { return b[1] - a[1]; });
                            var subMax = subEntries[0][1];
                            html += '<div style="margin-top:0.5rem;padding-top:0.4rem;border-top:1px solid rgba(0,0,0,0.1);">';
                            html += '<div style="font-size:0.72rem;color:#6b5a3e;margin-bottom:0.3rem;">📦 具体产出（' + subEntries.length + ' 种）</div>';
                            html += '<div style="max-height:350px;overflow-y:auto;">';
                            for (var si = 0; si < subEntries.length; si++) {
                                var s = subEntries[si];
                                var barW2 = Math.max(5, Math.round(s[1] / subMax * 60));
                                html += '<div style="display:flex;align-items:center;gap:0.3rem;padding:0.12rem 0;font-size:0.68rem;border-bottom:1px solid rgba(0,0,0,0.04);">';
                                html += '<span style="flex:0 0 auto;min-width:' + Math.max(40, Math.min(90, s[0].length * 9)) + 'px;color:#4a3a22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + s[0].replace(/"/g, '&quot;') + '">' + s[0] + '</span>';
                                html += '<span style="flex:1;height:8px;background:rgba(0,0,0,0.04);border-radius:3px;overflow:hidden;"><span style="display:block;height:100%;width:' + barW2 + '%;background:linear-gradient(90deg,rgba(100,140,180,0.35),rgba(100,140,180,0.65));border-radius:3px;"></span></span>';
                                html += '<span style="flex:0 0 auto;min-width:24px;text-align:right;color:#5a7a9a;font-weight:600;">' + s[1] + '</span>';
                                html += '</div>';
                            }
                            html += '</div></div>';
                        } else {
                            html += '<div style="font-size:0.68rem;color:#7a6a5a;margin-top:0.5rem;font-style:italic;">（无子事件产出记录）</div>';
                        }
                        html += '</div>';
                        rightEl.innerHTML = html;
                    } else {
                        // 点击表分组 → 显示该表下所有事件的列表
                        const entries = Object.entries(evts).sort((a, b) => b[1] - a[1]);
                        const tCount = entries.reduce((a, b) => a + b[1], 0);
                        let html = '<div style="padding:0.3rem;">';
                        html += `<div style="font-size:0.95rem;color:#4a3a22;font-weight:600;margin-bottom:0.2rem;">📊 ${table}</div>`;
                        html += `<div style="font-size:0.72rem;color:#6b5a3e;margin-bottom:0.5rem;">共 <b style="color:#8b6914;">${tCount}</b> 次事件（${entries.length} 种）</div>`;
                        html += '<div style="max-height:420px;overflow-y:auto;">';
                        // 简易柱状图
                        const maxCnt = entries.length > 0 ? entries[0][1] : 1;
                        for (const [ev, cnt] of entries) {
                            const pct = Math.round(cnt / maxCnt * 100);
                            const barW = Math.max(5, Math.round(cnt / maxCnt * 60));
                            html += `<div style="display:flex;align-items:center;gap:0.3rem;padding:0.15rem 0;font-size:0.7rem;border-bottom:1px solid rgba(0,0,0,0.04);">`;
                            html += `<span style="flex:0 0 auto;min-width:${Math.max(50, Math.min(100, ev.length*10))}px;color:#5a4a30;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${ev.replace(/"/g,'&quot;')}">${ev}</span>`;
                            html += `<span style="flex:1;height:9px;background:rgba(0,0,0,0.04);border-radius:3px;overflow:hidden;"><span style="display:block;height:100%;width:${barW}%;background:linear-gradient(90deg,rgba(139,105,20,0.4),rgba(139,105,20,0.7));border-radius:3px;"></span></span>`;
                            html += `<span style="flex:0 0 auto;min-width:28px;text-align:right;color:#8b6914;font-weight:600;">${cnt}</span>`;
                            html += '</div>';
                        }
                        html += '</div></div>';
                        rightEl.innerHTML = html;
                    }
                }

                function renderBookContent() {
                    const leftEl = document.getElementById('bookPageContent');
                    const rightEl = document.getElementById('bookRightContent');
                    const pageNum = document.getElementById('bookPageNum');
                    if (!leftEl || !rightEl || !pageNum) return;

                    if (activeBookTab === 'notes') {
                        // 冒险者笔记
                        pageNum.textContent = '';
                        const groups = statsData.groups;
                        const keys = Object.keys(groups);
                        if (keys.length === 0) {
                            leftEl.innerHTML = '<div class="book-stats bs-empty">尚无冒险记录<br><small>开始探索后在此记录</small></div>';
                            rightEl.innerHTML = '<div style="color:#6b5a3e;text-align:center;padding:2rem;font-style:italic;">—— 冒险仍在继续 ——</div>';
                        } else {
                            let h = '<div class="book-stats">';
                            let total = 0;
                            for (const table of keys) {
                                const evts = groups[table];
                                const tCount = Object.values(evts).reduce((a,b) => a+b, 0);
                                total += tCount;
                                var escAttr = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
                                h += `<div class="bs-group book-clickable" data-book-table="${escAttr(table)}" style="cursor:pointer;">${table} <span style="font-weight:300;font-size:0.65rem;">(${tCount})</span></div>`;
                                for (const [ev, cnt] of Object.entries(evts)) {
                                    h += `<div class="bs-item book-clickable" data-book-table="${escAttr(table)}" data-book-event="${escAttr(ev)}" style="cursor:pointer;"><span>${ev}</span><span>${cnt}</span></div>`;
                                }
                            }
                            h += `<div style="margin-top:0.4rem;font-weight:600;">总计: ${total} 次事件</div>`;
                            h += '</div>';
                            leftEl.innerHTML = h;
                            const stEl = document.getElementById('statTotal');
                            if (stEl) stEl.textContent = total + ' 次';

                            // 绑定点击事件
                            leftEl.querySelectorAll('.book-clickable').forEach(function(el) {
                                el.addEventListener('click', function(e) {
                                    // 高亮当前选中
                                    leftEl.querySelectorAll('.book-clickable').forEach(function(x) { x.classList.remove('book-selected'); });
                                    el.classList.add('book-selected');
                                    const table = el.dataset.bookTable;
                                    const event = el.dataset.bookEvent;
                                    renderBookDetail(table, event);
                                });
                            });
                        }
                        // 首次打开或没有选中项时显示默认右页
                        if (!leftEl.querySelector('.book-selected')) {
                            rightEl.innerHTML = '<div style="color:#6b5a3e;text-align:center;padding:2rem;font-style:italic;">点击左侧事件<br>查看详情</div>';
                        }
                    } else if (activeBookTab === 'rules') {
                        // 雪域生存法则
                        pageNum.textContent = '';
                        const rules = [
                            { icon:'❄️', title:'严寒考验', text:'每完成3次事件进行体质豁免。基准DC12，庇护所DC10，暴风雪DC15。具有体质豁免熟练可加上熟练加值。失败严寒+1（最高3级），体质检定-N。庇护所长休解除全部严寒，短休解除1级。驱寒药膏、天然温泉可解除1级。' },
                            { icon:'🍖', title:'口粮消耗', text:'每4次事件消耗1份口粮，庇护所内暂停。断粮后：体质豁免劣势、长休恢复减半、移速-10尺；每3次事件仍无口粮则损失1d4生命。浆果1d2份、猎人小屋1d4份、兽肉2d2份。进食解除断粮。' },
                            { icon:'🧭', title:'方向感迷失', text:'每5次事件进行感知或生存检定，DC12起步。熟练可加值。迷失后深入雪原和返回无效。持续2次事件，每次DC+1（上限DC15）。方向判断DC15成功可重置。发现踪迹自动解除。' },
                            { icon:'🔥', title:'火源与照明', text:'无光源时夜间攻击劣势。燃料：松枝/松脂/荧光苔/铁松松脂/煤矿/柴火，每份2次事件，庇护所内不消耗。暴风雪仅荧光苔和铁松松脂可用。原地休整需消耗燃料才能进行。' },
                            { icon:'⛺', title:'休息规则', text:'原地休整点击后在事件回响中选择长休或短休。长休需4燃料+2口粮/食物，恢复满HP+解除全部严寒；短休可用火把（激活效果不消耗）或1燃料，恢复1d8+体调HP。火把短休消除2级严寒+免疫2次严寒检定；燃料短休解除1级严寒。' },
                        ];
                        leftEl.innerHTML = '<div class="book-rules">' + rules.map(r =>
                            `<div class="br-item"><b>${r.icon} ${r.title}</b><p>${r.text}</p></div>`
                        ).join('') + '</div>';
                        rightEl.innerHTML = '<div style="color:#5a4a30;text-align:center;padding:2rem;font-style:italic;font-size:0.8rem;">❄️<br>铭记这些规则<br>它们将决定你的生死<br>—— 北境旅人</div>';
                    } else if (activeBookTab === 'journal') {
                        const page = bookPages[currentPageIdx] || { title: '', content: '' };
                        pageNum.textContent = `第 ${currentPageIdx+1} / ${bookPages.length} 页`;

                        // 左页：目录 + 底部固定翻页
                        var tocHtml = '<div style="display:flex;flex-direction:column;height:100%;">';
                        tocHtml += '<div style="font-size:0.72rem;font-weight:700;color:#3d2e16;margin-bottom:0.3rem;padding-bottom:0.2rem;border-bottom:2px solid rgba(0,0,0,0.1);">📑 目录</div>';
                        tocHtml += '<div style="flex:1;overflow-y:auto;font-size:0.7rem;min-height:0;">';
                        for (var ti = 0; ti < bookPages.length; ti++) {
                            var bp = bookPages[ti];
                            var isActive = ti === currentPageIdx;
                            tocHtml += '<div class="journal-toc-item' + (isActive ? ' journal-toc-active' : '') + '" data-idx="' + ti + '" style="display:flex;align-items:center;gap:0.35rem;padding:0.25rem 0.3rem;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.04);' + (isActive ? 'background:rgba(0,0,0,0.06);font-weight:600;' : '') + '">';
                            tocHtml += '<span style="color:#8a7a5a;font-size:0.6rem;min-width:20px;">' + (ti+1) + '.</span>';
                            tocHtml += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4a3a22;">' + (bp.title || '(无标题)') + '</span>';
                            tocHtml += '</div>';
                        }
                        tocHtml += '</div>';
                        // 底部固定：操作按钮
                        tocHtml += '<div style="flex-shrink:0;border-top:1px solid rgba(0,0,0,0.08);padding-top:0.3rem;">';
                        tocHtml += '<div style="display:flex;gap:0.25rem;flex-wrap:wrap;margin-bottom:0.3rem;">';
                        tocHtml += '<button id="journalAddBtn2" style="background:rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.3);color:#2d1a0a;padding:0.2rem 0.6rem;border-radius:3px;font-size:0.65rem;cursor:pointer;font-family:inherit;font-weight:600;">+ 新页</button>';
                        tocHtml += '<button id="journalBatchDelBtn2" style="background:rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.3);color:#6b2020;padding:0.2rem 0.6rem;border-radius:3px;font-size:0.65rem;cursor:pointer;font-family:inherit;font-weight:600;">🗑 删此页</button>';
                        tocHtml += '<button id="journalBatchDelAllBtn" style="background:rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.3);color:#6b2020;padding:0.2rem 0.6rem;border-radius:3px;font-size:0.65rem;cursor:pointer;font-family:inherit;font-weight:600;">🗑 批量删除</button>';
                        tocHtml += '</div>';
                        // 翻页导航
                        tocHtml += '<div style="display:flex;align-items:center;justify-content:center;gap:0.3rem;">';
                        tocHtml += '<button id="journalPrevBtn" style="background:rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.25);color:#2d1a0a;padding:0.15rem 0.5rem;border-radius:3px;font-size:0.65rem;cursor:pointer;font-family:inherit;font-weight:600;"' + (currentPageIdx===0?' disabled':'') + '>◀</button>';
                        tocHtml += '<input id="journalPageInput" type="number" min="1" max="' + bookPages.length + '" value="' + (currentPageIdx+1) + '" style="width:38px;background:rgba(0,0,0,0.08);border:1px solid rgba(0,0,0,0.2);color:#2d1a0a;padding:0.12rem;border-radius:3px;font-size:0.62rem;text-align:center;font-family:inherit;font-weight:600;">';
                        tocHtml += '<span style="font-size:0.62rem;color:#4a3a22;font-weight:600;">/ ' + bookPages.length + '</span>';
                        tocHtml += '<button id="journalNextBtn" style="background:rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.25);color:#2d1a0a;padding:0.15rem 0.5rem;border-radius:3px;font-size:0.65rem;cursor:pointer;font-family:inherit;font-weight:600;"' + (currentPageIdx>=bookPages.length-1?' disabled':'') + '>▶</button>';
                        tocHtml += '</div>';
                        tocHtml += '</div>';
                        tocHtml += '</div>';
                        leftEl.innerHTML = tocHtml;

                        // 绑定目录点击
                        setTimeout(function() {
                            leftEl.querySelectorAll('.journal-toc-item').forEach(function(el) {
                                el.addEventListener('click', function() {
                                    saveCurrentPage();
                                    currentPageIdx = parseInt(this.dataset.idx);
                                    renderBookContent();
                                });
                            });
                            var addBtn2 = document.getElementById('journalAddBtn2');
                            var delBtn2 = document.getElementById('journalBatchDelBtn2');
                            if (addBtn2) addBtn2.addEventListener('click', function() {
                                saveCurrentPage();
                                bookPages.push({ title: '新页面', content: '' });
                                currentPageIdx = bookPages.length - 1;
                                renderBookContent();
                            });
                            if (delBtn2) delBtn2.addEventListener('click', async function() {
                                if (bookPages.length <= 1) { alert('至少保留一页'); return; }
                                if (!await showConfirmDialog('确定删除当前第 '+(currentPageIdx+1)+' 页？')) return;
                                saveCurrentPage();
                                bookPages.splice(currentPageIdx, 1);
                                if (currentPageIdx >= bookPages.length) currentPageIdx = bookPages.length - 1;
                                renderBookContent();
                            });
                            var batchAll = document.getElementById('journalBatchDelAllBtn');
                            if (batchAll) batchAll.addEventListener('click', async function() {
                                saveCurrentPage();
                                var total = bookPages.length;
                                var range = await showPromptDialog('批量删除页面\n当前共 ' + total + ' 页\n请输入要删除的页码（如: 3-5 或 2,4,6）:', {defaultValue: ''});
                                if (!range) return;
                                var toRemove = [];
                                var parts = range.split(',');
                                for (var pi = 0; pi < parts.length; pi++) { var part = parts[pi];
                                    part = part.trim();
                                    if (part.indexOf('-') >= 0) {
                                        var rp = part.split('-');
                                        var s = parseInt(rp[0]), e = parseInt(rp[1]);
                                        if (!isNaN(s) && !isNaN(e)) for (var ri = Math.min(s,e); ri <= Math.max(s,e); ri++) toRemove.push(ri);
                                    } else {
                                        var n = parseInt(part);
                                        if (!isNaN(n)) toRemove.push(n);
                                    }
                                }
                                if (toRemove.length === 0) return;
                                if (toRemove.length >= total) { alert('不能删除所有页面，至少保留一页'); return; }
                                if (!await showConfirmDialog('确定删除以下 ' + toRemove.length + ' 页吗？\n页码: ' + toRemove.join(', ') + '\n此操作不可恢复。')) return;
                                toRemove.sort(function(a,b){return b-a;});
                                toRemove.forEach(function(n) { var idx = n - 1; if (idx >= 0 && idx < bookPages.length) bookPages.splice(idx, 1); });
                                if (currentPageIdx >= bookPages.length) currentPageIdx = bookPages.length - 1;
                                renderBookContent();
                            });
                            // 翻页导航
                            function goJournalPage(n) { saveCurrentPage(); currentPageIdx = Math.max(0, Math.min(n, bookPages.length - 1)); renderBookContent(); }
                            var pi = document.getElementById('journalPageInput');
                            var prev = document.getElementById('journalPrevBtn');
                            var next = document.getElementById('journalNextBtn');
                            if (pi) { pi.addEventListener('change', function() { var v = parseInt(this.value) - 1; if (!isNaN(v)) goJournalPage(v); }); pi.addEventListener('keydown', function(e) { if (e.key === 'Enter') { var v = parseInt(this.value) - 1; if (!isNaN(v)) goJournalPage(v); } }); }
                            if (prev) prev.addEventListener('click', function() { if (currentPageIdx > 0) goJournalPage(currentPageIdx - 1); });
                            if (next) next.addEventListener('click', function() { if (currentPageIdx < bookPages.length - 1) goJournalPage(currentPageIdx + 1); });
                        }, 50);

                        // 右页：内容编辑 + 保存按钮
                        rightEl.innerHTML = ''
                            + '<input class="book-journal-title" id="journalTitle" value="' + (page.title||'').replace(/"/g,'&quot;') + '" placeholder="标题..." maxlength="60">'
                            + '<textarea class="book-journal-text" id="journalText" placeholder="在此书写笔记...">' + (page.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>'
                            + '<div style="display:flex;gap:0.4rem;margin-top:0.3rem;align-items:center;">'
                            + '<button id="journalSaveBtn" style="background:rgba(60,120,60,0.15);border:1px solid #5a8a5a;color:#3a6a3a;padding:0.2rem 0.8rem;border-radius:3px;font-size:0.68rem;cursor:pointer;font-family:inherit;font-weight:600;">💾 保存笔记</button>'
                            + '<span id="journalSaveHint" style="font-size:0.58rem;color:#8a7a5a;"></span>'
                            + '</div>';
                        setTimeout(function() {
                            var jt = document.getElementById('journalTitle');
                            var jc = document.getElementById('journalText');
                            var saveBtn = document.getElementById('journalSaveBtn');
                            var hint = document.getElementById('journalSaveHint');
                            if (jt) jt.addEventListener('input', function() { if(hint)hint.textContent='● 未保存'; });
                            if (jc) jc.addEventListener('input', function() { if(hint)hint.textContent='● 未保存'; });
                            if (saveBtn) saveBtn.addEventListener('click', function() {
                                saveCurrentPage();
                                if (hint) hint.textContent = '✓ 已保存';
                                setTimeout(function() { if(hint)hint.textContent=''; }, 2000);
                            });
                        }, 100);
                    } else if (activeBookTab === 'gifts') {
                        // 雪原馈赠 — 展示所有获得过的物品
                        pageNum.textContent = '';
                        leftEl.innerHTML = '';
                        rightEl.innerHTML = '';
                        const wpItems = TABLES['wp'] ? TABLES['wp'].items : {};
                        if (discoveredItems.length === 0) {
                            leftEl.innerHTML = '<div style="color:#1a0c02;text-align:center;padding:2rem;font-weight:600;">尚未获得任何物品<br><small style="color:#2a1808;">探索雪原，收集馈赠</small></div>';
                            rightEl.innerHTML = '<div style="color:#6b5a3e;text-align:center;padding:2rem;font-style:italic;">❄️<br>点击左侧物品<br>查看详细信息</div>';
                        } else {
                            // 左侧：物品列表
                            let listHtml = '<div style="font-size:0.7rem;color:#6b5a3e;margin-bottom:0.3rem;">共获得 ' + discoveredItems.length + ' 种物品</div>';
                            discoveredItems.forEach(function(item, i) {
                                const wpDesc = wpItems[item.wpNum] || '';
                                const shortName = item.name.length > 10 ? item.name.slice(0,10)+'…' : item.name;
                                listHtml += '<div class="gift-item" data-idx="' + i + '" style="display:flex;justify-content:space-between;padding:0.2rem 0.3rem;cursor:pointer;border-bottom:1px dotted rgba(0,0,0,0.06);font-size:0.72rem;color:#4a3a22;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(0,0,0,0.04)\'" onmouseout="this.style.background=\'\'"><span>' + shortName + '</span><span style="color:#8a7a5e;font-size:0.62rem;">×' + item.totalQty + ' (' + item.times + '次)</span></div>';
                            });
                            leftEl.innerHTML = listHtml;
                            // 右侧默认显示第一个物品详情
                            // 从WP表描述中提取括号内的内容（隐藏物品名本身，只展示效果描述）
                            function extractBracketDesc(wpDesc) {
                                if (!wpDesc) return '';
                                var m = wpDesc.match(/[（(]([^）)]+)[）)]/);
                                return m ? m[1] : wpDesc;
                            }
                            function showGiftDetail(idx) {
                                const item = discoveredItems[idx];
                                if (!item) return;
                                const wpDesc = wpItems[item.wpNum] || '';
                                var descHtml = '';
                                var synList = ITEM_SYNTHESIS[item.name];
                                var raw = craftedItems[item.name];
                                var craftedList = Array.isArray(raw) ? raw : (raw ? [item.name] : []);
                                if (synList) {
                                    // 分离：无recipe的是物品描述，有recipe的是合成配方
                                    var descEntries = synList.filter(function(entry) { return !entry.recipe; });
                                    var recipeEntries = synList.filter(function(entry) { return entry.recipe; });
                                    var unlocked = recipeEntries.filter(function(entry) { return craftedList.indexOf(entry.recipe) >= 0; });
                                    var locked = recipeEntries.filter(function(entry) { return craftedList.indexOf(entry.recipe) < 0; });
                                    var lines = [];
                                    // 始终显示物品描述（优先合成描述，其次WP表括号内效果描述）
                                    if (descEntries.length > 0) {
                                        lines.push('<div style="color:#6b5a3e;">' + descEntries.map(function(e){return e.text;}).join('；') + '</div>');
                                    } else {
                                        var bracketOnly = extractBracketDesc(wpDesc);
                                        if (bracketOnly) lines.push('<div style="color:#6b5a3e;">' + bracketOnly + '</div>');
                                    }
                                    // 显示已解锁配方
                                    if (unlocked.length > 0) {
                                        lines.push('<div style="color:#3d6e16;margin-top:2px;">' + unlocked.map(function(entry) { return '✅ ' + entry.text; }).join('<br>') + '</div>');
                                    }
                                    // 显示未解锁数量（保持神秘感，不显示具体配方内容）
                                    if (locked.length > 0) {
                                        lines.push('<div style="color:#8a7a5e;margin-top:2px;"><span style="color:#c83040;">🔒</span> 还有' + locked.length + '个配方未解锁</div>');
                                    } else if (unlocked.length === 0 && recipeEntries.length > 0) {
                                        lines.push('<div style="color:#8a7a5e;margin-top:2px;"><span style="color:#c83040;">🔒</span> 达成条件解锁配方</div>');
                                    }
                                    descHtml = '<div style="font-size:0.68rem;line-height:1.7;border-top:1px dashed rgba(0,0,0,0.1);padding-top:0.4rem;">' + lines.join('') + '</div>';
                                } else {
                                    // 无合成配方：只显示WP表括号内的效果描述
                                    var bracketOnly2 = extractBracketDesc(wpDesc);
                                    descHtml = '<div style="color:#6b5a3e;font-size:0.72rem;line-height:1.7;border-top:1px dashed rgba(0,0,0,0.1);padding-top:0.4rem;">' + (bracketOnly2 || '暂无详细描述') + '</div>';
                                }
                                rightEl.innerHTML = '<div style="color:#3d2e16;font-size:0.85rem;font-weight:600;margin-bottom:0.3rem;">' + item.name + '</div>' +
                                    '<div style="color:#5a4a30;font-size:0.7rem;margin-bottom:0.2rem;">累计获得: ' + item.totalQty + ' 份（共' + item.times + '次）</div>' + descHtml;
                            }
                            showGiftDetail(0);
                            // 绑定点击
                            setTimeout(function() {
                                leftEl.querySelectorAll('.gift-item').forEach(function(el) {
                                    el.addEventListener('click', function() {
                                        var idx = parseInt(this.dataset.idx, 10);
                                        showGiftDetail(idx);
                                        // 高亮当前选中
                                        leftEl.querySelectorAll('.gift-item').forEach(function(e) { e.style.background = ''; });
                                        this.style.background = 'rgba(0,0,0,0.06)';
                                    });
                                });
                            }, 50);
                        }
                    } else if (activeBookTab === 'creatures') {
                        // 冰原生物图鉴
                        pageNum.textContent = '';
                        leftEl.innerHTML = '';
                        rightEl.innerHTML = '';
                        const hostiles = discoveredCreatures.filter(function(c) { return c.cat === 'hostile'; });
                        const neutrals = discoveredCreatures.filter(function(c) { return c.cat === 'neutral'; });
                        if (discoveredCreatures.length === 0) {
                            leftEl.innerHTML = '<div style="color:#1a0c02;text-align:center;padding:2rem;font-weight:600;">尚未遭遇任何生物<br><small style="color:#2a1808;">深入雪原，发现北境的生灵</small></div>';
                            rightEl.innerHTML = '<div style="color:#6b5a3e;text-align:center;padding:2rem;font-style:italic;">🐺<br>点击左侧生物<br>查看详细信息</div>';
                        } else {
                            let listHtml = '<div style="font-size:0.7rem;color:#6b5a3e;margin-bottom:0.3rem;">共遭遇 ' + discoveredCreatures.length + ' 种生物</div>';
                            // 敌对生物
                            if (hostiles.length > 0) {
                                listHtml += '<div style="font-size:0.68rem;color:#8a3a3a;font-weight:600;margin-top:0.3rem;">⚔️ 敌对生物</div>';
                                hostiles.forEach(function(c, i) {
                                    listHtml += '<div class="gift-item" data-creature="' + c.name + '" style="display:flex;justify-content:space-between;padding:0.2rem 0.3rem;cursor:pointer;border-bottom:1px dotted rgba(0,0,0,0.06);font-size:0.72rem;color:#4a3a22;" onmouseover="this.style.background=\'rgba(0,0,0,0.04)\'" onmouseout="this.style.background=\'\'"><span>' + c.name + '</span><span style="color:#8a7a5e;font-size:0.62rem;">×' + c.totalCount + '只</span></div>';
                                });
                            }
                            // 中立生物
                            if (neutrals.length > 0) {
                                listHtml += '<div style="font-size:0.68rem;color:#5a7a3a;font-weight:600;margin-top:0.3rem;">🌿 中立生物</div>';
                                neutrals.forEach(function(c, i) {
                                    listHtml += '<div class="gift-item" data-creature="' + c.name + '" style="display:flex;justify-content:space-between;padding:0.2rem 0.3rem;cursor:pointer;border-bottom:1px dotted rgba(0,0,0,0.06);font-size:0.72rem;color:#4a3a22;" onmouseover="this.style.background=\'rgba(0,0,0,0.04)\'" onmouseout="this.style.background=\'\'"><span>' + c.name + '</span><span style="color:#8a7a5e;font-size:0.62rem;">×' + c.totalCount + '只</span></div>';
                                });
                            }
                            leftEl.innerHTML = listHtml;
                            // 右侧默认显示第一个生物详情
                            function showCreatureDetail(name) {
                                const c = discoveredCreatures.find(function(x) { return x.name === name; });
                                if (!c) return;
                                const catLabel = c.cat === 'hostile' ? '⚔️ 敌对' : '🌿 中立';
                                rightEl.innerHTML = '<div style="color:#3d2e16;font-size:0.85rem;font-weight:600;margin-bottom:0.3rem;">' + c.name + '</div>' +
                                    '<div style="color:#5a4a30;font-size:0.7rem;margin-bottom:0.2rem;">' + catLabel + ' | 遭遇 ' + c.times + ' 次 | 共 ' + c.totalCount + ' 只</div>' +
                                    '<div style="color:#6b5a3e;font-size:0.72rem;line-height:1.7;border-top:1px dashed rgba(0,0,0,0.1);padding-top:0.4rem;">北境雪原的生物，在探索中被冒险者遇见。</div>';
                            }
                            if (discoveredCreatures.length > 0) showCreatureDetail(discoveredCreatures[0].name);
                            setTimeout(function() {
                                leftEl.querySelectorAll('.gift-item[data-creature]').forEach(function(el) {
                                    el.addEventListener('click', function() {
                                        showCreatureDetail(this.dataset.creature);
                                        leftEl.querySelectorAll('.gift-item').forEach(function(e) { e.style.background = ''; });
                                        this.style.background = 'rgba(0,0,0,0.06)';
                                    });
                                });
                            }, 50);
                        }
                    }
                }

                function saveCurrentPage() {
                    if (activeBookTab !== 'journal') return;
                    if (currentPageIdx >= 0 && currentPageIdx < bookPages.length) {
                        const jt = document.getElementById('journalTitle');
                        const jc = document.getElementById('journalText');
                        if (jt) bookPages[currentPageIdx].title = jt.value.trim();
                        if (jc) bookPages[currentPageIdx].content = jc.value;
                    }
                }

                // ━━ 营地角色卡（完整版） ━━
                function renderCampCharSheet() {
                    const select = document.getElementById('campCharSelect');
                    const current = select.value;
                    select.innerHTML = '<option value="">— 选择角色 —</option>' +
                        Object.keys(charData).map(id => `<option value="${id}" ${id===current?'selected':''}>${charData[id].name}</option>`).join('');
                    if (current && charData[current]) { select.value = current;
                        renderCampCharDetail(current); }
                    else if (!current && Object.keys(charData).length > 0) { select.value = Object.keys(charData)[0];
                        renderCampCharDetail(Object.keys(charData)[0]); }
                }

                function renderCampCharDetail(id) {
                    reconcileSurvivalFuel();
                    const data = charData[id];
                    if (!data) {
                        document.getElementById('campCharDetail').innerHTML = '<div style="color:#5a7a9a;text-align:center;padding:1rem;">请选择或创建角色</div>';
                        document.getElementById('campCharStatus').textContent = '未选择';
                        document.getElementById('campCharNameInHeader').textContent = _northUsername ? '· ' + _northUsername : '';
                        return;
                    }
                    // 同步 activeChar（工作间背包/合成依赖此引用）
                    activeCharId = id;
                    activeChar = data;
                    // 刷新所有工坊背包
                    window.NORTH_CAMP.refreshAllShopBackpacks();
                    window.NORTH_GUILD.updateRankUI(); // 营地徽章：冒险者全局等级（青羽→白羽）
                    /* campCharName now always shows username */
                    const mods = {};
                    ['str','dex','con','int','wis','cha'].forEach(k => { mods[k] = Math.floor((data[k]-10)/2); });
                    const hpPct = Math.round(data.hp / Math.max(1, data.hpMax) * 100);
                    const carry = data.str * 15;
                    const esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };

                    let html = `
                        <div class="cc-hp-bar"><span style="color:#e0556a;">❤️</span><div class="cc-hp-bar-inner"><div class="cc-hp-fill" style="width:${hpPct}%"></div></div><span class="cc-hp-text"><span class="cc-editable" onclick="campEditNum('${id}','hp',${data.hp})">${data.hp}</span> / <span class="cc-editable" onclick="campEditNum('${id}','hpMax',${data.hpMax})">${data.hpMax}</span></span></div>
                        <div style="font-size:0.7rem;color:#7aacd8;margin-bottom:0.3rem;">💙 临时HP: <span class="cc-editable" onclick="campEditNum('${id}','tempHp',${data.tempHp||0})">${data.tempHp||0}</span> &nbsp;|&nbsp; 💀 死亡豁免: 成功<b style="color:#6abf8a;">0/3</b> 失败<b style="color:#e0556a;">0/3</b></div>
                    `;

                    // 基本信息
                    html += `<details class="cc-section" open><summary>📋 基本信息</summary><div class="cc-section-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.15rem 0.6rem;">`;
                    const infoFields = [
                        ['等级','level',data.level],['职业','class',esc(data.class)],['种族','race',esc(data.race)],
                        ['阵营','alignment',esc(data.alignment||'—')],['信仰','faith',esc(data.faith||'—')],['性别','gender',esc(data.gender||'—')],
                        ['熟练加值','profBonus','+'+data.profBonus],['AC','ac',data.ac],['速度','speed',data.speed+'尺'],
                        ['被动察觉','passivePerception',data.passivePerception],['法术DC','spellSaveDc',data.spellSaveDc||10],['法术命中','spellAttackBonus','+'+(data.spellAttackBonus||0)],
                        ['身高','height',esc(data.height||'—')],['体重','weight',esc(data.weight||'—')],
                        ['负重','_carry',(function(){ var tw=0; (data.inventory||[]).forEach(function(it){ tw+=(it.weight||1)*it.qty; }); (data.weapons||[]).forEach(function(w){ tw+=(w.weight||2); }); if (data.armor && data.armor.name) tw+=(data.armor.weight||10); return tw+' / '+carry+' 磅'; })()],
                        ['语言','languages',esc(data.languages||'—')],['关键属性','keyAbilities',esc(data.keyAbilities||'—')],['抗性','resistances',esc(data.resistances||'—')],
                    ];
                    infoFields.forEach(function(f) {
                        if (f[0] === '负重上限') html += `<span style="color:#7aacd8;">${f[0]}</span><span>${f[2]}</span>`;
                        else html += `<span style="color:#7aacd8;">${f[0]}</span><span class="cc-editable" onclick="campEditField('${id}','${f[1]}','${String(f[2]).replace(/'/g,"\\'")}')">${f[2]}</span>`;
                    });
                    html += `</div></div></details>`;

                    // 属性
                    html += `<details class="cc-section" open><summary>⚔️ 属性</summary><div class="cc-section-body"><div class="cc-abilities">`;
                    ['str','dex','con','int','wis','cha'].forEach(function(k) {
                        var names = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
                        var m = mods[k];
                        html += `<div class="cc-ability"><span class="abbr">${names[k]}</span><span class="score cc-editable" onclick="campEditNum('${id}','${k}',${data[k]})">${data[k]}</span><span class="mod">${m>=0?'+':''}${m}</span></div>`;
                    });
                    html += `</div></div></details>`;

                    // 技能熟练 & 豁免（点击切换）
                    html += `<details class="cc-section"><summary>🎯 技能熟练 & 豁免 <span style="font-weight:300;font-size:0.65rem;color:#5a7a9a;">点击切换</span></summary><div class="cc-section-body">`;
                    var skillProfs = data.skillProfs = data.skillProfs || {};
                    var skillNames = ['运动','杂技','巧手','隐匿','奥秘','历史','自然','宗教','洞悉','医药','察觉','生存','欺瞒','威吓','表演','说服','驯兽','调查'];
                    var saveNames = ['力量','敏捷','体质','智力','感知','魅力'];
                    html += `<div style="font-size:0.7rem;color:#7aacd8;margin-bottom:0.2rem;">技能</div><div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:0.4rem;">`;
                    skillNames.forEach(function(s) {
                        var has = skillProfs[s] || 0;
                        html += `<span class="cc-tag cc-editable" style="${has?'background:rgba(136,204,255,0.18);color:#c8dff8;':'opacity:0.5;'}cursor:pointer;" onclick="campToggleSkillProf('${id}','${s}')">${s}${has?' ✓':''}</span>`;
                    });
                    html += `</div>`;
                    var saveProfs = data.saveProfs = data.saveProfs || {};
                    html += `<div style="font-size:0.7rem;color:#7aacd8;margin-bottom:0.2rem;">豁免</div><div style="display:flex;flex-wrap:wrap;gap:3px;">`;
                    saveNames.forEach(function(s) {
                        var has = saveProfs[s] || 0;
                        html += `<span class="cc-tag cc-editable" style="${has?'background:rgba(136,204,255,0.18);color:#c8dff8;':'opacity:0.5;'}cursor:pointer;" onclick="campToggleSaveProf('${id}','${s}')">${s}${has?' ✓':''}</span>`;
                    });
                    html += `</div></div></details>`;

                    // 武器（可编辑/删除/新增）
                    data.weapons = data.weapons || [];
                    html += `<details class="cc-section"><summary>⚔️ 武器装备 (${data.weapons.length})</summary><div class="cc-section-body">`;
                    data.weapons.forEach(function(w, i) {
                        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.1rem 0;border-bottom:1px solid rgba(74,128,184,0.05);"><span class="cc-editable" onclick="campEditWeapon('${id}',${i})"><b>${esc(w.name)}</b> <span style="color:#7aacd8;font-size:0.68rem;">命中+${w.bonus} | ${esc(w.damage)} ${esc(w.type||'')}</span></span><span style="color:#e0556a;cursor:pointer;font-size:0.7rem;" onclick="campDelWeapon('${id}',${i})" title="删除">✕</span></div>`;
                    });
                    if (!data.weapons.length) html += '<div style="color:#5a7a9a;font-size:0.7rem;text-align:center;padding:0.3rem;">暂无武器装备</div>';
                    html += `<button class="cc-tag" style="margin-top:0.3rem;cursor:pointer;background:rgba(60,140,220,0.15);border:none;color:#88ccff;font-size:0.65rem;padding:0.15rem 0.6rem;" onclick="campAddWeapon('${id}')">+ 添加武器</button>`;
                    html += `</div></details>`;

                    // 背包
                    data.inventory = data.inventory || [];
                    data.coins = data.coins || {cp:0,sp:0,gp:0};
                    html += `<details class="cc-section"><summary>🎒 背包物品 & 钱币</summary><div class="cc-section-body">`;
                    var coins = data.coins;
                    html += `<div style="font-size:0.7rem;color:#7aacd8;margin-bottom:0.2rem;">💰 钱币 <span style="font-weight:300;font-size:0.65rem;color:#5a7a9a;">点击修改</span></div>`;
                    html += `<div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.5rem;font-size:0.72rem;">`;
                    var coinColors = {gp:'#ffd700', sp:'#c0c0c0', cp:'#cd7f32'};
                    ['gp','sp','cp'].forEach(function(c) {
                        var cn = {gp:'金币',sp:'银币',cp:'铜币'};
                        html += `<span class="cc-editable" onclick="campEditCoin('${id}','${c}',${coins[c]||0})" style="color:${coinColors[c]};">${cn[c]}: <b style="color:${coinColors[c]};">${coins[c]||0}</b></span>`;
                    });
                    html += `</div>`;
                    // 生存物资：口粮 + 燃料
                    html += `<div style="font-size:0.7rem;color:#c8a870;margin-bottom:0.2rem;margin-top:0.4rem;">🏕️ 生存物资 <span style="font-weight:300;font-size:0.65rem;color:#5a7a9a;">点击修改</span></div>`;
                    html += `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.4rem;font-size:0.7rem;">`;
                    html += `<span class="cc-editable" onclick="campEditNum('${id}','_ration',${survival.rations})" style="color:#ffcc80;">🍖 口粮: <b>${survival.rations}</b> 份</span>`;
                    var fuelNames = {firewood:'柴火/石块',pine_branch:'松枝',resin:'松脂',iron_resin:'铁松脂',glow_moss:'荧光苔'};
                    Object.keys(fuelNames).forEach(function(fk) {
                        var fv = survival.fuel[fk] || 0;
                        if (fv > 0) {
                            html += `<span class="cc-editable" onclick="campEditNum('${id}','_fuel_${fk}',${fv})" style="color:#aaccee;">🔥 ${fuelNames[fk]}: <b>${fv}</b></span>`;
                        }
                    });
                    html += `<span style="color:#5a7a9a;font-size:0.62rem;">（点击数值修改）</span></div>`;
                    html += `<div style="font-size:0.7rem;color:#7aacd8;margin-bottom:0.2rem;">📦 物品 (${data.inventory.length}件)</div>`;
                    data.inventory.forEach(function(it, i) {
                        var useCfg = (window.NORTH_DATA && window.NORTH_DATA.ITEM_USE_TABLE) ? window.NORTH_DATA.ITEM_USE_TABLE[it.name] : null;
                        var useBtn = useCfg ? `<span style="color:#8fd08a;cursor:pointer;font-size:0.62rem;margin-right:0.45rem;background:rgba(60,140,80,0.2);border:1px solid rgba(100,180,120,0.45);border-radius:3px;padding:0 4px;line-height:1.4;white-space:nowrap;" onclick="event.stopPropagation();window.NORTH_CAMP_CTX.useBackpackItem('${esc(it.name)}')" title="${esc(useCfg.desc || '使用')}">使用</span>` : '';
                        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.08rem 0;font-size:0.7rem;"><span class="cc-editable" onclick="campEditItem('${id}',${i})">${esc(it.name)} ${it.qty>1?'x'+it.qty:''} <span style="color:#5a7a9a;font-size:0.6rem;">${esc(it.location||'背包')}</span></span><span style="display:flex;align-items:center;">${useBtn}<span style="color:#e0556a;cursor:pointer;font-size:0.65rem;" onclick="campDelItem('${id}',${i})" title="删除">✕</span></span></div>`;
                    });
                    if (!data.inventory.length) html += '<div style="color:#5a7a9a;font-size:0.7rem;text-align:center;padding:0.3rem;">暂无物品</div>';
                    html += `<button class="cc-tag" style="margin-top:0.3rem;cursor:pointer;background:rgba(60,140,220,0.15);border:none;color:#88ccff;font-size:0.65rem;padding:0.15rem 0.6rem;" onclick="campAddItem('${id}')">+ 添加物品</button>`;
                    html += `</div></details>`;

                    // 法术
                    data.spells = data.spells || [];
                    html += `<details class="cc-section"><summary>📖 法术 (${data.spells.length}个)</summary><div class="cc-section-body">`;
                    data.spells.forEach(function(s, i) {
                        html += `<span class="cc-tag" style="margin:2px;cursor:pointer;" onclick="campEditSpell('${id}',${i})">✨ ${esc(s.name)} (${s.level}环)</span>`;
                    });
                    if (!data.spells.length) html += '<div style="color:#5a7a9a;font-size:0.7rem;text-align:center;padding:0.3rem;">暂无法术</div>';
                    html += `<div style="margin-top:0.3rem;display:flex;gap:0.3rem;"><button class="cc-tag" style="cursor:pointer;background:rgba(60,140,220,0.15);border:none;color:#88ccff;font-size:0.65rem;padding:0.15rem 0.6rem;" onclick="campAddSpell('${id}')">+ 添加法术</button>${data.spells.length>0?`<button class="cc-tag" style="cursor:pointer;background:rgba(200,60,80,0.15);border:none;color:#e0556a;font-size:0.65rem;padding:0.15rem 0.6rem;" onclick="campDelLastSpell('${id}')">删除最后</button>`:''}</div>`;
                    html += `</div></details>`;

                    // 背景（点击编辑）
                    var bg = data.background = data.background || {};
                    html += `<details class="cc-section"><summary>📝 背景信息 <span style="font-weight:300;font-size:0.65rem;color:#5a7a9a;">点击编辑</span></summary><div class="cc-section-body" style="font-size:0.72rem;line-height:1.6;">`;
                    var bgFields = [['性格特征','personality'],['理念','ideals'],['牵绊','bonds'],['缺点','flaws'],['外貌','appearance'],['背景故事','backstory']];
                    bgFields.forEach(function(f) {
                        html += `<div style="margin-bottom:0.3rem;" class="cc-editable" onclick="campEditBg('${id}','${f[1]}','${esc(bg[f[1]]||'').replace(/'/g,"\\'")}')"><b style="color:#88ccff;">${f[0]}:</b> <span style="color:#b0d4f0;">${esc(bg[f[1]]||'—')}</span></div>`;
                    });
                    html += `</div></details>`;

                    // 特性（可编辑/新增/删除）
                    var feats = data.features = data.features || [];
                    var featByCat = {};
                    feats.forEach(function(f, i) { f._idx = i; if (!featByCat[f.cat]) featByCat[f.cat] = [];
                        featByCat[f.cat].push(f); });
                    var catNames = {class_feature:'🎯 职业能力',feat:'⭐ 专长',racial_trait:'🧬 种族特性',special_ability:'✨ 特殊能力',other:'📋 其他'};
                    Object.keys(catNames).forEach(function(cat) {
                        var items = featByCat[cat] || [];
                        html += `<details class="cc-section"><summary>${catNames[cat]} (${items.length})</summary><div class="cc-section-body">`;
                        items.forEach(function(f) {
                            html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.3rem;padding:0.2rem;border-radius:4px;" onmouseover="this.style.background='rgba(60,140,220,0.06)'" onmouseout="this.style.background=''"><div style="flex:1;cursor:pointer;" onclick="campEditFeature('${id}',${f._idx})"><b style="color:#88ccff;">${esc(f.name)}</b><div style="color:#b0d4f0;font-size:0.68rem;">${esc(f.desc||'')}</div></div><span style="color:#e0556a;cursor:pointer;font-size:0.65rem;flex-shrink:0;" onclick="campDelFeature('${id}',${f._idx})" title="删除">✕</span></div>`;
                        });
                        if (!items.length) html += '<div style="color:#5a7a9a;font-size:0.7rem;text-align:center;padding:0.3rem;">暂无</div>';
                        html += `<button class="cc-tag" style="margin-top:0.3rem;cursor:pointer;background:rgba(60,140,220,0.15);border:none;color:#88ccff;font-size:0.65rem;padding:0.15rem 0.6rem;" onclick="campAddFeature('${id}','${cat}')">+ 添加</button>`;
                        html += `</div></details>`;
                    });

                    // 记住当前展开的折叠区
                    var currentOpen = [];
                    var container = document.getElementById('campCharDetail');
                    container.querySelectorAll('details[open]').forEach(function(d) {
                        var sum = d.querySelector('summary');
                        if (sum) currentOpen.push(sum.textContent.trim().substring(0, 30));
                    });
                    container.innerHTML = html;
                    // 恢复展开状态
                    container.querySelectorAll('details').forEach(function(d) {
                        var sum = d.querySelector('summary');
                        if (sum && currentOpen.includes(sum.textContent.trim().substring(0, 30))) {
                            d.setAttribute('open', '');
                        }
                    });
                }

                // 营地角色编辑 — 技能/豁免切换
                window.campToggleSkillProf = function(id, skill) {
                    var d = charData[id]; if (!d) return;
                    d.skillProfs = d.skillProfs || {};
                    d.skillProfs[skill] = d.skillProfs[skill] ? 0 : 1;
                    renderCampCharDetail(id);
                };
                window.campToggleSaveProf = function(id, save) {
                    var d = charData[id]; if (!d) return;
                    d.saveProfs = d.saveProfs || {};
                    d.saveProfs[save] = d.saveProfs[save] ? 0 : 1;
                    renderCampCharDetail(id);
                };
                // 武器CRUD
                window.campEditWeapon = async function(id, idx) {
                    var w = charData[id].weapons[idx];
                    var n = await showPromptDialog('武器名/命中/伤害/类型（用|分隔）:', {defaultValue: w.name+'|'+w.bonus+'|'+w.damage+'|'+(w.type||'')});
                    if (!n) return;
                    var p = n.split('|');
                    w.name = p[0].trim() || w.name;
                    w.bonus = parseInt(p[1]) || w.bonus;
                    w.damage = p[2] ? p[2].trim() : w.damage;
                    w.type = p[3] ? p[3].trim() : w.type;
                    renderCampCharDetail(id);
                };
                window.campAddWeapon = async function(id) {
                    var n = await showPromptDialog('武器名|命中|伤害|类型:', {defaultValue: '长剑|5|1d8|挥砍'});
                    if (!n) return;
                    var p = n.split('|');
                    charData[id].weapons.push({name:p[0].trim()||'新武器',bonus:parseInt(p[1])||0,damage:p[2]?p[2].trim():'1d4',type:p[3]?p[3].trim():''});
                    renderCampCharDetail(id);
                };
                window.campDelWeapon = async function(id, idx) {
                    if (!await showConfirmDialog('删除此武器？')) return;
                    charData[id].weapons.splice(idx, 1);
                    renderCampCharDetail(id);
                };
                // 物品CRUD
                window.campEditItem = async function(id, idx) {
                    var it = charData[id].inventory[idx];
                    var n = await showPromptDialog('物品名|数量|位置:', {defaultValue: it.name+'|'+it.qty+'|'+(it.location||'背包')});
                    if (!n) return;
                    var p = n.split('|');
                    it.name = p[0].trim() || it.name;
                    it.qty = parseInt(p[1]) || it.qty;
                    it.location = p[2] ? p[2].trim() : it.location;
                    if (activeCharId === id) activeChar.inventory = charData[id].inventory;
                    renderCampCharDetail(id);
                    updateSurvivalUI();
                };
                window.campAddItem = async function(id) {
                    var n = await showPromptDialog('物品名|数量|位置:', {defaultValue: '新物品|1|背包'});
                    if (!n) return;
                    var p = n.split('|');
                    charData[id].inventory.push({name:p[0].trim()||'新物品',qty:parseInt(p[1])||1,location:p[2]?p[2].trim():'背包',weight:1});
                    if (activeCharId === id) activeChar.inventory = charData[id].inventory;
                    renderCampCharDetail(id);
                    updateSurvivalUI();
                };
                window.campDelItem = async function(id, idx) {
                    if (!await showConfirmDialog('删除此物品？')) return;
                    charData[id].inventory.splice(idx, 1);
                    if (activeCharId === id) activeChar.inventory = charData[id].inventory;
                    renderCampCharDetail(id);
                    updateSurvivalUI();
                };
                // 钱币
                window.campEditCoin = async function(id, coin, val) {
                    var v = await showPromptDialog('修改 '+coin+':', {defaultValue: val});
                    if (v !== null && !isNaN(parseInt(v))) { charData[id].coins[coin] = Math.max(0, parseInt(v));
                        renderCampCharDetail(id); }
                };
                // 法术
                window.campEditSpell = async function(id, idx) {
                    var s = charData[id].spells[idx];
                    var n = await showPromptDialog('法术名|环位:', {defaultValue: s.name+'|'+s.level});
                    if (!n) return;
                    var p = n.split('|');
                    s.name = p[0].trim() || s.name;
                    s.level = parseInt(p[1]) || s.level;
                    renderCampCharDetail(id);
                };
                window.campAddSpell = async function(id) {
                    var n = await showPromptDialog('法术名|环位:', {defaultValue: '魔法飞弹|1'});
                    if (!n) return;
                    var p = n.split('|');
                    charData[id].spells.push({name:p[0].trim()||'新法术',level:parseInt(p[1])||1});
                    renderCampCharDetail(id);
                };
                window.campDelLastSpell = async function(id) {
                    var arr = charData[id].spells;
                    if (!arr.length) return;
                    if (!await showConfirmDialog('删除最后一个法术：'+arr[arr.length-1].name+'？')) return;
                    arr.pop();
                    renderCampCharDetail(id);
                };
                // 背景
                window.campEditBg = async function(id, field, val) {
                    var clean = val.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
                    var v = await showPromptDialog('修改 '+field+':', {defaultValue: clean});
                    if (v !== null) { charData[id].background[field] = v.trim();
                        renderCampCharDetail(id); }
                };
                // 特性
                window.campEditFeature = async function(id, idx) {
                    var f = charData[id].features[idx];
                    var n = await showPromptDialog('特性名|描述（用|分隔）:', {defaultValue: f.name+'|'+(f.desc||'')});
                    if (!n) return;
                    var p = n.split('|');
                    f.name = p[0].trim() || f.name;
                    f.desc = p[1] ? p[1].trim() : f.desc;
                    renderCampCharDetail(id);
                };
                window.campAddFeature = async function(id, cat) {
                    var n = await showPromptDialog('特性名|描述:', {defaultValue: '新特性|'});
                    if (!n) return;
                    var p = n.split('|');
                    charData[id].features.push({cat:cat,name:p[0].trim()||'新特性',desc:p[1]?p[1].trim():''});
                    renderCampCharDetail(id);
                };
                window.campDelFeature = async function(id, idx) {
                    if (!await showConfirmDialog('删除此特性？')) return;
                    charData[id].features.splice(idx, 1);
                    renderCampCharDetail(id);
                };

                // 通用字段编辑
                window.campEditField = async function(id, field, currentVal) {
                    // 净化当前值（去除HTML实体）
                    var clean = String(currentVal||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
                    // 处理特殊字段
                    if (field === '_carry') return; // 负重不能编辑
                    if (field === 'profBonus' || field === 'spellAttackBonus') clean = clean.replace(/^\+/, '');
                    var v = await showPromptDialog('修改 ' + field + ':', {defaultValue: clean});
                    if (v === null) return;
                    v = v.trim();
                    if (!v && field !== 'resistances' && field !== 'keyAbilities' && field !== 'languages' && field !== 'alignment' && field !== 'faith' && field !== 'gender' && field !== 'height' && field !== 'weight') return;
                    // 判断类型
                    var numFields = ['level','hp','hpMax','tempHp','ac','speed','profBonus','passivePerception','spellSaveDc','spellAttackBonus'];
                    if (numFields.includes(field) && !isNaN(parseInt(v))) { charData[id][field] = parseInt(v); }
                    else { charData[id][field] = v; }
                    renderCampCharDetail(id);
                    // 同步探索页
                    if (activeCharId === id) { renderCharDetail(id);
                        updateSurvivalUI(); }
                };
                window.campEditNum = async function(id, field, currentVal) {
                    var labelMap = {_ration:'口粮'};
                    var label = labelMap[field] || (field.startsWith('_fuel_') ? '燃料·' + field.substring(6) : field);
                    var v = await showPromptDialog('修改 ' + label + ':', {defaultValue: currentVal});
                    if (v === null || isNaN(parseInt(v))) return;
                    var val = Math.max(0, parseInt(v));
                    if (field === '_ration') {
                        survival.rations = val;
                    } else if (field.startsWith('_fuel_')) {
                        var fk = field.substring(6);
                        var itemName = FUEL_KEY_TO_NAME[fk];
                        var charInv = charData[id] && charData[id].inventory;
                        if (itemName && charInv) {
                            // 同步到背包物品
                            var found = false;
                            for (var fi = 0; fi < charInv.length; fi++) {
                                if (charInv[fi].name === itemName) {
                                    charInv[fi].qty = val;
                                    if (charInv[fi].qty <= 0) charInv.splice(fi, 1);
                                    found = true; break;
                                }
                            }
                            if (!found && val > 0) {
                                charInv.push({name: itemName, qty: val, location: '背包', weight: 1});
                            }
                            // 同步到 activeChar（如果是同一角色）
                            if (activeCharId === id) activeChar.inventory = charInv;
                        }
                        // reconcileSurvivalFuel() 在 updateSurvivalUI 中自动从背包同步
                    } else {
                        charData[id][field] = val;
                        if (activeCharId === id) renderCharDetail(id);
                    }
                    renderCampCharDetail(id);
                    updateSurvivalUI();
                };
                window.campEditStr = async function(id, field, currentVal) {
                    var v = await showPromptDialog('修改 ' + field + ':', {defaultValue: currentVal});
                    if (v !== null && v.trim()) { charData[id][field] = v.trim();
                        renderCampCharDetail(id); if (activeCharId === id) renderCharDetail(id); }
                };

                // 营地角色选择器
                document.getElementById('campCharSelect').addEventListener('change', function() {
                    if (this.value) {
                        // 探索中锁定角色切换：回到营地或昏迷倒下后才可切换
                        if (!canSwitchChar()) {
                            addSystemLog('🚫 探索中无法切换角色，请先返回营地', 'warning');
                            this.value = activeCharId || '';
                            return;
                        }
                        renderCampCharDetail(this.value);
                        // 同步到探索界面
                        charSelect.value = this.value;
                        renderCharDetail(this.value);
                    }
                });
                document.getElementById('campCreateCharBtn').addEventListener('click', async function() {
                    const name = await showPromptDialog('输入新角色名:', {defaultValue: '北境旅人'});
                    if (name && name.trim()) {
                        const newId = 'camp_' + Date.now();
                        charData[newId] = defaultCharTemplate(name.trim());
                        renderCampCharSheet();
                        addSystemLog(`👤 新冒险者"${name.trim()}"加入营地`, 'system');
                    }
                });
                // 营地HP按钮（营地是安全区，不受探索环境影响）
                document.getElementById('campLongRestBtn').addEventListener('click', async function() {
                    const id = document.getElementById('campCharSelect').value;
                    if (!id || !charData[id]) { alert('请先选择角色'); return; }
                    if (!await showConfirmDialog('确定要进行长休吗？将恢复全部HP并推进8小时。')) return;
                    const data = charData[id];
                    data.hp = data.hpMax;
                    data.tempHp = 0;
                    advanceTime(8);
                    renderCampCharDetail(id);
                    if (activeCharId === id) renderCharDetail(id);
                    updateSurvivalUI();
                    addSystemLog(`🛌 ${data.name} 在营地完成长休，HP 已恢复至 ${data.hpMax}`, 'success');
                });
                document.getElementById('campShortRestBtn').addEventListener('click', async function() {
                    const id = document.getElementById('campCharSelect').value;
                    if (!id || !charData[id]) { alert('请先选择角色'); return; }
                    if (!await showConfirmDialog('确定要进行短休吗？将恢复1d8+体质调整值HP并推进1小时。')) return;
                    const data = charData[id];
                    const heal = rollDiceExpr('1d8') + abilityMod(data.con);
                    const actual = Math.min(heal, data.hpMax - data.hp);
                    data.hp += actual;
                    advanceTime(1);
                    renderCampCharDetail(id);
                    if (activeCharId === id) renderCharDetail(id);
                    updateSurvivalUI();
                    addSystemLog(`☕ ${data.name} 在营地短休，恢复 ${actual} HP`, 'success');
                });
                document.getElementById('campHealBtn').addEventListener('click', async function() {
                    const id = document.getElementById('campCharSelect').value;
                    if (!id || !charData[id]) { alert('请先选择角色'); return; }
                    const data = charData[id];
                    const amt = await showPromptDialog('治疗量:', {defaultValue: '5'});
                    if (amt !== null && parseInt(amt) > 0) {
                        const heal = Math.min(parseInt(amt), data.hpMax - data.hp);
                        data.hp += heal;
                        renderCampCharDetail(id);
                        if (activeCharId === id) renderCharDetail(id);
                        addSystemLog(`❤️ ${data.name} 治疗 ${heal}HP`, 'success');
                    }
                });
                document.getElementById('campDamageBtn').addEventListener('click', async function() {
                    const id = document.getElementById('campCharSelect').value;
                    if (!id || !charData[id]) { alert('请先选择角色'); return; }
                    const data = charData[id];
                    const amt = await showPromptDialog('伤害量:', {defaultValue: '3'});
                    if (amt !== null && parseInt(amt) > 0) {
                        data.hp = Math.max(0, data.hp - parseInt(amt));
                        renderCampCharDetail(id);
                        if (activeCharId === id) { renderCharDetail(id); if (data.hp <= 0) checkHpZero(); }
                        addSystemLog(`⚔️ ${data.name} 受到 ${parseInt(amt)} 点伤害`, 'danger');
                    }
                });
                // 删除角色
                document.getElementById('campDeleteCharBtn').addEventListener('click', async function() {
                    const id = document.getElementById('campCharSelect').value;
                    if (!id || !charData[id]) { alert('请先选择角色'); return; }
                    const name = charData[id].name;
                    if (!await showConfirmDialog(`确定删除角色 "${name}" 吗？此操作不可恢复。`)) return;
                    delete charData[id];
                    // 如果探索页也选中了这个角色，清除
                    if (activeCharId === id) {
                        activeChar = null;
                        activeCharId = null;
                        document.getElementById('charNameInHeader').textContent = _northUsername ? '· ' + _northUsername : '';
                        document.getElementById('campCharNameInHeader').textContent = _northUsername ? '· ' + _northUsername : '';
                        charStatus.textContent = '未选择';
                        charDetailContainer.innerHTML = '<div style="color:#5a7a9a;font-size:0.8rem;text-align:center;padding:0.8rem 0;">请选择或创建角色</div>';
                    }
                    renderCharSelect();
                    renderCampCharSheet();
                    addSystemLog(`🗑 角色"${name}"已被删除`, 'system');
                });
            }

            // =========================================================================
            // 十四、Canvas 动画
            // =========================================================================


            document.addEventListener('DOMContentLoaded', init);

            // ━━ 事件数据运行期上下文注入（north-data.js 的 CHECK_ACTIONS 回调依赖）━━
            // activeChar/activeCharId 会被重新赋值,必须用 getter 实时读取
            Object.defineProperty(window.NORTH_CTX, 'activeChar', { get: function () { return activeChar; }, configurable: true });
            Object.defineProperty(window.NORTH_CTX, 'activeCharId', { get: function () { return activeCharId; }, configurable: true });
            Object.defineProperty(window.NORTH_CTX, 'username', { get: function () { return _northUsername; }, configurable: true });
            Object.defineProperty(window.NORTH_CTX, 'statsData', { get: function () { return statsData; }, configurable: true });
            window.NORTH_CTX.updateSurvivalUI = updateSurvivalUI;
            window.NORTH_CTX.checkHpZero = checkHpZero;
            window.NORTH_CTX.abilityMod = abilityMod;
            window.NORTH_CTX.rand = rand;
            window.NORTH_CTX.survival = survival;
            window.NORTH_CTX.addSystemLog = addSystemLog;
            window.NORTH_CTX.findStatus = findStatus;
            window.NORTH_CTX.consumeStatus = consumeStatus;
            window.NORTH_CTX.runCheckChain = runCheckChain;
            window.NORTH_CTX.addCheckResult = addCheckResult;
            window.NORTH_CTX.rollDiceExpr = rollDiceExpr;
            window.NORTH_CTX.renderCharDetail = renderCharDetail;

        })();



