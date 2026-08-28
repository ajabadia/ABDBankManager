import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { splitSysExMessages } from '../../src/core/sysexParser.js';

const fixtureCandidates = [
  'fixtures/sysex/behringer-pro800/v1.4.4/PRO-800_Presets_v1.4.4.syx',
  'DOCS/DOCS-pro800-borrar/PRO-800_Presets_v1-4-4.syx/PRO-800_Presets_v1.4.4.syx'
].map(candidate => path.resolve(process.cwd(), candidate));
const fixturePath = fixtureCandidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

describe('Behringer Pro-800 real fixture', () => {
  it('parses all 100 v1.4.4 factory patches as format v111', () => {
    if (!fixturePath) return;
    const contract = getModelContract('behringer-pro800');
    const raw = new Uint8Array(fs.readFileSync(fixturePath));
    const messages = splitSysExMessages(raw);
    expect(messages).toHaveLength(100);

    const parsed = messages.map(message => contract.parsePatchSysEx(message));
    expect(parsed.every(Boolean)).toBe(true);
    expect(new Set(parsed.map(patch => patch.rawData.length))).toEqual(new Set([173]));
    expect(new Set(parsed.map(patch => patch.rawData[4]))).toEqual(new Set([0x6F]));
    expect(parsed[0].slot).toBe(0);
    expect(contract.extractPatchName(parsed[0].rawData)).toBe('Organ I');
    expect(contract.extractPatchName(parsed[1].rawData)).toBe('Classical Brass');
    expect(parsed[99].slot).toBe(99);
  });
});
