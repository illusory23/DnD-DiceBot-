/**
 * 确定性骰子主引擎 v3 — 多人同时掷骰
 * 所有玩家的骰子共存于同一物理世界，独立追踪结果。
 */

import { SeededRandom } from './prng.js';
import { DeterministicPhysics } from './physics.js';
import { DiceRenderer } from './dice-renderer.js';
import { FrameSyncClient } from './sync-client.js';

export function parseNotation(notation) {
    const clean = notation.replace(/\s+/g, '').toLowerCase();
    const m = clean.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/);
    if (!m) throw new Error('无法解析: ' + notation);
    const count = parseInt(m[1]), sides = parseInt(m[2]), mod = parseInt(m[3] || '0');
    if (![4, 6, 8, 10, 12, 20, 100].includes(sides)) throw new Error('不支持的骰子: d' + sides);
    return { dice: Array.from({ length: count }, () => ({ sides })), modifier: mod, notation: clean };
}

// 玩家颜色（用于区分不同玩家的骰子）
const PLAYER_COLORS = ['#cc3333', '#3366cc', '#33aa55', '#cc8833', '#9933cc', '#33aacc'];

export class DeterministicDiceEngine {
    constructor(container, THREE, opts = {}) {
        this.THREE = THREE;
        this.container = container;
        this.renderer = null;
        this.physics = null;
        this.sync = null;
        this.initialized = false;
        this.animId = null;

        this.syncMode = opts.syncMode || 'local';
        this.syncUrl = opts.syncUrl || `ws://${location.host}/ws`;

        // 活跃投掷追踪: Map<rollId, {seed, bodies, modifier, notation, roller, resolve}>
        this._activeRolls = new Map();
        this._nextRollId = 1;
        this._nextPlayerColor = 0;
        this._playerColors = new Map(); // rollerName → colorIndex

        this.onResult = opts.onResult || null;
    }

    async init() {
        if (this.initialized) return;
        this.renderer = new DiceRenderer(this.container, this.THREE);
        this.physics = new DeterministicPhysics({
            gravity: 11, restitution: 0.38, friction: 0.55,
            rollingResist: 0.93, airDrag: 0.997, settleThresh: 0.05,
            settleFrames: 70, maxFrames: 1200,
        });

        if (this.syncMode === 'sync') {
            this.sync = new FrameSyncClient(this.syncUrl);
            try { await this.sync.connect(); this._setupSync(); console.log('[Engine] 同步已连接'); }
            catch (e) { console.warn('[Engine] 同步失败, 本地模式'); this.syncMode = 'local'; this.sync = null; }
        }

        this._startLoop();
        this.initialized = true;
        console.log('[Engine] v3 多人掷骰引擎就绪');
    }

    /** 获取玩家专属颜色索引 */
    _getPlayerColor(rollerName) {
        if (!this._playerColors.has(rollerName)) {
            this._playerColors.set(rollerName, this._nextPlayerColor % PLAYER_COLORS.length);
            this._nextPlayerColor++;
        }
        return this._playerColors.get(rollerName);
    }

    /** 本地掷骰 */
    async roll(notation, meta = {}) {
        if (!this.initialized) await this.init();
        const { dice, modifier, notation: clean } = parseNotation(notation);
        const seed = meta.seed ?? (Date.now() ^ (Math.random() * 0x7FFFFFFF));
        const rng = new SeededRandom(seed, 'xoshiro128');
        const rollId = this._nextRollId++;
        const roller = meta.roller || '匿名';
        const colorIdx = this._getPlayerColor(roller);

        console.log('[Engine] 掷骰 id=%d: %s (种子:%d, 颜色:%d)', rollId, clean, seed, colorIdx);

        // 添加骰子到物理世界（不清除其他玩家的骰子）
        const bodies = [];
        for (const die of dice) {
            const body = this.physics.addDice(die.sides, rng, { ownerId: rollId });
            bodies.push(body);
            this.renderer.addDiceMesh(die.sides, colorIdx);
        }

        // 追踪本次投掷
        const roll = { seed, bodies, modifier, notation: clean, roller, colorIdx, rng, startFrame: this.physics.frameCount };
        this._activeRolls.set(rollId, roll);

        // 同步广播
        if (this.syncMode === 'sync' && this.sync && this.sync.connected) {
            this.sync.sendDiceRoll(seed, dice, { notation: clean, roller });
        }

        // 等待本批骰子停稳
        return new Promise(resolve => {
            roll.resolve = resolve;
            // 超时保护 25s
            roll.timeout = setTimeout(() => {
                if (this._activeRolls.has(rollId)) {
                    console.warn('[Engine] 投掷超时 id=%d', rollId);
                    this._finishRoll(rollId);
                }
            }, 25000);
        });
    }

    /** 同步他人的掷骰 */
    startSyncRoll(seed, dice, notation, roller) {
        if (!this.initialized) return;
        const rng = new SeededRandom(seed, 'xoshiro128');
        const rollId = this._nextRollId++;
        const colorIdx = this._getPlayerColor(roller || '远程');

        console.log('[Engine] 同步掷骰 id=%d: %s (种子:%d)', rollId, notation, seed);

        const bodies = [];
        for (const die of dice) {
            const body = this.physics.addDice(die.sides, rng, { ownerId: rollId });
            bodies.push(body);
            this.renderer.addDiceMesh(die.sides, colorIdx);
        }

        const roll = { seed, bodies, modifier: 0, notation, roller: roller || '远程', colorIdx, rng, startFrame: this.physics.frameCount };
        this._activeRolls.set(rollId, roll);
    }

    /** 完成一个投掷 */
    _finishRoll(rollId) {
        const roll = this._activeRolls.get(rollId);
        if (!roll) return;
        this._activeRolls.delete(rollId);
        if (roll.timeout) clearTimeout(roll.timeout);

        const results = this.physics.getOwnerResults(rollId);
        const values = results.map(r => r.value);
        const total = values.reduce((a, b) => a + b, 0) + roll.modifier;

        // 延迟移除骰子网格（让玩家看到最终结果）
        setTimeout(() => {
            this.renderer.removeDiceByColor(roll.colorIdx);
            this.physics.removeOwnerDice(rollId);
        }, 3000);

        const finalResult = {
            seed: roll.seed, notation: roll.notation, modifier: roll.modifier,
            dice: results, values, total, roller: roll.roller,
            colorIdx: roll.colorIdx, timestamp: Date.now(),
        };

        if (roll.resolve) roll.resolve(finalResult);
        if (this.onResult) this.onResult(finalResult);

        // 同步广播结果
        if (this.sync && this.sync.connected) {
            this.sync.sendDirect({
                type: 'dice_result', seed: roll.seed, results, total,
                notation: roll.notation, roller: roll.roller, timestamp: Date.now(),
            });
        }
    }

    /** 当前是否有活跃投掷 */
    isRolling() { return this._activeRolls.size > 0; }

    /** 检查是否有骰子在模拟中（非停稳） */
    _hasActivePhysics() {
        return this.physics.bodies.some(b => !b.settled);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this.renderer?.dispose();
        this.sync?.disconnect();
    }

    // ━━ 内部 ━━

    _startLoop() {
        const loop = () => {
            this.animId = requestAnimationFrame(loop);
            if (!this.initialized) return;

            // 推进物理
            if (this._hasActivePhysics()) {
                this.physics.step();
            }

            // 检查各投掷是否完成
            for (const [rollId, roll] of this._activeRolls) {
                if (!roll.resolve) continue; // 同步投掷不需要resolve
                if (this.physics.areOwnerDiceSettled(rollId)) {
                    // 额外延迟：停稳后再等0.5秒确保真正静止
                    if (!roll._settleConfirmedAt) {
                        roll._settleConfirmedAt = this.physics.frameCount;
                    } else if (this.physics.frameCount - roll._settleConfirmedAt > 30) {
                        this._finishRoll(rollId);
                    }
                } else {
                    roll._settleConfirmedAt = null;
                }
            }

            // 同步渲染
            this.renderer.syncWithPhysics(this.physics.bodies);
            this.renderer.render();
        };
        this.animId = requestAnimationFrame(loop);
    }

    _setupSync() {
        if (!this.sync) return;
        this.sync.on('start', (data) => {
            this.startSyncRoll(data.seed, data.dice, data.notation || '', data.roller);
        });
        this.sync.on('result', (data) => {
            if (this.onResult) {
                const values = (data.results || []).map(r => r.value);
                this.onResult({
                    seed: data.seed, notation: data.notation || '',
                    dice: data.results, values, total: data.total,
                    roller: data.roller, timestamp: Date.now(),
                });
            }
        });
        this.sync.on('disconnect', () => console.warn('[Engine] 同步断开'));
        this.sync.on('error', (d) => console.error('[Engine] 同步错误:', d.message));
    }
}
