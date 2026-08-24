/* ━━━ 通用项目风格弹窗组件 ━━━
 * 替换浏览器原生 alert/confirm/prompt：
 *   - window.alert 全局覆盖为项目风格提示弹窗（无返回值依赖，直接替换）
 *   - showConfirmDialog(message, opts) → Promise<boolean>（确定=resolve(true)）
 *   - showPromptDialog(message, opts) → Promise<string|null>（取消=null）
 *   - showAlertDialog(message, opts) → Promise<void>
 * opts: { title, okText, cancelText, danger, defaultValue, placeholder }
 * 样式跟随项目暗色冰霜主题（--surface/--accent/--border 变量，缺失时兜底）
 */
(function () {
    var STYLE = document.createElement('style');
    STYLE.textContent = [
        '.ck-dialog-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.62);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);}',
        '.ck-dialog{background:var(--surface,#1a1a24);border:2px solid var(--accent,#e94460);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.7);width:380px;max-width:92vw;overflow:hidden;animation:ckDialogIn 0.15s ease;}',
        '@keyframes ckDialogIn{from{transform:scale(0.92);opacity:0;}to{transform:scale(1);opacity:1;}}',
        '.ck-dialog-header{background:var(--accent,#e94460);color:#fff;padding:9px 14px;font-weight:bold;font-size:0.9rem;display:flex;justify-content:space-between;align-items:center;user-select:none;}',
        '.ck-dialog-close{background:none;border:none;color:#fff;cursor:pointer;font-size:1rem;line-height:1;opacity:0.85;padding:0 2px;}',
        '.ck-dialog-close:hover{opacity:1;}',
        '.ck-dialog-body{padding:14px 16px;color:var(--text,#ddd);font-size:0.85rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow-y:auto;}',
        '.ck-dialog-input{width:100%;padding:8px 10px;margin-top:10px;background:var(--bg,#111);border:1px solid var(--border,#333);border-radius:6px;color:var(--text,#ddd);font-size:0.85rem;box-sizing:border-box;outline:none;}',
        '.ck-dialog-input:focus{border-color:var(--accent,#e94460);}',
        '.ck-dialog-footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid var(--border,#333);}',
        '.ck-btn{padding:6px 16px;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:bold;transition:opacity 0.15s;}',
        '.ck-btn:hover{opacity:0.9;}',
        '.ck-btn-primary{background:var(--accent,#e94460);color:#fff;}',
        '.ck-btn-danger{background:#c0392b;color:#fff;}',
        '.ck-btn-ghost{background:var(--surface2,#2a2a38);color:var(--text,#ddd);border:1px solid var(--border,#333);}'
    ].join('\n');
    document.head.appendChild(STYLE);

    var overlay = null, box = null, inputEl = null, resolveFn = null;

    function ensure() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'ck-dialog-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML =
            '<div class="ck-dialog">' +
            '<div class="ck-dialog-header"><span class="ck-dialog-title"></span><button class="ck-dialog-close">✕</button></div>' +
            '<div class="ck-dialog-body"></div>' +
            '<div class="ck-dialog-footer"></div>' +
            '</div>';
        document.body.appendChild(overlay);
        box = overlay.querySelector('.ck-dialog');
        box.querySelector('.ck-dialog-close').addEventListener('click', function () { close(null); });
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) close(null);
        });
        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter' && inputEl && e.target === inputEl) {
                e.preventDefault();
                var btn = overlay.querySelector('.ck-btn-primary');
                if (btn) btn.click();
            }
        });
    }

    function close(value) {
        if (!overlay) return;
        overlay.style.display = 'none';
        if (inputEl) { inputEl.remove(); inputEl = null; }
        var r = resolveFn;
        resolveFn = null;
        if (r) r(value);
    }

    function open(opts) {
        ensure();
        var title = opts.title || '提示';
        var body = opts.body || '';
        overlay.querySelector('.ck-dialog-title').textContent = title;
        var bodyEl = overlay.querySelector('.ck-dialog-body');
        bodyEl.textContent = '';
        var textNode = document.createTextNode(body);
        bodyEl.appendChild(textNode);
        if (opts.input !== undefined) {
            inputEl = document.createElement('input');
            inputEl.className = 'ck-dialog-input';
            inputEl.type = 'text';
            inputEl.placeholder = opts.input.placeholder || '';
            if (opts.input.defaultValue !== undefined) inputEl.value = opts.input.defaultValue;
            bodyEl.appendChild(inputEl);
            setTimeout(function () { inputEl.focus(); inputEl.select(); }, 30);
        }
        var footer = overlay.querySelector('.ck-dialog-footer');
        footer.textContent = '';
        if (opts.cancel !== false) {
            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'ck-btn ck-btn-ghost';
            cancelBtn.textContent = opts.cancelText || '取消';
            cancelBtn.addEventListener('click', function () { close(null); });
            footer.appendChild(cancelBtn);
        }
        var okBtn = document.createElement('button');
        okBtn.className = 'ck-btn ' + (opts.danger ? 'ck-btn-danger' : 'ck-btn-primary');
        okBtn.textContent = opts.okText || '✅ 确定';
        okBtn.addEventListener('click', function () {
            if (opts.input !== undefined) {
                close(inputEl.value);
            } else {
                close(true);
            }
        });
        footer.appendChild(okBtn);
        overlay.style.display = 'flex';
        return new Promise(function (resolve) { resolveFn = resolve; });
    }

    // 项目风格提示弹窗（替代 alert）
    window.showAlertDialog = function (message, opts) {
        opts = opts || {};
        return open({
            title: opts.title || '提示',
            body: String(message != null ? message : ''),
            okText: opts.okText || '✅ 确定',
            cancel: false
        });
    };

    // 项目风格确认弹窗（替代 confirm）→ Promise<boolean>
    window.showConfirmDialog = function (message, opts) {
        opts = opts || {};
        return open({
            title: opts.title || '确认操作',
            body: String(message != null ? message : ''),
            okText: opts.okText || '✅ 确定',
            cancelText: opts.cancelText || '取消',
            danger: !!opts.danger
        });
    };

    // 项目风格输入弹窗（替代 prompt）→ Promise<string|null>
    window.showPromptDialog = function (message, opts) {
        opts = opts || {};
        return open({
            title: opts.title || '请输入',
            body: String(message != null ? message : ''),
            input: {
                defaultValue: opts.defaultValue !== undefined ? opts.defaultValue : '',
                placeholder: opts.placeholder || ''
            },
            okText: opts.okText || '✅ 确定',
            cancelText: opts.cancelText || '取消'
        });
    };

    // 全局覆盖浏览器原生 alert → 项目风格弹窗
    // （alert 无返回值依赖，覆盖后全部页面自动生效）
    window.alert = function (message) {
        window.showAlertDialog(message);
    };
})();
