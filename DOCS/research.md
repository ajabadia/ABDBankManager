# Investigación — ABD Universal Bank Manager

## Fuentes Consultadas

| # | Fuente | Tipo | Relevancia |
|---|---|---|---|
| 1 | Mejores prácticas 2025-2026 para arquitectura de patch management | Web search | Alta — principios de diseño |
| 2 | [KnobKraft Orm](https://github.com/christofmuc/KnobKraft-orm) | GitHub — referencia madura | **Muy alta** — librarian SysEx open-source con 1.5k+ stars |
| 3 | [Dexed](https://github.com/asb2m10/dexed) | GitHub — DX7 emulator | Media — Cartridge Manager para .syx |
| 4 | WebMidi.js, midiwire, sysx | Librerías JS MIDI | Alta — API de Web MIDI |
| 5 | Dexie.js | Wrapper IndexedDB | Alta — schema versioning |
| 6 | Zod | Runtime validation TS/JS | Media — validación de datos |
| 7 | SQLite schema patterns (fingerprint, tags M:N) | Artículos técnicos | Alta — deduplicación |
| 8 | `ABD_Synthesizer_Creation_Guide.md` §9 | Guía interna | **Crítica** — contrato ya definido |
| 9 | `PresetManagerBase.h` (ABDJUNiO601) | Código C++ interno | Alta — base class reutilizable |
| 10 | `bankLibrary.js` (ABDCZ101) | Código JS interno | Alta — CRUD inmutable existente |

---

## 1. Hallazgos Clave

### 1.1 KnobKraft Orm — El Estándar de Facto

KnobKraft Orm es la referencia más completa que existe en open-source para lo que queremos construir. Lecciones:

| Característica KnobKraft | Estado en nuestro diseño | Gap |
|---|---|---|
| **SQLite como store principal** | Proponemos localStorage/IndexedDB | ✅ Alineados (IndexedDB) pero debemos usar **Dexie.js** para migraciones de schema |
| **Python Adaptations** (drivers por sintetizador) | Nuestro `ModelContract` + `ImportAdapter` | ✅ Concepto equivalente, pero los nuestros son en JS nativo, más ligeros |
| **Patch Fingerprinting** (hash de datos sonoros) | ❌ **No contemplado** | 🔴 **Falta**: necesitamos detectar duplicados al importar |
| **Edit Buffer vs Program Dump** | Solo contemplamos Program Dump | 🟡 Añadir soporte para edit buffer mode |
| **Macro support** (operaciones bulk) | ✅ Tenemos batch export/import | ✅ OK |
| **Patch diff/compare** | ❌ No contemplado | 🟡 Futuro: comparar dos patches byte a byte |
| **Auto-backup antes de migración** | ❌ No contemplado | 🔴 **Falta**: backup automático del store antes de upgrade |

### 1.2 Mejores Prácticas 2025-2026

| Práctica moderna | Estado en nuestro diseño | Acción |
|---|---|---|
| **Library = Source of Truth, Hardware = View** | ✅ Ya lo hacemos (librería local → hardware es destino) | OK |
| **Tags en vez de jerarquía rígida** | 🟡 Tenemos `category` (single) + `tags` (array), pero sin sistema M:N formal | Formalizar tabla de tags con relación M:N |
| **Versioning de patches** (historial de ediciones) | ❌ No contemplado | 🟡 Añadir `previousVersionId` opcional |
| **Canonical Data Model** (parámetros independientes del hardware) | ✅ Nuestro `parameters: Record<string, number>` | OK, pero considerar esquema tipado con Zod |
| **Cola asíncrona para MIDI/SysEx** | ❌ No especificado | 🔴 **Falta**: cola con rate-limiting por hardware |
| **AI-assisted auto-tagging** | ❌ No contemplado | 🟡 Futuro: análisis de params para sugerir categoría |
| **Schema validation (Zod/Protobuf)** | ❌ No contemplado | 🔴 **Añadir**: Zod schemas para validar import |
| **Checksum verification** | Mencionado en Guide §6, no en nuestro diseño | 🔴 **Añadir**: verificar checksum antes de parsear |

### 1.3 ABD_Synthesizer_Creation_Guide §9

El Guide ya define un `ModelContract` básico en §9.1:

```javascript
// Del Guide §9.1 — ya existe como patrón
const ModelContract = {
    modelId: "korg-ms2000",
    bankCapacity: 128,
    banksCount: 8,
    programsPerBank: 16,
    getProgramAddress: (i) => `${bankLetter}.${progNum}`,
    sysEx: {
        modelIdByte: 0x58,
        buildDumpRequest: (ch) => [...],
        validateSysEx: (bytes) => bytes[3] === 0x58
    }
};
```

**Nuestro diseño actual extiende esto significativamente** (thumbnail, compatibility, manufacturer, categories), lo cual es correcto. Pero hay que asegurar **retrocompatibilidad** con el patrón del Guide para que los contratos ya escritos en los proyectos sigan funcionando.

### 1.4 Tecnologías Confirmadas

| Tecnología | Decisión | Razón |
|---|---|---|
| **Dexie.js** (IndexedDB wrapper) | ✅ Adoptar | Schema versioning declarativo, migraciones automáticas, 0 config |
| **WebMidi.js** | ✅ Adoptar | Wrapper maduro para Web MIDI API, simplifica SysEx |
| **Tauri** (desktop) | ✅ Confirmado por usuario | ~4MB vs ~150MB Electron, Rust backend para MIDI/FS |
| **Vite** (SPA web) | ✅ Confirmado por usuario | Misma UI para web y Tauri |
| **Zod** (validación) | ✅ Adoptar | Runtime validation de patches importados, previene corrupción |

---

## 2. Mejoras a Incorporar en el Diseño

### 2.1 🔴 Patch Fingerprinting (Deduplicación)

**Inspirado en KnobKraft Orm.** Al importar patches, calcular un hash MD5/SHA-256 de los bytes sonoros (excluyendo nombre, banco, metadata) para detectar duplicados.

```typescript
interface Patch {
  // ... campos existentes ...
  fingerprint: string;  // SHA-256 hex de rawData (excluye nombre/metadata)
}

// En el core:
function calculateFingerprint(rawData: Uint8Array, contract: ModelContract): string {
  // Excluir bytes de nombre (si el formato los tiene)
  const soundBytes = contract.extractSoundBytes?.(rawData) ?? rawData;
  return sha256(soundBytes);
}

// Al importar:
function importWithDedup(library: Library, newPatch: Patch): ImportDecision {
  const existing = library.patches.find(p => p.fingerprint === newPatch.fingerprint);
  if (existing) {
    return { action: 'duplicate', existingPatch: existing, newPatch };
    // UI muestra: "Este patch ya existe como 'A.03 Acid Bass'. ¿Importar de todas formas?"
  }
  return { action: 'import', patch: newPatch };
}
```

### 2.2 🔴 Schema Validation con Zod

Validar datos importados antes de insertarlos en la librería. Previene corrupción silenciosa.

```typescript
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).max(64),
  category: z.string(),
  originModel: z.string(),
  rawData: z.instanceof(Uint8Array).refine(d => d.length > 0, 'Empty patch data'),
  parameters: z.record(z.number()).optional(),
});

const ImportResultSchema = z.object({
  success: z.boolean(),
  modelId: z.string(),
  patches: z.array(PatchSchema),
  warnings: z.array(z.string()),
});
```

### 2.3 🔴 Dexie.js para IndexedDB (schema versionado)

```javascript
import Dexie from 'dexie';

const db = new Dexie('ABDBankManager');

db.version(1).stores({
  patches: '++id, name, category, originModel, fingerprint, bankId, isFavorite',
  banks:   '++id, name, modelId, isFactory',
  tags:    '++id, &name',
  patchTags: '[patchId+tagId], patchId, tagId',
});

// Futuras migraciones:
db.version(2).stores({
  patches: '++id, name, category, originModel, fingerprint, bankId, isFavorite, rating',
}).upgrade(tx => {
  return tx.table('patches').toCollection().modify(p => { p.rating = 0; });
});
```

### 2.4 🔴 Cola Asíncrona MIDI con Rate-Limiting

```typescript
class MidiSysExQueue {
  private queue: SysExMessage[] = [];
  private processing = false;
  
  async enqueue(messages: Uint8Array[], delayMs: number): Promise<void> {
    for (const msg of messages) {
      this.queue.push({ data: msg, delay: delayMs });
    }
    if (!this.processing) this.processQueue();
  }
  
  private async processQueue(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      this.midiOutput.send(msg.data);
      this.onProgress?.(this.queue.length);  // UI callback
      await this.sleep(msg.delay);
    }
    this.processing = false;
    this.onComplete?.();
  }
}
```

### 2.5 🔴 Checksum Verification antes de Parse

```typescript
interface ImportAdapter {
  // ... existente ...
  
  // NUEVO: Verificar integridad antes de parsear
  verifyChecksum?(data: Uint8Array): boolean;
  // Cada formato tiene su propio checksum:
  // - Roland: XOR de bytes de datos
  // - Korg: sin checksum (verificar tamaño)
  // - Casio: sin checksum (verificar nibble format)
  // - Yamaha DX7: suma de datos & 0x7F
}
```

### 2.6 🔴 Auto-Backup antes de Migración

```typescript
class PersistenceEngine {
  async upgradeSchema(fromVersion: number, toVersion: number): Promise<void> {
    // 1. Exportar toda la librería como .abdbank de backup
    const backup = await this.exportFullBackup();
    await this.saveBackupToFile(backup, `backup_v${fromVersion}_${new Date().toISOString()}.abdbank`);
    
    // 2. Ejecutar migración
    await this.runMigration(fromVersion, toVersion);
    
    // 3. Verificar integridad post-migración
    const valid = await this.verifyIntegrity();
    if (!valid) {
      await this.restoreFromBackup(backup);
      throw new Error('Migration failed, restored from backup');
    }
  }
}
```

### 2.7 🟡 Edit Buffer Mode (además de Program Dump)

KnobKraft distingue entre "edit buffer" (patch temporal en RAM) y "program slot" (guardado en memoria permanente). Esto es importante para hacer **audición sin sobreescribir** la memoria del sintetizador.

```typescript
interface HardwareLinkContract {
  // ... existente ...
  
  // NUEVO: Soporte para edit buffer
  supportsEditBuffer: boolean;
  buildEditBufferDump(patch: PatchData, channel: number): Uint8Array[];
  // Envía el patch al edit buffer del synth (no sobreescribe memoria permanente)
  // Útil para: preview/audición de patches sin riesgo
}
```

### 2.8 🟡 Patch Version History (undo ligero)

```typescript
interface Patch {
  // ... existente ...
  previousVersionId?: string;   // UUID del patch anterior (para historial)
  versionNumber: number;         // 1, 2, 3...
}

// Permite:
// - "Deshacer" una edición de patch
// - Ver historial de cambios de un sonido
// - Sin límite de profundidad (se puede truncar a N versiones)
```

### 2.9 🟡 Tags M:N con Tabla de Junction

En vez de `tags: string[]` dentro del Patch (que dificulta búsqueda), usar una relación many-to-many formal:

```
patches (id, name, ...)
tags (id, name)  ← tabla única de tags globales
patch_tags (patch_id, tag_id)  ← junction table
```

Esto permite:
- Buscar todos los patches con un tag específico en O(1) via índice
- Renombrar un tag afecta a todos los patches que lo usan
- Auto-completar tags al escribir

### 2.10 🟡 Retrocompatibilidad con Guide §9.1

El `ModelContract` del Guide usa `sysEx: { modelIdByte, buildDumpRequest, validateSysEx }` en vez de nuestro `sysexManufacturerId`. Debemos soportar ambos formatos:

```typescript
// Wrapper de compatibilidad
function normalizeContract(legacy: any): ModelContract {
  if (legacy.sysEx && !legacy.sysexManufacturerId) {
    return {
      ...legacy,
      sysexManufacturerId: [legacy.sysEx.modelIdByte],
      // Mapear las funciones legacy
    };
  }
  return legacy;
}
```

---

## 3. Proyectos GitHub Relevantes (No Competidores)

| Proyecto | Lo que hace | Lo que tomamos |
|---|---|---|
| [KnobKraft Orm](https://github.com/christofmuc/KnobKraft-orm) | C++ librarian con Python adaptations + SQLite | Fingerprinting, edit buffer, adaptation pattern |
| [Dexed](https://github.com/asb2m10/dexed) | DX7 emulator JUCE + Cartridge Manager | Modelo de Cartridge Manager para DX7 adapter |
| [WebMidi.js](https://webmidi.js.org/) | Wrapper Web MIDI API | API MIDI para standalone y plugins WebView2 |
| [Dexie.js](https://dexie.org/) | IndexedDB wrapper con migraciones | Persistencia en web/Tauri con schema versioning |
| [sysx](https://github.com/sicmind/sysx) | Framework para editores SysEx web | Patrones de parseo SysEx en JS |

> [!IMPORTANT]
> **Ninguno de estos proyectos es un competidor directo**. KnobKraft Orm es lo más cercano, pero es una app C++ monolítica de escritorio, no un módulo embebible. Nuestro enfoque — módulo JS/CSS reutilizable que se integra en plugins JUCE via WebView2 **y** funciona como app standalone — es único.

---

## 4. Conclusión: Actualizaciones al Diseño

Las 10 mejoras se agrupan en:

| Prioridad | Mejoras | Impacto |
|---|---|---|
| 🔴 **Críticas** (incorporar YA) | Fingerprinting, Zod validation, Dexie.js, MIDI Queue, Checksum verify, Auto-backup | Previenen corrupción de datos, duplicados, y cuelgues de UI |
| 🟡 **Importantes** (incorporar en Fase 2-3) | Edit Buffer, Version History, Tags M:N, Compat Guide §9.1 | Mejoran UX y compatibilidad con código existente |
| ⚪ **Futuras** | AI auto-tagging, Patch diff/compare, Cloud sync | Nice-to-have, planear pero no implementar ahora |

¿Apruebas estas mejoras para incorporarlas al documento de diseño?
