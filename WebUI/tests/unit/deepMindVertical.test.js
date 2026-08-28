import { describe, expect, it } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { splitSysExMessages } from '../../src/core/sysexParser.js';

describe('DeepMind 12 vertical protocol', () => {
  it('builds a protocol-compatible program dump with ABDEep framing', () => {
    const contract = getModelContract('behringer-deepmind12');
    const raw = new Uint8Array(242);
    raw[223] = 68;
    raw[224] = 101;
    raw[225] = 101;
    raw[226] = 112;
    const message = contract.buildPatchSysEx(raw, 0, 1);
    expect(message.length).toBe(291);
    expect(Array.from(message.slice(0, 10))).toEqual([0xF0, 0x00, 0x20, 0x32, 0x20, 0x00, 0x02, 0x07, 0x00, 0x00]);
    expect(message.at(-1)).toBe(0xF7);
    expect(contract.parsePatchSysEx(message).rawData).toHaveLength(242);
  });

  it('parses concatenated bank messages', () => {
    const contract = getModelContract('behringer-deepmind12');
    const message = contract.buildPatchSysEx(new Uint8Array(242), 0, 1);
    const combined = new Uint8Array([...message, ...message]);
    expect(splitSysExMessages(combined)).toHaveLength(2);
    expect(contract.parseDumpResponse(combined)).toHaveLength(2);
  });
});
