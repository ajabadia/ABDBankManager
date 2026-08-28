import { describe, expect, it, vi } from 'vitest';
import { createBehringerMidiTransport, fetchBehringerBank } from '../../src/core/pro800Midi.js';
import { getModelContract } from '../../src/contracts/modelContracts.js';

describe('DeepMind 12 MIDI transport', () => {
  it('matches and parses a DeepMind response', async () => {
    const output = { send: vi.fn() };
    const input = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const transport = createBehringerMidiTransport({ modelId: 'behringer-deepmind12', input, output, timeoutMs: 100 });
    const contract = getModelContract('behringer-deepmind12');
    const raw = new Uint8Array(242);
    raw[1] = 65;
    const response = contract.buildPatchSysEx(raw, 0, 1);
    const promise = transport.fetchPatch(0);
    input.addEventListener.mock.calls[0][1]({ data: response });
    await expect(promise).resolves.toMatchObject({ slot: 0, rawData: expect.any(Uint8Array) });
    expect(output.send).toHaveBeenCalledTimes(1);
  });

  it('fetches the requested number of DeepMind programs', async () => {
    const transport = { fetchPatch: vi.fn(async slot => ({ slot, rawData: new Uint8Array(242) })) };
    const patches = await fetchBehringerBank(transport, { count: 4 });
    expect(patches).toHaveLength(4);
    expect(transport.fetchPatch).toHaveBeenCalledTimes(4);
  });
});
