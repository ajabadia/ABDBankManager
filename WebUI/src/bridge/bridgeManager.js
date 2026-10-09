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
    this._juceEventId = 'abdBankManagerMessage';
    this._boundJuceHandler = null;
    this._boundWebViewHandler = null;
    this._parentBridgeHandlers = null;
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
        this._parentBridgeHandlers = {
          state: (state) => this._handleMessage({ action: 'state', data: state }),
          programData: (data) => this._handleMessage({ action: 'programData', data }),
          paramChange: (data) => this._handleMessage({ action: 'paramChange', data }),
          hostModel: (data) => this._handleMessage({ action: 'hostModel', data }),
          // Canal MIDI de hardware (Bank Manager embebido): el anfitrión abre el
          // dispositivo y devuelve los bytes, el acuse y los motivos de error. Sin
          // estas suscripciones el fetch por el puente nunca recibía respuesta.
          'hardware.receive': (data) => this._handleMessage({ action: 'hardware.receive', data }),
          'hardware.listen.ack': (data) => this._handleMessage({ action: 'hardware.listen.ack', data }),
          'hardware.sent': (data) => this._handleMessage({ action: 'hardware.sent', data }),
          'hardware.ports': (data) => this._handleMessage({ action: 'hardware.ports', data }),
          'hardware.error': (data) => this._handleMessage({ action: 'hardware.error', data }),
          // Transporte de software (mismos cuatro verbos + captura): el anfitrión
          // hospeda al Bank Manager y contesta a `preset.read` / `bank.write` / …
          // Sin suscribirse a las respuestas, `softwareTransport` solo podía morir
          // por timeout (ver DOCS/BANK_MANAGER_TRANSPORT_MODEL.md §6.4).
          'preset.data': (data) => this._handleMessage({ action: 'preset.data', data }),
          'bank.data': (data) => this._handleMessage({ action: 'bank.data', data }),
          'preset.written': (data) => this._handleMessage({ action: 'preset.written', data }),
          'bank.written': (data) => this._handleMessage({ action: 'bank.written', data }),
          'preset.captured': (data) => this._handleMessage({ action: 'preset.captured', data }),
          'preset.error': (data) => this._handleMessage({ action: 'preset.error', data })
        };
        for (const [event, handler] of Object.entries(this._parentBridgeHandlers)) {
          parentBridge.on(event, handler);
        }
      }
      console.log('[Bridge] Plugin Host bridge connected');
    } else if (juceBackend && typeof juceBackend.addEventListener === 'function' &&
        typeof juceBackend.emitEvent === 'function') {
      this.type = 'juce';
      this._juceEventId = 'abdBankManagerMessage';
      this._boundJuceHandler = (message) => this._handleMessage(message);
      juceBackend.addEventListener(this._juceEventId, this._boundJuceHandler);
      this.connected = true;
      console.log('[Bridge] JUCE WebBrowserComponent connected');
    } else if (window.chrome && window.chrome.webview) {
      this.type = 'webview2';
      this._boundWebViewHandler = (e) => this._handleMessage(e.data);
      window.chrome.webview.addEventListener('message', this._boundWebViewHandler);
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

      case 'hostModel':
        this._emit('hostModel', payload);
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

      // Canal MIDI de hardware. El payload se toma de `msg.data` en crudo: el
      // `payload` genérico de arriba solo acepta objetos, y aquí hay números
      // (`hardware.sent`) y cadenas (`hardware.error`) que se perderían.
      case 'hardware.receive':
      case 'hardware.listen.ack':
      case 'hardware.sent':
      case 'hardware.ports':
        this._emit(msg.action, msg.data);
        break;

      case 'hardware.error':
        this._emit('hardware.error', typeof msg.data === 'string'
          ? msg.data
          : String(msg.data?.message ?? msg.data ?? ''));
        break;

      // Transporte de software. Se reemite `msg.data` en crudo porque no siempre es
      // un objeto: `preset.error` puede traer `{ code, message }` y las respuestas de
      // escritura, solo un contador. `softwareTransport` normaliza el motivo.
      case 'preset.data':
      case 'bank.data':
      case 'preset.written':
      case 'bank.written':
      case 'preset.captured':
      case 'preset.error':
        this._emit(msg.action, msg.data ?? payload);
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

  /**
   * Clean up all event listeners and resources.
   * Call this when the bridge is no longer needed (e.g., page unload).
   */
  destroy() {
    // Remove JUCE event listener
    if (this.type === 'juce' && window.__JUCE__?.backend && this._boundJuceHandler) {
      window.__JUCE__.backend.removeEventListener(this._juceEventId, this._boundJuceHandler);
      this._boundJuceHandler = null;
    }

    // Remove WebView2 event listener
    if (this.type === 'webview2' && window.chrome?.webview && this._boundWebViewHandler) {
      window.chrome.webview.removeEventListener('message', this._boundWebViewHandler);
      this._boundWebViewHandler = null;
    }

    // Remove plugin-host bridge handlers
    if (this.type === 'plugin-host' && this._parentBridge && this._parentBridgeHandlers) {
      if (typeof this._parentBridge.off === 'function') {
        for (const [event, handler] of Object.entries(this._parentBridgeHandlers)) {
          this._parentBridge.off(event, handler);
        }
      }
      this._parentBridgeHandlers = null;
    }

    // Clear all internal listeners
    this.listeners.clear();

    this.connected = false;
    this.type = 'mock';
    console.log('[Bridge] Destroyed, all listeners cleaned up');
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

// Clean up on page unload (guard also covers minimal window shims in tests
// and embedded hosts that lack addEventListener)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    bridge.destroy();
  });
}
