/**
 * Host context vía bridge (Juce → JS).
 *
 * El anfitrión anuncia su `modelId` con `{ action: 'hostModel', data: { modelId } }`
 * y el selector montado debe quedar filtrado al hardware compatible, igual que
 * cuando el contexto llega por MIDI connect.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initHostContext,
  readHostModelId,
  HOST_MODEL_ACTION
} from '../../src/core/hostContext.js';
import {
  renderModelSelector,
  setContextModelId,
  getContextModelId,
  getHostContextModelId
} from '../../src/ui/components/modelSelector.js';
import { MODEL_CONTRACTS } from '../../src/contracts/modelContracts.js';

const TOTAL = MODEL_CONTRACTS.length;

let bridge;
let unsubscribe = null;

/** Contenedores que el fake `document.contains` considera montados. */
const mounted = new Set();

function makeContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function renderedIds(container) {
  return [...container.innerHTML.matchAll(/data-model-id="([^"]+)"/g)].map(m => m[1]);
}

describe('readHostModelId (payload del host)', () => {
  it('expone la acción de bridge esperada', () => {
    expect(HOST_MODEL_ACTION).toBe('hostModel');
  });

  it('acepta payload anidado, plano y string; rechaza el resto', () => {
    expect(readHostModelId({ modelId: 'abd-sm002' })).toBe('abd-sm002');
    expect(readHostModelId('roland-juno106')).toBe('roland-juno106');
    expect(readHostModelId({})).toBeNull();
    expect(readHostModelId(null)).toBeNull();
    expect(readHostModelId('')).toBeNull();
    expect(readHostModelId({ modelId: 42 })).toBeNull();
  });
});

describe('hostModel por bridge → setContextModelId', () => {
  beforeEach(async () => {
    // El BridgeManager accede a `window` al construirse (singleton del módulo).
    globalThis.window = {};
    globalThis.document = { contains: el => mounted.has(el) };
    mounted.clear();
    setContextModelId(null);
    ({ bridge } = await import('../../src/bridge/bridgeManager.js'));
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    delete globalThis.window;
    delete globalThis.document;
  });

  it('filtra el selector con el modelId del host (payload anidado, estilo Juce)', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });
    expect(renderedIds(container)).toHaveLength(TOTAL);

    unsubscribe = initHostContext(bridge);
    bridge._handleMessage({ action: 'hostModel', schemaVersion: 1, data: { modelId: 'abd-sm002' } });

    const ids = renderedIds(container);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['abd-sm002', 'korg-ms2000', 'korg-microkorg']));
    expect(container.innerHTML).not.toContain('data-model-id="roland-juno106"');
  });

  it('marca el contexto como del anfitrión (lo que acota el desplegable de MIDI)', () => {
    expect(getHostContextModelId()).toBeNull();

    unsubscribe = initHostContext(bridge);
    bridge._handleMessage({ action: 'hostModel', data: { modelId: 'korg-microkorg' } });

    // `abd-sm002` no lo anunció el host aquí: el ámbito es el que llegó por bridge.
    expect(getContextModelId()).toBe('korg-microkorg');
    expect(getHostContextModelId()).toBe('korg-microkorg');
  });

  it('una conexión MIDI posterior no sustituye el ámbito del anfitrión', () => {
    unsubscribe = initHostContext(bridge);
    bridge._handleMessage({ action: 'hostModel', data: { modelId: 'abd-sm002' } });

    setContextModelId('roland-juno106', 'session');

    expect(getContextModelId()).toBe('roland-juno106');
    expect(getHostContextModelId()).toBe('abd-sm002');
  });

  it('acepta también el payload plano ({ action, modelId })', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });

    unsubscribe = initHostContext(bridge);
    bridge._handleMessage({ action: 'hostModel', modelId: 'roland-juno106' });

    const ids = renderedIds(container);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(
      expect.arrayContaining(['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'])
    );
  });

  it('ignora mensajes sin modelId y conserva el modo standalone', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: null });

    unsubscribe = initHostContext(bridge);
    bridge._handleMessage({ action: 'hostModel', data: {} });
    bridge._handleMessage({ action: 'hostModel', data: { modelId: '' } });

    expect(renderedIds(container)).toHaveLength(TOTAL);
  });

  it('deja de aplicar contexto después de desuscribirse', () => {
    const container = makeContainer();
    mounted.add(container);
    renderModelSelector(container, { contextModelId: 'abd-sm002' });
    expect(renderedIds(container)).toHaveLength(3);

    const off = initHostContext(bridge);
    off();

    bridge._handleMessage({ action: 'hostModel', data: { modelId: 'roland-juno106' } });

    expect(renderedIds(container)).toHaveLength(3); // sigue el contexto anterior
  });
});
