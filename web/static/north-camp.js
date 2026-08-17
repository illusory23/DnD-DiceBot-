/* ━━━ 北境雪原 · 营地系统模块 ━━━
 * 从 north-main.js 拆分（2026-08-17 第五次拆分）
 * 商店/营地仓库/工作间；运行期依赖经 window.NORTH_CAMP_CTX 注入
 */
(function () {
    'use strict';

                function _invRenderKey(inv, extra) {
                    var k = (Array.isArray(inv) ? inv : []).map(function (it) {
                        return (it.id || '') + ':' + (it.qty || it.quantity || 1) + ':' + (it.item_name || it.name || '');
                    }).join('|');
                    return k + '#' + (extra || '');
                }
                // 营地仓库数据规范化见顶部 normalizeCampStorage（存档层）

                function renderShopBackpack(panelId) {
                    var bp = document.getElementById(panelId + 'Backpack');
                    var grid = document.getElementById(panelId + 'BackpackGrid');
                    if (!grid || !bp) return;
                    if (bp.classList.contains('collapsed')) return;
                    var key = _invRenderKey(window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.inventory);
                    if (renderShopBackpack._lastKey === key) return;
                    renderShopBackpack._lastKey = key;
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || window.NORTH_CAMP_CTX.activeChar.inventory.length === 0) {
                        var emptyHtml = '<div style="color:#7a6a5a;text-align:center;padding:1rem;grid-column:1/-1;">背包空空如也…</div>';
                        // 即使背包空也显示金币
                        if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins) {
                            emptyHtml += renderShopCoinsBar();
                        }
                        grid.innerHTML = emptyHtml;
                        return;
                    }
                    var isSupply = (panelId === 'supply');
                    var html = '';
                    for (var i = 0; i < window.NORTH_CAMP_CTX.activeChar.inventory.length; i++) {
                        var it = window.NORTH_CAMP_CTX.activeChar.inventory[i];
                        if (it.qty <= 0) continue;
                        var clickHandler = isSupply ? 'onclick="shopSellItem(' + i + ')"' : '';
                        var sellHint = isSupply ? 'title="点击出售 ' + it.name + ' ×' + it.qty + '"' : 'title="' + it.name + ' ×' + it.qty + '"';
                        html += '<div class="ws-bp-item" ' + clickHandler + ' ' + sellHint + '>';
                        html += '<span class="bp-name">' + (it.name.length > 5 ? it.name.slice(0,5)+'…' : it.name) + '</span>';
                        html += '<span class="bp-qty">×' + it.qty + '</span></div>';
                    }
                    // 金币显示
                    if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins) {
                        html += renderShopCoinsBar();
                    }
                    if (isSupply && html) {
                        html += '<div style="grid-column:1/-1;font-size:0.6rem;color:#6a5a4a;text-align:center;margin-top:0.2rem;">💰 点击物品出售</div>';
                    }
                    grid.innerHTML = html || '<div style="color:#7a6a5a;text-align:center;padding:1rem;grid-column:1/-1;">背包空空如也…</div>';
                }

                // 渲染金币栏（补给站/铁匠/炼金/仓库背包通用）
                function renderShopCoinsBar() {
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.coins) return '';
                    return '<div style="grid-column:1/-1;font-size:0.68rem;text-align:center;padding:0.3rem 0;border-top:1px solid rgba(255,255,255,0.06);margin-top:0.2rem;">💰 ' + window.NORTH_CAMP_CTX.fmtCoinHtml(window.NORTH_CAMP_CTX.activeChar.coins.gp, window.NORTH_CAMP_CTX.activeChar.coins.sp, window.NORTH_CAMP_CTX.activeChar.coins.cp) + '</div>';
                }

                // 刷新所有补给站/铁匠/炼金的背包
                function refreshAllShopBackpacks() {
                    renderShopBackpack('supply');
                    renderShopBackpack('smith');
                    renderShopBackpack('alchemy');
                }

                // 两段式丝滑展开/折叠背包面板
                window.toggleShopBackpack = function(panelId) {
                    var bp = document.getElementById(panelId + 'Backpack');
                    var btn = document.getElementById(panelId + 'BpToggle');
                    if (!bp || !btn) return;
                    var wasCollapsed = bp.classList.contains('collapsed');

                    if (wasCollapsed) {
                        // ★ 打开：两段式展开
                        // 第一段：水平展开 → 显示标题栏
                        bp.classList.remove('collapsed');
                        btn.innerHTML = '✕';
                        btn.title = '关闭背包';
                        window.NORTH_CAMP_CTX.shopBpCollapsed[panelId] = false;
                        // 第二段：延迟后向下展开网格
                        setTimeout(function() {
                            bp.classList.add('expanded');
                            renderShopBackpack(panelId);
                        }, 360);
                    } else if (bp.classList.contains('expanded')) {
                        // ★ 关闭：先收网格再收宽度
                        bp.classList.remove('expanded');
                        btn.innerHTML = '🎒';
                        btn.title = '打开背包';
                        window.NORTH_CAMP_CTX.shopBpCollapsed[panelId] = true;
                        setTimeout(function() {
                            bp.classList.add('collapsed');
                        }, 400);
                    }
                };

                // 恢复折叠/展开状态（跨标签切换时保持用户选择）
                function restoreShopBpState() {
                    ['supply','smith','alchemy'].forEach(function(pid) {
                        var bp = document.getElementById(pid + 'Backpack');
                        var btn = document.getElementById(pid + 'BpToggle');
                        if (!bp || !btn) return;
                        if (window.NORTH_CAMP_CTX.shopBpCollapsed[pid]) {
                            // 恢复折叠态
                            bp.classList.add('collapsed');
                            bp.classList.remove('expanded');
                            btn.innerHTML = '🎒';
                            btn.title = '打开背包';
                        } else {
                            // 恢复展开态（两段都已展开）
                            bp.classList.remove('collapsed');
                            bp.classList.add('expanded');
                            btn.innerHTML = '✕';
                            btn.title = '关闭背包';
                            // 重新渲染内容
                            renderShopBackpack(pid);
                        }
                    });
                }

                // ━━ 工坊封面进入/返回 ━━
                var wsEntered = { supply:false, craft:false, smith:false, alchemy:false };
                // shopFundsGP/SP/CP、shopCurrentPrices、shopCurrentStock、caravanReturnCounter
                // wsSmeltOre/Coal/Bars/Ingot/Timer/Progress 已提升至全局作用域
                window.enterWorkshop = function(pid) {
                    if (window.NORTH_CAMP_CTX.survival.exploreDepth !== 0) {
                        window.NORTH_CAMP_CTX.showPopup('🏕️ 您正在雪原中探索，尚未返回', 'warn');
                        return;
                    }
                    if (pid === 'supply') {
                        renderShop();
                    }
                    var cover = document.getElementById(pid + 'Cover');
                    var content = document.getElementById(pid + 'Content');
                    if (!cover || !content) return;
                    cover.classList.add('hidden');
                    content.style.display = '';
                    wsEntered[pid] = true;
                    if (pid === 'supply') { refreshAllShopBackpacks();
                        renderShop(); }
                    if (pid === 'smith') { refreshAllShopBackpacks(); }
                    if (pid === 'alchemy') { refreshAllShopBackpacks(); }
                    if (pid === 'craft') { wsRenderBackpack();
                        wsRenderRecipes(); }
                };
                window.leaveWorkshop = function(pid) {
                    var cover = document.getElementById(pid + 'Cover');
                    var content = document.getElementById(pid + 'Content');
                    if (!cover || !content) return;
                    cover.classList.remove('hidden');
                    content.style.display = 'none';
                    wsEntered[pid] = false;
                    // 折叠背包
                    if (pid === 'supply' || pid === 'smith' || pid === 'alchemy') {
                        var bp = document.getElementById(pid + 'Backpack');
                        if (bp && !bp.classList.contains('collapsed')) {
                            bp.classList.add('collapsed');
                            bp.classList.remove('expanded');
                            var btn = document.getElementById(pid + 'BpToggle');
                            if (btn) { btn.innerHTML = '🎒';
                                btn.title = '打开背包'; }
                            window.NORTH_CAMP_CTX.shopBpCollapsed[pid] = true;
                        }
                    }
                };
                // 切换底部标签时重置封面状态
                function resetWorkshopCover(pid) {
                    var cover = document.getElementById(pid + 'Cover');
                    var content = document.getElementById(pid + 'Content');
                    if (!cover || !content) return;
                    cover.classList.remove('hidden');
                    content.style.display = 'none';
                    wsEntered[pid] = false;
                }

                // ━━ 冒险补给站商店系统 ━━
                // shopFunds 已提升至全局
                function shopFundsTotalCP() { return (window.NORTH_CAMP_CTX.shopFundsGP * 10 + window.NORTH_CAMP_CTX.shopFundsSP) * 10 + window.NORTH_CAMP_CTX.shopFundsCP; }
                function fmtFunds() {
                    return window.NORTH_CAMP_CTX.fmtCoinHtml(window.NORTH_CAMP_CTX.shopFundsGP, window.NORTH_CAMP_CTX.shopFundsSP, window.NORTH_CAMP_CTX.shopFundsCP);
                }
                function deductShopFunds(totalPriceFloat) {
                    var totalCP = Math.round(totalPriceFloat * 100);
                    var curCP = ((window.NORTH_CAMP_CTX.shopFundsGP * 10 + window.NORTH_CAMP_CTX.shopFundsSP) * 10) + window.NORTH_CAMP_CTX.shopFundsCP;
                    curCP -= totalCP;
                    if (curCP < 0) curCP = 0;
                    window.NORTH_CAMP_CTX.shopFundsGP = Math.floor(curCP / 100);
                    window.NORTH_CAMP_CTX.shopFundsSP = Math.floor((curCP % 100) / 10);
                    window.NORTH_CAMP_CTX.shopFundsCP = curCP % 10;
                }
                // shopCurrentPrices/Stock、shopCaravanItems、caravanReturnCounter 已提升至全局
                var shopSellMode = false;     // 背包点击是否为出售模式

                // 店铺补给数据
                const SHOP_SUPPLY = [
                    { name:'口粮（2份）', priceMin:3, priceMax:3, stock:Infinity, wp:null },
                    { name:'火把', priceMin:4, priceMax:6, stock:Infinity, wp:33 },
                    { name:'药草', priceMin:3, priceMax:5, stock:5, wp:1 },
                    { name:'驱寒药膏', priceMin:12, priceMax:18, stock:3, wp:37 },
                    { name:'治疗药水', priceMin:25, priceMax:40, stock:3, wp:34 },
                    { name:'煤矿', priceMin:6, priceMax:8, stock:3, wp:16 },
                    { name:'岩盐', priceMin:1, priceMax:3, stock:Infinity, wp:15 },
                    { name:'网兜', priceMin:8, priceMax:12, stock:4, wp:35 },
                ];
                // 商队商品数据
                const SHOP_CARAVAN = [
                    { name:'铁松松脂', priceMin:5, priceMax:5, qtyMin:2, qtyMax:5, desc:'暴风雪燃料+1d6火焰附魔', wp:8 },
                    { name:'魔法泉水', priceMin:8, priceMax:12, qtyMin:2, qtyMax:6, desc:'单独饮用后下次智力相关检定优势，也许可以调配为药水', wp:2 },
                    { name:'松茸', priceMin:5, priceMax:8, qtyMin:2, qtyMax:5, desc:'食用后下次力量或体质检定优势', wp:6 },
                    { name:'霜羽雉的银羽', priceMin:10, priceMax:20, qtyMin:1, qtyMax:4, desc:'装饰品', wp:11 },
                    { name:'绒蜂蜜', priceMin:20, priceMax:20, qtyMin:1, qtyMax:4, desc:'1d4生命+寒冷抗性', wp:12 },
                    { name:'银蛛蛛网', priceMin:5, priceMax:5, qtyMin:1, qtyMax:6, desc:'韧性较强，较稀有材料', wp:13 },
                    { name:'铜矿', priceMin:3, priceMax:5, qtyMin:2, qtyMax:4, desc:'可熔炼→铜锭', wp:17 },
                    { name:'铁矿', priceMin:6, priceMax:8, qtyMin:1, qtyMax:4, desc:'可熔炼→铁锭', wp:18 },
                    { name:'银矿', priceMin:15, priceMax:30, qtyMin:1, qtyMax:3, desc:'可熔炼→银锭', wp:19 },
                    { name:'金矿', priceMin:30, priceMax:50, qtyMin:1, qtyMax:3, desc:'可熔炼→金锭', wp:20 },
                    { name:'寒铁矿', priceMin:15, priceMax:25, qtyMin:1, qtyMax:3, desc:'北境特产，魔力相性更好', wp:21 },
                    { name:'寒铁髓', priceMin:100, priceMax:100, qtyMin:1, qtyMax:1, desc:'寒铁精华，顶级材料', wp:22 },
                    { name:'霜晶核', priceMin:80, priceMax:80, qtyMin:1, qtyMax:1, desc:'蕴含冰冷能量，附魔核心', wp:23 },
                    { name:'冰水晶', priceMin:50, priceMax:80, qtyMin:1, qtyMax:1, desc:'魔法水晶', wp:24 },
                    { name:'化石', priceMin:1, priceMax:30, qtyMin:1, qtyMax:3, desc:'收藏与研究价值', wp:25 },
                    { name:'宝石', priceMin:20, priceMax:50, qtyMin:1, qtyMax:3, desc:'可制作饰品/魔法物品', wp:26 },
                    { name:'巨兽之骨', priceMin:100, priceMax:100, qtyMin:1, qtyMax:1, desc:'远古巨兽的骨头', wp:28 },
                    { name:'白花藤', priceMin:16, priceMax:16, qtyMin:1, qtyMax:3, desc:'1d4生命，稀有药材', wp:31 },
                    { name:'铜锭', priceMin:12, priceMax:12, qtyMin:1, qtyMax:3, desc:'可打造工具', wp:38 },
                    { name:'铁锭', priceMin:16, priceMax:16, qtyMin:1, qtyMax:3, desc:'可打造工具', wp:39 },
                    { name:'银锭', priceMin:32, priceMax:32, qtyMin:1, qtyMax:3, desc:'可制作饰品', wp:40 },
                    { name:'金锭', priceMin:60, priceMax:60, qtyMin:1, qtyMax:3, desc:'可制作饰品/魔法物品', wp:41 },
                    { name:'寒铁锭', priceMin:30, priceMax:30, qtyMin:1, qtyMax:3, desc:'可打造工具', wp:42 },
                    { name:'兽肉', priceMin:8, priceMax:8, qtyMin:3, qtyMax:8, desc:'食材，烹煮→2d2口粮', wp:30 },
                ];

                function randPrice(minGP, maxGP) {
                    if (minGP === maxGP) return { gp: minGP, sp: 0 };
                    var totalSP = Math.floor(Math.random() * (maxGP * 10 - minGP * 10 + 1)) + minGP * 10;
                    var gp = Math.floor(totalSP / 10);
                    var sp = totalSP % 10;
                    return { gp: gp, sp: sp };
                }
                function priceToStr(p) { return '<span style="color:#ffd700;">' + p.gp + ' GP</span>' + (p.sp > 0 ? ' <span style="color:#c0c0c0;">' + p.sp + ' SP</span>' : ''); }
                function priceToGP(p) { return p.gp + p.sp / 10; }

                function refreshShopSupply() {
                    window.NORTH_CAMP_CTX.shopCurrentPrices = {};
                    window.NORTH_CAMP_CTX.shopCurrentStock = {};
                    SHOP_SUPPLY.forEach(function(item) {
                        var p = randPrice(item.priceMin, item.priceMax);
                        window.NORTH_CAMP_CTX.shopCurrentPrices[item.name] = p;
                        window.NORTH_CAMP_CTX.shopCurrentStock[item.name] = item.stock === Infinity ? 999 : item.stock;
                    });
                }
                function refreshCaravan() {
                    window.NORTH_CAMP_CTX.shopCaravanItems = [];
                    // 随机选最多10种
                    var pool = SHOP_CARAVAN.slice();
                    // 随机排列
                    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = pool[i];
                        pool[i] = pool[j];
                        pool[j] = tmp; }
                    var maxTypes = Math.min(10, pool.length);
                    var count = 1 + Math.floor(Math.random() * maxTypes); // 随机1~10种
                    for (var ci = 0; ci < count; ci++) {
                        var item = pool[ci];
                        var p = item.priceMin === item.priceMax
                            ? { gp: item.priceMin, sp: 0 }
                            : randPrice(item.priceMin, item.priceMax);
                        // ±40%浮动
                        if (item.priceMin !== item.priceMax || item.priceMin > 5) {
                            var baseSP = p.gp * 10 + p.sp;
                            var floatSP = Math.floor(baseSP * (0.6 + Math.random() * 0.8)); // 0.6~1.4倍
                            if (floatSP < 10) floatSP = 10;
                            p.gp = Math.floor(floatSP / 10);
                            p.sp = floatSP % 10;
                        }
                        var qty = item.qtyMin + Math.floor(Math.random() * (item.qtyMax - item.qtyMin + 1));
                        window.NORTH_CAMP_CTX.shopCaravanItems.push({ name: item.name, priceGP: p.gp, priceSP: p.sp, qty: qty, desc: item.desc });
                    }
                    // 矿石价格不能比矿锭高
                    var oreIngotPairs = [['铜矿','铜锭'],['铁矿','铁锭'],['银矿','银锭'],['金矿','金锭'],['寒铁矿','寒铁锭']];
                    oreIngotPairs.forEach(function(pair) {
                        var oreItem = null, ingotItem = null, ingotData = null;
                        for (var oi = 0; oi < window.NORTH_CAMP_CTX.shopCaravanItems.length; oi++) {
                            if (window.NORTH_CAMP_CTX.shopCaravanItems[oi].name === pair[0]) oreItem = window.NORTH_CAMP_CTX.shopCaravanItems[oi];
                            if (window.NORTH_CAMP_CTX.shopCaravanItems[oi].name === pair[1]) { ingotItem = window.NORTH_CAMP_CTX.shopCaravanItems[oi];
                                ingotData = SHOP_CARAVAN.find(function(d){return d.name===pair[1];}); }
                        }
                        if (!oreItem || !ingotItem || !ingotData) return;
                        var orePrice = oreItem.priceGP * 10 + oreItem.priceSP;
                        var ingotPrice = ingotItem.priceGP * 10 + ingotItem.priceSP;
                        var retries = 0;
                        while (ingotPrice <= orePrice && retries < 20) {
                            var newP = randPrice(ingotData.priceMin, ingotData.priceMax);
                            ingotPrice = Math.max(orePrice + 1, newP.gp * 10 + newP.sp);
                            ingotItem.priceGP = Math.floor(ingotPrice / 10);
                            ingotItem.priceSP = ingotPrice % 10;
                            retries++;
                        }
                    });
                }
                function refreshShopFunds() {
                    window.NORTH_CAMP_CTX.shopFundsGP = 800 + Math.floor(Math.random() * 401); // 800-1200
                    window.NORTH_CAMP_CTX.shopFundsSP = Math.floor(Math.random() * 10); // 0-9 SP
                }
                function getShopSellPrice(itemName) {
                    if (window.NORTH_CAMP_CTX.shopCurrentPrices[itemName]) return priceToGP(window.NORTH_CAMP_CTX.shopCurrentPrices[itemName]) * 0.75;
                    for (var ci = 0; ci < window.NORTH_CAMP_CTX.shopCaravanItems.length; ci++) {
                        if (window.NORTH_CAMP_CTX.shopCaravanItems[ci].name === itemName) {
                            return (window.NORTH_CAMP_CTX.shopCaravanItems[ci].priceGP + window.NORTH_CAMP_CTX.shopCaravanItems[ci].priceSP / 10) * 0.75;
                        }
                    }
                    for (var bi = 0; bi < SHOP_CARAVAN.length; bi++) {
                        if (SHOP_CARAVAN[bi].name === itemName) {
                            var midPrice = (SHOP_CARAVAN[bi].priceMin + SHOP_CARAVAN[bi].priceMax) / 2;
                            return midPrice * 0.75;
                        }
                    }
                    return -1;
                }
                function canSellItem(itemName) {
                    if (window.NORTH_CAMP_CTX.shopCurrentPrices[itemName] !== undefined) return true;
                    for (var ci = 0; ci < window.NORTH_CAMP_CTX.shopCaravanItems.length; ci++) {
                        if (window.NORTH_CAMP_CTX.shopCaravanItems[ci].name === itemName) return true;
                    }
                    return false;
                }

                // 初始化（DOMContentLoaded 捕获阶段执行：先于 main.js 的 init，
                // 且此时 main.js 已同步执行完毕、桥必然就绪）
                function __campInit() {
                    if (!window.NORTH_CAMP_CTX) { setTimeout(__campInit, 50); return; }
                    __installShowPopupHook();
                    refreshShopSupply();
                    refreshCaravan();
                    refreshShopFunds();
                    window.NORTH_CAMP_CTX.caravanReturnCounter = 0;
                }
                document.addEventListener('DOMContentLoaded', __campInit, true);

                function renderShop() {
                    var grid = document.getElementById('shopGrid');
                    if (!grid) return;
                    var html = '';
                    // 商店资金
                    html += '<div style="grid-column:1/-1;font-size:0.72rem;color:#8a7a5a;margin-bottom:0.3rem;">💰 商店资金：' + fmtFunds() + '</div>';

                    // === 店铺补给 ===
                    html += '<div style="grid-column:1/-1;font-size:0.78rem;color:#d4a860;border-bottom:1px solid rgba(212,168,96,0.15);padding-bottom:0.2rem;margin-bottom:0.2rem;">📦 店铺补给</div>';
                    SHOP_SUPPLY.forEach(function(item) {
                        var p = window.NORTH_CAMP_CTX.shopCurrentPrices[item.name] || { gp: 0, sp: 0 };
                        var stock = window.NORTH_CAMP_CTX.shopCurrentStock[item.name] || 0;
                        var cp = window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins ? ((window.NORTH_CAMP_CTX.activeChar.coins.gp||0)*10+(window.NORTH_CAMP_CTX.activeChar.coins.sp||0))*10+(window.NORTH_CAMP_CTX.activeChar.coins.cp||0) : 0;
                        var canBuy = stock > 0 && cp >= (p.gp * 10 + p.sp) * 10;
                        html += '<div class="shop-card">' +
                            '<div class="sc-name">' + item.name + '</div>' +
                            '<div class="sc-price">' + priceToStr(p) + '</div>' +
                            '<div style="font-size:0.6rem;color:#5a7a6a;">库存：' + (stock >= 999 ? '∞' : stock) + '</div>' +
                            '<button class="sc-buy-btn" ' + (canBuy ? '' : 'disabled') + ' onclick="shopBuyItem(\'' + item.name + '\',\'supply\')">购买</button>' +
                            '</div>';
                    });

                    // === 商队商品 ===
                    if (window.NORTH_CAMP_CTX.caravanReturnCounter === 0) {
                        html += '<div style="grid-column:1/-1;font-size:0.78rem;color:#d4a860;border-bottom:1px solid rgba(212,168,96,0.15);padding-bottom:0.2rem;margin-top:0.8rem;margin-bottom:0.2rem;">🐪 商队商品</div>';
                        window.NORTH_CAMP_CTX.shopCaravanItems.forEach(function(item, ci) {
                            var ccp = window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins ? ((window.NORTH_CAMP_CTX.activeChar.coins.gp||0)*10+(window.NORTH_CAMP_CTX.activeChar.coins.sp||0))*10+(window.NORTH_CAMP_CTX.activeChar.coins.cp||0) : 0;
                            var canBuy = item.qty > 0 && ccp >= (item.priceGP * 10 + item.priceSP) * 10;
                            html += '<div class="shop-card">' +
                                '<div class="sc-name">' + item.name + '</div>' +
                                '<div class="sc-desc">' + (item.desc || '') + '</div>' +
                                '<div class="sc-price">' + priceToStr({gp:item.priceGP, sp:item.priceSP || 0}) + '</div>' +
                                '<div style="font-size:0.6rem;color:#5a7a6a;">库存：' + item.qty + '</div>' +
                                '<button class="sc-buy-btn" ' + (canBuy ? '' : 'disabled') + ' onclick="shopBuyItem(\'' + item.name + '\',\'caravan\')">购买</button>' +
                                '</div>';
                        });
                    } else {
                        html += '<div style="grid-column:1/-1;font-size:0.78rem;color:#d4a860;border-bottom:1px solid rgba(212,168,96,0.15);padding-bottom:0.2rem;margin-top:0.8rem;margin-bottom:0.2rem;">🐪 商队商品</div>' +
                            '<div style="grid-column:1/-1;text-align:center;color:#6a5a4a;font-size:0.75rem;padding:1rem;">🐪 商队已离开，正在旅途中…（还需返回' + (4 - window.NORTH_CAMP_CTX.caravanReturnCounter) + '次）</div>';
                    }

                    grid.innerHTML = html;
                }

                window.shopBuyItem = function(itemName, source) {
                    if (!window.NORTH_CAMP_CTX.activeChar) { window.NORTH_CAMP_CTX.showPopup('请先选择角色', 'warn'); return; }
                    window.NORTH_CAMP_CTX.activeChar.coins = window.NORTH_CAMP_CTX.activeChar.coins || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                    var priceGP, priceSP, storeIdx = -1, maxStock;
                    if (source === 'supply') {
                        var p = window.NORTH_CAMP_CTX.shopCurrentPrices[itemName];
                        if (!p) return;
                        priceGP = p.gp; priceSP = p.sp || 0;
                        maxStock = window.NORTH_CAMP_CTX.shopCurrentStock[itemName];
                        if (maxStock <= 0) { window.NORTH_CAMP_CTX.showPopup('库存不足', 'warn'); return; }
                    } else {
                        for (var i = 0; i < window.NORTH_CAMP_CTX.shopCaravanItems.length; i++) { if (window.NORTH_CAMP_CTX.shopCaravanItems[i].name === itemName) { storeIdx = i; break; } }
                        if (storeIdx < 0) return;
                        priceGP = window.NORTH_CAMP_CTX.shopCaravanItems[storeIdx].priceGP;
                        priceSP = window.NORTH_CAMP_CTX.shopCaravanItems[storeIdx].priceSP || 0;
                        maxStock = window.NORTH_CAMP_CTX.shopCaravanItems[storeIdx].qty;
                        if (maxStock <= 0) { window.NORTH_CAMP_CTX.showPopup('库存不足', 'warn'); return; }
                    }
                    var playerCP = ((window.NORTH_CAMP_CTX.activeChar.coins.gp || 0) * 10 + (window.NORTH_CAMP_CTX.activeChar.coins.sp || 0)) * 10 + (window.NORTH_CAMP_CTX.activeChar.coins.cp || 0);
                    var unitCP = (priceGP * 10 + priceSP) * 10;
                    if (playerCP < unitCP) { window.NORTH_CAMP_CTX.showPopup('资金不足', 'warn'); return; }
                    var maxByFunds = Math.floor(playerCP / unitCP);
                    var maxQty = Math.min(maxStock >= 999 ? 99 : maxStock, maxByFunds, 99);
                    var unitPriceFloat = priceGP + priceSP / 10;
                    // 购买数量弹窗
                    var old = document.getElementById('buyConfirmModal');
                    if (old) old.remove();
                    var overlay = document.createElement('div');
                    overlay.id = 'buyConfirmModal';
                    overlay.className = 'sell-modal-overlay';
                    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
                    overlay.innerHTML = '<div class="sell-modal">' +
                        '<div class="sell-modal-title">🛒 购买 ' + itemName + '</div>' +
                        '<div class="sell-modal-price">单价：' + priceToStr({gp:priceGP, sp:priceSP}) +
                        ' ｜ 库存：' + (maxStock >= 999 ? '∞' : maxStock) + '</div>' +
                        '<div class="sell-modal-qty">' +
                            '<span>数量：</span>' +
                            '<input type="range" min="1" max="' + maxQty + '" value="1" id="buyQtyRange" style="flex:1;">' +
                            '<span id="buyQtyVal" style="color:#f0d080;font-weight:bold;">1</span>' +
                        '</div>' +
                        '<div class="sell-modal-total">合计：<b id="buyTotalVal">' + priceToStr({gp:priceGP, sp:priceSP}) + '</b></div>' +
                        '<div class="sell-modal-btns">' +
                            '<button class="sell-modal-cancel" onclick="document.getElementById(\'buyConfirmModal\').remove()">取消</button>' +
                            '<button class="sell-modal-ok" id="buyConfirmOk">确认购买</button>' +
                        '</div></div>';
                    document.body.appendChild(overlay);
                    document.getElementById('buyQtyRange').addEventListener('input', function() {
                        var q = parseInt(this.value) || 1;
                        document.getElementById('buyQtyVal').textContent = q;
                        var total = unitPriceFloat * q;
                        var tgp = Math.floor(total);
                        var tsp = Math.round((total - tgp) * 10);
                        document.getElementById('buyTotalVal').innerHTML = priceToStr({gp:tgp, sp:tsp});
                    });
                    document.getElementById('buyConfirmOk').addEventListener('click', function() {
                        var qty = parseInt(document.getElementById('buyQtyVal').textContent) || 1;
                        var totalCP = unitCP * qty;
                        playerCP -= totalCP;
                        window.NORTH_CAMP_CTX.activeChar.coins.gp = Math.floor(playerCP / 100);
                        window.NORTH_CAMP_CTX.activeChar.coins.sp = Math.floor((playerCP % 100) / 10);
                        window.NORTH_CAMP_CTX.activeChar.coins.cp = playerCP % 10;
                        var realName = itemName === '口粮（2份）' ? '口粮' : itemName;
                        var addQty = itemName === '口粮（2份）' ? 2 * qty : qty;
                        window.NORTH_CAMP_CTX.activeChar.inventory = window.NORTH_CAMP_CTX.activeChar.inventory || [];
                        var stacked = false;
                        for (var si = 0; si < window.NORTH_CAMP_CTX.activeChar.inventory.length; si++) {
                            if (window.NORTH_CAMP_CTX.activeChar.inventory[si].name === realName) { window.NORTH_CAMP_CTX.activeChar.inventory[si].qty += addQty;
                                stacked = true; break; }
                        }
                        if (!stacked) window.NORTH_CAMP_CTX.activeChar.inventory.push({ name: realName, qty: addQty, location: '背包', weight: 1 });
                        if (source === 'supply') { if (window.NORTH_CAMP_CTX.shopCurrentStock[itemName] < 999) window.NORTH_CAMP_CTX.shopCurrentStock[itemName] -= qty; }
                        else { window.NORTH_CAMP_CTX.shopCaravanItems[storeIdx].qty -= qty; }
                        if (window.NORTH_CAMP_CTX.activeCharId) window.NORTH_CAMP_CTX.charData[window.NORTH_CAMP_CTX.activeCharId] = window.NORTH_CAMP_CTX.activeChar;
                        var totalPrice = unitPriceFloat * qty;
                        var tgp2 = Math.floor(totalPrice);
                        var tsp2 = Math.round((totalPrice - tgp2) * 10);
                        window.NORTH_CAMP_CTX.addSystemLog('🛒 购买了 ' + itemName + ' ×' + qty + '（' + priceToStr({gp:tgp2, sp:tsp2}) + '）', 'success');
                        overlay.remove();
                        renderShop();
                        refreshAllShopBackpacks();
                        if (typeof window.NORTH_CAMP_CTX.renderCampCharSheet === 'function') window.NORTH_CAMP_CTX.renderCampCharSheet();
                        if (window.NORTH_CAMP_CTX.activeCharId) window.NORTH_CAMP_CTX.renderCharDetail(window.NORTH_CAMP_CTX.activeCharId);
                    });
                };

                // 出售弹窗
                function showSellModal(idx) {
                    var it = window.NORTH_CAMP_CTX.activeChar.inventory[idx];
                    var sellPrice = getShopSellPrice(it.name);
                    var maxQty = it.qty;
                    var old = document.getElementById('sellModal');
                    if (old) old.remove();
                    var overlay = document.createElement('div');
                    overlay.id = 'sellModal';
                    overlay.className = 'sell-modal-overlay';
                    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
                    var priceGP = Math.floor(sellPrice);
                    var priceSP = Math.round((sellPrice - priceGP) * 10);
                    overlay.innerHTML = '<div class="sell-modal">' +
                        '<div class="sell-modal-title">💰 出售物品</div>' +
                        '<div class="sell-modal-item">' + it.name + '</div>' +
                        '<div class="sell-modal-price">单价：' + priceToStr({gp:priceGP, sp:priceSP}) +
                        '（商店资金：' + fmtFunds() + '）</div>' +
                        '<div class="sell-modal-qty">' +
                            '<span>数量：</span>' +
                            '<input type="range" min="1" max="' + maxQty + '" value="1" id="sellQtyRange" style="flex:1;">' +
                            '<span id="sellQtyVal" style="color:#f0d080;font-weight:bold;">1</span>' +
                        '</div>' +
                        '<div class="sell-modal-total">合计：<b id="sellTotalVal">' + priceToStr({gp:priceGP, sp:priceSP}) + '</b></div>' +
                        '<div class="sell-modal-btns">' +
                            '<button class="sell-modal-cancel" onclick="document.getElementById(\'sellModal\').remove()">取消</button>' +
                            '<button class="sell-modal-ok" id="sellConfirmBtn">确认出售</button>' +
                        '</div>' +
                    '</div>';
                    document.body.appendChild(overlay);
                    // 数量滑块事件
                    document.getElementById('sellQtyRange').addEventListener('input', function() {
                        var q = parseInt(this.value) || 1;
                        document.getElementById('sellQtyVal').textContent = q;
                        var total = sellPrice * q;
                        var tgp = Math.floor(total);
                        var tsp = Math.round((total - tgp) * 10);
                        document.getElementById('sellTotalVal').innerHTML = priceToStr({gp:tgp, sp:tsp});
                    });
                    document.getElementById('sellConfirmBtn').addEventListener('click', function() {
                        var qty = parseInt(document.getElementById('sellQtyVal').textContent) || 1;
                        var totalPrice = sellPrice * qty;
                        if (shopFundsTotalCP() < totalPrice * 100) { window.NORTH_CAMP_CTX.showPopup('本店资金不足以收购...', 'warn'); return; }
                        it.qty -= qty;
                        if (it.qty <= 0) window.NORTH_CAMP_CTX.activeChar.inventory.splice(idx, 1);
                        deductShopFunds(totalPrice);
                        var totalSP = Math.round(totalPrice * 10);
                        window.NORTH_CAMP_CTX.activeChar.coins = window.NORTH_CAMP_CTX.activeChar.coins || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                        var playerSP = (window.NORTH_CAMP_CTX.activeChar.coins.gp || 0) * 10 + (window.NORTH_CAMP_CTX.activeChar.coins.sp || 0) + totalSP;
                        window.NORTH_CAMP_CTX.activeChar.coins.gp = Math.floor(playerSP / 10);
                        window.NORTH_CAMP_CTX.activeChar.coins.sp = playerSP % 10;
                        if (window.NORTH_CAMP_CTX.activeCharId) window.NORTH_CAMP_CTX.charData[window.NORTH_CAMP_CTX.activeCharId] = window.NORTH_CAMP_CTX.activeChar;
                        var tgp3 = Math.floor(totalPrice);
                        var tsp3 = Math.round((totalPrice - tgp3) * 10);
                        window.NORTH_CAMP_CTX.addSystemLog('💰 出售 ' + it.name + ' ×' + qty + '（+' + priceToStr({gp:tgp3, sp:tsp3}) + '）', 'success');
                        overlay.remove();
                        renderShop();
                        refreshAllShopBackpacks();
                        if (typeof window.NORTH_CAMP_CTX.renderCampCharSheet === 'function') window.NORTH_CAMP_CTX.renderCampCharSheet();
                        if (window.NORTH_CAMP_CTX.activeCharId) window.NORTH_CAMP_CTX.renderCharDetail(window.NORTH_CAMP_CTX.activeCharId);
                    });
                }

                // 出售：点击背包物品
                window.shopSellItem = function(idx) {
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || idx >= window.NORTH_CAMP_CTX.activeChar.inventory.length) return;
                    var it = window.NORTH_CAMP_CTX.activeChar.inventory[idx];
                    if (!it || it.qty <= 0) return;
                    var sellPrice = getShopSellPrice(it.name);
                    if (sellPrice < 0) { window.NORTH_CAMP_CTX.showPopup('该物品无法出售...', 'warn'); return; }
                    if (shopFundsTotalCP() < sellPrice * 100) { window.NORTH_CAMP_CTX.showPopup('本店资金不足以收购此材料...', 'warn'); return; }
                    showSellModal(idx);
                };

                // 返回营地时更新商队计数和刷新商店资金
                // （showPopup 包装在 __campInit 中安装：桥就绪后执行）
                var _origShowPopup = null;
                function __installShowPopupHook() {
                    if (!window.NORTH_CAMP_CTX.showPopup) { setTimeout(__installShowPopupHook, 50); return; }
                    if (_origShowPopup) return;
                    _origShowPopup = window.NORTH_CAMP_CTX.showPopup;
                    window.NORTH_CAMP_CTX.showPopup = function(msg, type) {
                        if (type === 'back') {
                            window.NORTH_CAMP_CTX.caravanReturnCounter++;
                            if (window.NORTH_CAMP_CTX.caravanReturnCounter >= 4) window.NORTH_CAMP_CTX.caravanReturnCounter = 0;
                            if (window.NORTH_CAMP_CTX.caravanReturnCounter === 0) refreshCaravan();
                            refreshShopSupply();
                            refreshShopFunds();
                        }
                        _origShowPopup(msg, type);
                    };
                }

                // ━━ 营地仓库系统 ━━
                function storageRenderCoins() {
                    var el = document.getElementById('storageCoinsDisplay');
                    if (el) el.innerHTML = window.NORTH_CAMP_CTX.fmtCoinHtml(window.NORTH_CAMP_CTX.campStorageCoins.gp, window.NORTH_CAMP_CTX.campStorageCoins.sp, window.NORTH_CAMP_CTX.campStorageCoins.cp);
                }
                function storageRender() {
                    storageRenderStorage();
                    storageRenderBackpack();
                    storageRenderCoins();
                }
                // 存入资金到仓库
                window.storageDepositCoins = function() {
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.coins) { alert('请先选择角色'); return; }
                    var gp = parseInt(prompt('存入金币 (GP):', window.NORTH_CAMP_CTX.activeChar.coins.gp || 0)) || 0;
                    var sp = parseInt(prompt('存入银币 (SP):', window.NORTH_CAMP_CTX.activeChar.coins.sp || 0)) || 0;
                    var cp = parseInt(prompt('存入铜币 (CP):', window.NORTH_CAMP_CTX.activeChar.coins.cp || 0)) || 0;
                    if (gp < 0 || sp < 0 || cp < 0) { alert('不能为负数'); return; }
                    if (gp === 0 && sp === 0 && cp === 0) return;
                    if (gp > window.NORTH_CAMP_CTX.activeChar.coins.gp || sp > window.NORTH_CAMP_CTX.activeChar.coins.sp || cp > window.NORTH_CAMP_CTX.activeChar.coins.cp) { alert('资金不足'); return; }
                    window.NORTH_CAMP_CTX.activeChar.coins.gp -= gp; window.NORTH_CAMP_CTX.campStorageCoins.gp += gp;
                    window.NORTH_CAMP_CTX.activeChar.coins.sp -= sp; window.NORTH_CAMP_CTX.campStorageCoins.sp += sp;
                    window.NORTH_CAMP_CTX.activeChar.coins.cp -= cp; window.NORTH_CAMP_CTX.campStorageCoins.cp += cp;
                    storageRenderCoins();
                    storageRenderBackpack();
                };
                // 从仓库取出资金
                window.storageWithdrawCoins = function() {
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.coins) { alert('请先选择角色'); return; }
                    var gp = parseInt(prompt('取出金币 (GP):', Math.min(window.NORTH_CAMP_CTX.campStorageCoins.gp, 100))) || 0;
                    var sp = parseInt(prompt('取出银币 (SP):', Math.min(window.NORTH_CAMP_CTX.campStorageCoins.sp, 100))) || 0;
                    var cp = parseInt(prompt('取出铜币 (CP):', Math.min(window.NORTH_CAMP_CTX.campStorageCoins.cp, 100))) || 0;
                    if (gp < 0 || sp < 0 || cp < 0) { alert('不能为负数'); return; }
                    if (gp === 0 && sp === 0 && cp === 0) return;
                    if (gp > window.NORTH_CAMP_CTX.campStorageCoins.gp || sp > window.NORTH_CAMP_CTX.campStorageCoins.sp || cp > window.NORTH_CAMP_CTX.campStorageCoins.cp) { alert('仓库资金不足'); return; }
                    window.NORTH_CAMP_CTX.campStorageCoins.gp -= gp; window.NORTH_CAMP_CTX.activeChar.coins.gp += gp;
                    window.NORTH_CAMP_CTX.campStorageCoins.sp -= sp; window.NORTH_CAMP_CTX.activeChar.coins.sp += sp;
                    window.NORTH_CAMP_CTX.campStorageCoins.cp -= cp; window.NORTH_CAMP_CTX.activeChar.coins.cp += cp;
                    storageRenderCoins();
                    storageRenderBackpack();
                };
                function storageRenderStorage() {
                    var grid = document.getElementById('storageGrid');
                    if (!grid) return;
                    var key = _invRenderKey(window.NORTH_CAMP_CTX.campStorage);
                    if (storageRenderStorage._lastKey === key) return;
                    storageRenderStorage._lastKey = key;
                    if (!window.NORTH_CAMP_CTX.campStorage || window.NORTH_CAMP_CTX.campStorage.length === 0) {
                        grid.innerHTML = '<div style="color:#6a5a4a;text-align:center;padding:1rem;grid-column:1/-1;">仓库空空如也…</div>';
                        return;
                    }
                    var html = '';
                    for (var i = 0; i < window.NORTH_CAMP_CTX.campStorage.length; i++) {
                        var it = window.NORTH_CAMP_CTX.campStorage[i];
                        html += '<div class="st-item" onclick="storageToBackpack('+i+')" title="点击取出到背包">';
                        html += '<span class="st-name">'+it.name+'</span>';
                        html += '<span class="st-qty">×'+it.qty+'</span>';
                        html += '</div>';
                    }
                    grid.innerHTML = html;
                }
                function storageRenderBackpack() {
                    var grid = document.getElementById('storageBackpackGrid');
                    if (!grid) return;
                    var key = _invRenderKey(window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.inventory,
                                             window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins ? JSON.stringify(window.NORTH_CAMP_CTX.activeChar.coins) : '');
                    if (storageRenderBackpack._lastKey === key) return;
                    storageRenderBackpack._lastKey = key;
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || window.NORTH_CAMP_CTX.activeChar.inventory.length === 0) {
                        var emptyHtml = '<div style="color:#7a6a5a;text-align:center;padding:1rem;grid-column:1/-1;">背包空空如也…</div>';
                        if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins) emptyHtml += renderShopCoinsBar();
                        grid.innerHTML = emptyHtml;
                        return;
                    }
                    var html = '';
                    for (var i = 0; i < window.NORTH_CAMP_CTX.activeChar.inventory.length; i++) {
                        var it = window.NORTH_CAMP_CTX.activeChar.inventory[i];
                        if (it.qty <= 0) continue;
                        html += '<div class="st-bp-item" onclick="backpackToStorage('+i+')" title="点击存入仓库">';
                        html += '<span class="st-name">'+it.name+'</span>';
                        html += '<span class="st-qty">×'+it.qty+'</span>';
                        html += '</div>';
                    }
                    // 金币显示
                    if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.coins) {
                        html += renderShopCoinsBar();
                    }
                    grid.innerHTML = html || '<div style="color:#7a6a5a;text-align:center;padding:1rem;grid-column:1/-1;">背包空空如也…</div>';
                }
                let stPending = null; // {dir:'toStorage'|'toBackpack', idx:N, name:'', max:0}
                window.backpackToStorage = function(idx) {
                    if (window.NORTH_CAMP_CTX.survival.exploreDepth !== 0) { window.NORTH_CAMP_CTX.showPopup('🏕️ 您正在雪原中探索，尚未返回', 'warn'); return; }
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || idx >= window.NORTH_CAMP_CTX.activeChar.inventory.length) return;
                    var it = window.NORTH_CAMP_CTX.activeChar.inventory[idx];
                    if (!it || it.qty <= 0) return;
                    stPending = {dir:'toStorage', idx:idx, name:it.name, max:it.qty};
                    stShowModal();
                };
                window.storageToBackpack = function(idx) {
                    if (window.NORTH_CAMP_CTX.survival.exploreDepth !== 0) { window.NORTH_CAMP_CTX.showPopup('🏕️ 您正在雪原中探索，尚未返回', 'warn'); return; }
                    if (!window.NORTH_CAMP_CTX.campStorage || idx >= window.NORTH_CAMP_CTX.campStorage.length) return;
                    if (!window.NORTH_CAMP_CTX.activeChar) return;
                    var it = window.NORTH_CAMP_CTX.campStorage[idx];
                    if (!it || it.qty <= 0) return;
                    stPending = {dir:'toBackpack', idx:idx, name:it.name, max:it.qty};
                    stShowModal();
                };
                function stShowModal() {
                    if (!stPending) return;
                    var old = document.getElementById('stQtyModal');
                    if (old) old.remove();
                    var overlay = document.createElement('div');
                    overlay.id = 'stQtyModal';
                    overlay.className = 'st-qty-modal-overlay';
                    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); stPending = null; } };
                    var max = stPending.max;
                    var val = max; // 默认全部
                    overlay.innerHTML = '<div class="st-qty-modal">' +
                        '<div class="st-qty-title">'+stPending.name+'</div>' +
                        '<div class="st-qty-subtitle">'+(stPending.dir==='toStorage'?'存入仓库':'取出到背包')+' · 可用 '+max+'</div>' +
                        '<input type="range" min="1" max="'+max+'" value="'+max+'" oninput="document.getElementById(\'stQtyVal\').textContent=this.value" style="width:100%;">' +
                        '<div class="st-qty-val" id="stQtyVal">'+max+'</div>' +
                        '<div class="st-qty-btns">' +
                            '<button class="st-qty-cancel" onclick="document.getElementById(\'stQtyModal\').remove();stPending=null;">取消</button>' +
                            '<button class="st-qty-ok" id="stQtyOk">确认</button>' +
                        '</div>' +
                    '</div>';
                    document.body.appendChild(overlay);
                    document.getElementById('stQtyOk').addEventListener('click', function() {
                        var qty = parseInt(document.getElementById('stQtyVal').textContent) || 1;
                        stDoTransfer(qty);
                        overlay.remove();
                        stPending = null;
                    });
                }
                function stDoTransfer(qty) {
                    if (!stPending || qty <= 0) return;
                    var dir = stPending.dir, idx = stPending.idx, name = stPending.name;
                    if (dir === 'toStorage') {
                        if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || idx >= window.NORTH_CAMP_CTX.activeChar.inventory.length) return;
                        var it = window.NORTH_CAMP_CTX.activeChar.inventory[idx];
                        if (!it || it.qty <= 0) return;
                        qty = Math.min(qty, it.qty);
                        it.qty -= qty;
                        if (it.qty <= 0) window.NORTH_CAMP_CTX.activeChar.inventory.splice(idx, 1);
                        var found = false;
                        for (var s = 0; s < window.NORTH_CAMP_CTX.campStorage.length; s++) {
                            if (window.NORTH_CAMP_CTX.campStorage[s].name === name) { window.NORTH_CAMP_CTX.campStorage[s].qty += qty; found = true; break; }
                        }
                        if (!found) window.NORTH_CAMP_CTX.campStorage.push({name:name, qty:qty});
                    } else {
                        if (!window.NORTH_CAMP_CTX.campStorage || idx >= window.NORTH_CAMP_CTX.campStorage.length) return;
                        var sit = window.NORTH_CAMP_CTX.campStorage[idx];
                        if (!sit || sit.qty <= 0) return;
                        qty = Math.min(qty, sit.qty);
                        sit.qty -= qty;
                        if (sit.qty <= 0) window.NORTH_CAMP_CTX.campStorage.splice(idx, 1);
                        if (!window.NORTH_CAMP_CTX.activeChar) return;
                        if (!window.NORTH_CAMP_CTX.activeChar.inventory) window.NORTH_CAMP_CTX.activeChar.inventory = [];
                        var bfound = false;
                        for (var bi = 0; bi < window.NORTH_CAMP_CTX.activeChar.inventory.length; bi++) {
                            if (window.NORTH_CAMP_CTX.activeChar.inventory[bi].name === name) { window.NORTH_CAMP_CTX.activeChar.inventory[bi].qty += qty; bfound = true; break; }
                        }
                        if (!bfound) window.NORTH_CAMP_CTX.activeChar.inventory.push({name:name, qty:qty, location:'背包', weight:1});
                    }
                    if (document.getElementById('craftingWorkshop').style.display !== 'none') {
                        wsRenderBackpack(); wsRenderRecipes();
                    }
                    storageRender();
                };

                // ━━ 工作间系统 ━━
                // wsSmeltOre/Coal/Bars/Ingot/Timer/Progress 已提升至全局
                let wsActiveTab = 'craft';
                const WS_SMELT_MAX_BARS = 3;
                let wsPendingItem = null;

                // 配方数据（2026-08-01 更新版）
                const FUEL_ITEMS = ['松枝','松脂','荧光苔','铁松松脂']; // 可用于合成火把
                function wsIsFuel(name) { return FUEL_ITEMS.indexOf(name) >= 0; }
                const WS_RECIPES = {
                    craft: [
                        { name:'火把', cost:{'松枝':1}, costFuel:2, result:'火把', desc:'免疫2次严寒考验，消除2级严寒', tab:'craft'},
                        { name:'网兜', cost:{'松枝':1,'银蛛蛛网':2}, result:'网兜', desc:'可触距离10尺', tab:'craft' },
                        { name:'长柄网兜', cost:{'松枝':2,'银蛛蛛网':3}, result:'长柄网兜', desc:'可触距离15尺，容量更大', tab:'craft' },
                        { name:'驱寒药膏', cost:{'药草':2,'松脂':1}, result:'驱寒药膏', desc:'消除2级严寒+6次抵抗（含严寒考验）', tab:'craft' },
                    ],
                    brew: [
                        { name:'治疗药水', cost:{'药草':4,'魔法泉水':2}, result:'治疗药水', desc:'恢复2d4+2生命', tab:'brew' },
                    ],
                    smelt: [], // 动态生成
                };
                // 可熔炼矿物映射
                const WS_SMELT_MAP = {
                    '铜矿':'铜锭', '铁矿':'铁锭', '寒铁矿':'寒铁锭', '银矿':'银锭', '金矿':'金锭',
                };

                function wsGetActiveSlots() {
                    if (wsActiveTab === 'craft') return window.NORTH_CAMP_CTX.wsCraftSlots;
                    if (wsActiveTab === 'brew') return window.NORTH_CAMP_CTX.wsBrewSlots;
                    return null;
                }
                function wsCountFilled() {
                    var slots = wsGetActiveSlots();
                    if (!slots) return 0;
                    return slots.filter(function(s){return s!==null;}).length;
                }

                // 子标签切换
                var wsSubtabs = document.querySelector('.workshop-subtabs');
                if (wsSubtabs) wsSubtabs.addEventListener('click', function(e) {
                    var tab = e.target.closest('.ws-tab');
                    if (!tab) return;
                    var ts = tab.dataset.wstab;
                    wsActiveTab = ts;
                    // 切换子标签时同步角色
                    var cSel = document.getElementById('campCharSelect');
                    if (cSel && cSel.value && window.NORTH_CAMP_CTX.charData[cSel.value]) {
                        window.NORTH_CAMP_CTX.activeCharId = cSel.value;
                        window.NORTH_CAMP_CTX.activeChar = window.NORTH_CAMP_CTX.charData[window.NORTH_CAMP_CTX.activeCharId];
                    }
                    document.querySelectorAll('.ws-tab').forEach(function(t){t.classList.remove('active');});
                    tab.classList.add('active');
                    document.querySelectorAll('.ws-panel').forEach(function(p){p.style.display='none';});
                    document.getElementById(ts==='craft'?'wsCraft':ts==='anvil'?'wsAnvil':ts==='smelt'?'wsSmelt':'wsBrew').style.display='';
                    wsPendingItem = null;
                    wsRenderBackpack();
                    wsRenderSlots();
                    wsRenderRecipes();
                });

                // 渲染背包
                function wsRenderBackpack() {
                    var grid = document.getElementById('wsBackpackGrid');
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory || window.NORTH_CAMP_CTX.activeChar.inventory.length === 0) {
                        wsRenderBackpack._lastKey = '';
                        grid.innerHTML = '<div class="ws-empty-hint" style="grid-column:1/-1;">背包空空如也…</div>';
                        return;
                    }
                    var key = _invRenderKey(window.NORTH_CAMP_CTX.activeChar.inventory);
                    if (wsRenderBackpack._lastKey === key) return;
                    wsRenderBackpack._lastKey = key;
                    var html = '';
                    window.NORTH_CAMP_CTX.activeChar.inventory.forEach(function(it, i) {
                        if (it.qty <= 0) return;
                        var sel = wsPendingItem && wsPendingItem.name === it.name ? ' selected' : '';
                        html += '<div class="ws-bp-item' + sel + '" onclick="wsSelectItem(' + i + ')" title="' + it.name + ' ×' + it.qty + '">';
                        html += '<span class="bp-name">' + (it.name.length > 5 ? it.name.slice(0,5)+'…' : it.name) + '</span>';
                        html += '<span class="bp-qty">×' + it.qty + '</span></div>';
                    });
                    grid.innerHTML = html || '<div class="ws-empty-hint" style="grid-column:1/-1;">背包空空如也…</div>';
                }

                // 同步工作间背包到角色数据
                function wsSyncInventory() {
                    if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeCharId) {
                        window.NORTH_CAMP_CTX.charData[window.NORTH_CAMP_CTX.activeCharId] = window.NORTH_CAMP_CTX.activeChar;
                        // 同步刷新探索端角色卡
                        if (document.getElementById('charSelect') && window.NORTH_CAMP_CTX.activeCharId === document.getElementById('charSelect').value) {
                            window.NORTH_CAMP_CTX.renderCharDetail(window.NORTH_CAMP_CTX.activeCharId);
                        }
                        // 同步刷新营地端角色卡
                        window.NORTH_CAMP_CTX.renderCampCharSheet();
                        // 同步刷新所有工坊背包
                        if (typeof refreshAllShopBackpacks === 'function') refreshAllShopBackpacks();
                    }
                }

                // 选择背包物品
                window.wsSelectItem = function(idx) {
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory) return;
                    var it = window.NORTH_CAMP_CTX.activeChar.inventory[idx];
                    if (!it || it.qty <= 0) return;
                    wsPendingItem = { name:it.name };
                    wsRenderBackpack();
                };

                // 从槽位移除物品返回背包
                window.wsRemoveFromSlot = function(panel, slot) {
                    var placed = null;
                    if (panel === 'craft') { var csi2 = parseInt(slot); placed = window.NORTH_CAMP_CTX.wsCraftSlots[csi2];
                        window.NORTH_CAMP_CTX.wsCraftSlots[csi2] = null; }
                    else if (panel === 'brew') { var si = parseInt(slot); placed = window.NORTH_CAMP_CTX.wsBrewSlots[si];
                        window.NORTH_CAMP_CTX.wsBrewSlots[si] = null; }
                    else if (panel === 'smelt') {
                        if (slot === 'coal') {
                            if (window.NORTH_CAMP_CTX.wsSmeltCoal > 0) { window.NORTH_CAMP_CTX.wsSmeltCoal = 0;
                                placed = {name:'煤矿',_qty:1}; }
                            else if (window.NORTH_CAMP_CTX.wsSmeltBars > 0) { window.NORTH_CAMP_CTX.wsSmeltBars = 0;
                                window.NORTH_CAMP_CTX.showPopup('您将熔炼炉熄灭了', 'warn'); }
                        }
                        else if (slot === 'ore' && window.NORTH_CAMP_CTX.wsSmeltOre) { placed = window.NORTH_CAMP_CTX.wsSmeltOre;
                            window.NORTH_CAMP_CTX.wsSmeltOre = null; }
                    }
                    if (placed) wsReturnItem(placed);
                    wsSyncInventory();
                    wsRenderSlots();
                    wsRenderBackpack();
                };

                // 放置物品到槽位
                window.wsPlaceItem = function(panel, slot) {
                    if (!wsPendingItem) { var msgEl = document.getElementById(panel==='brew'?'brewMsg':(panel==='smelt'?'smeltMsg':'craftMsg'));
                        if (msgEl) { msgEl.textContent = '请先在右侧背包中选择一个物品';
                            setTimeout(function(){ msgEl.textContent = ''; }, 1500); } return; }
                    if (!window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory) return;
                    var itemName = wsPendingItem.name;
                    // 从背包中找到同名物品并消耗1个
                    var foundIdx = -1;
                    for (var fi = 0; fi < window.NORTH_CAMP_CTX.activeChar.inventory.length; fi++) {
                        if (window.NORTH_CAMP_CTX.activeChar.inventory[fi].name === itemName && window.NORTH_CAMP_CTX.activeChar.inventory[fi].qty > 0) {
                            foundIdx = fi; break;
                        }
                    }
                    if (foundIdx < 0) { wsPendingItem = null;
                        wsRenderBackpack(); return; }
                    var it = window.NORTH_CAMP_CTX.activeChar.inventory[foundIdx];
                    it.qty--;
                    var placed = { name:itemName, _qty:1 };
                    if (panel === 'craft') {
                        var csi = parseInt(slot);
                        if (window.NORTH_CAMP_CTX.wsCraftSlots[csi]) wsReturnItem(window.NORTH_CAMP_CTX.wsCraftSlots[csi]);
                        window.NORTH_CAMP_CTX.wsCraftSlots[csi] = placed;
                    } else if (panel === 'brew') {
                        var si = parseInt(slot);
                        if (window.NORTH_CAMP_CTX.wsBrewSlots[si]) wsReturnItem(window.NORTH_CAMP_CTX.wsBrewSlots[si]);
                        window.NORTH_CAMP_CTX.wsBrewSlots[si] = placed;
                    } else if (panel === 'smelt') {
                        if (slot === 'coal') {
                            if (itemName !== '煤矿') { wsPendingItem = null;
                                wsRenderBackpack(); return; }
                            if (window.NORTH_CAMP_CTX.wsSmeltCoal > 0) { wsPendingItem = null;
                                wsRenderBackpack();
                                window.NORTH_CAMP_CTX.showPopup('煤槽已满，请先使用当前煤矿', 'warn'); return; }
                            if (window.NORTH_CAMP_CTX.wsSmeltBars >= WS_SMELT_MAX_BARS) { wsPendingItem = null;
                                wsRenderBackpack();
                                window.NORTH_CAMP_CTX.showPopup('熔炉火力正旺，不需要添加燃料', 'warn'); return; }
                            window.NORTH_CAMP_CTX.wsSmeltCoal = 1;
                        } else if (slot === 'ore') {
                            if (!WS_SMELT_MAP[itemName]) { wsPendingItem = null;
                                wsRenderBackpack(); return; }
                            if (window.NORTH_CAMP_CTX.wsSmeltOre) wsReturnItem(window.NORTH_CAMP_CTX.wsSmeltOre);
                            window.NORTH_CAMP_CTX.wsSmeltOre = placed;
                        }
                    }
                    // 清理空物品
                    if (it.qty <= 0) window.NORTH_CAMP_CTX.activeChar.inventory.splice(foundIdx, 1);
                    wsPendingItem = null;
                    wsSyncInventory();
                    wsRenderBackpack();
                    wsRenderSlots();
                };

                // 归还物品（按储存的数量归还）
                function wsReturnItem(placed) {
                    if (!placed || !window.NORTH_CAMP_CTX.activeChar || !window.NORTH_CAMP_CTX.activeChar.inventory) return;
                    var returnQty = placed._qty || 1;
                    var found = false;
                    for (var i = 0; i < window.NORTH_CAMP_CTX.activeChar.inventory.length; i++) {
                        if (window.NORTH_CAMP_CTX.activeChar.inventory[i].name === placed.name && window.NORTH_CAMP_CTX.activeChar.inventory[i].location === '背包') {
                            window.NORTH_CAMP_CTX.activeChar.inventory[i].qty += returnQty;
                            found = true; break;
                        }
                    }
                    if (!found) window.NORTH_CAMP_CTX.activeChar.inventory.push({name:placed.name, qty:returnQty, location:'背包', weight:1});
                }

                // 渲染槽位
                function wsRenderSlots() {
                    // 制作台（六芒星）
                    var craftHex = document.getElementById('craftHexagram');
                    if (craftHex) {
                        var craftSlotEls = craftHex.querySelectorAll('.brew-slot');
                        for (var ci = 0; ci < 6; ci++) {
                            var el = craftSlotEls[ci];
                            if (!el) continue;
                            var labelEl = el.querySelector('.slot-label');
                            if (window.NORTH_CAMP_CTX.wsCraftSlots[ci]) {
                                el.className = 'brew-slot filled';
                                if (labelEl) labelEl.textContent = window.NORTH_CAMP_CTX.wsCraftSlots[ci].name;
                            } else { el.className = 'brew-slot';
                                if (labelEl) labelEl.textContent = ''; }
                        }
                    }
                    // 熔炼
                    var oreEl = document.querySelector('.smelt-slot.ore-slot');
                    if (oreEl) { var oreLabel = oreEl.querySelector('.slot-label');
                        oreEl.className = 'smelt-slot ore-slot' + (window.NORTH_CAMP_CTX.wsSmeltOre?' filled':'');
                        if (oreLabel) oreLabel.textContent = window.NORTH_CAMP_CTX.wsSmeltOre ? window.NORTH_CAMP_CTX.wsSmeltOre.name : '矿物'; }
                    var coalEl = document.querySelector('.smelt-slot.coal-slot');
                    if (coalEl) { var coalLabel = coalEl.querySelector('.slot-label');
                        coalEl.className = 'smelt-slot coal-slot' + (window.NORTH_CAMP_CTX.wsSmeltCoal>0 || window.NORTH_CAMP_CTX.wsSmeltBars>0?' filled':'');
                        if (coalLabel) coalLabel.textContent = window.NORTH_CAMP_CTX.wsSmeltCoal>0 ? '煤矿×1' : (window.NORTH_CAMP_CTX.wsSmeltBars>0 ? '火力×'+window.NORTH_CAMP_CTX.wsSmeltBars : '煤矿'); }
                    var ingotEl = document.getElementById('smeltResult');
                    if (ingotEl) { ingotEl.className = 'smelt-slot ingot-slot' + (window.NORTH_CAMP_CTX.wsSmeltIngot?' filled':'');
                        ingotEl.textContent = window.NORTH_CAMP_CTX.wsSmeltIngot ? window.NORTH_CAMP_CTX.wsSmeltIngot : '锭'; }
                    document.getElementById('smeltTakeBtn').style.display = window.NORTH_CAMP_CTX.wsSmeltIngot ? '' : 'none';
                    // 火力条
                    if (!window.NORTH_CAMP_CTX.wsSmeltTimer) { document.querySelectorAll('.fire-bar').forEach(function(b,i) { b.classList.toggle('lit', i >= 3 - window.NORTH_CAMP_CTX.wsSmeltBars); }); }
                    // 炼药锅
                    var brewPanel = document.getElementById('wsBrew');
                    if (brewPanel) {
                        var brewSlotEls = brewPanel.querySelectorAll('.brew-slot');
                        for (var j = 0; j < 6; j++) {
                            var eb = brewSlotEls[j];
                            if (!eb) continue;
                            var bl = eb.querySelector('.slot-label');
                            if (window.NORTH_CAMP_CTX.wsBrewSlots[j]) { eb.className = 'brew-slot filled';
                                if (bl) bl.textContent = window.NORTH_CAMP_CTX.wsBrewSlots[j].name; }
                            else { eb.className = 'brew-slot';
                                if (bl) bl.textContent = ''; }
                        }
                    }
                    // 结果
                    document.getElementById('craftResult').textContent = window.NORTH_CAMP_CTX.wsCraftResult ? window.NORTH_CAMP_CTX.wsCraftResult : '?';
                    document.getElementById('craftTakeBtn').style.display = window.NORTH_CAMP_CTX.wsCraftResult ? '' : 'none';
                    document.getElementById('brewResult').textContent = window.NORTH_CAMP_CTX.wsBrewResult ? window.NORTH_CAMP_CTX.wsBrewResult : '?';
                    document.getElementById('brewTakeBtn').style.display = window.NORTH_CAMP_CTX.wsBrewResult ? '' : 'none';
                }

                // 渲染配方列表
                function wsRenderRecipes() {
                    var tab = wsActiveTab;
                    if (tab === 'anvil') return; // 铁砧待开放
                    var listEl = document.getElementById(tab==='craft'?'craftRecipeList':tab==='smelt'?'smeltRecipeList':'brewRecipeList');
                    if (!listEl) return;
                    var recipes = [];
                    if (tab === 'craft') recipes = WS_RECIPES.craft;
                    else if (tab === 'brew') recipes = WS_RECIPES.brew;
                    else if (tab === 'smelt') {
                        // 熔炼配方：自动解锁背包中已有的可熔炼矿物
                        if (window.NORTH_CAMP_CTX.activeChar && window.NORTH_CAMP_CTX.activeChar.inventory) {
                            window.NORTH_CAMP_CTX.activeChar.inventory.forEach(function(it) {
                                if (WS_SMELT_MAP[it.name] && !window.NORTH_CAMP_CTX.wsUnlockedRecipes[it.name]) window.NORTH_CAMP_CTX.wsUnlockedRecipes[it.name] = true;
                            });
                        }
                        var smeltRecipes = [];
                        Object.keys(WS_SMELT_MAP).forEach(function(ore) {
                            if (window.NORTH_CAMP_CTX.wsUnlockedRecipes[ore]) smeltRecipes.push({name:ore, cost:{'煤矿':1}, result:WS_SMELT_MAP[ore], desc:'熔炼', tab:'smelt'});
                        });
                        recipes = smeltRecipes;
                        // 煤矿自动解锁
                        if (!window.NORTH_CAMP_CTX.wsUnlockedRecipes['煤矿']) window.NORTH_CAMP_CTX.wsUnlockedRecipes['煤矿'] = true;
                    }
                    var unlocked = recipes.filter(function(r) { return window.NORTH_CAMP_CTX.wsUnlockedRecipes[r.name]; });
                    if (unlocked.length === 0) {
                        listEl.innerHTML = '<div class="ws-empty-hint">你的灵感等待激发…</div>';
                    } else {
                        listEl.innerHTML = unlocked.map(function(r) {
                            var costStr = Object.entries(r.cost).map(function(e) { return e[0]+'×'+e[1]; }).join(' + ');
                            if (r.costFuel) costStr += (costStr ? ' + ' : '') + '燃料×' + r.costFuel;
                            return '<div class="ws-recipe-item" onclick="wsQuickFill(\'' + r.name + '\')"><span class="rcp-name">' + r.result + '</span> <span class="rcp-cost">(' + costStr + ')</span></div>';
                        }).join('');
                    }
                }

                // 点击配方快速填充材料
                window.wsQuickFill = function(recipeName) {
                    var recipe = null;
                    var allRecipes = [].concat(WS_RECIPES.craft, WS_RECIPES.brew);
                    for (var ri = 0; ri < allRecipes.length; ri++) { if (allRecipes[ri].name === recipeName) { recipe = allRecipes[ri]; break; } }
                    if (!recipe) return;
                    wsClearSlots();
                    var slots = recipe.tab === 'brew' ? window.NORTH_CAMP_CTX.wsBrewSlots : window.NORTH_CAMP_CTX.wsCraftSlots;
                    var si = 0;
                    // 每个单位占一个方框
                    function placeOne(name) {
                        if (si >= 6) return false;
                        // 从背包消耗1个
                        var found = false;
                        for (var ii = 0; ii < window.NORTH_CAMP_CTX.activeChar.inventory.length; ii++) {
                            if (window.NORTH_CAMP_CTX.activeChar.inventory[ii].name === name && window.NORTH_CAMP_CTX.activeChar.inventory[ii].qty > 0) {
                                window.NORTH_CAMP_CTX.activeChar.inventory[ii].qty--;
                                if (window.NORTH_CAMP_CTX.activeChar.inventory[ii].qty <= 0) window.NORTH_CAMP_CTX.activeChar.inventory.splice(ii, 1);
                                found = true; break;
                            }
                        }
                        if (!found) return false;
                        slots[si] = { name:name, _qty:1 };
                        si++;
                        return true;
                    }
                    // 放置具名物品
                    var costEntries = Object.entries(recipe.cost);
                    for (var ci = 0; ci < costEntries.length; ci++) {
                        var needName = costEntries[ci][0], needQty = costEntries[ci][1];
                        for (var q = 0; q < needQty; q++) {
                            if (!placeOne(needName)) {
                                document.getElementById(wsActiveTab==='brew'?'brewMsg':'craftMsg').textContent = '材料不足：缺少 ' + needName;
                                wsRenderBackpack();
                                wsRenderSlots();
                                return;
                            }
                        }
                    }
                    // 放置燃料（优先级：松脂 > 荧光苔 > 铁松松脂）
                    if (recipe.costFuel) {
                        var fuelPriority = ['松脂','荧光苔','铁松松脂'];
                        for (var f = 0; f < recipe.costFuel; f++) {
                            var fuelOk = false;
                            for (var fp = 0; fp < fuelPriority.length; fp++) {
                                for (var fi = 0; fi < window.NORTH_CAMP_CTX.activeChar.inventory.length; fi++) {
                                    if (window.NORTH_CAMP_CTX.activeChar.inventory[fi].name === fuelPriority[fp] && window.NORTH_CAMP_CTX.activeChar.inventory[fi].qty > 0) {
                                        window.NORTH_CAMP_CTX.activeChar.inventory[fi].qty--;
                                        if (window.NORTH_CAMP_CTX.activeChar.inventory[fi].qty <= 0) window.NORTH_CAMP_CTX.activeChar.inventory.splice(fi, 1);
                                        slots[si] = { name:fuelPriority[fp], _qty:1 };
                                        si++;
                                        fuelOk = true; break;
                                    }
                                }
                                if (fuelOk) break;
                            }
                            if (!fuelOk) { document.getElementById('craftMsg').textContent = '材料不足：缺少燃料';
                                wsRenderBackpack();
                                wsRenderSlots(); return; }
                        }
                    }
                    wsSyncInventory();
                    wsRenderBackpack();
                    wsRenderSlots();
                };

                function wsClearSlots() {
                    if (wsActiveTab === 'craft') { window.NORTH_CAMP_CTX.wsCraftSlots.forEach(function(s,i) { if (s) wsReturnItem(s);
                        window.NORTH_CAMP_CTX.wsCraftSlots[i] = null; }); }
                    if (wsActiveTab === 'brew') { window.NORTH_CAMP_CTX.wsBrewSlots.forEach(function(s,i) { if (s) wsReturnItem(s);
                        window.NORTH_CAMP_CTX.wsBrewSlots[i] = null; }); }
                    wsSyncInventory();
                    wsRenderSlots();
                    wsRenderBackpack();
                }

                // 检查材料是否匹配配方
                function wsMatchRecipe(tab) {
                    var slots = tab === 'brew' ? window.NORTH_CAMP_CTX.wsBrewSlots : window.NORTH_CAMP_CTX.wsCraftSlots;
                    // 统计槽位中所有物品（按名称）
                    var items = {};
                    slots.forEach(function(s) {
                        if (!s || !s.name) return;
                        items[s.name] = (items[s.name]||0) + 1;
                    });
                    var recipes = tab === 'brew' ? WS_RECIPES.brew : WS_RECIPES.craft;
                    for (var ri = 0; ri < recipes.length; ri++) {
                        var r = recipes[ri];
                        var cost = r.cost || {};
                        var costKeys = Object.keys(cost);
                        // 1. 具名物品数量必须精确匹配（不能多也不能少）
                        var namedOk = true;
                        for (var ci = 0; ci < costKeys.length; ci++) {
                            var need = costKeys[ci];
                            if ((items[need]||0) !== cost[need]) { namedOk = false; break; }
                        }
                        if (!namedOk) continue;
                        // 2. 槽位中不能有配方外的非燃料物品
                        var extraOk = true;
                        Object.keys(items).forEach(function(n) {
                            if (!cost[n] && !wsIsFuel(n)) extraOk = false;
                        });
                        if (!extraOk) continue;
                        // 3. 燃料总数 >= costFuel + 具名燃料
                        var fuelTotal = 0;
                        Object.keys(items).forEach(function(n) { if (wsIsFuel(n)) fuelTotal += items[n]; });
                        var fuelNeeded = (r.costFuel||0);
                        costKeys.forEach(function(k) { if (wsIsFuel(k)) fuelNeeded += cost[k]; });
                        if (fuelTotal < fuelNeeded) continue;
                        return r;
                    }
                    return null;
                }

                // 制作
                window.wsDoCraft = function() {
                    var msgEl = document.getElementById('craftMsg');
                    if (wsCountFilled() < 2) { if (msgEl) msgEl.textContent = '材料太少，再去收集点吧…'; return; }
                    var recipe = wsMatchRecipe('craft');
                    var success = recipe !== null;
                    if (success) {
                        window.NORTH_CAMP_CTX.wsCraftResult = recipe.result;
                        window.NORTH_CAMP_CTX.wsUnlockedRecipes[recipe.name] = true;
                        window.NORTH_CAMP_CTX.wsCraftSlots.forEach(function(s) { if (s && s.name) { if (!window.NORTH_CAMP_CTX.craftedItems[s.name] || !Array.isArray(window.NORTH_CAMP_CTX.craftedItems[s.name])) window.NORTH_CAMP_CTX.craftedItems[s.name] = [];
                            if (window.NORTH_CAMP_CTX.craftedItems[s.name].indexOf(recipe.name) < 0) window.NORTH_CAMP_CTX.craftedItems[s.name].push(recipe.name); } });
                        if (msgEl) msgEl.innerHTML = '<span style="color:#6abf8a;">✅ 制作成功！</span>';
                    } else {
                        window.NORTH_CAMP_CTX.wsCraftResult = null;
                        if (msgEl) msgEl.innerHTML = '<span style="color:#e0556a;">❌ 制作失败，材料浪费了…</span>';
                    }
                    for (var cj = 0; cj < 6; cj++) window.NORTH_CAMP_CTX.wsCraftSlots[cj] = null;
                    wsSyncInventory();
                    wsRenderSlots();
                    wsRenderRecipes();
                    setTimeout(function() { if (msgEl) msgEl.textContent = ''; }, 2000);
                };

                // 熔炼
                window.wsDoSmelt = function() {
                    if (!window.NORTH_CAMP_CTX.wsSmeltOre && window.NORTH_CAMP_CTX.wsSmeltCoal <= 0 && window.NORTH_CAMP_CTX.wsSmeltBars <= 0) { document.getElementById('smeltMsg').textContent = '缺少矿物和燃料…'; return; }
                    if (!window.NORTH_CAMP_CTX.wsSmeltOre) { document.getElementById('smeltMsg').textContent = '缺少矿物进行熔炼…'; return; }
                    if (window.NORTH_CAMP_CTX.wsSmeltCoal <= 0 && window.NORTH_CAMP_CTX.wsSmeltBars <= 0) { document.getElementById('smeltMsg').textContent = '熔炉火力不足，请添加煤矿…'; return; }
                    if (window.NORTH_CAMP_CTX.wsSmeltTimer) return;
                    // 先消耗煤矿→点亮3格火力
                    if (window.NORTH_CAMP_CTX.wsSmeltCoal > 0) {
                        window.NORTH_CAMP_CTX.wsSmeltCoal = 0;
                        window.NORTH_CAMP_CTX.wsSmeltBars = Math.min(WS_SMELT_MAX_BARS, window.NORTH_CAMP_CTX.wsSmeltBars + 3);
                        document.getElementById('smeltMsg').innerHTML = '<span style="color:#ff8030;">🔥 煤矿点燃，火力×' + window.NORTH_CAMP_CTX.wsSmeltBars + '</span>';
                        wsRenderSlots();
                        window.NORTH_CAMP_CTX.wsSmeltTimer = true; // 占位防重复点击
                        setTimeout(function() {
                            window.NORTH_CAMP_CTX.wsSmeltTimer = null;
                            wsStartSmeltProgress();
                        }, 400);
                        return;
                    }
                    wsStartSmeltProgress();
                };
                function wsStartSmeltProgress() {
                    window.NORTH_CAMP_CTX.wsSmeltBars--;
                    document.getElementById('smeltMsg').innerHTML = '<span style="color:#d49460;">🔥 开始熔炼…</span>';
                    window.NORTH_CAMP_CTX.wsSmeltProgress = 0;
                    wsRenderSlots();
                    var barsBeforeSmelt = window.NORTH_CAMP_CTX.wsSmeltBars;
                    window.NORTH_CAMP_CTX.wsSmeltTimer = setInterval(function() {
                        window.NORTH_CAMP_CTX.wsSmeltProgress += 3.3;
                        document.getElementById('smeltProgressFill').style.width = Math.min(window.NORTH_CAMP_CTX.wsSmeltProgress, 100) + '%';
                        // 从上到下熄灭：进度过半时最上方一格熄灭
                        var currentLit = window.NORTH_CAMP_CTX.wsSmeltProgress < 50 ? barsBeforeSmelt + 1 : barsBeforeSmelt;
                        document.querySelectorAll('.fire-bar').forEach(function(b,i) {
                            b.classList.toggle('lit', i >= 3 - currentLit);
                        });
                        if (window.NORTH_CAMP_CTX.wsSmeltProgress >= 100) {
                            clearInterval(window.NORTH_CAMP_CTX.wsSmeltTimer);
                            window.NORTH_CAMP_CTX.wsSmeltTimer = null;
                            window.NORTH_CAMP_CTX.wsSmeltProgress = 0;
                            document.getElementById('smeltProgressFill').style.width = '0%';
                            var oreName = window.NORTH_CAMP_CTX.wsSmeltOre.name;
                            var ingot = WS_SMELT_MAP[oreName] || '未知锭';
                            window.NORTH_CAMP_CTX.wsSmeltIngot = ingot;
                            window.NORTH_CAMP_CTX.wsSmeltOre = null;
                            window.NORTH_CAMP_CTX.wsUnlockedRecipes[ingot] = true;
                            if (!window.NORTH_CAMP_CTX.craftedItems[oreName] || !Array.isArray(window.NORTH_CAMP_CTX.craftedItems[oreName])) window.NORTH_CAMP_CTX.craftedItems[oreName] = [];
                            if (window.NORTH_CAMP_CTX.craftedItems[oreName].indexOf(ingot) < 0) window.NORTH_CAMP_CTX.craftedItems[oreName].push(ingot);
                            if (!window.NORTH_CAMP_CTX.craftedItems['煤矿'] || !Array.isArray(window.NORTH_CAMP_CTX.craftedItems['煤矿'])) window.NORTH_CAMP_CTX.craftedItems['煤矿'] = [];
                            if (window.NORTH_CAMP_CTX.craftedItems['煤矿'].indexOf('熔炼') < 0) window.NORTH_CAMP_CTX.craftedItems['煤矿'].push('熔炼');
                            document.getElementById('smeltMsg').innerHTML = '<span style="color:#6abf8a;">✅ 熔炼完成！获得 ' + ingot + '</span>';
                            wsSyncInventory();
                            wsRenderSlots();
                            wsRenderRecipes();
                            setTimeout(function() { document.getElementById('smeltMsg').textContent = ''; }, 2000);
                        }
                    }, 100);
                }

                // 炼药
                window.wsDoBrew = function() {
                    var msgEl2 = document.getElementById('brewMsg');
                    if (wsCountFilled() < 2) { if (msgEl2) msgEl2.textContent = '材料太少，再去收集点吧…'; return; }
                    var recipe = wsMatchRecipe('brew');
                    var success = recipe !== null;
                    if (success) {
                        window.NORTH_CAMP_CTX.wsBrewResult = recipe.result;
                        window.NORTH_CAMP_CTX.wsUnlockedRecipes[recipe.name] = true;
                        window.NORTH_CAMP_CTX.wsBrewSlots.forEach(function(s) { if (s && s.name) { if (!window.NORTH_CAMP_CTX.craftedItems[s.name] || !Array.isArray(window.NORTH_CAMP_CTX.craftedItems[s.name])) window.NORTH_CAMP_CTX.craftedItems[s.name] = [];
                            if (window.NORTH_CAMP_CTX.craftedItems[s.name].indexOf(recipe.name) < 0) window.NORTH_CAMP_CTX.craftedItems[s.name].push(recipe.name); } });
                        if (msgEl2) msgEl2.innerHTML = '<span style="color:#6abf8a;">✅ 调配成功！</span>';
                    } else {
                        window.NORTH_CAMP_CTX.wsBrewResult = null;
                        if (msgEl2) msgEl2.innerHTML = '<span style="color:#e0556a;">❌ 调配失败，材料浪费了…</span>';
                    }
                    window.NORTH_CAMP_CTX.wsBrewSlots = [null,null,null,null,null,null];
                    wsSyncInventory();
                    wsRenderSlots();
                    wsRenderRecipes();
                    setTimeout(function() { if (msgEl2) msgEl2.textContent = ''; }, 2000);
                };

                // 拿取结果
                window.wsTakeResult = function(tab) {
                    var item = tab === 'brew' ? window.NORTH_CAMP_CTX.wsBrewResult : (tab === 'smelt' ? window.NORTH_CAMP_CTX.wsSmeltIngot : window.NORTH_CAMP_CTX.wsCraftResult);
                    if (!item || !window.NORTH_CAMP_CTX.activeChar) return;
                    var stacked = false;
                    for (var i = 0; i < window.NORTH_CAMP_CTX.activeChar.inventory.length; i++) {
                        if (window.NORTH_CAMP_CTX.activeChar.inventory[i].name === item && window.NORTH_CAMP_CTX.activeChar.inventory[i].location === '背包') {
                            window.NORTH_CAMP_CTX.activeChar.inventory[i].qty++;
                            stacked = true; break;
                        }
                    }
                    if (!stacked) window.NORTH_CAMP_CTX.activeChar.inventory.push({name:item, qty:1, location:'背包', weight:1});
                    // 记录到雪原馈赠
                    var wpNum = window.NORTH_CAMP_CTX.findWpNum(item);
                    var exist = window.NORTH_CAMP_CTX.discoveredItems.find(function(d) { return d.name === item; });
                    if (exist) { exist.totalQty++;
                        exist.times++; }
                    else { window.NORTH_CAMP_CTX.discoveredItems.push({name:item, totalQty:1, wpNum:wpNum, times:1}); }
                    // 解锁产物自身配方词条
                    if (!window.NORTH_CAMP_CTX.craftedItems[item] || !Array.isArray(window.NORTH_CAMP_CTX.craftedItems[item])) window.NORTH_CAMP_CTX.craftedItems[item] = [];
                    if (window.NORTH_CAMP_CTX.craftedItems[item].indexOf(item) < 0) window.NORTH_CAMP_CTX.craftedItems[item].push(item);
                    if (tab === 'brew') window.NORTH_CAMP_CTX.wsBrewResult = null;
                    else if (tab === 'smelt') window.NORTH_CAMP_CTX.wsSmeltIngot = null;
                    else window.NORTH_CAMP_CTX.wsCraftResult = null;
                    wsSyncInventory();
                    wsRenderSlots();
                    wsRenderBackpack();
                    if (!window.NORTH_CAMP_CTX.wsUnlockedRecipes[item]) { window.NORTH_CAMP_CTX.wsUnlockedRecipes[item] = true;
                        wsRenderRecipes(); }
                };

                // 切换离开营地时自动拿取结果
                document.getElementById('exploreTab').addEventListener('click', function() {
                    if (window.NORTH_CAMP_CTX.wsCraftResult) wsTakeResult('craft');
                    if (window.NORTH_CAMP_CTX.wsSmeltIngot) wsTakeResult('smelt');
                    if (window.NORTH_CAMP_CTX.wsBrewResult) wsTakeResult('brew');
                    wsClearSlots();
                });

    window.NORTH_CAMP = {
        _invRenderKey: _invRenderKey,
        renderShopBackpack: renderShopBackpack,
        renderShopCoinsBar: renderShopCoinsBar,
        refreshAllShopBackpacks: refreshAllShopBackpacks,
        restoreShopBpState: restoreShopBpState,
        resetWorkshopCover: resetWorkshopCover,
        shopFundsTotalCP: shopFundsTotalCP,
        fmtFunds: fmtFunds,
        deductShopFunds: deductShopFunds,
        randPrice: randPrice,
        priceToStr: priceToStr,
        priceToGP: priceToGP,
        refreshShopSupply: refreshShopSupply,
        refreshCaravan: refreshCaravan,
        refreshShopFunds: refreshShopFunds,
        getShopSellPrice: getShopSellPrice,
        canSellItem: canSellItem,
        renderShop: renderShop,
        showSellModal: showSellModal,
        storageRenderCoins: storageRenderCoins,
        storageRender: storageRender,
        storageRenderStorage: storageRenderStorage,
        storageRenderBackpack: storageRenderBackpack,
        stShowModal: stShowModal,
        stDoTransfer: stDoTransfer,
        wsIsFuel: wsIsFuel,
        wsGetActiveSlots: wsGetActiveSlots,
        wsCountFilled: wsCountFilled,
        wsRenderBackpack: wsRenderBackpack,
        wsSyncInventory: wsSyncInventory,
        wsReturnItem: wsReturnItem,
        wsRenderSlots: wsRenderSlots,
        wsRenderRecipes: wsRenderRecipes,
        wsClearSlots: wsClearSlots,
        wsMatchRecipe: wsMatchRecipe,
        wsStartSmeltProgress: wsStartSmeltProgress
    };
})();
