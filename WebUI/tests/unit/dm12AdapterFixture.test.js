/**
 * Behringer DeepMind 12 — Adapter vs. Real Fixtures
 *
 * Previously the BehringerDm12ImportAdapter used a wrong model ID (0x0E) and a
 * wrong name offset (0x01), so it could NOT parse any real DeepMind 12 dump.
 * The real DM12 SysEx (verified against the Behringer manual and real fixtures)
 * is: F0 00 20 32 20 <device> 02 07 <bank> <program> <278B packed> 00 00 F7,
 * with model ID 0x20 and the patch name at decoded offset 0xDF (223).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  BehringerDm12ImportAdapter,
  BehringerDm12ExportAdapter,
} from '../../../Source/Contracts/Adapters/behringerDm12Adapter.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../../fixtures/sysex/behringer-deepmind12');

function loadFixture(relPath) {
  return new Uint8Array(readFileSync(path.join(FIXTURES, relPath)));
}

describe('Behringer DeepMind 12 Adapter — Real Fixtures', () => {
  it('canParse detects single-patch and bank dumps', () => {
    const adapter = new BehringerDm12ImportAdapter();
    expect(adapter.canParse(loadFixture('community/AE Angelia.syx'), 'AE Angelia.syx')).toBe(true);
    expect(adapter.canParse(loadFixture('factory/Factory Bank A v1.0.syx'), 'Factory Bank A v1.0.syx')).toBe(true);
    expect(adapter.canParse(loadFixture('commercial/5P_Media_DM12.syx'), '5P_Media_DM12.syx')).toBe(true);
  });

  it('does not parse an unrelated .syx', () => {
    const adapter = new BehringerDm12ImportAdapter();
    expect(adapter.canParse(new Uint8Array([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]), 'x.syx')).toBe(false);
  });

  it('parses a single patch with the correct name', () => {
    const adapter = new BehringerDm12ImportAdapter();
    const r = adapter.parse(loadFixture('community/AE Angelia.syx'), 'AE Angelia.syx');
    expect(r.success).toBe(true);
    expect(r.modelId).toBe('behringer-deepmind12');
    expect(r.patches.length).toBe(1);
    expect(r.patches[0].name).toBe('AE Angelia');
    expect(r.patches[0].rawData.length).toBe(242);
  });

  it('parses a full factory bank (128 patches, 242 bytes each)', () => {
    const adapter = new BehringerDm12ImportAdapter();
    const r = adapter.parse(loadFixture('factory/Factory Bank A v1.0.syx'), 'Factory Bank A v1.0.syx');
    expect(r.success).toBe(true);
    expect(r.patches.length).toBe(128);
    for (const p of r.patches) {
      expect(p.rawData.length).toBe(242);
      expect(p.hardwareIds).toContain('behringer-deepmind12');
    }
  });

  it('parses a commercial bank with broadcast device ID (0x7F)', () => {
    const adapter = new BehringerDm12ImportAdapter();
    const r = adapter.parse(loadFixture('commercial/5P_Media_DM12.syx'), '5P_Media_DM12.syx');
    expect(r.success).toBe(true);
    expect(r.patches.length).toBe(128);
    expect(r.patches[0].rawData.length).toBe(242);
  });

  it('export serialization preserves patch data on re-import roundtrip', () => {
    const importer = new BehringerDm12ImportAdapter();
    const exporter = new BehringerDm12ExportAdapter();
    const imported = importer.parse(loadFixture('community/AE Angelia.syx'), 'AE Angelia.syx');
    expect(imported.success).toBe(true);
    const exported = exporter.serialize(imported.patches, 'test');

    // Re-import the exported bytes and confirm the patch data survives.
    const reimported = importer.parse(exported, 'roundtrip.syx');
    expect(reimported.success).toBe(true);
    expect(reimported.patches.length).toBe(imported.patches.length);
    expect(new Uint8Array(reimported.patches[0].rawData)).toEqual(
      new Uint8Array(imported.patches[0].rawData)
    );
  });
});
