/**
 * Korg MS2000 — real single-program dump end-to-end through the Bank Manager
 * import engine (the entry point the embedded UI calls on file drop / open).
 *
 * The wire format of a real device is NOT multiple-of-8: a 254-byte program
 * travels as F0 42 3n 58 40 + 291 payload bytes (36 full groups + 1 control
 * + 2 data) + F7 = 297 bytes. A decoder that required a multiple of 8 dropped
 * the last 2 bytes of every program. This test pins the tolerant behavior
 * (parity with the C++ codec `ABDSharedCode/HardwareDrivers/SysExCodec.cpp`)
 * at the engine level, with the patch name read from 0x00 intact.
 */

import { describe, it, expect } from 'vitest';
import { importFile } from '../../src/core/importEngine.js';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { pack8to7NoPad } from '@contracts/SysEx/codec';

const NAME = 'BRASS LEAD';
const PATCH_SIZE = 254;
const PAYLOAD_SIZE = 291;   // 36 * 8 + 3
const FRAME_SIZE = 297;     // 5 header + 291 payload + 1 F7

/** A real-looking 254-byte program: name at 0x00, high bits everywhere,
 *  and the LAST two bytes with the MSB set — exactly the bytes a strict
 *  decoder used to lose (they live in the partial trailing group). */
function makeProgram() {
  const data = new Uint8Array(PATCH_SIZE);
  for (let i = 0; i < PATCH_SIZE; i++) data[i] = (i * 37 + 13) & 0xFF;

  const nameBytes = new TextEncoder().encode(NAME.padEnd(12, ' '));
  data.set(nameBytes, 0x00);

  data[PATCH_SIZE - 2] = 0xFF; // byte 252: in the partial group
  data[PATCH_SIZE - 1] = 0xA5; // byte 253: in the partial group
  return data;
}

/** F0 42 30 58 40 [pack8to7NoPad(program)] F7 — what a real MS2000 sends. */
function makeRealSingleDump(program) {
  const packed = pack8to7NoPad(program);
  expect(packed.length).toBe(PAYLOAD_SIZE);
  return new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, ...packed, 0xF7]);
}

function fileLike(bytes, name) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { name, arrayBuffer: async () => buffer };
}

describe('MS2000 real single dump (297 B) — import engine end to end', () => {
  it('imports the frame as one korg-ms2000 patch with its name and every byte intact', async () => {
    const program = makeProgram();
    const frame = makeRealSingleDump(program);

    // Real wire shape: 297 bytes, payload not a multiple of 8
    expect(frame.length).toBe(FRAME_SIZE);
    expect(frame[0]).toBe(0xF0);
    expect(frame[1]).toBe(0x42); // Korg
    expect(frame[3]).toBe(0x58); // MS2000
    expect(frame[4]).toBe(0x40); // Program Data Dump
    expect(frame[FRAME_SIZE - 1]).toBe(0xF7);

    const result = await importFile(fileLike(frame, 'MS2000_INIT.syx'));
    expect(result.success).toBe(true);
    expect(result.warnings ?? []).toEqual([]);

    expect(result.bank.modelId).toBe('korg-ms2000');
    expect(result.patches).toHaveLength(1);

    const patch = result.patches[0];
    expect(patch.rawData.length).toBe(PATCH_SIZE);
    expect(patch.name).toBe(NAME); // read from 0x00, space-padded, trimmed

    // Byte-exact, INCLUDING the last 2 bytes of the partial group
    for (let i = 0; i < PATCH_SIZE; i++) expect(patch.rawData[i]).toBe(program[i]);
    expect(patch.rawData[252]).toBe(0xFF);
    expect(patch.rawData[253]).toBe(0xA5);
  });

  it('re-exports to a byte-identical frame and re-imports to the same patch', async () => {
    const program = makeProgram();
    const frame = makeRealSingleDump(program);

    const first = await importFile(fileLike(frame, 'MS2000_INIT.syx'));
    expect(first.success).toBe(true);

    const contract = getModelContract('korg-ms2000');
    const rebuilt = contract.buildPatchSysEx(first.patches[0].rawData, 0, 0);

    // Same wire format a real device produces: byte-for-byte
    expect(rebuilt.length).toBe(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) expect(rebuilt[i]).toBe(frame[i]);

    const second = await importFile(fileLike(rebuilt, 'MS2000_INIT.syx'));
    expect(second.success).toBe(true);
    expect(second.patches[0].name).toBe(NAME);
    for (let i = 0; i < PATCH_SIZE; i++) {
      expect(second.patches[0].rawData[i]).toBe(program[i]);
    }
  });
});
