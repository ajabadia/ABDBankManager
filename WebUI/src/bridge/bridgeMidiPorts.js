/**
 * The Bank Manager's own MIDI ports, and what the manual picker may claim
 * about them.
 *
 * `hardwareMidi.js` mints a pseudo port pair named `ABD Bridge MIDI (<type>)`
 * when the WebUI runs inside a plugin (Web MIDI is unavailable there). Those
 * ports are *ours* — the link to the host's hardware MIDI pipe — not a device
 * the user plugged in, which changes two things in the manual "MIDI Connection"
 * dialog:
 *
 *  - "Detect model" has no port name to sniff (the name is the bridge's, not a
 *    device's), so answering "Not recognized" would blame hardware that was
 *    never there. The honest answer is the model the host announced, or an
 *    explanation of why there is nothing to detect.
 *  - The pair arrives together, so the matching input must be pre-selected: a
 *    bridge session left on "No input connection" receives no SysEx back.
 *
 * Pure logic (no DOM, no storage) so it is unit-testable without jsdom, and the
 * ids/name live here so `hardwareMidi.js` and this module cannot drift apart
 * (see tests/unit/bridgeMidiPorts.test.js).
 */

export const BRIDGE_MIDI_IN_ID = 'bridge-midi-in';
export const BRIDGE_MIDI_OUT_ID = 'bridge-midi-out';

/** Same formula `createBridgeMidiPorts()` puts on the port (hardwareMidi.js). */
export const bridgeMidiPortName = type => `ABD Bridge MIDI (${type})`;

/** True for either half of the pair (a real Web MIDI port never matches). */
export function isBridgeMidiPort(port) {
  return !!port && (port.id === BRIDGE_MIDI_IN_ID || port.id === BRIDGE_MIDI_OUT_ID);
}

/**
 * Index of `preferredId` inside `inputs`, or -1 to leave the picker on
 * "No input connection".
 */
export function preferredInputIndex(inputs, preferredId) {
  if (!Array.isArray(inputs) || !preferredId) return -1;
  return inputs.findIndex(port => port && port.id === preferredId);
}

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Verdict of "Detect model" on a bridge port.
 *
 * `tone: 'success'` when the host already told us which hardware it drives
 * (the port *is* that link, so nothing needs probing); `tone: 'info'` when it
 * has not, which is a state to explain rather than an error to report.
 * Returns `{ modelId, tone, message }`; `null` for a non-bridge port, so the
 * caller keeps the ordinary name-sniffing path.
 */
export function bridgeMidiDetection({
  port,
  hostContextModelId = null,
  hostModelDisplayName = null,
  resolvable = false,
  esc = escapeHtml
} = {}) {
  if (!isBridgeMidiPort(port)) return null;

  if (resolvable && hostContextModelId) {
    return {
      modelId: hostContextModelId,
      tone: 'success',
      message: `Detected: <strong>${esc(hostModelDisplayName || hostContextModelId)}</strong>` +
        ' — this port is the plugin\'s own MIDI bridge to the host'
    };
  }

  return {
    modelId: null,
    tone: 'info',
    message: 'This port is the plugin\'s own MIDI bridge to the host, and the host has not ' +
      'reported which hardware it drives. Select the model below:'
  };
}
