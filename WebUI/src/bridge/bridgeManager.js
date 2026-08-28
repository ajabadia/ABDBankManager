/**
 * ABD Bank Manager — Bridge Manager
 * Detects and connects to C++ backend via WebView2, WASM, or falls back to mock
 */

import { paramStore } from '../store/paramStore.js';

class BridgeManager {
  constructor() {
    this.type = 'mock';
    this.connected = false;
    this.listeners = new Map();
    this._init();
  }

  _init() {
    if (window.chrome && window.chrome.webview) {
      this.type = 'webview2';
      window.chrome.webview.addEventListener('message', (e) => this._handleMessage(e.data));
      this.connected = true;
      console.log('[Bridge] WebView2 connected');
    } else {
      this.type = 'mock';
      this.connected = false;
      console.log('[Bridge] Mock mode (standalone)');
    }
  }

  send(action, data = {}) {
    const msg = { action, ...data, timestamp: Date.now() };

    if (this.type === 'webview2' && window.chrome?.webview) {
      window.chrome.webview.postMessage(msg);
      return;
    }

    if (this.type === 'mock') {
      console.log('[Bridge:mock] Send:', msg);
      this._mockResponse(msg);
    }
  }

  _handleMessage(msg) {
    if (!msg || !msg.action) return;
    console.log('[Bridge] Received:', msg);

    switch (msg.action) {
      case 'syncAllParams':
        paramStore.syncAll(msg.params || {});
        this._emit('syncAll', msg.params);
        break;

      case 'paramChanged':
        paramStore.setValue(msg.paramId, msg.value);
        this._emit('paramChanged', msg);
        break;

      case 'bankLoaded':
        this._emit('bankLoaded', msg);
        break;

      case 'patchLoaded':
        this._emit('patchLoaded', msg);
        break;

      case 'hardwareStatus':
        this._emit('hardwareStatus', msg);
        break;

      case 'error':
        this._emit('error', msg);
        break;

      default:
        this._emit(msg.action, msg);
    }
  }

  _mockResponse(msg) {
    switch (msg.action) {
      case 'requestFullState': {
        const state = {};
        document.querySelectorAll('.rotary-knob-wrapper, .choice-wrapper, .boolean-wrapper').forEach(el => {
          const paramId = el.dataset?.paramId;
          if (paramId) {
            const val = paramStore.getValue(paramId);
            if (val !== undefined) state[paramId] = val;
          }
        });
        setTimeout(() => this._handleMessage({ action: 'syncAllParams', params: state }), 50);
        break;
      }
      case 'setParam':
        console.log(`[Mock] Param ${msg.paramId} → ${msg.value}`);
        break;
      default:
        break;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  _emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try { cb(data); } catch (e) { console.error(`[Bridge] Listener error (${event}):`, e); }
      }
    }
  }

  getStatus() {
    return { type: this.type, connected: this.connected };
  }
}

export const bridge = new BridgeManager();
