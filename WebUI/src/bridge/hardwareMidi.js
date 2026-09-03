/**
 * ABD Bank Manager — Bridge MIDI ports
 *
 * When the WebUI runs inside the JUCE plugin (WebView2 / plugin-host), Web MIDI
 * is not available. These pseudo MIDI ports have the same shape as Web MIDI
 * ports (input: addEventListener('midimessage'), output: send(bytes)) and are
 * backed by the C++ HardwareMidiPipe via the bridge, so createMidiTransport()
 * and every model contract work unchanged.
 *
 * Byte transport: JSON bridge → base64 strings in both directions.
 */

import { bridge } from './bridgeManager.js';

export const isBridgeMidiAvailable = () =>
  bridge.connected && bridge.type !== 'mock';

// ─── Base64 <-> bytes helpers ───────────────────────────────────────────────

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Send / receive over the bridge ─────────────────────────────────────────

/** Send raw bytes (one or more complete SysEx) to the C++ MIDI transport. */
export function bridgeSendBytes(bytes) {
  bridge.send('hardware.send', { payload: bytesToBase64(bytes) });
}

// ─── Pseudo MIDI ports ──────────────────────────────────────────────────────

let activeSession = null;

/**
 * Create the bridge-backed port pair and start listening for incoming bytes.
 * Returns { input, output } compatible with createMidiTransport().
 * A previous session (if any) is closed automatically.
 */
export function createBridgeMidiPorts() {
  if (activeSession) activeSession.close();
  const listeners = new Set();

  const input = {
    id: 'bridge-midi-in',
    name: `ABD Bridge MIDI (${bridge.type})`,
    addEventListener(type, cb) {
      if (type === 'midimessage') listeners.add(cb);
    },
    removeEventListener(type, cb) {
      if (type === 'midimessage') listeners.delete(cb);
    },
  };

  const output = {
    id: 'bridge-midi-out',
    name: `ABD Bridge MIDI (${bridge.type})`,
    send(bytes) {
      bridgeSendBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    },
  };

  const unsubscribeReceive = bridge.on('hardware.receive', (data) => {
    try {
      const bytes = base64ToBytes(data.payload);
      for (const cb of listeners) cb({ data: bytes });
    } catch (e) {
      console.error('[BridgeMIDI] Failed to decode hardware.receive payload:', e);
    }
  });

  // Ask the C++ core to forward hardware bytes to the WebUI.
  bridge.send('hardware.listen', {});

  const session = {
    input,
    output,
    close() {
      unsubscribeReceive();
      listeners.clear();
      if (activeSession === session) activeSession = null;
    },
  };
  activeSession = session;
  return session;
}
