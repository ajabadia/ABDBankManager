/**
 * ABD Bank Manager — Transporte de presets: qué extremos tiene un modelo.
 *
 * El Bank Manager no habla con hardware ni con software: habla con un **transporte**
 * (ver `DOCS/BANK_MANAGER_TRANSPORT_MODEL.md`). Este módulo responde a una sola
 * pregunta, para la UI y para el transporte: *¿a dónde puede ir un preset de este
 * modelo, y con qué verbos?*
 *
 *  - `hardware` — un equipo físico, por MIDI/SysEx. Se **deduce de las funciones**
 *    del contrato (`buildDumpRequest` → leer, `buildPatchSysEx` → escribir,
 *    `buildBulkSysEx` → lote) salvo que el contrato lo declare en `transport`,
 *    que es el comportamiento histórico de los 14 contratos de hardware.
 *  - `software` — el synth que **hospeda** al Bank Manager, por el bridge. Aquí no
 *    se deduce nada: o está declarado con sus sistemas de presets, o no existe.
 *
 * Un synth de software puede exponer **dos sistemas a la vez**:
 *  - `sysex`  — habla el SysEx de la familia que emula (mismo payload que el
 *               contrato de ese hardware: un `.syx` del equipo físico entra tal
 *               cual);
 *  - `native` — su sistema propio (los bytes de su motor, opacos para el Bank
 *               Manager), el único que puede llevar lo que la emulación no cubre
 *               (`sysex: false` en su esquema). Ver §7.1 del modelo de transporte.
 *
 * Puro (sin DOM, sin bridge) para poder testearlo sin jsdom.
 */

/** Extremos del transporte. */
export const HARDWARE_DESTINATION = 'hardware';
export const SOFTWARE_DESTINATION = 'software';

/** Sistemas de presets que puede exponer un synth de software. */
export const PRESET_SYSTEMS = ['sysex', 'native'];

/** Etiqueta corta de cada sistema (UI). */
export const PRESET_SYSTEM_LABELS = { sysex: 'SysEx', native: 'Native' };

/**
 * Acciones compartidas del transporte de software: **una vez para todos los
 * synths**. Un host las despacha y el Bank Manager habla los mismos cuatro verbos
 * que por MIDI, así que ninguna parte de la app necesita saber si al otro lado hay
 * un equipo o un plugin.
 */
export const SOFTWARE_ACTIONS = {
  readPreset: 'preset.read',
  writePreset: 'preset.write',
  capturePreset: 'preset.capture',
  readBank: 'bank.read',
  writeBank: 'bank.write',
};

/** Respuestas del anfitrión al transporte de software. */
export const SOFTWARE_REPLIES = {
  presetData: 'preset.data',
  presetWritten: 'preset.written',
  presetCaptured: 'preset.captured',
  bankData: 'bank.data',
  bankWritten: 'bank.written',
  error: 'preset.error',
};

/**
 * Aviso de «todavía no hay destino conectado» (lo usan Fetch y Send).
 *
 * Embebido, el destino puede ser el synth que **hospeda** al Banco (transporte de
 * software, por el bridge) y ese no es un «dispositivo MIDI»: mandar a conectar uno es
 * una salida equivocada cuando el anfitrión no tiene ninguno — ni le hace falta para
 * leer o escribir su memoria. El texto nombra las dos salidas reales del diálogo de
 * destino, en vez de dar por hecho que la única es el cable.
 */
export function connectionRequiredMessage({ embedded = false } = {}) {
  return embedded
    ? 'Connect a destination first (host synth or MIDI hardware)'
    : 'Connect a MIDI device first';
}

/** Etiqueta corta del mismo aviso (tooltip del indicador y ayuda de atajos). */
export function connectionRequiredLabel({ embedded = false } = {}) {
  return embedded ? 'Connect a destination' : 'Connect MIDI';
}

/**
 * ¿Se espera el acuse al escribir en este destino?
 *
 * Solo cuando el destino es **el synth de software** (el que hospeda al Banco) *y* su
 * transporte sabe acusar recibo. Las dos mitades importan:
 *
 *  - `softsynth` — el MS2000 físico también sabe mandar `0x23`/`0x24`, pero que lo haga
 *    al recibir un dump **no está verificado** contra un equipo, así que a hardware real
 *    se le sigue escribiendo «dispara y olvida» (roadmap de ABDMS2000, item 2);
 *  - `confirm` — un transporte sin acuse no puede prometer nada.
 *
 * Con las dos, `sendPatch`/`sendBulk` devuelven la promesa del acuse y la UI dice
 * «enviado y confirmado» en vez de «enviado».
 *
 * @param {object} [capabilities] `transport.capabilities`
 * @returns {boolean}
 */
export function awaitsWriteConfirmation(capabilities = {}) {
  return capabilities?.softsynth === true && capabilities?.confirm === true;
}

/**
 * Capacidades del extremo hardware.
 * Declaradas (`contract.transport.hardware`) si existen; si no, deducidas de las
 * funciones implementadas — el comportamiento histórico, válido para hardware.
 */
export function hardwareCapabilities(contract) {
  if (!contract) {
    return { read: false, write: false, bulk: false, audition: false, dumpRequest: false, declared: false };
  }

  const declared = contract.transport?.hardware;
  if (declared) {
    return {
      read: !!declared.read,
      write: !!declared.write,
      bulk: !!declared.bulk,
      audition: !!declared.audition,
      dumpRequest: !!declared.dumpRequest,
      declared: true,
    };
  }

  return {
    read: !!(contract.buildDumpRequest && (contract.parsePatchSysEx || contract.parseDumpResponse)),
    write: !!contract.buildPatchSysEx,
    bulk: !!contract.buildBulkSysEx,
    audition: !!contract.supportsEditBuffer,
    dumpRequest: !!contract.buildDumpRequest,
    declared: false,
  };
}

/**
 * Extremo software declarado, o `null` si el modelo no lo tiene. No se deduce de
 * funciones a propósito: un contrato de hardware hereda `buildPatchSysEx` y eso
 * *no* significa que haya un synth al otro lado del bridge.
 */
export function softwareCapabilities(contract) {
  const declared = contract?.transport?.software;
  if (!declared) return null;

  const systems = (Array.isArray(declared.systems) ? declared.systems : [])
    .filter(system => PRESET_SYSTEMS.includes(system));

  return {
    systems,
    sysex: systems.includes('sysex'),
    native: systems.includes('native'),
    read: !!declared.read,
    write: !!declared.write,
    audition: !!declared.audition,
    capture: !!declared.capture,
  };
}

/**
 * Sistema de presets a usar: el pedido si el contrato lo expone, el único que haya,
 * o `null` cuando hay varios y hay que elegir (el Bank Manager no adivina: un
 * preset en SysEx y uno nativo no son intercambiables).
 */
export function resolvePresetSystem(contract, requested = null) {
  const software = softwareCapabilities(contract);
  if (!software) return null;
  if (requested && software.systems.includes(requested)) return requested;
  if (software.systems.length === 1) return software.systems[0];
  return null;
}

/**
 * Resumen para la UI y para elegir transporte.
 *
 * `missingSoftwareTransport` es el caso que se declaró mal: un softsynth sin
 * extremo de software no tiene a dónde escribir sus presets propios (el hardware
 * no está, por definición). Se reporta en vez de ofrecer botones que fallarían.
 */
export function describeTransports(contract) {
  const hardware = hardwareCapabilities(contract);
  const software = softwareCapabilities(contract);
  const softsynth = !!contract?.isSoftsynth;

  const badges = [];
  if (hardware.write) badges.push('Send');
  if (hardware.read) badges.push('Fetch');
  if (hardware.bulk) badges.push('Bulk');

  const softwareBadges = software
    ? ['Synth', ...software.systems.map(system => PRESET_SYSTEM_LABELS[system])]
    : [];

  return {
    softsynth,
    hardware,
    software,
    badges,
    softwareBadges,
    destinations: [
      ...(hardware.read || hardware.write ? [HARDWARE_DESTINATION] : []),
      ...(software ? [SOFTWARE_DESTINATION] : []),
    ],
    missingSoftwareTransport: softsynth && !software,
  };
}
