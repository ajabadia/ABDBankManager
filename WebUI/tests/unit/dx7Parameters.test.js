import { describe, it, expect } from 'vitest';
import {
  DX7_PARAMETERS,
  decodeDx7Parameter,
  extractDx7Name,
  decodeDx7Parameters,
  getDx7TableParameters,
} from '../../src/core/dx7Parameters.js';

describe('DX7 Parameters Schema (VMEM format)', () => {
  describe('Schema completeness', () => {
    it('should have operator parameters for 6 ops', () => {
      const opParams = DX7_PARAMETERS.filter(p => p.section?.startsWith('OP'));
      expect(opParams.length).toBeGreaterThan(0);
      // Each op should have params
      for (let op = 1; op <= 6; op++) {
        const opP = DX7_PARAMETERS.filter(p => p.section === `OP${op}`);
        expect(opP.length).toBeGreaterThanOrEqual(10); // at least EG + output + freq
      }
    });

    it('should cover all 6 operators', () => {
      const sections = new Set(DX7_PARAMETERS.filter(p => p.section?.startsWith('OP')).map(p => p.section));
      expect(sections.size).toBe(6);
    });

    it('should have global parameters', () => {
      const globalParams = DX7_PARAMETERS.filter(p => !p.section?.startsWith('OP') && p.type !== 'name');
      expect(globalParams.length).toBeGreaterThanOrEqual(15); // Pitch EG + Algo + FB + LFO + Transpose
    });

    it('should have a name parameter', () => {
      const nameParam = DX7_PARAMETERS.find(p => p.type === 'name');
      expect(nameParam).toBeDefined();
      expect(nameParam.section).toBe('Name');
    });

    it('should have operators at VMEM byte offsets (17 bytes each)', () => {
      // VMEM: OP6 at offset 0, OP5 at 17, OP4 at 34, OP3 at 51, OP2 at 68, OP1 at 85
      const op6 = DX7_PARAMETERS.filter(p => p.section === 'OP6');
      expect(op6[0].offset).toBe(0);

      const op5 = DX7_PARAMETERS.filter(p => p.section === 'OP5');
      expect(op5[0].offset).toBe(17);

      const op1 = DX7_PARAMETERS.filter(p => p.section === 'OP1');
      expect(op1[0].offset).toBe(85);
    });

    it('should have globals starting at offset 102', () => {
      const pitchEg = DX7_PARAMETERS.find(p => p.name === 'Pitch EG Rate 1');
      expect(pitchEg.offset).toBe(102);

      const algorithm = DX7_PARAMETERS.find(p => p.name === 'Algorithm');
      expect(algorithm.offset).toBe(110);
    });

    it('should have name at offset 118', () => {
      const nameParam = DX7_PARAMETERS.find(p => p.type === 'name');
      expect(nameParam.offset).toBe(118);
    });
  });

  describe('Parameter decoding', () => {
    it('should decode enum parameters', () => {
      const param = { type: 'enum', enum: { 0: 'Off', 1: 'On' } };
      expect(decodeDx7Parameter(0, param)).toBe('Off');
      expect(decodeDx7Parameter(1, param)).toBe('On');
      expect(decodeDx7Parameter(2, param)).toBe('Unknown (2)');
    });

    it('should decode detune values (0–14 → −7 to +7)', () => {
      const param = { type: 'detune' };
      expect(decodeDx7Parameter(0, param)).toBe(-7);
      expect(decodeDx7Parameter(7, param)).toBe(0);
      expect(decodeDx7Parameter(14, param)).toBe(7);
    });

    it('should decode LFO waveform with bit masking', () => {
      const param = DX7_PARAMETERS.find(p => p.name === 'LFO Waveform');
      // LFO Waveform is bits 1-3 of byte 116
      // Value 0x02 = bits 1=1 → waveform=1 (Saw Down)
      expect(decodeDx7Parameter(0x02, param)).toBe('Saw Down');
      // Value 0x08 = bits 1-3=100 → waveform=4 (S&H)
      expect(decodeDx7Parameter(0x08, param)).toBe('S&H (Random)');
    });

    it('should decode algorithm enum (1–32)', () => {
      const param = DX7_PARAMETERS.find(p => p.name === 'Algorithm');
      expect(decodeDx7Parameter(0, param)).toBe('1');
      expect(decodeDx7Parameter(31, param)).toBe('32');
    });

    it('should decode value parameters as-is', () => {
      const param = { type: 'value' };
      expect(decodeDx7Parameter(50, param)).toBe(50);
    });

    it('should decode feedback with bit masking', () => {
      const param = DX7_PARAMETERS.find(p => p.name === 'Feedback');
      // Feedback is bits 0-2 of byte 111
      expect(decodeDx7Parameter(15, param)).toBe('7'); // 15 & 7 = 7
      expect(decodeDx7Parameter(0x0B, param)).toBe('3'); // 11 & 7 = 3
    });
  });

  describe('Name extraction', () => {
    it('should extract name from offset 118 (VMEM)', () => {
      const data = new Uint8Array(128);
      const name = 'E.PIANO';
      for (let i = 0; i < name.length; i++) {
        data[118 + i] = name.charCodeAt(i);
      }
      expect(extractDx7Name(data)).toBe('E.PIANO');
    });

    it('should handle null-terminated names', () => {
      const data = new Uint8Array(128);
      const name = 'BASS';
      for (let i = 0; i < name.length; i++) {
        data[118 + i] = name.charCodeAt(i);
      }
      data[118 + name.length] = 0;
      expect(extractDx7Name(data)).toBe('BASS');
    });

    it('should return empty string for short data', () => {
      expect(extractDx7Name(new Uint8Array(5))).toBe('');
    });

    it('should handle null/undefined data', () => {
      expect(extractDx7Name(null)).toBe('');
      expect(extractDx7Name(undefined)).toBe('');
    });
  });

  describe('Full decode', () => {
    it('should decode all parameters from 128-byte VMEM data', () => {
      const data = new Uint8Array(128);
      data[0] = 99;       // OP6 EG Rate 1 (offset 0)
      data[14] = 75;      // OP6 Output Level (offset 14)
      data[85 + 14] = 80; // OP1 Output Level (offset 99)
      data[110] = 5;      // Algorithm (offset 110)
      data[112] = 45;     // LFO Speed (offset 112)

      const params = decodeDx7Parameters(data);

      const r1 = params.find(p => p.name === 'OP6 EG Rate 1');
      expect(r1.value).toBe(99);
      expect(r1.offset).toBe(0);

      const ol6 = params.find(p => p.name === 'OP6 Output Level');
      expect(ol6.value).toBe(75);

      const ol1 = params.find(p => p.name === 'OP1 Output Level');
      expect(ol1.value).toBe(80);

      const algo = params.find(p => p.name === 'Algorithm');
      expect(algo.value).toBe('6');

      const lfo = params.find(p => p.name === 'LFO Speed');
      expect(lfo.value).toBe(45);
    });

    it('should return empty array for short data', () => {
      expect(decodeDx7Parameters(new Uint8Array(10))).toEqual([]);
    });
  });

  describe('Table parameters', () => {
    it('should return table-friendly format with hex offsets', () => {
      const data = new Uint8Array(128);
      data[110] = 3; // Algorithm
      const table = getDx7TableParameters(data);
      expect(table.length).toBeGreaterThan(0);
      expect(table[0]).toHaveProperty('offset');
      expect(table[0]).toHaveProperty('name');
      expect(table[0]).toHaveProperty('value');
      expect(table[0]).toHaveProperty('range');
      const algo = table.find(p => p.name === 'Algorithm');
      expect(algo.offset).toMatch(/0x6E/); // 110 = 0x6E
    });
  });
});
