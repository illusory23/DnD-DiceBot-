/* ━━━ 战术地图 · 战争迷雾模块 ━━━
 * 从 map.js 拆分（2026-08-16 地图代码治理）
 * 必须在 map.js 之前加载（boot 启动时立即调用迷雾函数）
 * 引用 map.js 顶部的全局状态（fogStrokes/fogErasures/fogCanvas 等）
 */
        // ━━━ 战争迷雾（画笔式涂抹轨迹即迷雾 / 橡皮式擦除）━━━━
        // 迷雾线宽（随画笔粗细联动，至少 16px）
        function fogLineWidth() {
            return Math.max(16, (brushSize || 3) * 3);
        }
        // 每笔雾保存自己绘制时的线宽（stroke.width），旧数据无 width 时退回当前默认
        function fogStrokeWidth(stroke) {
            return (stroke.width > 0) ? stroke.width : fogLineWidth();
        }

        function clearAllFogLayers() {
            fogStrokes = [];
            fogErasures = [];
            currentFogStroke = null;
            fogErasePoints = [];
            updateAllFogCoverage();
            renderLayerList();
        }

        // 点 P 到线段 AB 的最短距离
        function fogPointSegDist(px, py, ax, ay, bx, by) {
            const dx = bx - ax, dy = by - ay;
            const len2 = dx * dx + dy * dy;
            let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx, cy = ay + t * dy;
            return Math.hypot(px - cx, py - cy);
        }

        // ━━ 橡皮擦（像素级挖洞：洞宽 = 橡皮直径，走到哪擦到哪，不按雾的粗细整条消失）━━
        // 擦除半径（橡皮圆盘半径，随画笔粗细联动）
        function eraserRadius() {
            return Math.max(8, (brushSize || 3) * 1.5);
        }
        // 点在任一擦除圆盘内（进行中轨迹也计入）
        function fogPointInEraseDisk(x, y) {
            if (fogErasures.length === 0 && fogErasePoints.length === 0) return false;
            const all = fogErasures;
            const live = fogErasePoints;
            for (let k = 0; k < all.length + (live.length >= 1 ? 1 : 0); k++) {
                const er = k < all.length ? all[k] : null;
                const pts = er ? er.points : live;
                // 每条擦除轨迹保存自己擦除时的半径；进行中的轨迹用当前画笔粗细
                const r = er ? (er.radius > 0 ? er.radius : eraserRadius()) : eraserRadius();
                for (let i = 0; i < pts.length - 1; i++) {
                    if (fogPointSegDist(x, y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y) <= r) return true;
                }
                if (pts.length === 1 && Math.hypot(x - pts[0].x, y - pts[0].y) <= r) return true;
            }
            return false;
        }
        // 擦除完成：记录擦除轨迹（版本化缓存自动增量判定），仅经过路径的部分消失
        function removeFogByErasePath() {
            if (fogErasePoints.length === 0) return;
            // 记录擦除时的半径：之后切换画笔粗细不影响已擦除洞的大小，远程端也按各自半径渲染
            const erasure = {id: genStrokeId(), points: fogErasePoints.slice(), radius: eraserRadius()};
            fogErasures.push(erasure);
            // WS 在线时增量推送这条擦除轨迹（远程立即看到，无需全量重传）
            if (window._pushFogIncremental) window._pushFogIncremental([], [erasure], [], []);
            debouncedSave();
        }

        // 在指定 ctx 上绘制雾形状几何（颜色由调用方设置，mask 用黑色、正常绘制用雾色）
        function drawFogShapeTo(ctx, stroke, lineWidth) {
            const pts = stroke.points;
            if (pts.length < 1) return;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (stroke.closed === true && pts.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (pts.length === 1) {
                // 单点涂抹：画圆点
                ctx.beginPath();
                ctx.arc(pts[0].x, pts[0].y, lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
            }
        }

        // 绘制一条迷雾轨迹（闭合面用实心填充，涂抹轨迹用粗线）
        function traceFogStroke(stroke, lineWidth, fillColor, strokeColor, isHover) {
            fogCtx.fillStyle = fillColor;
            fogCtx.strokeStyle = strokeColor;
            drawFogShapeTo(fogCtx, stroke, lineWidth);
        }

        // 点是否位于橡皮挖出的洞里（洞半径 = 擦除半径，与渲染挖洞一致；涂抹轨迹与旧闭合面共用）
        function isPointInFogHole(x, y) {
            return fogPointInEraseDisk(x, y);
        }

        function redrawFogCanvas() {
            updateAllFogCoverage();
            if (!fogVisible) return;
            var isPL = window._isDM !== true;
            // DM：半透明（能看到迷雾下的地图/token）；PL：不透明（迷雾下的东西不可见）
            var fillColor = isPL ? 'rgba(30,30,30,1)' : 'rgba(40,40,40,0.85)';
            var fw = fogLineWidth();

            // 1. 离屏 mask：先画全部雾（每笔用自己绘制时的线宽），再按橡皮直径像素级挖洞——
            //    橡皮扫过的地方只消失橡皮大小的部分（不按雾的粗细整条消失），轨迹没到的地方保持原样
            fogMaskCtx.clearRect(0, 0, fogMaskCanvas.width, fogMaskCanvas.height);
            fogMaskCtx.globalCompositeOperation = 'source-over';
            fogMaskCtx.fillStyle = '#000';
            fogMaskCtx.strokeStyle = '#000';
            for (const stroke of fogStrokes) {
                drawFogShapeTo(fogMaskCtx, stroke, fogStrokeWidth(stroke));
            }
            // 绘制预览也进 mask（与最终效果一致）
            if (currentFogStroke && currentFogStroke.points.length >= 1) drawFogShapeTo(fogMaskCtx, currentFogStroke, fogLineWidth());
            // 橡皮挖洞（destination-out 像素级）：洞宽 = 橡皮直径，含进行中的擦除轨迹（所见即所得）
            fogMaskCtx.globalCompositeOperation = 'destination-out';
            for (const er of fogErasures) drawFogShapeTo(fogMaskCtx, er, (er.radius > 0 ? er.radius : eraserRadius()) * 2);
            if (fogErasePoints.length >= 1) drawFogShapeTo(fogMaskCtx, {points: fogErasePoints, closed: false}, eraserRadius() * 2);
            fogMaskCtx.globalCompositeOperation = 'source-over';

            // 2. 合成：整层铺雾色 → destination-in 按 mask 裁剪 → 多层重叠透明度不变
            fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            fogCtx.globalCompositeOperation = 'source-over';
            fogCtx.fillStyle = fillColor;
            fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
            fogCtx.globalCompositeOperation = 'destination-in';
            fogCtx.drawImage(fogMaskCanvas, 0, 0);
            fogCtx.globalCompositeOperation = 'source-over';

            // 3. 擦除预览：红色半透明粗线显示橡皮轨迹（参考画笔预览样式）
            if (fogErasePoints.length > 0) {
                traceFogStroke({points: fogErasePoints, closed: false}, eraserRadius() * 2, 'rgba(255,60,60,0.3)', 'rgba(255,60,60,0.75)', false);
                // 擦除轨迹光标圈
                const last = fogErasePoints[fogErasePoints.length - 1];
                fogCtx.strokeStyle = 'rgba(255,60,60,0.7)';
                fogCtx.lineWidth = 1.5;
                fogCtx.beginPath();
                fogCtx.arc(last.x, last.y, eraserRadius(), 0, Math.PI * 2);
                fogCtx.stroke();
            }
        }

        // ━━━ 迷雾遮盖检测（全局作用域，被 redrawFogCanvas 和 token 操作调用）━━
        function isPointInFogPolygon(x, y, polygon) {
            if (!polygon.closed || polygon.points.length < 3) return false;
            const pts = polygon.points;
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x, yi = pts[i].y;
                const xj = pts[j].x, yj = pts[j].y;
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            return inside;
        }

        function isUnderFog(item) {
            const cx = item.x + (item.size || 50) / 2;
            const cy = item.y + (item.size || 24) / 2;
            const probes = [
                [cx, cy],
                [item.x, item.y],
                [item.x + (item.size || 50), item.y],
                [item.x, item.y + (item.size || 24)],
                [item.x + (item.size || 50), item.y + (item.size || 24)],
            ];
            for (const stroke of fogStrokes) {
                const pts = stroke.points;
                if (stroke.closed === true && pts.length >= 3) {
                    // 旧闭合面：点内检测（且不在擦除洞内）
                    for (const [px, py] of probes) {
                        if (!isPointInFogHole(px, py) && isPointInFogPolygon(px, py, stroke)) return true;
                    }
                    continue;
                }
                // 涂抹轨迹：探针点距轨迹 ≤ 该笔雾线宽一半 → 被迷雾遮盖（位于橡皮洞内的不算，与渲染挖洞一致）
                const sw = fogStrokeWidth(stroke) / 2;
                for (const [px, py] of probes) {
                    if (fogPointInEraseDisk(px, py)) continue;
                    for (let i = 0; i < pts.length - 1; i++) {
                        if (fogPointSegDist(px, py, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y) <= sw) return true;
                    }
                    if (pts.length === 1 && Math.hypot(px - pts[0].x, py - pts[0].y) <= sw) return true;
                }
            }
            return false;
        }

        function updateAllFogCoverage() {
            const isPL = window._isDM !== true;
            for (const t of mapTokens) {
                if (t.el) {
                    if (isPL && fogVisible && isUnderFog(t)) {
                        t.el.style.display = 'none';
                    } else {
                        t.el.style.display = '';
                    }
                }
            }
            for (const b of textBoxes) {
                if (b.el) {
                    if (isPL && fogVisible && isUnderFog(b)) {
                        b.el.style.display = 'none';
                    } else {
                        b.el.style.display = '';
                    }
                }
            }
        }

        // ━━━ 填充工具（限定区域洪水填充，可指定目标 canvas 上下文）━━
        function floodFill(sx, sy, fillColor) {
            floodFillOnCanvas(drawCtx, drawCanvas.width, drawCanvas.height, sx, sy, fillColor);
        }
        // 填充透明区域（闭合笔画内部的空白），遇到非透明像素（笔画边界）即停止
        // 若填充触碰到采样框边缘 → 说明未闭合，撤销填充
        function floodFillTransparent(ctx, cw, ch, sx, sy, fillColor) {
            const boxSize = 800;
            const x0 = Math.max(0, sx - boxSize/2);
            const y0 = Math.max(0, sy - boxSize/2);
            const x1 = Math.min(cw, sx + boxSize/2);
            const y1 = Math.min(ch, sy + boxSize/2);
            const bw = x1 - x0, bh = y1 - y0;
            if (bw <= 0 || bh <= 0) return;

            const imageData = ctx.getImageData(x0, y0, bw, bh);
            const data = imageData.data;
            const lx = sx - x0, ly = sy - y0;

            // 获取填充颜色 RGBA
            const tmp = document.createElement('canvas'); tmp.width = 1; tmp.height = 1;
            const tctx = tmp.getContext('2d'); tctx.fillStyle = fillColor; tctx.fillRect(0,0,1,1);
            const fd = tctx.getImageData(0,0,1,1).data;
            const fillR = fd[0], fillG = fd[1], fillB = fd[2], fillA = fd[3];

            // 只填充透明像素（边界为非透明像素）
            const visited = new Uint8Array(bw * bh);
            const stack = [lx, ly];
            const maxOps = 500000;
            let ops = 0;
            let edgeTouched = false;  // 是否触碰到了采样框边缘（未闭合）

            while (stack.length > 0 && ops < maxOps) {
                const y = stack.pop();
                const x = stack.pop();
                ops++;
                if (x < 0 || x >= bw || y < 0 || y >= bh) continue;
                const vi = y * bw + x;
                if (visited[vi]) continue;
                const idx = vi * 4;
                if (data[idx+3] !== 0) continue;  // 遇到非透明像素（笔画边界），停止
                visited[vi] = 1;
                // 检测是否触碰到采样框边缘
                if (x <= 0 || x >= bw-1 || y <= 0 || y >= bh-1) edgeTouched = true;
                data[idx] = fillR; data[idx+1] = fillG; data[idx+2] = fillB; data[idx+3] = fillA;
                stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
            }
            if (!edgeTouched) {
                // 闭合区域内 → 应用填充
                ctx.putImageData(imageData, x0, y0);
                console.log('🪣 填充: 已应用 (闭合区域 ops='+ops+')');
            } else {
                // 触碰边缘 → 未闭合，不填充
                console.log('🪣 填充: 未闭合区域，跳过 (edgeTouched=true ops='+ops+')');
                // 不调用 putImageData，填充被丢弃
            }
        }
        function floodFillOnCanvas(ctx, cw, ch, sx, sy, fillColor) {
            // 限定采样区域：点击位置周围 800×800 像素
            const boxSize = 800;
            const x0 = Math.max(0, sx - boxSize/2);
            const y0 = Math.max(0, sy - boxSize/2);
            const x1 = Math.min(cw, sx + boxSize/2);
            const y1 = Math.min(ch, sy + boxSize/2);
            const bw = x1 - x0, bh = y1 - y0;

            const imageData = ctx.getImageData(x0, y0, bw, bh);
            const data = imageData.data;
            const lx = sx - x0, ly = sy - y0;
            const targetIdx = (ly * bw + lx) * 4;
            const targetR = data[targetIdx], targetG = data[targetIdx+1], targetB = data[targetIdx+2], targetA = data[targetIdx+3];

            const tmp = document.createElement('canvas'); tmp.width = 1; tmp.height = 1;
            const tctx = tmp.getContext('2d'); tctx.fillStyle = fillColor; tctx.fillRect(0,0,1,1);
            const fd = tctx.getImageData(0,0,1,1).data;
            const fillR = fd[0], fillG = fd[1], fillB = fd[2], fillA = fd[3];

            if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

            const visited = new Uint8Array(bw * bh);
            const stack = [lx, ly];
            const maxOps = 500000;
            let ops = 0;

            while (stack.length > 0 && ops < maxOps) {
                const y = stack.pop();
                const x = stack.pop();
                ops++;
                if (x < 0 || x >= bw || y < 0 || y >= bh) continue;
                const vi = y * bw + x;
                if (visited[vi]) continue;
                const idx = vi * 4;
                if (data[idx] !== targetR || data[idx+1] !== targetG || data[idx+2] !== targetB || data[idx+3] !== targetA) continue;
                visited[vi] = 1;
                data[idx] = fillR; data[idx+1] = fillG; data[idx+2] = fillB; data[idx+3] = fillA;
                stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
            }
            ctx.putImageData(imageData, x0, y0);

            // 如果填充满整个采样框，可能是大空白区域，用 fillRect 补充
            if (ops >= maxOps) {
                ctx.fillStyle = fillColor;
                ctx.fillRect(x0, y0, bw, bh);
            }
        }

        // ━━━ 键盘 ━━━
