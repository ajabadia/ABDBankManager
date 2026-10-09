/**
 * ABD Bank Manager — Diagnóstico del anfitrión.
 *
 * La ficha `hostInfo` (ver core/hostContext.js) lleva el **sello de build** del
 * binario que hospeda al Bank Manager y su **nivel de puente**. Hasta ahora esos
 * datos solo se publicaban como atributos del banner (`data-host-build`,
 * `data-host-protocol`), invisibles para el usuario: se sabía contra qué build se
 * hablaba, pero no había dónde leerlo.
 *
 * Este módulo los convierte en un panel de diagnóstico con su chip de cabecera:
 * siempre a la vista cuando hay un anfitrión (el chip muestra el sello), y con
 * detalle al hacer clic. Sirve para lo mismo que la ficha: dejar de adivinar por
 * qué el catálogo está bloqueado o desincronizado.
 *
 * Niveles de puente: el contrato documentado en
 * ABDBankManager/DOCS/SYNTH_INTEGRATION_GUIDE.md §PASO 5.1 (recomendación 7), el
 * mismo que escribe `kHostBridgeProtocol` en el header generado del host
 * (`Source/Plugin/HostModelId.gen.h`):
 *   2 = anuncia su `modelId` (`hostModel`), 3 = responde la ficha
 *   (`requestHostInfo` → `hostInfo`), 4 = puente MIDI de hardware. Antes del nivel
 *   2 el canal nativo → JS no entregaba nada.
 *
 * Presentación pura (sin DOM, sin storage) para poder testearla sin jsdom — mismo
 * patrón que `hostScopeNotice.js`; app.js conserva el cableado (crear el nodo,
 * asignar el `onclick`).
 */

export const HOST_DIAG_CHIP_ID = 'host-diag';
export const HOST_DIAG_PANEL_ID = 'host-diagnostics';

/**
 * Capacidades que habilita cada nivel, de menor a mayor. Es lo que se le puede
 * pedir al host, no una fecha: con solo mirar el nivel ya se sabe si el catálogo
 * bloqueado puede explicarse («no anuncia») o si el fetch tiene otro extremo.
 */
export const BRIDGE_PROTOCOL_LEVELS = [
  { level: 2, capability: 'announces its modelId (<code>hostModel</code>)' },
  { level: 3, capability: 'answers the host info handshake (<code>requestHostInfo</code>)' },
  { level: 4, capability: 'moves bytes over the hardware MIDI bridge' }
];

/** Nivel más alto que este build entiende (último de la tabla de arriba). */
export const BANK_MANAGER_KNOWN_PROTOCOL =
  BRIDGE_PROTOCOL_LEVELS[BRIDGE_PROTOCOL_LEVELS.length - 1].level;

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Interpreta el nivel de puente anunciado.
 * @param {unknown} protocol
 * @returns {{ level: number|null, reported: boolean, capabilities: object[], missing: object[],
 *            unknownToUs: boolean }}
 */
export function describeHostProtocol(protocol) {
  const value = protocol === null || protocol === undefined ? NaN : Number(protocol);
  const reported = Number.isFinite(value);
  const level = reported ? value : null;

  const capabilities = reported
    ? BRIDGE_PROTOCOL_LEVELS.filter(entry => entry.level <= level)
    : [];
  const missing = reported
    ? BRIDGE_PROTOCOL_LEVELS.filter(entry => entry.level > level)
    : BRIDGE_PROTOCOL_LEVELS;

  return {
    level,
    reported,
    capabilities,
    missing,
    // Un nivel por encima del que este build conoce: el host es más nuevo. No se
    // inventa una capacidad, solo se avisa de que hay más de lo que sabemos leer.
    unknownToUs: reported && level > BANK_MANAGER_KNOWN_PROTOCOL
  };
}

const chipValue = (hostInfo, protocol) => {
  const parts = [];
  if (hostInfo?.buildStamp) parts.push(`build ${hostInfo.buildStamp}`);
  if (protocol.reported) parts.push(`protocol ${protocol.level}`);
  return parts.join(' · ');
};

/**
 * Modelo del panel: `state` distingue los casos que no pueden leerse igual,
 * `chipLabel` es lo que ve el usuario sin hacer clic (null = no hay anfitrión que
 * diagnosticar) y `rows` son las filas del panel.
 *
 * @param {{ hostInfo?: object|null, embedded?: boolean, answered?: boolean,
 *          bridgeType?: string|null }} [args]
 */
export function hostDiagnosticsModel({
  hostInfo = null,
  embedded = false,
  answered = false,
  bridgeType = null
} = {}) {
  const protocol = describeHostProtocol(hostInfo?.protocol);
  const bridge = bridgeType || 'unknown';

  if (!embedded) {
    return {
      state: 'standalone',
      chipLabel: null,
      headline: 'This Bank Manager runs standalone: there is no hosting synthesizer, ' +
        'so there is no host build stamp to report.',
      rows: [
        { label: 'Bridge', value: bridge },
        { label: 'Host', value: 'none (standalone)' }
      ],
      protocol,
      hostInfo: null
    };
  }

  const hostRow = hostInfo?.displayName
    ? `${hostInfo.displayName}${hostInfo.modelId ? ` (${hostInfo.modelId})` : ''}`
    : null;

  const baseRows = [
    { label: 'Bridge', value: bridge },
    { label: 'Host', value: hostRow },
    { label: 'Manufacturer', value: hostInfo?.manufacturer || null },
    { label: 'Build stamp', value: hostInfo?.buildStamp || null, missing: 'not reported' },
    { label: 'Build revision', value: hostInfo?.buildRevision || hostInfo?.buildId || null, missing: 'not reported' },
    {
      label: 'Bridge protocol',
      value: protocol.reported ? String(protocol.level) : null,
      missing: 'not reported'
    }
  ];

  const finish = (state, headline, chipLabel) => ({
    state,
    chipLabel,
    headline,
    rows: baseRows,
    protocol,
    hostInfo
  });

  if (hostInfo && (protocol.reported || hostInfo.buildStamp)) {
    return finish(
      'ok',
      `Diagnostics of the synthesizer hosting this Bank Manager (${bridge} bridge): ` +
        'any mismatch with this Bank Manager build can be read off below.',
      chipValue(hostInfo, protocol)
    );
  }

  if (hostInfo) {
    return finish(
      'unsigned',
      'The host identified itself but did not report a build stamp or a bridge protocol ' +
        'level: its build predates the host info handshake (protocol 3).',
      'host identified · no build stamp'
    );
  }

  if (answered) {
    return finish(
      'unidentified',
      'The host answered the bridge (state or parameter sync arrived) but never reported ' +
        'which synthesizer it drives nor its build: its build predates the hostModel ' +
        'announcement (protocol 2).',
      'host answered · no build stamp'
    );
  }

  return finish(
    'silent',
    'The host has not answered the bridge handshake at all: builds older than this Bank ' +
      'Manager cannot, because the native to JS channel was broken before protocol 2.',
    'no host answer'
  );
}

/**
 * HTML del panel de diagnóstico. `model` sale de `hostDiagnosticsModel()`.
 * Devuelve cadena vacía si no hay nada que mostrar (standalone), de modo que
 * app.js no abre un modal vacío.
 */
export function hostDiagnosticsPanel(model, { esc = escapeHtml } = {}) {
  if (!model || model.state === 'standalone') return '';

  const row = ({ label, value, missing }) => `
      <div class="host-diag-row">
        <span class="host-diag-row-label">${esc(label)}</span>
        <span class="host-diag-row-value${value ? '' : ' is-missing'}">${
          value ? esc(value) : esc(missing || 'unknown')}</span>
      </div>`;

  const capabilityRow = ({ level, capability }, supported) => `
      <div class="host-diag-cap${supported ? ' is-supported' : ''}">
        <span class="host-diag-cap-mark">${supported ? '&#10003;' : '&#8212;'}</span>
        <span>${supported ? '' : 'not reported: '}${capability}
          <span class="host-diag-cap-level">(&ge; ${level})</span></span>
      </div>`;

  const capabilities = [
    ...model.protocol.capabilities.map(entry => capabilityRow(entry, true)),
    ...model.protocol.missing.map(entry => capabilityRow(entry, false))
  ].join('');

  const unknownNote = model.protocol.unknownToUs
    ? `<p class="host-diag-note is-warning">The host reports bridge protocol ` +
      `${esc(model.protocol.level)}, newer than the ${BANK_MANAGER_KNOWN_PROTOCOL} this Bank ` +
      'Manager build knows: it may use features that are not listed here.</p>'
    : '';

  return `<div style="padding:1rem;" id="${HOST_DIAG_PANEL_ID}" data-host-diag-state="${esc(model.state)}">
    <h3 style="margin:0 0 0.6rem;">Host diagnostics</h3>
    <p style="margin:0 0 0.8rem;color:var(--text-secondary);font-size:0.85rem;">${esc(model.headline)}</p>
    <div class="host-diag-rows">${model.rows.map(row).join('')}</div>
    <h4 style="margin:0.9rem 0 0.4rem;font-size:0.85rem;">Bridge protocol capabilities</h4>
    ${capabilities}
    ${unknownNote}
    <div class="modal-actions" style="margin-top:1rem;">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Close</button>
    </div>
  </div>`;
}
