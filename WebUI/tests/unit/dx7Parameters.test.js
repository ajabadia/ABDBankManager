import { describe, it, expect } from 'vitest';
import {
  DX7_PARAMETERS,
  decodeDx7Parameter,
  extractDx7Name,
  decodeDx7Parameters,
  getDx7TableParameters,
} from '../../src/core/dx7Parameters.js';

describe('DX7 Parameters Schema', () => {
  describe('Schema completeness', () => {
    it('should have 108 operator parameters (6 ops × 18 params)', () => {
      const opParams = DX7_PARAMETERS.filter(p => p.section?.startsWith('OP'));
      expect(opParams.length).toBe(6 * 18);
    });

    it('should cover all 6 operators', () => {
      for (let op = 1; op <= 6; op++) {
        const opParams = DX7_PARAMETERS.filter(p => p.section === `OP${op}`);
        expect(opParams.length).toBe(18);
      }
    });

    it('should have 19 global parameters', () => {
      const globalParams = DX7_PARAMETERS.filter(p => !p.section?.startsWith('OP') && p.type !== 'name');
      expect(globalParams.length).toBe(19);
    });

    it('should have a name parameter', () => {
      const nameParam = DX7_PARAMETERS.find(p => p.type === 'name');
      expect(nameParam).toBeDefined();
      expect(nameParam.section).toBe('Name');
    });

    it('should have 128 total parameters', () => {
      expect(DX7_PARAMETERS.length).toBe(128);
    });

    it('should have operators at correct byte offsets (18 bytes each)', () => {
      // OP6 at offset 0, OP5 at 18, OP4 at 36, OP3 at 54, OP2 at 72, OP1 at 90
      const op6 = DX7_PARAMETERS.filter(p => p.section === 'OP6');
      expect(op6[0].offset).toBe(0);

      const op5 = DX7_PARAMETERS.filter(p => p.section === 'OP5');
      expect(op5[0].offset).toBe(18);

      const op1 = DX7_PARAMETERS.filter(p => p.section === 'OP1');
      expect(op1[0].offset).toBe(90);
    });

    it('should have globals starting at offset 108', () => {
      const pitchEg = DX7_PARAMETERS.find(p => p.name === 'Pitch EG Rate 1');
      expect(pitchEg.offset).toBe(108);

      const algorithm = DX7_PARAMETERS.find(p => p.name === 'Algorithm');
      expect(algorithm.offset).toBe(116);
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

    it('should decode LFO waveform enum', () => {
      const param = DX7_PARAMETERS.find(p => p.name === 'LFO Waveform');
      expect(decodeDx7Parameter(0, param)).toBe('Triangle');
      expect(decodeDx7Parameter(1, param)).toBe('Saw Down');
      expect(decodeDx7Parameter(4, param)).toBe('S&H (Random)');
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
  });

  describe('Name extraction', () => {
    it('should extract name from bytes 9–18', () => {
      const data = new Uint8Array(128);
      const name = 'E.PIANO';
      for (let i = 0; i < name.length; i++) {
        data[9 + i] = name.charCodeAt(i);
      }
      expect(extractDx7Name(data)).toBe('E.PIANO');
    });

    it('should handle null-terminated names', () => {
      const data = new Uint8Array(128);
      const name = 'BASS';
      for (let i = 0; i < name.length; i++) {
        data[9 + i] = name.charCodeAt(i);
      }
      data[9 + name.length] = 0;
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
    it('should decode all parameters from 128-byte data', () => {
      const data = new Uint8Array(128);
      data[0] = 99;       // OP6 EG Rate 1 (offset 0)
      data[8] = 75;       // OP6 Output Level (offset 8)
      data[90 + 8] = 80;  // OP1 Output Level (offset 98)
      data[116] = 5;      // Algorithm (offset 116)
      data[119] = 45;     // LFO Speed (offset 119)

      const params = decodeDx7Parameters(data);
      expect(params.length).toBe(127); // 128 - 1 name

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
      data[116] = 3; // Algorithm
      const table = getDx7TableParameters(data);
      expect(table.length).toBe(127);
      expect(table[0]).toHaveProperty('offset');
      expect(table[0]).toHaveProperty('name');
      expect(table[0]).toHaveProperty('value');
      expect(table[0]).toHaveProperty('range');
      const algo = table.find(p => p.name === 'Algorithm');
      expect(algo.offset).toMatch(/0x74/);
    });
  });
});
