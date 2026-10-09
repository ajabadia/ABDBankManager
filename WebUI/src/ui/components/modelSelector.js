/**
 * ABD Bank Manager â€” Model Selector Component
 *
 * Reusable model selector with manufacturer filtering and auto-configuration display.
 * Uses contractRegistryData for data, no hardcoded model lists.
 */
import { contractRegistryData } from '../../contracts/modelContracts.js';
import { getVisibleModelIds, isKnownModel } from '../../core/modelRegistry.js';

let currentFilter = '';
let selectedModelId = null;
let onSelectCallback = null;
let contextModelId = null;
/**
 * modelId announced by the *hosting synth* (bridge `hostModel`). Sticky and
 * separate from `contextModelId`: the host states which hardware its build
 * supports, whereas a MIDI connection is a session choice the user can change.
 * It is what scopes the manual MIDI model picker (see
 * `getMidiConnectableModels`). `null` means standalone: no host constraint.
 * @type {string|null}
 */
let hostContextModelId = null;
/**
 * Session-only escape hatch for the manual MIDI picker: the user explicitly
 * asked to list hardware outside the host's family (a build can still be used
 * with other hardware, just with the contract the user picks). Never persisted,
 * never touches the navigation, and dropped as soon as the host announces a
 * different model.
 * @type {boolean}
 */
let allowForeignMidiHardware = false;
/**
 * Is this instance embedded inside a synth host (the plugin iframe) instead of
 * running as the standalone Bank Manager? Set once at boot from the bridge type
 * (see app.js). Embedded and standalone differ in one thing that matters here:
 * only standalone may offer the whole registry by default.
 * @type {boolean}
 */
let embeddedHost = false;

/** @type {Set<(modelId: string|null) => void>} */
const contextListeners = new Set();

/**
 * Current host context (modelId announced by the hosting synth or by a MIDI
 * connection). `null` means standalone: every registered model is visible.
 * @returns {string|null}
 */
export function getContextModelId() {
  return contextModelId;
}

/**
 * Subscribe to host-context changes. The Bank Manager navigation uses this to
 * rebuild its sidebar/tree so it never lists hardware the host does not
 * support (see app.js → handleHostContextChange).
 * @param {(modelId: string|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onContextModelChange(callback) {
  contextListeners.add(callback);
  return () => contextListeners.delete(callback);
}

function notifyContextChange() {
  for (const callback of contextListeners) {
    try { callback(contextModelId); } catch (e) { console.error('[ModelSelector] Context listener error:', e); }
  }
}

/**
 * Update the module context. Returns true only when the value actually changed
 * (so `setContextModelId` can stay idempotent for repeated `hostModel` messages).
 * Only a `host` source updates the sticky host constraint, so a MIDI connection
 * (or a render-time context) can never widen or clear what the host announced.
 * @param {string|null|undefined} modelId
 * @param {'host'|'session'|'render'} source
 * @returns {boolean}
 */
function applyContext(modelId, source = 'host') {
  const next = modelId || null;
  if (source === 'host') {
    // A *different* host announcement re-scopes the MIDI picker, so the override
    // cannot leak into another synth's family. Repeats (same modelId) keep it.
    if (next !== hostContextModelId) allowForeignMidiHardware = false;
    hostContextModelId = next;
  }
  if (next === contextModelId) return false;
  contextModelId = next;
  return true;
}

/** @type {Map<Element, object>} container → last render options (for hot re-render) */
const renderedContainers = new Map();

export function initModelSelector(options = {}) {
  onSelectCallback = options.onSelect || null;
  selectedModelId = options.initialModelId || null;
  contextModelId = options.contextModelId || null;
}

/**
 * Model announced by the hosting synth, or `null` in standalone.
 * @returns {string|null}
 */
/**
 * Declare the run mode. `true` only for the embedded/plugin-host case; the
 * browser build and the stand-alone JUCE app keep the full registry.
 * @param {boolean} embedded
 */
export function setEmbeddedHost(embedded) {
  embeddedHost = Boolean(embedded);
}

/**
 * Are we running embedded inside a synth host?
 * @returns {boolean}
 */
export function isEmbeddedHost() {
  return embeddedHost;
}

/**
 * Is the current hardware context a modelId this build has no contract for?
 *
 * Happens when the host announces an id the catalog does not contain (host and
 * Bank Manager built from different contract versions). It is *not* the same as
 * "no context": there is a claim, we just cannot resolve it.
 * @returns {boolean}
 */
export function isUnknownContext() {
  return Boolean(contextModelId) && !isKnownModel(contextModelId);
}

/**
 * Must the model catalog stay hidden?
 *
 * Two cases, and neither may fall back to the whole registry:
 *  - **Unknown context**: the host announced a modelId with no contract here.
 *    Listing other hardware would be a lie about what this build can drive.
 *  - **Embedded without any context**: the host owns the catalog, so until it
 *    announces its modelId (bridge `hostModel`) or the user connects MIDI
 *    hardware, the 22 registered models must not be offered.
 *
 * Standalone: never hidden — browsing every supported synth *is* the product.
 * The escape is always a hardware context the user can assert: the manual MIDI
 * picker stays complete while no (resolvable) host context exists.
 * @returns {boolean}
 */
export function isCatalogBlocked() {
  if (isUnknownContext()) return true;
  return embeddedHost && !contextModelId;
}

export function getHostContextModelId() {
  return hostContextModelId;
}

/**
 * Has the user opted into seeing hardware outside the host's family in the
 * manual MIDI picker? `false` by default: the scope is opt-*out*, never silent.
 * @returns {boolean}
 */
export function isForeignMidiHardwareAllowed() {
  return allowForeignMidiHardware;
}

/**
 * Turn the manual MIDI picker's escape hatch on (`getMidiConnectableModels` reads
 * it via `{ allowForeign }`). Session-only and explicit: nothing else calls it.
 * @param {boolean} [allowed]
 */
export function setForeignMidiHardwareAllowed(allowed = true) {
  allowForeignMidiHardware = Boolean(allowed);
}

/**
 * Set the context model ID. When provided, the selector will only show
 * models compatible with this context (canonical + compatibleModels forward
 * and reverse). When null or omitted, all models are shown (standalone behavior).
 * @param {string|null} modelId
 * @param {'host'|'session'|'render'} [source] What is asserting the context:
 *   `host` (default) is a `hostModel` announcement and additionally becomes the
 *   sticky host constraint; `session` is a MIDI connection (user choice, may be
 *   changed later) and `render` an explicit per-render context (New Bank modal).
 */
export function setContextModelId(modelId, source = 'host') {
  const changed = applyContext(modelId, source);
  // Re-render every selector currently mounted, preserving its original options.
  for (const [container, opts] of renderedContainers) {
    if (document.contains(container)) renderModelSelector(container, opts);
    else renderedContainers.delete(container);
  }
  // Tell the rest of the app (navigation, search) to follow the new context.
  if (changed) notifyContextChange();
}

export function renderModelSelector(container, options = {}) {
  const { manufacturerFilter = null, showAutoConfig = true, onSelect = null } = options;
  
  if (onSelect) onSelectCallback = onSelect;

  // Honor an explicit context passed at render time (e.g. the New Bank modal).
  // `undefined` means "keep the current module context" (standalone default).
  // Only notifies (never re-renders) to avoid recursing into this same render.
  if (options.contextModelId !== undefined && applyContext(options.contextModelId, 'render')) notifyContextChange();

  // NB: deliberately no `contextModelId` here — re-renders must pick up the current
  // module context (set by setContextModelId) instead of restoring a stale one.
  renderedContainers.set(container, { manufacturerFilter, showAutoConfig, onSelect: onSelectCallback });

  // Embedded without a hardware context, or an unresolvable one: register the
  // container (so a later announcement repaints this very entry) but offer no
  // model yet — the message mirrors the navigation notice in app.js.
  if (isCatalogBlocked()) {
    container.innerHTML = `
      <div class="model-selector">
        <p class="model-selector__blocked">${isUnknownContext()
          ? 'This synthesizer reported hardware this Bank Manager does not know — connect MIDI hardware to choose a model.'
          : 'No hardware selected yet — connect your MIDI hardware to choose a model.'}</p>
      </div>`;
    return;
  }

  const models = getFilteredModels(manufacturerFilter);
  const manufacturers = getManufacturers(models);

  container.innerHTML = `
    <div class="model-selector">
      <div class="model-selector__filter">
        <label for="model-search">Search model</label>
        <input type="search" id="model-search" placeholder="Filter by name..." 
          value="${currentFilter}" style="width:100%;padding:0.4rem;border:1px solid var(--border);border-radius:4px;">
      </div>
      
      <div class="model-selector__manufacturers">
        ${Object.keys(manufacturers).map(mfr => `
          <details class="model-selector__mfr" ${manufacturers[mfr].some(m => m.modelId === selectedModelId) ? 'open' : ''}>
            <summary class="model-selector__mfr-summary">
              <span class="model-selector__mfr-name">${escHtml(mfr)}</summary>
              <span class="model-selector__mfr-count">${manufacturers[mfr].length} model${manufacturers[mfr].length > 1 ? 's' : ''}</span>
            </summary>
            <ul class="model-selector__models">
              ${manufacturers[mfr].map(model => `
                <li class="model-selector__model ${model.modelId === selectedModelId ? 'selected' : ''}" 
                    data-model-id="${model.modelId}" data-mfr="${mfr}">
                  <img class="model-selector__thumb" src="${getModelThumbnail(model.modelId)}" alt="" loading="lazy" onerror="this.src='/images/models/thumbs/placeholder-synth.svg'">
                  <span class="model-selector__name">${escHtml(model.displayName)}</span>
                  <span class="model-selector__badge">${model.programsPerBank} patches/bank</span>
                </li>
              `).join('')}
            </ul>
          </details>
        `).join('')}
      </div>
      
      ${showAutoConfig && selectedModelId ? renderAutoConfig(selectedModelId) : ''}
    </div>
  `;

  // Event listeners
  const searchInput = container.querySelector('#model-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter = e.target.value.trim();
      renderModelSelector(container, { manufacturerFilter, showAutoConfig, onSelect: onSelectCallback, contextModelId });
    });
  }

  container.querySelectorAll('.model-selector__model').forEach(li => {
    li.addEventListener('click', () => {
      selectedModelId = li.dataset.modelId;
      if (onSelectCallback) onSelectCallback(selectedModelId, getModelMetadata(selectedModelId));
      renderModelSelector(container, { manufacturerFilter, showAutoConfig, onSelect: onSelectCallback, contextModelId });
    });
  });
}

function getFilteredModels(mfrFilter) {
  // Start from visible model IDs (context-aware filtering when contextModelId is set).
  // modelMetadata is keyed by modelId and now also carries it; keep the key as a
  // fallback so registries generated before that field existed still render a valid
  // data-model-id (otherwise the selection would be the string "undefined").
  // Embedded without a hardware context → no model at all (see isCatalogBlocked).
  const visibleIds = isCatalogBlocked() ? [] : getVisibleModelIds(contextModelId);
  let models = visibleIds
    .map(id => {
      const meta = contractRegistryData.modelMetadata[id];
      return meta ? { ...meta, modelId: meta.modelId || id } : null;
    })
    .filter(Boolean);
  if (mfrFilter) {
    models = models.filter(m => m.manufacturer === mfrFilter);
  }
  if (currentFilter) {
    const q = currentFilter.toLowerCase();
    models = models.filter(m => m.displayName.toLowerCase().includes(q));
  }
  return models;
}

function getManufacturers(models) {
  const mfrs = {};
  for (const model of models) {
    const mfr = model.manufacturer || 'Otros';
    if (!mfrs[mfr]) mfrs[mfr] = [];
    mfrs[mfr].push(model);
  }
  // Sort manufacturers alphabetically, then models by displayName
  const sorted = {};
  Object.keys(mfrs).sort().forEach(k => {
    sorted[k] = mfrs[k].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
  return sorted;
}

function getModelMetadata(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (!meta) return null;
  // Same contract as getFilteredModels: always expose the id alongside its metadata.
  return { ...meta, modelId: meta.modelId || modelId };
}

function getModelThumbnail(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (meta?.thumbnail) return `/images/thumbs/${meta.thumbnail}`;
  return '/images/models/thumbs/placeholder-synth.svg';
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&apos;' }[c]));
}

function renderAutoConfig(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (!meta) return '';

  const midiConfig = getMidiConfig(modelId);
  
  return `
    <div class="model-selector__autoconfig">
      <h4>Auto-configuration for ${escHtml(meta.displayName)}</h4>
      <div class="autoconfig__grid">
        <div class="autoconfig__item">
          <label>Manufacturer</label>
          <span>${escHtml(meta.manufacturer)}</span>
        </div>
        <div class="autoconfig__item">
          <label>Bank capacity</label>
          <span>${meta.bankCapacity} patches (${meta.programsPerBank} per bank)</span>
        </div>
        <div class="autoconfig__item">
          <label>Patch size</label>
          <span>${meta.patchDataSize} bytes</span>
        </div>
        <div class="autoconfig__item">
          <label>Default MIDI channel</label>
          <span>${midiConfig?.channel || 1}</span>
        </div>
        <div class="autoconfig__item">
          <label>MIDI device ID</label>
          <span>${midiConfig?.deviceId || 'N/A'}</span>
        </div>
        <div class="autoconfig__item">
          <label>Inter-message delay</label>
          <span>${midiConfig?.interMessageDelayMs || 0} ms</span>
        </div>
        <div class="autoconfig__item">
          <label>Dump timeout</label>
          <span>${midiConfig?.dumpTimeoutMs || 3000} ms</span>
        </div>
        <div class="autoconfig__item">
          <label>Categories</label>
          <span>${meta.categories?.join(', ') || '—'}</span>
        </div>
        <div class="autoconfig__item">
          <label>Compatible models</label>
          <span>${meta.compatibleModels?.join(', ') || '—'}</span>
        </div>
      </div>
    </div>
  `;
}

function getMidiConfig(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (!meta) return {};
  // Derive MIDI config from metadata (same logic as getMidiConfig in modelContracts)
  return {
    channel: 1,
    deviceId: meta.manufacturer === 'Korg' ? 16 : 16,
    interMessageDelayMs: 20,
    dumpTimeoutMs: 3000
  };
}

export function getSelectedModelId() {
  return selectedModelId;
}

export function setSelectedModelId(modelId) {
  selectedModelId = modelId;
}

export function resetFilter() {
  currentFilter = '';
}
