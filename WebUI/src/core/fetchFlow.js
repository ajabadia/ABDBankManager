/**
 * ABD Bank Manager — Flujo de Fetch: cómo pedir el banco y qué contar después.
 *
 * `handleMidiFetch()` de `app.js` tomaba estas dos decisiones en línea, mezcladas con
 * el DOM y con Dexie, así que no se podían comprobar sin montar la app entera. Aquí
 * están como funciones **puras** (sin DOM, sin transporte, sin base de datos): la UI
 * les pasa lo que tiene y recibe la decisión y el mensaje.
 *
 *  1. `planBankFetch` — **cómo** traer el banco: de una vez (un `bank.read` por el
 *     bridge de software, o un `0x0E`/`0x4C` por MIDI) o slot a slot.
 *  2. `summarizeBankFetch` — **qué** contar cuando llega el volcado: el contador de
 *     plazas y el nivel del aviso. Un volcado puede venir incompleto (el destino tiene
 *     menos memoria de la que declara, o no contestó a todo) y el banco se queda con lo
 *     que sí llegó; nadie debe suponer el resto.
 *  3. `midiBridgeBlocksFetch` — **si** el anfitrión puede traer el banco: con el destino
 *     software, no hace falta ningún puerto MIDI (ni virtual).
 */

/**
 * ¿El estado del puente MIDI del anfitrión impide el Fetch?
 *
 * Solo por MIDI. Con el destino **software** el banco viaja por el bridge
 * (`bank.read` → `bank.data`), así que un anfitrión sin hardware MIDI —o sin un puerto
 * virtual al que asomarse— puede pedir su memoria completa igual. Antes, el error del
 * puente abortaba el Fetch también para el destino software.
 *
 * @param {object}  args
 * @param {boolean} [args.software]      `true` si el destino es el synth anfitrión (bridge)
 * @param {string}  [args.midiError]     motivo que reportó el anfitrión (`hardware.status`)
 * @param {boolean} [args.midiListening] `false` si ese puente no está escuchando
 * @returns {boolean}
 */
export function midiBridgeBlocksFetch({ software = false, midiError = null, midiListening = null } = {}) {
  if (software) return false;
  return midiError != null && midiListening === false;
}

/**
 * Cómo traer el banco del destino conectado.
 *
 * El transporte de software pide el banco **de una vez** (`bank.read` → `bank.data`) y
 * él mismo cae al verbo por slot si el host contesta `unsupported-action`, así que su
 * decisión no depende de `parseDumpResponse` (que es un criterio de SysEx de hardware).
 * Por MIDI sí: un contrato que no sepa leer un volcado se trae slot a slot.
 *
 * @param {object}  args
 * @param {object}  [args.transport] transporte activo (MIDI o software)
 * @param {object}  [args.contract]  contrato del modelo conectado
 * @param {boolean} [args.software]  `true` si el destino es el synth que hospeda al Banco
 * @returns {{ mode: 'bulk' | 'perSlot', count: number }}
 */
export function planBankFetch({ transport = null, contract = null, software = false } = {}) {
  const count = contract?.bankCapacity || 128;
  const bulk = typeof transport?.fetchAll === 'function' && (software || !!contract?.parseDumpResponse);
  return { mode: bulk ? 'bulk' : 'perSlot', count };
}

/**
 * Resumen del volcado recibido: contador de plazas, direccionamiento y nivel del aviso.
 *
 * El rango (`A.01–H.16`) sale del propio contrato (`getProgramAddress`) para no repetir
 * el direccionamiento del modelo aquí; sin él, el mensaje se queda sin rango.
 *
 * @param {object}   args
 * @param {Array<{slot: number}>} [args.patches]         lo que llegó
 * @param {number}   [args.expected]                     plazas que declara el destino
 * @param {(index: number) => string} [args.getProgramAddress] direccionamiento del modelo
 * @returns {{ level: 'success'|'warning'|'error', received: number, expected: number, range: string, message: string }}
 */
export function summarizeBankFetch({ patches = [], expected, getProgramAddress = null } = {}) {
  const received = patches.length;
  // Sin capacidad declarada no se puede decir que falte nada: se cuenta lo que llegó.
  const total = Number.isFinite(expected) && expected > 0 ? expected : received;

  const addressOf = typeof getProgramAddress === 'function' ? getProgramAddress : null;
  const lastIndex = received > 0 ? (patches[received - 1]?.slot ?? received - 1) : 0;
  const from = addressOf ? addressOf(patches[0]?.slot ?? 0) : null;
  const to = addressOf ? addressOf(lastIndex) : null;
  const range = received > 0 && from && to ? ` (${from}–${to})` : '';

  if (received === 0) {
    return { level: 'error', received, expected: total, range, message: 'Fetch returned no slots' };
  }
  if (received < total) {
    return {
      level: 'warning', received, expected: total, range,
      message: `Fetch completado — ${received}/${total} plazas${range}: el resto no llegó`,
    };
  }
  return {
    level: 'success', received, expected: total, range,
    message: `Fetch completado — ${received}/${total} plazas${range}`,
  };
}
