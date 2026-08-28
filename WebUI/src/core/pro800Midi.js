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
