/* ━━━ 北境雪原 · 生存系统模块 ━━━
 * 从 north-main.js 拆分（2026-08-16 第三次拆分）
 * 严寒/口粮/迷失/燃料判定层；运行期依赖经 window.NORTH_CTX 注入
 */
(function () {
    'use strict';
            function getColdDC() {
                let dc = 12;
                if (window.NORTH_CTX.survival.isInShelter) dc = 10;
                if (window.NORTH_CTX.survival.isInBlizzard) dc = 15;
                if (window.NORTH_CTX.survival.difficulty === 'hardcore') dc = Math.min(dc + 2, 18);
                if (window.NORTH_CTX.survival.difficulty === 'light') dc = Math.max(dc - 2, 8);
                return dc;
            }

            function getColdEffect() {
                const level = window.NORTH_CTX.survival.coldLevel;
                if (level === 0) return '无效果';
                if (level === 1) return '体质-1';
                if (level === 2) return '体质-2';
                return '体质-3，力竭1级';
            }

            function getColdBadge() {
                if (window.NORTH_CTX.survival.coldLevel >= 3) return 'danger';
                if (window.NORTH_CTX.survival.coldLevel >= 2) return 'warning';
                return '';
            }

            function getSurvivalBadges() {
                const badges = [];
                if (window.NORTH_CTX.survival.coldLevel >= 3) badges.push({text:'❄️ 危险'});
                else if (window.NORTH_CTX.survival.coldLevel >= 2) badges.push({text:'❄️ 严寒'});
                else if (window.NORTH_CTX.survival.coldLevel >= 1) badges.push({text:'❄️ 寒冷'});
                if (window.NORTH_CTX.survival.isStarving) badges.push({text:'🍖 断粮'});
                if (window.NORTH_CTX.survival.isLost) badges.push({text:'🧭 迷失'});
                if (window.NORTH_CTX.survival.evilFrostActive) badges.push({text:'👻 恶霜'});
                if (window.NORTH_CTX.survival.ravenProtection > 0) badges.push({text:'🪶 庇护'});
                if (window.NORTH_CTX.survival.torchChecks > 0) badges.push({text:'🔥 火把('+window.NORTH_CTX.survival.torchChecks+')',cls:'success'});
                if (window.NORTH_CTX.survival.coldResist > 0) badges.push({text:'🧴 药膏('+window.NORTH_CTX.survival.coldResist+')',cls:'success'});
                if (badges.length === 0 && window.NORTH_CTX.survival.totalEvents === 0) badges.push({text:'正常'});
                else if (badges.length === 0) badges.push({text:'警戒'});
                // 根据负面状态数量确定颜色：0=绿 1=黄 2+=红
                const negCount = badges.filter(function(b) { return b.text !== '正常' && b.text !== '警戒'; }).length;
                const cls = negCount >= 2 ? 'danger' : (negCount === 1 ? 'warning' : (badges[0].text === '警戒' ? 'success' : ''));
                badges.forEach(function(b) { b.cls = cls; });
                return badges;
            }

            // 检查严寒
            function checkCold() {
                window.NORTH_CTX.survival.eventsSinceCold++;
                if (window.NORTH_CTX.survival.eventsSinceCold >= 3) {
                    // 火把免疫：跳过严寒检定
                    if (window.NORTH_CTX.survival.torchChecks > 0) {
                        window.NORTH_CTX.survival.torchChecks--;
                        window.NORTH_CTX.survival.eventsSinceCold = 0;
                        window.NORTH_CTX.addSystemLog('🔥 火把庇护：跳过本次严寒检定（剩余' + window.NORTH_CTX.survival.torchChecks + '次）', 'success');
                        return;
                    }
                    window.NORTH_CTX.survival.eventsSinceCold = 0;
                    const dc = getColdDC();
                    // 模拟体质豁免 (使用当前角色的体质)
                    let bonus = 0;
                    let profText = '';
                    if (window.NORTH_CTX.activeChar) {
                        const conMod = window.NORTH_CTX.abilityMod(window.NORTH_CTX.activeChar.con);
                        const saves = window.NORTH_CTX.activeChar.saveProfs || {};
                        const hasProf = saves['体质'] || 0;
                        const prof = hasProf ? (window.NORTH_CTX.activeChar.profBonus || 0) : 0;
                        bonus = conMod + prof - window.NORTH_CTX.survival.coldLevel;
                        profText = hasProf ? `(熟练+${prof})` : '';
                    }
                    var d20 = window.NORTH_CTX.rand(20);
                    // 状态池：体质检定优势（优先，检定后自动消耗）
                    var poolAdv = (window.NORTH_CTX.findStatus && window.NORTH_CTX.findStatus('adv:con')) || null;
                    if (poolAdv) {
                        var d20b = window.NORTH_CTX.rand(20);
                        var advText = ' [状态优势' + d20 + '/' + d20b + ']';
                        d20 = Math.max(d20, d20b);
                    }
                    // 驱寒药膏：寒冷抵抗优势
                    else if (window.NORTH_CTX.survival.coldResist > 0) {
                        var d20b = window.NORTH_CTX.rand(20);
                        var advText = ' [优势' + d20 + '/' + d20b + ']';
                        d20 = Math.max(d20, d20b);
                    } else { var advText = ''; }
                    const total = d20 + bonus;
                    const success = total >= dc;
                    // 状态池体质优势检定后自动消耗（无论成败）
                    if (poolAdv && window.NORTH_CTX.consumeStatus) window.NORTH_CTX.consumeStatus('adv:con');

                    let msg = `❄️ 严寒考验 (DC${dc})：d20=${d20} + ${bonus}${profText} = ${total}${advText||''}`;
                    if (success) {
                        window.NORTH_CTX.addSystemLog(msg, 'success');
                    } else {
                        window.NORTH_CTX.survival.coldLevel = Math.min(window.NORTH_CTX.survival.coldLevel + 1, 3);
                        // 严寒侵袭，损失生命
                        let hpMsg = '';
                        if (window.NORTH_CTX.activeChar) {
                            const dmg = window.NORTH_CTX.rollDiceExpr('1d4');
                            window.NORTH_CTX.activeChar.hp = Math.max(0, window.NORTH_CTX.activeChar.hp - dmg);
                            window.NORTH_CTX.renderCharDetail(window.NORTH_CTX.activeCharId);
                            hpMsg = `，失去 ${dmg} 点生命`;
                            if (window.NORTH_CTX.activeChar.hp <= 0) { window.NORTH_CTX.checkHpZero(); }
                        }
                        window.NORTH_CTX.addSystemLog(msg + hpMsg, 'danger');
                        if (window.NORTH_CTX.survival.coldLevel >= 3) {
                            window.NORTH_CTX.addSystemLog('⚠️ 严寒3级，陷入力竭1级！', 'danger');
                        }
                    }
                    window.NORTH_CTX.updateSurvivalUI();
                    return { success, dc, d20, bonus };
                }
                return null;
            }

            // 检查口粮消耗
            function checkRation() {
                // 在安全地点不消耗，也不计数
                if (window.NORTH_CTX.survival.isInShelter) return null;
                window.NORTH_CTX.survival.eventsSinceRation++;

                if (window.NORTH_CTX.survival.eventsSinceRation >= 4) {
                    window.NORTH_CTX.survival.eventsSinceRation = 0;
                    if (window.NORTH_CTX.survival.rations > 0) {
                        // 有口粮：只消耗口粮，不碰背包食物
                        window.NORTH_CTX.survival.rations--;
                        let msg = `🍖 消耗1份口粮，剩余 ${window.NORTH_CTX.survival.rations} 份`;
                        window.NORTH_CTX.addSystemLog(msg, 'system');
                        // 如果在断粮中且有口粮了，解除断粮
                        if (window.NORTH_CTX.survival.isStarving) {
                            window.NORTH_CTX.survival.isStarving = false;
                            window.NORTH_CTX.survival.starvationCount = 0;
                            window.NORTH_CTX.addSystemLog('🍖 口粮已恢复，断粮状态解除', 'success');
                        }
                    } else {
                        // 口粮已耗尽：进入断粮状态（口粮耗尽后才在下一次消耗时进入）
                        if (!window.NORTH_CTX.survival.isStarving) {
                            window.NORTH_CTX.survival.isStarving = true;
                            window.NORTH_CTX.survival.starvationCount = 0;
                            window.NORTH_CTX.addSystemLog('⚠️ 口粮耗尽！进入断粮状态！（体质豁免劣势，移速-10尺）', 'danger');
                        }
                        // 已在断粮中 → checkStarvation 处理食物消耗和掉血
                    }
                    window.NORTH_CTX.updateSurvivalUI();
                    return true;
                }
                return null;
            }

            // 断粮状态监测：每事件检查食物，积累到3次无食物则掉血
            function checkStarvation() {
                if (!window.NORTH_CTX.survival.isStarving) return;

                // 优先检查口粮是否已恢复（事件中获得）
                if (window.NORTH_CTX.survival.rations > 0) {
                    window.NORTH_CTX.survival.isStarving = false;
                    window.NORTH_CTX.survival.starvationCount = 0;
                    window.NORTH_CTX.addSystemLog('🍖 口粮已恢复，断粮状态解除', 'success');
                    window.NORTH_CTX.updateSurvivalUI();
                    return;
                }

                // 尝试从背包消耗食物脱离断粮
                if (window.NORTH_CTX.activeChar && window.NORTH_CTX.activeChar.inventory) {
                    var foodItems = ['浆果/野菜','兽肉'];
                    for (var fi = 0; fi < foodItems.length; fi++) {
                        for (var si = 0; si < window.NORTH_CTX.activeChar.inventory.length; si++) {
                            if (window.NORTH_CTX.activeChar.inventory[si].name === foodItems[fi] && window.NORTH_CTX.activeChar.inventory[si].qty > 0) {
                                window.NORTH_CTX.activeChar.inventory[si].qty--;
                                window.NORTH_CTX.survival.isStarving = false;
                                window.NORTH_CTX.survival.starvationCount = 0;
                                window.NORTH_CTX.addSystemLog('🍖 消耗背包中的' + foodItems[fi] + '，断粮状态解除', 'success');
                                if (window.NORTH_CTX.activeChar.inventory[si].qty <= 0) window.NORTH_CTX.activeChar.inventory.splice(si, 1);
                                window.NORTH_CTX.updateSurvivalUI();
                                return;
                            }
                        }
                    }
                }

                // 无任何食物来源，累计断粮计数
                window.NORTH_CTX.survival.starvationCount++;
                if (window.NORTH_CTX.survival.starvationCount >= 3) {
                    window.NORTH_CTX.survival.starvationCount = 0;
                    if (window.NORTH_CTX.activeChar) {
                        const dmg = window.NORTH_CTX.rollDiceExpr('1d4');
                        window.NORTH_CTX.activeChar.hp = Math.max(0, window.NORTH_CTX.activeChar.hp - dmg);
                        window.NORTH_CTX.renderCharDetail(window.NORTH_CTX.activeCharId);
                        window.NORTH_CTX.addSystemLog(`💔 断粮导致 ${dmg} 点生命流失！`, 'danger');
                        if (window.NORTH_CTX.activeChar.hp <= 0) { window.NORTH_CTX.checkHpZero(); }
                    }
                }
            }

            // 检查迷失
            function checkOrient() {
                window.NORTH_CTX.survival.eventsSinceOrient++;
                if (window.NORTH_CTX.survival.eventsSinceOrient >= 5) {
                    window.NORTH_CTX.survival.eventsSinceOrient = 0;
                    let dc = 12 + window.NORTH_CTX.survival.lostDcPenalty;
                    if (window.NORTH_CTX.survival.difficulty === 'hardcore') dc += 2;
                    if (window.NORTH_CTX.survival.difficulty === 'light') dc = Math.max(dc - 2, 10);

                    let bonus = 0;
                    let profText = '';
                    if (window.NORTH_CTX.activeChar) {
                        const wisMod = window.NORTH_CTX.abilityMod(window.NORTH_CTX.activeChar.wis);
                        const skills = window.NORTH_CTX.activeChar.skillProfs || {};
                        const saves = window.NORTH_CTX.activeChar.saveProfs || {};
                        const hasProf = (skills['生存'] || saves['感知'] || 0);
                        const prof = hasProf ? (window.NORTH_CTX.activeChar.profBonus || 0) : 0;
                        bonus = wisMod + prof;
                        profText = hasProf ? `(熟练+${prof})` : '';
                    }
                    const d20o = window.NORTH_CTX.rand(20);
                    const totalO = d20o + bonus;
                    const success = totalO >= dc;

                    let msg = `🧭 方向感检定 (DC${dc})：d20=${d20o} + ${bonus}${profText} = ${totalO}`;
                    if (success) {
                        window.NORTH_CTX.addSystemLog(msg, 'success');
                    } else {
                        window.NORTH_CTX.survival.isLost = true;
                        window.NORTH_CTX.survival.lostEventsRemaining = 2;
                        window.NORTH_CTX.survival.lostDcPenalty = Math.min(3, window.NORTH_CTX.survival.lostDcPenalty + 1);
                        window.NORTH_CTX.addSystemLog(msg, 'danger');
                    }
                    window.NORTH_CTX.updateSurvivalUI();
                    return { success, dc, d20o, bonus };
                }
                return null;
            }

            // 检查燃料消耗（庇护所内不消耗）
            function checkFuel() {
                if (window.NORTH_CTX.survival.lightActive && !window.NORTH_CTX.survival.isInShelter) {
                    window.NORTH_CTX.survival.lightRemaining--;
                    if (window.NORTH_CTX.survival.lightRemaining <= 0) {
                        window.NORTH_CTX.survival.lightActive = false;
                        window.NORTH_CTX.survival.lightType = null;
                        window.NORTH_CTX.addSystemLog('🔥 火源燃尽，陷入黑暗', 'warning');
                        window.NORTH_CTX.updateSurvivalUI();
                    }
                }
            }
    window.NORTH_SURVIVAL = {
        getColdDC: getColdDC,
        getColdEffect: getColdEffect,
        getColdBadge: getColdBadge,
        getSurvivalBadges: getSurvivalBadges,
        checkCold: checkCold,
        checkRation: checkRation,
        checkStarvation: checkStarvation,
        checkOrient: checkOrient,
        checkFuel: checkFuel,
    };
})();
