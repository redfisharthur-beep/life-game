(() => {
  class CloudflareSocketCompat {
    constructor() {
      this.connected = true;
      this.id = crypto.randomUUID();
      this.listeners = new Map();
      this.pending = new Map();
      this.ws = null;
      this.activeSession = null;
      this.intentionalClose = false;
      this.reconnectTimer = null;

      queueMicrotask(() => {
        this.dispatch('connect');
        this.dispatch('server:ready', {
          message: 'Cloudflare Worker 連線成功',
          socketId: this.id,
        });
      });
    }

    on(event, handler) {
      if (typeof handler !== 'function') return this;
      const handlers = this.listeners.get(event) || new Set();
      handlers.add(handler);
      this.listeners.set(event, handlers);
      return this;
    }

    off(event, handler) {
      const handlers = this.listeners.get(event);
      if (!handlers) return this;
      handlers.delete(handler);
      if (!handlers.size) this.listeners.delete(event);
      return this;
    }

    dispatch(event, data) {
      const handlers = this.listeners.get(event);
      if (!handlers) return;
      handlers.forEach((handler) => {
        try { handler(data); } catch (error) { console.error(`socket listener ${event} failed`, error); }
      });
    }

    parseEmitArgs(args) {
      const values = [...args];
      let callback = null;
      if (typeof values[values.length - 1] === 'function') callback = values.pop();
      return {
        payload: values.length ? values[0] : {},
        callback,
      };
    }

    emit(event, ...args) {
      const { payload, callback } = this.parseEmitArgs(args);

      if (event === 'room:autoJoin') {
        this.autoJoin(payload, callback);
        return this;
      }

      if (event === 'room:resume') {
        this.resume(payload, callback);
        return this;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        callback?.({ ok: false, message: '房間連線尚未完成，請稍後再試。' });
        return this;
      }

      this.sendRequest(event, payload, callback);
      return this;
    }

    async autoJoin(payload, callback) {
      try {
        const response = await fetch('/api/auto-join', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        const result = await response.json();
        if (!result?.ok) {
          callback?.(result);
          return;
        }

        await this.connectRoom(result.session);
        this.sendRequest('room:resume', result.session, (resumeResult) => {
          callback?.(resumeResult?.ok ? resumeResult : result);
        });
      } catch (error) {
        console.error('autoJoin failed', error);
        callback?.({ ok: false, message: '無法連線到 Cloudflare 遊戲服務。' });
      }
    }

    async resume(payload, callback) {
      if (!payload?.roomCode || !payload?.playerId || !payload?.reconnectToken) {
        callback?.({ ok: false, message: '缺少恢復房間所需資料。' });
        return;
      }

      try {
        await this.connectRoom(payload);
        this.sendRequest('room:resume', payload, callback);
      } catch (error) {
        console.error('resume failed', error);
        callback?.({ ok: false, message: '上一局已結束或無法恢復。' });
      }
    }

    connectRoom(session) {
      const sameRoom = this.activeSession
        && this.activeSession.roomCode === session.roomCode
        && this.activeSession.playerId === session.playerId;

      if (sameRoom && this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();

      this.activeSession = { ...session };
      this.intentionalClose = true;
      if (this.ws && this.ws.readyState < WebSocket.CLOSING) this.ws.close(1000, 'switch room');
      this.intentionalClose = false;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        playerId: session.playerId,
        reconnectToken: session.reconnectToken,
      });
      const url = `${protocol}//${location.host}/ws/${encodeURIComponent(session.roomCode)}?${params}`;

      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        this.ws = ws;

        const timeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            try { ws.close(); } catch (_) {}
            reject(new Error('WebSocket connection timeout'));
          }
        }, 8000);

        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          this.connected = true;
          resolve();
        }, { once: true });

        ws.addEventListener('error', () => {
          clearTimeout(timeout);
          if (ws.readyState !== WebSocket.OPEN) reject(new Error('WebSocket connection failed'));
        }, { once: true });

        ws.addEventListener('message', (messageEvent) => this.handleMessage(messageEvent.data));
        ws.addEventListener('close', () => this.handleClose(ws));
      });
    }

    handleMessage(raw) {
      let message;
      try { message = JSON.parse(raw); } catch (_) { return; }

      if (message.type === 'ack') {
        const callback = this.pending.get(message.requestId);
        if (callback) {
          this.pending.delete(message.requestId);
          callback(message.result);
        }
        return;
      }

      if (message.type === 'event' && message.event) {
        this.dispatch(message.event, message.data);
      }
    }

    sendRequest(event, payload, callback) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        callback?.({ ok: false, message: '房間連線已中斷。' });
        return;
      }

      const requestId = crypto.randomUUID();
      if (callback) {
        this.pending.set(requestId, callback);
        setTimeout(() => {
          const pendingCallback = this.pending.get(requestId);
          if (!pendingCallback) return;
          this.pending.delete(requestId);
          pendingCallback({ ok: false, message: '伺服器回應逾時，請再試一次。' });
        }, 10000);
      }

      this.ws.send(JSON.stringify({
        event,
        payload: payload || {},
        requestId,
      }));

      if (event === 'room:leave') {
        const originalCallback = callback;
        if (callback) {
          this.pending.set(requestId, (result) => {
            this.intentionalClose = true;
            this.activeSession = null;
            originalCallback(result);
            setTimeout(() => { this.intentionalClose = false; }, 0);
          });
        }
      }
    }

    handleClose(closedSocket) {
      if (this.ws !== closedSocket) return;
      this.ws = null;

      if (this.intentionalClose || !this.activeSession) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(async () => {
        if (!this.activeSession) return;
        try {
          await this.connectRoom(this.activeSession);
          this.sendRequest('room:resume', this.activeSession, (result) => {
            if (result?.ok) {
              this.dispatch('connect');
              this.dispatch('room:update', result.room);
            }
          });
        } catch (_) {
          this.handleClose(this.ws);
        }
      }, 1000);
    }
  }

  window.io = function io() {
    return new CloudflareSocketCompat();
  };
})();
