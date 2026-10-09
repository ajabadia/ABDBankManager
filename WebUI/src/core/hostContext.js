/**
 * ABD Bank Manager — Host Context (bridge)
 *
 * Canal por el que el sintetizador anfitrión (JUCE / C++ / WASM) publica su
 * propio `modelId` a través del bridge. Con él, el selector de modelos se
 * filtra al hardware compatible del host en lugar de mostrar los 22 modelos.
 *
 * Es el segundo camino hacia `setContextModelId`, además de la conexión MIDI
 * (ver HANDOFF_MODEL_REGISTRY_FILTER.md §5.5). Sin mensaje del host, el
 * comportamiento standalone (todos los modelos) queda intacto.
 *
 * Además del anuncio (`hostModel`), aquí vive la **ficha del host**:
 * `requestHostInfo` → `hostInfo`, con identidad + sello de build + nivel de
 * puente. Sirve para lo que el anuncio solo no puede dar:
 *  - el catálogo embebido bloqueado deja de adivinar: se distingue «el host
 *    respondió pero su build no anuncia» de «el host no respondió nada», y
 *  - cuando el modelId anunciado no está en el catálogo, el aviso puede nombrar
 *    el build del host en vez de insinuar una desincronización.
 *
 * El sello viaja en los dos mensajes, así que el anuncio ya lo deja disponible.
 */

import { setContextModelId } from '../ui/components/modelSelector.js';

/** Acción del bridge con la que el host anuncia su `modelId`. */
export const HOST_MODEL_ACTION = 'hostModel';

/** Ficha del host: identidad + sello de build (ver HostModelId.gen.h). */
export const HOST_INFO_ACTION = 'hostInfo';

/** Acción con la que el Bank Manager pide esa ficha. */
export const HOST_INFO_REQUEST_ACTION = 'requestHostInfo';

/** Mensajes del host que prueban que el canal nativo → JS está vivo. */
const CHANNEL_ALIVE_ACTIONS = ['state', 'syncAllParams', 'programData', 'paramChange'];

/** Última ficha conocida del host (`null` mientras no llegue ninguna). */
let hostInfo = null;

/**
 * ¿El host ha dado señales de vida por el bridge? Un host que responde `state` o
 * `syncAllParams` pero nunca se identifica es un build anterior al anuncio; uno
 * que no responde nada de nada es anterior incluso al canal nativo → JS. Es la
 * diferencia entre «recompila» y «recompila y reinicia», con evidencia.
 */
let hostAnswered = false;

/** Suscriptores de cambios de ficha (para repintar sin recargar). */
const infoListeners = new Set();

/**
 * Normaliza el payload del bridge a un modelId.
 * Se aceptan las dos formas usadas por los hosts:
 *   { action: 'hostModel', data: { modelId } }  → payload anidado
 *   { action: 'hostModel', modelId }            → payload plano
 * @param {unknown} payload
 * @returns {string|null}
 */
export function readHostModelId(payload) {
  if (typeof payload === 'string') return payload || null;
  const modelId = payload && typeof payload === 'object' ? payload.modelId : null;
  return typeof modelId === 'string' && modelId ? modelId : null;
}

/** Última ficha del host (`null` si no ha respondido `requestHostInfo`). */
export function getHostInfo() {
  return hostInfo;
}

/** ¿El host ha respondido algo por el bridge? */
export function wasHostAnswered() {
  return hostAnswered;
}

/** Aviso de ficha nueva (devuelve la función para desuscribirse). */
export function onHostInfoChange(listener) {
  infoListeners.add(listener);
  return () => infoListeners.delete(listener);
}

/** Pide la ficha del host (identidad + sello de build). */
export function requestHostInfo(bridge) {
  bridge.send(HOST_INFO_REQUEST_ACTION, {});
}

/** Solo para tests: vuelve al estado inicial del módulo. */
export function resetHostContextForTests() {
  hostInfo = null;
  hostAnswered = false;
  infoListeners.clear();
}

/**
 * Normaliza la ficha del host. El C++ emite `buildRevision` (revisión del código
 * que generó el header); se acepta `buildId` como alias por si un host nuevo usa
 * ese nombre.
 */
export function normalizeHostInfo(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const hasProtocol = payload.protocol !== undefined && payload.protocol !== null
    && Number.isFinite(Number(payload.protocol));

  const revision = typeof payload.buildRevision === 'string' ? payload.buildRevision
    : (typeof payload.buildId === 'string' ? payload.buildId : null);

  const info = {
    modelId: readHostModelId(payload),
    displayName: typeof payload.displayName === 'string' ? payload.displayName : null,
    manufacturer: typeof payload.manufacturer === 'string' ? payload.manufacturer : null,
    protocol: hasProtocol ? Number(payload.protocol) : null,
    buildStamp: typeof payload.buildStamp === 'string' ? payload.buildStamp : null,
    buildRevision: revision
  };

  const usable = Boolean(info.modelId || info.buildStamp || info.protocol !== null);
  return usable ? info : null;
}

/**
 * Suscribe el contexto del selector a los mensajes del host.
 * @param {{ on: (action: string, callback: (payload: unknown) => void) => (() => void) }} bridge
 * @param {(modelId: string|null) => void} [setContext] inyectable en tests
 * @param {(info: object) => void} [onInfo] aviso de ficha nueva (repintado)
 * @returns {() => void} función para desuscribirse
 */
export function initHostContext(bridge, setContext = setContextModelId, onInfo = null) {
  const publish = () => {
    onInfo?.(hostInfo);
    for (const listener of infoListeners) {
      try { listener(hostInfo); } catch (e) { console.error('[HostContext] info listener failed:', e); }
    }
  };

  // El anuncio también trae el sello: adoptarlo aquí evita perderlo cuando el host
  // no responde a `requestHostInfo` (o cuando el Bank Manager es más antiguo).
  const adopt = (payload) => {
    const info = normalizeHostInfo(payload);
    if (info) hostInfo = info;
    return info;
  };

  const unsubscribeModel = bridge.on(HOST_MODEL_ACTION, (payload) => {
    const modelId = adopt(payload)?.modelId ?? readHostModelId(payload);
    if (!modelId) return; // ignorar mensajes vacíos o malformados
    hostAnswered = true;
    setContext(modelId);
    publish();
  });

  const unsubscribeInfo = bridge.on(HOST_INFO_ACTION, (payload) => {
    hostAnswered = true;
    const adopted = adopt(payload);

    // Un host que responde su ficha puede llegar sin el anuncio entregado: su
    // identidad sigue siendo válida y acota el catálogo igual. Un payload
    // inservible (`adopted === null`) no toca el contexto.
    if (adopted?.modelId) setContext(adopted.modelId);

    publish();
  });

  const aliveSubscriptions = CHANNEL_ALIVE_ACTIONS.map(action =>
    bridge.on(action, () => { hostAnswered = true; })
  );

  return () => {
    unsubscribeModel();
    unsubscribeInfo();
    aliveSubscriptions.forEach(unsubscribe => unsubscribe());
  };
}
