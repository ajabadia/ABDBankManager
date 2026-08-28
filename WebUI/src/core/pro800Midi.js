import { getModelContract } from '../contracts/modelContracts.js';
import { splitSysExMessages } from './sysexParser.js';

const PRO800_MODEL_ID = 'behringer-pro800';
const DM12_MODEL_ID = 'behringer-deepmind12';

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

export function createBehringerMidiTransport({ modelId = PRO800_MODEL_ID, input, output, timeoutMs } = {}) {
  if (!output?.send) throw new Error('Se requiere una salida MIDI');
  const contract = getModelContract(modelId);
  const effectiveTimeout = timeoutMs || contract.dumpTimeoutMs || 5000;
  if (!contract) throw new Error(`Contrato no encontrado: ${modelId}`);
  let pending = null;

  const onMessage = event => {
    if (!pending) return;
    const messages = splitSysExMessages(new Uint8Array(event.data));
    for (const message of messages) {
      const parsed = contract.parsePatchSysEx?.(message);
      if (parsed && parsed.slot === pending.slot) {
        const resolve = pending.resolve;
        pending = null;
        resolve(parsed);
        return;
      }
    }
  };
  input?.addEventListener?.('midimessage', onMessage);

  async function fetchPatch(slot, signal) {
    if (pending) throw new Error('Ya hay una petición Pro-800 en curso');
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const request = contract.buildDumpRequest(slot, 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error(`Timeout esperando el slot ${slot}`)); }, effectiveTimeout);
      const abort = () => { clearTimeout(timer); pending = null; reject(new DOMException('Operación cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      pending = { slot, resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); } };
      try { output.send(request); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  return {
    capabilities: { fetch: true, send: true },
    fetchPatch,
    sendPatch(patch, slot, channel = contract.midi?.defaultChannel ?? 1) {
      if (!contract.buildPatchSysEx) throw new Error(`El contrato ${modelId} no permite exportación SysEx`);
      output.send(contract.buildPatchSysEx(patch.rawData, slot, channel));
    },
    close() { input?.removeEventListener?.('midimessage', onMessage); pending = null; }
  };
}

export const createPro800MidiTransport = options => createBehringerMidiTransport({ ...options, modelId: PRO800_MODEL_ID });
export const createDeepMind12MidiTransport = options => createBehringerMidiTransport({ ...options, modelId: DM12_MODEL_ID });

export async function sendBehringerPatch(transport, patch, slot, channel = 1) {
  transport.sendPatch(patch, slot, channel);
}

export async function fetchBehringerBank(transport, { start = 0, count, signal, onProgress } = {}) {
  const patches = [];
  for (let offset = 0; offset < count; offset++) {
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const patch = await transport.fetchPatch(start + offset, signal);
    patches.push(patch);
    onProgress?.({ completed: offset + 1, total: count, slot: patch.slot });
  }
  return patches;
}

export async function fetchPro800Bank(transport, { start = 0, count = 100, signal, onProgress } = {}) {
  const patches = [];
  for (let offset = 0; offset < count; offset++) {
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const patch = await transport.fetchPatch(start + offset, signal);
    patches.push(patch);
    onProgress?.({ completed: offset + 1, total: count, slot: patch.slot });
  }
  return patches;
}

// ─── DX7 Transport ─────────────────────────────────────────────
// The DX7 sends all 32 voices in a single bulk dump response.
// No slot-by-slot fetching — one request returns everything.

const DX7_MODEL_ID = 'yamaha-dx7';

export function createDx7MidiTransport({ input, output, timeoutMs } = {}) {
  if (!output?.send) throw new Error('Se requiere una salida MIDI');
  const contract = getModelContract(DX7_MODEL_ID);
  const effectiveTimeout = timeoutMs || contract.dumpTimeoutMs || 5000;
  if (!contract) throw new Error(`Contrato no encontrado: ${DX7_MODEL_ID}`);
  let pending = null;

  const onMessage = event => {
    if (!pending) return;
    const raw = new Uint8Array(event.data);
    // DX7 bulk dump: F0 43 10 00 09 20 01 [32×128B] checksum F7
    // Also accept single voice: F0 43 10 00 09 20 00 [128B] checksum F7
    if (raw[0] === 0xF0 && raw[1] === 0x43 && raw[4] === 0x09 && raw[5] === 0x20) {
      const isBulk = raw[6] === 0x01;
      const isSingle = raw[6] === 0x00;
      if (isBulk || isSingle) {
        const response = contract.parseDumpResponse?.(raw);
        if (response && response.length > 0) {
          const resolve = pending.resolve;
          pending = null;
          resolve(response);
          return;
        }
      }
    }
  };
  input?.addEventListener?.('midimessage', onMessage);

  /**
   * Request a full bank dump (32 voices) from the DX7.
   * @param {'all'} _mode - DX7 only supports 'all' (32 voices at once)
   * @param {AbortSignal} [signal]
   * @returns {Promise<Array<{rawData: Uint8Array, slot: number}>>}
   */
  async function fetchAllVoices(signal) {
    if (pending) throw new Error('Ya hay una petición DX7 en curso');
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const request = contract.buildDumpRequest('all', contract.midi?.defaultChannel ?? 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error('Timeout esperando bulk dump DX7')); }, effectiveTimeout);
      const abort = () => { clearTimeout(timer); pending = null; reject(new DOMException('Operación cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      pending = { resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); } };
      try { output.send(request); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  /**
   * Request a single voice dump from the DX7.
   * @param {number} _voiceIndex - ignored, DX7 always returns current voice
   * @param {AbortSignal} [signal]
   * @returns {Promise<{rawData: Uint8Array, slot: number}>}
   */
  async function fetchSingleVoice(signal) {
    if (pending) throw new Error('Ya hay una petición DX7 en curso');
    if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
    const request = contract.buildDumpRequest(0, contract.midi?.defaultChannel ?? 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error('Timeout esperando voice dump DX7')); }, effectiveTimeout);
      const abort = () => { clearTimeout(timer); pending = null; reject(new DOMException('Operación cancelada', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      pending = { resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value[0]); } };
      try { output.send(request); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  return {
    capabilities: { fetch: true, send: true },
    fetchAllVoices,
    fetchSingleVoice,
    sendPatch(patch, slot, channel = contract.midi?.defaultChannel ?? 1) {
      if (!contract.buildPatchSysEx) throw new Error(`El contrato ${DX7_MODEL_ID} no permite exportación SysEx`);
      output.send(contract.buildPatchSysEx(patch.rawData, slot, channel));
    },
    close() { input?.removeEventListener?.('midimessage', onMessage); pending = null; }
  };
}

/**
 * Fetch all 32 voices from a DX7 in one bulk request.
 */
export async function fetchDx7Bank(transport, { signal, onProgress } = {}) {
  if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
  onProgress?.({ completed: 0, total: 32, slot: -1 });
  const patches = await transport.fetchAllVoices(signal);
  onProgress?.({ completed: patches.length, total: patches.length, slot: patches.length - 1 });
  return patches;
}
