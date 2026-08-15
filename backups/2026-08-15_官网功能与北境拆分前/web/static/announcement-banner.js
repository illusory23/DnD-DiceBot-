/* ━━━ 平台公告横幅 ━━━
 * 管理员发布的公告显示在页面顶部横幅（z-index 99990，位于导航之上）。
 * - 拉取 /api/announcements（启用中的公告，最新 3 条）
 * - 仅显示最新一条，可手动关闭；关闭后该公告本次浏览器不再显示（localStorage 记忆）
 */
(function () {
    'use strict';
    var KEY = 'dnd_dismissed_anns';

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function load() {
        // 仅官网页面展示（/ 首页、/user 用户中心、/topics/* 话题详情）；
        // 跑团平台与探索北境不显示公告
        var path = location.pathname;
        var isPortal = path === '/' || path === '/user' || path.indexOf('/topics/') === 0;
        if (!isPortal) return;
        fetch('/api/announcements')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.ok || !d.announcements || !d.announcements.length) return;
                var dismissed = {};
                try { dismissed = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
                var fresh = d.announcements.filter(function (a) { return !dismissed[a.id]; });
                if (!fresh.length) return;
                showBanner(fresh[0], dismissed);
            })
            .catch(function () {});
    }

    function showBanner(ann, dismissed) {
        var banner = document.createElement('div');
        banner.style.cssText = [
            // 顶部导航（navbar 56px / 北境 top-bar 68px）下方展示，不遮挡导航按钮
            // z-index 99：低于官网侧边栏（101），展开功能栏不被横幅遮挡
            'position:fixed;top:70px;left:0;right:0;z-index:99;',
            'background:linear-gradient(90deg,#2a4a6a 0%,#1c3050 100%);',
            'border-bottom:2px solid #ffd700;color:#e8f0f8;',
            'padding:8px 44px 8px 16px;font-size:0.85rem;',
            'box-shadow:0 2px 14px rgba(0,0,0,0.35);',
            'display:flex;align-items:center;gap:10px;',
        ].join('');
        var icon = document.createElement('span');
        icon.textContent = '📢';
        icon.style.fontSize = '1rem';
        var title = document.createElement('b');
        title.textContent = ann.title || '';
        title.style.color = '#ffd700';
        title.style.flexShrink = '0';
        var content = document.createElement('span');
        content.textContent = ann.content || '';
        content.style.flex = '1';
        content.style.overflow = 'hidden';
        content.style.textOverflow = 'ellipsis';
        content.style.whiteSpace = 'nowrap';
        content.title = ann.content || '';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.title = '关闭公告';
        closeBtn.style.cssText = [
            'position:absolute;right:8px;top:50%;transform:translateY(-50%);',
            'background:none;border:none;color:#9ab4d8;cursor:pointer;font-size:1.05rem;padding:2px 6px;',
        ].join('');
        closeBtn.onmouseover = function () { closeBtn.style.color = '#ff6b6b'; };
        closeBtn.onmouseout = function () { closeBtn.style.color = '#9ab4d8'; };
        closeBtn.onclick = function () {
            dismissed[ann.id] = 1;
            try { localStorage.setItem(KEY, JSON.stringify(dismissed)); } catch (e) {}
            banner.remove();
        };
        banner.appendChild(icon);
        banner.appendChild(title);
        banner.appendChild(content);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);
        // 官网左侧功能栏展开时，横幅向右压缩（与侧边栏 200px 宽度同步过渡）
        var sidebar = document.getElementById('nav-sidebar');
        if (sidebar) {
            var applyShift = function () {
                banner.style.left = sidebar.classList.contains('open') ? '200px' : '0';
            };
            banner.style.transition = 'left 0.35s cubic-bezier(0.4,0,0.2,1)';
            if (window.MutationObserver) {
                new MutationObserver(applyShift).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
            }
            applyShift();
        }
    }

    load();
})();
