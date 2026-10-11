/**
 * Transporte de software: el synth que hospeda al Bank Manager habla los mismos
 * cuatro verbos que un equipo físico, así que `app.js` no cambia.
 *
 * Lo que se fija aquí es el contrato del cable (acciones, payload en base64
 * estándar, `requestId` y `preset.error`) y la adopción gradual: un host que solo
 * implemente `preset.read` sigue funcionando porque `fetchAll` cae al verbo por
 * slot cuando contesta `unsupported-action`.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// El módulo importa el singleton del bridge (que necesita `window` al evaluarse),
// así que se carga después de montar el shim — igual que el resto de tests del
// bridge. El transporte se prueba siempre con un bridge inyectado.
let createSoftwareTransport;
let isUnsupportedAction;

beforeAll(async () => {
  globalThis.window = {};
  globalThis.document = { contains: () => false };
  ({ createSoftwareTransport, isUnsupportedAction } = await import('../../src/bridge/softwareTransport.js'));
});

/** `parentBridge` falso con el mínimo contrato que usa el transporte. */
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
    send(action, data) { sent.push({ action, data }); },
    emit(action, data) { handlers.get(action)?.forEach(cb => cb(data)); },
    handlersOf(action) { return handlers.get(action)?.size ?? 0; },
    lastSent(action) { return [...sent].reverse().find(message => message.action === action); },
    countSent(action) { return sent.filter(message => message.action === action).length; },
  };
}

const toBase64 = bytes => Buffer.from(bytes).toString('base64');
const fromBase64 = text => new Uint8Array(Buffer.from(text, 'base64'));

const contract = {
  modelId: 'abd-sm002',
  displayName: 'ABD MS 2000 (SM002)',
  bankCapacity: 3,
  dumpTimeoutMs: 60,
  interMessageDelayMs: 0,
  transport: {
    software: { systems: ['sysex', 'native'], read: true, write: true, audition: true, capture: true },
  },
};

const nativeOnly = {
  ...contract,
  transport: { software: { systems: ['native'], read: true, write: true } },
};

let bridge;

describe('creación del transporte de software', () => {
  beforeEach(() => { bridge = makeBridge(); });

  it('un contrato sin extremo de software se rechaza con motivo', () => {
    expect(() => createSoftwareTransport({ contract: { modelId: 'x' }, bridgeManager: bridge }))
      .toThrow(/declares no software transport/);
  });

  it('con dos sistemas de presets hay que elegir (no son intercambiables)', () => {
    expect(() => createSoftwareTransport({ contract, bridgeManager: bridge }))
      .toThrow(/pick one/);

    const transport = createSoftwareTransport({ contract, bridgeManager: bridge, system: 'native' });
    expect(transport.system).toBe('native');
  });

  it('con un solo sistema se resuelve solo y publica sus capacidades', () => {
    const transport = createSoftwareTransport({ contract: nativeOnly, bridgeManager: bridge });

    expect(transport.system).toBe('native');
    // `softsynth`/`confirm` son lo que habilita esperar el acuse al escribir (ver el
    // bloque «acuse de escritura»), y `modelId` identifica al destino del transporte.
    expect(transport.capabilities).toEqual({
      fetch: true, send: true, bulk: true,
      softsynth: true, confirm: true, modelId: 'abd-sm002',
    });
  });
});

describe('lectura de presets', () => {
  let transport;

  beforeEach(() => {
    bridge = makeBridge();
    transport = createSoftwareTransport({ contract, bridgeManager: bridge, system: 'sysex' });
  });

  it('fetchPatch manda preset.read y resuelve el payload en bytes', async () => {
    const pending = transport.fetchPatch(4);

    const sent = bridge.lastSent('preset.read');
    expect(sent.data).toMatchObject({ system: 'sysex', slot: 4 });
    expect(typeof sent.data.requestId).toBe('string');

    const bytes = new Uint8Array([0xF0, 0x42, 0x3A, 0xF7]);
    bridge.emit('preset.data', { requestId: sent.data.requestId, slot: 4, name: 'Bass', payload: toBase64(bytes) });

    const patch = await pending;
    expect(Array.from(patch.rawData)).toEqual(Array.from(bytes));
    expect(patch).toMatchObject({ slot: 4, name: 'Bass' });
  });

  it('sin respuesta, la petición caduca con un motivo claro', async () => {
    await expect(transport.fetchPatch(0)).rejects.toThrow(/timed out after 60 ms/);
  });

  it('preset.error rechaza la petición viva y marca las acciones desconocidas', async () => {
    const pending = transport.fetchPatch(1);
    const { requestId } = bridge.lastSent('preset.read').data;

    bridge.emit('preset.error', { requestId, message: 'nope' });
    await expect(pending).rejects.toThrow('nope');

    const unsupported = transport.fetchPatch(2);
    bridge.emit('preset.error', {
      requestId: bridge.lastSent('preset.read').data.requestId,
      code: 'unsupported-action',
    });
    await expect(unsupported).rejects.toMatchObject({ unsupportedAction: true });
  });

  it('fetchAll usa bank.read y devuelve los slots en orden', async () => {
    const pending = transport.fetchAll();
    const { requestId } = bridge.lastSent('bank.read').data;

    bridge.emit('bank.data', {
      requestId,
      slots: [
        { slot: 0, name: 'A', payload: toBase64([1, 2]) },
        { slot: 1, name: 'B', payload: toBase64([3]) },
      ],
    });

    const patches = await pending;
    expect(patches.map(p => p.slot)).toEqual([0, 1]);
    expect(patches.map(p => p.name)).toEqual(['A', 'B']);
    expect(Array.from(patches[0].rawData)).toEqual([1, 2]);
  });

  it('un host sin bank.read cae al verbo por slot (adopción gradual)', async () => {
    const pending = transport.fetchAll();
    bridge.emit('preset.error', {
      requestId: bridge.lastSent('bank.read').data.requestId,
      code: 'unsupported-action',
    });

    // El fallback pide los slots uno a uno; se contestan en orden. Cada vuelta
    // necesita ceder el turno para que el bucle pida el siguiente slot.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let slot = 0; slot < 3; slot++) {
      const sent = bridge.lastSent('preset.read');
      expect(sent.data.slot).toBe(slot);
      bridge.emit('preset.data', { requestId: sent.data.requestId, slot, payload: toBase64([slot]) });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const patches = await pending;
    expect(patches.map(p => p.slot)).toEqual([0, 1, 2]);
  });

  it('si bank.read falla por otro motivo no se piden 128 slots', async () => {
    const pending = transport.fetchAll();
    bridge.emit('preset.error', { requestId: bridge.lastSent('bank.read').data.requestId, message: 'busy' });

    await expect(pending).rejects.toThrow('busy');
    expect(bridge.countSent('preset.read')).toBe(0);
  });
});

describe('escritura de presets en el host', () => {
  let transport;
  const errors = [];

  beforeEach(() => {
    bridge = makeBridge();
    errors.length = 0;
    transport = createSoftwareTransport({
      contract, bridgeManager: bridge, system: 'native', onError: message => errors.push(message),
    });
  });

  it('sendPatch manda preset.write con el payload en base64 estándar', () => {
    transport.sendPatch({ rawData: new Uint8Array([0xAA, 0xBB]), name: 'Lead' }, 7);

    const { data } = bridge.lastSent('preset.write');
    expect(data).toMatchObject({ system: 'native', slot: 7, name: 'Lead' });
    // Base64 estándar: lo que `atob()` del WebUI entiende.
    expect(data.payload).toBe(toBase64([0xAA, 0xBB]));
    expect(Array.from(fromBase64(data.payload))).toEqual([0xAA, 0xBB]);
  });

  it('sendBulk manda bank.write con todos los slots', () => {
    transport.sendBulk([
      { rawData: new Uint8Array([1]), slot: 0 },
      { rawData: new Uint8Array([2]), slot: 1 },
    ]);

    const { data } = bridge.lastSent('bank.write');
    expect(data.slots).toHaveLength(2);
    expect(data.slots[1]).toMatchObject({ slot: 1, payload: toBase64([2]) });
  });

  it('un host sin bank.write recibe el banco slot a slot', async () => {
    transport.sendBulk([{ rawData: new Uint8Array([1]), slot: 0 }, { rawData: new Uint8Array([2]), slot: 1 }]);
    bridge.emit('preset.error', {
      requestId: bridge.lastSent('bank.write').data.requestId,
      message: 'unknown action bank.write',
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(bridge.countSent('preset.write')).toBe(2);
    expect(errors).toEqual([]); // el fallback no es un error para el usuario
  });

  it('un fallo de escritura se reporta sin dejar una promesa suelta', async () => {
    transport.sendPatch({ rawData: new Uint8Array([1]) }, 0);
    bridge.emit('preset.error', {
      requestId: bridge.lastSent('preset.write').data.requestId,
      message: 'slot out of range',
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errors).toEqual(['slot out of range']);
  });
});

describe('captura y cierre', () => {
  let transport;

  beforeEach(() => {
    bridge = makeBridge();
    transport = createSoftwareTransport({ contract, bridgeManager: bridge, system: 'sysex' });
  });

  it('capture pide preset.capture y devuelve el preset activo', async () => {
    const pending = transport.capture();
    const { requestId } = bridge.lastSent('preset.capture').data;

    bridge.emit('preset.captured', { requestId, slot: 3, name: 'Active', payload: toBase64([9, 9]) });

    const captured = await pending;
    expect(captured).toMatchObject({ slot: 3, name: 'Active' });
    expect(Array.from(captured.rawData)).toEqual([9, 9]);
  });

  it('close deja de escuchar y rechaza lo pendiente', async () => {
    const pending = transport.fetchPatch(0);
    expect(bridge.handlersOf('preset.data')).toBe(1);

    transport.close();
    expect(bridge.handlersOf('preset.data')).toBe(0);
    await expect(pending).rejects.toThrow('transport closed');
  });

  it('una respuesta sin requestId resuelve la petición más antigua de su tipo', async () => {
    const pending = transport.fetchPatch(5);
    // Host que no echa el requestId: es más viejo que el contrato, pero funciona.
    bridge.emit('preset.data', { slot: 5, payload: toBase64([7]) });

    await expect(pending).resolves.toMatchObject({ slot: 5 });
  });
});

describe('programData (nombre histórico del preset del anfitrión)', () => {
  let transport;

  beforeEach(() => {
    bridge = makeBridge();
    transport = createSoftwareTransport({ contract, bridgeManager: bridge, system: 'native' });
  });

  it('responde a la lectura pendiente en vez de quedarse sin consumidor', async () => {
    const pending = transport.fetchPatch(2);

    bridge.emit('programData', { slot: 2, name: 'Legacy', payload: toBase64([4, 5]) });

    const patch = await pending;
    expect(patch).toMatchObject({ slot: 2, name: 'Legacy' });
    expect(Array.from(patch.rawData)).toEqual([4, 5]);
  });

  it('sin petición viva avisa en vez de tragárselo en silencio', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridge.emit('programData', { payload: toBase64([1]) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no pending request'), expect.anything());
    warn.mockRestore();
  });
});

describe('detección de acciones desconocidas', () => {
  it('reconoce el código y los mensajes habituales', () => {
    expect(isUnsupportedAction({ code: 'unsupported-action' })).toBe(true);
    expect(isUnsupportedAction({ code: 'unknown-action' })).toBe(true);
    expect(isUnsupportedAction({ message: 'Not implemented yet' })).toBe(true);
    expect(isUnsupportedAction({ message: 'busy' })).toBe(false);
    expect(isUnsupportedAction({})).toBe(false);
  });
});

describe('acuse de escritura (confirm)', () => {
  let transport;
  const errors = [];

  beforeEach(() => {
    bridge = makeBridge();
    errors.length = 0;
    transport = createSoftwareTransport({
      contract, bridgeManager: bridge, system: 'native', onError: message => errors.push(message),
    });
  });

  it('declara que es el synth de software y que acusa recibo', () => {
    // Sin estas dos banderas la UI nunca esperaba el acuse: la rama de confirmación
    // —que existe justo para este destino— quedaba muerta y una escritura rechazada se
    // anunciaba igual como «enviado».
    expect(transport.capabilities.softsynth).toBe(true);
    expect(transport.capabilities.confirm).toBe(true);
    expect(transport.capabilities.modelId).toBe(contract.modelId);
  });

  it('sendPatch sin confirm sigue siendo dispara y olvida (devuelve el retardo)', () => {
    const result = transport.sendPatch({ rawData: new Uint8Array([1]) }, 3);

    expect(typeof result).toBe('number');
    expect(bridge.countSent('preset.write')).toBe(1);
  });

  it('sendPatch con confirm devuelve la promesa del acuse y resuelve con preset.written', async () => {
    const request = { rawData: new Uint8Array([9, 9]), name: 'Lead' };
    const pending = transport.sendPatch(request, 5, 1, { confirm: true });

    expect(typeof pending?.then).toBe('function');
    let settled = false;
    const observed = pending.then(value => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false); // no se da por enviado hasta que el host contesta

    const { requestId } = bridge.lastSent('preset.write').data;
    bridge.emit('preset.written', { requestId, slot: 5, name: 'Lead' });

    const written = await observed;
    expect(settled).toBe(true);
    expect(written).toMatchObject({ slot: 5, name: 'Lead' });
    expect(errors).toEqual([]);
  });

  it('un rechazo del host rechaza la promesa en vez de dejar un «enviado» falso', async () => {
    const pending = transport.sendPatch({ rawData: new Uint8Array([1]) }, 9, 1, { confirm: true });

    bridge.emit('preset.error', {
      requestId: bridge.lastSent('preset.write').data.requestId,
      message: 'slot 9 is outside the synth memory',
    });

    await expect(pending).rejects.toThrow('slot 9 is outside the synth memory');
    expect(errors).toEqual([]); // el error viaja por la promesa, no duplicado por onError
  });

  it('sin respuesta el acuse caduca con un motivo claro', async () => {
    const pending = transport.sendPatch({ rawData: new Uint8Array([1]) }, 2, 1, { confirm: true });

    await expect(pending).rejects.toThrow(/preset\.write timed out after 60 ms/);
  });

  it('sendBulk con confirm espera al bank.written del lote entero', async () => {
    const pending = transport.sendBulk([
      { rawData: new Uint8Array([1]), slot: 0 },
      { rawData: new Uint8Array([2]), slot: 1 },
    ], 1, { confirm: true });

    const { requestId } = bridge.lastSent('bank.write').data;
    bridge.emit('bank.written', { requestId, count: 2 });

    await expect(pending).resolves.toMatchObject({ count: 2 });
    expect(bridge.countSent('preset.write')).toBe(0);
  });

  it('un host sin bank.write confirma el lote slot a slot, no antes de terminar', async () => {
    const answered = [];
    const live = createSoftwareTransport({
      contract,
      system: 'native',
      bridgeManager: {
        ...bridge,
        send(action, data) {
          bridge.send(action, data);
          if (action === 'preset.write') answered.push(data.requestId);
        },
        on: bridge.on,
        emit: bridge.emit,
      },
    });

    const pending = live.sendBulk([{ rawData: new Uint8Array([1]), slot: 0 }, { rawData: new Uint8Array([2]), slot: 1 }], 1, { confirm: true });
    bridge.emit('preset.error', {
      requestId: bridge.lastSent('bank.write').data.requestId,
      code: 'unsupported-action',
      message: 'unknown action bank.write',
    });
    await Promise.resolve();

    expect(bridge.countSent('preset.write')).toBe(2);
    let settled = false;
    const observed = pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false); // aún sin confirmar los dos slots

    for (const requestId of answered) bridge.emit('preset.written', { requestId });
    await observed;
    expect(settled).toBe(true);
  });
});
