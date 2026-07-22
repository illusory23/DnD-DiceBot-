/**
 * 骰子几何模型定义
 * ━━━━━━━━━━━━━━━━━
 * 定义 D&D 标准多面体骰子的顶点、面和面值。
 * 同时用于物理碰撞检测（凸包）和 Three.js 渲染。
 *
 * 所有骰子以原点为中心，边长标准化。
 */

// ━━━ 数学工具 ━━━
const PHI = (1 + Math.sqrt(5)) / 2;  // 黄金比例 ≈ 1.618
const INV_PHI = 1 / PHI;              // ≈ 0.618

/**
 * 计算面法线（右手定则）
 */
function faceNormal(vertices, face) {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
}

/**
 * 面中心点
 */
function faceCenter(vertices, face) {
    const n = face.length;
    const c = [0, 0, 0];
    for (const vi of face) {
        c[0] += vertices[vi][0];
        c[1] += vertices[vi][1];
        c[2] += vertices[vi][2];
    }
    return [c[0] / n, c[1] / n, c[2] / n];
}

/**
 * 构建骰子模型
 * @param {number[][]} vertices - 顶点坐标数组
 * @param {number[][]} faces - 面索引数组（每个面是顶点索引列表）
 * @param {number[]} faceValues - 每面对应的数值
 */
function buildDiceModel(vertices, faces, faceValues) {
    const normals = faces.map(f => faceNormal(vertices, f));
    const centers = faces.map(f => faceCenter(vertices, f));
    return {
        vertices,
        faces,
        faceValues,
        normals,
        centers,
        faceCount: faces.length,
        vertexCount: vertices.length,
    };
}

// ═══════════════════════════════════════════════════════════════
//  D4 — 正四面体
// ═══════════════════════════════════════════════════════════════
const D4_SIZE = 1.2;
const d4Vertices = [
    [ 1,  1,  1],
    [ 1, -1, -1],
    [-1,  1, -1],
    [-1, -1,  1],
].map(v => v.map(c => c * D4_SIZE / Math.sqrt(3)));

const d4Faces = [
    [0, 2, 1],  // 底面
    [0, 1, 3],  // 前面
    [0, 3, 2],  // 右面
    [1, 2, 3],  // 后面
];

// d4 读顶点值（顶点朝上时，读该顶点对面的面的值）
// 标准布局：每面对应一个顶点编号
const d4FaceValues = [4, 1, 2, 3];

export const D4_MODEL = buildDiceModel(d4Vertices, d4Faces, d4FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D6 — 正六面体（立方体）
// ═══════════════════════════════════════════════════════════════
const D6_SIZE = 0.9;  // 半边长
const d6Vertices = [
    [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],  // 前面
    [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1],  // 后面
].map(v => v.map(c => c * D6_SIZE));

const d6Faces = [
    [0, 1, 2, 3],  // -Z (前) → 1
    [5, 4, 7, 6],  // +Z (后) → 6
    [1, 5, 6, 2],  // +X (右) → 3
    [4, 0, 3, 7],  // -X (左) → 4
    [3, 2, 6, 7],  // +Y (上) → 5
    [4, 5, 1, 0],  // -Y (下) → 2
];

// 标准骰子面值（对边和为7）
const d6FaceValues = [1, 6, 3, 4, 5, 2];

export const D6_MODEL = buildDiceModel(d6Vertices, d6Faces, d6FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D8 — 正八面体
// ═══════════════════════════════════════════════════════════════
const D8_SIZE = 1.1;
const d8Vertices = [
    [ 1,  0,  0], [-1,  0,  0],  // ±X
    [ 0,  1,  0], [ 0, -1,  0],  // ±Y
    [ 0,  0,  1], [ 0,  0, -1],  // ±Z
].map(v => v.map(c => c * D8_SIZE));

const d8Faces = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],  // 上半
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],  // 下半
];

// 对边和为9
const d8FaceValues = [8, 7, 6, 5, 1, 2, 3, 4];

export const D8_MODEL = buildDiceModel(d8Vertices, d8Faces, d8FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D10 — 五角反棱柱（Pentagonal Trapezohedron）
// ═══════════════════════════════════════════════════════════════
const D10_SIZE = 1.05;
function buildD10Vertices() {
    const hTop = 1.5 * D10_SIZE;
    const hBot = -1.5 * D10_SIZE;
    const hMidTop = 0.4 * D10_SIZE;
    const hMidBot = -0.4 * D10_SIZE;
    const rMid = 1.0 * D10_SIZE;

    const verts = [];
    // 上顶点
    verts.push([0, hTop, 0]);
    // 下顶点
    verts.push([0, hBot, 0]);
    // 上部环 (5个顶点)
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        verts.push([Math.cos(angle) * rMid, hMidTop, Math.sin(angle) * rMid]);
    }
    // 下部环 (5个顶点, 偏移36°)
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + Math.PI / 5;
        verts.push([Math.cos(angle) * rMid, hMidBot, Math.sin(angle) * rMid]);
    }
    return verts;
}

const d10Vertices = buildD10Vertices();

// D10面定义（每个面是四边形/风筝形，由上顶点+下顶点+两个相邻环顶点组成）
// 上部环顶点索引 2-6，下部环顶点索引 7-11
const d10Faces = [];
// 顶部5面
for (let i = 0; i < 5; i++) {
    const next = (i + 1) % 5;
    d10Faces.push([0, 2 + i, 7 + i, 7 + ((i + 4) % 5)]);
}
// 底部5面
for (let i = 0; i < 5; i++) {
    const next = (i + 1) % 5;
    d10Faces.push([1, 7 + i, 2 + i, 2 + next]);
}

const d10FaceValues = [7, 5, 3, 1, 9, 0, 8, 6, 4, 2];

export const D10_MODEL = buildDiceModel(d10Vertices, d10Faces, d10FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D12 — 正十二面体（5环检测算法，稳定可靠）
// ═══════════════════════════════════════════════════════════════
const D12_SIZE = 1.0;
function buildD12Vertices() {
    const verts = [];
    const c = D12_SIZE;
    const patterns = [
        [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
        [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
        [0, PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, INV_PHI], [0, -PHI, -INV_PHI],
        [INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, PHI], [-INV_PHI, 0, -PHI],
        [PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, INV_PHI, 0], [-PHI, -INV_PHI, 0],
    ];
    for (const p of patterns) {
        const len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
        verts.push([p[0] * c / len, p[1] * c / len, p[2] * c / len]);
    }
    return verts;
}

const d12Vertices = buildD12Vertices();

// 通过邻接图 + 5环检测自动计算正十二面体的12个五边形面
// 每条边最多属于2个面，通过边使用计数确保正确性
function buildD12Faces(verts) {
    const n = verts.length;
    const allEdges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = verts[i][0] - verts[j][0];
            const dy = verts[i][1] - verts[j][1];
            const dz = verts[i][2] - verts[j][2];
            allEdges.push({ i, j, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) });
        }
    }
    allEdges.sort((a, b) => a.dist - b.dist);
    const edgeLen = allEdges[0].dist;
    // 取30条等长边（正十二面体的边）
    const dodecEdges = allEdges.filter(e => Math.abs(e.dist - edgeLen) < 0.001).slice(0, 30);
    if (dodecEdges.length !== 30) console.warn('[d12] 边数异常:', dodecEdges.length);

    // 邻接表
    const adj = Array.from({ length: n }, () => []);
    for (const { i, j } of dodecEdges) { adj[i].push(j); adj[j].push(i); }

    // 5环检测，每条边最多用2次
    const ek = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
    const use = {};
    const ok = (a, b) => (use[ek(a, b)] || 0) < 2;
    const mark = (a, b) => { const k = ek(a, b); use[k] = (use[k] || 0) + 1; };

    const faces = [];
    for (let v0 = 0; v0 < n && faces.length < 12; v0++) {
        for (const v1 of adj[v0]) {
            if (!ok(v0, v1)) continue;
            for (const v2 of adj[v1]) {
                if (v2 === v0 || !ok(v1, v2)) continue;
                for (const v3 of adj[v2]) {
                    if (v3 === v1 || v3 === v0 || !ok(v2, v3)) continue;
                    for (const v4 of adj[v3]) {
                        if (v4 === v2 || v4 === v1 || v4 === v0 || !ok(v3, v4)) continue;
                        if (!adj[v4].includes(v0) || !ok(v4, v0)) continue;
                        // 找到5环
                        [[v0, v1], [v1, v2], [v2, v3], [v3, v4], [v4, v0]].forEach(([a, b]) => mark(a, b));
                        faces.push([v0, v1, v2, v3, v4]);
                        break;
                    }
                }
            }
        }
    }

    if (faces.length !== 12) console.warn('[d12] 面数异常:', faces.length);
    return faces.slice(0, 12);
}

const d12Faces = buildD12Faces(d12Vertices);

// 对面值和为13
const d12FaceValues = [1, 12, 2, 11, 3, 10, 5, 8, 4, 9, 6, 7];

export const D12_MODEL = buildDiceModel(d12Vertices, d12Faces, d12FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D20 — 正二十面体
// ═══════════════════════════════════════════════════════════════
const D20_SIZE = 1.0;
function buildD20Vertices() {
    // 正二十面体的12个顶点
    const verts = [
        [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
        [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
        [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
    ];
    return verts.map(v => {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return v.map(c => c * D20_SIZE / len);
    });
}

const d20Vertices = buildD20Vertices();

// 正二十面体的20个三角形面
// 使用邻接距离确定面
function buildD20Faces(verts) {
    // 找出正二十面体的面：每个面是等边三角形
    // 找到距离最近的三元组（等边三角形的边）
    const edges = [];
    for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
            const dx = verts[i][0] - verts[j][0];
            const dy = verts[i][1] - verts[j][1];
            const dz = verts[i][2] - verts[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            edges.push({ i, j, dist });
        }
    }
    edges.sort((a, b) => a.dist - b.dist);
    // 取最短的30条边（正二十面体有30条等长边）
    const minDist = edges[0].dist;
    const shortEdges = edges.filter(e => Math.abs(e.dist - minDist) < 0.001);

    // 构建邻接表
    const adj = {};
    for (const e of shortEdges) {
        if (!adj[e.i]) adj[e.i] = new Set();
        if (!adj[e.j]) adj[e.j] = new Set();
        adj[e.i].add(e.j);
        adj[e.j].add(e.i);
    }

    // 找出所有三角形（每个顶点邻接5个顶点）
    const faces = [];
    const seenTriangles = new Set();
    for (let i = 0; i < verts.length; i++) {
        const neighbors = [...adj[i]];
        for (let a = 0; a < neighbors.length; a++) {
            for (let b = a + 1; b < neighbors.length; b++) {
                if (adj[neighbors[a]].has(neighbors[b])) {
                    const tri = [i, neighbors[a], neighbors[b]].sort((x, y) => x - y);
                    const key = tri.join(',');
                    if (!seenTriangles.has(key)) {
                        seenTriangles.add(key);
                        faces.push(tri);
                    }
                }
            }
        }
    }
    return faces;
}

const d20Faces = buildD20Faces(d20Vertices);

// 对边和为21
const d20FaceValues = [
    20, 1, 18, 4, 13, 6, 10, 15, 8, 17,
    3, 19, 7, 16, 2, 14, 12, 5, 9, 11,
];

export const D20_MODEL = buildDiceModel(d20Vertices, d20Faces, d20FaceValues);

// ═══════════════════════════════════════════════════════════════
//  D100 — 百分骰（与D10相同形状，不同标签）
// ═══════════════════════════════════════════════════════════════
const d100FaceValues = [70, 50, 30, 10, 90, 0, 80, 60, 40, 20];

export const D100_MODEL = buildDiceModel(d10Vertices, d10Faces, d100FaceValues);

// ═══════════════════════════════════════════════════════════════
//  模型映射表
// ═══════════════════════════════════════════════════════════════
export const DICE_MODELS = {
    4: D4_MODEL,
    6: D6_MODEL,
    8: D8_MODEL,
    10: D10_MODEL,
    12: D12_MODEL,
    20: D20_MODEL,
    100: D100_MODEL,
};

/**
 * 获取骰子模型
 * @param {number} sides - 骰子面数
 * @returns {object} 骰子模型 {vertices, faces, faceValues, normals, centers, faceCount, vertexCount}
 */
export function getDiceModel(sides) {
    const model = DICE_MODELS[sides];
    if (!model) throw new Error(`Unknown dice type: d${sides}`);
    return model;
}

/**
 * 获取所有支持的骰子类型
 */
export function getSupportedDice() {
    return Object.keys(DICE_MODELS).map(Number);
}
