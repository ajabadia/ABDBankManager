import { describe, it, expect } from 'vitest';
import { calculateFingerprint, FINGERPRINT_VERSION } from '../src/operations/fingerprint.js';

describe('fingerprint versioning', () => {
  it('exports a positive integer FINGERPRINT_VERSION', () => {
    expect(Number.isInteger(FINGERPRINT_VERSION)).toBe(true);
    expect(FINGERPRINT_VERSION).toBeGreaterThan(0);
  });

  it('keeps fingerprints stable for identical input', async () => {
    const a = await calculateFingerprint(new Uint8Array([1, 2, 3, 4]));
    const b = await calculateFingerprint(new Uint8Array([1, 2, 3, 4]));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different fingerprints for different input', async () => {
    const a = await calculateFingerprint(new Uint8Array([1, 2, 3]));
    const b = await calculateFingerprint(new Uint8Array([9, 9, 9]));
    expect(a).not.toBe(b);
  });

  it('returns empty string for empty rawData', async () => {
    expect(await calculateFingerprint(new Uint8Array(0))).toBe('');
    expect(await calculateFingerprint(null)).toBe('');
  });

  it('uses contract.extractSoundBytes scoping when provided', async () => {
    const full = new Uint8Array([9, 9, 9, 1, 2, 3]);
    const contract = { extractSoundBytes: (raw) => raw.slice(3) };
    const scoped = await calculateFingerprint(full, contract);
    const direct = await calculateFingerprint(new Uint8Array([1, 2, 3]));
    expect(scoped).toBe(direct);
  });
});
