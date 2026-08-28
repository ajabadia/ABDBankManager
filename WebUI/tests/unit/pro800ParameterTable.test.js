import { describe, expect, it } from 'vitest';
import { decodePro800Parameters } from '../../src/core/pro800Parameters.js';

describe('Pro-800 interpreted parameter table data', () => {
  it('returns displayable names, values and offsets from a patch', () => {
    const raw = new Uint8Array(173);
    raw[4] = 0x6F;
    raw[19] = 0x66;
    raw[20] = 0x95;
    raw[64] = 3;
    const rows = decodePro800Parameters(raw);
    const cutoff = rows.find(row => row.id === 'filter-cutoff');
    const lfo = rows.find(row => row.id === 'lfo-shape');
    expect(cutoff).toMatchObject({ name: 'Filter Cutoff', offset: 19, length: 2, value: 0x9566 });
    expect(lfo.value).toBe(3);
  });
});
