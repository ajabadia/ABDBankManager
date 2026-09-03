/**
 * Model Detection Tests
 * Verifies that sysexParser correctly identifies manufacturer and model
 * from real SysEx fixture dumps for all supported manufacturers.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { identifyManufacturer, identifyModel, splitSysExMessages, parseSysExDump } from '../../src/core/sysexParser.js';

// ─── Helpers ───

function readFixture(path) {
  return new Uint8Array(fs.readFileSync(path));
}

function firstMessage(raw) {
  const msgs = splitSysExMessages(raw);
  expect(msgs.length).toBeGreaterThan(0);
  return msgs[0];
}

// ─── Manufacturer Detection ───

describe('identifyManufacturer', () => {
  it('detects Yamaha from DX7 bulk dump', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/single-voice.syx');
    const msg = firstMessage(raw);
    const result = identifyManufacturer(msg);
    expect(result).not.toBeNull();
    expect(result.manufacturer).toBe('Yamaha');
    expect(result.manufacturerId).toEqual([0x43]);
  });

  it('detects Roland from Juno-106 bank', () => {
    const raw = readFixture('fixtures/sysex/roland-juno/factory/Juno106_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyManufacturer(msg);
    expect(result).not.toBeNull();
    expect(result.manufacturer).toBe('Roland');
    expect(result.manufacturerId).toEqual([0x41]);
  });

  it('detects Korg from MS2000 bank', () => {
    const raw = readFixture('fixtures/sysex/korg-ms2000/factory/MS2000_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyManufacturer(msg);
    expect(result).not.toBeNull();
    expect(result.manufacturer).toBe('Korg');
    expect(result.manufacturerId).toEqual([0x42]);
  });

  it('detects Casio from CZ-101 bank', () => {
    const raw = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyManufacturer(msg);
    expect(result).not.toBeNull();
    expect(result.manufacturer).toBe('Casio');
    expect(result.manufacturerId).toEqual([0x44]);
  });

  it('detects Behringer from DeepMind 12 bank', () => {
    const raw = readFixture('fixtures/sysex/behringer-deepmind12/factory/Factory Bank A v1.0.syx');
    const msg = firstMessage(raw);
    const result = identifyManufacturer(msg);
    expect(result).not.toBeNull();
    expect(result.manufacturer).toBe('Behringer');
    expect(result.manufacturerId).toEqual([0x00, 0x20, 0x32]);
  });
});

// ─── Model Detection ───

describe('identifyModel (contract matching)', () => {
  it('identifies Yamaha DX7 from single voice dump', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/single-voice.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('yamaha-dx7');
    expect(result.contract).toBeDefined();
    expect(result.contract.manufacturer).toBe('Yamaha');
  });

  it('identifies Yamaha DX7 from bulk 32-voice dump', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/bulk-32voices.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('yamaha-dx7');
  });

  it('identifies Roland Juno-106 from bank dump', () => {
    const raw = readFixture('fixtures/sysex/roland-juno/factory/Juno106_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('roland-juno106');
  });

  it('identifies Korg MS2000 from bank dump', () => {
    const raw = readFixture('fixtures/sysex/korg-ms2000/factory/MS2000_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('korg-ms2000');
  });

  it('identifies Casio CZ-101 from bank dump', () => {
    const raw = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('casio-cz101');
  });

  it('identifies Behringer DeepMind 12 from factory bank', () => {
    const raw = readFixture('fixtures/sysex/behringer-deepmind12/factory/Factory Bank A v1.0.syx');
    const msg = firstMessage(raw);
    const result = identifyModel(msg);
    expect(result).not.toBeNull();
    expect(result.modelId).toBe('behringer-deepmind12');
  });
});

// ─── Full Dump Parsing ───

describe('parseSysExDump (full file)', () => {
  it('parses DX7 bulk dump and identifies it as DX7', () => {
    // DX7 bulk dump is a single SysEx message containing 32 voices.
    // parseSysExDump counts SysEx messages, not individual voices within a bulk.
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/bulk-32voices.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('yamaha-dx7')).toBe(true);
    expect(result.totalPatches).toBeGreaterThanOrEqual(1);
  });

  it('parses DX7 factory ROM and identifies it as DX7', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/real-dumps/DX7_factory_rom1a.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('yamaha-dx7')).toBe(true);
    expect(result.totalPatches).toBeGreaterThanOrEqual(1);
  });

  it('parses Korg MS2000 bank A and identifies patches', () => {
    const raw = readFixture('fixtures/sysex/korg-ms2000/factory/MS2000_Bank_A.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('korg-ms2000')).toBe(true);
    expect(result.totalPatches).toBeGreaterThan(0);
  });

  it('parses Casio CZ-101 bank and identifies patches', () => {
    const raw = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('casio-cz101')).toBe(true);
    expect(result.totalPatches).toBeGreaterThan(0);
  });

  it('parses Roland Juno-106 bank and identifies patches', () => {
    const raw = readFixture('fixtures/sysex/roland-juno/factory/Juno106_Bank_A.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('roland-juno106')).toBe(true);
    expect(result.totalPatches).toBeGreaterThan(0);
  });

  it('parses DeepMind 12 factory bank and identifies patches', () => {
    const raw = readFixture('fixtures/sysex/behringer-deepmind12/factory/Factory Bank A v1.0.syx');
    const result = parseSysExDump(raw);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedModels.has('behringer-deepmind12')).toBe(true);
    expect(result.totalPatches).toBeGreaterThan(0);
  });
});

// ─── Cross-model identification ───

describe('Model disambiguation', () => {
  it('Korg MS2000 and microKORG share manufacturer byte 0x42 — both identify as Korg', () => {
    const ms2000Raw = readFixture('fixtures/sysex/korg-ms2000/factory/MS2000_Bank_A.syx');
    const mkRaw = readFixture('fixtures/sysex/korg-microkorg/factory/MicroKORG_Bank_A.syx');
    const ms2000Msg = firstMessage(ms2000Raw);
    const mkMsg = firstMessage(mkRaw);

    const ms2000Result = identifyModel(ms2000Msg);
    const mkResult = identifyModel(mkMsg);

    expect(ms2000Result).not.toBeNull();
    expect(mkResult).not.toBeNull();
    expect(ms2000Result.modelId).toBe('korg-ms2000');
    // Both share Korg manufacturer — microKORG may fall back to first Korg match
    expect(['korg-ms2000', 'korg-microkorg']).toContain(mkResult.modelId);
    expect(ms2000Result.contract.sysexManufacturerId).toEqual(mkResult.contract.sysexManufacturerId);
  });

  it('Roland Juno-106 and Juno-60 share manufacturer byte 0x41 — both identify as Roland Juno', () => {
    const j106Raw = readFixture('fixtures/sysex/roland-juno/factory/Juno106_Bank_A.syx');
    const j60Raw = readFixture('fixtures/sysex/roland-juno/factory/Juno60_Bank_A.syx');
    const j106Msg = firstMessage(j106Raw);
    const j60Msg = firstMessage(j60Raw);

    const j106Result = identifyModel(j106Msg);
    const j60Result = identifyModel(j60Msg);

    expect(j106Result).not.toBeNull();
    expect(j60Result).not.toBeNull();
    expect(j106Result.modelId).toBe('roland-juno106');
    // Juno-60 may fall back to first Roland Juno match
    expect(['roland-juno106', 'roland-juno60']).toContain(j60Result.modelId);
  });

  it('Casio CZ-101 and CZ-1000 share manufacturer byte 0x44 — both identify as Casio CZ', () => {
    const cz101Raw = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
    const cz1000Raw = readFixture('fixtures/sysex/casio-cz/factory/CZ1000_Bank_A.syx');
    const cz101Msg = firstMessage(cz101Raw);
    const cz1000Msg = firstMessage(cz1000Raw);

    const cz101Result = identifyModel(cz101Msg);
    const cz1000Result = identifyModel(cz1000Msg);

    expect(cz101Result).not.toBeNull();
    expect(cz1000Result).not.toBeNull();
    expect(cz101Result.modelId).toBe('casio-cz101');
    // CZ-1000 may fall back to first Casio CZ match
    expect(['casio-cz101', 'casio-cz1000']).toContain(cz1000Result.modelId);
  });
});
