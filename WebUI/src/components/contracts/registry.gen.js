// GENERATED FILE — DO NOT EDIT
// Source: schemas/parameters-spec.schema.v1.json
// Generator: Scripts/registry_generator.js

export const PARAMETER_REGISTRY = {
  schemaVersion: "1.0.0",
  parameterCount: 0,
  sysexParameterCount: 0,

  parameters: [

  ],

  // Lookup maps (computed once)
  _sysexOffsetMap: {},
  _ccMap: {},

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
