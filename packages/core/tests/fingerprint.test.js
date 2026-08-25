import { describe, it, expect } from 'vitest';
import { calculateFingerprint, checkDuplicate } from '../src/operations/fingerprint.js';

describe('calculateFingerprint', () => {
  it('should return empty string for null or empty data', async () => {
    expect(await calculateFingerprint(null)).toBe('');
    expect(await calculateFingerprint(new Uint8Array([]))).toBe('');
  });

  it('should return consistent SHA-256 hex hash', async () => {
    const data = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, 0x00, 0xF7]);
    const h1 = await calculateFingerprint(data);
    const h2 = await calculateFingerprint(data);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('should distinguish different sound data', async () => {
    const d1 = new Uint8Array([0xF0, 0x42, 0x30, 0xF7]);
    const d2 = new Uint8Array([0xF0, 0x42, 0x31, 0xF7]);
    expect(await calculateFingerprint(d1)).not.toBe(await calculateFingerprint(d2));
  });
});

describe('checkDuplicate', () => {
  const patches = [
    { id: '1', name: 'Bass', fingerprint: 'hash_a' },
    { id: '2', name: 'Lead', fingerprint: 'hash_b' },
  ];

  it('detects existing duplicate', () => {
    const res = checkDuplicate('hash_a', patches);
    expect(res.isDuplicate).toBe(true);
    expect(res.existingPatch.name).toBe('Bass');
  });

  it('returns false for new hash', () => {
    const res = checkDuplicate('hash_c', patches);
    expect(res.isDuplicate).toBe(false);
    expect(res.existingPatch).toBeNull();
  });
});
