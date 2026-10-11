/**
 * Ámbito embebido: dentro de un sintetizador anfitrión el Bank Manager no puede
 * ofrecer el registro completo mientras no sepa qué hardware gobierna.
 *
 * Regla (`isCatalogBlocked`): embebido **y** sin contexto de hardware → catálogo
 * bloqueado. El standalone se queda como estaba (listar los 22 modelos es el
 * producto). El contexto lo aporta el anfitrión (`hostModel`) o una conexión
 * MIDI, y es lo que desbloquea el selector y la navegación.
 *
 * Tercer caso (`isUnknownContext`): el anfitrión respondió con un modelId que
 * este build no conoce (host y catálogo de contratos desincronizados). Tampoco
 * se cae al registro completo: se sigue bloqueado, con un aviso distinto, y la
 * única salida es declarar hardware por MIDI.
 *
 * Entorno `node` con el mismo DOM mínimo que `modelSelectorContext.test.js`
 * (no hay jsdom instalado): `renderModelSelector` solo necesita escribir
 * `innerHTML` y el `document.contains` de los contenedores montados.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderModelSelector,
  setContextModelId,
  setSelectedModelId,
  setEmbeddedHost,
  isEmbeddedHost,
  isCatalogBlocked,
  isUnknownContext
} from '../../src/ui/components/modelSelector.js';
import {
  getAllModels,
  getMidiConnectableModels,
  getVisibleContracts,
  isHostScopeResolvable
} from '../../src/core/modelRegistry.js';
import { MODEL_CONTRACTS } from '../../src/contracts/modelContracts.js';

const TOTAL = MODEL_CONTRACTS.length;
const ABD_SM002_HARDWARE = ['abd-sm002', 'korg-ms2000', 'korg-microkorg'];

function makeContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

/** modelIds realmente presentes en el HTML renderizado. */
function renderedIds(container) {
  return [...container.innerHTML.matchAll(/data-model-id="([^"]+)"/g)].map(m => m[1]);
}

const mounted = new Set();

beforeEach(() => {
  mounted.clear();
  globalThis.document = { contains: el => mounted.has(el) };
  setSelectedModelId(null);
  // Estado limpio entre tests: standalone y sin contexto.
  setContextModelId(null, 'host');
  setEmbeddedHost(false);
});

afterEach(() => {
  setEmbeddedHost(false);
  setContextModelId(null, 'host');
  delete globalThis.document;
});

describe('isCatalogBlocked() — la regla', () => {
  it('standalone sin contexto: nunca bloquea (el registro completo es el producto)', () => {
    expect(isEmbeddedHost()).toBe(false);
    expect(isCatalogBlocked()).toBe(false);
  });

  it('embebido sin contexto: bloquea', () => {
    setEmbeddedHost(true);
    expect(isCatalogBlocked()).toBe(true);
  });

  it('embebido con el modelo del anfitrión (hostModel): no bloquea', () => {
    setEmbeddedHost(true);
    setContextModelId('abd-sm002');
    expect(isCatalogBlocked()).toBe(false);
  });

  it('una conexión MIDI también resuelve el bloqueo (elección del usuario)', () => {
    setEmbeddedHost(true);
    expect(isCatalogBlocked()).toBe(true);

    setContextModelId('korg-microkorg', 'session');

    expect(isCatalogBlocked()).toBe(false);
  });

  it('volver a standalone desbloquea (el modo manda, no el contexto)', () => {
    setEmbeddedHost(true);
    expect(isCatalogBlocked()).toBe(true);

    setEmbeddedHost(false);

    expect(isCatalogBlocked()).toBe(false);
  });
});

describe('renderModelSelector() — catálogo embebido', () => {
  it('standalone sin contexto: sigue pintando los 22 modelos (sin regresión)', () => {
    const container = makeContainer();
    mounted.add(container);

    renderModelSelector(container, { contextModelId: null });

    expect(renderedIds(container)).toHaveLength(TOTAL);
    expect(renderedIds(container)).toContain('roland-juno106');
  });

  it('embebido sin contexto: no ofrece ningún modelo y explica por qué', () => {
    const container = makeContainer();
    mounted.add(container);
    setEmbeddedHost(true);

    renderModelSelector(container, { contextModelId: null });

    expect(renderedIds(container)).toHaveLength(0);
    expect(container.innerHTML).toContain('model-selector__blocked');
    expect(container.innerHTML).toContain('connect your MIDI hardware');
    // Ni siquiera el fabricante del anfitrión se ofrece todavía.
    expect(container.innerHTML).not.toContain('ABDSynths');
  });

  it('embebido: el anuncio del anfitrión repinta el selector ya montado', () => {
    const container = makeContainer();
    mounted.add(container);
    setEmbeddedHost(true);
    renderModelSelector(container, { contextModelId: null });
    expect(renderedIds(container)).toHaveLength(0);

    setContextModelId('abd-sm002');

    expect(renderedIds(container)).toEqual(expect.arrayContaining(ABD_SM002_HARDWARE));
    expect(renderedIds(container)).toHaveLength(ABD_SM002_HARDWARE.length);
    expect(container.innerHTML).not.toContain('model-selector__blocked');
  });

  it('embebido: el desplegable manual de MIDI sigue completo (vía de escape)', () => {
    setEmbeddedHost(true);

    // Sin contexto de anfitrión, el selector de MIDI ofrece todo el registro:
    // es el gesto con el que el usuario declara qué hardware va a manejar.
    expect(getMidiConnectableModels(null)).toHaveLength(TOTAL);
    expect(getMidiConnectableModels(null)).toEqual(getAllModels());
  });
});

describe('un modelId anunciado desconocido — ni catálogo completo ni callejón sin salida', () => {
  const UNKNOWN = 'synth-de-otra-version';

  it('isUnknownContext() distingue "no hay contexto" de "no lo conocemos"', () => {
    setEmbeddedHost(true);
    expect(isUnknownContext()).toBe(false);

    setContextModelId(UNKNOWN); // hostModel

    expect(isUnknownContext()).toBe(true);
    expect(isCatalogBlocked()).toBe(true);
  });

  it('no cae al registro completo: el catálogo queda vacío', () => {
    setEmbeddedHost(true);
    setContextModelId(UNKNOWN);

    expect(getVisibleContracts(UNKNOWN)).toHaveLength(0);
    expect(isCatalogBlocked()).toBe(true);
  });

  it('el selector no ofrece ningún modelo y lo dice de forma específica', () => {
    const container = makeContainer();
    mounted.add(container);
    setEmbeddedHost(true);
    setContextModelId(UNKNOWN);

    renderModelSelector(container, { contextModelId: UNKNOWN });

    expect(renderedIds(container)).toHaveLength(0);
    expect(container.innerHTML).toContain('does not know');
    expect(container.innerHTML).not.toContain('No hardware selected yet');
  });

  it('la vía de escape sigue abierta: el desplegable de MIDI ofrece todo', () => {
    setEmbeddedHost(true);
    setContextModelId(UNKNOWN);

    expect(isHostScopeResolvable(UNKNOWN)).toBe(false);
    expect(getMidiConnectableModels(UNKNOWN)).toEqual(getAllModels());
  });

  it('declarar hardware por MIDI desbloquea el catálogo (contexto resoluble)', () => {
    const container = makeContainer();
    mounted.add(container);
    setEmbeddedHost(true);
    setContextModelId(UNKNOWN);
    renderModelSelector(container, { contextModelId: UNKNOWN });
    expect(renderedIds(container)).toHaveLength(0);

    setContextModelId('korg-microkorg', 'session');

    expect(isUnknownContext()).toBe(false);
    expect(isCatalogBlocked()).toBe(false);
    expect(renderedIds(container)).toEqual(expect.arrayContaining(ABD_SM002_HARDWARE));
  });

  it('standalone con un contexto de sesión desconocido tampoco inventa un catálogo', () => {
    // No debería ocurrir (el desplegable solo ofrece ids del registro), pero la
    // regla no depende del modo: un id irresoluble nunca abre el registro entero.
    setEmbeddedHost(false);
    setContextModelId(UNKNOWN, 'session');

    expect(isCatalogBlocked()).toBe(true);
    expect(getVisibleContracts(UNKNOWN)).toHaveLength(0);
  });
});
