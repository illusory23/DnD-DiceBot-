/* ━━━ 北境雪原 · 事件数据文件 ━━━
 * 从 north-expedition.html 拆分（2026-08-14 三合一优化）
 * 包含：TABLES（16 张事件表）、ITEM_ACTIONS（材料自动拾取）、CHECK_ACTIONS（检定交互表）
 * CHECK_ACTIONS 内含闭包回调，依赖运行期上下文 → window.NORTH_CTX（由 north-main.js 注入）
 */
(function () {
    'use strict';
    var CTX = window.NORTH_CTX = window.NORTH_CTX || {};

            const TABLES = {

                ts100: {
                    label: '探索雪原',
                    dice: 'd100',
                    desc: '探索苍白大地的未知领域',
                    items: {
                        1: ['深入雪原（你又一步深入了雪原，也许危险离你又近了一步...）', null],
                        20: ['深入雪原（你又一步深入了雪原，也许危险离你又近了一步...）', null],
                        21: ['进入随机遭遇', 'zy100'],
                        50: ['进入随机遭遇', 'zy100'],
                        51: ['采集资源（调查DC10）', null],
                        80: ['采集资源（调查DC10）', null],
                        81: ['调查附近', 'dc100'],
                        100: ['调查附近', 'dc100'],
                    }
                },

                zy100: {
                    label: '遭遇事件',
                    dice: 'd100',
                    desc: '在雪原中遭遇未知',
                    items: {
                        1: ['遭遇环境变化', 'hj6'],
                        20: ['遭遇环境变化', 'hj6'],
                        21: ['遭遇人类', 'rl100'],
                        30: ['遭遇人类', 'rl100'],
                        31: ['遭遇野兽', 'ys10'],
                        55: ['遭遇野兽', 'ys10'],
                        56: ['陷入迷失现象（下次体质/感知检定为劣势）', null],
                        60: ['陷入迷失现象（下次体质/感知检定为劣势）', null],
                        61: ['遭遇中立/友善生物', 'zl12'],
                        80: ['遭遇中立/友善生物', 'zl12'],
                        81: ['遭遇恶霜现象（可见范围降低至30尺，每次事件失去1d4生命，敏捷/体质/感知劣势）', null],
                        85: ['遭遇恶霜现象（可见范围降低至30尺，每次事件失去1d4生命，敏捷/体质/感知劣势）', null],
                        86: ['遭遇特殊事件', 'sj6'],
                        95: ['遭遇特殊事件', 'sj6'],
                        96: ['遭遇特殊生物', 'sw100'],
                        100: ['遭遇特殊生物', 'sw100'],
                    }
                },

                dc100: {
                    label: '探索雪原',
                    dice: 'd100',
                    desc: '仔细探查周围的痕迹',
                    items: {
                        1: ['特殊发现', 'fx100'],
                        10: ['特殊发现', 'fx100'],
                        11: ['发现踪迹（下次调查检定优势）', null],
                        35: ['发现踪迹（下次调查检定优势）', null],
                        36: ['发现异常（感知DC12）', null],
                        60: ['发现异常（感知DC12）', null],
                        61: ['发现材料', 'cl50'],
                        85: ['发现材料', 'cl50'],
                        86: ['一无所获', null],
                        100: ['一无所获', null],
                    }
                },

                hj6: {
                    label: '环境',
                    dice: 'd6',
                    desc: '北境的气候变幻无常',
                    items: {
                        1: ['雪坑（被动察觉DC15，未过则敏捷豁免DC15，1d6钝击，运动DC12爬出）', null],
                        2: ['暴风雪（感知/敏捷劣势，可见范围30尺，自然DC15，失败迷失方向）', null],
                        3: ['极光（下次智力/感知检定优势）', null],
                        4: ['霜雾（感知劣势，可见范围30尺，体质豁免DC15，1d4寒冷）', null],
                        5: ['冻雨（体质豁免DC15，1d4寒冷）', null],
                        6: ['暖风（下次体质豁免优势）', null],
                    }
                },

                rl100: {
                    label: '人类',
                    dice: 'd100',
                    desc: '雪原上的旅人与居民',
                    items: {
                        1: ['商队（可交易）', null],
                        15: ['商队（可交易）', null],
                        16: ['公会（佣兵，冒险者）', null],
                        45: ['公会（佣兵，冒险者）', null],
                        46: ['士兵（军队，地方卫队）', null],
                        65: ['士兵（军队，地方卫队）', null],
                        66: ['猎人（向导，当地人）', null],
                        100: ['猎人（向导，当地人）', null],
                    }
                },

                ys10: {
                    label: '野兽',
                    dice: 'd10',
                    desc: '北境的野生动物',
                    items: {
                        1: ['1d2只 冰原狼', null],
                        2: ['1只 野猪', null],
                        3: ['1只 柯莫得白熊', null],
                        4: ['1只 卡佐巨熊', null],
                        5: ['1只 冈达尔巨鹰', null],
                        6: ['1d2条 寒脊蛇', null],
                        7: ['1d3只 柯莫得白熊', null],
                        8: ['2只 冰原狼', null],
                        9: ['1d2只 野猪', null],
                        10: ['1d4只 冰原狼', null],
                    }
                },

                sj6: {
                    label: '特殊事件',
                    dice: 'd6',
                    desc: '冰原上的异常现象',
                    items: {
                        1: ['雪崩（敏捷/体质DC12，1d6寒冷，运动DC15脱离，否则每次1d4寒冷）', null],
                        2: ['冰层破裂（敏捷DC12，落水1d6寒冷+失温）', null],
                        3: ['冰层震动（敏捷DC10，失败倒地俯卧；若重物则触发冰层破裂）', null],
                        4: ['陷阱（被动察觉DC12，敏捷DC12，1d4穿刺）', null],
                        5: ['特殊标记（奥秘/调查DC15，下次自然检定优势）', null],
                        6: ['寒鸦报信（下次检定优势，接下来两次事件不遭遇危险）', null],
                    }
                },

                zl12: {
                    label: '非敌对生物',
                    dice: 'd12',
                    desc: '雪原上的生灵',
                    items: {
                        1: ['1d2只 雪蹄兔（可跟踪，生存DC12）', null],
                        2: ['1d5只 野鹿（可跟踪，自然DC15）', null],
                        3: ['1d2只 雪鸮（可跟随，生存DC15）', null],
                        4: ['1只 都灵寒鸦（可喂食，驯养DC10）', null],
                        5: ['1只 雪狐（可喂食，驯养DC15）', null],
                        6: ['2d3只 霜鼠（可跟踪，自然DC15）', null],
                        7: ['1只 雪貂（可驯兽DC10）', null],
                        8: ['1d3只 野鹿（可跟踪，自然DC15）', null],
                        9: ['1d4只 麝牛（驯养DC15）', null],
                        10: ['1d4只 银蛛（可采集）', null],
                        11: ['1d3只 霜羽雉（跟随可发现巢穴，自然DC15→1d3蛋+1d20出1-5得银羽）', null],
                        12: ['1d4只绒蜂 绒蜂巢（可采集，驯养DC15）', null],
                    }
                },

                sw100: {
                    label: '特殊生物',
                    dice: 'd100',
                    desc: '北境的神秘存在',
                    items: {
                        1: ['1d2只 霜巨魔（敌对，可交流）', null],
                        5: ['1d2只 霜巨魔（敌对，可交流）', null],
                        6: ['1d3只 恶尸（敌对，被恶灵附体的尸体）', null],
                        45: ['1d3只 恶尸（敌对，被恶灵附体的尸体）', null],
                        46: ['1d3只 冬之氏族精灵（中立，可交流）', null],
                        60: ['1d3只 冬之氏族精灵（中立，可交流）', null],
                        61: ['1d2只 霜灵（中立，无意识游荡的灵体）', null],
                        92: ['1d2只 霜灵（中立，无意识游荡的灵体）', null],
                        93: ['1只 瘦鹿（敌对，灵体免疫物理，可被击退）', null],
                        95: ['1只 瘦鹿（敌对，灵体免疫物理，可被击退）', null],
                        96: ['1只 水星守卫（引导远离，下次智力优势，恢复至满状态）', null],
                        100: ['1只 水星守卫（引导远离，下次智力优势，恢复至满状态）', null],
                    }
                },

                cl50: {
                    label: '材料',
                    dice: 'd50',
                    desc: '雪原上可收集的资源',
                    items: {
                        1: ['药草（可止血恢复，1d2生命）', null],
                        6: ['药草（可止血恢复，1d2生命）', null],
                        7: ['浆果/野菜（获得1d2份食物）', null],
                        15: ['浆果/野菜（获得1d2份食物）', null],
                        16: ['松枝（可制作火把，可作为柴火）', null],
                        22: ['松枝（可制作火把，可作为柴火）', null],
                        23: ['松脂（可点燃，可制作火把）', null],
                        29: ['松脂（可点燃，可制作火把）', null],
                        30: ['普通兽骨（可打磨工具，可出售）', null],
                        34: ['普通兽骨（可打磨工具，可出售）', null],
                        35: ['矿粒（可出售）', null],
                        39: ['矿粒（可出售）', null],
                        40: ['柴火/石块（燃料×1）', null],
                        44: ['柴火/石块（燃料×1）', null],
                        45: ['钱袋（获得1d3金币）', null],
                        47: ['钱袋（获得1d3金币）', null],
                        48: ['特殊材料', 'cl100'],
                        50: ['特殊材料', 'cl100'],
                    }
                },

                cl100: {
                    label: '特殊材料',
                    dice: 'd100',
                    desc: '稀有而珍贵的北境材料',
                    items: {
                        1: ['荧光苔（照明半径15尺，易燃，可在暴风雪中点燃）', null],
                        25: ['荧光苔（照明半径15尺，易燃，可在暴风雪中点燃）', null],
                        26: ['松茸（可出售，陷阱诱饵，食用后下次力量/体质优势）', null],
                        45: ['松茸（可出售，陷阱诱饵，食用后下次力量/体质优势）', null],
                        46: ['铁松松脂（易燃，耐烧，可在暴风雪中点燃；附赠动作涂抹武器，1d6火焰伤害）', null],
                        65: ['铁松松脂（易燃，耐烧，可在暴风雪中点燃；附赠动作涂抹武器，1d6火焰伤害）', null],
                        66: ['绒蜂蜜（可出售，陷阱诱饵，处理后食用1d4生命+寒冷抗性；直接食用1d3，2-3腹泻）', null],
                        72: ['绒蜂蜜（可出售，陷阱诱饵，处理后食用1d4生命+寒冷抗性；直接食用1d3，2-3腹泻）', null],
                        73: ['银蛛蛛网（可出售）', null],
                        85: ['银蛛蛛网（可出售）', null],
                        86: ['霜晶核（蕴含冰冷能量，可出售）', null],
                        95: ['霜晶核（蕴含冰冷能量，可出售）', null],
                        96: ['寒铁髓（寒铁中最为坚硬，魔力相性最好的部分的精华，可出售）', null],
                        100: ['寒铁髓（寒铁中最为坚硬，魔力相性最好的部分的精华，可出售）', null],
                    }
                },

                kw100: {
                    label: '矿物',
                    dice: 'd100',
                    desc: '埋藏于冻土之下的矿藏',
                    items: {
                        1: ['岩盐（腌制/调味，可出售）', null],
                        10: ['岩盐（腌制/调味，可出售）', null],
                        11: ['煤矿（火炉生火，可出售）', null],
                        25: ['煤矿（火炉生火，可出售）', null],
                        26: ['铜矿（可熔炼制作工具，可出售）', null],
                        35: ['铜矿（可熔炼制作工具，可出售）', null],
                        36: ['铁矿（可熔炼制作工具，可出售）', null],
                        50: ['铁矿（可熔炼制作工具，可出售）', null],
                        51: ['寒铁矿（北境特产，可熔炼制作工具，可出售）', null],
                        60: ['寒铁矿（北境特产，可熔炼制作工具，可出售）', null],
                        61: ['银矿（可熔炼，可出售）', null],
                        70: ['银矿（可熔炼，可出售）', null],
                        71: ['金矿（可熔炼，可出售）', null],
                        75: ['金矿（可熔炼，可出售）', null],
                        76: ['冰水晶（浅蓝色的小块魔法水晶，可出售）', null],
                        85: ['冰水晶（浅蓝色的小块魔法水晶，可出售）', null],
                        86: ['霜晶核（蕴含冰冷能量，可出售）', null],
                        92: ['霜晶核（蕴含冰冷能量，可出售）', null],
                        93: ['化石（可出售）', null],
                        96: ['化石（可出售）', null],
                        97: ['宝石（可出售）', null],
                        100: ['宝石（可出售）', null],
                    }
                },

                fx100: {
                    label: '特殊发现',
                    dice: 'd100',
                    desc: '雪原上隐藏的秘密',
                    items: {
                        1: ['发现遗迹', 'yj8'],
                        5: ['发现遗迹', 'yj8'],
                        6: ['发现灵泉（魔法泉水，可收集2次，单独饮用后下次智力相关检定优势，也许可调配为药水）', null],
                        15: ['发现灵泉（魔法泉水，可收集2次，单独饮用后下次智力相关检定优势，也许可调配为药水）', null],
                        16: ['发现猎人小屋（可长休/短休，获得1d4份口粮）', null],
                        40: ['发现猎人小屋（可长休/短休，获得1d4份口粮）', null],
                        41: ['发现天然温泉（可短休，回复1d4生命，下次体质优势）', null],
                        55: ['发现天然温泉（可短休，回复1d4生命，下次体质优势）', null],
                        56: ['发现岩洞（可长休/短休，躲避恶劣天气）', null],
                        85: ['发现岩洞（可长休/短休，躲避恶劣天气）', null],
                        86: ['发现矿坑（可调查，需携带矿镐）', null],
                        100: ['发现矿坑（可调查，需携带矿镐）', null],
                    }
                },

                yj8: {
                    label: '遗迹',
                    dice: 'd8',
                    desc: '被遗忘的古老遗存',
                    items: {
                        1: ['远古战场（发现古老的战场，满地都是断裂的武器和破损的甲胄，也许其中还有蒙尘的宝物；奥秘检定/调查检定DC20，成功则获得魔法物品）', null],
                        2: ['巨兽骨骸（发现远古巨兽的坚硬骨架，过奥秘检定DC18，成功则发现并可以尝试采集巨兽秘骨，失败则只能尝试采集巨兽之骨；采集需要过力量检定DC18，失败则无法采集）', null],
                        3: ['古老墓穴（也许沉睡着古老的存在）', null],
                        4: ['符文法阵（也许还能激活？需要过奥秘检定DC18，失败则无法得知此法阵作用；企图激活法阵需要过奥秘检定DC15，失败则无法激活）', null],
                        5: ['废弃神殿（废弃的神殿早已破旧不堪，甚至神像上都盖着厚厚的一层白雪）', null],
                        6: ['残破石碑（残破的石碑上记载着一些不被人们知晓的故事。阅读需进行历史或宗教检定DC15，成功可获得一条关于北境古代事件的线索，下次相关检定获得优势）', null],
                        7: ['倒塌建筑（倒塌的建筑埋没了一段历史。可进行力量检定DC15搬开碎石搜索，成功可获得1件完好旧物或材料；失败则无收获）', null],
                        8: ['神秘祭坛（接受献祭的对象的目光你也许承受不起）', null],
                    }
                },

                qsj100: {
                    label: '全随机事件',
                    dice: 'd100',
                    desc: '一切皆有可能',
                    items: {
                        1: ['特殊发现', 'fx100'],
                        4: ['特殊发现', 'fx100'],
                        5: ['特殊生物', 'sw100'],
                        8: ['特殊生物', 'sw100'],
                        9: ['特殊事件', 'sj6'],
                        15: ['特殊事件', 'sj6'],
                        16: ['发现材料', 'cl50'],
                        25: ['发现材料', 'cl50'],
                        26: ['环境', 'hj6'],
                        35: ['环境', 'hj6'],
                        36: ['野兽', 'ys10'],
                        50: ['野兽', 'ys10'],
                        51: ['中立/友善生物', 'zl12'],
                        60: ['中立/友善生物', 'zl12'],
                        61: ['人类', 'rl100'],
                        70: ['人类', 'rl100'],
                        71: ['遭遇', 'zy100'],
                        80: ['遭遇', 'zy100'],
                        81: ['探索', 'ts100'],
                        90: ['探索', 'ts100'],
                        91: ['调查', 'dc100'],
                        100: ['调查', 'dc100'],
                    }
                },

                wp: {
                    label: '物品表',
                    dice: '',
                    desc: '查询32项物品',
                    items: {
                        1: '药草（直接使用恢复1d2生命或止血）',
                        2: '魔法泉水（单独饮用后下次智力相关检定优势，也许可调配为药水）',
                        3: '浆果/野菜（获得1d2份食物）',
                        4: '松枝（可制作火把，可作为柴火）',
                        5: '荧光苔（照明半径15尺，易燃，可在暴风雪中点燃）',
                        6: '松茸（可出售，食用后下次力量/体质优势）',
                        7: '松脂（可点燃，可制作火把）',
                        8: '铁松松脂（易燃，耐烧，可在暴风雪中点燃；附赠动作涂抹武器，1d6火焰伤害）',
                        9: '普通兽骨（可打磨工具，可出售）',
                        10: '霜羽雉的蛋（可孵化，可出售）',
                        11: '霜羽雉的银羽（装饰品，可出售）',
                        12: '绒蜂蜜（可出售，食用后1d4生命+寒冷抗性）',
                        13: '银蛛蛛网（可出售）',
                        14: '矿粒（可出售）',
                        15: '岩盐（腌制/调味，可出售）',
                        16: '煤矿（火炉生火，可出售）',
                        17: '铜矿（可熔炼制作工具，可出售）',
                        18: '铁矿（可熔炼制作工具，可出售）',
                        19: '银矿（可熔炼，可出售）',
                        20: '金矿（可熔炼，可出售）',
                        21: '寒铁矿（北境特产，可熔炼制作工具，可出售）',
                        22: '寒铁髓（寒铁中最为坚硬，魔力相性最好的部分的精华，可出售）',
                        23: '霜晶核（蕴含冰冷能量，可出售）',
                        24: '冰水晶（浅蓝色的小块魔法水晶，可出售）',
                        25: '化石（可出售）',
                        26: '宝石（可出售）',
                        27: '钱袋（获得1d3金币）',
                        28: '巨兽之骨（埋骨于北境的远古巨兽的骨头，可出售）',
                        29: '巨兽秘骨（埋骨于北境的远古巨兽的骨头，其中精华在寒冷的淬炼下拥有了优良的魔力相性，可出售）',
                        30: '兽肉（烹煮后2d2份食物，陷阱诱饵，可出售）',
                        31: '白花藤（磨粉撒伤口，1d4生命，可出售）',
                        32: '魔纹卷轴（奥秘DC18-20鉴定，可出售视内容而定）',
                        33: '火把（点燃免疫2次严寒考验，点燃时消除2级严寒等级）',
                        34: '治疗药水（恢复2d4+2生命）',
                        35: '网兜（可触距离10尺，可制作陷阱）',
                        36: '长柄网兜（可触距离15尺，容量更大）',
                        37: '驱寒药膏（消除2级严寒，接下来6次事件抵抗寒冷体质豁免包括严寒考验）',
                    }
                }
            };

            const TABLE_NAMES = Object.keys(TABLES);

            const ITEM_ACTIONS = {
                'cl50': {
                    ranges: [
                        [1,6,{item:'药草',qty:1,unit:'份'}],
                        [7,15,{item:'浆果/野菜',qty_roll:'1d2',unit:'份食物'}],
                        [16,22,{item:'松枝',qty:1,unit:'份'}],
                        [23,29,{item:'松脂',qty:1,unit:'份'}],
                        [30,34,{item:'普通兽骨',qty:1,unit:'份'}],
                        [35,39,{item:'矿粒',qty:1,unit:'份'}],
                        [40,44,{item:'柴火/石块',qty:1,unit:'份'}],
                        [45,47,{coin:'gp',coin_roll:'1d3'}],
                        [48,50,null], // 特殊材料→cl100链式，本身不产出
                    ]
                },
                'cl100': {
                    ranges: [
                        [1,25,{item:'荧光苔',qty:1,unit:'份'}],
                        [26,45,{item:'松茸',qty:1,unit:'份'}],
                        [46,65,{item:'铁松松脂',qty:1,unit:'份'}],
                        [66,72,{item:'绒蜂蜜',qty:1,unit:'份'}],
                        [73,85,{item:'银蛛蛛网',qty:1,unit:'份'}],
                        [86,95,{item:'霜晶核',qty:1,unit:'份'}],
                        [96,100,{item:'寒铁髓',qty:1,unit:'份'}],
                    ]
                },
                'fx100': {
                    ranges: [
                        [6,15,{item:'魔法泉水',qty:2,unit:'份'}],
                        [16,40,{item:'口粮',qty_roll:'1d4',unit:'份'}],
                    ]
                },
                'kw100': {
                    ranges: [
                        [1,10,{item:'岩盐',qty:1,unit:'份'}],
                        [11,25,{item:'煤矿',qty:1,unit:'份'}],
                        [26,35,{item:'铜矿',qty:1,unit:'份'}],
                        [36,50,{item:'铁矿',qty:1,unit:'份'}],
                        [51,60,{item:'寒铁矿',qty:1,unit:'份',bonus:{dice:'1d6',target:6,item:'寒铁髓',qty:1,unit:'份'}}],
                        [61,70,{item:'银矿',qty:1,unit:'份'}],
                        [71,75,{item:'金矿',qty:1,unit:'份'}],
                        [76,85,{item:'冰水晶',qty:1,unit:'份'}],
                        [86,92,{item:'霜晶核',qty:1,unit:'份'}],
                        [93,96,{item:'化石',qty:1,unit:'份'}],
                        [97,100,{item:'宝石',qty:1,unit:'份'}],
                    ]
                },
            };

            const CHECK_ACTIONS = {
                'hj6': {
                    1: { // 雪坑
                        title: '雪坑',
                        desc: '前方出现被新雪掩盖的深坑！',
                        steps: [
                            { label: '被动察觉', ability: 'wis', skill: '察觉', dc: 15, passive: true,
                              passMsg: '察觉到雪下的异常，安全绕开', passDone: true,
                              failMsg: '未察觉异常，一脚踩空……', failDone: false },
                            { label: '敏捷豁免', ability: 'dex', save: true, dc: 15,
                              passMsg: '及时跳开，避开了雪坑！', passDone: true,
                              failMsg: '跌入深坑，受到{damage}钝击伤害', failDone: true, damage: '1d6',
                              failExtra: { label: '运动DC12爬出', ability: 'str', skill: '运动', dc: 12,
                                passMsg: '成功爬出雪坑', passDone: true,
                                failMsg: '暂时困在坑中，下次事件可再尝试', failDone: true } }
                        ]
                    },
                    2: { // 暴风雪
                        title: '暴风雪',
                        desc: '突如其来的暴风雪席卷而来！',
                        steps: [
                            { label: '自然', ability: 'wis', skill: '自然', dc: 15,
                              passMsg: '在暴风雪中辨明方向', passDone: true,
                              failMsg: '在风雪中迷失了方向', failDone: true,
                              failEffect: function() { CTX.survival.isLost = true;
                                CTX.survival.lostEventsRemaining = 2;
                                CTX.addSystemLog('🧭 暴风雪中迷失方向！', 'danger'); } }
                        ]
                    },
                    4: { // 霜雾
                        title: '霜雾',
                        desc: '浓厚的霜雾笼罩了视野……',
                        steps: [
                            { label: '体质豁免', ability: 'con', save: true, dc: 15,
                              passMsg: '顶着严寒穿过霜雾', passDone: true,
                              failMsg: '寒气侵入骨髓，受到{damage}寒冷伤害', failDone: true, damage: '1d4' }
                        ]
                    },
                    5: { // 冻雨
                        title: '冻雨',
                        desc: '冰冷的冻雨从天而降！',
                        steps: [
                            { label: '体质豁免', ability: 'con', save: true, dc: 15,
                              passMsg: '咬牙撑过了冻雨', passDone: true,
                              failMsg: '冻雨浸透衣衫，受到{damage}寒冷伤害', failDone: true, damage: '1d4' }
                        ]
                    },
                },
                'sj6': {
                    1: { // 雪崩
                        title: '雪崩',
                        desc: '远处传来轰鸣，雪崩正向你袭来！',
                        steps: [
                            { label: '敏捷/体质豁免', ability: 'dex', save: true, dc: 12,
                              passMsg: '千钧一发之际躲开了雪崩！', passDone: true,
                              failMsg: '被卷入雪崩，受到{damage}寒冷伤害', failDone: true, damage: '1d6',
                              failExtra: { label: '运动DC15脱离', ability: 'str', skill: '运动', dc: 15,
                                passMsg: '奋力从雪中爬出！', passDone: true,
                                failMsg: '仍在雪中挣扎，下次事件可再尝试', failDone: true } }
                        ]
                    },
                    2: { // 冰层破裂
                        title: '冰层破裂',
                        desc: '脚下的冰层突然裂开！',
                        steps: [
                            { label: '敏捷豁免', ability: 'dex', save: true, dc: 12,
                              passMsg: '迅速跳到安全地带', passDone: true,
                              failMsg: '落入冰冷的水中，受到{damage}寒冷伤害并陷入失温', failDone: true,
                              damage: '1d6',
                              failEffect: function() { CTX.survival.coldLevel = Math.min(3, CTX.survival.coldLevel + 1);
                                CTX.addSystemLog('❄️ 冰水浸泡，严寒等级+1', 'danger'); } }
                        ]
                    },
                    3: { // 冰层震动
                        title: '冰层震动',
                        desc: '冰层剧烈震动，脚下不稳！',
                        steps: [
                            { label: '敏捷豁免', ability: 'dex', save: true, dc: 10,
                              passMsg: '稳住身形，安然无恙', passDone: true,
                              failMsg: '失去平衡摔倒在地，陷入俯卧状态', failDone: true }
                        ]
                    },
                    4: { // 陷阱
                        title: '陷阱',
                        desc: '你察觉到前方有些不自然……',
                        steps: [
                            { label: '被动察觉', ability: 'wis', skill: '察觉', dc: 12, passive: true,
                              passMsg: '发现了隐藏的陷阱，安全避开', passDone: true,
                              failMsg: '没有注意到脚下的陷阱……', failDone: false },
                            { label: '敏捷豁免', ability: 'dex', save: true, dc: 12,
                              passMsg: '反应迅速，避开了陷阱！', passDone: true,
                              failMsg: '触发陷阱，受到{damage}穿刺伤害', failDone: true, damage: '1d4' }
                        ]
                    },
                    5: { // 特殊标记
                        title: '特殊标记',
                        desc: '雪地上刻着一些不寻常的符号标记……',
                        steps: [
                            { label: '奥秘/调查', ability: 'int', skill: '调查', dc: 15,
                              passMsg: '解读了标记的含义！下次自然检定优势', passDone: true,
                              passEffect: function() { CTX.addSystemLog('🔮 解读标记成功（下次自然检定优势）', 'success'); },
                              failMsg: '这些标记毫无意义……', failDone: true }
                        ]
                    },
                },
                'zy100': {
                    56: { // 陷入迷失（区间56-60）
                        title: '陷入迷失',
                        desc: '四周的景象变得陌生而扭曲……',
                        effect: function() {
                            CTX.survival.isLost = true;
                            CTX.survival.lostEventsRemaining = 2;
                            CTX.survival.lostDcPenalty = Math.min(3, CTX.survival.lostDcPenalty + 1);
                            CTX.addSystemLog('🧭 陷入迷失现象！体质/感知检定劣势，持续2次事件', 'danger');
                        }
                    },
                    81: { // 恶霜现象（区间81-85）
                        title: '恶霜现象',
                        desc: '诡异的寒霜笼罩了这片区域……',
                        effect: function() {
                            CTX.survival.evilFrostActive = true;
                            CTX.addSystemLog('👻 遭遇恶霜现象！每事件自动进行生存DC15方向辨别，失败则损失1d4生命并持续劣势', 'danger');
                        }
                    },
                },
                'ts100': {
                    51: { // 采集资源（区间51-80）
                        title: '采集资源',
                        desc: '雪地里似乎埋藏着一些有用的东西……',
                        steps: [
                            { label: '调查', ability: 'int', skill: '调查', dc: 10,
                              passMsg: '找到了可用的材料！', passDone: true,
                              passEffect: function(el) {
                                var roll = CTX.rollDiceExpr('1d100');
                                if (roll <= 60) {
                                    CTX.addCheckResult(el, '进入随机材料表');
                                    CTX.runCheckChain(el, 'cl50');
                                } else {
                                    CTX.addCheckResult(el, '获得了柴火与石块');
                                    if (CTX.activeChar) {
                                        CTX.activeChar.inventory = CTX.activeChar.inventory || [];
                                        var stacked = false;
                                        for (var si = 0; si < CTX.activeChar.inventory.length; si++) {
                                            if (CTX.activeChar.inventory[si].name === '柴火/石块') { CTX.activeChar.inventory[si].qty++;
                                                stacked = true; break; }
                                        }
                                        if (!stacked) CTX.activeChar.inventory.push({name:'柴火/石块', qty:1, location:'背包', weight:1});
                                    }
                                    CTX.survival.fuel.firewood = (CTX.survival.fuel.firewood || 0) + 1;
                                }
                              },
                              failMsg: '翻找了半天，一无所获', failDone: true }
                        ]
                    },
                },
                'dc100': {
                    36: { // 发现异常（区间36-60）
                        title: '发现异常',
                        desc: '你注意到了一些不寻常的痕迹……',
                        steps: [
                            { label: '察觉', ability: 'wis', skill: '察觉', dc: 12,
                              passMsg: '发现了隐藏的东西！', passDone: true,
                              passEffect: function(el) {
                                var r = Math.random();
                                CTX.runCheckChain(el, r < 0.4 ? 'fx100' : 'cl50');
                              },
                              failMsg: '可能只是错觉……', failDone: true }
                        ]
                    },
                },
                'zl12': {
                    1: { // 雪蹄兔跟踪
                        title: '雪蹄兔',
                        desc: '一只雪蹄兔受惊逃跑，或许可以跟踪它找到浆果丛……',
                        steps: [
                            { label: '生存', ability: 'wis', skill: '生存', dc: 12,
                              passMsg: '跟踪雪蹄兔找到了浆果丛！', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl50', 7); },
                              failMsg: '雪蹄兔消失在风雪中', failDone: true }
                        ]
                    },
                    2: { // 野鹿跟踪
                        title: '野鹿',
                        desc: '鹿群的足迹延伸向远方，跟上去也许能找到食物或荧光苔……',
                        steps: [
                            { label: '自然', ability: 'int', skill: '自然', dc: 15,
                              passMsg: '跟踪成功！', passDone: true,
                              passEffect: function(el) {
                                var r = Math.random();
                                if (r < 0.2) { CTX.addCheckResult(el, '发现了荧光苔丛，获得2份荧光苔');
                                    CTX.survival.fuel.glow_moss = (CTX.survival.fuel.glow_moss||0) + 2;
                                    if (CTX.activeChar) CTX.activeChar.inventory.push({name:'荧光苔',qty:2,location:'背包',weight:1}); }
                                else { CTX.addCheckResult(el, '发现了野菜！');
                                    var qty = CTX.rollDiceExpr('1d2');
                                    CTX.addCheckResult(el, '获得' + qty + '份浆果/野菜');
                                    if (CTX.activeChar) { var stacked=false; for(var si=0;si<CTX.activeChar.inventory.length;si++){if(CTX.activeChar.inventory[si].name==='浆果/野菜'){CTX.activeChar.inventory[si].qty+=qty;stacked=true;}} if(!stacked)CTX.activeChar.inventory.push({name:'浆果/野菜',qty:qty,location:'背包',weight:1}); } }
                              },
                              failMsg: '鹿群的足迹被风雪掩盖了', failDone: true }
                        ]
                    },
                    3: { // 雪鸮跟随
                        title: '雪鸮',
                        desc: '一只雪鸮在空中盘旋，跟随它或许能找到岩洞……',
                        steps: [
                            { label: '生存', ability: 'wis', skill: '生存', dc: 15,
                              passMsg: '雪鸮引领你找到了一处岩洞！获得岩洞庇护', passDone: true,
                              passEffect: function() { CTX.survival.isInShelter = true;
                                CTX.survival.shelterType = 'cave';
                                CTX.addSystemLog('🏔️ 发现岩洞，可在此躲避恶劣天气', 'success'); },
                              failMsg: '雪鸮飞远了，消失在夜色中', failDone: true }
                        ]
                    },
                    6: { // 霜鼠跟踪
                        title: '霜鼠',
                        desc: '一群霜鼠匆匆跑过，可能是在赶回温暖的地脉……',
                        steps: [
                            { label: '自然', ability: 'int', skill: '自然', dc: 15,
                              passMsg: '跟着霜鼠找到了温暖地脉！接下来2次体质检定优势', passDone: true,
                              failMsg: '霜鼠钻进雪洞消失了', failDone: true }
                        ]
                    },
                    7: { // 雪貂
                        title: '雪貂',
                        desc: '一只好奇的雪貂靠近了你……',
                        steps: [
                            { label: '驯兽', ability: 'wis', skill: '驯兽', dc: 10,
                              passMsg: '雪貂接受了你的抚摸，为你叼来了一些东西', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl50'); },
                              failMsg: '雪貂警惕地逃开了', failDone: true }
                        ]
                    },
                    9: { // 麝牛
                        title: '麝牛',
                        desc: '麝牛群警惕地盯着你……',
                        steps: [
                            { label: '驯兽', ability: 'wis', skill: '驯兽', dc: 15,
                              passMsg: '麝牛群放松了警惕，允许你靠近', passDone: true,
                              failMsg: '麝牛群躁动不安，还是离远点好', failDone: true }
                        ]
                    },
                    10: { // 银蛛
                        title: '银蛛',
                        desc: '银色的蛛网在月光下闪烁……',
                        steps: [
                            { label: '敏捷豁免', ability: 'dex', save: true, dc: 12,
                              passMsg: '小心翼翼地采集到了蛛网！', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl100', 73); },
                              failMsg: '银蛛被激怒了！受到{damage}伤害', failDone: true, damage: '1d4' }
                        ]
                    },
                    11: { // 霜羽雉
                        title: '霜羽雉',
                        desc: '霜羽雉华丽的身影在林间穿行……',
                        steps: [
                            { label: '自然', ability: 'int', skill: '自然', dc: 15,
                              passMsg: '跟随霜羽雉找到了它的巢穴！', passDone: true,
                              passEffect: function(el) {
                                var eggs = CTX.rollDiceExpr('1d3');
                                var d20 = CTX.rollDiceExpr('1d20');
                                var hasFeather = d20 >= 1 && d20 <= 5;
                                var msg = '🥚 获得霜羽雉的蛋×' + eggs;
                                if (CTX.activeChar) {
                                    var stacked = false;
                                    for (var si = 0; si < CTX.activeChar.inventory.length; si++) {
                                        if (CTX.activeChar.inventory[si].name === '霜羽雉的蛋') { CTX.activeChar.inventory[si].qty += eggs;
                                            stacked = true; break; }
                                    }
                                    if (!stacked) CTX.activeChar.inventory.push({name:'霜羽雉的蛋',qty:eggs,location:'背包',weight:1});
                                }
                                if (hasFeather) {
                                    msg += '，🪶 获得霜羽雉的银羽×1（1d20=' + d20 + '）';
                                    if (CTX.activeChar) CTX.activeChar.inventory.push({name:'霜羽雉的银羽',qty:1,location:'背包',weight:1});
                                } else {
                                    msg += '（1d20=' + d20 + '，未掉落银羽）';
                                }
                                CTX.addCheckResult(el, msg, '#ffcc80');
                              },
                              failMsg: '霜羽雉飞走了', failDone: true }
                        ]
                    },
                    12: { // 绒蜂巢
                        title: '绒蜂巢',
                        desc: '一个绒蜂巢悬挂在枯枝上，散发着甜香……',
                        steps: [
                            { label: '驯兽', ability: 'wis', skill: '驯兽', dc: 15,
                              passMsg: '成功安抚绒蜂，采集到了蜂蜜！', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl100', 66); },
                              failMsg: '绒蜂被激怒！受到{damage}伤害', failDone: true, damage: '1d4' }
                        ]
                    },
                    8: { // 野鹿 — 第2组野鹿
                        title: '野鹿',
                        desc: '一群野鹿在远处的林地间出没……',
                        steps: [
                            { label: '自然', ability: 'int', skill: '自然', dc: 15,
                              passMsg: '跟随野鹿找到了食物和水源！', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl50', 7); },
                              failMsg: '野鹿警觉地逃走了', failDone: true }
                        ]
                    },
                },
                'sw100': {
                    46: { // 冬之氏族精灵（区间46-60）
                        title: '冬之氏族精灵',
                        desc: '一位身着雪白长袍的精灵从风雪中现身……',
                        steps: [
                            { label: '交流', ability: 'cha', skill: '说服', dc: 15,
                              passMsg: '精灵友善地与你分享北境的秘密', passDone: true,
                              passEffect: function() { CTX.addSystemLog('🧝 精灵赐予祝福（下次自然与感知检定优势）', 'success'); },
                              failMsg: '精灵摇摇头，消失在风雪中', failDone: true }
                        ]
                    },
                    61: { // 霜灵（区间61-92）
                        title: '霜灵',
                        desc: '一个半透明的蓝色灵体在冰面上飘浮……',
                        steps: [
                            { label: '奥秘', ability: 'int', skill: '奥秘', dc: 15,
                              passMsg: '霜灵回应了你，分给你寒冰能量！获得霜晶核', passDone: true,
                              passEffect: function(el) { CTX.runCheckChain(el, 'cl100', 86); },
                              failMsg: '霜灵无视你的存在，缓缓飘远', failDone: true }
                        ]
                    },
                    96: { // 水星守卫（区间96-100）
                        title: '水星守卫',
                        desc: '一位泛着微光的神秘守卫挡在前方……',
                        steps: [
                            { label: '水星守卫引导', desc: '守卫示意你远离前方的危险区域',
                              effect: function() {
                                if (CTX.activeChar) { CTX.activeChar.hp = CTX.activeChar.hpMax;
                                    CTX.activeChar.tempHp = 0;
                                    CTX.renderCharDetail(CTX.activeCharId);
                                    CTX.addSystemLog('✨ 水星守卫的光芒治愈了你，恢复至满状态！', 'success'); }
                                if (CTX.survival.coldLevel > 0) { CTX.survival.coldLevel = 0;
                                    CTX.addSystemLog('❄️ 水星守卫驱散了严寒', 'success'); }
                                CTX.addSystemLog('🧭 水星守卫指引了安全的方向（下次智力检定优势）', 'success');
                              }, passDone: true }
                        ]
                    },
                },
            };

            // ━━ 冒险者等级晋升表（设计稿：北境雪原优化方案分析.txt 五、冒险者等级晋升系统）━━
            // 当前仅实现：晋升条件（need：所需累计事件）与头衔（rank）与晋升积分奖励（reward）；
            // 各等级特殊效果后续版本再加
            // color: 徽章颜色
            const RANK_LEVELS = [
                { rank: '青羽', need: 0,   color: '#9db4c8', reward: 0 },
                { rank: '黑羽', need: 50,  color: '#8a8aa0', reward: 10 },
                { rank: '蓝羽', need: 120, color: '#5a8ac8', reward: 30 },
                { rank: '银羽', need: 220, color: '#c0c0d8', reward: 60 },
                { rank: '金羽', need: 350, color: '#ffd700', reward: 120 },
                { rank: '赤羽', need: 520, color: '#e0555a', reward: 200 },
                { rank: '白羽', need: 750, color: '#ffffff', reward: 400 },
            ];

    window.NORTH_DATA = {
        TABLES: TABLES,
        TABLE_NAMES: TABLE_NAMES,
        ITEM_ACTIONS: ITEM_ACTIONS,
        CHECK_ACTIONS: CHECK_ACTIONS,
        RANK_LEVELS: RANK_LEVELS
    };
})();
