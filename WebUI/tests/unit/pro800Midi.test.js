import { describe, expect, it, vi } from 'vitest';
import { createPro800MidiTransport, fetchPro800Bank } from '../../src/core/pro800Midi.js';
import { getModelContract } from '../../src/contracts/modelContracts.js';

describe('Pro-800 MIDI transport', () => {
  it('sends a request and resolves the matching response', async () => {
    const output = { send: vi.fn() };
    const input = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const transport = createPro800MidiTransport({ input, output, timeoutMs: 100 });
    const contract = getModelContract('behringer-pro800');
    const raw = new Uint8Array(173);
    raw[4] = 0x6F;
    const response = contract.buildPatchSysEx(raw, 3, 1);
    const promise = transport.fetchPatch(3);
    const handler = input.addEventListener.mock.calls[0][1];
    handler({ data: response });
    await expect(promise).resolves.toMatchObject({ slot: 3 });
    expect(output.send).toHaveBeenCalledTimes(1);
    transport.close();
  });

  it('fetches a bank and reports progress', async () => {
    const transport = { fetchPatch: vi.fn(async slot => ({ slot, rawData: new Uint8Array([slot]) })) };
    const progress = vi.fn();
    const patches = await fetchPro800Bank(transport, { start: 10, count: 3, onProgress: progress });
    expect(patches.map(patch => patch.slot)).toEqual([10, 11, 12]);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress.mock.calls[2][0]).toMatchObject({ completed: 3, total: 3, slot: 12 });
  });
});
