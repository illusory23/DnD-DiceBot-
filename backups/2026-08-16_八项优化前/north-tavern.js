/* ━━━ 北境雪原 · 酒馆聊天模块 ━━━
 * 从 north-main.js 拆分（2026-08-15 第二轮拆分）
 * 独立轮询 /api/tavern/chat/messages，依赖 window.NORTH_CTX.username（由 north-main.js 注入）
 */
(function () {
    'use strict';
    // ━━ 酒馆聊天 ━━
    var _tavernMessages = [];
    var _tavernTimer = null;
    window.northTavernSend = function() {
        var inp = document.getElementById('tavernInput');
        var text = (inp.value||'').trim();
        if (!text || !window.NORTH_CTX.username) return;
        inp.value = '';
        fetch('/api/tavern/chat/send', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({name:window.NORTH_CTX.username, text:text, color:'#d4a050', role:'PL'})
        }).then(function(r){return r.json();}).then(function(d){
            if(d.ok) northTavernRefresh();
        }).catch(function(){});
    };
    // 酒馆左侧菜单展开/收拢
    window.toggleTavernMenu = function() {
        var tm = document.getElementById('tavernMenu');
        if (!tm) return;
        var open = tm.classList.toggle('open');
        // 展开时按钮移到菜单栏右上角，避免遮挡菜单内容
        var btn = document.getElementById('tavernMenuBtn');
        if (btn) btn.classList.toggle('in-menu', open);
    };

    function northTavernRefresh() {
        fetch('/api/tavern/chat/messages').then(function(r){return r.json();}).then(function(d){
            if (!d.ok) return;
            _tavernMessages = (d.messages || []).slice(-50);
            renderTavernMessages();
        }).catch(function(){});
    }
    function renderTavernMessages() {
        var el = document.getElementById('tavernMessages');
        if (!el) return;
        var html = '<div class=\"tavern-msg system\"><span class=\"tm-text\">🕯️ 炉火噼啪作响，酒馆老板娘擦拭着吧台...</span></div>';
        for (var i=0; i<_tavernMessages.length; i++) {
            var m = _tavernMessages[i];
            var name = (m.name||'');
            html += '<div class=\"tavern-msg'+(m.system?' system':'')+'\">';
            html += '<span class=\"tm-name\">'+name+'</span>';
            html += '<span class=\"tm-text\">'+m.text+'</span>';
            html += '<span class=\"tm-time\">'+m.time+'</span>';
            html += '</div>';
        }
        el.innerHTML = html;
        el.scrollTop = el.scrollHeight;
    }
    // 每5秒刷新酒馆消息
    _tavernTimer = setInterval(northTavernRefresh, 2000);
    window.NORTH_TAVERN = { refresh: northTavernRefresh };

    // 页面就绪后启动 2 秒轮询（原逻辑在 init() 中启动）
    function start() {
        _tavernTimer = setInterval(northTavernRefresh, 2000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
