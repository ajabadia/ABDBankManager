/**
 * WebUI ModelContracts wrapper — regresión de la unificación TS/JS.
 * El wrapper debe exponer los 15 modelos canónicos de Source/Contracts/Models/*.ts
 * (incluido korg-prophecy, que faltaba en el antiguo mirror JS).
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_CONTRACTS,
  getModelContract,
  getContractsForManufacturer,
  getCompatibleModels,
  getHardwareIds,
  getMidiConfig
} from '../../src/contracts/modelContracts.js';
import { createStandaloneRegistry } from '../../../Source/Contracts/index.ts';

describe('WebUI ModelContracts wrapper (fuente canónica TS)', () => {
  it('should expose all 15 models including korg-prophecy', () => {
    expect(MODEL_CONTRACTS.length).toBe(15);
    expect(getModelContract('korg-prophecy')).toBeDefined();
  });

  it('should keep unique modelIds', () => {
    const ids = MODEL_CONTRACTS.map(c => c.modelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should group contracts by manufacturer', () => {
    expect(getContractsForManufacturer('Korg').map(c => c.modelId)).toEqual([
      'korg-ms2000',
      'korg-microkorg',
      'korg-prophecy'
    ]);
    expect(getContractsForManufacturer('Casio')).toHaveLength(4);
    expect(getContractsForManufacturer('Unknown')).toHaveLength(0);
  });

  it('should expose the canonical TS shape (legacySysEx + addressing)', () => {
    const ms2000 = getModelContract('korg-ms2000');
    expect(ms2000.legacySysEx?.modelIdByte).toBe(0x58);
    expect(ms2000.getProgramAddress(0)).toBe('A.01');
    expect(ms2000.parseProgramAddress('B.03')).toBe(16 + 2);

    const dx7 = getModelContract('yamaha-dx7');
    expect(dx7.extractPatchName(new Uint8Array(0x13).fill(0))).toBe('');
  });

  it('should return compatible models', () => {
    expect(getCompatibleModels('casio-cz101')).toEqual(['casio-cz1000', 'casio-cz5000', 'casio-cz1']);
    expect(getCompatibleModels('korg-prophecy')).toEqual(['korg-microkorg']);
  });
});

describe('Asociación multi-hardware (wrapper) + ContractRegistry (fuente TS)', () => {
  it('should derive hardwareIds = canonical + compatibleModels', () => {
    expect(getHardwareIds('korg-ms2000')).toEqual(['korg-ms2000', 'korg-microkorg']);
    expect(getHardwareIds('casio-cz101')).toEqual(['casio-cz101', 'casio-cz1000', 'casio-cz5000', 'casio-cz1']);
    expect(getHardwareIds('unknown-model')).toEqual(['unknown-model']);
  });

  it('should expose a standalone registry with all 15 models (canonical TS source)', () => {
    const registry = createStandaloneRegistry();
    expect(registry.mode).toBe('standalone');
    expect(registry.getModels()).toHaveLength(15);
    expect(registry.getHardwareIds('roland-juno106')).toEqual([
      'roland-juno106',
      'roland-juno60',
      'roland-juno6',
      'roland-hs60'
    ]);
    expect(registry.getMidiConfig('yamaha-dx7').dumpTimeoutMs).toBe(2000);
  });
});

describe('getMidiConfig (derivado, no editable)', () => {
  it('should derive channel/device from ModelContract.midi', () => {
    expect(getMidiConfig('roland-juno106').channel).toBe(1);
    expect(getMidiConfig('roland-juno106').deviceId).toBe(0x18);
    expect(getMidiConfig('korg-ms2000').deviceId).toBe(0x10);
    expect(getMidiConfig('casio-cz101').channel).toBe(1);
  });

  it('should derive timing from HARDWARE_QUEUE_CONFIGS', () => {
    expect(getMidiConfig('casio-cz101').interMessageDelayMs).toBe(100);
    expect(getMidiConfig('casio-cz101').dumpTimeoutMs).toBe(5000);
    expect(getMidiConfig('roland-juno106').interMessageDelayMs).toBe(50);
    expect(getMidiConfig('korg-ms2000').interMessageDelayMs).toBe(20);
    expect(getMidiConfig('behringer-deepmind12').interMessageDelayMs).toBe(10);
    expect(getMidiConfig('yamaha-dx7').dumpTimeoutMs).toBe(2000);
  });

  it('should inherit midi defaults on derived model variants', () => {
    expect(getMidiConfig('roland-hs60').deviceId).toBe(0x18);
    expect(getMidiConfig('korg-microkorg').deviceId).toBe(0x10);
    expect(getMidiConfig('yamaha-dx7ii').channel).toBe(1);
  });

  it('should return safe defaults for unknown models', () => {
    const cfg = getMidiConfig('unknown-model');
    expect(cfg.channel).toBe(1);
    expect(cfg.deviceId).toBe(0x10);
    expect(cfg.interMessageDelayMs).toBe(20);
    expect(cfg.dumpTimeoutMs).toBe(3000);
  });
});
