/**
 * Flujo de Fetch de la UI (`app.js` → `handleMidiFetch()`).
 *
 * Lo que se fija aquí es lo que el usuario ve al pulsar Fetch:
 *
 *  - **cómo** se pide el banco (`planBankFetch`): de una vez por el bridge de software
 *    (`bank.read`) o por MIDI (`0x0E`/`0x4C`), o slot a slot;
 *  - **qué se cuenta** cuando llega (`summarizeBankFetch`): el contador de plazas y el
 *    aviso cuando el volcado llega incompleto o vacío;
 *  - que un anfitrión **sin puerto MIDI** puede traer su banco por el bridge
 *    (`midiBridgeBlocksFetch`).
 *
 * Las funciones son puras a propósito: antes vivían en línea dentro de `handleMidiFetch()`
 * mezcladas con el DOM y con Dexie, así que no había forma de comprobarlas sin montar la
 * app entera.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { planBankFetch, summarizeBankFetch, midiBridgeBlocksFetch } from '../../src/core/fetchFlow.js';
// El contrato real (declara `transport.software` con el sistema nativo): el Fetch por
// bridge se prueba con el mismo objeto que usa la app, no con uno de mentira.
import { korgAbdSm002Contract } from '../../../Source/Contracts/Models/korg-ms2000.ts';

// El transporte de software importa el singleton del bridge (que necesita `window` al
// evaluarse), así que se carga después de montar el shim — igual que el resto de tests
// del bridge.
let createSoftwareTransport;

beforeAll(async () => {
  globalThis.window = {};
  globalThis.document = { contains: () => false };
  ({ createSoftwareTransport } = await import('../../src/bridge/softwareTransport.js'));
});

/** `parentBridge` falso con el mínimo contrato que usa el transporte de software. */
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
    lastSent(action) { return [...sent].reverse().find(message => message.action === action); },
    countSent(action) { return sent.filter(message => message.action === action).length; },
  };
}

const toBase64 = bytes => Buffer.from(bytes).toString('base64');

const hardwareContract = {
  modelId: 'korg-ms2000',
  displayName: 'Korg MS2000',
  bankCapacity: 128,
  parseDumpResponse: () => [],
  buildDumpRequest: () => new Uint8Array(),
};

const plainContract = { modelId: 'plain', displayName: 'Plain', bankCapacity: 128 };

const patch = slot => ({ slot, rawData: new Uint8Array(4), name: `P${slot + 1}` });

describe('planBankFetch — cómo se pide el banco', () => {
  it('el destino software lo pide de una vez (bank.read), aunque el contrato no sepa leer volcados', () => {
    const plan = planBankFetch({
      transport: { fetchAll: () => Promise.resolve([]), fetchPatch: () => Promise.resolve() },
      contract: plainContract,
      software: true,
    });
    expect(plan.mode).toBe('bulk');
    expect(plan.count).toBe(128);
  });

  it('por MIDI, un contrato que sabe leer un volcado también va de una vez', () => {
    const plan = planBankFetch({
      transport: { fetchAll: () => Promise.resolve([]) },
      contract: hardwareContract,
    });
    expect(plan.mode).toBe('bulk');
  });

  it('por MIDI, un contrato sin lectura de volcado se trae slot a slot', () => {
    const plan = planBankFetch({
      transport: { fetchAll: () => Promise.resolve([]) },
      contract: plainContract,
    });
    expect(plan.mode).toBe('perSlot');
    expect(plan.count).toBe(128);
  });

  it('un transporte sin fetchAll nunca intenta el volcado', () => {
    const plan = planBankFetch({ transport: { fetchPatch: () => Promise.resolve() }, contract: hardwareContract });
    expect(plan.mode).toBe('perSlot');
  });

  it('sin capacidad declarada se cae a las 128 plazas por defecto', () => {
    expect(planBankFetch({ contract: {} }).count).toBe(128);
    expect(planBankFetch({}).count).toBe(128);
  });
});

describe('midiBridgeBlocksFetch — el puerto MIDI no es requisito del destino software', () => {
  it('un anfitrión sin hardware MIDI no bloquea el Fetch del destino software', () => {
    expect(midiBridgeBlocksFetch({ software: true, midiError: 'Hardware MIDI unavailable', midiListening: false })).toBe(false);
  });

  it('por MIDI sí lo bloquea, que es el caso que evita 128 timeouts', () => {
    expect(midiBridgeBlocksFetch({ software: false, midiError: 'Hardware MIDI unavailable', midiListening: false })).toBe(true);
  });

  it('sin error del puente no bloquea nada (ni escuchando ni sin respuesta aún)', () => {
    expect(midiBridgeBlocksFetch({ midiError: null, midiListening: false })).toBe(false);
    expect(midiBridgeBlocksFetch({ midiError: null, midiListening: null })).toBe(false);
    expect(midiBridgeBlocksFetch({ midiError: 'x', midiListening: true })).toBe(false);
  });
});

describe('summarizeBankFetch — el contador de plazas y el aviso', () => {
  const address = index => `${'ABCDEFGH'[Math.floor(index / 16)]}.${String((index % 16) + 1).padStart(2, '0')}`;

  it('un volcado completo se anuncia como éxito con su contador y su rango', () => {
    const patches = Array.from({ length: 128 }, (_, slot) => patch(slot));
    const summary = summarizeBankFetch({ patches, expected: 128, getProgramAddress: address });
    expect(summary.level).toBe('success');
    expect(summary.received).toBe(128);
    expect(summary.expected).toBe(128);
    expect(summary.range).toBe(' (A.01–H.16)');
    expect(summary.message).toBe('Fetch completado — 128/128 plazas (A.01–H.16)');
  });

  it('un volcado incompleto avisa: cuántas llegaron, de dónde a dónde y que falta el resto', () => {
    const summary = summarizeBankFetch({ patches: [patch(0), patch(1), patch(2)], expected: 128, getProgramAddress: address });
    expect(summary.level).toBe('warning');
    expect(summary.received).toBe(3);
    expect(summary.expected).toBe(128);
    expect(summary.message).toBe('Fetch completado — 3/128 plazas (A.01–A.03): el resto no llegó');
  });

  it('una sola plaza de 128 también avisa (no se supone el banco entero)', () => {
    const summary = summarizeBankFetch({ patches: [patch(7)], expected: 128, getProgramAddress: address });
    expect(summary.level).toBe('warning');
    expect(summary.message).toBe('Fetch completado — 1/128 plazas (A.08–A.08): el resto no llegó');
  });

  it('un volcado vacío es un error, no un banco vacío silencioso', () => {
    const summary = summarizeBankFetch({ patches: [], expected: 128, getProgramAddress: address });
    expect(summary.level).toBe('error');
    expect(summary.message).toBe('Fetch returned no slots');
    expect(summary.range).toBe('');
  });

  it('sin capacidad declarada no se puede decir que falte nada: cuenta lo que llegó', () => {
    const summary = summarizeBankFetch({ patches: [patch(0), patch(1)], getProgramAddress: address });
    expect(summary.level).toBe('success');
    expect(summary.message).toBe('Fetch completado — 2/2 plazas (A.01–A.02)');
  });

  it('sin direccionamiento del contrato el mensaje va sin rango (sin inventarlo)', () => {
    const summary = summarizeBankFetch({ patches: [patch(4), patch(5)], expected: 128 });
    expect(summary.level).toBe('warning');
    expect(summary.range).toBe('');
    expect(summary.message).toBe('Fetch completado — 2/128 plazas: el resto no llegó');
  });

  it('las plazas que llegan fuera de orden se cuentan igual (el rango sigue el último slot)', () => {
    const summary = summarizeBankFetch({ patches: [patch(0), patch(9), patch(4)], expected: 128, getProgramAddress: address });
    expect(summary.message).toBe('Fetch completado — 3/128 plazas (A.01–A.05): el resto no llegó');
  });
});

describe('Fetch de un destino software, de punta a punta', () => {
  it('pide bank.read al anfitrión y cuenta las plazas que devolvió', async () => {
    const bridge = makeBridge();
    const transport = createSoftwareTransport({ contract: korgAbdSm002Contract, bridgeManager: bridge });

    const plan = planBankFetch({ transport, contract: korgAbdSm002Contract, software: true });
    expect(plan.mode).toBe('bulk');

    const pending = transport.fetchAll();
    const sent = bridge.lastSent('bank.read');
    expect(sent.data.system).toBe('native');

    bridge.emit('bank.data', {
      requestId: sent.data.requestId,
      slots: [0, 1, 2].map(slot => ({ slot, name: `P${slot + 1}`, payload: toBase64([1, 2, 3, 4]) })),
    });
    const patches = await pending;

    const summary = summarizeBankFetch({
      patches,
      expected: korgAbdSm002Contract.bankCapacity,
      getProgramAddress: korgAbdSm002Contract.getProgramAddress,
    });
    expect(summary.level).toBe('warning');
    expect(summary.message).toBe('Fetch completado — 3/128 plazas (A.01–A.03): el resto no llegó');
  });

  it('un solo bank.read, no 128 preset.read, cuando el anfitrión contesta el banco entero', async () => {
    const bridge = makeBridge();
    const transport = createSoftwareTransport({ contract: korgAbdSm002Contract, bridgeManager: bridge });

    const pending = transport.fetchAll();
    bridge.emit('bank.data', {
      requestId: bridge.lastSent('bank.read').data.requestId,
      slots: Array.from({ length: 128 }, (_, slot) => ({ slot, name: `P${slot + 1}`, payload: toBase64([slot]) })),
    });
    const patches = await pending;

    expect(bridge.countSent('bank.read')).toBe(1);
    expect(bridge.countSent('preset.read')).toBe(0);
    const summary = summarizeBankFetch({
      patches,
      expected: korgAbdSm002Contract.bankCapacity,
      getProgramAddress: korgAbdSm002Contract.getProgramAddress,
    });
    expect(summary.level).toBe('success');
    expect(summary.message).toBe('Fetch completado — 128/128 plazas (A.01–H.16)');
  });
});
