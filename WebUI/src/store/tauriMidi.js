/**
 * ABD Bank Manager — MIDI via bridge Tauri (P2.2)
 *
 * Expone los comandos MIDI del backend Rust (`get_midi_ports`, `open_midi_port`,
 * `close_midi_port`, `send_sysex`, `request_sysex_dump`) como helpers async.
 * En navegador normal devuelven `null`/lanzan con `isMidiViaTauri() === false`
 * para que la UI use Web MIDI (`core/pro800Midi.js`) como hasta ahora.
 */
import { isTauri, tauriInvoke } from './backend.js';

export const isMidiViaTauri = () => isTauri();

export async function getMidiPorts() {
  if (!isTauri()) return null;
  return tauriInvoke('get_midi_ports');
}

export async function openMidiPort(portId, isInput) {
  if (!isTauri()) return null;
  return tauriInvoke('open_midi_port', { portId, isInput: !!isInput });
}

export async function closeMidiPort(portId) {
  if (!isTauri()) return null;
  return tauriInvoke('close_midi_port', { portId });
}

export async function sendSysex(portId, data) {
  if (!isTauri()) return null;
  const bytes = data instanceof Uint8Array ? Array.from(data) : data;
  return tauriInvoke('send_sysex', { portId, data: bytes });
}

export async function requestSysexDump(portId, modelId, slot = 0) {
  if (!isTauri()) return null;
  return tauriInvoke('request_sysex_dump', { portId, modelId, slot });
}