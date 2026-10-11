/**
 * Write acknowledgement (`0x23` Write Completed / `0x24` Write Error).
 *
 * The MS2000 real device already answers a stored dump with `F0 42 3n 58 23 F7`.
 * The ABDSynths own format (`F0 7D 0A`, the plugin's 384-byte native block) uses
 * the same pair with the house header, so the Bank Manager can treat the software
 * exactly like hardware: send a patch, get a receipt.
 *
 * Two halves:
 *  - the contracts tell an acknowledgement apart from a patch dump;
 *  - the MIDI transport can wait for it (`sendPatch(..., { confirm: true })`)
 *    without changing the fire-and-forget default.
 */

import { describe, it, expect } from 'vitest';
import korgMs2000Contract, {
  korgMicrokorgContract,
  korgAbdSm002Contract,
} from '../../../Source/Contracts/Models/korg-ms2000.ts';
import { createMidiTransport } from '../../src/core/pro800Midi.js';

// ─── Fakes ───

function fakePorts() {
  const listeners = new Set();
  const sent = [];
  const input = {
    id: 'fake-in',
    name: 'Fake In',
    addEventListener(type, cb) { if (type === 'midimessage') listeners.add(cb); },
    removeEventListener(type, cb) { if (type === 'midimessage') listeners.delete(cb); },
  };
  const output = {
    id: 'fake-out',
    name: 'Fake Out',
    send(bytes) { sent.push(Uint8Array.from(bytes)); },
  };
  return {
    input,
    output,
    sent,
    emit(bytes) { for (const cb of listeners) cb({ data: Uint8Array.from(bytes) }); },
  };
}

const ABD_ACK = [0xF0, 0x7D, 0x0A, 0x23, 0xF7];
const ABD_NACK = [0xF0, 0x7D, 0x0A, 0x24, 0xF7];
const ABD_PATCH = new Uint8Array(384).fill(0x40);

// ─── Contract recognition ───

describe('write acknowledgement — contract recognition', () => {
  it('abd-sm002 reads the house pair F0 7D 0A 23/24 F7', () => {
    expect(korgAbdSm002Contract.parseAcknowledgement(new Uint8Array(ABD_ACK))).toEqual({ ok: true });
    expect(korgAbdSm002Contract.parseAcknowledgement(new Uint8Array(ABD_NACK))).toEqual({ ok: false });
  });

  it('abd-sm002 does not mistake a patch dump or a malformed ack for an acknowledgement', () => {
    const dump = korgAbdSm002Contract.buildPatchSysEx(ABD_PATCH, 0, 1);
    expect(korgAbdSm002Contract.parseAcknowledgement(dump)).toBeNull();
    // 0x23 with a payload is not a 5-byte ack
    expect(korgAbdSm002Contract.parseAcknowledgement(new Uint8Array([0xF0, 0x7D, 0x0A, 0x23, 0x00, 0xF7]))).toBeNull();
    // another model's ack is not ours
    expect(korgAbdSm002Contract.parseAcknowledgement(new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x23, 0xF7]))).toBeNull();
  });

  it('korg-ms2000 reads F0 42 3n 58 23/24 F7 on any channel', () => {
    expect(korgMs2000Contract.parseAcknowledgement(new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x23, 0xF7]))).toEqual({ ok: true });
    expect(korgMs2000Contract.parseAcknowledgement(new Uint8Array([0xF0, 0x42, 0x3F, 0x58, 0x24, 0xF7]))).toEqual({ ok: false });
  });

  it('korg-ms2000 ignores the house ack and its own 297-byte dump', () => {
    expect(korgMs2000Contract.parseAcknowledgement(new Uint8Array(ABD_ACK))).toBeNull();
    const dump = korgMs2000Contract.buildPatchSysEx(new Uint8Array(254), 0, 1);
    expect(korgMs2000Contract.parseAcknowledgement(dump)).toBeNull();
  });

  it('microKORG inherits the Korg acknowledgement (it shares the 0x58 model byte)', () => {
    expect(korgMicrokorgContract.parseAcknowledgement(new Uint8Array([0xF0, 0x42, 0x31, 0x58, 0x23, 0xF7]))).toEqual({ ok: true });
  });
});

// ─── Transport confirmation ───

describe('write acknowledgement — MIDI transport', () => {
  it('reports that the software destination can confirm writes', () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'abd-sm002', ...ports });
    expect(transport.capabilities.confirm).toBe(true);
    expect(transport.capabilities.softsynth).toBe(true);
    expect(transport.capabilities.modelId).toBe('abd-sm002');
  });

  it('resolves with the ack when the software destination stores the patch', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'abd-sm002', input: ports.input, output: ports.output });

    const confirmation = transport.sendPatch({ rawData: ABD_PATCH }, 0, 1, { confirm: true });
    // the 444-byte house frame went out
    expect(ports.sent).toHaveLength(1);
    expect(Array.from(ports.sent[0].slice(0, 4))).toEqual([0xF0, 0x7D, 0x0A, 0x40]);
    expect(ports.sent[0]).toHaveLength(444);

    ports.emit(ABD_ACK);
    await expect(confirmation).resolves.toEqual({ ok: true });
  });

  it('rejects when the destination answers 0x24 (it could not store it)', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'abd-sm002', ...ports });

    const confirmation = transport.sendPatch({ rawData: ABD_PATCH }, 0, 1, { confirm: true });
    ports.emit(ABD_NACK);
    await expect(confirmation).rejects.toThrow(/0x24/);
  });

  it('rejects on timeout when nobody answers', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'abd-sm002', ...ports, timeoutMs: 30 });

    await expect(transport.sendPatch({ rawData: ABD_PATCH }, 0, 1, { confirm: true }))
      .rejects.toThrow(/Timeout/);
  });

  it('keeps the fire-and-forget default (no confirm) returning the inter-message delay', () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'abd-sm002', ...ports });
    const delay = transport.sendPatch({ rawData: ABD_PATCH }, 0, 1);
    expect(typeof delay).toBe('number');
    expect(ports.sent).toHaveLength(1);
  });

  it('confirms a Korg write too, but flags the destination as hardware (not softsynth)', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'korg-ms2000', ...ports });
    expect(transport.capabilities.confirm).toBe(true);
    expect(transport.capabilities.softsynth).toBe(false);

    const confirmation = transport.sendPatch({ rawData: new Uint8Array(254) }, 0, 1, { confirm: true });
    expect(ports.sent[0]).toHaveLength(297);
    ports.emit([0xF0, 0x42, 0x30, 0x58, 0x23, 0xF7]);
    await expect(confirmation).resolves.toEqual({ ok: true });
  });

  it('refuses to promise a confirmation the contract cannot read', () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'yamaha-dx7', ...ports });
    expect(transport.capabilities.confirm).toBe(false);
    expect(() => transport.sendPatch({ rawData: new Uint8Array(128) }, 0, 1, { confirm: true }))
      .toThrow(/does not acknowledge/);
  });
});
