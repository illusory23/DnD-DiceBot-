/* ━━━ 尘封之卷 · 管理员后台通用脚本 ━━━ */

const Admin = {
    // 当前登录用户信息（模板注入）
    currentUser: null,

    // ━━ 初始化 ━━
    init() {
        this.highlightNav();
        this.hookLogout();
    },

    // ━━ 侧栏高亮当前页 ━━
    highlightNav() {
        const path = window.location.pathname;
        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && path.startsWith(href) && href !== '/admin') {
                a.classList.add('active');
            } else if (href === '/admin/' && (path === '/admin/' || path === '/admin')) {
                a.classList.add('active');
            }
        });
    },

    // ━━ 退出 ━━
    hookLogout() {
        const btn = document.getElementById('btn-logout');
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const resp = await fetch('/admin/api/logout', { method: 'POST' });
                if (resp.ok) {
                    window.location.href = '/admin/login';
                }
            });
        }
    },

    // ━━ Toast 通知 ━━
    toast(msg, type = 'info', duration = 3000) {
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, duration - 300);
        setTimeout(() => el.remove(), duration);
    },

    // ━━ 确认弹窗（项目风格，返回 Promise<boolean>，调用处已 await）━━
    confirm(title, message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay show';
            overlay.innerHTML = `
                <div class="modal">
                    <h3>${this.escHtml(title)}</h3>
                    <p>${this.escHtml(message)}</p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-action="cancel">取消</button>
                        <button class="btn btn-danger" data-action="confirm">确认</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            overlay.querySelector('[data-action="cancel"]').onclick = () => {
                overlay.remove(); resolve(false);
            };
            overlay.querySelector('[data-action="confirm"]').onclick = () => {
                overlay.remove(); resolve(true);
            };
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); resolve(false); }
            });
        });
    },

    // ━━ API 请求封装 ━━
    async api(url, options = {}) {
        try {
            const resp = await fetch(url, {
                headers: { 'Content-Type': 'application/json', ...options.headers },
                ...options,
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || `请求失败 (${resp.status})`);
            }
            return data;
        } catch (e) {
            if (e.message !== 'Failed to fetch') {
                this.toast(e.message, 'error');
            }
            throw e;
        }
    },

    get(url) { return this.api(url); },
    post(url, body) { return this.api(url, { method: 'POST', body: JSON.stringify(body) }); },
    put(url, body) { return this.api(url, { method: 'PUT', body: JSON.stringify(body) }); },
    del(url) { return this.api(url, { method: 'DELETE' }); },

    // ━━ 分页渲染 ━━
    renderPagination(containerId, page, pages, onPage) {
        const container = document.getElementById(containerId);
        if (!container || pages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }
        let html = '';
        html += `<button ${page <= 1 ? 'disabled' : ''} data-p="1">⏮</button>`;
        html += `<button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">◀</button>`;

        for (let p = 1; p <= pages; p++) {
            if (p === 1 || p === pages || (p >= page - 2 && p <= page + 2)) {
                html += `<button class="${p === page ? 'active' : ''}" data-p="${p}">${p}</button>`;
            } else if (p === page - 3 || p === page + 3) {
                html += '<span class="page-info">...</span>';
            }
        }

        html += `<button ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">▶</button>`;
        html += `<button ${page >= pages ? 'disabled' : ''} data-p="${pages}">⏭</button>`;
        html += `<span class="page-info">${page} / ${pages} 页</span>`;

        container.innerHTML = html;
        container.querySelectorAll('button[data-p]').forEach(btn => {
            btn.addEventListener('click', () => onPage(parseInt(btn.dataset.p)));
        });
    },

    // ━━ HTML 转义 ━━
    escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    },

    // ━━ 日期格式化 ━━
    formatDate(iso) {
        if (!iso) return '-';
        // 后端 DateTime 字段均为 UTC naive（isoformat 无时区后缀）。
        // JS 会把无后缀字符串当本地时间解析，导致显示比真实注册时间早 8 小时
        // （曾出现"服务器未开启时注册"）。补 Z 按 UTC 解析后自动转本地时区显示。
        let s = String(iso).trim();
        if (!/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        const d = new Date(s);
        if (isNaN(d.getTime())) return iso;
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
