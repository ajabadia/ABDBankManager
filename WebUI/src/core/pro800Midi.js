/**
 * ABD Bank Manager — Generic MIDI Transport
 *
 * Creates MIDI transports driven entirely by ModelContract fields.
 * No model-specific logic here — all behavior comes from the contract.
 */

import { getModelContract } from '../contracts/modelContracts.js';
import { splitSysExMessages } from './sysexParser.js';


export async function requestMidiAccess() {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI no está disponible en este navegador');
  return navigator.requestMIDIAccess({ sysex: true });
}

export function listMidiPorts(access) {
  return {
    inputs: Array.from(access.inputs.values()),
    outputs: Array.from(access.outputs.values())
  };
}

/**
 * Create a generic MIDI transport for any model.
 * Behavior is driven by the contract's methods and fields.
 *
 * @param {object} options
 * @param {string} options.modelId - Contract model ID
 * @param {MIDIInput} [options.input] - MIDI input port (for fetch)
 * @param {MIDIOutput} options.output - MIDI output port (for send)
 * @param {number} [options.timeoutMs] - Override dump timeout
 * @returns {object} Transport with fetchPatch, sendPatch, close, capabilities
 */
export function createMidiTransport({ modelId, input, output, timeoutMs } = {}) {
  if (!output?.send) throw new Error('Se requiere una salida MIDI');
  const contract = getModelContract(modelId);
  if (!contract) throw new Error(`Contrato no encontrado: ${modelId}`);
  const effectiveTimeout = timeoutMs || contract.dumpTimeoutMs || 5000;
  let pending = null;

  const onMessage = event => {
    if (!pending) return;
    const raw = new Uint8Array(event.data);
    const messages = splitSysExMessages(raw);
    for (const message of messages) {
      // Try single-voice parse first, then bulk dump
      const parsed = contract.parsePatchSysEx?.(message);
      if (parsed && parsed.slot === pending.slot) {
        const resolve = pending.resolve;
        pending = null;
        resolve(parsed);
        return;
      }
      // Bulk dump: resolve with array of patches
      if (contract.parseDumpResponse) {
        const bulkParsed = contract.parseDumpResponse(message);
        if (bulkParsed && bulkParsed.length > 0) {
          const resolve = pending.resolve;
          pending = null;
          resolve(bulkParsed);
          return;
        }
      }
    }
  };
  input?.addEventListener?.('midimessage', onMessage);

  async function fetchPatch(slot, signal) {
    if (pending) throw new Error(`Ya hay una petición en curso para ${contract.displayName}`);
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const request = contract.buildDumpRequest(slot, contract.midi?.defaultChannel ?? 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error(`Timeout esperando slot ${slot} de ${contract.displayName}`)); }, effectiveTimeout);
      const abort = () => { clearTimeout(timer); pending = null; reject(new DOMException('Operación cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      pending = { slot, resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); } };
      try { output.send(request); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  async function fetchAll(signal) {
    if (pending) throw new Error(`Ya hay una petición en curso para ${contract.displayName}`);
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const request = contract.buildDumpRequest('all', contract.midi?.defaultChannel ?? 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error(`Timeout esperando bulk dump de ${contract.displayName}`)); }, effectiveTimeout);
      const abort = () => { clearTimeout(timer); pending = null; reject(new DOMException('Operación cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      pending = { resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); } };
      try { output.send(request); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  return {
    capabilities: {
      fetch: !!(contract.buildDumpRequest && (contract.parsePatchSysEx || contract.parseDumpResponse)),
      send: !!contract.buildPatchSysEx,
    },
    fetchPatch,
    fetchAll,
    sendPatch(patch, slot, channel = contract.midi?.defaultChannel ?? 1) {
      if (!contract.buildPatchSysEx) throw new Error(`El contrato ${contract.displayName} no permite exportación SysEx`);
      output.send(contract.buildPatchSysEx(patch.rawData, slot, channel));
    },
    close() { input?.removeEventListener?.('midimessage', onMessage); pending = null; }
  };
}

// ─── Backward-compatible aliases (deprecated, use createMidiTransport) ───

export const createPro800MidiTransport = options => createMidiTransport({ ...options, modelId: 'behringer-pro800' });
export const createDeepMind12MidiTransport = options => createMidiTransport({ ...options, modelId: 'behringer-deepmind12' });
export const createDx7MidiTransport = options => createMidiTransport({ ...options, modelId: 'yamaha-dx7' });

export const createBehringerMidiTransport = createMidiTransport;

/**
 * Fetch a bank patch-by-patch (slot-by-slot).
 * Works with any transport that has fetchPatch.
 */
export async function fetchBank(transport, { start = 0, count, signal, onProgress } = {}) {
  const patches = [];
  for (let offset = 0; offset < count; offset++) {
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const patch = await transport.fetchPatch(start + offset, signal);
    patches.push(patch);
    onProgress?.({ completed: offset + 1, total: count, slot: patch.slot });
  }
  return patches;
}

// Backward-compatible aliases
export const fetchBehringerBank = fetchBank;
export const fetchPro800Bank = fetchBank;

export async function sendPatch(transport, patch, slot, channel = 1) {
  transport.sendPatch(patch, slot, channel);
}

// Backward-compatible alias
export const sendBehringerPatch = sendPatch;
