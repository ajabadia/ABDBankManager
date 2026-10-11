/**
 * Guardia de clase: **los adapters construyen sus volcados a través de su contrato**.
 *
 * Regresión que lo motivó (`korgMs2000Adapter.ts` → `buildBankDump`):
 *
 *   const { buildPatchSysEx } = contract ?? {};
 *   patches.map((p, i) => buildPatchSysEx(p.rawData, i, channel));
 *
 * `buildPatchSysEx` lee `this.modelId`, así que invocarlo suelto lanzaba
 * `Cannot read properties of undefined (reading 'modelId')`: enviar un banco entero
 * moría en tiempo de ejecución y ningún test lo veía, porque cada test del adapter
 * llamaba a los constructores que sí funcionaban.
 *
 * Este test recorre **todos** los HardwareLink y ExportAdapter del bundle y llama a sus
 * constructores de volcados con datos del tamaño que declara cada contrato
 * (`patchDataSize`). Un método de contrato desestructurado (o cualquier otro `this`
 * perdido, cambio de firma, etc.) revienta aquí para el modelo que sea, no solo para Korg.
 */

import { describe, it, expect } from 'vitest';
import { createStandaloneRegistry } from '@contracts';
import { encodeAiraState } from '@contracts/Adapters/rolandAiraAdapter';

const registry = createStandaloneRegistry();

/**
 * Los AIRA no guardan un patch de bytes: su rawData es un estado estructurado
 * (véase el layout canónico en rolandAiraAdapter.ts), así que un relleno cualquiera
 * decodifica a `null` y el adapter devuelve cero mensajes — correctamente. Se le da un
 * estado válido para poder ejercitar su camino de escritura.
 */
function airaRawData(modelId) {
  return encodeAiraState({
    modelId,
    mainParams: Array.from({ length: 10 }, (_, i) => i),
    slotTypes: [0, 0, 0, 0, 0, 0],
    slotParams: Array.from({ length: 6 }, () => [0, 0, 0, 0]),
    cables: [],
    conditions: new Uint8Array(22 * 6),
  });
}

/** Patch de relleno con el tamaño (y el formato) que declara el contrato. */
function patchFor(contract, modelId) {
  const rawData = modelId.startsWith('roland-aira-')
    ? airaRawData(modelId)
    : (() => {
        const bytes = new Uint8Array(contract.patchDataSize);
        for (let i = 0; i < bytes.length; i++) bytes[i] = (0x11 + i) & 0xff;
        return bytes;
      })();

  return {
    name: 'Fill',
    category: contract.defaultCategory ?? 'Other',
    author: 'Test',
    tags: [],
    notes: '',
    originAddress: contract.getProgramAddress ? contract.getProgramAddress(0) : '1',
    rawData,
    hardwareIds: [modelId],
    parameters: {},
    isFavorite: false,
    creationDate: new Date(0).toISOString(),
  };
}

function isSysEx(bytes) {
  return (
    bytes instanceof Uint8Array &&
    bytes.length >= 5 &&
    bytes[0] === 0xf0 &&
    bytes[bytes.length - 1] === 0xf7
  );
}

describe('HardwareLink — cada adapter construye sus volcados por su contrato', () => {
  const links = registry.getHardwareLinks();

  it('el bundle expone un hardware link por modelo de hardware', () => {
    expect(links).toHaveLength(7);
    // Cada link apunta a un contrato registrado: sin él no hay de dónde construir.
    for (const link of links) expect(registry.getModel(link.modelId)).toBeDefined();
  });

  for (const link of links) {
    const contract = registry.getModel(link.modelId);
    const patchForThis = () => patchFor(contract, link.modelId);

    describe(`${link.modelId} (${link.constructor.name})`, () => {
      it('buildPatchDump emite al menos una trama SysEx bien formada', () => {
        const frames = link.buildPatchDump(patchForThis(), 0, 1);

        expect(Array.isArray(frames)).toBe(true);
        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) expect(isSysEx(frame)).toBe(true);
      });

      it('buildBankDump emite tramas bien formadas (una por plaza o un bloque)', () => {
        const patches = [0, 1, 2, 3].map(patchForThis);
        const frames = link.buildBankDump(patches, 1);

        expect(Array.isArray(frames)).toBe(true);
        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) expect(isSysEx(frame)).toBe(true);
        // Un volcado de banco nunca puede ser más corto que el de una sola voz.
        expect(frames.length).toBeGreaterThanOrEqual(link.buildPatchDump(patchForThis(), 0, 1).length);
      });

      it('buildDumpRequest funciona por plaza y para la memoria completa', () => {
        expect(isSysEx(link.buildDumpRequest(0, 1))).toBe(true);
        expect(isSysEx(link.buildDumpRequest('all', 1))).toBe(true);
      });

      it('si la trama lleva el canal, el 16 no se colapsa en el 1', () => {
        const frame1 = link.buildPatchDump(patchForThis(), 0, 1)[0];
        const frame2 = link.buildPatchDump(patchForThis(), 0, 2)[0];
        const frame16 = link.buildPatchDump(patchForThis(), 0, 16)[0];

        // Se compara la trama entera y no un byte concreto: la posición del canal depende
        // de la marca (Korg `3n` en [2], Roland Juno en [3], Casio en [6]…). Y no todos los
        // protocolos direccionan por canal (los Behringer no lo llevan en la trama), así que
        // solo se exige cuando el canal 2 cambia algo respecto al 1.
        const carriesChannel = frame1.some((byte, i) => byte !== frame2[i]);
        if (carriesChannel) expect(Array.from(frame16)).not.toEqual(Array.from(frame1));
      });

      if (link.supportsEditBuffer) {
        it('buildEditBufferDump (edit buffer) también delega en el contrato', () => {
          const frames = link.buildEditBufferDump(patchForThis(), 1);

          expect(Array.isArray(frames)).toBe(true);
          expect(frames.length).toBeGreaterThan(0);
          for (const frame of frames) expect(isSysEx(frame)).toBe(true);
        });
      }
    });
  }
});

describe('ExportAdapter — serializa a través de su contrato', () => {
  const adapters = registry.getExportAdapters();

  it('el bundle expone un export adapter por familia', () => {
    expect(adapters).toHaveLength(7);
  });

  for (const adapter of adapters) {
    it(`${adapter.adapterId} serializa un banco sin tocar métodos sueltos del contrato`, () => {
      const modelId = adapter.targetModelIds[0];
      const contract = registry.getModel(modelId);
      expect(contract).toBeDefined();

      const patches = [0, 1, 2].map(() => patchFor(contract, modelId));
      const out = adapter.serialize(patches, 'Test Bank');

      expect(out).toBeInstanceOf(Uint8Array);
      expect(out.length).toBeGreaterThan(0);
      expect(out[0]).toBe(0xf0);
      expect(out[out.length - 1]).toBe(0xf7);
    });
  }
});
