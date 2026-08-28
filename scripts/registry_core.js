/**
 * ABD Bank Manager — Registry Core Validation Logic
 * Importable by registry_generator.js and tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Types ---

/** @typedef {{id:string,name:string,group:string,cc:number|null,min:number,max:number,default:number|string,type:'continuous'|'integer'|'choice'|'boolean',choices?:string[],sysex:boolean,description?:string}} ParamSpec */

/** @typedef {{schemaVersion:string,parameters:ParamSpec[]}} RegistrySchema */

// --- Validation ---

/**
 * Validates the parameter registry schema
 * @param {RegistrySchema} schema
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateRegistrySchema(schema) {
  const errors = [];

  if (!schema.schemaVersion) {
    errors.push('Missing schemaVersion');
  }

  if (!Array.isArray(schema.parameters)) {
    errors.push('parameters must be an array');
    return { valid: false, errors };
  }

  const seenIds = new Set();
  const seenCcs = new Map(); // cc -> paramId
  const seenSysexOffsets = new Map(); // offset -> paramId (only for sysex params)

  let sysexOffset = 0;

  schema.parameters.forEach((param, index) => {
    const prefix = `Parameter ${index} (${param.id || 'NO_ID'}):`;

    // Required fields
    if (!param.id) errors.push(`${prefix} Missing required field 'id'`);
    else if (seenIds.has(param.id)) errors.push(`${prefix} Duplicate ID '${param.id}'`);
    else seenIds.add(param.id);

    if (!param.name) errors.push(`${prefix} Missing required field 'name'`);
    if (!param.group) errors.push(`${prefix} Missing required field 'group'`);
    if (param.cc !== null && param.cc !== undefined) {
      if (typeof param.cc !== 'number' || param.cc < 0 || param.cc > 127) {
        errors.push(`${prefix} CC must be 0-127 or null`);
      } else if (seenCcs.has(param.cc)) {
        errors.push(`${prefix} Duplicate CC ${param.cc} (also used by ${seenCcs.get(param.cc)})`);
      } else {
        seenCcs.set(param.cc, param.id);
      }
    }

    if (typeof param.min !== 'number') errors.push(`${prefix} Missing or invalid 'min'`);
    if (typeof param.max !== 'number') errors.push(`${prefix} Missing or invalid 'max'`);
    if (param.default === undefined || param.default === null) errors.push(`${prefix} Missing 'default'`);

    // Type validation
    const validTypes = ['continuous', 'integer', 'choice', 'boolean'];
    if (!validTypes.includes(param.type)) {
      errors.push(`${prefix} Invalid type '${param.type}' (must be: ${validTypes.join(', ')})`);
    }

    if (param.type === 'choice') {
      if (!Array.isArray(param.choices) || param.choices.length === 0) {
        errors.push(`${prefix} Choice type requires non-empty 'choices' array`);
      }
      if (typeof param.default === 'number' && (param.default < 0 || param.default >= param.choices.length)) {
        errors.push(`${prefix} Default index ${param.default} out of range for choices (0-${param.choices.length - 1})`);
      }
    }

    if (param.type === 'boolean') {
      if (typeof param.default !== 'boolean' && param.default !== 0 && param.default !== 1) {
        errors.push(`${prefix} Boolean type default must be boolean or 0/1`);
      }
    }

    // Range validation for numeric types
    if (['continuous', 'integer'].includes(param.type)) {
      if (param.default < param.min || param.default > param.max) {
        errors.push(`${prefix} Default ${param.default} out of range [${param.min}, ${param.max}]`);
      }
    }

    // Sysex offset tracking (auto-calculated)
    if (param.sysex) {
      if (seenSysexOffsets.has(sysexOffset)) {
        errors.push(`${prefix} Sysex offset collision at ${sysexOffset} (also used by ${seenSysexOffsets.get(sysexOffset)})`);
      }
      seenSysexOffsets.set(sysexOffset, param.id);
      sysexOffset++;
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Loads and validates schema from file
 * @param {string} schemaPath
 * @returns {{valid:boolean, schema?:RegistrySchema, errors:string[]}}
 */
export function loadAndValidateSchema(schemaPath) {
  try {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    const validation = validateRegistrySchema(schema);
    return { valid: validation.valid, schema: validation.valid ? schema : undefined, errors: validation.errors };
  } catch (err) {
    return { valid: false, errors: [`Failed to load schema: ${err.message}`] };
  }
}

/**
 * Generates sysex offset map from schema
 * @param {RegistrySchema} schema
 * @returns {Map<string,number>} paramId -> sysexOffset
 */
export function generateSysexOffsetMap(schema) {
  const map = new Map();
  let offset = 0;
  for (const param of schema.parameters) {
    if (param.sysex) {
      map.set(param.id, offset);
      offset++;
    }
  }
  return map;
}

/**
 * Generates CC map from schema
 * @param {RegistrySchema} schema
 * @returns {Map<number,string>} cc -> paramId
 */
export function generateCcMap(schema) {
  const map = new Map();
  for (const param of schema.parameters) {
    if (param.cc !== null && param.cc !== undefined) {
      map.set(param.cc, param.id);
    }
  }
  return map;
}

export { __dirname };