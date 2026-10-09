/**
 * Copy for the welcome panel and sidebar while the catalog is blocked.
 *
 * States that must not read alike:
 *  - `awaiting`    — embedded, the host has not answered *yet*. Normally lasts
 *                    milliseconds, so it must not look like a failure.
 *  - `expired`     — embedded, the grace period elapsed without an identity. Two
 *                    sub-cases, told apart with evidence instead of a guess:
 *                    the host answered the bridge but never reported a model
 *                    (its build predates the `hostModel` announcement), or it did
 *                    not answer the handshake at all (build older still: the
 *                    native→JS channel was broken before). Both say what to do.
 *  - `unsupported` — the host *did* answer, with a modelId this build has no
 *                    contract for (host and model catalog out of sync). When the
 *                    host reported its build stamp it is shown here, which is how
 *                    a version mismatch stops being a guess.
 *
 * Pure presentation: app.js keeps the DOM wiring (element creation, button
 * handler) so this is unit-testable without jsdom
 * (see tests/unit/hostScopeNotice.test.js).
 */

export const HOST_SCOPE_NOTICE_ID = 'host-scope-notice';
export const HOST_SCOPE_CONNECT_BTN_ID = 'host-scope-connect';

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const connectButton = () =>
  `<button class="btn btn-sm btn-primary" id="${HOST_SCOPE_CONNECT_BTN_ID}">Connect MIDI hardware</button>`;

/**
 * Sello del binario anfitrión tal y como lo reporta la ficha `hostInfo`
 * (`Source/Plugin/HostModelId.gen.h`): fecha de compilación, nivel de puente y
 * revisión. Con la ficha a mano, «host antiguo» deja de ser una suposición.
 */
function hostBuildNote(hostInfo, esc) {
  if (!hostInfo) return '';

  const revision = hostInfo.buildRevision || hostInfo.buildId;

  const parts = [];
  if (hostInfo.buildStamp) parts.push(`build ${esc(hostInfo.buildStamp)}`);
  if (Number.isFinite(hostInfo.protocol)) parts.push(`bridge protocol ${hostInfo.protocol}`);
  if (revision) parts.push(`git ${esc(revision)}`);
  if (parts.length === 0) return '';

  return ` <span style="opacity:0.75;">(host ${parts.join(' \u00b7 ')})</span>`;
}

/** Sidebar hint shown in place of the catalog tree while blocked. */
export function blockedNavHint({ unknown = false, expired = false } = {}) {
  if (unknown) return 'Unsupported hardware';
  return expired ? 'Connect MIDI hardware' : 'Waiting for host…';
}

/**
 * `{ scope, message }` for the welcome-panel notice: `scope` is the value the
 * DOM node advertises as `data-host-scope`, `message` the notice innerHTML.
 */
export function hostScopeNotice({
  unknownModelId = null,
  expired = false,
  hostInfo = null,
  hostAnswered = false,
  esc = escapeHtml
} = {}) {
  if (unknownModelId) {
    return {
      scope: 'unsupported',
      message: '<strong>Unsupported hardware.</strong> This synthesizer announced model ' +
        `<code>${esc(unknownModelId)}</code>, which this Bank Manager build does not ` +
        'know, so nothing is listed — the host and the model catalog are out of sync.' +
        hostBuildNote(hostInfo, esc) + ' ' +
        connectButton()
    };
  }

  if (expired) {
    return {
      scope: 'expired',
      message: '<strong>No hardware selected.</strong> ' + (hostAnswered
        ? 'The host answered the bridge but did not report which synthesizer it drives: ' +
          'its build predates the <code>hostModel</code> announcement, so nothing is listed. ' +
          'Rebuild and restart the plugin.'
        : 'The host did not answer the bridge handshake at all — builds older than this Bank ' +
          'Manager cannot, because the native to JS channel was broken before. Rebuild and ' +
          'restart the plugin.') + ' ' +
        connectButton()
    };
  }

  return {
    scope: 'awaiting',
    message: '<strong>Waiting for the host…</strong> This synthesizer has not reported its ' +
      'model yet.'
  };
}
