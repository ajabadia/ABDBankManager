/**
 * Guardas del generador de `contractRegistry.gen.js`.
 *
 * `modelMetadata` está indexado por modelId; si no incluye el propio `modelId`
 * (ni el `thumbnail`), la UI que lo consume pinta `data-model-id="undefined"`
 * y thumbnails placeholder. Estas aserciones evitan que el generador vuelva a
 * omitirlos.
 */

import { describe, it, expect } from 'vitest';
import {
  contractRegistryData,
  MODEL_CONTRACTS,
  getModelContract
} from '../../src/contracts/modelContracts.js';

const { modelMetadata, registeredModelIds } = contractRegistryData;

describe('contractRegistryData.modelMetadata (generador)', () => {
  it('cubre exactamente los contratos registrados', () => {
    expect(registeredModelIds).toHaveLength(MODEL_CONTRACTS.length);
    expect(Object.keys(modelMetadata)).toHaveLength(MODEL_CONTRACTS.length);
    for (const id of registeredModelIds) {
      expect(modelMetadata[id]).toBeDefined();
    }
  });

  it('incluye modelId dentro de cada entrada, no solo como clave', () => {
    const mismatched = registeredModelIds.filter(id => modelMetadata[id].modelId !== id);
    expect(mismatched).toEqual([]);
  });

  it('incluye thumbnail para todos los modelos', () => {
    const missing = registeredModelIds.filter(id => !modelMetadata[id].thumbnail);
    expect(missing).toEqual([]);
  });

  it('mantiene compatibleModels alineado con el contrato canónico', () => {
    for (const id of registeredModelIds) {
      expect(modelMetadata[id].compatibleModels).toEqual(getModelContract(id).compatibleModels || []);
    }
  });
});
