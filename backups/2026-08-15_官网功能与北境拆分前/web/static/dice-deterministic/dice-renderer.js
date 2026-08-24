/**
 * 骰子 3D 渲染器 v3 — 支持多玩家颜色 + 面数字贴图
 */

import { getDiceModel } from './dice-models.js';

// 玩家骰子配色
const PLAYER_COLORS = [
    '#cc3333', '#3366cc', '#33aa55', '#cc8833', '#9933cc', '#33aacc',
    '#dd6622', '#228866', '#aa4488', '#667799',
];

function createFaceTexture(sides, faceValue, colorIdx, THREE) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');

    // 底色
    const hex = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length] || '#888888';
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, S, S);

    // 边框
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(5, 5, S - 10, S - 10, 14); ctx.stroke();

    // 中央圆盘
    const cx = S / 2, cy = S / 2, r = S * 0.30;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();

    // 数字
    const display = sides === 100 ? (faceValue === 0 ? '00' : String(faceValue)) : String(faceValue);
    const fs = display.length > 2 ? S * 0.33 : S * 0.48;
    ctx.font = `900 ${fs}px "Segoe UI","Microsoft YaHei",Arial,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff'; ctx.fillText(display, cx, cy + 1);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

function computeFaceNormal(verts, face) {
    const a = verts[face[0]], b = verts[face[1]], c = verts[face[2]];
    const nx = (b[1]-a[1])*(c[2]-a[2]) - (b[2]-a[2])*(c[1]-a[1]);
    const ny = (b[2]-a[2])*(c[0]-a[0]) - (b[0]-a[0])*(c[2]-a[2]);
    const nz = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const l = Math.sqrt(nx*nx+ny*ny+nz*nz);
    return l>1e-12 ? [nx/l,ny/l,nz/l] : [0,1,0];
}

function buildDiceGeometry(sides, THREE) {
    const model = getDiceModel(sides);
    const verts = model.vertices;
    const positions = [], normalArr = [], uvArr = [], groups = [];
    let vi = 0;

    for (let fi = 0; fi < model.faces.length; fi++) {
        let face = model.faces[fi];
        const center = model.centers[fi];
        let normal = model.normals[fi];
        // 法线朝外修正
        if (center[0]*normal[0] + center[1]*normal[1] + center[2]*normal[2] < 0) {
            face = [...face].reverse();
            normal = [-normal[0], -normal[1], -normal[2]];
        }

        const n = face.length, startIdx = vi;
        for (let t = 1; t < n - 1; t++) {
            for (const idx of [0, t, t + 1]) {
                const v = verts[face[idx]];
                positions.push(v[0], v[1], v[2]);
                normalArr.push(normal[0], normal[1], normal[2]);
                uvArr.push(0.5+v[0]*0.28, 0.5+v[2]*0.28);
            }
            vi += 3;
        }
        groups.push({ start: startIdx, count: (n-2)*3, materialIndex: fi });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalArr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.clearGroups();
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
    geo.computeBoundingSphere();
    return geo;
}

export class DiceRenderer {
    constructor(container, THREE) {
        this.THREE = THREE;
        this.container = container;
        this.diceEntries = []; // [{mesh, wireframe, materials, geo, colorIdx}]
        this._disposed = false;
        this._setupScene();
    }

    _setupScene() {
        const T = this.THREE;
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;

        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        const cvs = this.renderer.domElement;
        cvs.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
        this.container.appendChild(cvs);

        this.scene = new T.Scene();
        this.scene.background = new T.Color(0x0f0f20);
        this.scene.fog = new T.Fog(0x0f0f20, 12, 35);

        const aspect = w / Math.max(h, 1);
        this.camera = new T.PerspectiveCamera(50, aspect, 0.5, 60);
        this.camera.position.set(0, 3, 12);
        this.camera.lookAt(0, -1.5, 0);

        this.scene.add(new T.AmbientLight(0x556677, 1.8));
        const key = new T.DirectionalLight(0xffeedd, 5);
        key.position.set(6, 12, 4); key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 50;
        key.shadow.camera.left = -12; key.shadow.camera.right = 12;
        key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
        key.shadow.bias = -0.0003;
        this.scene.add(key);
        this.scene.add(new T.DirectionalLight(0x8899cc, 2).position.set(-4, 3, -3));
        this.scene.add(new T.DirectionalLight(0xffffff, 1.5).position.set(0, 0.5, 8));

        const gGeo = new T.PlaneGeometry(25, 25);
        const gMat = new T.MeshStandardMaterial({ color: 0x1a1a30, roughness: 0.85, metalness: 0.05 });
        const grd = new T.Mesh(gGeo, gMat);
        grd.rotation.x = -Math.PI / 2; grd.position.y = -3.0; grd.receiveShadow = true;
        this.scene.add(grd);

        const grid = new T.PolarGridHelper(10, 32, 24, 64, 0x333355, 0x222244);
        grid.position.y = -2.99; this.scene.add(grid);
    }

    addDiceMesh(sides, colorIdx = 0) {
        const T = this.THREE;
        const geo = buildDiceGeometry(sides, T);
        const model = getDiceModel(sides);
        const materials = model.faceValues.map(val =>
            new T.MeshStandardMaterial({
                map: createFaceTexture(sides, val, colorIdx, T),
                roughness: 0.35, metalness: 0.05,
                side: T.DoubleSide,
                emissive: new T.Color(PLAYER_COLORS[colorIdx % PLAYER_COLORS.length]),
                emissiveIntensity: 0.2,
            })
        );
        const mesh = new T.Mesh(geo, materials);
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.scene.add(mesh);

        // 线框
        const edgeGeo = new T.EdgesGeometry(geo, 15);
        const edgeMat = new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthTest: true });
        mesh.add(new T.LineSegments(edgeGeo, edgeMat));

        const e = { mesh, geo, materials, colorIdx };
        this.diceEntries.push(e);
        return e;
    }

    syncWithPhysics(bodies) {
        // 建立ownerId→entry的映射（简单策略：按添加顺序匹配）
        // 实际上应该用更精确的匹配。这里简化：按bodies顺序映射到entries
        for (let i = 0; i < Math.min(bodies.length, this.diceEntries.length); i++) {
            const b = bodies[i];
            const e = this.diceEntries[i];
            if (b && e && !b.settled) {
                e.mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
                e.mesh.quaternion.set(b.ori[0], b.ori[1], b.ori[2], b.ori[3]);
                e.mesh.visible = true;
            } else if (b && b.settled && e) {
                // 已停稳但仍显示（等removeDiceByColor清理）
                e.mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
                e.mesh.quaternion.set(b.ori[0], b.ori[1], b.ori[2], b.ori[3]);
            }
        }
    }

    removeDiceByColor(colorIdx) {
        const T = this.THREE;
        const toRemove = [];
        for (let i = this.diceEntries.length - 1; i >= 0; i--) {
            const e = this.diceEntries[i];
            if (e.colorIdx === colorIdx) {
                this.scene.remove(e.mesh);
                e.geo.dispose();
                for (const m of e.materials) { m.map?.dispose(); m.dispose(); }
                toRemove.push(i);
            }
        }
        for (const i of toRemove) this.diceEntries.splice(i, 1);
    }

    clearAll() {
        const T = this.THREE;
        for (const e of this.diceEntries) {
            this.scene.remove(e.mesh);
            e.geo.dispose();
            for (const m of e.materials) { m.map?.dispose(); m.dispose(); }
        }
        this.diceEntries = [];
    }

    render() {
        if (this._disposed) return;
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (this._disposed) return;
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / Math.max(h, 1);
        this.camera.updateProjectionMatrix();
    }

    dispose() {
        this._disposed = true;
        this.clearAll();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
