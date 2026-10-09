/**
 * ABD Bank Manager — Transporte de software (el synth que hospeda al Bank Manager).
 *
 * Es el segundo extremo del Bank Manager (el primero es MIDI: `core/pro800Midi.js`).
 * Devuelve **la misma forma** que `createMidiTransport()` — `capabilities` y los
 * cuatro verbos (`fetchPatch`, `fetchAll`, `sendPatch`, `sendBulk`) — así que la app
 * no necesita saber si al otro lado hay un equipo o un plugin: `handleMidiFetch()`
 * y el envío de bancos funcionan igual (ver `DOCS/BANK_MANAGER_TRANSPORT_MODEL.md`).
 *
 * Contrato (acciones compartidas, una vez para todos los synths; ver
 * `core/transportCapabilities.js`):
 *
 * | Verbo          | Acción            | Payload                                   | Respuesta          |
 * |----------------|-------------------|-------------------------------------------|--------------------|
 * | `fetchPatch`   | `preset.read`     | `{ system, slot }`                        | `preset.data`      |
 * | `fetchAll`     | `bank.read`       | `{ system }`                              | `bank.data`        |
 * | `sendPatch`    | `preset.write`    | `{ system, slot, payload, audition? }`    | `preset.written`   |
 * | `sendBulk`     | `bank.write`      | `{ system, slots: [...] }`                | `bank.written`     |
 * | `capture()`    | `preset.capture`  | `{ system }`                              | `preset.captured`  |
 *
 * `payload` va en **base64 estándar** (el `atob`/`btoa` del WebUI), igual que
 * `hardware.receive`: es el único formato que el bridge JS entiende sin depender de
 * JUCE (`MemoryBlock::toBase64Encoding()` codifica `<tamaño>.<datos>` y no vale).
 * `system` es `'sysex'` o `'native'` (ver `PresetSystem` en `ModelContract.ts`).
 *
 * Cada petición lleva un `requestId` que el host debe devolver en su respuesta; si
 * no lo devuelve, se resuelve la petición más antigua de ese tipo (adopción
 * gradual: un host que solo implemente `preset.read` funciona igual).
 *
 * Un host que no conozca una acción contesta `preset.error` con
 * `{ code: 'unsupported-action' }`: entonces se cae al verbo por slot
 * (`bank.read` → `preset.read` × N, `bank.write` → `preset.write` × N) en lugar de
 * fallar. Así el anfitrión puede empezar por un verbo y añadir el resto después.
 */

import { bridge } from './bridgeManager.js';
import { bytesToBase64, base64ToBytes } from './hardwareMidi.js';
import {
  SOFTWARE_ACTIONS,
  SOFTWARE_REPLIES,
  resolvePresetSystem,
  softwareCapabilities,
} from '../core/transportCapabilities.js';

/** ¿La respuesta del host significa «no conozco esa acción»? */
export function isUnsupportedAction(payload) {
  const code = payload?.code;
  if (code === 'unsupported-action' || code === 'unknown-action') return true;
  const message = typeof payload?.message === 'string' ? payload.message : '';
  return /unsupported|not implemented|unknown action/i.test(message);
}

/**
 * Crea el transporte respaldado por el bridge del anfitrión.
 *
 * @param {object} args
 * @param {object} args.contract  contrato del modelo (necesita `transport.software`)
 * @param {string} [args.system]  `'sysex'` o `'native'`; obligatorio si el contrato declara los dos
 * @param {object} [args.bridgeManager] inyectable en tests (por defecto el singleton)
 * @param {(status: object) => void} [args.onActivity] latido de actividad (LED de MIDI)
 * @param {(message: string) => void} [args.onError] fallos sin promesa viva (envíos)
 * @param {number} [args.timeoutMs] por defecto `contract.dumpTimeoutMs` o 3000
 */
export function createSoftwareTransport({
  contract,
  system = null,
  bridgeManager = bridge,
  onActivity = null,
  onError = null,
  timeoutMs = null,
} = {}) {
  const software = softwareCapabilities(contract);
  if (!bridgeManager) throw new Error('createSoftwareTransport: no bridge available');
  if (!software) {
    throw new Error(`createSoftwareTransport: contract '${contract?.modelId ?? '?'}' declares no software transport`);
  }

  const presetSystem = resolvePresetSystem(contract, system);
  if (!presetSystem) {
    throw new Error(
      `createSoftwareTransport: '${contract.modelId}' exposes several preset systems ` +
      `(${software.systems.join(', ')}): pick one — a SysEx preset and a native one are not interchangeable`
    );
  }

  const requestTimeout = timeoutMs ?? contract.dumpTimeoutMs ?? 3000;
  let sequence = 0;
  /** @type {Map<string, { id: string, kind: string, resolve: Function, reject: Function, timer: any }>} */
  const pending = new Map();

  const emit = (direction, bytes, label) => {
    try { onActivity?.({ direction, bytes, label }); } catch (e) { console.error('[SoftwareTransport] onActivity failed:', e); }
  };

  const reportError = (error) => {
    if (typeof onError === 'function') { try { onError(error.message); return; } catch (e) { console.error('[SoftwareTransport] onError failed:', e); } }
    console.error('[SoftwareTransport]', error.message);
  };

  const settle = (id, { ok, value, error }) => {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve(value); else entry.reject(error);
    return true;
  };

  /** Localiza la petición a la que responde `payload` (por `requestId` o, si el host no lo echa, por tipo). */
  const findPending = (payload, kind) => {
    const id = payload?.requestId;
    if (typeof id === 'string' && pending.has(id)) return pending.get(id);
    for (const entry of pending.values()) if (entry.kind === kind) return entry;
    return null;
  };

  const registerRequest = (kind, action, data, label) => {
    const requestId = `sw-${++sequence}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${action} timed out after ${requestTimeout} ms${contract?.displayName ? ` (${contract.displayName})` : ''}`));
      }, requestTimeout);
      pending.set(requestId, { id: requestId, kind, resolve, reject, timer });

      try {
        bridgeManager.send(action, { ...data, system: presetSystem, requestId });
        if (label) emit('out', null, label);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  };

  const decodeSlots = slots => (Array.isArray(slots) ? slots : []).map(entry => ({
    rawData: base64ToBytes(entry?.payload ?? ''),
    slot: Number(entry?.slot ?? 0),
    name: entry?.name,
  }));

  const decodeOne = (payload, fallbackSlot = 0) => {
    const rawData = base64ToBytes(payload?.payload ?? '');
    if (rawData.length === 0) throw new Error(`${SOFTWARE_REPLIES.presetData} arrived without payload`);
    emit('in', rawData, payload?.name || `Slot ${payload?.slot ?? fallbackSlot}`);
    return { rawData, slot: Number(payload?.slot ?? fallbackSlot), name: payload?.name };
  };

  /**
   * Payload de `programData`: el nombre **histórico** del preset que manda el
   * anfitrión. `BridgeManager` lo reemitía y nadie lo escuchaba (el propio host no
   * lo produce hoy), así que un host que ya lo emitiera se quedaba sin respuesta.
   * Se acepta como respuesta de `preset.read` / `preset.capture` y, si no hay
   * ninguna petición viva, se avisa en vez de tragárselo.
   */
  const decodeLegacyProgramData = (payload) => {
    const raw = payload?.payload ?? payload?.dataBase64 ?? payload?.data;
    if (typeof raw !== 'string' || raw.length === 0) return null;
    return {
      rawData: base64ToBytes(raw),
      slot: Number(payload?.slot ?? 0),
      name: payload?.name,
      legacy: true,
    };
  };

  // ─── Suscripciones (respuestas del anfitrión) ────────────────────────────────

  const unsubscribes = [
    bridgeManager.on(SOFTWARE_REPLIES.presetData, (payload) => {
      const entry = findPending(payload, 'readPreset');
      if (!entry) return;
      try { settle(entry.id, { ok: true, value: decodeOne(payload, payload?.slot ?? 0) }); }
      catch (error) { settle(entry.id, { ok: false, error }); }
    }),

    bridgeManager.on(SOFTWARE_REPLIES.bankData, (payload) => {
      const entry = findPending(payload, 'readBank');
      if (!entry) return;
      try {
        const slots = decodeSlots(payload?.slots);
        emit('in', null, `${slots.length} presets from the host`);
        settle(entry.id, { ok: true, value: slots });
      } catch (error) { settle(entry.id, { ok: false, error }); }
    }),

    bridgeManager.on(SOFTWARE_REPLIES.presetWritten, (payload) => {
      const entry = findPending(payload, 'writePreset');
      if (entry) settle(entry.id, { ok: true, value: payload });
    }),

    bridgeManager.on(SOFTWARE_REPLIES.bankWritten, (payload) => {
      const entry = findPending(payload, 'writeBank');
      if (entry) settle(entry.id, { ok: true, value: payload });
    }),

    bridgeManager.on(SOFTWARE_REPLIES.presetCaptured, (payload) => {
      const entry = findPending(payload, 'capture');
      if (!entry) return;
      try { settle(entry.id, { ok: true, value: decodeOne(payload, payload?.slot ?? 0) }); }
      catch (error) { settle(entry.id, { ok: false, error }); }
    }),

    // `programData` (histórico): mismo contenido que `preset.data`, con otro nombre.
    bridgeManager.on('programData', (payload) => {
      const entry = findPending(payload, 'readPreset') ?? findPending(payload, 'capture');
      if (!entry) {
        console.warn('[SoftwareTransport] programData arrived with no pending request:', payload);
        return;
      }
      try {
        const decoded = decodeLegacyProgramData(payload);
        if (!decoded) throw new Error('programData arrived without a usable payload');
        emit('in', decoded.rawData, decoded.name || 'programData');
        settle(entry.id, { ok: true, value: decoded });
      } catch (error) { settle(entry.id, { ok: false, error }); }
    }),

    // `preset.error`: rechaza la petición correspondiente y marca si el host no
    // conoce la acción, que es lo que permite caer al verbo por slot.
    bridgeManager.on(SOFTWARE_REPLIES.error, (payload) => {
      const entry = findPending(payload, null) ?? null;
      const message = typeof payload === 'string' ? payload : (payload?.message || 'preset.error');
      const error = new Error(message);
      error.unsupportedAction = isUnsupportedAction(typeof payload === 'object' ? payload : {});
      if (entry) settle(entry.id, { ok: false, error });
      else reportError(error);
    }),
  ];

  // ─── Verbos ─────────────────────────────────────────────────────────────────

  async function fetchPatch(slot, _signal) {
    const requested = Number(slot) || 0;
    return registerRequest('readPreset', SOFTWARE_ACTIONS.readPreset, { slot: requested }, `Fetch slot ${requested}`);
  }

  async function fetchAll(_signal) {
    try {
      const slots = await registerRequest('readBank', SOFTWARE_ACTIONS.readBank, {}, 'Fetch bank');
      if (slots.length > 0) return slots;
    } catch (error) {
      // Solo se cae al bucle si el host dijo que no conoce `bank.read`: cualquier
      // otro fallo es un fallo, y 128 peticiones más no lo arreglan.
      if (!error.unsupportedAction) throw error;
    }

    const capacity = contract.bankCapacity || 128;
    const out = [];
    for (let index = 0; index < capacity; index++) out.push(await fetchPatch(index));
    return out;
  }

  /**
   * `preset.write`. Sin `confirm` sigue siendo «dispara y olvida» y devuelve el retardo
   * entre mensajes (igual que el transporte MIDI); con `confirm: true` devuelve la
   * promesa del acuse del host: resuelve con `preset.written` o rechaza con
   * `preset.error` (o el timeout). Es lo que permite decir «enviado y confirmado» en vez
   * de «enviado», que es una promesa a ciegas.
   */
  function sendPatch(patch, slot, _channel = 1, options = {}) {
    const rawData = patch?.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch?.rawData || []);
    const request = registerRequest('writePreset', SOFTWARE_ACTIONS.writePreset, {
      slot: Number(slot) || 0,
      payload: bytesToBase64(rawData),
      name: patch?.name,
      ...(patch?.audition ? { audition: true } : {}),
    }, `Slot ${slot} → host`);

    if (options.confirm) return request;
    request.catch(reportError);
    return contract.interMessageDelayMs || 0;
  }

  /** Igual que `sendPatch`, pero con el lote entero (`bank.write`). */
  function sendBulk(patches = [], _channel = 1, options = {}) {
    const slots = patches.map(patch => ({
      slot: Number(patch.slot) || 0,
      payload: bytesToBase64(patch.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch.rawData || [])),
      name: patch.name,
    }));

    const request = registerRequest('writeBank', SOFTWARE_ACTIONS.writeBank, { slots }, `Bank (${slots.length} presets) → host`)
      .catch((error) => {
        // Solo se cae al verbo por slot si el host dijo que no conoce `bank.write`:
        // cualquier otro fallo es un fallo.
        if (!error.unsupportedAction) throw error;
        if (options.confirm) {
          return Promise.all(patches.map(patch => sendPatch(patch, patch.slot, null, { confirm: true })))
            .then(() => ({ count: patches.length, perSlot: true }));
        }
        // Host que solo sabe escribir slot a slot.
        for (const patch of patches) sendPatch(patch, patch.slot);
        return { count: patches.length, perSlot: true };
      });

    if (options.confirm) return request;
    request.catch(reportError);
    return (contract.interMessageDelayMs || 50) * 2;
  }

  /** Guardar en la biblioteca el preset activo del synth (no es un verbo MIDI). */
  async function capture(options = {}) {
    const data = options.slot === undefined || options.slot === null ? {} : { slot: Number(options.slot) };
    return registerRequest('capture', SOFTWARE_ACTIONS.capturePreset, data, 'Capture from host');
  }

  function close() {
    for (const unsubscribe of unsubscribes) {
      try { unsubscribe(); } catch (e) { console.error('[SoftwareTransport] unsubscribe failed:', e); }
    }
    for (const entry of [...pending.values()]) {
      clearTimeout(entry.timer);
      entry.reject(new Error('transport closed'));
    }
    pending.clear();
  }

  return {
    kind: 'software',
    system: presetSystem,
    capabilities: {
      fetch: software.read,
      send: software.write,
      // `bank.write` cubre el lote; si el host no lo conoce, `sendBulk` cae a
      // `preset.write` por slot (ver arriba), así que el verbo existe igual.
      bulk: software.write,
      /** Este extremo **es** el synth de software: el plugin que hospeda al Banco. */
      softsynth: true,
      /**
       * Y siempre acusa recibo de una escritura: el host contesta `preset.written` (o
       * `preset.error`), así que se puede esperar en vez de dar por buena la salida.
       *
       * Antes no estaba declarado, y `handleMidiSendPatch` decidía con
       * `capabilities.softsynth && capabilities.confirm`: la rama de confirmación —que
       * existe justo para este destino— no se ejecutaba nunca, y una escritura que el
       * host rechazaba se anunciaba igual como «enviado».
       */
      confirm: true,
      /** Contrato con el que habla este transporte (el destino, no el banco). */
      modelId: contract.modelId,
    },
    fetchPatch,
    fetchAll,
    sendPatch,
    sendBulk,
    capture,
    close,
  };
}
