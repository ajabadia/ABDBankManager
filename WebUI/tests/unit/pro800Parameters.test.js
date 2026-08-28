import { describe, expect, it } from 'vitest';
import { decodePro800Parameter, decodePro800Parameters, getPro800ParametersForFormat } from '../../src/core/pro800Parameters.js';

describe('Pro-800 parameter schema', () => {
  it('decodes little-endian continuous values', () => {
    const raw = new Uint8Array(173);
    raw[19] = 0x66;
    raw[20] = 0x95;
    const parameter = getPro800ParametersForFormat(111).find(item => item.id === 'filter-cutoff');
    expect(decodePro800Parameter(parameter, raw)).toBe(0x9566);
  });

  it('decodes names and option values', () => {
    const raw = new Uint8Array(173);
    raw.set(new TextEncoder().encode('Organ I'), 150);
    raw[64] = 3;
    const values = decodePro800Parameters(raw);
    expect(values.find(item => item.id === 'patch-name').value).toBe('Organ I');
    expect(values.find(item => item.id === 'lfo-shape').value).toBe(3);
  });

  it('decodes chord notes and per-note tuning', () => {
    const raw = new Uint8Array(173);
    raw[86] = 7;
    new DataView(raw.buffer).setFloat32(94, -0.25, true);
    const values = decodePro800Parameters(raw);
    expect(values.find(item => item.id === 'chord-note-1').value).toBe(7);
    expect(values.find(item => item.id === 'tuning-0').value).toBeCloseTo(-0.25);
  });

  it('does not expose v111 fields for legacy formats', () => {
    expect(getPro800ParametersForFormat(110).some(item => item.id === 'voice-spread')).toBe(false);
    expect(getPro800ParametersForFormat(111).some(item => item.id === 'voice-spread')).toBe(true);
  });
});
