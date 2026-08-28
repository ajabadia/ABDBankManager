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
 * Split a large SysEx message into chunks that fit within maxSysExMessageSize.
 * Each chunk is a valid SysEx message (starts with F0, ends with F7).
 * @param {Uint8Array} msg - Original SysEx message
 * @param {number} maxSize - Maximum chunk size in bytes
 * @returns {Uint8Array[]} Array of smaller SysEx messages
 */
function splitSysExMessage(msg, maxSize) {
  if (msg.length <= maxSize) return [msg];
  
  const chunks = [];
  const header = msg.slice(0, 6); // F0 43 gg 09 20 00
  const checksum = msg[msg.length - 2];
  const payload = msg.slice(6, msg.length - 2); // Data between header and checksum
  
  // Each chunk gets its own header and checksum
  for (let offset = 0; offset < payload.length; offset += maxSize - 8) {
    const chunkData = payload.slice(offset, Math.min(offset + maxSize - 8, payload.length));
    const chunk = new Uint8Array(header.length + chunkData.length + 2);
    chunk.set(header, 0);
    chunk.set(chunkData, header.length);
    // Simple checksum for chunk (sum of data bytes)
    let sum = 0;
    for (const b of chunkData) sum += b;
    chunk[chunk.length - 2] = (128 - (sum % 128)) & 0x7F;
    chunk[chunk.length - 1] = 0xF7;
    chunks.push(chunk);
  }
  return chunks;
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
      bulk: !!contract.buildBulkSysEx,
    },
    fetchPatch,
    fetchAll,
    sendPatch(patch, slot, channel = contract.midi?.defaultChannel ?? 1) {
      if (!contract.buildPatchSysEx) throw new Error(`El contrato ${contract.displayName} no permite exportación SysEx`);
      const msg = contract.buildPatchSysEx(patch.rawData, slot, channel);
      output.send(msg);
      // Post-send delay: give hardware time to process the SysEx message
      // This prevents buffer overflow on devices like the M-VAVE FM-1
      return contract.interMessageDelayMs || 0;
    },
    sendBulk(patches, channel = contract.midi?.defaultChannel ?? 1) {
      if (!contract.buildBulkSysEx) throw new Error(`El contrato ${contract.displayName} no permite envío bulk`);
      const msg = contract.buildBulkSysEx(patches, channel);
      const delay = contract.interMessageDelayMs || 50;
      
      // Split if message exceeds device buffer size
      const maxSize = contract.maxSysExMessageSize;
      if (maxSize && msg.length > maxSize) {
        const chunks = splitSysExMessage(msg, maxSize);
        // Send chunks with delay between each
        for (let i = 0; i < chunks.length; i++) {
          output.send(chunks[i]);
          if (i < chunks.length - 1) {
            // Wait between chunks
            const start = Date.now();
            while (Date.now() - start < delay) { /* busy wait */ }
          }
        }
        return delay * chunks.length; // Total delay for all chunks
      } else {
        output.send(msg);
        return delay * 2; // Double delay for single bulk message
      }
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
