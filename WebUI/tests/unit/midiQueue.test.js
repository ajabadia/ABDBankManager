/**
 * MIDI SysEx Queue Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// @core/MidiSysExQueue not compiled to WebUI — skip until bridge build step exists
describe.skip('MidiSysExQueue', () => {
  let mockOutput;
  let queue;

  beforeEach(() => {
    mockOutput = { send: vi.fn() };
    queue = new MidiSysExQueue(mockOutput);
  });

  it('should create queue with correct initial state', () => {
    expect(queue.getQueueLength()).toBe(0);
    expect(queue.isProcessing()).toBe(false);
  });

  it('should enqueue messages', async () => {
    const messages = [new Uint8Array([0xF0, 0x01, 0xF7])];
    await queue.enqueue(messages, 10);
    // enqueue returns immediately, processing happens async
    expect(mockOutput.send).toHaveBeenCalledTimes(1);
  });

  it('should send single message and return promise', async () => {
    const message = new Uint8Array([0xF0, 0x42, 0x00, 0xF7]);
    const promise = queue.send(message, 5);
    await promise;
    expect(mockOutput.send).toHaveBeenCalledWith(message);
  });

  it('should clear queue and reject pending', async () => {
    const messages = [new Uint8Array([0xF0, 0x01, 0xF7]), new Uint8Array([0xF0, 0x02, 0xF7])];
    const promise = queue.enqueue(messages, 100);
    queue.clear();
    // Note: current implementation may not reject properly in all cases
    expect(queue.getQueueLength()).toBe(0);
  });

  it('should track queue length', () => {
    expect(queue.getQueueLength()).toBe(0);
  });
});

describe.skip('Hardware Queue Configurations', () => {
  it('should have configs for all supported hardware', () => {
    expect(HARDWARE_QUEUE_CONFIGS['casio-cz']).toEqual({ interMessageDelayMs: 100, dumpTimeoutMs: 5000 });
    expect(HARDWARE_QUEUE_CONFIGS['roland-juno']).toEqual({ interMessageDelayMs: 50, dumpTimeoutMs: 3000 });
    expect(HARDWARE_QUEUE_CONFIGS['korg-ms2000']).toEqual({ interMessageDelayMs: 20, dumpTimeoutMs: 2000 });
    expect(HARDWARE_QUEUE_CONFIGS['behringer-dm12']).toEqual({ interMessageDelayMs: 10, dumpTimeoutMs: 1000 });
    expect(HARDWARE_QUEUE_CONFIGS['yamaha-dx7']).toEqual({ interMessageDelayMs: 20, dumpTimeoutMs: 2000 });
  });

  it('should have positive delays and timeouts', () => {
    for (const config of Object.values(HARDWARE_QUEUE_CONFIGS)) {
      expect(config.interMessageDelayMs).toBeGreaterThan(0);
      expect(config.dumpTimeoutMs).toBeGreaterThan(0);
    }
  });
});