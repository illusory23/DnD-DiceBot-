/* ━━━ 北境雪原 · 公会系统模块 ━━━
 * 从 north-main.js 拆分（2026-08-16 JS 体积治理）
 * 等级/积分/晋升进程可视化；statsData 经 window.NORTH_CTX 实时读取
 * （north-main.js 末尾注入 statsData getter，importSave/存档恢复可能重赋值）
 */
(function () {
    'use strict';
            const RANK_LEVELS = window.NORTH_DATA.RANK_LEVELS;

            // 根据累计事件数计算当前等级索引
            function getRankIndex(totalEvents) {
                let idx = 0;
                for (let i = 0; i < RANK_LEVELS.length; i++) {
                    if (totalEvents >= RANK_LEVELS[i].need) idx = i;
                }
                return idx;
            }
            function getCurrentRank() { return RANK_LEVELS[getRankIndex(window.NORTH_CTX.statsData.total)]; }
            // 下一等级（已满级返回 null）
            function getNextRank() {
                const idx = getRankIndex(window.NORTH_CTX.statsData.total);
                return idx < RANK_LEVELS.length - 1 ? RANK_LEVELS[idx + 1] : null;
            }
            // 晋升检查（事件完成后调用）；晋升奖励冒险者积分（数值见 RANK_LEVELS.reward）
            function checkRankUp(oldTotal, newTotal) {
                if (getRankIndex(newTotal) > getRankIndex(oldTotal)) {
                    const idx = getRankIndex(newTotal);
                    const r = RANK_LEVELS[idx];
                    const reward = r.reward || 0;
                    window.NORTH_CTX.statsData.guildPoints = (window.NORTH_CTX.statsData.guildPoints || 0) + reward;
                    window.NORTH_CTX.addSystemLog('✨✨ 冒险者等级晋升：' + r.rank + '！累计事件 ' + newTotal + ' 次，获得 ' + reward + ' 冒险者积分', 'success');
                    updateRankUI();
                    return true;
                }
                return false;
            }

            // ⚔️ 公会 · 等级与积分面板渲染
            function renderGuild() {
                const rank = getCurrentRank();
                const next = getNextRank();
                const points = window.NORTH_CTX.statsData.guildPoints || 0;
                const badge = document.getElementById('guildRankBadge');
                if (badge) { badge.textContent = rank.rank; badge.style.color = rank.color; }
                const nameEl = document.getElementById('guildRankName');
                if (nameEl) nameEl.textContent = rank.rank + ' 冒险者';
                const evEl = document.getElementById('guildStatEvents');
                if (evEl) evEl.textContent = window.NORTH_CTX.statsData.total;
                const ptEl = document.getElementById('guildStatPoints');
                if (ptEl) ptEl.textContent = points;
                // 晋升进度条
                const prog = document.getElementById('guildRankProgress');
                if (prog && next) {
                    prog.style.display = '';
                    const nl = document.getElementById('guildRankNextLabel');
                    if (nl) nl.textContent = '→ ' + next.rank;
                    const nd = document.getElementById('guildRankNeed');
                    if (nd) nd.textContent = '还需 ' + (next.need - window.NORTH_CTX.statsData.total) + ' 次事件';
                    const pct = Math.min(100, Math.round((window.NORTH_CTX.statsData.total - rank.need) / Math.max(1, next.need - rank.need) * 100));
                    const fill = document.getElementById('guildRankFill');
                    if (fill) fill.style.width = pct + '%';
                } else if (prog) {
                    prog.style.display = 'none';
                }
                // 晋升之路 7 级阶梯
                const ladder = document.getElementById('guildLadder');
                if (ladder) {
                    const idx = getRankIndex(window.NORTH_CTX.statsData.total);
                    ladder.innerHTML = RANK_LEVELS.map(function(r, i) {
                        let cls = 'guild-ladder-step';
                        if (i < idx) cls += ' done';
                        else if (i === idx) cls += ' current';
                        else cls += ' locked';
                        return '<div class="' + cls + '" title="' + r.rank + '（' + r.need + ' 事件）">' +
                            '<div class="gls-badge" style="color:' + r.color + ';">' + (i > idx ? '?' : r.rank) + '</div>' +
                            '<div class="gls-name">' + r.rank + '</div>' +
                            '<div class="gls-need">' + r.need + ' 事件</div>' +
                            '<div class="gls-current-tag">⭐ 当前</div>' +
                        '</div>';
                    }).join('');
                }
            }

            // ⚔️ 公会子标签切换（等级与积分 / 委托栏 / 积分商店）
            window.guildSubTab = function(tab) {
                document.querySelectorAll('.guild-subtab').forEach(function(b) {
                    b.classList.toggle('active', b.dataset.gtab === tab);
                });
                document.getElementById('guildRankPanel').style.display = tab === 'rank' ? '' : 'none';
                document.getElementById('guildQuestPanel').style.display = tab === 'quest' ? '' : 'none';
                document.getElementById('guildShopPanel').style.display = tab === 'shop' ? '' : 'none';
                if (tab === 'rank') renderGuild();
            };

            // 刷新等级 UI：冒险者徽章 + 营地徽章 + 进度条
            // 更新头衔徽章（仅显示头衔；晋升进程可视化仅在公会界面 renderGuild 展示）
            function updateRankUI() {
                const r = getCurrentRank();
                const next = getNextRank();
                const tip = '累计事件 ' + window.NORTH_CTX.statsData.total + ' 次' + (next ? '，距 ' + next.rank + ' 还需 ' + (next.need - window.NORTH_CTX.statsData.total) + ' 次' : '，已达最高等级');
                const st = document.getElementById('charStatus');
                if (st) { st.textContent = r.rank; st.style.color = r.color; st.title = tip; }
                const cs = document.getElementById('campCharStatus');
                if (cs) { cs.textContent = r.rank; cs.style.color = r.color; cs.title = tip; }
                // 公会界面若当前可见，同步刷新晋升进程可视化
                // （刷新页面后存档异步加载完成时，阶梯会停留在初始青羽，需在此重渲染）
                const gv = document.getElementById('guildView');
                if (gv && gv.style.display !== 'none') renderGuild();
            }
    window.NORTH_GUILD = {
        getRankIndex: getRankIndex,
        getCurrentRank: getCurrentRank,
        getNextRank: getNextRank,
        checkRankUp: checkRankUp,
        renderGuild: renderGuild,
        updateRankUI: updateRankUI,
        guildSubTab: window.guildSubTab,
    };
})();
