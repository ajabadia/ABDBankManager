/**
 * Handshake `requestHostInfo` → `hostInfo`.
 *
 * El catálogo embebido se bloquea cuando el host no anuncia su modelo. Antes, el
 * aviso solo podía insinuar «reinicia el plugin»; con la ficha del host se puede
 * decir **qué** build está al otro lado y si el canal nativo → JS está vivo:
 *  - la ficha (`hostInfo`) trae identidad + sello de build + nivel de puente, y
 *  - haber recibido cualquier mensaje del host (`state`, `syncAllParams`…) prueba
 *    que el canal funciona, aunque no anuncie su modelo.
 *
 * Regresión cubierta: el sello del host se leía como `buildId` mientras el C++
 * lo emite como `buildRevision` (y el anuncio `hostModel` también lo lleva, así
 * que perdía el sello quien no respondiera al handshake).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initHostContext,
  requestHostInfo,
  getHostInfo,
  wasHostAnswered,
  onHostInfoChange,
  normalizeHostInfo,
  resetHostContextForTests,
  HOST_INFO_ACTION,
  HOST_INFO_REQUEST_ACTION
} from '../../src/core/hostContext.js';

/** Bridge falso: registra handlers y lo enviado. */
function makeBridge() {
  const handlers = new Map();
  const sent = [];
  return {
    sent,
    on(action, cb) {
      if (!handlers.has(action)) handlers.set(action, new Set());
      handlers.get(action).add(cb);
      return () => handlers.get(action)?.delete(cb);
    },
    send(action, data) {
      sent.push({ action, data });
    },
    emit(action, data) {
      handlers.get(action)?.forEach(cb => cb(data));
    },
    handlerCount(action) {
      return handlers.get(action)?.size ?? 0;
    }
  };
}

const HOST_INFO_PAYLOAD = {
  modelId: 'abd-sm002',
  displayName: 'ABD MS2000 (SM002)',
  manufacturer: 'ABDSynths',
  protocol: 4,
  buildStamp: 'Sep 12 2026 11:41:00',
  buildRevision: '5b7d69ce9'
};

describe('handshake de la ficha del host', () => {
  let bridge;
  let context;
  let unsubscribe;

  beforeEach(() => {
    resetHostContextForTests();
    bridge = makeBridge();
    context = [];
    unsubscribe = initHostContext(bridge, modelId => context.push(modelId));
  });

  it('pide la ficha con su propia acción (no reutiliza el anuncio)', () => {
    requestHostInfo(bridge);

    expect(bridge.sent).toEqual([{ action: HOST_INFO_REQUEST_ACTION, data: {} }]);
    expect(HOST_INFO_REQUEST_ACTION).not.toBe('hostModel');
  });

  it('adopta identidad, sello y nivel de puente de la ficha', () => {
    bridge.emit(HOST_INFO_ACTION, HOST_INFO_PAYLOAD);

    const info = getHostInfo();
    expect(info.modelId).toBe('abd-sm002');
    expect(info.protocol).toBe(4);
    expect(info.buildStamp).toBe('Sep 12 2026 11:41:00');
    // El C++ lo llama `buildRevision`: no perdérselo por el nombre.
    expect(info.buildRevision).toBe('5b7d69ce9');
    expect(context).toEqual(['abd-sm002']);
  });

  it('acepta `buildId` como alias de la revisión', () => {
    bridge.emit(HOST_INFO_ACTION, { modelId: 'abd-sm002', buildId: 'abc123' });

    expect(getHostInfo().buildRevision).toBe('abc123');
  });

  it('el anuncio también deja el sello disponible', () => {
    bridge.emit('hostModel', HOST_INFO_PAYLOAD);

    expect(context).toEqual(['abd-sm002']);
    expect(getHostInfo().buildStamp).toBe('Sep 12 2026 11:41:00');
    expect(getHostInfo().protocol).toBe(4);
  });

  it('saber que el host contesta distingue un build antiguo de un host mudo', () => {
    expect(wasHostAnswered()).toBe(false);

    // El canal nativo → JS funciona (contrato de parámetros), pero el host no se
    // identifica: build anterior al anuncio.
    bridge.emit('syncAllParams', { cutoff: 0.5 });
    expect(wasHostAnswered()).toBe(true);
    expect(getHostInfo()).toBeNull();
  });

  it('avisa de la ficha nueva por callback y por suscriptor', () => {
    unsubscribe(); // deja solo la suscripción de este test

    const seen = [];
    const off = onHostInfoChange(info => seen.push(info));
    const viaCallback = initHostContext(bridge, () => {}, info => seen.push(info));

    bridge.emit(HOST_INFO_ACTION, HOST_INFO_PAYLOAD);

    expect(seen).toHaveLength(2);
    expect(seen.every(info => info.buildStamp === 'Sep 12 2026 11:41:00')).toBe(true);

    off();
    viaCallback();
    expect(bridge.handlerCount(HOST_INFO_ACTION)).toBe(0);
  });

  it('un payload inservible no pisa la ficha buena ni el contexto', () => {
    bridge.emit(HOST_INFO_ACTION, HOST_INFO_PAYLOAD);
    bridge.emit(HOST_INFO_ACTION, 'no soy un objeto');

    expect(getHostInfo().modelId).toBe('abd-sm002');
    expect(context).toEqual(['abd-sm002']);
  });

  it('normaliza lo que falta sin inventar campos', () => {
    expect(normalizeHostInfo('x')).toBeNull();
    expect(normalizeHostInfo({})).toBeNull();

    const partial = normalizeHostInfo({ protocol: '3' });
    expect(partial.protocol).toBe(3);
    expect(partial.modelId).toBeNull();
    expect(partial.buildStamp).toBeNull();
  });

  it('al desuscribirse deja de mirar al host', () => {
    unsubscribe();

    expect(bridge.handlerCount(HOST_INFO_ACTION)).toBe(0);
    expect(bridge.handlerCount('hostModel')).toBe(0);
    expect(bridge.handlerCount('syncAllParams')).toBe(0);
  });
});
