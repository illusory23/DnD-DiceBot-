/* ━━━ 北境雪原 · 视觉特效模块 ━━━
 * 从 north-main.js 拆分（2026-08-15 第二轮拆分）
 * 完全自包含: 雪花飘落 + 极光动画, 仅依赖 canvas DOM
 */
(function () {
    'use strict';
    function initSnow() {
        const canvas = document.getElementById('snowCanvas');
        const ctx = canvas.getContext('2d');
        let w, h;

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);
        const flakes = [];
        for (let i = 0; i < 120; i++) {
            flakes.push({
                x: Math.random() * w,
                y: Math.random() * h,
                r: Math.random() * 2.5 + 0.5,
                speed: Math.random() * 0.6 + 0.2,
                wind: Math.random() * 0.3 - 0.15,
            });
        }

        function drawSnow() {
            ctx.clearRect(0, 0, w, h);
            for (const f of flakes) {
                f.y += f.speed;
                f.x += f.wind;
                if (f.y > h) { f.y = -5;
                    f.x = Math.random() * w; }
                if (f.x > w) f.x = 0;
                if (f.x < 0) f.x = w;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3 + 0.2})`;
                ctx.fill();
            }
            requestAnimationFrame(drawSnow);
        }
        drawSnow();
    }

    function initAurora() {
        const canvas = document.getElementById('auroraCanvas');
        const ctx = canvas.getContext('2d');
        let w, h;

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);
        let phase = 0;

        function drawAurora() {
            ctx.clearRect(0, 0, w, h);
            phase += 0.005;
            const layers = 4;
            for (let l = 0; l < layers; l++) {
                const baseY = h * 0.2 + l * 50 + Math.sin(phase + l) * 30;
                ctx.beginPath();
                ctx.moveTo(0, baseY + Math.sin(phase + l) * 20);
                for (let x = 0; x <= w; x += 6) {
                    const y = baseY + Math.sin(x * 0.008 + phase * 1.2 + l * 1.5) * 40 +
                        Math.sin(x * 0.02 + phase * 0.7 + l) * 15;
                    ctx.lineTo(x, y);
                }
                const grad = ctx.createLinearGradient(0, baseY - 50, 0, baseY + 50);
                const alpha = 0.06 + l * 0.02;
                grad.addColorStop(0, `rgba(30, 180, 255, ${alpha})`);
                grad.addColorStop(0.5, `rgba(80, 80, 255, ${alpha * 0.7})`);
                grad.addColorStop(1, `rgba(180, 60, 255, ${alpha * 0.3})`);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 60 + l * 20;
                ctx.stroke();
            }
            requestAnimationFrame(drawAurora);
        }
        drawAurora();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initSnow();
            initAurora();
        });
    } else {
        initSnow();
        initAurora();
    }
})();
