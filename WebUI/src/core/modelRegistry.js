/**
 * ABD Bank Manager — Model Registry
 *
 * Single source of truth for model capabilities.
 * Built at load time from contracts + parameter schemas.
 * No hardcoded model lists anywhere else in the app.
 */

import { MODEL_CONTRACTS } from '../contracts/modelContracts.js';
import { decodePro800Parameters, getPro800ParametersForFormat } from './pro800Parameters.js';
import { decodeDeepMindParameters } from './deepMindParameters.js';
import { decodeDx7Parameters, getDx7TableParameters } from './dx7Parameters.js';

// ─── Parameter schema registry (built from contracts, no hardcodes) ───
// Each model declares parameterSchemaKey in its contract.
// Schema functions are mapped by key, then assigned to contracts that reference them.

const SCHEMA_DECODE_MAP = {
  'behringer-pro800': { decode: decodePro800Parameters, getTable: decodePro800Parameters },
  'behringer-deepmind12': { decode: decodeDeepMindParameters, getTable: decodeDeepMindParameters },
  'behringer-dm12': { decode: decodeDeepMindParameters, getTable: decodeDeepMindParameters },
  'yamaha-dx7': { decode: decodeDx7Parameters, getTable: getDx7TableParameters },
  'yamaha-dx7ii': { decode: decodeDx7Parameters, getTable: getDx7TableParameters },
};

const PARAMETER_SCHEMAS = {};
for (const contract of MODEL_CONTRACTS) {
  const key = contract.parameterSchemaKey;
  if (key && SCHEMA_DECODE_MAP[key]) {
    const { decode, getTable } = SCHEMA_DECODE_MAP[key];
    PARAMETER_SCHEMAS[contract.modelId] = {
      decode,
      getTable,
      formatLabel: rawData => `${contract.displayName} · ${contract.patchDataSize} bytes`,
    };
  }
}

// ─── MIDI detection patterns (built from contracts, no hardcodes) ───

const MIDI_DETECT_PATTERNS = MODEL_CONTRACTS
  .filter(c => c.midiDetection)
  .map(c => ({
    pattern: c.midiDetection.portPattern,
    modelId: c.modelId,
    displayName: c.midiDetection.displayName,
  }));

// ─── Cached lookups (built once at load) ───

/** @type {Map<string, object>} modelId → contract */
const contractMap = new Map(MODEL_CONTRACTS.map(c => [c.modelId, c]));

/** @type {Array<{id: string, name: string, manufacturer: string}>} sorted model list */
const modelList = MODEL_CONTRACTS
  .map(c => ({ id: c.modelId, name: c.displayName, manufacturer: c.manufacturer || '' }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ─── Public API ───

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
 * @returns {{ decode: Function, getTable: Function, formatLabel: Function }|null}
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
 * @returns {{ modelId: string, displayName: string }|null}
 */
export function detectModelFromPortName(portName) {
  const n = (portName || '').toLowerCase();
  for (const { pattern, modelId, displayName } of MIDI_DETECT_PATTERNS) {
    if (pattern.test(n)) return { modelId, displayName };
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
  return icon ? `/images/models/logos/${icon}` : null;
}

/**
 * Get product thumbnail URL for a model.
 * @param {string} modelId
 * @returns {string|null} URL path or null if no thumbnail
 */
export function getModelThumbnail(modelId) {
  const thumb = contractMap.get(modelId)?.thumbnail;
  return thumb ? `/images/models/thumbs/${thumb}` : null;
}
