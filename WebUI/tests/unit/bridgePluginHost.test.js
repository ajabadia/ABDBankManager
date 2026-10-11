/**
 * Camino plugin-host del bridge (`parentBridge.on(...)`).
 *
 * Cuando la WebUI corre embebida en el host (iframe/parent) no pasa por
 * `_handleMessage` como en JUCE/WebView2, sino que BridgeManager se suscribe con
 * `parentBridge.on(accion, cb)`. Este archivo cubre la acción `hostModel` por ese
 * transporte, además del caso `_handleMessage` ya cubierto en hostContextBridge.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TOTAL = 22;

let host;
let bridge;
let initHostContext;
let renderModelSelector;
let createSoftwareTransport;
let unsubscribe = null;

/** Contenedores que el fake `document.contains` considera montados. */
const mounted = new Set();

/** parentBridge falso con el mínimo contrato que usa BridgeManager. */
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
      return [...sent].reverse().find((message) => message.action === action);
    },
    /** Simula una emisión desde el host hacia la WebUI. */
    emit(action, data) {
      handlers.get(action)?.forEach((cb) => cb(data));
    },
    handlerCount(action) {
      return handlers.get(action)?.size ?? 0;
    }
  };
}

function makeContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function renderedIds(container) {
  return [...container.innerHTML.matchAll(/data-model-id="([^"]+)"/g)].map((m) => m[1]);
}

describe('BridgeManager en modo plugin-host', () => {
  beforeEach(async () => {
    vi.resetModules(); // asegura una instancia nueva del singleton con el window de este test
    host = makeParentBridge();
    globalThis.window = { __synthBridge: host };
    globalThis.document = { contains: (el) => mounted.has(el) };
    mounted.clear();

    ({ bridge } = await import('../../src/bridge/bridgeManager.js'));
    ({ initHostContext } = await import('../../src/core/hostContext.js'));
    ({ renderModelSelector } = await import('../../src/ui/components/modelSelector.js'));
    ({ createSoftwareTransport } = await import('../../src/bridge/softwareTransport.js'));
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    delete globalThis.window;
    delete globalThis.document;
  });

  it('detecta el host y se suscribe a hostModel por parentBridge.on', () => {
    expect(bridge.type).toBe('plugin-host');
    expect(bridge.connected).toBe(true);
    expect(host.handlerCount('hostModel')).toBe(1);
  });

  it('filtra el selector cuando el host emite hostModel', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });
    expect(renderedIds(container)).toHaveLength(TOTAL);

    unsubscribe = initHostContext(bridge);
    host.emit('hostModel', { modelId: 'abd-sm002' });

    const ids = renderedIds(container);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['abd-sm002', 'korg-ms2000', 'korg-microkorg']));
    expect(container.innerHTML).not.toContain('data-model-id="roland-juno106"');
  });

  it('ignora los hostModel sin modelId', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });

    unsubscribe = initHostContext(bridge);
    host.emit('hostModel', {});
    host.emit('hostModel', { modelId: '' });

    expect(renderedIds(container)).toHaveLength(TOTAL);
  });

  it('se suscribe y reenvía las respuestas del transporte de software', () => {
    // Sin estas suscripciones el transporte solo podía morir por timeout: el
    // anfitrión contesta por `parentBridge`, no por `_handleMessage`.
    const replies = ['preset.data', 'bank.data', 'preset.written', 'bank.written', 'preset.captured', 'preset.error'];
    for (const action of replies) expect(host.handlerCount(action)).toBe(1);

    const seen = [];
    for (const action of replies) bridge.on(action, (data) => seen.push({ action, data }));

    host.emit('preset.data', { requestId: 'r1', slot: 2, payload: 'AAAA' });
    host.emit('bank.written', 128);
    host.emit('preset.error', 'no device');

    expect(seen).toEqual([
      { action: 'preset.data', data: { requestId: 'r1', slot: 2, payload: 'AAAA' } },
      { action: 'bank.written', data: 128 },
      { action: 'preset.error', data: 'no device' }
    ]);
  });

  it('un fetch del transporte de software se resuelve con la respuesta del host', async () => {
    const contract = {
      modelId: 'abd-sm002',
      displayName: 'ABD MS 2000 (SM002)',
      bankCapacity: 2,
      dumpTimeoutMs: 200,
      interMessageDelayMs: 0,
      transport: { software: { systems: ['native'], read: true, write: true, capture: true } }
    };
    const transport = createSoftwareTransport({ contract });

    const pending = transport.fetchPatch(1);
    const request = host.lastSent('preset.read');
    expect(request.data).toMatchObject({ system: 'native', slot: 1 });

    host.emit('preset.data', {
      requestId: request.data.requestId,
      slot: 1,
      name: 'From the host',
      payload: Buffer.from([0xAA, 0xBB]).toString('base64')
    });

    const patch = await pending;
    expect(patch).toMatchObject({ slot: 1, name: 'From the host' });
    expect(Array.from(patch.rawData)).toEqual([0xAA, 0xBB]);
    transport.close();
  });

  it('destroy() da de baja el handler del host y deja de aplicar contexto', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: 'abd-sm002' });
    expect(renderedIds(container)).toHaveLength(3);

    unsubscribe = initHostContext(bridge);
    expect(host.handlerCount('hostModel')).toBe(1);

    bridge.destroy();

    expect(host.handlerCount('hostModel')).toBe(0);
    expect(bridge.listeners.size).toBe(0);

    host.emit('hostModel', { modelId: 'roland-juno106' });

    expect(renderedIds(container)).toHaveLength(3); // contexto anterior intacto
  });
});
