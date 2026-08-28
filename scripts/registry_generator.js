#!/usr/bin/env node
/**
 * ABD Bank Manager — Registry Generator
 * Reads parameters-spec.schema.v1.json and generates:
 * - Source/State/ParameterRegistry.gen.h
 * - Source/State/ParameterRegistry.gen.cpp
 * - WebUI/src/contracts/registry.gen.js
 * - schemas/parameter-registry.data.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAndValidateSchema, generateSysexOffsetMap, generateCcMap, __dirname } from './registry_core.js';

const __filename = fileURLToPath(import.meta.url);

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'parameters-spec.schema.v1.json');
const OUTPUT_CPP_H = path.join(ROOT, 'Source', 'State', 'ParameterRegistry.gen.h');
const OUTPUT_CPP_CPP = path.join(ROOT, 'Source', 'State', 'ParameterRegistry.gen.cpp');
const OUTPUT_JS = path.join(ROOT, 'WebUI', 'src', 'contracts', 'registry.gen.js');
const OUTPUT_DATA = path.join(ROOT, 'schemas', 'parameter-registry.data.json');

// Ensure output directories exist
[path.dirname(OUTPUT_CPP_H), path.dirname(OUTPUT_JS), path.dirname(OUTPUT_DATA)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Load & Validate ---
const { valid, schema, errors } = loadAndValidateSchema(SCHEMA_PATH);
if (!valid) {
  console.error('❌ Schema validation failed:');
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

console.log('✅ Schema validation passed');
console.log(`   Parameters: ${schema.parameters.length}`);
console.log(`   Schema version: ${schema.schemaVersion}`);

// --- Compute derived data ---
const sysexOffsetMap = generateSysexOffsetMap(schema);
const ccMap = generateCcMap(schema);
const sysexParams = schema.parameters.filter(p => p.sysex);
const ccParams = schema.parameters.filter(p => p.cc !== null && p.cc !== undefined);

console.log(`   Sysex parameters: ${sysexParams.length}${sysexParams.length > 0 ? ` (offsets 0-${sysexParams.length - 1})` : ''}`);
console.log(`   CC parameters: ${ccParams.length}`);

// --- Generate C++ Header ---
const cppHeader = `// GENERATED FILE — DO NOT EDIT
// Source: schemas/parameters-spec.schema.v1.json
// Generator: Scripts/registry_generator.js

#pragma once

#include <cstdint>
#include <array>

namespace ABD::BankManager::ParameterRegistry {

// Schema version
constexpr const char* kSchemaVersion = "${schema.schemaVersion}";
constexpr uint32_t kParameterCount = ${schema.parameters.length};
constexpr uint32_t kSysexParameterCount = ${sysexParams.length};

// Parameter IDs (stable — never change these)
${schema.parameters.map((p, i) => `constexpr const char* kParam_${p.id} = "${p.id}";`).join('\n')}

// Parameter lookup by index
inline const char* getParamId(uint32_t index) {
    static constexpr const char* ids[] = {
${schema.parameters.map((p, i) => `        "${p.id}"${i < schema.parameters.length - 1 ? ',' : ''}`).join('\n')}
    };
    return (index < kParameterCount) ? ids[index] : nullptr;
}

// Sysex offset lookup (only for parameters with sysex=true)
inline int getSysexOffset(const char* paramId) {
${sysexParams.map(p => `    if (strcmp(paramId, "${p.id}") == 0) return ${sysexOffsetMap.get(p.id)};`).join('\n')}
    return -1;
}

// CC lookup
inline int getCC(const char* paramId) {
${ccParams.map(p => `    if (strcmp(paramId, "${p.id}") == 0) return ${p.cc};`).join('\n')}
    return -1;
}

// Parameter metadata
struct ParamInfo {
    const char* id;
    const char* name;
    const char* group;
    int16_t cc;           // -1 if none
    float minValue;
    float maxValue;
    float defaultValue;
    uint8_t type;         // 0=continuous, 1=integer, 2=choice, 3=boolean
    uint8_t choiceCount;  // for choice type
    bool sysex;
};

inline const ParamInfo* getParamInfo(const char* paramId) {
${schema.parameters.map(p => {
    const typeMap = { continuous: 0, integer: 1, choice: 2, boolean: 3 };
    const choiceCount = p.type === 'choice' ? p.choices.length : 0;
    return `    if (strcmp(paramId, "${p.id}") == 0) {
        static constexpr ParamInfo info = {
            "${p.id}", "${p.name.replace(/"/g, '\\"')}", "${p.group}",
            ${p.cc !== null && p.cc !== undefined ? p.cc : -1},
            ${p.min}, ${p.max}, ${typeof p.default === 'boolean' ? (p.default ? 1.0 : 0.0) : p.default},
            ${typeMap[p.type]}, ${choiceCount}, ${p.sysex ? 'true' : 'false'}
        };
        return &info;
    }`;
}).join('\n')}
    return nullptr;
}

// Choice labels (for choice-type parameters)
inline const char* getChoiceLabel(const char* paramId, uint32_t index) {
${schema.parameters.filter(p => p.type === 'choice').map(p => `    if (strcmp(paramId, "${p.id}") == 0) {
        static constexpr const char* labels[] = { ${p.choices.map(c => `"${c.replace(/"/g, '\\"')}"`).join(', ')} };
        return (index < ${p.choices.length}) ? labels[index] : nullptr;
    }`).join('\n')}
    return nullptr;
}

// All parameter IDs as array (for iteration)
inline std::array<const char*, ${schema.parameters.length}> getAllParamIds() {
    return { ${schema.parameters.map(p => `"${p.id}"`).join(', ')} };
}

} // namespace ABD::BankManager::ParameterRegistry
`;

fs.writeFileSync(OUTPUT_CPP_H, cppHeader);
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_CPP_H)}`);

// --- Generate C++ Implementation ---
const cppImpl = `// GENERATED FILE — DO NOT EDIT
// Source: schemas/parameters-spec.schema.v1.json
// Generator: Scripts/registry_generator.js

#include "ParameterRegistry.gen.h"
#include <cstring>

namespace ABD::BankManager::ParameterRegistry {

// Definitions for constexpr string pointers
${schema.parameters.map(p => `constexpr const char* kParam_${p.id};`).join('\n')}

} // namespace ABD::BankManager::ParameterRegistry
`;

fs.writeFileSync(OUTPUT_CPP_CPP, cppImpl);
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_CPP_CPP)}`);

// --- Generate JS Registry ---
const jsRegistry = `// GENERATED FILE — DO NOT EDIT
// Source: schemas/parameters-spec.schema.v1.json
// Generator: Scripts/registry_generator.js

export const PARAMETER_REGISTRY = {
  schemaVersion: "${schema.schemaVersion}",
  parameterCount: ${schema.parameters.length},
  sysexParameterCount: ${sysexParams.length},

  parameters: [
${schema.parameters.map((p, i) => `    {
      id: "${p.id}",
      name: "${p.name.replace(/"/g, '\\"')}",
      group: "${p.group}",
      cc: ${p.cc !== null && p.cc !== undefined ? p.cc : 'null'},
      min: ${p.min},
      max: ${p.max},
      default: ${typeof p.default === 'boolean' ? (p.default ? 'true' : 'false') : p.default},
      type: "${p.type}",
      choices: ${p.type === 'choice' ? JSON.stringify(p.choices) : 'null'},
      sysex: ${p.sysex},
      description: "${(p.description || '').replace(/"/g, '\\"')}"
    }${i < schema.parameters.length - 1 ? ',' : ''}`).join('\n')}
  ],

  // Lookup maps (computed once)
  _sysexOffsetMap: ${JSON.stringify(Object.fromEntries(sysexOffsetMap))},
  _ccMap: ${JSON.stringify(Object.fromEntries(ccMap))},

  // Helper functions
  getSysexOffset(paramId) { return this._sysexOffsetMap[paramId] ?? -1; },
  getCC(paramId) { return this._ccMap[paramId] ?? -1; },
  getParam(paramId) { return this.parameters.find(p => p.id === paramId); },
  getParamByIndex(index) { return this.parameters[index]; },
  getAllParamIds() { return this.parameters.map(p => p.id); },
  getParamsByGroup(group) { return this.parameters.filter(p => p.group === group); },
  getGroups() { return [...new Set(this.parameters.map(p => p.group))]; }
};

// Freeze to prevent accidental modification
Object.freeze(PARAMETER_REGISTRY);
Object.freeze(PARAMETER_REGISTRY.parameters);
`;

fs.writeFileSync(OUTPUT_JS, jsRegistry);
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_JS)}`);

// --- Generate Data JSON ---
const dataJson = {
  schemaVersion: schema.schemaVersion,
  generatedAt: new Date().toISOString(),
  parameterCount: schema.parameters.length,
  sysexParameterCount: sysexParams.length,
  ccParameterCount: ccParams.length,
  parameters: schema.parameters.map(p => ({
    id: p.id,
    name: p.name,
    group: p.group,
    cc: p.cc,
    min: p.min,
    max: p.max,
    default: p.default,
    type: p.type,
    choices: p.choices || null,
    sysex: p.sysex,
    sysexOffset: p.sysex ? sysexOffsetMap.get(p.id) : null,
    description: p.description || ''
  }))
};

fs.writeFileSync(OUTPUT_DATA, JSON.stringify(dataJson, null, 2));
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_DATA)}`);

console.log('\n🎉 Registry generation complete!');