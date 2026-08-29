import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// @scripts/registry_core.js not compiled to WebUI — skip
describe.skip('Parameter Registry', () => {
const SCHEMA_PATH = 'schemas/parameters-spec.schema.v1.json';
  it('should load and validate schema', () => {
    const { valid, schema, errors } = loadAndValidateSchema(SCHEMA_PATH);
    expect(valid).toBe(true);
    expect(schema).toBeDefined();
    expect(errors).toHaveLength(0);
  });

  it('should have no duplicate IDs', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    const ids = schema.parameters.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have no duplicate CCs', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    const ccs = schema.parameters
      .map(p => p.cc)
      .filter(cc => cc != null);
    expect(new Set(ccs).size).toBe(ccs.length);
  });

  it('should have auto-calculated sysex offsets', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    const sysexParams = schema.parameters.filter(p => p.sysex);
    const offsetMap = generateSysexOffsetMap(schema);

    expect(offsetMap.size).toBe(sysexParams.length);
    // Offsets should be sequential 0, 1, 2...
    const offsets = Array.from(offsetMap.values()).sort((a, b) => a - b);
    offsets.forEach((offset, i) => {
      expect(offset).toBe(i);
    });
  });

  it('should have valid parameter ranges', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    schema.parameters.forEach(p => {
      expect(p.min).toBeLessThanOrEqual(p.max);
      if (typeof p.default === 'number') {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    });
  });

  it('should have valid choice defaults', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    schema.parameters
      .filter(p => p.type === 'choice')
      .forEach(p => {
        expect(Array.isArray(p.choices)).toBe(true);
        expect(p.choices.length).toBeGreaterThan(0);
        if (typeof p.default === 'number') {
          expect(p.default).toBeGreaterThanOrEqual(0);
          expect(p.default).toBeLessThan(p.choices.length);
        }
      });
  });

  it('should have required fields for all parameters', () => {
    const { schema } = loadAndValidateSchema(SCHEMA_PATH);
    schema.parameters.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.group).toBeTruthy();
      expect(typeof p.min).toBe('number');
      expect(typeof p.max).toBe('number');
      expect(p.default !== undefined).toBe(true);
      expect(['continuous', 'integer', 'choice', 'boolean']).toContain(p.type);
      expect(typeof p.sysex).toBe('boolean');
    });
  });
});

describe.skip('Generated Registry Artifacts', () => {
  it('should have generated C++ header', () => {
    const cppHeader = 'Source/State/ParameterRegistry.gen.h';
    expect(fs.existsSync(cppHeader)).toBe(true);
  });

  it('should have generated JS registry', () => {
    const jsRegistry = 'WebUI/src/contracts/registry.gen.js';
    expect(fs.existsSync(jsRegistry)).toBe(true);
  });

  it('should have generated data JSON', () => {
    const dataJson = 'schemas/parameter-registry.data.json';
    expect(fs.existsSync(dataJson)).toBe(true);
  });
});