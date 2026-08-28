# ABD Universal Bank Manager — Diseño Arquitectónico

## 1. Visión General

Un **sistema universal de gestión de bancos y patches** para todos los proyectos ABDSynths, que funcione como:

1. **Aplicación Autónoma** (`ABDBankManager`): librería global donde importar, clasificar y gestionar bancos de *cualquier* hardware soportado.
2. **Módulo Integrable** vía contrato en cada proyecto concreto (ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000...), donde la librería se acota al sintetizador específico.
3. **Componente WebView2/WebUI** reutilizable como panel modal dentro de los plugins JUCE.
4. **Formato nativo `.abdbank`** para intercambio entre proyectos y persistencia en DAW.

---

## 2. Problemas que Resuelve

| Problema actual | Solución propuesta |
|---|---|
| Cada proyecto reimplementa bankManager.js, bankLibrary.js, PresetManager.h, etc. con lógica duplicada | Un único paquete `@abdsynths/bank-manager` (JS) y `ABD::BankManagerCore` (C++) compartido |
| No hay interoperabilidad entre proyectos — los patches del CZ101 no se ven desde el JUNiO601 ni viceversa | Librería global con etiquetado por `modelId`; cada proyecto filtra por su contrato |
| Los formatos de importación (SysEx Casio, Roland, Korg, DeepMind) están hardcoded en cada proyecto | Sistema de **Import Adapters** enchufables, uno por formato de hardware |
| No existe dump bidireccional unificado (fetch from synth / dump to synth) | Capa **HardwareLink** con contratos MIDI por fabricante |
| Sin formato propio — los patches viven en localStorage o en ValueTree del DAW sin portabilidad | Formato `.abdbank` (JSON + binario empaquetado) exportable e importable |
| La app JUCE embebe la lógica de presets pero la WebUI no puede funcionar sin el motor C++ | Separación completa: la librería JS es 100% independiente del motor DSP |

---

## 3. Arquitectura de Capas

```
┌──────────────────────────────────────────────────────────────────┐
│                    ABD UNIVERSAL BANK MANAGER                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   PRESENTATION LAYER                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │ Standalone   │  │ Plugin Modal │  │ DAW Integration  │   │  │
│  │  │ Tauri/Web    │  │ (WebView2)   │  │ (VST3/AU state)  │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    CONTRACT LAYER                             │  │
│  │  ContractRegistry ←── registro + auto-configuración          │  │
│  │  ModelContract ←── define capacidades por sintetizador        │  │
│  │  ImportAdapter ←── parsea formato específico (.syx, .mid)    │  │
│  │  ExportAdapter ←── serializa hacia formato específico        │  │
│  │  HardwareLinkContract ←── dump/fetch MIDI bidireccional      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     CORE LIBRARY                              │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │ BankStore│ │ PatchStore│ │ Searcher │ │ Persistence  │   │  │
│  │  │ (CRUD)   │ │ (CRUD)    │ │ & Filter │ │ Engine       │   │  │
│  │  └──────────┘ └───────────┘ └──────────┘ └──────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   STORAGE LAYER                               │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐     │  │
│  │  │ localStorage│ │ Dexie.js     │ │ File System        │     │  │
│  │  │ (plugin)    │ │ (IndexedDB)  │ │ (.abdbank files)   │     │  │
│  │  └─────────────┘ └──────────────┘ └───────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Contratos Fundamentales

### 4.1 ModelContract — Identidad del Sintetizador

Cada proyecto registra un `ModelContract` que describe las capacidades de ese sintetizador concreto. El Bank Manager usa este contrato para acotar la interfaz y validar operaciones.

```typescript
interface ModelContract {
  // ─── Identity ───
  modelId: string;              // 'casio-cz101', 'roland-juno106', 'korg-ms2000', 'behringer-deepmind12'
  displayName: string;          // 'Casio CZ-101'
  manufacturer: string;         // 'Casio', 'Roland', 'Korg', 'Behringer'
  icon?: string;                // URL o SVG inline del logo
  thumbnail?: string;           // Path a imagen del hardware real (PNG/WebP, ~200x120px)
  
  // ─── Bank Structure ───
  bankCapacity: number;         // Total patches (e.g., 16 CZ101, 128 Juno106, 128 MS2000, 1024 DeepMind)
  banksCount: number;           // Número de bancos lógicos (e.g., 1 CZ, 2 Juno, 8 MS2000, 8 DM12)
  programsPerBank: number;      // MÁXIMO de patches por banco (e.g., 16, 64, 16, 128)
  // El límite de capacidad de un banco lo define el CONTRATO del modelo, no el usuario.
  // El core y el UI deben validar que un banco nunca exceda `programsPerBank` patches:
  // intentar añadir un patch a un banco lleno → error (o elegir otro banco).
  
  // ─── Addressing ───
  getProgramAddress(globalIndex: number): string;
  // CZ101:  (i) => `P${i+1}`                        → "P1".."P16"
  // Juno106: (i) => `${['A','B'][Math.floor(i/64)]}${(i%64)+1}`  → "A1".."B64"  
  // MS2000: (i) => `${'ABCDEFGH'[Math.floor(i/16)]}.${String((i%16)+1).padStart(2,'0')}` → "A.01".."H.16"
  // DM12:   (i) => `${'ABCDEFGH'[Math.floor(i/128)]}${String((i%128)+1).padStart(3,'0')}` → "A001".."H128"
  
  parseProgramAddress(address: string): number | null;
  // Inversa de getProgramAddress
  
  // ─── Patch Data ───
  patchDataSize: number;        // Bytes de datos de patch (128 CZ, 18 Juno, 288 MS2000, 242 DM12)
  patchNameMaxLength: number;   // Caracteres de nombre (0 CZ, 0 Juno, 12 MS2000, 16 DM12)
  extractPatchName?(data: Uint8Array): string;   // Extrae nombre del blob binario
  
  // ─── Categories ───
  categories: string[];         // ['Bass','Lead','Pad','FX','Keys','Perc','Synth','Other']
  defaultCategory: string;      // 'Other'
  
  // ─── Compatibility ───
  compatibleModels?: string[];  // Modelos cuyo formato de patch es idéntico y transferible
  // e.g., MS2000 ↔ microKORG, CZ-101 ↔ CZ-1000, Juno-106 ↔ HS-60
  // Fuente de verdad de la asociación multi-hardware: de esta lista se deriva
  // `hardwareIds` de cada banco/patch (canónico + compatibles). El UI debe bloquear
  // drag & drop y menú "Copy to Bank" entre modelos que no compartan el blob.
  
  // ─── Metadata ───
  sysexManufacturerId: number[];  // [0x44, 0x00, 0x00] Casio, [0x41] Roland, [0x42] Korg
  formatVersion: number;          // Versión del contrato (para migraciones futuras)
}
```

### 4.2 ImportAdapter — Parseo de Formatos Externos

Cada formato de archivo que el sistema soporta se encapsula en un `ImportAdapter`. Esto permite añadir nuevos formatos sin tocar el core.

```typescript
interface ImportAdapter {
  // ─── Identity ───
  adapterId: string;            // 'sysex-casio-cz', 'sysex-roland-juno', 'sysex-korg-ms2000', 'midi-generic'
  displayName: string;          // 'Casio CZ SysEx (.syx)'
  supportedExtensions: string[];// ['.syx'], ['.syx','.mid'], ['.json','.abdbank']
  targetModelIds: string[];     // Modelos que este adapter produce
  
  // ─── Detection ───
  canParse(data: Uint8Array, filename: string): boolean;
  // Inspección rápida de header bytes para detectar si los datos pertenecen a este formato
  
  // ─── Integrity ───
  verifyChecksum?(data: Uint8Array): boolean;
  // Verificar integridad antes de parsear (Roland: XOR, Yamaha DX7: suma & 0x7F, Korg/Casio: solo tamaño)
  
  // ─── Parsing ───
  parse(data: Uint8Array, filename: string): ImportResult;
}

interface ImportResult {
  success: boolean;
  modelId: string;              // Modelo detectado de los datos
  bankName: string;             // Nombre sugerido para el banco
  patches: PatchData[];         // Patches extraídos
  warnings: string[];           // Advertencias no fatales
  error?: string;               // Error fatal si success=false
}

interface PatchData {
  name: string;                 // Nombre del patch (o generado si el formato no tiene nombres)
  category: string;             // Categoría (detectada o 'Other')
  author: string;               // Autor (si se conoce)
  tags: string[];               // Tags libres
  notes: string;                // Notas del usuario
  originAddress: string;        // Dirección original ("A.01", "P3", etc.)
  rawData: Uint8Array;          // Blob binario del patch en formato nativo (el gestor NO lo interpreta)
  hardwareIds?: string[];       // Hardwares donde el blob es válido (canónico + compatibles); si falta, se deriva del contrato
  parameters?: Record<string, number>; // RESERVADO para plugins/editores — el gestor nunca lo usa ni lo muestra
  isFavorite: boolean;
  creationDate: string;         // ISO 8601
}
```

**Adapters previstos:**

| Adapter ID | Formatos | Modelos Target | Notas |
|---|---|---|---|
| `sysex-casio-cz` | `.syx` | casio-cz101, casio-cz5000, casio-cz1 | Nibble format, 256/288 bytes payload |
| `sysex-roland-juno` | `.syx` | roland-juno106, roland-juno60, roland-juno6 | 18 bytes per patch, device ID 0x18 |
| `sysex-korg-ms2000` | `.syx` | korg-ms2000, korg-microkorg | 288 bytes, bank/program dump |
| `sysex-korg-prophecy` | `.syx` | korg-prophecy | Formato propietario Korg Prophecy |
| `sysex-behringer-dm12` | `.syx` | behringer-deepmind12 | 242 bytes unpacked, 7→8 packing |
| `sysex-behringer-pro800` | `.syx` | behringer-pro800 | Sequential Prophet-600 compatible |
| `sysex-yamaha-dx7` | `.syx` | yamaha-dx7, yamaha-dx7ii | 32-voice bulk dump (4104 bytes), VCED single voice |
| `tape-roland-juno` | `.wav` (tape) | roland-juno106, roland-juno60 | Audio cassette decode (JunoTapeDecoder) |
| `midi-program-dump` | `.mid` | * (genérico) | Standard MIDI file con program changes |
| `json-abd-native` | `.json`, `.abdbank` | * (cualquiera) | Formato propio ABDSynths |
| `json-third-party` | `.json` | * (varios) | Importar patches de otros editores (PatchBase, etc.) |
| `clipboard-sysex` | texto hex / binario | * (auto-detect) | Pegar SysEx desde portapapeles o drag & drop de bytes crudos |

### 4.3 ExportAdapter — Serialización hacia Formatos Externos

```typescript
interface ExportAdapter {
  adapterId: string;            // 'export-sysex-korg-ms2000', 'export-abdbank', 'export-csv'
  displayName: string;          // 'Korg MS2000 SysEx (.syx)'
  fileExtension: string;        // '.syx', '.abdbank', '.csv', '.json'
  targetModelIds: string[];     // Modelos que este adapter puede serializar
  
  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array;
}

interface ExportOptions {
  includeRawData: boolean;      // Incluir blobs binarios (para .abdbank)
  includeParameters: boolean;   // Incluir parámetros decodificados (para .json)
  midiChannel: number;          // Canal MIDI para SysEx (default 0)
  deviceId: number;             // Device ID para SysEx
  format: 'single' | 'bank';   // Patch individual o banco completo
}
```

**Exports previstos:**

| Export ID | Formato | Descripción |
|---|---|---|
| `export-abdbank` | `.abdbank` | Formato propio: JSON + binarios empaquetados (ZIP) |
| `export-sysex-*` | `.syx` | SysEx nativo del hardware target |
| `export-json` | `.json` | JSON portátil con parámetros decodificados |
| `export-csv` | `.csv` | Hoja de cálculo para catalogación |
| `export-daw-state` | `ValueTree` (C++) | Para persistencia en sesión del DAW |

### 4.4 HardwareLinkContract — Comunicación MIDI Bidireccional

```typescript
interface HardwareLinkContract {
  modelId: string;
  
  // ─── Discovery ───
  detectHardware(midiOutputs: MIDIOutput[]): HardwareDevice | null;
  // Intenta encontrar el hardware conectado por nombre de puerto o envío de Identity Request
  
  // ─── Dump TO Synth ───
  buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[];
  // Genera los mensajes SysEx para enviar un patch al slot indicado del hardware
  
  buildBankDump(patches: PatchData[], channel: number): Uint8Array[];
  // Genera el volcado de banco completo (todos los patches)
  
  // ─── Fetch FROM Synth ───
  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array;
  // Genera el mensaje SysEx de solicitud de dump
  
  parseDumpResponse(data: Uint8Array): ImportResult;
  // Parsea la respuesta del hardware (reutiliza ImportAdapter internamente)
  
  // ─── Edit Buffer (inspirado en KnobKraft Orm) ───
  supportsEditBuffer: boolean;
  buildEditBufferDump?(patch: PatchData, channel: number): Uint8Array[];
  // Envía el patch al edit buffer del synth (audición sin sobreescribir memoria permanente)
  
  // ─── Timing ───
  interMessageDelayMs: number;    // Pausa entre mensajes SysEx (algunos sintetizadores necesitan delay)
  dumpTimeoutMs: number;          // Timeout para esperar respuesta de dump
}
```

**HardwareLinks previstos:**

| Hardware | Dump TO | Fetch FROM | Delay | Notas |
|---|---|---|---|---|
| Casio CZ-101/1000/5000 | ✅ Single patch | ✅ Single + Bank | 100ms | Formato nibble |
| Roland Juno-106/60/6 | ✅ Single patch | ✅ Single | 50ms | No soporta bank dump nativo |
| Korg MS2000/microKORG | ✅ Single + Bank | ✅ Single + Bank | 20ms | Program Data Dump / All Data Dump |
| Korg Prophecy | ✅ Single + Bank | ✅ Single + Bank | 30ms | Formato propietario Korg |
| Behringer DeepMind 12 | ✅ Single + Bank | ✅ Single + Bank | 10ms | Protocolo propietario |
| Behringer Pro-800 | ✅ Single + Bank | ✅ Single + Bank | 50ms | Compatible Sequential Prophet-600 |
| Yamaha DX7 / DX7II | ✅ Single + 32-voice | ✅ Single + 32-voice | 20ms | VCED / VMEM format |

### 4.5 ContractRegistry — Registro y Auto-Configuración

El **ContractRegistry** es la abstracción que el core consulta para saber *qué puede hacer* el sistema en el despliegue actual. Es la diferencia real entre standalone y plugin: **no hay modos ni flags — la naturaleza del despliegue la determina el conjunto de contratos registrados**.

- **Standalone**: registra **todos** los contratos del monorepo → gestor universal multi-modelo (§8.3).
- **Plugin** (ABDCZ101, ABDEep…): registra **solo** su `ModelContract` + sus adapters/hardware links (incluidos los `compatibleModels` del contrato) → gestor acotado al sintetizador (§8.1).

```typescript
type DeploymentMode = 'standalone' | 'plugin';

interface ContractRegistry {
  // ─── Registro (declarativo, validado al registrar) ───
  registerModel(contract: ModelContract): void;
  registerImportAdapter(adapter: ImportAdapter): void;
  registerExportAdapter(adapter: ExportAdapter): void;
  registerHardwareLink(link: HardwareLinkContract): void;

  // ─── Consulta — el core/UI se auto-configuran SOLO a partir de esto ───
  readonly mode: DeploymentMode;              // 'standalone' si hay >1 modelo registrado
  getModels(): ModelContract[];
  getModel(modelId: string): ModelContract | undefined;
  getCompatibleModels(modelId: string): string[];   // desde compatibleModels del contrato
  getImportAdapters(modelId?: string): ImportAdapter[];   // filtrados por targetModelIds
  getExportAdapters(modelId?: string): ExportAdapter[];
  getHardwareLinks(modelId?: string): HardwareLinkContract[];
  getMidiConfig(modelId: string): MidiConfig;   // canal/device + timing (cola MIDI)
  isSupported(modelId: string): boolean;        // registrado y en scope
}
```

**Reglas de registro y validación** (Zod, `Source/Core/validationSchemas.ts`):

| Regla | Comportamiento |
|---|---|
| `modelId` duplicado | Rechazar con error claro |
| `adapterId` duplicado | Rechazar |
| `ImportAdapter.targetModelIds` sin modelo registrado | Admitido con warning (formatos genéricos: `.mid`, clipboard hex) |
| `HardwareLink.modelId` sin contrato registrado | Rechazar |
| Contrato con datos existentes | `formatVersion` del contrato para migraciones (§4.1) |

**Auto-configuración derivada del registry** (el core nunca hardcodea listas de modelos):

| Qué se configura | Cómo lo consulta |
|---|---|
| Árbol de sintetizadores / selector de banco | `getModels()` — en plugin, un solo modelo (+ compatibles) |
| Botones Import/Export | `getImportAdapters()` / `getExportAdapters()` |
| Botones Dump/Fetch y cola MIDI | `getHardwareLinks()` + `getMidiConfig()` (delay/timeout por hardware) |
| Librería local vs global | `isSupported(modelId)` filtra bancos/patches fuera de scope |
| `.abdbank` entrante | Valida `manifest.modelId` contra `isSupported()`; en plugin rechaza modelos ajenos con mensaje claro |
| Paste/drag SysEx (§8.4) | Recorre `getImportAdapters()` hasta que `canParse()` devuelve true |

> [!NOTE]
> `getMidiConfig()` / `getContractsForManufacturer()` ya implementados en `Source/Contracts/Models/index.ts` son la semilla de este registry: el `ContractRegistry` los formaliza como API única de consulta.

---

## 5. Core Library (Motor Puro)

> [!IMPORTANT] Principio de asepsia
> El gestor es un **contenedor neutro de blobs opacos**: carga, almacena, organiza y pasa
> los patches al hardware o al plugin **sin interpretarlos**. El conocimiento vive en los
> contratos (formato sysex: framing, packing, checksums, addressing) y en los editores de
> los plugins (semántica de parámetros). El gestor nunca decodifica ni muestra parámetros:
> `parameters` es un campo reservado que solo los editores de los plugins rellenan.

### 5.1 Modelo de Datos

```typescript
// ─── Patch ───
interface Patch {
  id: string;                   // UUID único global
  name: string;
  category: string;
  author: string;
  tags: string[];               // Array local (duplicado de M:N para facilidad de uso)
  notes: string;
  isFavorite: boolean;
  rating: number;               // 0-5 estrellas
  creationDate: string;         // ISO 8601
  modifiedDate: string;
  
  originModel: string;          // ModelContract.modelId CANÓNICO (para addressing)
  hardwareIds: string[];        // Todos los hardwares donde el blob es válido (canónico + compatibles)
  originAddress: string;        // Dirección original ("A.01", "P3")
  originBank: string;           // Nombre del banco original
  
  rawData: Uint8Array | null;   // Blob binario nativo (para re-export SysEx)
  parameters: Record<string, number> | null;  // RESERVADO para plugins/editores — el gestor no lo usa
  
  // Fingerprinting — deduplicación (KnobKraft Orm pattern)
  fingerprint: string;          // SHA-256 hex de bytes sonoros (excluye nombre/metadata)
  
  // Version History — undo ligero
  previousVersionId?: string;   // UUID del patch anterior (para historial de ediciones)
  versionNumber: number;        // 1, 2, 3...
  
  // Heritage — para trazabilidad
  importSource: string;         // Filename de importación original
  importDate: string;
}

// ─── Bank ───
interface Bank {
  id: string;                   // UUID
  name: string;
  modelId: string;              // Modelo canónico (addressing)
  hardwareIds: string[];        // Hardwares donde el banco es válido (canónico + compatibles)
  isFactory: boolean;           // Banco de fábrica: INMUTABLE por el plugin (read-only)
  isLocked: boolean;            // Bloqueo manual de edición por el usuario
  patches: Patch[];             // length ≤ ModelContract.programsPerBank (validado por contrato)
  source: string | null;        // Path/URL del archivo origen
  creationDate: string;
  modifiedDate: string;
}

// ─── Bancos de fábrica vs. de usuario (IMPLEMENTADO) ───
// isFactory=true  → banco embebido/fábrica del hardware: el PLUGIN no puede modificarlo
//                   (ni renombrar, ni reordenar, ni sobreescribir patches). Solo lectura
//                   y audición. El usuario SÍ puede copiar sus patches a un banco de
//                   usuario (isFactory=false) para editarlos allí.
//                   Enforcement: assertBankEditable() en persistence.js + UI (badge,
//                   botones deshabilitados, campos read-only). isFavorite y notes son
//                   excepciones (preferencias del usuario, no mutaciones del banco).
// isFactory=false → banco de usuario: completamente editable (CRUD completo de patches).
// El flag es inmutable en runtime: un banco de fábrica nunca se convierte en de usuario;
// si el usuario quiere editarlo, se clona a un banco de usuario nuevo.

// ─── Library (Colección global) ───
interface Library {
  version: number;              // Schema version para migraciones
  activeBankId: string | null;
  activePresetIndex: number;
  banks: Bank[];
  
  // Metadata global
  lastImportPath: string;
  lastExportPath: string;
}
```

### 5.2 Operaciones CRUD (Funciones Puras)

Todas las operaciones sobre la librería son **funciones puras inmutables** (no mutan el estado, devuelven una copia nueva). Esto garantiza compatibilidad con undo/redo y facilita testing.

```typescript
// Bank CRUD
function addBank(library: Library, bank: Bank): Library;
function removeBank(library: Library, bankId: string): Library;
function renameBank(library: Library, bankId: string, newName: string): Library;
function duplicateBank(library: Library, bankId: string, newName: string): Library;
function mergeBank(library: Library, targetBankId: string, sourcePatchs: Patch[]): Library;

// Patch CRUD dentro de un banco
function addPatch(library: Library, bankId: string, patch: Patch, position?: number): Library;
function removePatch(library: Library, bankId: string, patchIndex: number): Library;
function movePatch(library: Library, bankId: string, fromIndex: number, toIndex: number): Library;
function renamePatch(library: Library, bankId: string, patchIndex: number, newName: string): Library;
function updatePatchMetadata(library: Library, bankId: string, patchIndex: number, metadata: Partial<Patch>): Library;

// Drag & Drop entre bancos
function copyPatchBetweenBanks(library: Library, sourceBankId: string, sourceIndex: number, targetBankId: string, targetIndex: number): Library;
function movePatchBetweenBanks(library: Library, sourceBankId: string, sourceIndex: number, targetBankId: string, targetIndex: number): Library;

// Búsqueda y Filtrado
function searchPatches(library: Library, query: SearchQuery): SearchResult[];
function getFilteredPatches(library: Library, filters: PatchFilters): Patch[];

interface SearchQuery {
  text: string;                 // Busca en name, author, tags, notes
  modelId?: string;             // Filtrar por sintetizador
  category?: string;
  favoritesOnly?: boolean;
  minRating?: number;
}

interface PatchFilters {
  modelId?: string;
  category?: string;
  author?: string;
  tags?: string[];
  favoritesOnly?: boolean;
  sortBy?: 'name' | 'date' | 'category' | 'rating';
  sortOrder?: 'asc' | 'desc';
}
```

### 5.3 Persistencia (Dexie.js + Auto-Backup)

```typescript
import Dexie from 'dexie';

// ─── Schema versionado con migraciones automáticas ───
const db = new Dexie('ABDBankManager');

db.version(1).stores({
  patches:   '++id, name, category, originModel, fingerprint, bankId, isFavorite, rating',
  banks:     '++id, name, modelId, isFactory',
  tags:      '++id, &name',                    // Tags globales únicos
  patchTags: '[patchId+tagId], patchId, tagId', // Relación M:N
});

// Futuras migraciones:
db.version(2).stores({
  patches: '++id, name, category, originModel, fingerprint, bankId, isFavorite, rating, versionNumber',
}).upgrade(tx => {
  return tx.table('patches').toCollection().modify(p => { p.versionNumber = 1; });
});
```

```typescript
interface PersistenceEngine {
  // ─── Load / Save (formato interno) ───
  loadLibrary(): Promise<Library | null>;
  saveLibrary(library: Library): Promise<boolean>;
  
  // ─── Import / Export (formatos externos) ───
  importFile(data: Uint8Array, filename: string, adapters: ImportAdapter[]): Promise<ImportResult>;
  exportFile(patches: PatchData[], adapter: ExportAdapter, options: ExportOptions): Promise<Uint8Array>;
  
  // ─── Auto-Backup antes de migración ───
  createBackup(reason: string): Promise<Uint8Array>;  // Exporta .abdbank completo
  restoreFromBackup(data: Uint8Array): Promise<boolean>;
}

// Implementaciones:
class LocalStoragePersistence implements PersistenceEngine { /* WebView2 plugin */ }
class DexiePersistence implements PersistenceEngine { /* Standalone + web (Dexie.js) */ }
class TauriPersistence implements PersistenceEngine { /* Tauri desktop (SQLite via Rust) */ }
```

---

## 6. Formato Nativo `.abdbank`

Archivo ZIP renombrado que contiene:

```
mi_banco.abdbank (ZIP)
├── manifest.json           ← Metadatos del banco + array de patches (sin rawData)
├── patches/
│   ├── 000_init_program.bin    ← rawData del patch 0
│   ├── 001_poly_lead.bin       ← rawData del patch 1
│   └── ...
└── thumbnails/             ← (futuro) Previsualizaciones de forma de onda
    ├── 000.svg
    └── ...
```

**Formato `.abdlibrary` (librería completa multi-banco) — manifest.json:**
```json
{
  "version": 1,
  "format": "abdlibrary",
  "library": {
    "bankCount": 2,
    "exportedAt": "2026-08-27T10:00:00.000Z"
  },
  "banks": [
    {
      "bank": { "id": "bank_uuid", "name": "Live Set", "modelId": "korg-ms2000", "hardwareIds": ["korg-ms2000", "korg-microkorg"], "manufacturer": "Korg", "isFactory": false, "patchCount": 16 },
      "patches": [
        { "index": 0, "name": "BRASS A.01", "address": "A.01", "rawDataFile": "banks/000/patch_000.bin", "parameters": {} }
      ]
    },
    { "bank": { "id": "bank_uuid_2", "name": "Factory CZ", "modelId": "casio-cz101", "isFactory": true, "patchCount": 16 }, "patches": [] }
  ]
}
```

> **`.abdlibrary`** es el formato dedicado a exportar/importar **toda la librería** (botón "Exportar Librería"): ZIP con `banks[]`, blobs en `banks/NN/patch_MMM.bin` (NN = índice del banco). El **`.abdbank`** queda reservado a **un banco individual** (manifest v1/v2, campo `bank` singular). El import detecta ambos por extensión/formato; un `.abdbank` con `banks[]` (v3 legado, anterior a `.abdlibrary`) también se importa por retrocompatibilidad. Esquemas: `schemas/bank-file.schema.v1.json` y `schemas/library-file.schema.v1.json`.

**manifest.json (v2 — monobanco, retrocompatible):**
```json
{
  "version": 2,
  "format": "abdbank",
  "bank": {
    "id": "bank_uuid",
    "name": "My Custom MS2000 Bank",
    "modelId": "korg-ms2000",
    "hardwareIds": ["korg-ms2000", "korg-microkorg"],
    "manufacturer": "Korg",
    "isFactory": false,
    "creationDate": "2026-08-25T13:00:00Z",
    "patchCount": 128
  },
  "patches": [
    {
      "index": 0,
      "name": "Init Program",
      "address": "A.01",
      "category": "Init",
      "author": "Factory",
      "tags": ["init", "template"],
      "isFavorite": false,
      "rating": 0,
      "rawDataFile": "patches/000_init_program.bin",
      "parameters": { "osc1Wave": 0, "filterCutoff": 127, "..." : "..." }
    }
  ],
  "contract": {
    "modelId": "korg-ms2000",
    "patchDataSize": 288,
    "bankCapacity": 128,
    "banksCount": 8,
    "programsPerBank": 16
  }
}
```

> [!IMPORTANT]
> El formato `.abdbank` es **portátil entre proyectos**. Un banco exportado desde ABDMS2000 puede importarse en la app autónoma y viceversa. El `modelId` en el manifiesto determina qué ImportAdapter/ExportAdapter lo procesa.

---

## 7. Integración con Proyectos Existentes

### 7.1 Modelo de Integración por Proyecto

Cada proyecto consume el Bank Manager a través de su `ModelContract` específico. La librería del proyecto es **local e independiente** de la librería global.

Standalone y plugin son la **misma aplicación** instanciada con un `ContractRegistry` distinto (§4.5):

```typescript
// Standalone — bundle completo
const registry = new ContractRegistry();
registerAllContracts(registry);   // todos los modelos + adapters + hardware links

// Plugin ABDMS2000 — bundle acotado
const registry = new ContractRegistry();
registry.registerModel(ms2000Contract);        // + compatibleModels (microKORG)
registry.registerImportAdapter(sysexKorgMs2000);
registry.registerHardwareLink(hwKorgMs2000);
```

El core, la UI y la persistencia se auto-configuran consultando el registry: en el plugin el selector de banco muestra solo MS2000, los botones Dump/Fetch solo aparecen si hay `HardwareLinkContract` registrado, y un `.abdbank` de otro modelo se rechaza con mensaje claro. En el standalone todo está disponible.

```
┌─────────────────────────────────────────────────────────┐
│              ABD BANK MANAGER (Standalone)                │
│  ┌──────────────────────────────────────────────────┐    │
│  │  GLOBAL LIBRARY                                   │    │
│  │  ├── Factory CZ-101 (16 patches)                  │    │
│  │  ├── Factory Juno-106 A (64 patches)              │    │
│  │  ├── Factory MS2000 (128 patches)                 │    │
│  │  ├── Factory DeepMind12 Bank A (128 patches)      │    │
│  │  ├── Mi colección Juno (32 patches custom)        │    │
│  │  ├── Downloaded MS2000 Pack (256 patches)         │    │
│  │  └── ...                                          │    │
│  └──────────────────────────────────────────────────┘    │
│           │ Export .abdbank    │ Export .abdbank           │
│           ▼                   ▼                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   ABDCZ101   │  │  ABDJUNiO601 │  │  ABDMS2000   │   │
│  │  (CZ only)   │  │ (Juno only)  │  │ (MS2000 only)│   │
│  │              │  │              │  │              │   │
│  │ LOCAL LIBRARY│  │ LOCAL LIBRARY│  │ LOCAL LIBRARY│   │
│  │ (filtrada    │  │ (filtrada    │  │ (filtrada    │   │
│  │  por contrato)│  │  por contrato)│  │  por contrato)│   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Flujo de Datos: Standalone → Plugin

1. El usuario importa un `.syx` del Korg MS2000 en la **app autónoma**.
2. El adapter `sysex-korg-ms2000` parsea y crea un banco en la librería global.
3. El usuario exporta ese banco como `.abdbank`.
4. En el plugin **ABDMS2000** (WebView2), el usuario importa el `.abdbank`.
5. El Bank Manager del plugin valida el banco contra su scope: `manifest.hardwareIds` (o `modelId`) debe intersectar `isSupported()` del ContractRegistry.
6. Los patches aparecen en la librería local del plugin.

### 7.3 Flujo de Datos: Plugin ↔ Hardware

1. El usuario conecta su Korg MS2000 por USB-MIDI.
2. En el Bank Manager del plugin, pulsa **"Fetch from Hardware"**.
3. El `HardwareLinkContract` de MS2000 envía el SysEx `[F0 42 3g 58 10 F7]` (All Data Dump Request).
4. El hardware responde con el volcado completo.
5. El adapter parsea la respuesta y puebla la librería local.
6. El usuario puede editar patches en el plugin y hacer **"Dump to Hardware"** para enviarlos de vuelta.

### 7.4 Integración DAW (State Persistence)

```cpp
// C++ side — ABD::BankManagerCore
class BankManagerCore {
public:
    // Serializa la librería local completa a ValueTree para guardar en sesión DAW
    juce::ValueTree toValueTree() const;
    
    // Restaura la librería desde la sesión del DAW
    void fromValueTree(const juce::ValueTree& vt);
    
    // Selección de preset activo (sincronizado con APVTS)
    void selectPreset(int bankIndex, int patchIndex);
    int getCurrentBankIndex() const;
    int getCurrentPatchIndex() const;
    
    // Bridge con WebUI
    void handleWebUIMessage(const juce::String& type, const juce::var& data);
    void sendToWebUI(const juce::String& event, const juce::var& data);
};
```

---

## 8. Interfaz de Usuario

### 8.1 Layout Dual-Panel (heredado de ABDEep)

```
┌────────────────────────────────────────────────────────────────────┐
│  BANK MANAGER                                            [✕ Close] │
├────────────────────────────────┬───────────────────────────────────┤
│  HARDWARE / SOURCE             │  LOCAL LIBRARY                    │
│                                │                                   │
│  [ Bank A ][ Bank B ][ C ]...  │  [▼ Select Bank ▼] [+ New][Rename]│
│                                │  [Delete]                         │
│  [Dump to Synth] [Fetch Bank]  │                                   │
│                                │  [Import .syx/.abdbank] [Export]   │
│  ┌──────────────────────────┐  │                                   │
│  │ 01. Init Program      ●  │  │  🔍 [Search patches...     ] [✕]  │
│  │ 02. Poly Lead            │  │  [All][Bass][Lead][Pad][FX][Keys] │
│  │ 03. Acid Bass         ●  │  │                                   │
│  │ 04. String Pad           │  │  ┌──────────────────────────────┐ │
│  │ 05. Vocoder Pad          │  │  │ A.01  Init Program        ★  │ │
│  │ 06. ...                  │  │  │ A.02  MS2000 Poly Lead       │ │
│  │                          │  │  │ A.03  Acid Bass           ★  │ │
│  │ ← Drag patches →        │  │  │ A.04  String Pad             │ │
│  │                          │  │  │ ...                          │ │
│  └──────────────────────────┘  │  └──────────────────────────────┘ │
│                                │                                   │
│  ⟲ 128/128 patches loaded     │  48/128 slots • Korg MS2000       │
├────────────────────────────────┴───────────────────────────────────┤
│  Preset: [A.01 ▼] [◀ Prev] [Next ▶]  Name: [Init Program      ]  │
│  Category: [VA Saw ▼]  Author: [Factory]  ★★★☆☆  [Save] [Save As] │
└────────────────────────────────────────────────────────────────────┘
```

### 8.2 Menú Contextual por Patch (Click Derecho)

```
┌─────────────────────────┐
│ ▲ Move Up               │
│ ▼ Move Down             │
│ ↕ Move to Position...   │
│ ─────────────────────── │
│ ✎ Rename...             │
│ ⊕ Duplicate             │
│ ⊞ Copy to Bank...       │
│ ─────────────────────── │
│ ★ Toggle Favorite       │
│ 🏷 Set Category...       │
│ ─────────────────────── │
│ 🗑 Delete                │
└─────────────────────────┘
```

### 8.3 Standalone App — Vista Global Multi-Modelo

En la app autónoma, el panel izquierdo muestra **todos los modelos** con thumbnails de hardware y una vista de árbol:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ABD BANK MANAGER — Universal Synthesizer Library              [─][□][✕]│
├─────────────────────────┬────────────────────────────────────────────────┤
│  SYNTHESIZERS           │  PATCHES                     Sort: [Name ▼]    │
│                         │                                                 │
│  ▼ Casio                │  🔍 [Search all patches...           ] [✕]     │
│    ┌──────────┐         │  [All][Bass][Lead][Pad][FX][Keys][Perc][Other] │
│    │ [CZ-101] │ CZ-101  │                                                 │
│    │ [thumb]  │ 16 ptch │  ┌─────┬──────────────┬──────┬────┬──────────┐ │
│    └──────────┘         │  │ #   │ Name         │ Bank │ ★  │ Category │ │
│    ├ Factory            │  ├─────┼──────────────┼──────┼────┼──────────┤ │
│    ├ CZ Pack 1          │  │ 01  │ BRASS ENS    │ Fact │    │ Brass    │ │
│    └ Mi colección       │  │ 02  │ TRUMPET      │ Fact │ ★  │ Brass    │ │
│    ┌──────────┐         │  │ 03  │ VIOLIN       │ Fact │    │ Strings  │ │
│    │ [CZ5000] │ CZ-5000 │  │ ... │              │      │    │          │ │
│    └──────────┘         │  └─────┴──────────────┴──────┴────┴──────────┘ │
│  ▼ Roland               │                                                 │
│    ┌──────────┐         │  ╔════════════════════════════════════════════╗ │
│    │ [J-106]  │ Juno106 │  ║  📋 PASTE SYSEX    or drag .syx/.mid here ║ │
│    └──────────┘         │  ║  F0 42 30 58 40 ...  [Parse & Import]     ║ │
│  ▼ Korg                 │  ╚════════════════════════════════════════════╝ │
│    ┌──────────┐         │                                                 │
│    │ [MS2000] │ MS2000  │  Status: 348 patches across 12 banks            │
│    └──────────┘         │                                                 │
│  ▼ Behringer            │  [Import .syx/.mid/.abdbank] [Export .abdbank]  │
│    ┌──────────┐         │  [Dump to Hardware] [Fetch from Hardware]        │
│    │ [DM12]   │ DM12    │                                                 │
│    └──────────┘         │                                                 │
│  ▼ Yamaha               │                                                 │
│    ┌──────────┐         │                                                 │
│    │ [DX7]    │ DX7     │                                                 │
│    └──────────┘         │                                                 │
├─────────────────────────┴────────────────────────────────────────────────┤
│  MIDI: [Input: ▼ Korg MS2000] [Output: ▼ Korg MS2000] [Ch: 1 ▼]         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Paste & Drag SysEx Input

Permite crear patches **sin necesidad de archivos** — directamente pegando SysEx desde el portapapeles o arrastrando bytes crudos.

#### Métodos de entrada soportados:

| Método | Fuente típica | Formato esperado |
|---|---|---|
| **Ctrl+V / Cmd+V** | MIDI Monitor, foros, documentación | Texto hex: `F0 42 30 58 40 ... F7` |
| **Drag & Drop de .syx** | Explorador de archivos, email | Binario SysEx crudo |
| **Drag & Drop de .mid** | Explorador de archivos | Standard MIDI file |
| **Drag & Drop de texto** | Navegador, editor de texto | Texto hex como Ctrl+V |
| **Right-click → Paste SysEx** | Menú contextual | Texto hex del portapapeles |

#### Flujo de parseo:

```
Clipboard/Drop Input
       │
       ▼
┌─────────────────────────┐
│ 1. Detect input type    │  ← ¿Es texto hex, binario .syx, .mid, .abdbank?
│    - Text → hex decode  │
│    - Binary → raw bytes │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 2. Auto-detect model    │  ← Recorre todos los ImportAdapters registrados
│    adapter.canParse()   │     hasta que uno devuelve true
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 3. Parse with adapter   │  ← adapter.parse(bytes, filename)
│    → ImportResult       │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 4. Confirmation dialog                      │
│  ┌────────────────────────────────────────┐  │
│  │ Detected: Korg MS2000 Program Dump     │  │
│  │ Patches found: 1                       │  │
│  │ Name: "Init Program"                   │  │
│  │                                        │  │
│  │ Import to: [▼ Current Bank: Factory A] │  │
│  │ Slot: [▼ Next available: A.03]         │  │
│  │                                        │  │
│  │         [Cancel]  [Import Patch]       │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

#### Parseo de texto hex:

```typescript
function parseHexInput(text: string): Uint8Array | null {
  // Limpiar el texto: eliminar prefijos 0x, comas, saltos de línea, comentarios
  const cleaned = text
    .replace(/\/\/.*/g, '')           // Eliminar comentarios //
    .replace(/0x/gi, '')              // Eliminar prefijos 0x
    .replace(/[^0-9a-fA-F\s]/g, ' ') // Solo hex + espacios
    .trim();
  
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return null;
  
  // Validar: cada token debe ser 1-2 hex chars
  const bytes = tokens.map(t => parseInt(t, 16));
  if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) return null;
  
  // Validar SysEx framing: debe empezar con F0 y terminar con F7
  if (bytes[0] !== 0xF0 || bytes[bytes.length - 1] !== 0xF7) {
    // Tolerante: si falta F0/F7, intentar añadirlos
    if (bytes[0] !== 0xF0) bytes.unshift(0xF0);
    if (bytes[bytes.length - 1] !== 0xF7) bytes.push(0xF7);
  }
  
  return new Uint8Array(bytes);
}
```

> [!TIP]
> En la versión integrada en plugin (WebView2), el paste de SysEx es especialmente útil para usuarios que copian datos de MIDI Monitor, SysEx Librarian, o foros de patches sin necesidad de guardar primero un archivo `.syx`.

---

## 9. Hardware Thumbnails y Compatibilidad Cross-Model

### 9.1 Sistema de Thumbnails de Hardware

Cada `ModelContract` puede incluir un `thumbnail` — una imagen real del hardware (foto o ilustración) que se muestra en el árbol de sintetizadores y en las cards de banco para identificación visual inmediata.

```
packages/adapters/assets/thumbnails/
├── casio-cz101.webp          ← ~200x120px, fondo transparente
├── casio-cz5000.webp
├── roland-juno106.webp
├── roland-juno60.webp
├── korg-ms2000.webp
├── korg-microkorg.webp
├── korg-prophecy.webp
├── behringer-deepmind12.webp
├── behringer-pro800.webp
├── yamaha-dx7.webp
└── _placeholder.webp         ← Silueta genérica para modelos sin thumbnail
```

El thumbnail se usa en:
- **Árbol de sintetizadores** (standalone): Miniatura junto al nombre del modelo.
- **Cards de banco**: Badge visual indicando el hardware de origen.
- **Diálogo de importación**: Muestra el hardware detectado para confirmar antes de importar.
- **Drag & drop entre bancos**: Tooltip con el thumbnail del hardware destino.

### 9.2 Matriz de Compatibilidad Cross-Model

El sistema **impide** transferir patches entre hardwares no compatibles. Con la asociación multi-hardware (`hardwareIds`), un patch válido en varios hardwares se mueve/copia sin fricción entre ellos; la matriz de abajo sigue siendo la fuente de verdad declarativa (`compatibleModels[]`) de la que se deriva `hardwareIds`.

| Modelo | Compatibles con | Razón |
|---|---|---|
| `korg-ms2000` | `korg-microkorg` | Mismo motor DSP y formato SysEx |
| `korg-microkorg` | `korg-ms2000` | Bidireccional |
| `casio-cz101` | `casio-cz1000` | Mismo formato de patch exacto |
| `casio-cz5000` | *(ninguno directo)* | 32 patches vs 16, superset |
| `casio-cz1` | *(ninguno directo)* | 288 bytes vs 256, superset |
| `roland-juno106` | `roland-hs60` | Mismo hardware, diferente carcasa |
| `roland-juno60` | `roland-juno6` | Formato idéntico, sin memorias en Juno-6 |
| `behringer-pro800` | *(prophet-600 futuro)* | Clon del Sequential Prophet-600 |
| `yamaha-dx7` | `yamaha-dx7ii` | VCED compatible, DX7II tiene extensiones |

**Comportamiento UI cuando se intenta transferir entre modelos no compatibles:**

```
┌──────────────────────────────────────────────┐
│ ⚠ Incompatible Formats                       │
│                                               │
│ Cannot transfer patches between:              │
│                                               │
│   [CZ-101 thumb]  →  [MS2000 thumb]          │
│   Casio CZ-101       Korg MS2000              │
│                                               │
│ These synthesizers use different patch         │
│ formats and are not data-compatible.           │
│                                               │
│                              [OK]             │
└──────────────────────────────────────────────┘
```

---

## 10. Estructura de Proyecto Propuesta

```
D:\desarrollos\ABDSynths\ABDBankManager\
├── package.json                    ← Workspace root
├── README.md
├── DOCS/
│   ├── architecture.md             ← Este documento
│   ├── integration-guide.md        ← Guía de integración por proyecto
│   ├── format-spec-abdbank.md      ← Especificación del formato .abdbank
│   └── hardware-link-spec.md       ← Especificación de HardwareLink por fabricante
│
├── packages/
│   ├── core/                       ← @abdsynths/bank-manager-core
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── models/             ← Patch, Bank, Library types
│   │   │   ├── operations/         ← CRUD puras inmutables
│   │   │   ├── search/             ← Motor de búsqueda y filtrado
│   │   │   ├── persistence/        ← localStorage, IndexedDB, FileSystem
│   │   │   └── index.js
│   │   └── tests/
│   │       ├── operations.test.js
│   │       ├── search.test.js
│   │       └── persistence.test.js
│   │
│   ├── contracts/                  ← @abdsynths/bank-manager-contracts
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── Registry.js         ← ContractRegistry (registro + consulta + validación)
│   │   │   ├── ModelContract.js    ← Interface + validador
│   │   │   ├── ImportAdapter.js    ← Interface base
│   │   │   ├── ExportAdapter.js    ← Interface base
│   │   │   └── HardwareLinkContract.js
│   │   └── tests/
│   │
│   ├── adapters/                   ← @abdsynths/bank-manager-adapters
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.js            ← registerAllContracts(): bundle completo (standalone)
│   │   │   ├── models/             ← ModelContract implementations
│   │   │   │   ├── casio-cz.js
│   │   │   │   ├── roland-juno.js
│   │   │   │   ├── korg-ms2000.js
│   │   │   │   └── behringer-dm12.js
│   │   │   ├── importers/          ← ImportAdapter implementations
│   │   │   │   ├── sysex-casio-cz.js
│   │   │   │   ├── sysex-roland-juno.js
│   │   │   │   ├── sysex-korg-ms2000.js
│   │   │   │   ├── sysex-behringer-dm12.js
│   │   │   │   ├── tape-roland-juno.js
│   │   │   │   ├── midi-generic.js
│   │   │   │   └── json-abd-native.js
│   │   │   ├── exporters/          ← ExportAdapter implementations
│   │   │   │   ├── export-abdbank.js
│   │   │   │   ├── export-sysex.js
│   │   │   │   ├── export-json.js
│   │   │   │   └── export-csv.js
│   │   │   └── hardware/           ← HardwareLinkContract implementations
│   │   │       ├── hw-casio-cz.js
│   │   │       ├── hw-roland-juno.js
│   │   │       ├── hw-korg-ms2000.js
│   │   │       └── hw-behringer-dm12.js
│   │   └── tests/
│   │       ├── casio-cz.test.js
│   │       ├── roland-juno.test.js
│   │       ├── korg-ms2000.test.js
│   │       └── behringer-dm12.test.js
│   │
│   └── ui/                         ← @abdsynths/bank-manager-ui
│       ├── package.json
│       ├── src/
│       │   ├── components/
│       │   │   ├── BankManagerModal.js    ← Componente principal (dual-panel)
│       │   │   ├── PatchList.js           ← Lista de patches con virtualización
│       │   │   ├── BankSelector.js        ← Dropdown/tabs de bancos
│       │   │   ├── SearchBar.js           ← Búsqueda + chips de categoría
│       │   │   ├── ContextMenu.js         ← Menú contextual universal
│       │   │   ├── PatchMetadataEditor.js ← Editor de nombre/categoría/tags
│       │   │   ├── HardwareLinkPanel.js   ← Fetch/Dump controls
│       │   │   └── ImportExportBar.js     ← Botones import/export
│       │   ├── styles/
│       │   │   └── bankManager.css        ← CSS independiente de tema
│       │   └── index.js
│       └── tests/
│
├── apps/
│   └── standalone/                 ← App autónoma (Electron o Vite SPA)
│       ├── package.json
│       ├── src/
│       │   ├── App.js              ← Shell con árbol de modelos + librería global
│       │   ├── MidiManager.js      ← Web MIDI API para hardware link
│       │   └── GlobalLibrary.js    ← IndexedDB persistence
│       └── index.html
│
├── cpp/                            ← Componente C++ para JUCE plugins
│   ├── ABDBankManagerCore.h        ← C++ wrapper que serializa la librería a/desde ValueTree
│   ├── ABDBankManagerCore.cpp
│   └── CMakeLists.txt              ← Para incluir como subdirectory en cada plugin
│
└── scripts/
    ├── migrate-abdcz101.js         ← Migra bankLibrary.js de ABDCZ101 al nuevo formato
    ├── migrate-abdeep.js           ← Migra bank-manager.js de ABDEep al nuevo formato
    └── migrate-junio601.js         ← Migra PresetManager de ABDJUNiO601
```

---

## 10. Mapa de Migración desde Proyectos Existentes

### 10.1 ABDCZ101

| Componente actual | Se reemplaza por | Notas |
|---|---|---|
| `contracts/bankLibrary.js` | `@abdsynths/bank-manager-core` | El modelado de BANK_MODELS, createBank, CRUD inmutable migra al core |
| `contracts/bankManager.js` | `@abdsynths/bank-manager-core/operations` | buildBankMenu, movePreset, deletePreset, renamePreset |
| `contracts/syxNames.js` | `@abdsynths/bank-manager-adapters/importers/sysex-casio-cz.js` | Parseo SysEx Casio |
| `contracts/factoryBankNames.js` | Factory bank data dentro del adapter Casio CZ | Nombres hardcoded → JSON en resources |
| `contracts/cz5000Banks.js` | Adapter Casio CZ con modo CZ-5000 | `detectBankModel()` → ModelContract |
| `ui/bankManager.js` | `@abdsynths/bank-manager-ui` + contrato `casio-cz` | El componente UI se vuelve genérico |
| `styles/bankManager.css` | `@abdsynths/bank-manager-ui/styles` | CSS genérico con variables de tema |
| `Source/State/BankManager.cpp` | `cpp/ABDBankManagerCore.cpp` | C++ genérico |

### 10.2 ABDEep

| Componente actual | Se reemplaza por | Notas |
|---|---|---|
| `components/bank-manager.js` (HTML inline) | `@abdsynths/bank-manager-ui` | El dual-panel hardware/local se convierte en el diseño estándar |
| `Source/Core/BankFileReader.h/cpp` | `@abdsynths/bank-manager-adapters/importers/sysex-behringer-dm12.js` | Parseo SysEx DeepMind |
| `Source/Core/PresetManager.h` | `cpp/ABDBankManagerCore.h` + ModelContract | La persistencia en Documents/ABDEep/Presets migra |

### 10.3 ABDJUNiO601

| Componente actual | Se reemplaza por | Notas |
|---|---|---|
| `Source/Core/BaseClass/PresetManagerBase.h` | `cpp/ABDBankManagerCore.h` | La base class `ABD::PresetManagerBase` se generaliza |
| `Source/Core/PresetManager.h/cpp` | ModelContract `roland-juno106` + Core | `loadTape`, `importPresetsFromFile` → adapters |
| `Source/Core/Importers/JunoSysexImporter.h/cpp` | `adapters/importers/sysex-roland-juno.js` | |
| `Source/Core/JunoSysExEngine.h/cpp` | `adapters/hardware/hw-roland-juno.js` | Dump/fetch bidireccional |

---

## 11. Compatibilidad con Temas WebView2

El componente UI utiliza **CSS custom properties** para adaptarse al tema de cada sintetizador:

```css
/* bankManager.css — Variables que cada proyecto sobreescribe */
:root {
  --bm-bg-surface: var(--bg-surface, #1a1a2e);
  --bm-bg-panel: var(--bg-panel, #0f0f23);
  --bm-border: var(--border-light, #2a2a4a);
  --bm-accent: var(--color-accent, #00ffcc);
  --bm-accent-hover: var(--color-accent-hover, #33ffd6);
  --bm-text-primary: var(--text-primary, #e0e0e0);
  --bm-text-secondary: var(--text-secondary, #888);
  --bm-font: var(--font-mono, 'Share Tech Mono', monospace);
  --bm-radius: var(--radius-md, 8px);
  --bm-row-height: 32px;
  --bm-selected-bg: rgba(var(--bm-accent-rgb, 0,255,204), 0.18);
}
```

Cada proyecto solo necesita definir sus variables CSS de tema. El Bank Manager hereda automáticamente la estética del sintetizador host.

---

## 13. Plan de Implementación (Fases)

### Fase 1: Core + Contratos (Semana 1-2)
- [ ] Crear proyecto `ABDBankManager` con workspace monorepo
- [ ] Implementar `@abdsynths/bank-manager-core` (modelos, CRUD, búsqueda)
- [ ] Implementar `@abdsynths/bank-manager-contracts` (interfaces)
- [ ] Implementar `ContractRegistry` (registro declarativo + consulta + validación Zod + auto-configuración standalone/plugin)
- [ ] Tests unitarios al 100% del core
- [ ] Especificación formal del formato `.abdbank`

### Fase 2: Adapters para Proyectos Existentes (Semana 3-4)
- [ ] Adapter Casio CZ (importar desde ABDCZ101)
- [ ] Adapter Roland Juno (importar desde ABDJUNiO601)
- [ ] Adapter Korg MS2000 (importar desde ABDMS2000)
- [ ] Adapter Behringer DeepMind (importar desde ABDEep)
- [ ] Adapter Yamaha DX7
- [ ] Adapter Korg Prophecy
- [ ] Adapter Behringer Pro-800
- [ ] Export adapter `.abdbank`
- [ ] Tests de roundtrip (import → export → reimport) por formato

### Fase 3: UI Component (Semana 5-6)
- [ ] Componente `BankManagerModal` genérico
- [ ] Integración con ABDMS2000 como primer proyecto piloto
- [ ] CSS theming con variables
- [ ] Context menu, drag & drop ficheros, búsqueda
- [ ] Paste SysEx (Ctrl+V) + drag & drop de texto hex
- [ ] Diálogo de confirmación con detección automática de modelo
- [ ] Hardware thumbnails en árbol y cards
- [ ] Compatibilidad cross-model con bloqueo visual

### Fase 4: Hardware Link (Semana 7-8)
- [ ] Web MIDI API integration
- [ ] HardwareLink para Korg MS2000 (dump/fetch)
- [ ] HardwareLink para Behringer DeepMind
- [ ] HardwareLink para Roland Juno-106
- [ ] HardwareLink para Casio CZ
- [ ] HardwareLink para Yamaha DX7
- [ ] HardwareLink para Korg Prophecy
- [ ] HardwareLink para Behringer Pro-800

### Fase 5: App Standalone + Web (Semana 9-10)
- [ ] Shell Tauri para versión desktop standalone
- [ ] SPA web equivalente (Vite) desplegable en servidor
- [ ] IndexedDB para librería global (ambas versiones)
- [ ] Import/Export de todos los formatos
- [ ] MIDI device management (Web MIDI API)
- [ ] Preparar la arquitectura para futuros permisos de usuario (sin implementar aún)

### Fase 6: Migración y C++ (Semana 11-12)
- [ ] `ABDBankManagerCore.h/cpp` para JUCE plugins (CMake `add_subdirectory()`)
- [ ] Script `.bat` de compilación con fallback copy de última versión
- [ ] Migración ABDCZ101 → nuevo sistema
- [ ] Migración ABDJUNiO601 → nuevo sistema
- [ ] Migración ABDEep → nuevo sistema
- [ ] Migración ABDMS2000 → nuevo sistema
- [ ] Recopilar thumbnails de hardware para todos los modelos

---

## 14. Decisiones Resueltas

| # | Pregunta | Decisión | Notas |
|---|---|---|---|
| 1 | **¿Monorepo o paquetes NPM?** | **Monorepo con symlinks** | `npm workspaces` en `ABDBankManager/`, cada proyecto ABD enlaza los paquetes vía symlink. Sin publicación en registry. |
| 2 | **¿Electron, Tauri o SPA?** | **Tauri (desktop) + SPA web (Vite)** | Tauri para la versión standalone (acceso a filesystem nativo, ~5MB vs ~150MB Electron). SPA web equivalente desplegable en servidor para acceso sin instalación. Ambas comparten el 100% del código JS/UI. |
| 3 | **¿C++ compartido o copiado?** | **CMake `add_subdirectory()` con fallback** | Cada proyecto JUCE incluye `ABDBankManager/cpp/` como subdirectorio CMake vía path relativo (o symlink). Si no es posible, el script `.bat` de compilación de cada proyecto copia la última versión del módulo C++ antes de compilar, evitando forks. |
| 4 | **¿Sintetizadores adicionales?** | **DX7, Korg Prophecy, Behringer Pro-800** | Contratos diseñados con suficiente generalidad. Cada hardware lleva un **thumbnail** (foto real ~200×120px) para identificación visual. |
| 5 | **¿Audición de patches?** | **No** | Solo presentación, organización y almacenaje. Sin motor de audio. |
| 6 | **¿Permisos de usuario?** | **No de momento, pero preparar la arquitectura** | La librería incluirá un campo `userId` opcional en el schema. No se implementan roles ni login en esta versión, pero el modelo no debe impedir añadirlos en el futuro. |
| 7 | **¿Versión web vs standalone?** | **Ambas** | Standalone (Tauri) para gestión offline con acceso total a filesystem. Web (SPA) para acceso ligero desde cualquier navegador. La librería se persiste en IndexedDB (web) o SQLite/JSON local (Tauri). |

---

## 15. Documentación Requerida

Al implementar cada fase, se debe generar y mantener:

| Documento | Ubicación | Contenido |
|---|---|---|
| `README.md` | Raíz del monorepo | Visión general, quick start, dependencias |
| `DOCS/architecture.md` | `DOCS/` | Este documento (versión actualizada) |
| `DOCS/integration-guide.md` | `DOCS/` | Paso a paso para integrar en un proyecto JUCE existente |
| `DOCS/format-spec-abdbank.md` | `DOCS/` | Especificación formal del formato `.abdbank` |
| `DOCS/hardware-link-spec.md` | `DOCS/` | Protocolo MIDI por fabricante (timing, framing, edge cases) |
| `DOCS/model-contracts.md` | `DOCS/` | Referencia de todos los ModelContract registrados |
| `DOCS/migration-guide.md` | `DOCS/` | Instrucciones de migración desde cada proyecto legacy |
| `CHANGELOG.md` | Raíz | Historial de cambios por versión |
