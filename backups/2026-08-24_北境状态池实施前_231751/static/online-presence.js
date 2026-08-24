/* ━━━ 全站在线状态 · 心跳脚本 ━━━
 *
 * 逻辑：打开任意页面即算在线；关闭所有登录页面后才算下线。
 *  - 每个浏览器标签页生成独立 session_id（sessionStorage 按标签页隔离，
 *    同标签页刷新保持同一会话）
 *  - 每 20 秒心跳一次上报"本标签页仍打开"
 *  - 页面关闭时 sendBeacon 上报下线；异常关闭由服务端 60 秒超时兜底
 *  - 仅登录用户计入在线
 */
(function () {
    var HEARTBEAT_MS = 20000;
    var PAGE = window.location.pathname;

    // 每个标签页独立的会话 ID（刷新保留，切标签不失效）
    var sid = sessionStorage.getItem('op_sid');
    if (!sid) {
        sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('op_sid', sid);
    }

    function beat() {
        try {
            fetch('/api/online/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sid, page: PAGE }),
            }).catch(function () {});
        } catch (e) {}
    }

    function leave() {
        try {
            // sendBeacon 用 Blob 显式指定 JSON 类型，页面关闭后仍能送达
            navigator.sendBeacon(
                '/api/online/leave',
                new Blob([JSON.stringify({ session_id: sid })], { type: 'application/json' })
            );
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', function () {
        beat();
        setInterval(beat, HEARTBEAT_MS);
    });
    window.addEventListener('pagehide', leave);
    window.addEventListener('beforeunload', leave);
})();
