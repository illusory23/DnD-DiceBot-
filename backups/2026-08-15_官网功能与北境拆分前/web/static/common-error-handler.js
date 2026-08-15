/**
 * 尘封之卷 — 通用前端错误处理模块
 *
 * 提供:
 *   - 全局 fetch 包装器（带错误处理/重试）
 *   - 未捕获错误自动上报
 *   - 网络断开/恢复通知
 *   - Toast 浮动提示组件
 *   - Loading 状态管理
 *
 * 用法: 在页面 <head> 中引入 <script src="/static/common-error-handler.js"></script>
 */

(function () {
  'use strict';

  // ━━━ 获取当前用户身份信息 ━━━
  function getCurrentUser() {
    try {
      var s = sessionStorage.getItem('dnd_joined_room');
      if (s) {
        var u = JSON.parse(s);
        return { name: u.name || '', role: u.role || 'PL', color: u.color || '' };
      }
    } catch (e) { /* ignore */ }
    return { name: '', role: '', color: '' };
  }

  function getCurrentPage() {
    try {
      var path = window.location.pathname.replace(/\/+$/, '') || '/';
      return path;
    } catch (e) {
      return '?';
    }
  }

  // ━━━ 全局未捕获错误上报 ━━━
  window.addEventListener('error', function (event) {
    var err = {
      message: (event.message || '未知错误').substring(0, 500),
      source: (event.filename || '').substring(0, 200),
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      url: window.location.href.substring(0, 300),
      page: getCurrentPage(),
      username: getCurrentUser().name,
      userAgent: navigator.userAgent.substring(0, 200),
      stack: (event.error && event.error.stack || '').substring(0, 2000),
    };
    // 使用 sendBeacon 确保页面关闭时也能发出
    try {
      navigator.sendBeacon('/api/error-report', JSON.stringify(err));
    } catch (e) {
      fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err),
      }).catch(function () {});
    }
  });

  // 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = '未处理的 Promise 拒绝';
    if (reason instanceof Error) {
      msg = reason.message || msg;
    } else if (typeof reason === 'string') {
      msg = reason;
    }
    var err = {
      message: msg.substring(0, 500),
      source: 'Promise',
      lineno: 0,
      colno: 0,
      url: window.location.href.substring(0, 300),
      page: getCurrentPage(),
      username: getCurrentUser().name,
      userAgent: navigator.userAgent.substring(0, 200),
      stack: (reason && reason.stack || '').substring(0, 2000),
    };
    fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(err),
    }).catch(function () {});
  });

  // ━━━ 网络状态检测 ━━━
  var _wasOffline = false;

  function showNetworkBanner(msg, isError) {
    var existing = document.getElementById('__net_banner');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.id = '__net_banner';
    banner.textContent = msg;
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:99999;',
      'padding:10px 16px;text-align:center;font-size:0.85rem;font-weight:600;',
      'color:#fff;',
      isError
        ? 'background:rgba(220,53,69,0.95);backdrop-filter:blur(4px);'
        : 'background:rgba(40,167,69,0.95);backdrop-filter:blur(4px);',
      'animation:__fadeIn 0.3s ease;',
      'pointer-events:none;',
    ].join('');
    document.body.appendChild(banner);
    // 3秒后自动消失
    setTimeout(function () {
      if (banner.parentNode) {
        banner.style.transition = 'opacity 0.5s';
        banner.style.opacity = '0';
        setTimeout(function () { if (banner.parentNode) banner.remove(); }, 500);
      }
    }, 3000);
  }

  window.addEventListener('offline', function () {
    _wasOffline = true;
    showNetworkBanner('⚠️ 网络连接已断开，请检查网络设置', true);
  });

  window.addEventListener('online', function () {
    if (_wasOffline) {
      showNetworkBanner('✅ 网络连接已恢复', false);
      _wasOffline = false;
    }
  });

  // ━━━ Toast 浮动提示组件 ━━━
  // 使用: Toast.show('消息', 'error'|'success'|'info'|'warning', 持续时间ms)

  var _toastContainer = null;

  function getToastContainer() {
    if (!_toastContainer || !_toastContainer.parentNode) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = '__toast_container';
      _toastContainer.style.cssText = [
        'position:fixed;bottom:24px;right:24px;z-index:99998;',
        'display:flex;flex-direction:column-reverse;gap:8px;',
        'max-width:360px;pointer-events:none;',
      ].join('');
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  window.Toast = {
    show: function (msg, type, duration) {
      type = type || 'info';
      duration = duration || 3500;
      var container = getToastContainer();
      var toast = document.createElement('div');
      toast.className = '__toast';
      var colors = {
        error:   { bg: 'rgba(220,53,69,0.92)',   icon: '❌' },
        success: { bg: 'rgba(40,167,69,0.92)',    icon: '✅' },
        warning: { bg: 'rgba(255,193,7,0.92)',    icon: '⚠️' },
        info:    { bg: 'rgba(0,180,216,0.92)',    icon: 'ℹ️' },
      };
      var c = colors[type] || colors.info;
      toast.style.cssText = [
        'background:' + c.bg + ';color:#fff;',
        'padding:10px 16px;border-radius:8px;font-size:0.82rem;',
        'box-shadow:0 4px 16px rgba(0,0,0,0.3);',
        'backdrop-filter:blur(4px);',
        'display:flex;align-items:center;gap:8px;',
        'animation:__fadeIn 0.25s ease;',
        'pointer-events:auto;cursor:pointer;',
      ].join('');
      toast.innerHTML = '<span style="font-size:1rem;">' + c.icon + '</span><span>' + msg + '</span>';
      toast.addEventListener('click', function () { toast.remove(); });
      container.appendChild(toast);
      setTimeout(function () {
        if (toast.parentNode) {
          toast.style.transition = 'opacity 0.4s, transform 0.4s';
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(40px)';
          setTimeout(function () { if (toast.parentNode) toast.remove(); }, 400);
        }
      }, duration);
    },
    error:   function (msg, dur) { this.show(msg, 'error', dur); },
    success: function (msg, dur) { this.show(msg, 'success', dur); },
    warning: function (msg, dur) { this.show(msg, 'warning', dur); },
    info:    function (msg, dur) { this.show(msg, 'info', dur); },
  };

  // ━━━ 带错误处理的 fetch 包装器 ━━━
  // 使用: safeFetch(url, options).then(...)
  // 特性:
  //   - 自动检测 HTTP 错误状态码
  //   - 网络错误抛出可读信息
  //   - 支持结果 Toast 提示
  //   - 支持可选重试

  window.safeFetch = function (url, options, retries) {
    retries = retries || 0;
    options = options || {};

    return fetch(url, options).then(function (response) {
      if (!response.ok) {
        // 服务器错误
        if (response.status >= 500) {
          throw new Error('服务器错误 (HTTP ' + response.status + ')，请稍后重试');
        }
        // 客户端错误 — 尝试解析错误消息
        return response.json().then(function (data) {
          throw new Error(data.error || data.message || '请求错误 (HTTP ' + response.status + ')');
        }).catch(function (parseErr) {
          if (parseErr.message && parseErr.message.indexOf('HTTP') === -1) {
            throw parseErr;
          }
          throw new Error('请求错误 (HTTP ' + response.status + ')');
        });
      }
      return response.json();
    }).catch(function (err) {
      // 网络错误 — 支持重试
      if (retries > 0 && (err.message.indexOf('NetworkError') !== -1 ||
          err.message.indexOf('Failed to fetch') !== -1 ||
          err.message.indexOf('Network') !== -1)) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            window.safeFetch(url, options, retries - 1).then(resolve, reject);
          }, 1000);
        });
      }
      throw err;
    });
  };

  // ━━━ 通用的带提示的 API 调用 ━━━
  // 使用: apiCall('/api/character', {method:'POST', body:{...}})
  //        .then(data => { ... })
  //        .catch(err => { ... })  // 错误已自动 Toast 提示

  window.apiCall = function (url, options) {
    options = options || {};
    var headers = options.headers || {};
    if (!headers['Content-Type'] && options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    options.headers = headers;

    return window.safeFetch(url, options, 1).catch(function (err) {
      // 自动显示 Toast
      var msg = err.message || '操作失败';
      // 网络错误特殊提示
      if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
        msg = '网络连接失败，请检查网络后重试';
      }
      Toast.warning(msg, 5000);
      throw err;  // 继续抛出让调用方处理
    });
  };

  // ━━━ Loading 辅助 ━━━
  // 使用: Loading.show(buttonElement)   — 显示按钮加载状态
  //       Loading.hide(buttonElement)   — 恢复按钮
  //       Loading.showOverlay(msg)      — 显示全屏加载遮罩
  //       Loading.hideOverlay()         — 隐藏遮罩

  window.Loading = {
    _overlay: null,

    /** 给按钮添加加载状态 */
    show: function (btn) {
      if (!btn) return;
      btn._origText = btn.textContent;
      btn._origDisabled = btn.disabled;
      btn.disabled = true;
      btn.textContent = '⏳ ' + (btn.dataset.loadingText || '处理中...');
      btn.style.cursor = 'wait';
    },

    /** 恢复按钮 */
    hide: function (btn) {
      if (!btn) return;
      btn.disabled = btn._origDisabled || false;
      btn.textContent = btn._origText || btn.textContent;
      btn.style.cursor = '';
    },

    /** 显示全屏遮罩 */
    showOverlay: function (msg) {
      this.hideOverlay();
      var overlay = document.createElement('div');
      overlay.id = '__loading_overlay';
      overlay.style.cssText = [
        'position:fixed;top:0;left:0;right:0;bottom:0;',
        'background:rgba(0,0,0,0.5);z-index:99997;',
        'display:flex;align-items:center;justify-content:center;',
        'backdrop-filter:blur(2px);',
      ].join('');
      var box = document.createElement('div');
      box.style.cssText = [
        'background:var(--surface,#1a1a2e);border:1px solid var(--accent,#e94460);',
        'border-radius:12px;padding:24px 36px;text-align:center;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
      ].join('');
      box.innerHTML = '<div style="font-size:2rem;margin-bottom:8px;animation:__spin 1s linear infinite;">🎲</div>'
        + '<div style="color:var(--text,#ccc);font-size:0.9rem;">' + (msg || '处理中...') + '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      this._overlay = overlay;
    },

    /** 隐藏遮罩 */
    hideOverlay: function () {
      if (this._overlay && this._overlay.parentNode) {
        this._overlay.remove();
      }
      this._overlay = null;
    },
  };

  // ━━━ CSS 动画注入 ━━━
  if (!document.getElementById('__error_handler_css')) {
    var styleEl = document.createElement('style');
    styleEl.id = '__error_handler_css';
    styleEl.textContent = [
      '@keyframes __fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }',
      '@keyframes __spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }',
      '#__net_banner { animation: __fadeIn 0.3s ease; }',
      '.__toast { transition: opacity 0.4s, transform 0.4s; }',
    ].join('\n');
    document.head.appendChild(styleEl);
  }

  // ━━━ 上下线自动追踪 ━━━
  // 离开跑团页面时自动发送 leave，切换标签页时通过心跳更新状态
  var _hasLeft = false;
  function _leaveRoom() {
    if (_hasLeft) return;
    _hasLeft = true;
    var name = '';
    try { var s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (s) name = s.name || ''; } catch(e) {}
    if (!name) return;
    var data = JSON.stringify({name: name});
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/room/leave', new Blob([data], {type: 'application/json'}));
    } else {
      fetch('/api/room/leave', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: data}).catch(function(){});
    }
  }
  // 延迟离开：刷新/页面内导航会销毁页面使定时器失效（不发送leave），
  // 真正关闭页面时由服务端心跳超时（10秒）清理离线状态
  var _leaveTimer = null;
  function _scheduleLeave() {
    if (_leaveTimer) return;
    _leaveTimer = setTimeout(function() {
      _leaveTimer = null;
      _leaveRoom();
    }, 1500);
  }
  window.addEventListener('beforeunload', _scheduleLeave);
  // 切换标签页不再触发离开（避免多标签页操作导致在线身份丢失），
  // 重新可见时快速心跳确认在线即可
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      _hasLeft = false;
      // 重新上线：快速心跳
      var name = '';
      try { var s = JSON.parse(sessionStorage.getItem('dnd_joined_room')); if (s) name = s.name || ''; } catch(e) {}
      if (name) {
        fetch('/api/room/heartbeat', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({name: name}),
        }).catch(function(){});
      }
    }
  });

  // 暴露到全局
  window.___errorHandlerVersion = '1.1';
  console.log('[尘封之卷] 错误处理模块已加载 ✓');
})();
