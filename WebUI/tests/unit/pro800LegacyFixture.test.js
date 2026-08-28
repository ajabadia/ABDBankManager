import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { splitSysExMessages } from '../../src/core/sysexParser.js';

const fixturePath = path.resolve(process.cwd(), 'fixtures/sysex/behringer-pro800/legacy/Behringer_Pro-800_Factory_Presets.syx');

describe('Behringer Pro-800 legacy factory fixture', () => {
  it('parses the complete legacy dump and detects v109/v110 records', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const contract = getModelContract('behringer-pro800');
    const messages = splitSysExMessages(new Uint8Array(fs.readFileSync(fixturePath)));
    expect(messages).toHaveLength(101);

    const parsed = messages.map(message => contract.parsePatchSysEx(message));
    expect(parsed.every(Boolean)).toBe(true);
    const versions = new Set(parsed.map(patch => patch.rawData[4]));
    expect(versions).toEqual(new Set([0x6D, 0x6E]));
    expect(parsed.filter(patch => patch.rawData[4] === 0x6D)).toHaveLength(98);
    expect(parsed.filter(patch => patch.rawData[4] === 0x6E)).toHaveLength(3);

    const lengthsByVersion = new Map();
    for (const patch of parsed) {
      const version = patch.rawData[4];
      if (!lengthsByVersion.has(version)) lengthsByVersion.set(version, new Set());
      lengthsByVersion.get(version).add(patch.rawData.length);
    }
    expect(lengthsByVersion.get(0x6D)).toEqual(new Set([155, 156, 157, 158, 159, 160, 162, 163, 164, 165, 166, 183]));
    expect(lengthsByVersion.get(0x6E)).toEqual(new Set([168]));
  });

  it('preserves legacy names and addresses without exposing v111-only fields', () => {
    const contract = getModelContract('behringer-pro800');
    const parsed = splitSysExMessages(new Uint8Array(fs.readFileSync(fixturePath)))
      .map(message => contract.parsePatchSysEx(message));
    expect(contract.extractPatchName(parsed[0].rawData)).toBe('Organ I');
    expect(contract.extractPatchName(parsed[4].rawData)).toBe('Metallic I');
    expect(parsed.some(patch => patch.slot === 207)).toBe(true);
    expect(parsed.filter(patch => patch.rawData[4] === 0x6D).every(patch => patch.rawData.length <= 183)).toBe(true);
  });

  it('roundtrips representative v109 and v110 records without losing decoded bytes', () => {
    const contract = getModelContract('behringer-pro800');
    const parsed = splitSysExMessages(new Uint8Array(fs.readFileSync(fixturePath)))
      .map(message => ({ message, parsed: contract.parsePatchSysEx(message) }));
    for (const version of [0x6D, 0x6E]) {
      const sample = parsed.find(item => item.parsed.rawData[4] === version);
      const rebuilt = contract.buildPatchSysEx(sample.parsed.rawData, sample.parsed.slot, 1);
      const reparsed = contract.parsePatchSysEx(rebuilt);
      expect(Array.from(reparsed.rawData.slice(0, sample.parsed.rawData.length))).toEqual(Array.from(sample.parsed.rawData));
      expect(reparsed.slot).toBe(sample.parsed.slot);
    }
  });
});
