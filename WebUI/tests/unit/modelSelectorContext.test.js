/**
 * Integration test: setContextModelId() filt-ra los modelos que pinta el selector.
 *
 * El test corre en el entorno `node` con un DOM mínimo (no hay jsdom instalado):
 * `renderModelSelector` solo necesita `innerHTML` (escritura), `querySelector('#model-search')`
 * y `querySelectorAll('.model-selector__model')`; `setContextModelId` usa `document.contains`.
 * Así se ejercita el camino real del componente (Map de contenedores montados incluido)
 * sin tocar el DOM del navegador.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderModelSelector,
  setContextModelId,
  setSelectedModelId
} from '../../src/ui/components/modelSelector.js';
import { MODEL_CONTRACTS } from '../../src/contracts/modelContracts.js';

const TOTAL = MODEL_CONTRACTS.length;

function makeContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

/** modelIds realmente presentes en el HTML renderizado, en orden de aparición. */
function renderedIds(container) {
  return [...container.innerHTML.matchAll(/data-model-id="([^"]+)"/g)].map(m => m[1]);
}

/** Contenedores que el fake `document.contains` considera montados. */
const mounted = new Set();

beforeEach(() => {
  mounted.clear();
  globalThis.document = { contains: el => mounted.has(el) };
  setSelectedModelId(null);
});

afterEach(() => {
  delete globalThis.document;
});

describe('setContextModelId → render del selector (integración)', () => {
  it('pinta todos los modelos cuando no hay contexto', () => {
    const container = makeContainer();
    mounted.add(container);

    renderModelSelector(container, { contextModelId: null });

    expect(renderedIds(container)).toHaveLength(TOTAL);
    expect(renderedIds(container)).toContain('roland-juno106');
    expect(renderedIds(container)).toContain('abd-sm002');
  });

  it('filtra un selector ya montado al hardware compatible del contexto', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });
    expect(renderedIds(container)).toHaveLength(TOTAL);

    setContextModelId('abd-sm002');

    const ids = renderedIds(container);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['abd-sm002', 'korg-ms2000', 'korg-microkorg']));
    expect(container.innerHTML).not.toContain('data-model-id="roland-juno106"');
    expect(container.innerHTML).not.toContain('data-model-id="casio-cz101"');
  });

  it('no anida selectores al re-renderizar varias veces', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });

    setContextModelId('abd-sm002');
    setContextModelId('korg-microkorg');
    setContextModelId('roland-juno106');

    // Un único `<div class="model-selector">` por contenedor, no uno por re-render.
    const wrappers = container.innerHTML.match(/class="model-selector"/g) || [];
    expect(wrappers).toHaveLength(1);
    expect(renderedIds(container)).toHaveLength(4);
  });

  it('restaura la lista completa al limpiar el contexto (standalone)', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: 'abd-sm002' });
    expect(renderedIds(container)).toHaveLength(3);

    setContextModelId(null);

    expect(renderedIds(container)).toHaveLength(TOTAL);
    expect(renderedIds(container)).toContain('roland-juno106');
  });

  it('respeta el contextModelId pasado directamente a renderModelSelector', () => {
    const container = makeContainer();
    mounted.add(container);

    renderModelSelector(container, { contextModelId: 'roland-juno106' });

    const ids = renderedIds(container);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(
      expect.arrayContaining(['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'])
    );
    expect(container.innerHTML).not.toContain('data-model-id="abd-sm002"');
  });

  it('usa el thumbnail del contrato (no el placeholder) en cada entrada', () => {
    const container = makeContainer();
    mounted.add(container);

    renderModelSelector(container, { contextModelId: 'abd-sm002' });

    expect(container.innerHTML).toContain('src="/images/thumbs/korg-microkorg.webp"');
  });

  it('ignora los contenedores que ya no están montados', () => {
    const stale = makeContainer();
    mounted.add(stale);
    renderModelSelector(stale, { contextModelId: null });
    const staleBefore = stale.innerHTML;

    mounted.delete(stale); // el modal se cerró / el nodo salió del DOM

    const live = makeContainer();
    mounted.add(live);
    renderModelSelector(live, { contextModelId: null });

    setContextModelId('roland-juno106');

    expect(stale.innerHTML).toBe(staleBefore);          // sin re-render
    expect(renderedIds(stale)).toHaveLength(TOTAL);      // sigue mostrando todo
    expect(renderedIds(live)).toHaveLength(4);           // filtrado
  });
});
