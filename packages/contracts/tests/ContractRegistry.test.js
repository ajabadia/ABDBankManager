/**
 * ContractRegistry — tests del registro declarativo y la auto-configuración
 * (diseño §4.5). Verifica: modo standalone/plugin, validación al registrar,
 * consultas filtradas por modelo, warnings de targetModelIds huérfanos y la
 * asociación multi-hardware (getHardwareIds).
 */

import { describe, it, expect } from 'vitest';
import {
  ContractRegistry,
  createStandaloneRegistry,
  getHardwareIds
} from '@contracts';

function mockImportAdapter(overrides = {}) {
  return {
    adapterId: 'mock-import',
    displayName: 'Mock Import',
    supportedExtensions: ['.syx'],
    targetModelIds: ['korg-ms2000'],
    canParse: () => true,
    parse: () => ({ success: true, modelId: 'korg-ms2000', bankName: 'M', patches: [], warnings: [] }),
    ...overrides
  };
}

function mockExportAdapter(overrides = {}) {
  return {
    adapterId: 'mock-export',
    displayName: 'Mock Export',
    fileExtension: '.syx',
    targetModelIds: ['korg-ms2000'],
    serialize: () => new Uint8Array(),
    ...overrides
  };
}

function mockHardwareLink(modelId) {
  return {
    modelId,
    detectHardware: () => null,
    buildPatchDump: () => [],
    buildBankDump: () => [],
    buildDumpRequest: () => new Uint8Array(),
    parseDumpResponse: () => ({ success: true, modelId, bankName: 'M', patches: [], warnings: [] }),
    supportsEditBuffer: false,
    interMessageDelayMs: 20,
    dumpTimeoutMs: 3000
  };
}

describe('ContractRegistry — createStandaloneRegistry', () => {
  it('registers all 15 models and reports standalone mode', () => {
    const registry = createStandaloneRegistry();
    expect(registry.mode).toBe('standalone');
    expect(registry.getModels()).toHaveLength(15);
    expect(registry.isSupported('korg-ms2000')).toBe(true);
    expect(registry.isSupported('unknown-model')).toBe(false);
  });

  it('exposes model lookup and midi config', () => {
    const registry = createStandaloneRegistry();
    expect(registry.getModel('casio-cz101')?.manufacturer).toBe('Casio');
    expect(registry.getModel('nope')).toBeUndefined();
    expect(registry.getMidiConfig('roland-juno106').deviceId).toBe(0x18);
    expect(registry.getMidiConfig('unknown-model').channel).toBe(1);
  });

  it('has no registration issues for the full bundle', () => {
    const registry = createStandaloneRegistry();
    expect(registry.getIssues()).toEqual([]);
  });
});

describe('ContractRegistry — registro y validación', () => {
  it('rejects duplicate modelId', () => {
    const registry = new ContractRegistry();
    const ms2000 = createStandaloneRegistry().getModel('korg-ms2000');
    registry.registerModel(ms2000);
    expect(() => registry.registerModel(ms2000)).toThrow(/duplicado 'korg-ms2000'/);
  });

  it('rejects invalid ModelContract', () => {
    const registry = new ContractRegistry();
    expect(() => registry.registerModel({ modelId: 'x' })).toThrow(/ModelContract inválido/);
  });

  it('rejects duplicate adapterId', () => {
    const registry = createStandaloneRegistry();
    registry.registerImportAdapter(mockImportAdapter());
    expect(() => registry.registerImportAdapter(mockImportAdapter())).toThrow(/duplicado 'mock-import'/);
  });

  it('rejects HardwareLink without registered ModelContract', () => {
    const registry = new ContractRegistry();
    expect(() => registry.registerHardwareLink(mockHardwareLink('roland-juno106'))).toThrow(
      /sin ModelContract registrado/
    );
  });

  it('accepts HardwareLink when the model is registered', () => {
    const registry = createStandaloneRegistry();
    registry.registerHardwareLink(mockHardwareLink('roland-juno106'));
    expect(registry.getHardwareLinks('roland-juno106')).toHaveLength(1);
    expect(registry.getHardwareLinks('korg-ms2000')).toHaveLength(0);
    expect(registry.getHardwareLinks()).toHaveLength(1);
  });

  it('warns when ImportAdapter.targetModelIds has no registered model', () => {
    const registry = new ContractRegistry();
    registry.registerImportAdapter(mockImportAdapter({ targetModelIds: ['unknown-model'] }));
    const issues = registry.getIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('warning');
    expect(issues[0].message).toContain('unknown-model');
  });

  it('rejects ImportAdapter with missing required shape', () => {
    const registry = new ContractRegistry();
    expect(() => registry.registerImportAdapter({ adapterId: 'x' })).toThrow(/ImportAdapter inválido/);
  });
});

describe('ContractRegistry — modo plugin vs standalone', () => {
  it('reports plugin mode with a single model', () => {
    const registry = new ContractRegistry();
    const ms2000 = createStandaloneRegistry().getModel('korg-ms2000');
    registry.registerModel(ms2000);
    expect(registry.mode).toBe('plugin');
    expect(registry.getModels()).toHaveLength(1);
  });

  it('filters import/export adapters by targetModelIds', () => {
    const registry = createStandaloneRegistry();
    registry.registerImportAdapter(mockImportAdapter({ targetModelIds: ['korg-ms2000', 'korg-microkorg'] }));
    registry.registerImportAdapter(mockImportAdapter({ adapterId: 'mock-juno', targetModelIds: ['roland-juno106'] }));
    registry.registerExportAdapter(mockExportAdapter({ targetModelIds: ['korg-ms2000'] }));

    expect(registry.getImportAdapters('korg-ms2000').map(a => a.adapterId)).toEqual(['mock-import']);
    expect(registry.getImportAdapters('roland-juno106').map(a => a.adapterId)).toEqual(['mock-juno']);
    expect(registry.getImportAdapters('casio-cz101')).toHaveLength(0);
    expect(registry.getImportAdapters()).toHaveLength(2);
    expect(registry.getExportAdapters('korg-ms2000')).toHaveLength(1);
    expect(registry.getExportAdapters()).toHaveLength(1);
  });
});

describe('getHardwareIds — asociación multi-hardware (diseño §5)', () => {
  it('derives canonical + compatible models', () => {
    expect(getHardwareIds('korg-ms2000')).toEqual(['korg-ms2000', 'korg-microkorg']);
    expect(getHardwareIds('casio-cz101')).toEqual(['casio-cz101', 'casio-cz1000', 'casio-cz5000', 'casio-cz1']);
    expect(getHardwareIds('roland-juno106')).toEqual(['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60']);
  });

  it('falls back to canonical only for unknown models', () => {
    expect(getHardwareIds('unknown-model')).toEqual(['unknown-model']);
  });

  it('registry returns the same derivation from its registered models', () => {
    const registry = createStandaloneRegistry();
    expect(registry.getHardwareIds('korg-ms2000')).toEqual(getHardwareIds('korg-ms2000'));
    expect(registry.getCompatibleModels('casio-cz101')).toContain('casio-cz1000');
  });
});
