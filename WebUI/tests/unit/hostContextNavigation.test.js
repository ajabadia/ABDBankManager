/**
 * Host context (bridge `hostModel` / MIDI connect) → catálogo de navegación.
 *
 * El Bank Manager construye su sidebar, cascade view, tree view y página de
 * fabricante a partir de `groupContractsByManufacturer(getVisibleContracts(ctx))`.
 * Sin contexto debe seguir listando todo el registro (standalone, 22 modelos / 6
 * fabricantes); con el modelId del anfitrión (ABDMS2000 = `abd-sm002`) solo el
 * hardware que ese sintetizador puede gobernar.
 *
 * Regresión cubierta: el catálogo se construía una sola vez desde
 * `MODEL_CONTRACTS`, así que dentro del plugin la sidebar seguía ofreciendo los
 * 6 fabricantes aunque el selector de modelos ya estuviera filtrado.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getVisibleContracts,
  getVisibleModelIds,
  getMidiConnectableModels,
  isHostScopeResolvable,
  groupContractsByManufacturer,
  getAllModels,
  MIDI_ALL_HARDWARE
} from '../../src/core/modelRegistry.js';
import {
  renderModelSelector,
  setContextModelId,
  getContextModelId,
  getHostContextModelId,
  onContextModelChange,
  isForeignMidiHardwareAllowed,
  setForeignMidiHardwareAllowed
} from '../../src/ui/components/modelSelector.js';
import { MODEL_CONTRACTS } from '../../src/contracts/modelContracts.js';

// Sin IndexedDB en el entorno `node`: la búsqueda global solo necesita el catálogo
// de bancos/parches, así que se sustituye la capa de persistencia.
vi.mock('../../src/store/persistence.js', () => ({
  getAllBanks: async () => [],
  getAllPatches: async () => []
}));

const { globalSearch } = await import('../../src/core/searchEngine.js');

const TOTAL = MODEL_CONTRACTS.length;
const ABD_SM002_HARDWARE = ['abd-sm002', 'korg-ms2000', 'korg-microkorg'];

/** Lo que la navegación pinta: fabricante → nº de modelos, y modelos visibles. */
function catalog(contextModelId) {
  const grouped = groupContractsByManufacturer(getVisibleContracts(contextModelId));
  return {
    manufacturers: Object.fromEntries(
      Object.entries(grouped).map(([mfr, contracts]) => [mfr, contracts.length])
    ),
    modelIds: Object.values(grouped).flat().map(c => c.modelId)
  };
}

/** Contenedor mínimo para `renderModelSelector` (no hay jsdom instalado). */
function makeContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

describe('catálogo de navegación filtrado por el contexto del anfitrión', () => {
  it('sin contexto lista el registro completo (standalone intacto)', () => {
    const { manufacturers, modelIds } = catalog(null);

    expect(modelIds).toHaveLength(TOTAL);
    expect(manufacturers).toEqual({
      ABDSynths: 1, Behringer: 4, Casio: 4, Korg: 3, Roland: 8, Yamaha: 2
    });
  });

  it('con el modelId de ABDMS2000 solo trae el hardware compatible', () => {
    const { manufacturers, modelIds } = catalog('abd-sm002');

    expect(manufacturers).toEqual({ ABDSynths: 1, Korg: 2 });
    expect([...modelIds].sort()).toEqual([...ABD_SM002_HARDWARE].sort());
  });

  it('oculta los fabricantes ajenos al anfitrión', () => {
    const { manufacturers } = catalog('abd-sm002');

    for (const mfr of ['Roland', 'Casio', 'Yamaha', 'Behringer']) {
      expect(manufacturers).not.toHaveProperty(mfr);
    }
  });

  it('los contratos conservan los campos que pinta la navegación', () => {
    const contracts = getVisibleContracts('abd-sm002');

    const sm002 = contracts.find(c => c.modelId === 'abd-sm002');
    expect(sm002.displayName).toBe('ABD MS2000 (SM002)');
    expect(sm002.manufacturer).toBe('ABDSynths');
    expect(sm002.bankCapacity).toBeGreaterThan(0);
  });

  it('incluye el hardware compatible en ambos sentidos del contrato', () => {
    // `korg-ms2000` es compatible declarado y `korg-microkorg` también;
    // ambos deben entrar aunque el contexto sea el modelo ABD.
    const { modelIds } = catalog('abd-sm002');
    expect(modelIds).toContain('korg-ms2000');
    expect(modelIds).toContain('korg-microkorg');
  });

  it('un modelId desconocido NO vuelve al catálogo completo (host y catálogo desincronizados)', () => {
    // El anfitrión anunció algo, pero este build no tiene su contrato: no se puede
    // resolver la familia, así que no se ofrece nada (el aviso de "hardware no
    // soportado" lo explica en la UI). El registro completo queda reservado al
    // caso realmente sin contexto (`undefined`/null = standalone).
    expect(getVisibleContracts('no-such-model')).toHaveLength(0);
    expect(getVisibleModelIds('no-such-model')).toHaveLength(0);
    expect(getVisibleContracts(undefined)).toHaveLength(TOTAL);
    expect(getVisibleContracts(null)).toHaveLength(TOTAL);
  });
});

describe('notificación de cambios de contexto de modelo', () => {
  let seen;
  let unsubscribe;
  let container;

  beforeEach(() => {
    container = makeContainer();
    globalThis.document = { contains: () => false };
    setContextModelId(null); // estado limpio antes de suscribir
    seen = [];
    unsubscribe = onContextModelChange(modelId => seen.push(modelId));
  });

  afterEach(() => {
    unsubscribe();
    // Se limpia con el stub todavía presente: `setContextModelId` recorre los
    // contenedores montados (y `contains() === false` los descarta del Map).
    setContextModelId(null);
    delete globalThis.document;
  });

  it('setContextModelId avisa a los suscriptores (lo que repinta la nav)', () => {
    setContextModelId('abd-sm002');
    setContextModelId('korg-microkorg');

    expect(seen).toEqual(['abd-sm002', 'korg-microkorg']);
    expect(getContextModelId()).toBe('korg-microkorg');
  });

  it('es idempotente: repetir el mismo hostModel no vuelve a notificar', () => {
    setContextModelId('abd-sm002');
    setContextModelId('abd-sm002');
    setContextModelId('abd-sm002');

    expect(seen).toEqual(['abd-sm002']);
  });

  it('limpiar el contexto devuelve el catálogo completo', () => {
    setContextModelId('abd-sm002');

    setContextModelId(null);

    expect(seen).toEqual(['abd-sm002', null]);
    expect(getContextModelId()).toBeNull();
    expect(getVisibleContracts(getContextModelId())).toHaveLength(TOTAL);
  });

  it('un contexto explícito en el render (modal New Bank) también notifica', () => {
    renderModelSelector(container, { contextModelId: 'roland-juno106' });

    expect(seen).toEqual(['roland-juno106']);
    expect(getContextModelId()).toBe('roland-juno106');
  });

  it('la desuscripción detiene las notificaciones', () => {
    unsubscribe();
    seen = [];

    setContextModelId('abd-sm002');

    expect(seen).toEqual([]);
  });
});

describe('búsqueda global de modelos filtrada por contexto', () => {
  /** `escHtml` de searchEngine necesita document.createElement (entorno node). */
  function makeDocumentStub() {
    return {
      createElement: () => {
        let text = '';
        const escape = s => String(s).replace(/[&<>"']/g, c => (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
        return {
          set textContent(value) { text = value ?? ''; },
          get innerHTML() { return escape(text); }
        };
      }
    };
  }

  const modelHits = results => results.filter(r => r.type === 'model');

  beforeEach(() => {
    globalThis.document = makeDocumentStub();
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('sin contexto encuentra modelos de cualquier fabricante', async () => {
    const results = await globalSearch('juno', { allowedModelIds: getVisibleModelIds(null) });

    expect(modelHits(results).length).toBeGreaterThan(0);
    expect(modelHits(results).map(r => r.id)).toContain('roland-juno106');
  });

  it('con el contexto de ABDMS2000 descarta los modelos ajenos', async () => {
    const results = await globalSearch('juno', {
      allowedModelIds: getVisibleModelIds('abd-sm002')
    });

    expect(modelHits(results)).toHaveLength(0);
  });

  it('sigue encontrando el hardware compatible del anfitrión', async () => {
    const results = await globalSearch('microkorg', {
      allowedModelIds: getVisibleModelIds('abd-sm002')
    });

    expect(modelHits(results).map(r => r.id)).toEqual(['korg-microkorg']);
  });

  it('sin opciones la búsqueda no filtra nada (retrocompatible)', async () => {
    const results = await globalSearch('juno');

    expect(modelHits(results).map(r => r.id)).toContain('roland-juno60');
  });
});

// ─── Desplegable manual de MIDI (el que elige el contrato SysEx a usar) ───

describe('desplegable manual de MIDI acotado por el contexto', () => {
  const ids = models => models.map(m => m.id);

  beforeEach(() => {
    globalThis.document = { contains: () => false };
    setForeignMidiHardwareAllowed(false);
    setContextModelId(null);
  });

  afterEach(() => {
    setForeignMidiHardwareAllowed(false);
    setContextModelId(null);
    delete globalThis.document;
  });

  it('sin anfitrión (standalone) ofrece el registro completo', () => {
    expect(getMidiConnectableModels(null)).toHaveLength(TOTAL);
    expect(ids(getMidiConnectableModels(undefined))).toContain('roland-juno106');
  });

  it('con el modelId del anfitrión ofrece solo su hardware compatible', () => {
    const models = getMidiConnectableModels('abd-sm002');

    expect([...ids(models)].sort()).toEqual([...ABD_SM002_HARDWARE].sort());
    expect(models.every(m => m.id && m.name)).toBe(true);
  });

  it('un modelId desconocido no deja el desplegable de MIDI vacío (vía de escape)', () => {
    // La navegación sí se bloquea con un anuncio irresoluble, pero el desplegable
    // manual tiene que quedar completo: es el gesto con el que el usuario declara
    // qué hardware maneja de verdad cuando el host no se puede resolver.
    expect(getMidiConnectableModels('no-such-model')).toHaveLength(TOTAL);
  });

  it('isHostScopeResolvable() solo da por acotable un anuncio con contrato', () => {
    expect(isHostScopeResolvable('abd-sm002')).toBe(true);
    expect(isHostScopeResolvable('no-such-model')).toBe(false);
    expect(isHostScopeResolvable(null)).toBe(false);
    expect(isHostScopeResolvable(undefined)).toBe(false);
  });

  it('no recorta el catálogo del standalone cuando el contexto es de sesión (MIDI)', () => {
    // Contexto efectivo = dispositivo conectado, pero sin anuncio del anfitrión:
    // el desplegable sigue completo para poder cambiar de sintetizador.
    setContextModelId('korg-microkorg', 'session');

    expect(getContextModelId()).toBe('korg-microkorg');
    expect(getMidiConnectableModels(getHostContextModelId())).toHaveLength(TOTAL);
  });

  it('la salida de emergencia ensancha el desplegable al registro completo, pero no por defecto', () => {
    // Dentro del plugin el ámbito del anfitrión está activo, así que el registro
    // completo solo aparece cuando el usuario lo pide explícitamente.
    expect(getMidiConnectableModels('abd-sm002')).toHaveLength(3);
    expect(getMidiConnectableModels('abd-sm002', { allowForeign: true })).toHaveLength(TOTAL);
    expect(getMidiConnectableModels('abd-sm002', {})).toHaveLength(3);
  });

  it('el sentinel de "otro hardware" no es un modelId del registro', () => {
    expect(MIDI_ALL_HARDWARE).toBeTruthy();
    expect(getAllModels().map(m => m.id)).not.toContain(MIDI_ALL_HARDWARE);
    expect(getMidiConnectableModels(null).map(m => m.id)).not.toContain(MIDI_ALL_HARDWARE);
  });

  it('con la salida de emergencia activa sigue ofreciendo el hardware del anfitrión', () => {
    const widened = ids(getMidiConnectableModels('abd-sm002', { allowForeign: true }));

    for (const id of ABD_SM002_HARDWARE) expect(widened).toContain(id);
    expect(widened).toContain('roland-juno106');
  });
});

// ─── Salida de emergencia del desplegable de MIDI (estado de sesión) ───

describe('salida de emergencia del desplegable de MIDI', () => {
  beforeEach(() => {
    globalThis.document = { contains: () => false };
    setForeignMidiHardwareAllowed(false);
    setContextModelId(null);
  });

  afterEach(() => {
    setForeignMidiHardwareAllowed(false);
    setContextModelId(null);
    delete globalThis.document;
  });

  it('está apagada por defecto y se activa solo de forma explícita', () => {
    expect(isForeignMidiHardwareAllowed()).toBe(false);

    setForeignMidiHardwareAllowed(true);
    expect(isForeignMidiHardwareAllowed()).toBe(true);

    setForeignMidiHardwareAllowed(false);
    expect(isForeignMidiHardwareAllowed()).toBe(false);
  });

  it('no ensancha la navegación: el catálogo sigue acotado al anfitrión', () => {
    setContextModelId('abd-sm002'); // hostModel
    setForeignMidiHardwareAllowed(true);

    expect(getMidiConnectableModels(getHostContextModelId(), { allowForeign: true })).toHaveLength(TOTAL);
    expect(getVisibleContracts(getHostContextModelId())).toHaveLength(3);
  });

  it('un anuncio distinto del anfitrión la desactiva (no se filtra a otra familia)', () => {
    setContextModelId('abd-sm002');
    setForeignMidiHardwareAllowed(true);

    setContextModelId('roland-juno106'); // nuevo hostModel

    const junoFamily = getVisibleContracts('roland-juno106');
    expect(junoFamily.length).toBeGreaterThan(0);
    expect(junoFamily.length).toBeLessThan(TOTAL); // no hereda el registro completo
    expect(isForeignMidiHardwareAllowed()).toBe(false);
    expect(getMidiConnectableModels(getHostContextModelId())).toHaveLength(junoFamily.length);
    // Y puede volver a pedirse para el nuevo anfitrión.
    expect(getMidiConnectableModels(getHostContextModelId(), { allowForeign: true })).toHaveLength(TOTAL);
  });

  it('un anuncio repetido del mismo anfitrión no la desactiva (hostModel idempotente)', () => {
    setContextModelId('abd-sm002');
    setForeignMidiHardwareAllowed(true);

    setContextModelId('abd-sm002');

    expect(isForeignMidiHardwareAllowed()).toBe(true);
  });

  it('conectarse por MIDI no la activa ni la desactiva', () => {
    setContextModelId('abd-sm002');

    setContextModelId('korg-microkorg', 'session');
    expect(isForeignMidiHardwareAllowed()).toBe(false);

    setForeignMidiHardwareAllowed(true);
    setContextModelId('roland-juno106', 'session');
    expect(isForeignMidiHardwareAllowed()).toBe(true);
  });
});

describe('contexto del anfitrión (host) frente al de sesión (MIDI)', () => {
  beforeEach(() => {
    globalThis.document = { contains: () => false };
    setContextModelId(null);
  });

  afterEach(() => {
    setContextModelId(null);
    delete globalThis.document;
  });

  it('sin hostModel no hay ámbito de anfitrión', () => {
    expect(getHostContextModelId()).toBeNull();
  });

  it('el anuncio del anfitrión fija el ámbito', () => {
    setContextModelId('abd-sm002'); // hostModel por bridge

    expect(getHostContextModelId()).toBe('abd-sm002');
    expect(getMidiConnectableModels(getHostContextModelId())).toHaveLength(3);
  });

  it('conectar por MIDI no borra ni ensancha el ámbito del anfitrión', () => {
    setContextModelId('abd-sm002');

    setContextModelId('korg-microkorg', 'session');

    expect(getContextModelId()).toBe('korg-microkorg');
    expect(getHostContextModelId()).toBe('abd-sm002');
    expect(getMidiConnectableModels(getHostContextModelId())).toHaveLength(3);
  });

  it('un contexto explícito en el render (modal New Bank) no reclama el ámbito', () => {
    renderModelSelector(makeContainer(), { contextModelId: 'roland-juno106' });

    expect(getContextModelId()).toBe('roland-juno106');
    expect(getHostContextModelId()).toBeNull();
  });

  it('limpiar el contexto (setContextModelId(null)) libera el ámbito', () => {
    setContextModelId('abd-sm002');

    setContextModelId(null);

    expect(getHostContextModelId()).toBeNull();
    expect(getMidiConnectableModels(getHostContextModelId())).toHaveLength(TOTAL);
  });
});
