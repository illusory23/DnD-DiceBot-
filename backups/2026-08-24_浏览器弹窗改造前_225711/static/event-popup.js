/* ━━━ 事件弹窗 · 全平台脚本 ━━━
 *
 * DM 发布事件后，本脚本轮询 /api/events/notifications，
 * 在页面正中间弹出独立小界面显示事件（标题 + 内容）。
 *  - 仅已加入房间（sessionStorage 存在 dnd_joined_room）的用户弹窗
 *  - 弹窗只能手动关闭（✕ 按钮），不会自动关闭
 *  - 多个事件排队显示：关闭当前弹窗后自动显示下一个
 */
(function () {
    var POLL_MS = 2000;
    var lastEventTs = Date.now() / 1000;
    var queue = [];
    var showing = false;
    var overlay = null;

    function getSession() {
        try {
            var s = JSON.parse(sessionStorage.getItem('dnd_joined_room'));
            return s && s.name ? s : null;
        } catch (e) { return null; }
    }

    // 玩家已手动关闭过的置顶事件 id（本次会话内不再重复弹窗）
    var dismissedPins = {};
    try {
        dismissedPins = JSON.parse(sessionStorage.getItem('dnd_dismissed_pins') || '{}');
    } catch (e) {}

    function poll() {
        var s = getSession();
        if (!s) { setTimeout(poll, POLL_MS); return; }
        fetch('/api/events/notifications?name=' + encodeURIComponent(s.name) + '&since=' + lastEventTs)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.ok && d.events && d.events.length > 0) {
                    d.events.forEach(function (ev) {
                        if (ev._ts > lastEventTs) lastEventTs = ev._ts;
                        // 置顶事件：已被玩家关闭过的不再弹
                        if (ev._is_pinned && dismissedPins[ev.event_id]) return;
                        queue.push(ev);
                    });
                    if (!showing) showNext();
                }
            })
            .catch(function () {});
        setTimeout(poll, POLL_MS);
    }

    function showNext() {
        if (queue.length === 0) { showing = false; return; }
        showing = true;
        var ev = queue.shift();
        var ov = document.createElement('div');
        ov.className = 'event-popup-overlay';
        ov.style.cssText = [
            'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;',
            'display:flex;align-items:center;justify-content:center;',
            'background:rgba(5,5,15,0.55);backdrop-filter:blur(3px);',
        ].join('');
        // 置顶事件：公告样式（📌 标记 + 蓝金色边框）
        var isPin = !!ev._is_pinned;
        var card = document.createElement('div');
        card.className = 'event-popup-card';
        card.style.cssText = [
            'position:relative;max-width:480px;width:90%;max-height:70vh;overflow-y:auto;',
            'background:var(--surface,#1c1c2e);border:2px solid ' + (isPin ? '#4dc9f6' : 'var(--gold,#ffd700)') + ';border-radius:10px;',
            'padding:24px 26px;box-shadow:0 0 40px ' + (isPin ? 'rgba(77,201,246,0.25)' : 'rgba(255,215,0,0.25)') + ';',
            'color:var(--text,#ddd);animation:eventPopupIn 0.25s ease;',
        ].join('');
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.title = '关闭';
        closeBtn.style.cssText = [
            'position:absolute;top:8px;right:10px;background:none;border:none;',
            'color:var(--text-dim,#888);cursor:pointer;font-size:1.3rem;line-height:1;padding:4px;',
        ].join('');
        closeBtn.onmouseover = function () { closeBtn.style.color = '#ff6b6b'; };
        closeBtn.onmouseout = function () { closeBtn.style.color = 'var(--text-dim,#888)'; };
        var publisher = document.createElement('div');
        publisher.textContent = '📢 由 ' + (ev.publisher || 'DM') + ' 发布';
        publisher.style.cssText = 'color:var(--text-dim,#888);font-size:0.72rem;text-align:right;margin-bottom:4px;';
        card.appendChild(publisher);
        var title = document.createElement('div');
        title.className = 'event-popup-title';
        title.textContent = (isPin ? '📌 置顶事件：' : '📜 ') + (ev.title || '') + (isPin ? '' : '：');
        title.style.cssText = [
            isPin ? 'color:#4dc9f6;' : 'color:var(--gold,#ffd700);',
            'font-weight:bold;font-size:1.05rem;',
            'padding-right:28px;margin-bottom:12px;white-space:pre-line;',
        ].join('');
        var content = document.createElement('div');
        content.className = 'event-popup-content';
        content.textContent = ev.content || '';
        content.style.cssText = [
            'color:var(--text,#ddd);font-size:0.9rem;line-height:1.7;',
            'white-space:pre-line;word-break:break-word;',
        ].join('');
        var footer = document.createElement('div');
        footer.style.cssText = 'text-align:center;margin-top:18px;';
        var okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = '知道了';
        okBtn.style.cssText = [
            'padding:8px 28px;background:var(--gold,#ffd700);color:#000;border:none;',
            'border-radius:4px;cursor:pointer;font-size:0.9rem;font-weight:600;',
        ].join('');
        okBtn.onclick = function () {
            // 置顶事件关闭后记录已读，避免每次轮询重复弹出
            if (ev._is_pinned && ev.event_id) {
                dismissedPins[ev.event_id] = 1;
                try { sessionStorage.setItem('dnd_dismissed_pins', JSON.stringify(dismissedPins)); } catch (e) {}
            }
            closePopup(ov);
        };
        okBtn.onmouseover = function () { okBtn.style.opacity = '0.85'; };
        okBtn.onmouseout = function () { okBtn.style.opacity = '1'; };

        card.appendChild(closeBtn);
        card.appendChild(title);
        card.appendChild(content);
        footer.appendChild(okBtn);
        card.appendChild(footer);
        ov.appendChild(card);
        closeBtn.onclick = function () { closePopup(ov); };
        // 点击遮罩不关闭，仅手动点击按钮关闭
        document.body.appendChild(ov);
        // 播放提示音
        try {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 660; osc.type = 'sine';
            gain.gain.value = 0.25;
            osc.start(); osc.stop(audioCtx.currentTime + 0.18);
        } catch (e) {}
    }

    function closePopup(ov) {
        ov.parentNode && ov.parentNode.removeChild(ov);
        setTimeout(showNext, 300);
    }

    // 动画 keyframes（仅注入一次）
    if (!document.getElementById('event-popup-keyframes')) {
        var st = document.createElement('style');
        st.id = 'event-popup-keyframes';
        st.textContent = '@keyframes eventPopupIn{from{opacity:0;transform:scale(0.85);}to{opacity:1;transform:scale(1);}}';
        document.head.appendChild(st);
    }

    setTimeout(poll, POLL_MS);
})();
