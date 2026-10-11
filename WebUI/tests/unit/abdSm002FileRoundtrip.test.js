/**
 * ABD MS2000 (abd-sm002) — own-format FILE roundtrip: parseFile / serializeFile
 * and the All Data Dump (0x4C) path.
 *
 * 444-byte frame: F0 7D 0A 40 + 439 payload bytes + F7, carrying the native
 * 384-byte program block (v2). The packer is NOT Korg's: control byte bit `i`
 * holds the MSB of data byte `i` (Korg uses bit `6-j`) and the last partial
 * group is not padded (384 = 54×7 + 6 → 54×8 + 1 + 6 = 439).
 *
 * Closes the JS side of DOCS/ABDSYNTHS_SYSEX_GUIDE.md §10 and of
 * ABDMS2000/DOCS/ABDSynths_SysEx_Spec.md §5 ("F0 7D 0A 4C → N presets").
 * Sibling: contractRoundtrip.test.js (per-contract build→parse roundtrip).
 */

import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../../Source/Contracts/Models/index.ts';
import { getContractForSysex } from '../../src/core/sysexParser.js';

const MODEL = 'abd-sm002';
const PROGRAM_SIZE = 384;
const PROGRAM_SIZE_V1 = 128;
const PAYLOAD_SIZE = 439;   // 54 * 8 + 7
const FRAME_SIZE = 444;     // 4 header + 439 payload + 1 F7
const ALL_FRAME_SIZE = 1322; // F0 7D 0A 4C + 1317 payload (3 × 384) + F7

const CMD_DUMP = 0x40;
const CMD_ALL_DUMP = 0x4C;

/** Deterministic 384-byte native program: name at 0x00 and the last two bytes
 *  with the MSB set (the bytes a padded or Korg-ordered codec would corrupt). */
function nativeProgram(seed, name) {
  const data = new Uint8Array(PROGRAM_SIZE);
  let s = seed;
  for (let i = 0; i < PROGRAM_SIZE; i++) {
    s = (s * 1103515245 + 12345) & 0x7FFFFFFF;
    data[i] = s & 0xFF;
  }
  data.set(new TextEncoder().encode(name.padEnd(12, ' ')), 0x00);
  data[PROGRAM_SIZE - 2] = 0xFF;
  data[PROGRAM_SIZE - 1] = 0xA5;
  return data;
}

/** ABDSynths 7→8 packing: control bit `i`, no padding of the last group. */
function packBitI(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 7) {
    const count = Math.min(7, data.length - i);
    let control = 0;
    for (let j = 0; j < count; j++) if ((data[i + j] & 0x80) !== 0) control |= 1 << j;
    out.push(control);
    for (let j = 0; j < count; j++) out.push(data[i + j] & 0x7F);
  }
  return new Uint8Array(out);
}

/** F0 7D 0A [cmd] [packed] F7 */
function ownFrame(cmd, data) {
  return new Uint8Array([0xF0, 0x7D, 0x0A, cmd, ...packBitI(data), 0xF7]);
}

describe('abd-sm002 — own-format file roundtrip (parseFile / serializeFile / All Data)', () => {
  const contract = getModelContract(MODEL);

  it('serializeFile writes N concatenated 444 B F0 7D 0A 40 frames', () => {
    const programs = [
      nativeProgram(11, 'ONE'),
      nativeProgram(22, 'TWO'),
      nativeProgram(33, 'THREE'),
    ];
    const patches = programs.map((rawData, slot) => ({ rawData, slot }));

    const file = contract.serializeFile(patches, { midiChannel: 1, deviceId: 0x0A, format: 'bank' });

    expect(file.length).toBe(FRAME_SIZE * programs.length);
    for (let i = 0; i < programs.length; i++) {
      const expected = ownFrame(CMD_DUMP, programs[i]);
      expect(expected.length).toBe(FRAME_SIZE);
      const offset = i * FRAME_SIZE;
      for (let b = 0; b < FRAME_SIZE; b++) expect(file[offset + b]).toBe(expected[b]);
    }
  });

  it('parseFile reads the file back as N abd-sm002 patches, byte-identical', () => {
    const programs = [
      nativeProgram(11, 'ONE'),
      nativeProgram(22, 'TWO'),
      nativeProgram(33, 'THREE'),
    ];
    const file = contract.serializeFile(
      programs.map((rawData, slot) => ({ rawData, slot })),
      { midiChannel: 1, deviceId: 0x0A, format: 'bank' }
    );

    const parsed = contract.parseFile(file, 'ABD_NATIVE_BANK.syx');
    expect(parsed).not.toBeNull();
    expect(parsed.modelId).toBe(MODEL);
    expect(parsed.patches).toHaveLength(3);

    ['ONE', 'TWO', 'THREE'].forEach((name, i) => {
      expect(parsed.patches[i].name).toBe(name);
      expect(parsed.patches[i].rawData.length).toBe(PROGRAM_SIZE);
      for (let b = 0; b < PROGRAM_SIZE; b++) {
        expect(parsed.patches[i].rawData[b]).toBe(programs[i][b]);
      }
    });
  });

  it('a single F0 7D 0A 40 frame is claimed by abd-sm002, not korg-ms2000', () => {
    const frame = ownFrame(CMD_DUMP, nativeProgram(11, 'ONE'));
    expect(frame.length).toBe(FRAME_SIZE);

    const match = getContractForSysex(frame);
    expect(match).not.toBeNull();
    expect(match.contract.modelId).toBe(MODEL);
  });

  it('All Data Dump F0 7D 0A 4C unpacks into N patches', () => {
    const programs = [
      nativeProgram(11, 'ONE'),
      nativeProgram(22, 'TWO'),
      nativeProgram(33, 'THREE'),
    ];
    const all = new Uint8Array(PROGRAM_SIZE * programs.length);
    programs.forEach((p, i) => all.set(p, i * PROGRAM_SIZE));

    const frame = ownFrame(CMD_ALL_DUMP, all);
    expect(frame.length).toBe(ALL_FRAME_SIZE);

    const dumped = contract.parseDumpResponse(frame);
    expect(dumped).toHaveLength(3);
    dumped.forEach((patch, i) => {
      expect(patch.slot).toBe(i);
      for (let b = 0; b < PROGRAM_SIZE; b++) expect(patch.rawData[b]).toBe(programs[i][b]);
    });

    // The same frame through the file entry point
    const parsed = contract.parseFile(frame, 'ABD_NATIVE_ALL.syx');
    expect(parsed.patches).toHaveLength(3);
    expect(parsed.patches[1].name).toBe('TWO');
  });

  it('a v1 frame (128 B, 152 B on the wire) is still read and padded to 384 B', () => {
    const v1 = new Uint8Array(PROGRAM_SIZE_V1);
    for (let i = 0; i < PROGRAM_SIZE_V1; i++) v1[i] = (i * 29 + 3) & 0xFF;
    v1.set(new TextEncoder().encode('V1 PRESET'.padEnd(12, ' ')), 0x00);

    const frame = ownFrame(CMD_DUMP, v1);
    expect(frame.length).toBe(152);

    const patch = contract.parsePatchSysEx(frame);
    expect(patch).not.toBeNull();
    expect(patch.rawData.length).toBe(PROGRAM_SIZE);
    for (let b = 0; b < PROGRAM_SIZE_V1; b++) expect(patch.rawData[b]).toBe(v1[b]);
    for (let b = PROGRAM_SIZE_V1; b < PROGRAM_SIZE; b++) expect(patch.rawData[b]).toBe(0);
  });
});
