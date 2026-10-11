/**
 * Descripción de los extremos de transporte de un contrato.
 *
 * Lo que se cubre es la regla que antes era invisible: las capacidades de
 * **hardware** se deducen de las funciones del contrato (comportamiento
 * histórico) salvo que estén declaradas, y las de **software** no se deducen
 * nunca — heredar `buildPatchSysEx` de la familia que se emula no significa que
 * haya un synth al otro lado del bridge.
 *
 * Regresión cubierta: un contrato de software sin `transport.software` se veía
 * igual que uno de hardware (mismos botones), y sus presets propios no tenían a
 * dónde ir.
 */

import { describe, it, expect } from 'vitest';
import {
  PRESET_SYSTEMS,
  PRESET_SYSTEM_LABELS,
  SOFTWARE_ACTIONS,
  SOFTWARE_REPLIES,
  hardwareCapabilities,
  softwareCapabilities,
  resolvePresetSystem,
  describeTransports,
  connectionRequiredMessage,
  connectionRequiredLabel,
  awaitsWriteConfirmation,
} from '../../src/core/transportCapabilities.js';

/** Contrato de hardware clásico: sin `transport`, todo por funciones. */
const legacyHardware = {
  modelId: 'roland-juno106',
  displayName: 'Roland Juno-106',
  buildDumpRequest: () => new Uint8Array(),
  parseDumpResponse: () => [],
  buildPatchSysEx: () => new Uint8Array(),
  buildBulkSysEx: () => new Uint8Array(),
  supportsEditBuffer: false,
};

describe('capacidades de hardware', () => {
  it('sin declaración se deducen de las funciones (comportamiento histórico)', () => {
    const caps = hardwareCapabilities(legacyHardware);

    expect(caps).toMatchObject({ read: true, write: true, bulk: true, audition: false, dumpRequest: true });
    expect(caps.declared).toBe(false);
  });

  it('un contrato que solo sabe recibir no ofrece escribir', () => {
    const caps = hardwareCapabilities({ buildDumpRequest: () => {}, parsePatchSysEx: () => ({}) });

    expect(caps.read).toBe(true);
    expect(caps.write).toBe(false);
    expect(caps.bulk).toBe(false);
  });

  it('lo declarado manda sobre lo deducido', () => {
    const caps = hardwareCapabilities({
      ...legacyHardware,
      transport: { hardware: { read: true, write: false } },
    });

    expect(caps.declared).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.write).toBe(false);
    expect(caps.bulk).toBe(false);
  });
});

describe('extremo de software', () => {
  it('sin `transport.software` no existe, aunque el contrato herede SysEx', () => {
    expect(softwareCapabilities(legacyHardware)).toBeNull();
    expect(softwareCapabilities({ isSoftsynth: true, ...legacyHardware })).toBeNull();
  });

  it('declara sus sistemas de presets', () => {
    const caps = softwareCapabilities({
      transport: { software: { systems: ['sysex', 'native'], read: true, write: true, audition: true, capture: true } },
    });

    expect(caps.systems).toEqual(['sysex', 'native']);
    expect(caps).toMatchObject({ sysex: true, native: true, read: true, write: true, audition: true, capture: true });
  });

  it('ignora sistemas desconocidos', () => {
    const caps = softwareCapabilities({ transport: { software: { systems: ['sysex', 'floppy'] } } });
    expect(caps.systems).toEqual(['sysex']);
  });
});

describe('elección de sistema de presets', () => {
  const twoSystems = { transport: { software: { systems: ['sysex', 'native'] } } };
  const oneSystem = { transport: { software: { systems: ['native'] } } };

  it('con un solo sistema se resuelve solo', () => {
    expect(resolvePresetSystem(oneSystem)).toBe('native');
    expect(resolvePresetSystem(oneSystem, 'sysex')).toBe('native');
  });

  it('con dos sistemas hay que elegir: no son intercambiables', () => {
    expect(resolvePresetSystem(twoSystems)).toBeNull();
    expect(resolvePresetSystem(twoSystems, 'native')).toBe('native');
    expect(resolvePresetSystem(twoSystems, 'sysex')).toBe('sysex');
  });

  it('sin extremo de software no hay sistema posible', () => {
    expect(resolvePresetSystem(legacyHardware)).toBeNull();
  });
});

describe('resumen para la UI', () => {
  it('un softsynth híbrido declara los dos destinos', () => {
    const summary = describeTransports({
      isSoftsynth: true,
      ...legacyHardware,
      transport: {
        hardware: { read: true, write: true, bulk: true },
        software: { systems: ['sysex', 'native'], read: true, write: true, capture: true },
      },
    });

    expect(summary.destinations).toEqual(['hardware', 'software']);
    expect(summary.badges).toEqual(['Send', 'Fetch', 'Bulk']);
    expect(summary.softwareBadges).toEqual(['Synth', 'SysEx', 'Native']);
    expect(summary.missingSoftwareTransport).toBe(false);
  });

  it('un hardware puro solo tiene el destino físico', () => {
    const summary = describeTransports(legacyHardware);

    expect(summary.destinations).toEqual(['hardware']);
    expect(summary.softwareBadges).toEqual([]);
    expect(summary.softsynth).toBe(false);
  });

  it('un softsynth sin extremo de software se reporta en vez de ofrecer botones que fallarían', () => {
    const summary = describeTransports({ isSoftsynth: true, ...legacyHardware });

    expect(summary.missingSoftwareTransport).toBe(true);
    expect(summary.destinations).toEqual(['hardware']);
  });
});

describe('constantes del contrato de acciones', () => {
  it('los nombres de acción y respuesta son los compartidos con el anfitrión', () => {
    expect(Object.values(SOFTWARE_ACTIONS)).toEqual([
      'preset.read', 'preset.write', 'preset.capture', 'bank.read', 'bank.write',
    ]);
    expect(Object.values(SOFTWARE_REPLIES)).toEqual([
      'preset.data', 'preset.written', 'preset.captured', 'bank.data', 'bank.written', 'preset.error',
    ]);
  });

  it('los sistemas y sus etiquetas', () => {
    expect(PRESET_SYSTEMS).toEqual(['sysex', 'native']);
    expect(PRESET_SYSTEM_LABELS).toEqual({ sysex: 'SysEx', native: 'Native' });
  });
});

describe('aviso de «no hay destino conectado»', () => {
  it('embebido no manda a conectar un dispositivo MIDI: el destino puede ser el anfitrión', () => {
    // El plugin es un destino legítimo que no es un «dispositivo MIDI», y con él el
    // banco viaja por el bridge (`bank.read`/`bank.data`), no por el cable. Pedir un
    // puerto MIDI —o uno virtual— era la salida equivocada.
    const message = connectionRequiredMessage({ embedded: true });
    expect(message).toBe('Connect a destination first (host synth or MIDI hardware)');
    expect(message.toLowerCase()).not.toContain('midi device');
    expect(connectionRequiredLabel({ embedded: true })).toBe('Connect a destination');
  });

  it('standalone sigue hablando de dispositivos MIDI, que es lo único que hay', () => {
    expect(connectionRequiredMessage({ embedded: false })).toBe('Connect a MIDI device first');
    expect(connectionRequiredMessage()).toBe('Connect a MIDI device first');
    expect(connectionRequiredLabel({ embedded: false })).toBe('Connect MIDI');
    expect(connectionRequiredLabel()).toBe('Connect MIDI');
  });
});

describe('acuse de escritura — a quién se le espera', () => {
  it('al synth de software sí: es el único que puede confirmar hoy', () => {
    expect(awaitsWriteConfirmation({ softsynth: true, confirm: true })).toBe(true);
  });

  it('al hardware real todavía no, aunque el contrato sepa leer acuses', () => {
    // El MS2000 físico manda `0x23`/`0x24`, pero que lo haga al recibir un dump no está
    // verificado contra un equipo (roadmap de ABDMS2000, item 2), así que seguiría
    // esperando en balde hasta el timeout.
    expect(awaitsWriteConfirmation({ softsynth: false, confirm: true })).toBe(false);
  });

  it('a un transporte sin acuse tampoco: no puede prometer nada', () => {
    expect(awaitsWriteConfirmation({ softsynth: true, confirm: false })).toBe(false);
    expect(awaitsWriteConfirmation({ softsynth: true })).toBe(false);
    expect(awaitsWriteConfirmation({})).toBe(false);
    expect(awaitsWriteConfirmation()).toBe(false);
  });
});
