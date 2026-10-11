/**
 * Contrato iframe/__synthBridge entre BankManagerModal y bridgeManager.
 *
 * Cadena real de integración:
 *   1. El synth (página host) instancia `new BankManagerModal({ synthBridge })`
 *      y el modal publica ese objeto como `window.__synthBridge` del host.
 *   2. La WebUI bancaria corre dentro del `<iframe>` del modal y su
 *      BridgeManager lo descubre con `window.parent.__synthBridge`
 *      → `type = 'plugin-host'`.
 *   3. Ida y vuelta: `bridge.send(...)` llega al host y las emisiones del
 *      host (`hostModel`, …) llegan a los listeners de la WebUI.
 *
 * Por qué hace falta este fichero:
 *  - `bridgePluginHost.test.js` cubre el bridge leyendo `window.__synthBridge`
 *    en la MISMA ventana (caso host directo), no el caso iframe parent→child.
 *  - `drift.test.js` solo compara bytes de las copias del modal y sus
 *    invariantes de foco; nunca lo instancia ni verifica que publique el
 *    puente.
 * Las dos copias del modal son byte-identicas (garantizado por drift.test.js),
 * asi que probar la copia de `WebUI/src/components` cubre tambien la canonica
 * de `packages/ui/src`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BankManagerModal } from '../../src/components/BankManagerModal.js';

/** parentBridge falso con el minimo contrato que usa BridgeManager. */
function makeParentBridge() {
  const handlers = new Map();
  const sent = [];
  return {
    sent,
    on(action, cb) {
      if (!handlers.has(action)) handlers.set(action, new Set());
      handlers.get(action).add(cb);
    },
    off(action, cb) {
      handlers.get(action)?.delete(cb);
    },
    send(action, data) {
      sent.push({ action, data });
    },
    lastSent(action) {
      return [...sent].reverse().find((m) => m.action === action);
    },
    emit(action, data) {
      handlers.get(action)?.forEach((cb) => cb(data));
    },
    handlerCount(action) {
      return handlers.get(action)?.size ?? 0;
    },
  };
}

/** Elemento shim: suficiente para que el constructor del modal monte su DOM. */
function makeElement(tag = 'div') {
  const el = {
    tagName: tag,
    className: '',
    id: '',
    hidden: false,
    innerHTML: '',
    children: [],
    listeners: {},
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    removeEventListener() {},
    focus() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains: () => false,
    },
    // El header/iframe del modal se buscan por selector: un stub memoizado
    // por selector basta (no se abre el modal en estos tests).
    querySelector(sel) {
      this._q ??= new Map();
      if (!this._q.has(sel)) this._q.set(sel, makeElement(`stub:${sel}`));
      return this._q.get(sel);
    },
    querySelectorAll: () => [],
  };
  return el;
}

function makeDocument() {
  return {
    body: makeElement('body'),
    getElementById: () => null,
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
    removeEventListener() {},
  };
}

let hostWindow; // pagina del synth (donde vive el modal)
let hostBridge; // puente que el synth pasa al modal
let childWindow; // window dentro del iframe

beforeEach(() => {
  vi.resetModules(); // instancia fresca del singleton con el window de este test
  hostBridge = makeParentBridge();
  hostWindow = {};
  globalThis.document = makeDocument();
  globalThis.window = hostWindow; // arrancamos en la pagina del host
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  childWindow = undefined;
});

describe('Contrato iframe/__synthBridge: modal (host) → bridge (iframe)', () => {
  it('el modal publica el synthBridge en window.__synthBridge del host', () => {
    const modal = new BankManagerModal({ synthBridge: hostBridge });

    expect(hostWindow.__synthBridge).toBe(hostBridge);
    expect(modal.synthBridge).toBe(hostBridge);
    expect(modal.isOpen).toBe(false);
  });

  it('sin synthBridge el modal no inventa un puente global', () => {
    new BankManagerModal({});
    expect(hostWindow.__synthBridge).toBeUndefined();
  });

  it('una segunda instancia no pisa el puente ya publicado', () => {
    new BankManagerModal({ synthBridge: hostBridge });
    const rival = { tag: 'otro-puente' };
    new BankManagerModal({ synthBridge: rival });

    expect(hostWindow.__synthBridge).toBe(hostBridge);
  });

  it('el iframe descubre el puente del padre y entra en plugin-host con ida y vuelta', async () => {
    // Lado host: el modal publica el puente como haría la WebUI del synth.
    new BankManagerModal({ synthBridge: hostBridge });

    // Lado iframe: la ventana del hijo NO tiene puente propio, solo el padre.
    childWindow = { parent: hostWindow };
    globalThis.window = childWindow;
    const { bridge } = await import('../../src/bridge/bridgeManager.js');

    // Descubrimiento a traves de la frontera del iframe.
    expect(bridge.type).toBe('plugin-host');
    expect(bridge.connected).toBe(true);
    expect(bridge._parentBridge).toBe(hostBridge);
    expect(hostBridge.handlerCount('hostModel')).toBe(1);

    // WebUI → host: el send viaja por parentBridge.send.
    bridge.send('preset.read', { slot: 3 });
    expect(hostBridge.lastSent('preset.read')).toEqual({
      action: 'preset.read',
      data: { slot: 3 },
    });

    // Host → WebUI: la emision del host llega a los listeners de la WebUI.
    const seen = [];
    bridge.on('hostModel', (data) => seen.push(data));
    hostBridge.emit('hostModel', { modelId: 'abd-sm002' });
    expect(seen).toEqual([{ modelId: 'abd-sm002' }]);

    // Limpieza: destroy da de baja las suscripciones en el host.
    bridge.destroy();
    expect(hostBridge.handlerCount('hostModel')).toBe(0);
    expect(bridge.listeners.size).toBe(0);
  });

  it('un iframe cuyo padre no tiene puente cae a mock (no inventa plugin-host)', async () => {
    globalThis.window = { parent: {} };
    const { bridge } = await import('../../src/bridge/bridgeManager.js');

    expect(bridge.type).toBe('mock');
    expect(bridge.connected).toBe(false);
    expect(hostBridge.handlerCount('hostModel')).toBe(0);
  });
});
