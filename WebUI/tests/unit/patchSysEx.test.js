import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { splitSysExMessages } from '../../src/core/sysexParser.js';
import { buildSysExViewInfo } from '../../src/core/patchSysEx.js';

const FIXTURE = path.resolve(process.cwd(), '..', 'fixtures/sysex/behringer-pro800/v1.4.4/PRO-800_Presets_v1.4.4.syx');
const pro800 = () => getModelContract('behringer-pro800');

function firstPatch() {
  const raw = new Uint8Array(fs.readFileSync(FIXTURE));
  const msg = splitSysExMessages(raw)[0];
  return pro800().parsePatchSysEx(msg);
}

describe('buildSysExViewInfo', () => {
  it('returns null for patches without SysEx data', () => {
    expect(buildSysExViewInfo({ rawData: null }, { modelId: 'behringer-pro800' })).toBeNull();
    expect(buildSysExViewInfo({ rawData: new Uint8Array(0) }, null)).toBeNull();
    expect(buildSysExViewInfo({}, {})).toBeNull();
  });

  it('provides decoded blob, contract and meta', () => {
    const parsed = firstPatch();
    const info = buildSysExViewInfo(
      { rawData: parsed.rawData, index: parsed.slot, name: 'Organ I' },
      { modelId: 'behringer-pro800' }
    );
    expect(info.rawData).toBeInstanceOf(Uint8Array);
    expect(info.rawData.length).toBe(173);
    expect(info.contract.displayName).toBe('Behringer Pro-800');
    expect(info.meta).toContain('Behringer Pro-800');
    expect(info.meta).toContain('A001');
    expect(info.meta).toContain('173 B');
    expect(info.baseName).toBe('Organ I');
  });

  it('rebuilds a valid full F0…F7 message matching the real hardware frame', () => {
    const raw = new Uint8Array(fs.readFileSync(FIXTURE));
    const messages = splitSysExMessages(raw);
    const real = messages[0];
    const parsed = pro800().parsePatchSysEx(real);

    const info = buildSysExViewInfo({ rawData: parsed.rawData, index: parsed.slot }, { modelId: 'behringer-pro800' });
    const msg = info.message;
    expect(info.canMessage).toBe(true);
    expect(msg[0]).toBe(0xF0);
    expect(msg[1]).toBe(0x00);
    expect(msg[8]).toBe(0x78);
    expect(msg[msg.length - 1]).toBe(0xF7);
    // The device does not zero-pad the final 7-byte group: 173 decoded bytes →
    // 24 full groups (192) + 1 control + 5 payload = 198 packed; frame = 12 + 198 = 210.
    expect(msg.length).toBe(real.length);
    expect(msg.length).toBe(210);
    // Rebuilding from the parsed blob reproduces the original hardware message exactly
    expect(Array.from(msg)).toEqual(Array.from(real));
  });

  it('round-trips: reparsed rebuilt message matches the original rawData', () => {
    const parsed = firstPatch();
    const info = buildSysExViewInfo({ rawData: parsed.rawData, index: 42 }, { modelId: 'behringer-pro800' });
    const reparsed = pro800().parsePatchSysEx(info.message);
    expect(reparsed).not.toBeNull();
    expect(reparsed.slot).toBe(42);
    expect(Array.from(reparsed.rawData)).toEqual(Array.from(parsed.rawData));
  });

  it('uses index for the diagnostic address', () => {
    const parsed = firstPatch();
    const info = buildSysExViewInfo({ rawData: parsed.rawData, index: 42 }, { modelId: 'behringer-pro800' });
    expect(info.meta).toContain('A043');
  });

  it('sanitizes unsafe chars in baseName and falls back to address', () => {
    const parsed = firstPatch();
    const dirty = buildSysExViewInfo({ rawData: parsed.rawData, name: 'A/B:C*D' }, { modelId: 'behringer-pro800' });
    expect(dirty.baseName).toBe('A_B_C_D');
    const empty = buildSysExViewInfo({ rawData: parsed.rawData, name: '' }, { modelId: 'behringer-pro800' });
    expect(empty.baseName).toBe('a001');
  });
});