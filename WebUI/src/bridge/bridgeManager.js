/**
 * ABD Bank Manager — Bridge Manager
 * Detects and connects to C++ backend via Plugin Host (Iframe/Parent), WebView2, JUCE, or falls back to mock
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
    const parentBridge = window.__synthBridge || (typeof window.parent !== 'undefined' && window.parent !== window && window.parent.__synthBridge);
    const juceBackend = window.__JUCE__?.backend || (typeof window.parent !== 'undefined' && window.parent !== window && window.parent.__JUCE__?.backend);

    if (parentBridge) {
      this.type = 'plugin-host';
      this._parentBridge = parentBridge;
      this.connected = true;
      if (typeof parentBridge.on === 'function') {
        parentBridge.on('state', (state) => this._handleMessage({ action: 'state', data: state }));
        parentBridge.on('programData', (data) => this._handleMessage({ action: 'programData', data }));
        parentBridge.on('paramChange', (data) => this._handleMessage({ action: 'paramChange', data }));
      }
      console.log('[Bridge] Plugin Host bridge connected');
    } else if (juceBackend && typeof juceBackend.addEventListener === 'function' &&
        typeof juceBackend.emitEvent === 'function') {
      this.type = 'juce';
      this._juceEventId = 'abdBankManagerMessage';
      juceBackend.addEventListener(this._juceEventId, (message) => this._handleMessage(message));
      this.connected = true;
      console.log('[Bridge] JUCE WebBrowserComponent connected');
    } else if (window.chrome && window.chrome.webview) {
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

    if (this.type === 'plugin-host' && this._parentBridge) {
      if (typeof this._parentBridge.send === 'function') {
        this._parentBridge.send(action, data);
      }
      return;
    }

    if (this.type === 'juce' && window.__JUCE__?.backend) {
      window.__JUCE__.backend.emitEvent(this._juceEventId, msg);
      return;
    }

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

    const payload = msg.data && typeof msg.data === 'object' ? msg.data : msg;

    switch (msg.action) {
      case 'state':
        if (payload.params && typeof payload.params === 'object') {
          paramStore.syncAll(payload.params);
          this._emit('syncAll', payload.params);
        }
        this._emit('state', payload);
        break;

      case 'presetSelected':
        this._emit('presetSelected', payload);
        break;

      case 'syncAllParams':
        if (payload.params && typeof payload.params === 'object') {
          paramStore.syncAll(payload.params);
          this._emit('syncAll', payload.params);
        }
        break;

      case 'paramChange':
        if (payload.paramId !== undefined) {
          paramStore.set(payload.paramId, payload.value);
          this._emit('paramChange', payload);
        }
        break;

      case 'getRawProgramData':
      case 'programData':
        this._emit('programData', payload);
        break;

      case 'error':
        this._emit('error', payload);
        break;

      default:
        this._emit(msg.action, payload);
    }
  }

  on(action, callback) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, new Set());
    }
    this.listeners.get(action).add(callback);
    return () => this.listeners.get(action)?.delete(callback);
  }

  _emit(action, data) {
    const set = this.listeners.get(action);
    if (set) {
      for (const cb of set) {
        try { cb(data); } catch (e) { console.error(`[Bridge] Listener error for ${action}:`, e); }
      }
    }
  }

  _mockResponse(msg) {
    setTimeout(() => {
      switch (msg.action) {
        case 'requestState':
          this._handleMessage({
            action: 'state',
            schemaVersion: 1,
            data: {
              version: 1,
              banks: [],
              params: {}
            }
          });
          break;
        case 'setParam':
          this._handleMessage({
            action: 'paramChange',
            data: { paramId: msg.paramId, value: msg.value }
          });
          break;
        case 'presetSelected':
          this._handleMessage({
            action: 'presetSelected',
            data: {
              currentBankIndex: msg.currentBankIndex ?? 0,
              currentPatchIndex: msg.currentPatchIndex ?? 0
            }
          });
          break;
      }
    }, 10);
  }
}

export const bridge = new BridgeManager();
