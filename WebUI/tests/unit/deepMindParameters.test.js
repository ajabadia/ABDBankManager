import { describe, it, expect } from 'vitest';
import {
  DEEPMIND_PARAMETER_SCHEMA,
  decodeDeepMindParameter,
  decodeDeepMindParameters,
  getDeepMindParametersBySection,
  getByteMapName
} from '../../src/core/deepMindParameters.js';

function makeRawPatch(overrides = {}) {
  const data = new Uint8Array(242);
  // Default: all bytes 128 (midpoint for bipolar, 50% for value)
  data.fill(128);
  Object.entries(overrides).forEach(([offset, value]) => {
    data[Number(offset)] = value;
  });
  return data;
}

describe('DeepMind 12 Parameter Schema', () => {
  it('has schema covering all critical offsets 0-222 and 223-241', () => {
    const offsets = new Set(DEEPMIND_PARAMETER_SCHEMA.map(p => p.offset));
    // Core synth parameters 0-222
    for (let i = 0; i <= 222; i++) {
      expect(offsets.has(i)).toBe(true);
    }
    // Name field 223-238
    expect(offsets.has(223)).toBe(true);
    // Reserved 239-241
    expect(offsets.has(239)).toBe(true);
    expect(offsets.has(240)).toBe(true);
    expect(offsets.has(241)).toBe(true);
  });

  it('has a patch-name parameter at offset 223 with length 16', () => {
    const nameParam = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'patch-name');
    expect(nameParam).toBeDefined();
    expect(nameParam.offset).toBe(223);
    expect(nameParam.length).toBe(16);
    expect(nameParam.kind).toBe('name');
  });

  it('includes extended VCF parameters at offsets 245-247', () => {
    expect(DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vcf-model')).toBeDefined();
    expect(DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vcf-moog-submode')).toBeDefined();
    expect(DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vcf-korg-submode')).toBeDefined();
  });

  it('each parameter has required fields', () => {
    for (const p of DEEPMIND_PARAMETER_SCHEMA) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(typeof p.offset).toBe('number');
      expect(p.offset).toBeGreaterThanOrEqual(0);
      expect(p.kind).toMatch(/^(value|bipolar|enum|name)$/);
      if (p.kind === 'enum') {
        expect(Array.isArray(p.options)).toBe(true);
        expect(p.options.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('decodeDeepMindParameter', () => {
  it('decodes value type as raw/255', () => {
    const data = makeRawPatch();
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'lfo1-rate');
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBeCloseTo(128 / 255, 5);
  });

  it('decodes bipolar type correctly', () => {
    const data = makeRawPatch();
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vca-pan-spread');
    // raw=128 → bipolar = ((128-128)/127+1)/2 = 0.5
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBeCloseTo(0.5, 5);
  });

  it('decodes bipolar with raw=0 as ~0', () => {
    const data = makeRawPatch({ 83: 0 });
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vca-pan-spread');
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBeCloseTo(0, 2);
  });

  it('decodes bipolar with raw=255 as ~1', () => {
    const data = makeRawPatch({ 83: 255 });
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'vca-pan-spread');
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBeCloseTo(1, 2);
  });

  it('decodes enum type as raw/enumMax', () => {
    const data = makeRawPatch({ 2: 3 }); // lfo1-shape, enumMax=6
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'lfo1-shape');
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBeCloseTo(3 / 6, 5);
  });

  it('decodes name type correctly', () => {
    const data = makeRawPatch();
    // Write "Test Patch\0" at offset 223
    const name = 'Test Patch';
    for (let i = 0; i < name.length; i++) data[223 + i] = name.charCodeAt(i);
    data[223 + name.length] = 0;
    const param = DEEPMIND_PARAMETER_SCHEMA.find(p => p.id === 'patch-name');
    const value = decodeDeepMindParameter(param, data);
    expect(value).toBe('Test Patch');
  });

  it('returns null for out-of-bounds offset', () => {
    const data = new Uint8Array(10); // too short
    const param = { offset: 200, kind: 'value' };
    expect(decodeDeepMindParameter(param, data)).toBeNull();
  });
});

describe('decodeDeepMindParameters', () => {
  it('returns decoded value for every schema parameter', () => {
    const data = makeRawPatch();
    const result = decodeDeepMindParameters(data);
    expect(result.length).toBe(DEEPMIND_PARAMETER_SCHEMA.length);
    for (const p of result) {
      expect(p).toHaveProperty('value');
      expect(p).toHaveProperty('displayValue');
      expect(p).toHaveProperty('rawByte');
    }
  });

  it('decodes enum display values correctly', () => {
    const data = makeRawPatch({ 85: 6 }); // voice-mode, index 6 = "Mono"
    const result = decodeDeepMindParameters(data);
    const voiceMode = result.find(p => p.id === 'voice-mode');
    expect(voiceMode.displayValue).toBe('Mono');
  });

  it('decodes voice mode Poly (index 0)', () => {
    const data = makeRawPatch({ 85: 0 });
    const result = decodeDeepMindParameters(data);
    const voiceMode = result.find(p => p.id === 'voice-mode');
    expect(voiceMode.displayValue).toBe('Poly');
  });

  it('decodes LFO shape correctly', () => {
    const data = makeRawPatch({ 2: 0 }); // lfo1-shape = Sine
    const result = decodeDeepMindParameters(data);
    const shape = result.find(p => p.id === 'lfo1-shape');
    expect(shape.displayValue).toBe('Sine');
  });

  it('decodes patch name from bytes 223-238', () => {
    const data = makeRawPatch();
    const name = 'DeepPad 2024';
    for (let i = 0; i < name.length; i++) data[223 + i] = name.charCodeAt(i);
    data[223 + name.length] = 0;
    const result = decodeDeepMindParameters(data);
    const nameParam = result.find(p => p.id === 'patch-name');
    expect(nameParam.displayValue).toBe('DeepPad 2024');
  });

  it('decodes FX routing enum', () => {
    const data = makeRawPatch({ 165: 3 }); // fx-routing, index 3 = "Full Parallel"
    const result = decodeDeepMindParameters(data);
    const routing = result.find(p => p.id === 'fx-routing');
    expect(routing.displayValue).toBe('Full Parallel');
  });

  it('decodes VCF pole mode', () => {
    const data = makeRawPatch({ 51: 1 }); // vcf-pole-mode, index 1 = "2-Pole (12dB)"
    const result = decodeDeepMindParameters(data);
    const pole = result.find(p => p.id === 'vcf-pole-mode');
    expect(pole.displayValue).toBe('2-Pole (12dB)');
  });

  it('rawByte matches the input data', () => {
    const data = makeRawPatch({ 39: 200 }); // vcf-cutoff
    const result = decodeDeepMindParameters(data);
    const cutoff = result.find(p => p.id === 'vcf-cutoff');
    expect(cutoff.rawByte).toBe(200);
  });

  it('includes bipolar parameters with raw byte', () => {
    const data = makeRawPatch({ 27: 64 }); // osc2-pitch, bipolar
    const result = decodeDeepMindParameters(data);
    const pitch = result.find(p => p.id === 'osc2-pitch');
    expect(pitch.kind).toBe('bipolar');
    expect(pitch.rawByte).toBe(64);
    expect(pitch.value).toBeCloseTo(((64 - 128) / 127 + 1) / 2, 4);
  });
});

describe('getDeepMindParametersBySection', () => {
  it('groups parameters by section', () => {
    const data = makeRawPatch();
    const sections = getDeepMindParametersBySection(data);
    expect(sections).toHaveProperty('LFO1');
    expect(sections).toHaveProperty('LFO2');
    expect(sections).toHaveProperty('OSC1');
    expect(sections).toHaveProperty('OSC2');
    expect(sections).toHaveProperty('VCF');
    expect(sections).toHaveProperty('ENV1');
    expect(sections).toHaveProperty('ENV2');
    expect(sections).toHaveProperty('ENV3');
    expect(sections).toHaveProperty('VCA');
    expect(sections).toHaveProperty('Voice');
    expect(sections).toHaveProperty('ModMatrix');
    expect(sections).toHaveProperty('Seq');
    expect(sections).toHaveProperty('Arp');
    expect(sections).toHaveProperty('FX');
    expect(sections).toHaveProperty('FX1');
    expect(sections).toHaveProperty('FX2');
    expect(sections).toHaveProperty('FX3');
    expect(sections).toHaveProperty('FX4');
    expect(sections).toHaveProperty('Name');
  });

  it('LFO1 section has 7 parameters', () => {
    const data = makeRawPatch();
    const sections = getDeepMindParametersBySection(data);
    expect(sections.LFO1.length).toBe(7);
  });

  it('ModMatrix section has 24 parameters (8 slots × 3)', () => {
    const data = makeRawPatch();
    const sections = getDeepMindParametersBySection(data);
    expect(sections.ModMatrix.length).toBe(24);
  });

  it('Seq section includes 32 steps', () => {
    const data = makeRawPatch();
    const sections = getDeepMindParametersBySection(data);
    const steps = sections.SeqSteps || [];
    expect(steps.length).toBe(32);
  });
});

describe('getByteMapName', () => {
  it('returns name for known offset', () => {
    expect(getByteMapName(0)).toBe('LFO 1 Rate');
    expect(getByteMapName(39)).toBe('VCF Cutoff');
    expect(getByteMapName(222)).toBe('FX Mode');
  });

  it('returns fallback for unknown offset', () => {
    expect(getByteMapName(300)).toBe('Byte 300');
  });
});

describe('Real fixture validation', () => {
  it('decodes factory fixture without errors', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const fixturePath = path.default.resolve('fixtures/sysex/behringer-deepmind12/factory/Factory_Bank_A_v1.0.syx');
    if (!fs.default.existsSync(fixturePath)) return; // skip if fixture not present

    const data = fs.default.readFileSync(fixturePath);
    // Find first F0 message
    let start = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0xF0 && start < 0) start = i;
      if (data[i] === 0xF7 && start >= 0) {
        const msg = data.slice(start, i + 1);
        if (msg.length >= 291 && msg[4] === 0x20 && msg[6] === 0x02) {
          // Unpack 7-to-8
          const packed = msg.slice(10, 10 + 278);
          const unpacked = [];
          for (let off = 0; off < packed.length; off += 8) {
            const ctrl = packed[off];
            for (let j = 0; j < 7 && off + j + 1 < packed.length; j++) {
              unpacked.push((packed[off + j + 1] & 0x7F) | (((ctrl >> j) & 1) << 7));
            }
          }
          const rawData = new Uint8Array(unpacked.slice(0, 242));
          const result = decodeDeepMindParameters(rawData);
          expect(result.length).toBeGreaterThan(200);
          // Verify name is extracted
          const nameParam = result.find(p => p.id === 'patch-name');
          expect(nameParam).toBeDefined();
          expect(typeof nameParam.displayValue).toBe('string');
          break;
        }
        start = -1;
      }
    }
  });
});
