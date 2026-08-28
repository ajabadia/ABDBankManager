/**
 * Library .abdlibrary — roundtrip export→import del formato multi-banco dedicado.
 * Verifica que una librería de varios bancos se serializa y se vuelve a leer
 * con los blobs intactos, y que el monobanco .abdbank sigue siendo válido.
 */

import { describe, it, expect } from 'vitest';
import { buildLibraryZip } from '../../src/core/exportEngine.js';
import { importFile } from '../../src/core/importEngine.js';

const BANKS = [
  {
    bank: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Live Set',
      modelId: 'korg-ms2000',
      manufacturer: 'Korg',
      isFactory: false,
      creationDate: '2026-08-25T10:00:00.000Z'
    },
    patches: [
      { index: 0, name: 'BRASS A.01', category: 'Synth', rawData: new Uint8Array([0xF0, 0x42, 0x01, 0x02, 0xF7]) },
      { index: 1, name: 'LEAD A.02', category: 'Lead', rawData: new Uint8Array([0xF0, 0x42, 0x03, 0x04, 0xF7]) }
    ]
  },
  {
    bank: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Factory CZ',
      modelId: 'casio-cz101',
      manufacturer: 'Casio',
      isFactory: true,
      creationDate: '2026-08-20T08:00:00.000Z'
    },
    patches: [
      { index: 0, name: 'PAD A1', category: 'Pad', rawData: new Uint8Array([0xF0, 0x44, 0x11, 0xF7]) }
    ]
  }
];

// JSZip en Node no acepta File/Blob nativo (el navegador sí); pasamos un
// ArrayBuffer con un objeto file-like que respeta el contrato que usa importFile
// (name / arrayBuffer() / text()).
async function zipToFileLike(zip, name) {
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const bytes = new Uint8Array(buffer);
  return {
    name,
    arrayBuffer: async () => buffer,
    text: async () => new TextDecoder().decode(bytes)
  };
}

describe('buildLibraryZip — formato .abdlibrary', () => {
  it('genera manifest con format abdlibrary y banks[]', async () => {
    const zip = await buildLibraryZip(BANKS);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

    expect(manifest.version).toBe(1);
    expect(manifest.format).toBe('abdlibrary');
    expect(manifest.library.bankCount).toBe(2);
    expect(manifest.banks).toHaveLength(2);
    expect(manifest.banks[1].bank.isFactory).toBe(true);
    expect(manifest.banks[0].patches[0].rawDataFile).toBe('banks/000/patch_000.bin');
  });

  it('coloca los blobs en banks/NN/patch_MMM.bin', async () => {
    const zip = await buildLibraryZip(BANKS);
    expect(await zip.file('banks/000/patch_000.bin').async('uint8array')).toEqual(BANKS[0].patches[0].rawData);
    expect(await zip.file('banks/001/patch_000.bin').async('uint8array')).toEqual(BANKS[1].patches[0].rawData);
  });
});

describe('roundtrip .abdlibrary export→import', () => {
  it('recupera todos los bancos y blobs byte-idénticos', async () => {
    const zip = await buildLibraryZip(BANKS);
    const file = await zipToFileLike(zip, 'abd-library-2026-08-27.abdlibrary');

    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.banks).toHaveLength(2);

    const [b0, b1] = result.banks;
    expect(b0.bank.name).toBe('Live Set');
    expect(b0.bank.modelId).toBe('korg-ms2000');
    expect(b0.patches).toHaveLength(2);
    expect(b0.patches[1].name).toBe('LEAD A.02');
    expect(Array.from(b0.patches[1].rawData)).toEqual([0xF0, 0x42, 0x03, 0x04, 0xF7]);

    expect(b1.bank.isFactory).toBe(true);
    expect(b1.bank.hardwareIds).toContain('casio-cz101');
    expect(b1.patches).toHaveLength(1);
  });

  it('deriva hardwareIds del contrato si el manifest no los trae', async () => {
    const zip = await buildLibraryZip([{
      bank: { id: 'x', name: 'Solo', modelId: 'roland-juno106', manufacturer: 'Roland' },
      patches: []
    }]);
    const file = await zipToFileLike(zip, 'lib.abdlibrary');
    const result = await importFile(file);
    expect(result.banks[0].bank.hardwareIds).toContain('roland-juno60');
  });

  it('rechaza un ZIP cuyo manifest no sea abdlibrary', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version: 2, format: 'abdbank', bank: {}, patches: [] }));
    const file = await zipToFileLike(zip, 'wrong.abdlibrary');
    const result = await importFile(file);
    expect(result.success).toBe(false);
  });
});

describe('retrocompatibilidad .abdbank monobanco (v2)', () => {
  it('sigue importando un .abdbank v2 como banco único', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 2,
      format: 'abdbank',
      bank: { id: '33333333-3333-3333-3333-333333333333', name: 'Old Bank', modelId: 'yamaha-dx7', manufacturer: 'Yamaha' },
      patches: [{ index: 0, name: 'E.PIANO 1', rawDataFile: 'patches/000.bin' }],
      contract: { modelId: 'yamaha-dx7', patchDataSize: 19, bankCapacity: 32, banksCount: 1, programsPerBank: 32 }
    }));
    zip.file('patches/000.bin', new Uint8Array([0xF0, 0x43, 0x09, 0x01, 0xF7]));

    const file = await zipToFileLike(zip, 'old.abdbank');
    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.banks).toBeUndefined();
    expect(result.bank.modelId).toBe('yamaha-dx7');
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].name).toBe('E.PIANO 1');
  });
});
