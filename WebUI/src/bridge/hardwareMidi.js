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
/**
 * Crea el par de puertos respaldado por el bridge del anfitrión.
 *
 * `onStatus` recibe el estado del otro extremo para que la UI pueda explicarse:
 *  - `{ type: 'ack', listening, device }` — el anfitrión abrió (o no) su entrada;
 *  - `{ type: 'error', message }`        — no hay dispositivo, o falló el envío;
 *  - `{ type: 'sent', bytes }`           — cuántos bytes han salido de verdad.
 * Sin esto, dentro del plugin un fetch sin hardware disponible solo podía acabar
 * en timeout, sin decir por qué.
 */
export function createBridgeMidiPorts({ onStatus } = {}) {
  if (activeSession) activeSession.close();
  const listeners = new Set();

  const notify = (status) => {
    try { onStatus?.(status); } catch (e) { console.error('[BridgeMIDI] onStatus failed:', e); }
  };

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

  const unsubscribeAck = bridge.on('hardware.listen.ack', (data) => {
    notify({
      type: 'ack',
      listening: !!(data && data.listening),
      device: (data && data.device) || null
    });
  });

  const unsubscribeErrors = bridge.on('hardware.error', (message) => {
    notify({ type: 'error', message: typeof message === 'string' ? message : String(message ?? '') });
  });

  const unsubscribeSent = bridge.on('hardware.sent', (bytes) => {
    notify({ type: 'sent', bytes: Number(bytes) || 0 });
  });

  // Ask the host to open its hardware MIDI transport and forward bytes to the WebUI.
  bridge.send('hardware.listen', {});

  const session = {
    input,
    output,
    close() {
      unsubscribeReceive();
      unsubscribeAck();
      unsubscribeErrors();
      unsubscribeSent();
      listeners.clear();
      if (activeSession === session) activeSession = null;
    },
  };
  activeSession = session;
  return session;
}
