/**
 * 帧同步客户端
 * ━━━━━━━━━━━━━
 * 通过 WebSocket 与服务端保持帧同步（Lockstep 模型）。
 *
 * 方案E 核心：确保所有客户端在相同时刻推进到相同帧。
 *
 * 协议格式：
 *  服务端 → 客户端:
 *    {type: "dice_sync_start", seed: 12345, dice: [{sides: 20}], frameStart: 0, timestamp: ...}
 *    {type: "dice_sync_frame", frame: N, checksum: "..."}
 *    {type: "dice_sync_result", results: [{value: 15, ...}], seed: 12345}
 *
 *  客户端 → 服务端:
 *    {type: "dice_roll", notation: "1d20+5", seed: 12345, dice: [{sides: 20}]}
 */

export class FrameSyncClient {
    /**
     * @param {string} wsUrl - WebSocket 连接地址 (如 "ws://localhost:5000/ws")
     * @param {object} options
     */
    constructor(wsUrl, options = {}) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
        this._handlers = {};
        this._pendingSend = [];

        // 帧同步状态
        this.currentFrame = 0;
        this.targetFrame = 0;
        this.frameBuffer = options.frameBuffer ?? 3;    // 缓冲帧数
        this.syncActive = false;
        this.activeSeed = null;
        this.activeDice = [];
    }

    /**
     * 建立 WebSocket 连接
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);
            } catch (e) {
                reject(new Error(`WebSocket 连接失败: ${e.message}`));
                return;
            }

            this.ws.onopen = () => {
                console.log('[FrameSync] WebSocket 已连接');
                this.connected = true;
                this.reconnectAttempts = 0;

                // 发送待发队列中的消息
                for (const msg of this._pendingSend) {
                    this._sendRaw(msg);
                }
                this._pendingSend = [];

                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleMessage(data);
                } catch (e) {
                    console.warn('[FrameSync] 无法解析消息:', e);
                }
            };

            this.ws.onclose = (event) => {
                console.log(`[FrameSync] WebSocket 断开 (code: ${event.code})`);
                this.connected = false;
                this.syncActive = false;
                this._emit('disconnect', { code: event.code, reason: event.reason });
                this._tryReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[FrameSync] WebSocket 错误:', error);
                if (!this.connected) {
                    reject(new Error('WebSocket 连接错误'));
                }
            };
        });
    }

    /**
     * 发送掷骰请求
     * @param {number} seed - 确定性种子
     * @param {Array<{sides: number}>} dice - 骰子列表
     * @param {object} meta - 额外信息 {notation, roller, ...}
     */
    sendDiceRoll(seed, dice, meta = {}) {
        const msg = {
            type: 'dice_roll',
            seed: seed,
            dice: dice,
            notation: meta.notation || '',
            roller: meta.roller || 'anonymous',
            timestamp: Date.now(),
        };
        this._send(msg);
        this.activeSeed = seed;
        this.activeDice = dice;
        return msg;
    }

    /**
     * 直接发送JSON消息（绕过队列，用于紧急消息如结果广播）
     * @param {object} msg - 消息对象
     */
    sendDirect(msg) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._sendRaw(msg);
            return true;
        }
        return false;
    }

    /**
     * 注册事件处理器
     * @param {'start'|'frame'|'result'|'disconnect'|'error'} event
     * @param {function} handler
     */
    on(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
    }

    /**
     * 移除事件处理器
     */
    off(event, handler) {
        if (!this._handlers[event]) return;
        this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    }

    /**
     * 断开连接
     */
    disconnect() {
        this.maxReconnectAttempts = 0;  // 阻止自动重连
        if (this.ws) {
            this.ws.close(1000, '客户端主动断开');
            this.ws = null;
        }
        this.connected = false;
        this.syncActive = false;
    }

    // ━━ 内部方法 ━━

    _send(msg) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._sendRaw(msg);
        } else {
            this._pendingSend.push(msg);
        }
    }

    _sendRaw(msg) {
        try {
            this.ws.send(JSON.stringify(msg));
        } catch (e) {
            console.error('[FrameSync] 发送失败:', e);
            this._pendingSend.push(msg);
        }
    }

    _handleMessage(data) {
        switch (data.type) {
            case 'dice_sync_start':
                // 服务端确认掷骰开始，广播同步参数
                console.log('[FrameSync] 收到同步开始:', data);
                this.syncActive = true;
                this.currentFrame = data.frameStart || 0;
                this.targetFrame = this.currentFrame + this.frameBuffer;
                this.activeSeed = data.seed;
                this.activeDice = data.dice || [];
                this._emit('start', data);
                break;

            case 'dice_sync_frame':
                // 服务端帧号推进（用于追赶/校准）
                this.targetFrame = Math.max(this.targetFrame, data.frame + this.frameBuffer);
                this._emit('frame', { frame: data.frame, checksum: data.checksum, targetFrame: this.targetFrame });
                break;

            case 'dice_sync_result':
                // 服务端下发权威结果
                console.log('[FrameSync] 收到权威结果:', data);
                this.syncActive = false;
                this._emit('result', {
                    results: data.results,
                    seed: data.seed,
                    total: data.total,
                    notation: data.notation,
                    roller: data.roller,
                });
                break;

            case 'dice_sync_error':
                console.error('[FrameSync] 服务端错误:', data.message);
                this._emit('error', { message: data.message });
                break;

            default:
                // 忽略其他消息类型（如画布同步消息）
                break;
        }
    }

    _emit(event, data) {
        const handlers = this._handlers[event] || [];
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (e) {
                console.error(`[FrameSync] 事件处理器错误 (${event}):`, e);
            }
        }
    }

    _tryReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[FrameSync] 已达到最大重连次数，放弃重连');
            this._emit('error', { message: '连接已断开，重连失败' });
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 10);
        console.log(`[FrameSync] ${delay}ms 后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            if (!this.connected) {
                this.connect().catch(() => {
                    // 重连失败，_tryReconnect 会在 onclose 中再次触发
                });
            }
        }, delay);
    }
}
