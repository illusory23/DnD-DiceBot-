/* ━━━ 战术地图 · IndexedDB 缓存模块 ━━━
 * 从 map.js 拆分（2026-08-16 二次治理）
 * 必须在 map.js 之前加载（boot 启动时 await initDB()）
 */
        // ━━ IndexedDB 封装（持久连接，避免页面卸载时事务被中断）━━
        let _dbReady = false;
        let _db = null;

        // 启动时打开一次连接，保持到页面关闭
        function initDB() {
            return new Promise((resolve) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    if (!e.target.result.objectStoreNames.contains(DB_STORE)) {
                        e.target.result.createObjectStore(DB_STORE);
                    }
                };
                req.onsuccess = (e) => {
                    _db = e.target.result;
                    _dbReady = true;
                    // 连接断开时标记为未就绪（浏览器可能在页面隐藏时强制关闭）
                    _db.onclose = () => { _dbReady = false; _db = null; };
                    resolve(true);
                };
                req.onerror = () => { _dbReady = false; resolve(false); };
            });
        }

        function dbGetSync(key) {
            if (!_dbReady || !_db) {
                // 连接已断开（如浏览器清理），异步重连后返回 null（下次调用正常）
                initDB();
                return Promise.resolve(null);
            }
            return new Promise((resolve) => {
                try {
                    const tx = _db.transaction(DB_STORE, 'readonly');
                    const req = tx.objectStore(DB_STORE).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch(e) { resolve(null); }
            });
        }

        function dbSetSync(key, value) {
            if (!_dbReady || !_db) { initDB(); return false; }
            try {
                const tx = _db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(value, key);
                return true;
            } catch(e) { return false; }
        }

        function dbSetAndWait(key, value) {
            // 返回 Promise，等待事务提交（用于需要确认保存成功的场合）
            if (!_dbReady || !_db) return Promise.resolve(false);
            return new Promise((resolve) => {
                try {
                    const tx = _db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).put(value, key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch(e) { resolve(false); }
            });
        }

        function dbDeleteSync(key) {
            if (!_dbReady || !_db) return false;
            try {
                const tx = _db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(key);
                return true;
            } catch(e) { return false; }
        }
