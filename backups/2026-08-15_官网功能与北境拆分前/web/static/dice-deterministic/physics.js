/**
 * 确定性刚体物理引擎 v3 — 自然碰撞+摩擦
 * 骰子通过多次弹跳和滚动自然消耗能量，非强制停止。
 * 支持多玩家骰子共存于同一物理世界。
 */

import { getDiceModel } from './dice-models.js';

const V3 = {
    c(x, y, z) { return [x || 0, y || 0, z || 0]; },
    add(a, b, o) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub(a, b, o) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale(v, s, o) { o[0] = v[0] * s; o[1] = v[1] * s; o[2] = v[2] * s; return o; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross(a, b, o) { o[0] = a[1] * b[2] - a[2] * b[1]; o[1] = a[2] * b[0] - a[0] * b[2]; o[2] = a[0] * b[1] - a[1] * b[0]; return o; },
    len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); },
    nrm(v, o) { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); if (l < 1e-12) { o[0] = 0; o[1] = 1; o[2] = 0; return o; } o[0] = v[0] / l; o[1] = v[1] / l; o[2] = v[2] / l; return o; },
};

const Q = {
    c(x, y, z, w) { return [x || 0, y || 0, z || 0, w === undefined ? 1 : w]; },
    fromAxisAngle(ax, a) { const ha = a * 0.5, s = Math.sin(ha); const l = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2]); if (l < 1e-12) return [0, 0, 0, 1]; return [ax[0] * s / l, ax[1] * s / l, ax[2] * s / l, Math.cos(ha)]; },
    mul(a, b, o) { o[0] = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1]; o[1] = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0]; o[2] = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3]; o[3] = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]; return o; },
    rotate(q, v, o) { const qx = q[0], qy = q[1], qz = q[2], qw = q[3]; const tx = 2 * (qy * v[2] - qz * v[1]); const ty = 2 * (qz * v[0] - qx * v[2]); const tz = 2 * (qx * v[1] - qy * v[0]); o[0] = v[0] + qw * tx + (qy * tz - qz * ty); o[1] = v[1] + qw * ty + (qz * tx - qx * tz); o[2] = v[2] + qw * tz + (qx * ty - qy * tx); return o; },
    nrm(q, o) { const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); if (l < 1e-12) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; } o[0] = q[0] / l; o[1] = q[1] / l; o[2] = q[2] / l; o[3] = q[3] / l; return o; },
};

export class RigidBody {
    constructor(model, ownerId) {
        this.model = model;
        this.ownerId = ownerId || 0;
        this.pos = V3.c(); this.ori = Q.c();
        this.lv = V3.c(); this.av = V3.c();
        this.mass = 1.0;
        this.inertiaInv = 3.0;
        this.settled = false;
        this.settleTimer = 0;
    }
    getWorldVertices() { const t = V3.c(); return this.model.vertices.map(v => { Q.rotate(this.ori, v, t); return [t[0] + this.pos[0], t[1] + this.pos[1], t[2] + this.pos[2]]; }); }
    getWorldNormal(fi) { return Q.rotate(this.ori, this.model.normals[fi], V3.c()); }
    getUpFace() { const up = [0, 1, 0]; let b = 0, bd = -Infinity; for (let i = 0; i < this.model.faceCount; i++) { const d = V3.dot(this.getWorldNormal(i), up); if (d > bd) { bd = d; b = i; } } return { faceIndex: b, value: this.model.faceValues[b], confidence: bd }; }
}

export class DeterministicPhysics {
    constructor(opts = {}) {
        this.gravity = opts.gravity ?? 9.8;
        this.groundY = opts.groundY ?? -3.0;
        this.restitution = opts.restitution ?? 0.4;    // 弹性系数
        this.friction = opts.friction ?? 0.55;          // 库仑摩擦
        this.rollingResist = opts.rollingResist ?? 0.92;// 滚动阻力(每帧乘系数)
        this.airDrag = opts.airDrag ?? 0.997;           // 空气阻力
        this.settleThresh = opts.settleThresh ?? 0.06;  // 停稳速度阈值
        this.settleFrames = opts.settleFrames ?? 80;    // 停稳确认帧数
        this.maxFrames = opts.maxFrames ?? 1200;        // 20秒超时
        this.bodies = [];
        this.dt = 1 / 60;
        this.frameCount = 0;
    }

    addDice(sides, rng, opts = {}) {
        const model = getDiceModel(sides);
        const body = new RigidBody(model, opts.ownerId || 0);
        const h = (opts.startHeight ?? 5) + rng.range(0, 1);
        body.pos[0] = rng.range(-1.0, 1.0);
        body.pos[1] = h;
        body.pos[2] = rng.range(-1.0, 1.0);
        const ax = V3.nrm(V3.c(rng.range(-1,1), rng.range(-1,1), rng.range(-1,1)), V3.c());
        body.ori = Q.nrm(Q.fromAxisAngle(ax, rng.range(0, Math.PI*2)), Q.c());
        body.lv[0] = rng.range(-1.2, 1.2);
        body.lv[1] = -(2.5 + rng.range(0, 1.5));
        body.lv[2] = rng.range(-1.2, 1.2);
        const spin = 3 + rng.range(0, 3);
        body.av[0] = rng.range(-spin, spin);
        body.av[1] = rng.range(-spin, spin);
        body.av[2] = rng.range(-spin, spin);
        const avgR = model.vertices.reduce((s,v) => s + Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]), 0) / model.vertexCount;
        body.inertiaInv = 1.0 / (0.4 * body.mass * avgR * avgR);
        this.bodies.push(body);
        return body;
    }

    step() {
        const dt = this.dt;
        this.frameCount++;
        for (const body of this.bodies) {
            if (body.settled) continue;

            // 重力
            body.lv[1] -= this.gravity * dt;
            // 空气阻力
            body.lv[0] *= this.airDrag; body.lv[1] *= this.airDrag; body.lv[2] *= this.airDrag;
            body.av[0] *= this.airDrag; body.av[1] *= this.airDrag; body.av[2] *= this.airDrag;
            // 位置积分
            body.pos[0] += body.lv[0] * dt;
            body.pos[1] += body.lv[1] * dt;
            body.pos[2] += body.lv[2] * dt;
            // 旋转积分
            const q=body.ori, w=body.av, hdt=dt*0.5;
            q[0]+=hdt*( w[0]*q[3]+w[1]*q[2]-w[2]*q[1]);
            q[1]+=hdt*(-w[0]*q[2]+w[1]*q[3]+w[2]*q[0]);
            q[2]+=hdt*( w[0]*q[1]-w[1]*q[0]+w[2]*q[3]);
            q[3]+=hdt*(-w[0]*q[0]-w[1]*q[1]-w[2]*q[2]);
            Q.nrm(q,q);

            // ━━ 地面碰撞（简化稳定版）━━
            const wv = body.getWorldVertices();
            let penCount = 0, totalPen = 0;
            for (const v of wv) {
                if (v[1] < this.groundY) { totalPen += this.groundY - v[1]; penCount++; }
            }
            if (penCount > 0) {
                const avgPen = totalPen / penCount;
                // 推出地面
                body.pos[1] += avgPen;
                // 反弹（仅限首次显著冲击）
                if (body.lv[1] < -0.3) {
                    body.lv[1] = Math.abs(body.lv[1]) * this.restitution;
                } else {
                    body.lv[1] = Math.max(body.lv[1], 0); // 微小穿透时不解冲
                }
                // 地面摩擦
                body.lv[0] *= (1 - this.friction * 0.08);
                body.lv[2] *= (1 - this.friction * 0.08);
                // 滚动阻力
                body.av[0] *= this.rollingResist;
                body.av[1] *= this.rollingResist;
                body.av[2] *= this.rollingResist;
            }

            // ━━ 停稳检测 ━━
            const spd = V3.len(body.lv), aspd = V3.len(body.av);
            if (spd < this.settleThresh && aspd < this.settleThresh*1.5) {
                body.settleTimer++;
                if (body.settleTimer >= this.settleFrames) {
                    body.settled = true;
                    body.lv[0]=0; body.lv[1]=0; body.lv[2]=0;
                    body.av[0]=0; body.av[1]=0; body.av[2]=0;
                }
            } else { body.settleTimer = 0; }
            if (this.frameCount >= this.maxFrames && !body.settled) {
                body.settled = true;
                body.lv[0]=0; body.lv[1]=0; body.lv[2]=0;
                body.av[0]=0; body.av[1]=0; body.av[2]=0;
            }
        }
    }

    /** 检查指定ownerId的骰子是否全部停稳 */
    areOwnerDiceSettled(ownerId) {
        const dice = this.bodies.filter(b => b.ownerId === ownerId);
        return dice.length > 0 && dice.every(b => b.settled);
    }

    /** 获取指定ownerId的骰子结果 */
    getOwnerResults(ownerId) {
        return this.bodies.filter(b => b.ownerId === ownerId).map(b => b.getUpFace());
    }

    /** 移除指定ownerId的骰子 */
    removeOwnerDice(ownerId) {
        this.bodies = this.bodies.filter(b => b.ownerId !== ownerId);
    }
}
