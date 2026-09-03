/**
 * BridgeManager protocol tests.
 * The native adapter emits { action, data, schemaVersion } while the
 * standalone bridge historically emitted flat action messages.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { paramStore } from '../../src/store/paramStore.js';

let bridge;
let originalWindow;

describe('BridgeManager native callback protocol', () => {
  beforeEach(async () => {
    originalWindow = globalThis.window;
    globalThis.window = {};
    paramStore.clear();
    ({ bridge } = await import('../../src/bridge/bridgeManager.js'));
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('consumes native nested state and emits state', async () => {
    const stateListener = vi.fn();
    bridge.on('state', stateListener);

    bridge._handleMessage({
      action: 'state',
      schemaVersion: 1,
      data: { version: 1, banks: [], params: { cutoff: 42 } }
    });

    expect(paramStore.getValue('cutoff')).toBe(42);
    expect(stateListener).toHaveBeenCalledWith(expect.objectContaining({ banks: [] }));
  });

  it('consumes native presetSelected payload', async () => {
    const listener = vi.fn();
    bridge.on('presetSelected', listener);

    bridge._handleMessage({
      action: 'presetSelected',
      data: { currentBankIndex: 0, currentPatchIndex: 3 }
    });

    expect(listener).toHaveBeenCalledWith({ currentBankIndex: 0, currentPatchIndex: 3 });
  });
});
