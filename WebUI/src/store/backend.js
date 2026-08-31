/**
 * ABD Bank Manager — Storage backend factory (P2.2 WebUI↔Tauri bridge)
 *
 * Devuelve un objeto Dexie-compatible con el subconjunto de API que usan
 * `persistence.js` y `libraryAdapter.js`:
 *   - En navegador (o tests): la instancia Dexie real registrada vía `setDexieDb`.
 *   - En la WebUI embebida en Tauri: una facade que persiste banks+patches en
 *     SQLite a través de `load_library`/`save_library` (ids preservados).
 *
 * Tablas auxiliares (tags M:N, history) se mantienen en memoria de sesión en
 * Tauri; son datos no críticos y no se persisten aún en SQLite.
 */

// Detecta un runtime Tauri v2 (WebView). API interna estable del framework.
export const isTauri = () =>
  typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__ &&
  typeof window.__TAURI_INTERNALS__.invoke === 'function';

export function tauriInvoke(cmd, args = {}) {
  if (!isTauri()) {
    throw new Error(`invoke('${cmd}') solo disponible dentro de Tauri`);
  }
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

// IndexedDB almacena `isFavorite` en ocasiones como 0/1 y en otras como
// booleano; las consultas usan `.equals(1)`. Normalizamos para que ambas
// representaciones coincidan.
function valuesMatch(a, q) {
  if (a === q) return true;
  if (q === 1) return a === true;
  if (q === 0) return a === false || a == null;
  return false;
}

// ─── Query helpers (subconjunto Dexie) ──────────────────────────────────────

class Collection {
  constructor(table, field, value) {
    this.table = table;
    this.field = field;
    this.value = value;
    this.reversed = false;
  }

  reverse() {
    const copy = new Collection(this.table, this.field, this.value);
    copy.reversed = true;
    return copy;
  }

  test(row) {
    if (this.field.length > 2 && this.field[0] === '[' && this.field[this.field.length - 1] === ']') {
      const parts = this.field.slice(1, -1).split('+');
      const val = this.value || [];
      return parts.every((part, i) => valuesMatch(row[part], val[i]));
    }
    return valuesMatch(row[this.field], this.value);
  }

  async filtered() {
    await this.table.facade._ensureLoaded();
    return this.table.facade.rows(this.table.key).filter(r => this.test(r));
  }

  async first() {
    return (await this.filtered())[0];
  }

  async toArray() {
    return this.filtered();
  }

  async count() {
    return (await this.filtered()).length;
  }

  async delete() {
    await this.table.facade._ensureLoaded();
    await this.table.facade.removeWhere(this.table.key, r => this.test(r));
  }

  async sortBy(key) {
    const arr = (await this.filtered()).sort((a, b) =>
      a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0
    );
    if (this.reversed) arr.reverse();
    return arr;
  }
}

class WhereClause {
  constructor(table, field) {
    this.table = table;
    this.field = field;
  }

  equals(value) {
    return new Collection(this.table, this.field, value);
  }
}

// ─── Facade Tauri (SQLite) ──────────────────────────────────────────────────

class TauriTable {
  constructor(facade, key) {
    this.facade = facade;
    this.key = key;
  }

  toArray() {
    return this.facade._ensureLoaded().then(() => this.facade.rows(this.key).slice());
  }

  async add(row) {
    return this.facade.add(this.key, row);
  }

  async put(row) {
    return this.facade.put(this.key, row);
  }

  async bulkAdd(rows) {
    return this.facade.bulk(this.key, 'add', rows);
  }

  async bulkPut(rows) {
    return this.facade.bulk(this.key, 'put', rows);
  }

  async count() {
    return this.facade._ensureLoaded().then(() => this.facade.rows(this.key).length);
  }

  async clear() {
    return this.facade.clear(this.key);
  }

  where(field) {
    return new WhereClause(this, field);
  }
}

export class TauriFacade {
  constructor() {
    this.banks = new TauriTable(this, 'banks');
    this.patches = new TauriTable(this, 'patches');
    this.tags = new TauriTable(this, 'tags');
    this.patchTags = new TauriTable(this, 'patchTags');
    this.history = new TauriTable(this, 'history');
    this._banks = [];
    this._patches = [];
    this._tags = [];
    this._patchTags = [];
    this._history = [];
    this._seq = { banks: 0, patches: 0, tags: 0, patchTags: 0, history: 0 };
    this._loaded = false;
  }

  rows(key) {
    return this['_' + key];
  }

  // Tablas SQLite (persistentes) frente a tablas de sesión (en memoria).
  persistent(key) {
    return key === 'banks' || key === 'patches';
  }

  async _ensureLoaded() {
    if (this._loaded) return;
    const library = await tauriInvoke('load_library');
    this._banks = [];
    this._patches = [];
    for (const bank of (library || [])) {
      const { patches, ...rest } = bank;
      const row = { ...rest };
      row.dbId = ++this._seq.banks;
      this._banks.push(row);
      for (const p of (patches || [])) {
        const pr = { ...p };
        pr.rawData = Array.isArray(pr.rawData) ? new Uint8Array(pr.rawData) : pr.rawData;
        pr.dbId = ++this._seq.patches;
        this._patches.push(pr);
      }
    }
    this._loaded = true;
  }

  _stripDbId(row) {
    const { dbId, ...rest } = row;
    return rest;
  }

  _flushedPatch(patch) {
    const { dbId, ...rest } = patch;
    return {
      ...rest,
      rawData: rest.rawData instanceof Uint8Array ? Array.from(rest.rawData) : rest.rawData,
      bankId: patch.bankId
    };
  }

  async _flush() {
    const banks = this._banks.map(b => {
      const { dbId, ...rest } = b;
      return rest;
    });
    const library = banks.map(b => {
      const patches = this._patches
        .filter(p => p.bankId === b.id)
        .sort((a, z) => a.index - z.index)
        .map(p => this._flushedPatch(p));
      return { ...b, patches };
    });
    await tauriInvoke('save_library', { library });
  }

  async add(key, row) {
    await this._ensureLoaded();
    const arr = this.rows(key);
    if (arr.some(r => r.id != null && r.id === row.id)) {
      throw new Error(`ConstraintError: id ya existe en '${key}'`);
    }
    const copy = { ...row };
    copy.dbId = ++this._seq[key];
    arr.push(copy);
    if (this.persistent(key)) await this._flush();
    return copy.dbId;
  }

  async put(key, row) {
    await this._ensureLoaded();
    const arr = this.rows(key);
    const copy = { ...row };
    let target;
    if (copy.dbId != null) {
      target = arr.find(r => r.dbId === copy.dbId);
    }
    if (!target && copy.id != null) {
      target = arr.find(r => r.id === copy.id);
    }
    if (target) {
      Object.assign(target, copy);
    } else {
      copy.dbId = ++this._seq[key];
      arr.push(copy);
    }
    if (this.persistent(key)) await this._flush();
    return copy.dbId;
  }

  async bulk(key, op, rows) {
    await this._ensureLoaded();
    const ids = [];
    for (const row of rows) {
      ids.push(await this[op](key, row));
    }
    return ids;
  }

  async clear(key) {
    await this._ensureLoaded();
    const arr = this.rows(key);
    arr.length = 0;
    if (this.persistent(key)) await this._flush();
  }

  async removeWhere(key, pred) {
    await this._ensureLoaded();
    const arr = this.rows(key);
    const next = arr.filter(r => !pred(r));
    arr.length = 0;
    arr.push(...next);
    if (this.persistent(key)) await this._flush();
  }

  async transaction(mode, ...rest) {
    const fn = rest[rest.length - 1];
    await fn();
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

let dexieDbInstance = null;

export function setDexieDb(db) {
  dexieDbInstance = db;
}

let tauriFacadeInstance = null;

export function getDb() {
  if (isTauri()) {
    if (!tauriFacadeInstance) {
      tauriFacadeInstance = new TauriFacade();
    }
    return tauriFacadeInstance;
  }
  if (!dexieDbInstance) {
    throw new Error('backend.js: getDb() llamado antes de setDexieDb() en modo navegador');
  }
  return dexieDbInstance;
}