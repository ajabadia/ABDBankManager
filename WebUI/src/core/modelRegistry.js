/**
 * ABD Bank Manager — Model Registry
 *
 * Single source of truth for model capabilities.
 * Built at load time from contracts + parameter schemas.
 * No hardcoded model lists anywhere else in the app.
 */

import { MODEL_CONTRACTS} from '../contracts/modelContracts.js';
import { decodePro800Parameters} from './pro800Parameters.js';
import { decodeDeepMindParameters} from './deepMindParameters.js';
import { decodeDx7Parameters, getDx7TableParameters} from './dx7Parameters.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Parameter schema registry (built from contracts, no hardcodes)
// ═══════════════════════════════════════════════════════════════════════════════
// Each model declares parameterSchemaKey in its contract.
// Schema functions are mapped by key, then assigned to contracts that reference them.

const SCHEMA_DECODE_MAP = {
  'behringer-pro800': { decode: decodePro800Parameters, getTable: decodePro800Parameters},
  'behringer-deepmind12': { decode: decodeDeepMindParameters, getTable: decodeDeepMindParameters},
  'behringer-dm12': { decode: decodeDeepMindParameters, getTable: decodeDeepMindParameters},
  'yamaha-dx7': { decode: decodeDx7Parameters, getTable: getDx7TableParameters},
  'yamaha-dx7ii': { decode: decodeDx7Parameters, getTable: getDx7TableParameters},
};

const PARAMETER_SCHEMAS = {};
for (const contract of MODEL_CONTRACTS) {
  const key = contract.parameterSchemaKey;
  if (key && SCHEMA_DECODE_MAP[key]) {
    const { decode, getTable} = SCHEMA_DECODE_MAP[key];
    PARAMETER_SCHEMAS[contract.modelId] = {
      decode,
      getTable,
      formatLabel: rawData => `${contract.displayName}\n· ${contract.patchDataSize}\nbytes`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDI detection patterns (built from contracts, no hardcodes)
// ═══════════════════════════════════════════════════════════════════════════════

const MIDI_DETECT_PATTERNS = MODEL_CONTRACTS
  .filter(c => c.midiDetection)
  .map(c => ({
    pattern: c.midiDetection.portPattern,
    modelId: c.modelId,
    displayName: c.midiDetection.displayName,
  })).filter(x => x.pattern); // ensure pattern exists

// ═══════════════════════════════════════════════════════════════════════════════
// Cached lookups (built once at load)
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {Map<string, object>} modelId → contract */
const contractMap = new Map(MODEL_CONTRACTS.map(c => [c.modelId, c]));

/**
 * All registered models, sorted by display name.
 * @type {Array<{id: string, name: string, manufacturer: string}>}
 */
const modelList = MODEL_CONTRACTS
  .map(c => ({ id: c.modelId, name: c.displayName, manufacturer: c.manufacturer || ''}))
  .sort((a, b) => a.name.localeCompare(b.name));

// ═══════════════════════════════════════════════════════════════════════════════
// Context-aware visibility (new — filters models by host synth context)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get visible model IDs for a given context.
 * When contextModelId is provided, returns the canonical model + its
 * compatibleModels (forward + reverse) — i.e. the set of hardware the
 * host synth's UI should present. When omitted (standalone mode), returns
 * all registered model IDs (current behaviour, unchanged).
 * @param {string} [contextModelId] - Optional modelId from the hosting synth.
 *   Comes from the anfitrión via whatever channel it chooses (MIDI connect,
 *   bridge message, localStorage, etc.). If absent, no filtering applies.
 * @returns {string[]}
 */
export function getVisibleModelIds(contextModelId) {
  if (!contextModelId) return modelList.map(m => m.id);
  // A modelId without a contract is NOT a licence to show everything: someone
  // asked for a specific hardware and this build cannot resolve it (host and
  // catalog out of sync). Returning [] keeps the caller honest — the embedded
  // Bank Manager then shows its "unsupported hardware" notice instead of the 22
  // synthesisers the host never claimed it can drive. "Browser everything" is
  // the `undefined` branch above (standalone), not this one.
  if (!contractMap.has(contextModelId)) return [];
  return getHardwareIds(contextModelId);
}

/**
 * Compute hardware IDs for a model from its contract:
 * canonical modelId + forward compatibleModels + reverse compatibleModels.
 * @param {string} modelId
 * @returns {string[]}
 */
function getHardwareIds(modelId) {
  const contract = contractMap.get(modelId);
  if (!contract) return [modelId];
  const ids = new Set([modelId]);
  if (contract.compatibleModels) {
    for (const id of contract.compatibleModels) ids.add(id);
  }
  for (const c of MODEL_CONTRACTS) {
    if (c.modelId !== modelId && c.compatibleModels?.includes(modelId)) ids.add(c.modelId);
  }
  return Array.from(ids);
}

// ════════════════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get all registered models (for dropdowns, selectors).
 * @returns {Array<{id: string, name: string, manufacturer: string}>}
 */
export function getAllModels() {
  return modelList;
}

/**
 * Get a contract by modelId.
 * @param {string} modelId
 * @returns {object|null}
 */
export function getContract(modelId) {
  return contractMap.get(modelId) || null;
}  /**
 * Get visible models for a given context (filtered by hardware compatibility).
 * When contextModelId is omitted, returns all models (standalone behaviour).
 * @param {string} [contextModelId]
 * @returns {Array<{id: string, name: string, manufacturer: string}>}
 */
export function getVisibleModels(contextModelId) {
  const ids = getVisibleModelIds(contextModelId);
  return modelList.filter(m => ids.includes(m.id));
}

/**
 * Sentinel of the manual MIDI picker's escape hatch ("Other hardware…").
 * Never a real modelId: `app.js` intercepts it, flips the session override and
 * rebuilds the list with the whole registry. Lives here so the UI and the tests
 * share one constant instead of a magic string.
 * @type {string}
 */
export const MIDI_ALL_HARDWARE = '__all_hardware__';

/**
 * Models the user may pick in the *manual MIDI* model dropdown.
 *
 * Rule: only the **host** announcement constrains it. Inside a plugin the build
 * knows which hardware it can drive (the ABDMS2000 SysEx contract cannot fetch a
 * Juno), so the picker lists the announced context's family. The standalone Bank
 * Manager — including when the current context merely comes from a MIDI
 * connection, which is a session choice — keeps the whole registry, otherwise
 * you could not switch from one device to another without reloading.
 * @param {string|null|undefined} hostContextModelId Model announced by the host
 *   (`getHostContextModelId()`), `null` in standalone.
 * @param {{allowForeign?: boolean}} [options] `allowForeign` is the opt-in escape
 *   hatch: the user explicitly asked to see hardware outside the host's family
 *   (session-only, never persisted, never widens the navigation).
 * @returns {Array<{id: string, name: string, manufacturer: string}>}
 */
export function getMidiConnectableModels(hostContextModelId, { allowForeign = false } = {}) {
  if (!hostContextModelId || allowForeign) return getAllModels();
  const scoped = getVisibleModels(hostContextModelId);
  return scoped.length ? scoped : getAllModels();
}

/**
 * Can the manual MIDI picker be scoped to the host's family?
 *
 * Only when the announced modelId maps to a known contract. An **unknown** id
 * leaves nothing to scope to, so the picker stays complete (exactly the fallback
 * `getMidiConnectableModels` applies) and the UI must not claim otherwise.
 * @param {string|null|undefined} hostContextModelId
 * @returns {boolean}
 */
export function isHostScopeResolvable(hostContextModelId) {
  return Boolean(hostContextModelId) && contractMap.has(hostContextModelId);
}

/**
 * Get the full contracts visible for a host context (canonical modelId plus its
 * compatible hardware, forward and reverse). Same rule as `getVisibleModels`,
 * but returning the complete contract objects the Bank Manager navigation needs
 * (displayName, bankCapacity, buildPatchSysEx, …).
 *
 * The context reaches here from the hosting synth (bridge `hostModel`) or from a
 * MIDI connection; without it every registered model is visible (standalone).
 * @param {string} [contextModelId]
 * @returns {object[]}
 */
export function getVisibleContracts(contextModelId) {
  const visible = new Set(getVisibleModelIds(contextModelId));
  return MODEL_CONTRACTS.filter(c => visible.has(c.modelId));
}

/**
 * Group contracts by manufacturer, with models sorted by display name.
 *
 * Pure helper shared by the sidebar, the cascade view, the tree view and the
 * manufacturer landing page, so all of them stay consistent with the host
 * context (a single grouped structure cannot drift between views).
 * @param {object[]} contracts
 * @returns {Record<string, object[]>}
 */
export function groupContractsByManufacturer(contracts) {
  const grouped = {};
  for (const contract of contracts) {
    const mfr = contract.manufacturer || 'Otros';
    if (!grouped[mfr]) grouped[mfr] = [];
    grouped[mfr].push(contract);
  }
  for (const mfr of Object.keys(grouped)) {
    grouped[mfr].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return grouped;
}

/**
 * Get display name for a modelId.
 * @param {string} modelId
 * @returns {string}
 */
export function getModelDisplayName(modelId) {
  return contractMap.get(modelId)?.displayName || modelId;
}

/**
 * Get parameter schema for a model (if available).
 * @param {string} modelId
 * @returns {{ decode: Function, getTable: Function, formatLabel: Function}|null}
 */
export function getParameterSchema(modelId) {
  return PARAMETER_SCHEMAS[modelId] || null;
}

/**
 * Check if a model has parameter interpretation support.
 * @param {string} modelId
 * @returns {boolean}
 */
export function hasParameterSchema(modelId) {
  return modelId in PARAMETER_SCHEMAS;
}

/**
 * Auto-detect model from a MIDI port name.
 * @param {string} portName
 * @returns {{ modelId: string, displayName: string}|null}
 */
export function detectModelFromPortName(portName) {
  const n = (portName || '').toLowerCase();
  for (const { pattern, modelId, displayName} of MIDI_DETECT_PATTERNS) {
    if (pattern.test(n)) return { modelId, displayName};
  }
  return null;
}

/**
 * Check if a modelId is a known model (has a contract).
 * @param {string} modelId
 * @returns {boolean}
 */
export function isKnownModel(modelId) {
  return contractMap.has(modelId);
}

/**
 * Get manufacturer from modelId.
 * @param {string} modelId
 * @returns {string}
 */
export function getManufacturer(modelId) {
  return contractMap.get(modelId)?.manufacturer || '';
}

/**
 * Get logo URL for a model.
 * @param {string} modelId
 * @returns {string|null} URL path or null if no icon
 */
export function getModelIcon(modelId) {
  const icon = contractMap.get(modelId)?.icon;
  // Icons are in /images/logos/ via the junction to ABDSharedAssets/models/logos/
  return icon ? `/images/logos/${icon}` : null;
}

/**
 * Get product thumbnail URL for a model.
 * @param {string} modelId
 * @returns {string} URL path (thumbnail or placeholder)
 */
export function getModelThumbnail(modelId) {
  const contract = contractMap.get(modelId);
  if (!contract) return '/images/models/thumbs/placeholder-synth.svg';
  
  // 1. Try explicit thumbnail field first (for contracts that have it)
  if (contract.thumbnail) {
    return `/images/thumbs/${contract.thumbnail}`;
  }
  
  // 2. Fall back to modelImage and auto-derive thumbnail path
  // modelImage is like "models/roland-scooper.webp" -> thumb should be "thumbs/roland-scooper.webp"
  if (contract.modelImage) {
    const fileName = contract.modelImage.split('/').pop(); // get filename
    return `/images/thumbs/${fileName}`;
  }
  
  // 3. Fall back to placeholder
  return '/images/models/thumbs/placeholder-synth.svg';
}

/**
 * Get manufacturer logo URL (theme-aware).
 * @param {string} manufacturer
 * @param {boolean} [isDarkTheme] - Force dark theme mode, auto-detects if omitted
 * @returns {string} URL path (logo or placeholder)
 */
export function getManufacturerLogo(manufacturer, isDarkTheme) {
  const slug = (manufacturer || '').toLowerCase().replace(/\s+/g, '-');
  
  // Auto-detect theme if not specified
  if (typeof isDarkTheme !== 'boolean') {
    isDarkTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  // Logos are in /images/logos/ via the junction to ABDSharedAssets/models/logos/
  // Use white version for dark themes (except Roland which is already orange)
  if (isDarkTheme && slug !== 'roland') {
    return `/images/logos/${slug}-logo-white.svg`;
  }
  
  return `/images/logos/${slug}-logo.svg`;
}

/**
 * Get bank image URL with fallback.
 * @param {object} bank
 * @returns {string} URL path
 */
export function getBankImage(bank) {
  if (bank?.imageUrl) return bank.imageUrl;
  return getModelThumbnail(bank?.modelId);
}
