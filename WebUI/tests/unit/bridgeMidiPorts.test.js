/**
 * Puertos MIDI del propio Bank Manager (bridge `plugin-host`) y lo que el
 * diálogo manual puede afirmar sobre ellos.
 *
 * Dentro del plugin (`Web MIDI` no existe) `hardwareMidi.js` fabrica un par de
 * puertos `ABD Bridge MIDI (<tipo>)`. Son *nuestros* — el enlace con el pipe MIDI
 * de hardware del anfitrión —, no hardware del usuario, así que:
 *  - "Detect model" no tiene nombre de dispositivo que olfatear: la respuesta es
 *    el modelo que anunció el host, o una explicación. "Not recognized" se reserva
 *    para hardware real que no supimos identificar.
 *  - el par llega junto, así que el input correspondiente debe venir preseleccionado
 *    (una sesión de bridge sin input no recibe SysEx).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BRIDGE_MIDI_IN_ID,
  BRIDGE_MIDI_OUT_ID,
  bridgeMidiPortName,
  isBridgeMidiPort,
  preferredInputIndex,
  bridgeMidiDetection
} from '../../src/bridge/bridgeMidiPorts.js';

const bridgeOut = { id: BRIDGE_MIDI_OUT_ID, name: 'ABD Bridge MIDI (plugin-host)' };
const bridgeIn = { id: BRIDGE_MIDI_IN_ID, name: 'ABD Bridge MIDI (plugin-host)' };

describe('puertos puente del Bank Manager', () => {
  it('reconoce las dos mitades del par y ningún puerto real', () => {
    expect(isBridgeMidiPort(bridgeOut)).toBe(true);
    expect(isBridgeMidiPort(bridgeIn)).toBe(true);
    expect(isBridgeMidiPort({ id: 'abc', name: 'ABD Bridge MIDI (plugin-host)' })).toBe(false);
    expect(isBridgeMidiPort(undefined)).toBe(false);
  });

  it('el nombre es el que compone hardwareMidi.js (contrato compartido)', async () => {
    vi.resetModules();
    globalThis.window = {};
    const { createBridgeMidiPorts } = await import('../../src/bridge/hardwareMidi.js');
    const { input, output } = createBridgeMidiPorts();

    expect(output.id).toBe(BRIDGE_MIDI_OUT_ID);
    expect(input.id).toBe(BRIDGE_MIDI_IN_ID);
    // Mismo nombre que el helper: si uno cambia y el otro no, este test lo caza.
    expect(output.name).toBe(bridgeMidiPortName('mock'));
    expect(input.name).toBe(bridgeMidiPortName('mock'));
    expect(isBridgeMidiPort(output)).toBe(true);
  });

  it('preselecciona el input del bridge y deja -1 si no está', () => {
    const inputs = [{ id: 'otro', name: 'Launchkey' }, bridgeIn];
    expect(preferredInputIndex(inputs, BRIDGE_MIDI_IN_ID)).toBe(1);
    expect(preferredInputIndex(inputs, 'no-existe')).toBe(-1);
    expect(preferredInputIndex([], BRIDGE_MIDI_IN_ID)).toBe(-1);
    expect(preferredInputIndex(inputs, null)).toBe(-1);
  });
});

describe('"Detect model" sobre el puerto puente', () => {
  it('no intercepta hardware real: sigue el sniffing por nombre', () => {
    expect(bridgeMidiDetection({ port: { id: 'real-1', name: 'Roland JUNO-106' } })).toBeNull();
    expect(bridgeMidiDetection({})).toBeNull();
  });

  it('con el modelo del host resuelto devuelve ese modelo y tono success', () => {
    const hit = bridgeMidiDetection({
      port: bridgeOut,
      hostContextModelId: 'abd-sm002',
      hostModelDisplayName: 'ABD MS2000 (SM002)',
      resolvable: true
    });

    expect(hit.modelId).toBe('abd-sm002');
    expect(hit.tone).toBe('success');
    expect(hit.message).toContain('ABD MS2000 (SM002)');
    expect(hit.message).toMatch(/bridge/i);
  });

  it('sin contexto del host explica el puente en vez de decir "Not recognized"', () => {
    const hit = bridgeMidiDetection({ port: bridgeOut, hostContextModelId: null, resolvable: false });

    expect(hit.modelId).toBeNull();
    expect(hit.tone).toBe('info');
    expect(hit.message).not.toMatch(/not recognized/i);
    expect(hit.message).toMatch(/host/i);
  });

  it('un modelId anunciado que este build no conoce tampoco es success', () => {
    const hit = bridgeMidiDetection({
      port: bridgeOut,
      hostContextModelId: 'nope-9000',
      resolvable: false
    });

    expect(hit.modelId).toBeNull();
    expect(hit.tone).toBe('info');
  });

  it('escapa el nombre que venga del contrato', () => {
    const hit = bridgeMidiDetection({
      port: bridgeOut,
      hostContextModelId: 'abd-sm002',
      hostModelDisplayName: '<img src=x onerror=1>',
      resolvable: true
    });

    expect(hit.message).not.toContain('<img');
    expect(hit.message).toContain('&lt;img');
  });
});
