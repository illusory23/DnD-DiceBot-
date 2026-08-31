// ═══════════════════════════════════════════════════════════════
// 法术效果库（v5.12 第一期：伤害 / 治疗 / 临时生命）
// 结构：法术名 → { kind, expr|fixed, save?, dmgType?, desc }
//   kind:  damage  攻击流程（命中后自动用 expr 掷伤害）
//          heal    治疗流程（自动用 expr 掷治疗）
//          temp_hp 治疗流程（掷 expr / 用 fixed，确认结算改为加临时生命）
//          fn      专属效果函数（如吸血鬼之触：攻击命中后自动回血）
//   expr:  骰子表达式；fixed: 固定数值（非骰子，如医疗术 70）
//   save:  豁免类型（当前仅供参考展示，豁免自动判定属后续阶段）
// 未登记法术：保持原手动流程，不阻塞。
// 数值基准：玩家手册（PHB）经典数值；提取辅助脚本 web/_extract_spell_effects.py
// ═══════════════════════════════════════════════════════════════
window.SPELL_EFFECTS = (function() {
    'use strict';
    const T = {
        // ━━ 伤害类（damage）━━
        '酸液飞溅': { kind: 'damage', expr: '1d6', dmgType: '强酸', save: '敏捷', desc: '1d6 强酸伤害（敏捷豁免减半）' },
        '燃烧之手': { kind: 'damage', expr: '3d6', dmgType: '火焰', save: '敏捷', desc: '3d6 火焰伤害（敏捷豁免减半）' },
        '灼热射线': { kind: 'damage', expr: '2d6', dmgType: '火焰', desc: '每束 2d6 火焰伤害（共 3 束，逐束攻击）' },
        '火球术':   { kind: 'damage', expr: '8d6', dmgType: '火焰', save: '敏捷', desc: '8d6 火焰伤害（敏捷豁免减半）' },
        '闪电束':   { kind: 'damage', expr: '8d6', dmgType: '闪电', save: '敏捷', desc: '8d6 闪电伤害（敏捷豁免减半）' },
        '冰锥术':   { kind: 'damage', expr: '8d8', dmgType: '寒冷', save: '敏捷', desc: '8d8 寒冷伤害（敏捷豁免减半）' },
        '冷冻射线': { kind: 'damage', expr: '1d8', dmgType: '寒冷', desc: '1d8 寒冷伤害' },
        '心灵之匕': { kind: 'damage', expr: '2d6', dmgType: '心灵', save: '智力', desc: '2d6 心灵伤害（智力豁免减半）' },
        '魔法飞弹': { kind: 'damage', expr: '1d4+1', dmgType: '力场', desc: '每颗飞弹 1d4+1 力场伤害（共 3 颗，必中）' },
        '火墙术':   { kind: 'damage', expr: '5d8', dmgType: '火焰', save: '敏捷', desc: '5d8 火焰伤害（敏捷豁免减半）' },
        '冰墙术':   { kind: 'damage', expr: '10d6', dmgType: '寒冷', save: '敏捷', desc: '10d6 寒冷伤害（敏捷豁免减半）' },
        '冰风暴':   { kind: 'damage', expr: '2d8+4d6', dmgType: '寒冷', save: '敏捷', desc: '2d8 钝击 + 4d6 寒冷（敏捷豁免减半）' },
        '毒云术':   { kind: 'damage', expr: '10d8', dmgType: '毒素', save: '体质', desc: '10d8 毒素伤害（体质豁免减半）' },
        '死亡一指': { kind: 'damage', expr: '7d8+30', dmgType: '暗蚀', save: '体质', desc: '7d8+30 暗蚀伤害（≤100 生命直接击杀）' },
        '连环闪电': { kind: 'damage', expr: '10d8', dmgType: '闪电', save: '敏捷', desc: '10d8 闪电伤害（敏捷豁免减半，跳至第二目标）' },
        // ━━ 治疗类（heal）━━
        '疗伤术':     { kind: 'heal', expr: '1d8+3', desc: '恢复 1d8+3 点生命值（+施法属性调整值）' },
        '治愈真言':   { kind: 'heal', expr: '1d4+3', desc: '恢复 1d4+3 点生命值（+施法属性调整值）' },
        '治疗祷言':   { kind: 'heal', expr: '2d8+3', desc: '恢复 2d8+3 点生命值（+施法属性调整值，至多 6 名生物）' },
        '群体疗伤术': { kind: 'heal', expr: '3d8+3', desc: '恢复 3d8+3 点生命值（+施法属性调整值，至多 6 名生物）' },
        '群体治愈真言': { kind: 'heal', expr: '1d4+3', desc: '恢复 1d4+3 点生命值（+施法属性调整值，至多 6 名生物）' },
        '医疗术':     { kind: 'heal', fixed: 70, desc: '恢复 70 点生命值' },
        // ━━ 临时生命类（temp_hp）━━
        '虚假生命': { kind: 'temp_hp', expr: '1d4+4', desc: '获得 1d4+4 点临时生命值' },
        '援助术':   { kind: 'temp_hp', fixed: 5, desc: '获得 5 点临时生命值（每升一环 +5）' },
        // ━━ 专属效果函数（fn）━━
        '吸血鬼之触': { kind: 'fn', desc: '攻击命中后按实际伤害自动恢复生命值' },
    };
    return {
        get: function(name) { return T[name] || null; },
        list: function() { return T; },
    };
})();
