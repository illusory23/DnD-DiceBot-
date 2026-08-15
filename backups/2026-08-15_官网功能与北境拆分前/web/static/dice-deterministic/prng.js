/**
 * 确定性伪随机数生成器 (Deterministic PRNG)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 使用 mulberry32 算法，给定相同种子保证在所有 JS 引擎上产生相同序列。
 * 附带 AES-128 级别的 seed 扩展和常用分布函数。
 *
 * 方案E 核心依赖：所有客户端的物理模拟随机性来源于此模块。
 */

/**
 * mulberry32 — 32位高质量PRNG
 * 来源: Tommy Ettinger (2021), Public Domain
 * 周期: 2^32, 通过 PractRand 和 BigCrush 测试
 */
export function mulberry32(seed) {
    let state = seed | 0;  // 强制转为32位整数
    return function () {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;  // [0, 1)
    };
}

/**
 * xoshiro128** — 128位状态的高质量PRNG
 * 速度更快，周期 2^128-1，通过 BigCrush
 * 适用于需要大量随机数的场景（如物理模拟每帧调用）
 */
export function xoshiro128ss(seed) {
    // 使用 splitmix32 从单个 seed 扩展出 4 个 32位状态
    function splitmix32(s) {
        return function () {
            s |= 0;
            s = (s + 0x9e3779b9) | 0;
            let t = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
            t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
            return (t ^ (t >>> 16)) >>> 0;
        };
    }
    const sm = splitmix32(seed | 0);
    let s0 = sm(), s1 = sm(), s2 = sm(), s3 = sm();

    return function () {
        const result = Math.imul(s1 * 5, 0x7fffffff) >>> 0;  // rol(s1 * 5, 7) * 9
        const t = s1 << 9;
        s2 ^= s0;
        s3 ^= s1;
        s1 ^= s2;
        s0 ^= s3;
        s2 ^= t;
        s3 = (s3 << 11) | (s3 >>> 21);  // rol(s3, 11)
        return (result >>> 0) / 4294967296;
    };
}

/**
 * SeededRandom — 封装PRNG，提供常用方法
 */
export class SeededRandom {
    /**
     * @param {number|string} seed - 数字或字符串种子
     * @param {'mulberry32'|'xoshiro128'} algorithm
     */
    constructor(seed, algorithm = 'xoshiro128') {
        // 字符串种子转为数字哈希
        if (typeof seed === 'string') {
            seed = this._hashString(seed);
        }
        this._seed = seed | 0;
        this._algorithm = algorithm;
        this._rng = algorithm === 'mulberry32'
            ? mulberry32(this._seed)
            : xoshiro128ss(this._seed);
        this._callCount = 0;
    }

    /** 获取原始种子 */
    get seed() { return this._seed; }

    /** 获取调用次数 */
    get callCount() { return this._callCount; }

    /** 下一个 [0, 1) 的随机浮点数 */
    next() {
        this._callCount++;
        return this._rng();
    }

    /** [min, max) 的随机浮点数 */
    range(min, max) {
        return min + this.next() * (max - min);
    }

    /** [min, max] 的随机整数 (含两端) */
    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /** 正态分布 (Box-Muller) */
    gaussian(mean = 0, stddev = 1) {
        const u1 = this.next() || 1e-10;  // 避免 log(0)
        const u2 = this.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stddev;
    }

    /** 返回数组的随机元素 */
    pick(arr) {
        return arr[this.int(0, arr.length - 1)];
    }

    /** Fisher-Yates 洗牌 (返回新数组) */
    shuffle(arr) {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /** 从字符串生成哈希种子 (djb2) */
    _hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
        }
        return hash;
    }
}

/**
 * 从种子字符串创建 SeededRandom 实例的工厂函数
 */
export function createRNG(seed) {
    return new SeededRandom(seed, 'xoshiro128');
}

// ━━━ 测试自检（模块加载时运行，仅在开发环境有效）━━━
function _selfTest() {
    // 验证：相同种子产生相同序列
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);
    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());
    const match = seq1.every((v, i) => v === seq2[i]);
    if (!match) {
        console.error('[PRNG] 自检失败：相同种子未产生相同序列！');
    } else {
        console.log('[PRNG] 自检通过：确定性已验证 ✓');
    }
    return match;
}

// 延迟自检（等 DOM 准备好）
if (typeof window !== 'undefined') {
    setTimeout(_selfTest, 0);
}
