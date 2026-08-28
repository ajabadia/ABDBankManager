/**
 * Patch Naming — extracción de nombre del blob vía contrato (extractPatchName)
 * y generación de placeholders cuando el formato no tiene nombres.
 */

import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { generatePatchName } from '../../src/core/patchNaming.js';

function writeString(data, offset, str, maxLen) {
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < maxLen; i++) {
    data[offset + i] = i < bytes.length ? bytes[i] : 0;
  }
}

describe('extractPatchName — extracción según el contrato', () => {
  it('Korg MS2000: name at 0x1C, 12 chars ASCII, null-trimmed', () => {
    const ms2000 = getModelContract('korg-ms2000');
    const data = new Uint8Array(288);
    writeString(data, 0x1C, 'BRASS LEAD', 12);
    expect(ms2000.extractPatchName(data)).toBe('BRASS LEAD');
    expect(ms2000.extractPatchName(data.slice(0, 20))).toBe(''); // too short
  });

  it('Behringer DM12: name at 223-238, 16 chars', () => {
    const dm12 = getModelContract('behringer-deepmind12');
    const data = new Uint8Array(242);
    writeString(data, 223, 'DeepMind Lead', 16);
    expect(dm12.extractPatchName(data)).toBe('DeepMind Lead');
    expect(dm12.extractPatchName(data.slice(0, 200))).toBe(''); // too short
  });

  it('Yamaha DX7: name at 0x09, 10 chars (DX7 6-bit charset)', () => {
    const dx7 = getModelContract('yamaha-dx7');
    const data = new Uint8Array(0x13);
    // DX7 6-bit charset: 0=space, 1-26=A-Z, 27-36=0-9, 37+=symbols
    // E=5, .=50, P=16, I=9, A=1, N=14, O=15, space=0, 1=28
    const dx7Encode = { E:5, '.':50, P:16, I:9, A:1, N:14, O:15, ' ':0, '1':28 };
    const name = 'E.PIANO 1';
    for (let i = 0; i < name.length && i < 10; i++) {
      data[0x09 + i] = dx7Encode[name[i]] ?? 0;
    }
    expect(dx7.extractPatchName(data)).toBe('E.PIANO 1');
    expect(dx7.extractPatchName(new Uint8Array(0x12))).toBe(''); // < 0x13 bytes
  });

  it('formats without names (Casio CZ, Roland Juno) always return empty', () => {
    expect(getModelContract('casio-cz101').extractPatchName(new Uint8Array(128))).toBe('');
    expect(getModelContract('roland-juno106').extractPatchName(new Uint8Array(18))).toBe('');
  });
});

describe('generatePatchName — placeholders cuando no hay nombre', () => {
  it('uses the contract addressing for formats without names', () => {
    const cz101 = getModelContract('casio-cz101');
    const juno = getModelContract('roland-juno106');
    expect(generatePatchName(cz101, 0)).toBe('Casio CZ-101 A1');
    expect(generatePatchName(cz101, 15)).toBe('Casio CZ-101 A16');
    expect(generatePatchName(juno, 0)).toBe('Roland Juno-106 A1');
  });

  it('marks formats with names as "(sin nombre)" when the blob came empty', () => {
    const ms2000 = getModelContract('korg-ms2000');
    expect(generatePatchName(ms2000, 0)).toBe('(sin nombre)');
  });

  it('falls back to a generic name without a known contract', () => {
    expect(generatePatchName(null, 0)).toBe('Patch 1');
    expect(generatePatchName(null, 4)).toBe('Patch 5');
  });
});
