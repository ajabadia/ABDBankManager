/**
 * Canal MIDI de hardware en modo plugin-host.
 *
 * Dentro del plugin el Bank Manager no puede abrir MIDI: pide los puertos al
 * anfitrión por el bridge (`hardware.listen` / `hardware.send`) y este contesta
 * con bytes (`hardware.receive`), el acuse (`hardware.listen.ack`), el recuento
 * enviado (`hardware.sent`) o el motivo (`hardware.error`).
 *
 * Regresión cubierta: `BridgeManager` solo reenviaba cuatro eventos del padre
 * (`state`, `programData`, `paramChange`, `hostModel`), así que el canal de
 * hardware se quedaba en el limbo: el `hardware.receive` del anfitrión no llegaba
 * a `hardwareMidi.js` y un fetch por el puente no podía completarse nunca.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let host;
let bridge;

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
    /** Simula una emisión desde el anfitrión hacia la WebUI. */
    emit(action, data) {
      handlers.get(action)?.forEach((cb) => cb(data));
    },
    handlerCount(action) {
      return handlers.get(action)?.size ?? 0;
    }
  };
}

const HARDWARE_EVENTS = ['hardware.receive', 'hardware.listen.ack', 'hardware.sent', 'hardware.ports', 'hardware.error'];

describe('canal MIDI de hardware en modo plugin-host', () => {
  beforeEach(async () => {
    vi.resetModules(); // instancia nueva del singleton con el window de este test
    host = makeParentBridge();
    globalThis.window = { __synthBridge: host };
    globalThis.document = { contains: () => false };

    ({ bridge } = await import('../../src/bridge/bridgeManager.js'));
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  it('se suscribe a todo el canal de hardware del anfitrión', () => {
    expect(bridge.type).toBe('plugin-host');
    for (const event of HARDWARE_EVENTS) {
      expect(host.handlerCount(event)).toBe(1);
    }
  });

  it('pide los puertos al anfitrión al crear la sesión', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');
    const { input, output } = createBridgeMidiPorts();

    expect(input.id).toBe('bridge-midi-in');
    expect(output.id).toBe('bridge-midi-out');
    expect(host.sent.map(s => s.action)).toContain('hardware.listen');
  });

  it('entrega bytes, acuse, envío y error a la sesión', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');

    const statuses = [];
    const received = [];
    const { input } = createBridgeMidiPorts({ onStatus: s => statuses.push(s) });
    input.addEventListener('midimessage', e => received.push([...e.data]));

    const payload = btoa(String.fromCharCode(0xF0, 0x7D, 0xF7));
    host.emit('hardware.listen.ack', { listening: true, device: 'Korg MS2000' });
    host.emit('hardware.receive', { payload, size: 3 });
    host.emit('hardware.sent', 6);
    host.emit('hardware.error', 'No MIDI output device available for the hardware transfer');

    expect(received).toEqual([[0xF0, 0x7D, 0xF7]]);
    expect(statuses).toEqual([
      { type: 'ack', listening: true, device: 'Korg MS2000' },
      { type: 'sent', bytes: 6 },
      { type: 'error', message: 'No MIDI output device available for the hardware transfer' }
    ]);
  });

  it('reenvía la enumeración de puertos del anfitrión', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');
    const statuses = [];
    createBridgeMidiPorts({ onStatus: s => statuses.push(s) });

    const ports = {
      outputs: [{ identifier: 'out-1', name: 'MIDI Out 1' }],
      inputs: [{ identifier: 'in-1', name: 'MIDI In 1' }],
    };
    const received = [];
    bridge.on('hardware.ports', data => received.push(data));
    host.emit('hardware.ports', ports);

    expect(received).toEqual([ports]);
    expect(statuses).toEqual([]);
  });
  it('envía el SysEx codificado en base64 como hardware.send', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');
    const { output } = createBridgeMidiPorts();

    output.send(new Uint8Array([0xF0, 0x42, 0x30, 0xF7]));

    const send = host.sent.filter(s => s.action === 'hardware.send').pop();
    expect(send).toBeDefined();
    expect(atob(send.data.payload)).toBe(String.fromCharCode(0xF0, 0x42, 0x30, 0xF7));
  });


  it('al cerrar la sesión deja de escuchar el canal de hardware', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');

    const statuses = [];
    const received = [];
    const session = createBridgeMidiPorts({ onStatus: s => statuses.push(s) });
    session.input.addEventListener('midimessage', e => received.push([...e.data]));

    session.close();

    const payload = btoa(String.fromCharCode(0xF0, 0x7D, 0xF7));
    host.emit('hardware.receive', { payload, size: 3 });
    host.emit('hardware.error', 'late failure');

    // La suscripción al padre es del bridge (no de la sesión), pero la sesión ya
    // no debe ver llegar bytes ni estados.
    expect(received).toEqual([]);
    expect(statuses).toEqual([]);
  });

  it('un error no textual también llega con mensaje legible', async () => {
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');
    const statuses = [];
    createBridgeMidiPorts({ onStatus: s => statuses.push(s) });

    host.emit('hardware.error', { message: 'device busy' });

    expect(statuses).toEqual([{ type: 'error', message: 'device busy' }]);
  });
});
