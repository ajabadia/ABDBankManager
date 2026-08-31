# Changelog

All notable changes to ABD Universal Bank Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Bridge JUCE ValueTree + IPC (P2.1)**: `BankManagerCore` ahora persiste una `Library` completa con bancos, patches, metadatos, tags, parámetros y `rawData` Base64 en un `ValueTree` versionado (schema v1). `BankManagerWebViewAdapter` traduce JSON `{ action, data }` entre el host y el core mediante callbacks, sin dependencia de WebView2. El IPC soporta `getState`, `requestState`, `setState`, `selectPreset` y `updateMetadata`; las pruebas C++ se ejecutan por CTest. La conexión con la WebView concreta de cada plugin sigue pendiente.
- **Core inmutable de operaciones (P1.1)**: `packages/core/src/operations/library.js` con las 12 operaciones puras e inmutables de §5.2 (`addBank`, `removeBank`, `renameBank`, `duplicateBank`, `mergeBank`, `addPatch`, `removePatch`, `movePatch`, `renamePatch`, `updatePatchMetadata`, `copyPatchBetweenBanks`, `movePatchBetweenBanks`) sobre una `Library` (`{ banks: Bank[] }`). Ninguna muta sus entradas — devuelven una librería nueva preservando los campos extra — y queda garantizado undo/redo y las mismas reglas para WebUI, core, restore, import/export y el bridge C++. Incluye las invitariantes de dominio: `isFactory` inmutable (`assertBankEditable`, con las preferencias `isFavorite`/`notes` como única excepción), capacidad (`maxPatches`), índices únicos, compatibilidad de `hardwareIds` entre bancos e ids globalmente únicos. Exportado desde `packages/core/src/index.js`. 49 tests unitarios (`library.test.js`), incluidos los de inmutabilidad con `deepFreeze` que prueban que ninguna operación muta sus entradas ni los objetos intactos.
- **Adaptador Library⇄Dexie (P1.1 criterio 3)**: nuevo módulo `WebUI/src/store/libraryAdapter.js` que conecta el modelo plano de Dexie (`banks` + `patches` tablas separadas) con el modelo anidado del core (`Library = { banks: [{...bank, patches: [...]}] }`). Incluye `loadLibrary()` / `persistLibrary(prev, next)` con diff basado en `modifiedDate` y escritura transaccional; wrappers de mutación que delegan en el core puro (`createBank`, `updateBank`, `deleteBank`, `createPatch`, `updatePatch`, `deletePatch`, `movePatch`, `importBank`). `persistence.js` reescrito para delegar todas las mutaciones en el adaptador, eliminando la duplicidad de reglas (`isFactory`, capacidad, conflictos de índice, compatibilidad de hardware). Re-exportados guards puros `assertBankEditable`/`assertBankHasCapacity` y códigos `ERR_*` desde el core. Artefacto generado `WebUI/src/contracts/gen/library.gen.js` vía `Scripts/build_core_web.js` (añadido a `npm run generate`).
- **Motor de búsqueda y filtrado puro (P1.2)**: nuevo módulo `packages/core/src/search/searchPatches.js` con `searchPatches(library, query)` y `getFilteredPatches(library, filters)` según la firma canónica de `DOCS/architecture.md` §5.2. Búsqueda full-text en name/author/tags/notes, filtros por modelId/category/favoritesOnly/minRating, ordenación por name/date/category/rating (asc/desc). 25 tests unitarios (`searchPatches.test.js`). Exportado desde `packages/core/src/index.js`. Puro, determinista, sin dependencias.
- **Persistencia unificada (P1.3)**: reescritura completa de `packages/core/src/PersistenceEngine.ts` como implementación única (`UnifiedDexiePersistence`) que unifica Dexie v4 (banks, patches, history, tags M:N), migraciones v1→v4 con purga atómica de `settings`, auto-backup pre-migración, y backup/restore `.abdlibrary` con validación Zod (`BackupManifestSchema`). Mutaciones delegan en core puro (`library.js`: addBank, removeBank, renameBank, addPatch, removePatch, movePatch, updatePatchMetadata, movePatchBetweenBanks). `WebUI/src/store/persistence.js` y `WebUI/src/store/libraryAdapter.js` usan esta implementación — **una sola fuente de verdad** para persistencia. 11 tests de backup/restore + 14 tests de enforcement + migraciones v1→v4 en `fake-indexeddb`.
- **Búsqueda integrada en la WebUI (P1.6)**: input de búsqueda en la sección "Patches" del sidebar conectado a `getFilteredPatches` del core puro (`packages/core/src/search/searchPatches.js`). Búsqueda full-text en tiempo real sobre name/author/tags/notes del banco activo. 0 líneas de lógica de búsqueda duplicada en la UI.
- **ContractRegistry expuesto a la WebUI (P1.4)**: artefacto `WebUI/src/contracts/gen/contractRegistry.gen.js` generado sin Zod, con descriptores de los 5 ImportAdapters, 5 ExportAdapters y 5 HardwareLinks únicos por modelo. Expone `contractRegistryData` con `mode`, `issues`, `hardwareLinks`, `importAdapters`, `exportAdapters`, `registeredModelIds` y `modelMetadata`. Reexportado desde `WebUI/src/contracts/modelContracts.js`.
- **Model Selector con auto-configuración (P1.4 criterio 2)**: nuevo componente `WebUI/src/ui/components/modelSelector.js` reutilizable con filtro por fabricante, búsqueda por nombre, y panel de auto-configuración que muestra MIDI settings, capacidad, categorías y modelos compatibles. Integrado en modal "Nuevo Banco" para permitir elegir modelo al crear bancos. Exporta `renderModelSelector`, `initModelSelector`, `getSelectedModelId`, `setSelectedModelId`, `resetFilter`. CSS en `index.html`.
- **WebUI offline/autocontenida (P1.6)**: dependencias (dexie, jszip, file-saver) empaquetadas con Vite (`build:webui`), importmap CDN eliminado. `vite.config.js` actualizado con `rollupOptions.input`. `index.html` sin importmap, fuentes Google Fonts únicas externas. Build genera `dist/webui/` (~361 kB JS, 35 kB HTML, 5.5 kB gzip). `npm run generate` actualizado sin paso `build_webui.js` obsoleto.
- **Tests de roundtrip byte-idéntico para 3 fabricantes (P1.7)**: nuevos tests de fixture real para **Casio CZ** (4 modelos, 17 tests), **Roland Juno** (4 modelos, 17 tests) y **Korg MS2000/microKORG/Prophecy** (3 modelos, 13 tests). Verifican roundtrip byte-idéntico: `parsePatchSysEx(buildPatchSysEx(rawData)) === rawData`. Corregidos tamaños de patch en contratos (`patchDataSize`: CZ-1=288, MS2000/microKORG=288, Prophecy=256) y uso de `this.patchDataSize` en implementaciones.
- **Fixtures SysEx reales para 3 fabricantes (P1.7)**: generados bancos de fábrica válidos para **Casio CZ** (4 modelos, 7 bancos), **Roland Juno** (4 modelos, 8 bancos) y **Korg MS2000/microKORG/Prophecy** (3 modelos, 24 bancos) en `fixtures/sysex/`. Cada archivo `.syx` contiene un banco completo (16/64 patches) con SysEx válido generado vía `contract.buildPatchSysEx()`. Incluyen READMEs con metadatos de formato, modelo y generación. Sin restricciones de licencia (generados sintéticamente desde contrato canónico).
- **Standalone Tauri estructura (P2.2)**: proyecto Tauri 2 creado en `apps/standalone/src-tauri/` con `Cargo.toml`, `tauri.conf.json`, backend Rust (`main.rs`, `lib.rs`, `commands.rs`), comandos para librería/bancos/MIDI/SysEx, `tauri.conf.json` con permisos fs/dialog/clipboard/shell. `build.rs` para Tauri build. Icono SVG base. `Cargo.toml` con Tauri 2 plugins (fs, dialog, clipboard, shell).
- **MIDI support en Tauri (P2.2)**: `midir` crate añadido, comandos `get_midi_ports`, `open_midi_port`, `close_midi_port`, `send_sysex`, `request_sysex_dump` implementados con builders para Pro-800, DM12, DX7.
- **Seguridad (P2.3)**: `importEngine.js` reforzado con límites de tamaño (ZIP 50MB, archivo 10MB, patch 1MB), validación de manifest contra schema, prevención zip-slip via `isSafePath()`, sanitización de strings con `sanitizeString()`, CSP añadido a `index.html` (`default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; ...`), `vite` actualizado a 8.2.2 (fix CVE).
- **Panel "Datos SysEx" en el detalle de patch**: vista hexadecimal (offset + hex + ASCII) del blob decodificado y del mensaje completo `F0…F7` reconstruido vía `contract.buildPatchSysEx`, con toggle Blob/Mensaje, botón copiar hex (portapapeles con fallback) y descarga del mensaje como `.syx`. Utilidades puras testeadas contra el dump real v1.4.4 (`WebUI/src/core/hexDump.js`, `patchSysEx.js`); la reconstrucción reproduce byte-a-byte el mensaje real de 210 bytes.
- **Formato `.abdlibrary`** (nuevo, dedicado a exportar/importar **toda la librería**): ZIP con manifest `format: "abdlibrary"` y `banks[]` (blobs en `banks/NN/patch_MMM.bin` por banco). Botón "Exportar Librería" lo genera; el import (`importLibrary`) reimporta todos los bancos. El `.abdbank` queda reservado a **un banco** (v1/v2 monobanco); un `.abdbank` con `banks[]` (v3 legado) se sigue importando por retrocompatibilidad. Esquema nuevo `schemas/library-file.schema.v1.json`; `exportLibraryToFile`/`buildLibraryZip` en `exportEngine.js`, refactor del import con helpers `readAbdzip`/`parseBankEntry`; arreglado de paso el `JSZip.loadAsync(file)` que fallaba en Node (ahora lee `arrayBuffer()` explícito)
- **Renombrado masivo con plantilla**: multi-selección de patches (checkbox en la lista) + modal de plantilla con placeholders `{name} {index} {address} {model} {bank}` (ej. "BRASS {address}" → "BRASS A1"), validación anti-duplicados y vista previa (`WebUI/src/core/patchBulk.js`). El ámbito cubre **selección, banco activo o toda la librería**: cada patch resuelve el contrato y el nombre de su propio banco (un CZ y un MS2000 reciben su dirección correcta), con plantilla por defecto `{bank} {address}` en modo librería
- **Exportar/Importar nombres CSV**: exporta todos los patches (bankId, bankName, index, name, address) a CSV para editarlos fuera, e importa el CSV renombrando por (bankId, index) con informe de ignorados; parsing CSV con comillas escapadas (`WebUI/src/core/patchBulk.js`). La cabecera de import es tolerante: columnas por nombre en cualquier orden, extra ignoradas, solo se exigen `bankId`, `index`, `name` (para CSVs generados/editados fuera, p. ej. Excel), con tolerancia a BOM UTF-8 y mayúsculas
- **Nombres de patch**: el parser ya extraía `extractPatchName` vía contrato (MS2000 @0x1C, DM12 @0x01, DX7 @0x09); ahora, cuando el formato no tiene nombre (CZ/Juno) o el nombre viene vacío, se genera un **placeholder único** con el addressing del contrato (`generatePatchName()` → "Casio CZ-101 A1") en importSyx/importAbdbank/importJson, y la UI avisa cuando se generan placeholders (editable a mano en el panel del patch)
- **ContractRegistry** (`Source/Contracts/ContractRegistry.ts`, diseño §4.5): registro declarativo de ModelContracts/ImportAdapters/ExportAdapters/HardwareLinks con validación (modelId/adapterId duplicados y HardwareLink sin modelo → error; `targetModelIds` huérfanos → warning), consultas filtradas por modelo, `getCoverage()` por modelo, modo `standalone`/`plugin` derivado y `createStandaloneRegistry()` con 17 modelos, 5 ImportAdapters, 5 ExportAdapters y 5 HardwareLinks únicos. Exportado desde `@contracts` y del wrapper de la WebUI
- **Asociación multi-hardware** `hardwareIds` (canónico + compatibles, derivado de `compatibleModels`): helper `getHardwareIds()` en el index de modelos, campo en Patch/Bank (factories puros, store Dexie, schemas Zod y manifest `.abdbank`), integrado en importEngine/exportEngine de la WebUI y en PersistenceEngine (import + backup)
- `parameters` marcado como **RESERVADO para plugins/editores** en las interfaces de contratos y schemas Zod (el gestor nunca lo usa ni lo muestra — principio de asepsia)
- **Backend Rust compila y lanza (P2.2)**: `commands.rs` con los 13 comandos (get_app_data_dir, list_banks, create_bank, delete_bank, import_bank/export_bank/import_sys_ex/export_sys_ex —stubs—, get_midi_ports, open/close_midi_port, send_sysex, request_sysex_dump) públicos para `tauri::generate_handler!`; `database.rs` (rusqlite, migraciones v1-v4, `with_conn(&mut Connection)` para transacciones, mapeo de errores de `create_dir_all`); `lib.rs` con patrón `pub fn run()` estándar Tauri v2 y estado `Database` directo (sin `Arc`). `cargo build`/`cargo check` limpios (0 errores; warnings solo de camelCase intencional y structs reservados).
- **Configuración Tauri v2 corregida (P2.2)**: eliminado el bloque `plugins` v1 inválido (`fs.scope` no existe en v2 — el panic `PluginInitialization` impedía lanzar; permisos ahora via `capabilities/default.json` con `core:default` + dialog/fs/clipboard/shell). Añadido `frontendDist` (obliga a `build:webui` → `dist/webui`) y `beforeBuildCommand` corregido a `pnpm --dir ../../.. build:webui` (el anterior `pnpm build --prefix` recurlía en `tauri build`).
- **WebUI sin 404 en el shell Tauri (P1.6/P2.2)**: corregidas las rutas de `publicDir` en `index.html` — con `publicDir='vendor'` Vite sirve los assets en la raíz, así que `./vendor/jszip/...` → `./jszip/...`, `./vendor/file-saver/...` → `./file-saver/...`, e importmap `dexie`/`jszip`/`file-saver` sin el prefijo `vendor/`. Eliminados los warnings de Vite y los 404 reales de jszip/FileSaver en dev y build.
- `pnpm tauri dev` verificado: VITE ready en :1420 + `ABD Bank Manager started` + WebUI renderizada (selector de fabricantes, búsqueda) sin errores de consola. `pnpm tauri build` (release/instalador) pendiente.
- **Puente WebUI↔Tauri con persistencia SQLite real (P2.2)**: `database.rs` con `load_library`/`save_library` — roundtrip de la librería completa preservando IDs y `rawData` (struct `LibraryBank` con `patches` serializables, ya que `Bank.patches` es `#[serde(skip)]`), registrados como comandos en `lib.rs`; facade Dexie-compatible en `WebUI/src/store/backend.js` (`TauriFacade` con `Collection`/`WhereClause`/`TauriTable`, persistencia solo de `banks`/`patches`, `tags`/`patchTags`/`history` en memoria de sesión por diseño) conectada a `persistence.js`/`libraryAdapter.js` vía `getDb()`/`setDexieDb()` con lazy-Proxy para el orden de evaluación ESM y guard `isTauri()` en `runPreMigrationBackup`. `tauriMidi.js` expone los helpers MIDI (`getMidiPorts/openMidiPort/closeMidiPort/sendSysex/requestSysexDump`). Tests: roundtrip Rust (`save_and_load_library_roundtrip_preserves_ids_and_raw_data`), 9 tests de la facade en `tauriBackendBridge.test.js` (incluye fix de `_ensureLoaded` en `Collection` — un facade fresco leía `[]` y podía borrar sin datos — y aserción del payload `save_library` con `rawData` como array plano). Suite: 467 passed / 9 fallos preexistentes (fixtures ajenos al repo), 0 nuevas regresiones. E2E: la app standalone crea `%APPDATA%\ABDBankManager\abd_bank_manager.db` con las migraciones.
- **Import/Export de bancos y SysEx en standalone (P2.2)**: 4 comandos Tauri implementados en `commands.rs`: `import_bank` (lee `.abdbank`/`.abdlibrary`/`.json`/`.syx`, parsea manifest/ZIP/SysEx, crea banco+patches en SQLite), `export_bank` (carga banco+patches, escribe `.abdbank` ZIP o `.json`), `import_sys_ex` (divide mensajes F0...F7, identifica fabricante Behringer/Yamaha/Roland/Korg, crea banco), `export_sys_ex` (concatena rawData de patches como SysEx). Añadido crate `zip` para ZIP; `split_sysex_messages`/`identify_sysex_model` para parsing SysEx. Tests: `cargo test --lib` verde, suite WebUI 476 passed / 5 preexistentes.
- **Vista multi-modelo árbol (P0.5) + Ctrl+V/Drag&Drop SysEx (P2.2)**: toggle `treeViewMode` en sidebar muestra todos los fabricantes expandidos con modelos + thumbnails; `handlePasteHex()` (Ctrl+V) parsea hex del portapapeles → importa como SysEx; drop zone en main content acepta drag & drop de `.syx`, `.abdbank`, `.abdlibrary`, `.json` vía `importFile`/`importBank`. Tests: suite WebUI 477 passed.
- WASM AudioWorklet build target (planned)

### Fixed
- **`Collection` de la facade Tauri leía `[]` en un facade fresco**: `matches()` filtraba `rows(key)` sin esperar a `_ensureLoaded()`, de modo que la primera lectura sobre un `new TauriFacade()` (p. ej. tras la transacción de un facade distinto) devolvía vacío y `delete()` podía borrar sin datos. Ahora `filtered()`/`delete()` hacen `await _ensureLoaded()` antes de filtrar (`WebUI/src/store/backend.js`).
- **`domainValidation` crash al crear/editar patches sin `originAddress`**: `validatePatchAgainstContract` llamaba `contract.parseProgramAddress(undefined)` (TypeError) cuando había `index` pero no dirección de origen — afectaba a las rutas `createPatch`/`updatePatch` con datos crudos importados, p. ej. "Fetch Pro-800". Ahora la validación de dirección solo se ejecuta cuando `originAddress` está presente
- **Auto-backup antes de migración**: `backupBeforeMigration` existía pero **nunca se invocaba** (la clase `BankManagerDB` solo arrancaba Dexie, sin hook de migración). Ahora `runPreMigrationBackup()` se ejecuta al inicio de la app y genera un JSON identificado (`format: "abdlibrary-json"`, `schemaVersion`, `sourceVersion`) antes de cualquier upgrade de esquema, con política clara: si el backup falla se loguea y **la migración continúa** (no se bloquea el arranque)

### Added

- **Backup robusto (P0.9)**:
  - Los manifests `.abdlibrary` ahora registran `schemaVersion` (versión de esquema Dexie) y `restoreFromBackup` **rechaza backups de una app más nueva** (forward-compat guard).
  - Auto-backup pre-migración real en la app: `runPreMigrationBackup()` + helpers puros testeados `shouldBackupBeforeMigration`, `getInstalledDbVersion`, `buildMigrationBackupPayload`, `downloadJsonBackup` (`WebUI/src/store/persistence.js`).
  - Tests de integración sobre `fake-indexeddb` (nueva devDependency): arranque en frío a v4, cadena `v1→v4` conservando datos y purgando físicamente el store `settings`, y **rollback atómico** (una migración que falla deja la base en su versión original sin pérdida). Backup vacío, corrupto y parcialmente corrupto rechazados sin escrituras parciales en el core (`packages/core/tests/persistence.test.js`).

### Changed
- Documentación corregida para reflejar el estado real: adapters por fabricante, HardwareLink, core de funciones puras y serialización C++ a ValueTree/IPC distinguen implementación del core frente a integración de host (README, ROADMAP, HANDOFF)
- Contratos de modelos unificados: `WebUI/src/contracts/modelContracts.js` re-exporta el fuente canónico TS (15 modelos, incluido `korg-prophecy`); `packages/contracts/src` quedó como shim sin espejos `.ts`/`.js` duplicados; arreglado el import roto en `packages/core/src/PersistenceEngine.ts`.

### Added

- Configuración MIDI **derivada** (no editable): campo `midi` (`defaultChannel`/`defaultDeviceId`) en el `ModelContract` y helper `getMidiConfig(modelId)` que fusiona el contrato con `HARDWARE_QUEUE_CONFIGS` (canal, device ID, delay y timeout por hardware)

### Removed
- Del registro de parámetros (SSOT): parámetros de dispositivo sin relación con la gestión de bancos (Master Tune, Transpose, Velocity Curve, Pedal Polarity, LCD Contrast), grupo DSP Quality (VCF Oversampling, VCF Pole Mode) y finalmente los editables MIDI Channel/Device ID. El registro queda vacío: la configuración MIDI se deriva del `ModelContract.midi` + `HARDWARE_QUEUE_CONFIGS`. Regenerados `ParameterRegistry.gen.h/.cpp`, `registry.gen.js` y `parameter-registry.data.json`; `PANEL_DEFS` vacío hasta que los plugins definan sus parámetros de editor
- Panel de settings de la WebUI y el stack de editor del app (`createWidget`, `paramStore`, `bridge.setParam`) — el gestor de bancos no edita parámetros de sintetizador
- Tabla `settings` y funciones `getSetting`/`setSetting` de `WebUI/src/store/persistence.js` — no hay settings que persistir (la configuración MIDI se deriva del `ModelContract` + `HARDWARE_QUEUE_CONFIGS`). El esquema Dexie v4 activo ya no la declara

### Changed
- Alineada la versión de Dexie en el importmap de la web: `esm.sh/dexie@4.0.11` → **`4.4.5`** (la instalada en npm y el vendor local). jszip (3.10.1) y file-saver (2.0.5) ya coincidían. Verificado en Chrome headless: la web carga Dexie 4.4.5 sin excepciones
- Documentación (diseño §4.1/§5.1 + ROADMAP): **bancos de fábrica vs. usuario** — `isFactory` documentado como banco inmutable por el plugin (read-only: audición y copia a banco de usuario, sin renombrar/reordenar/sobrescribir), `isFactory=false` = banco de usuario 100% editable, flag inmutable en runtime (clonar, no convertir). **Capacidad por modelo en el contrato**: `ModelContract.programsPerBank` es el **máximo de patches por banco** (lo define el contrato, no el usuario) y el core/UI deben validarlo al añadir patches. Marcado como desarrollo a futuro en ROADMAP
- `packages/core/src/MidiSysExQueue.ts` convertido en shim → fuente canónica `Source/Core/MidiSysExQueue.ts` (último mirror duplicado de `packages/core/src`, mismo patrón que validationSchemas)
- `packages/core/src/validationSchemas.ts` convertido en shim → fuente canónica `Source/Core/validationSchemas.ts` (se elimina el mirror duplicado, patrón de unificación de contratos)
- Diseño: formalizado el **principio de asepsia** (DOCS/architecture.md §5): el gestor es un contenedor neutro de blobs opacos que no interpreta patches — los pasa al hardware/plugin; el conocimiento de *formato* vive en los contratos y la *semántica* en los editores de los plugins. `parameters` queda como campo **reservado para plugins/editores** y se añade la asociación multi-hardware `hardwareIds: string[]` (canónico + compatibles, derivado de `compatibleModels`) a `Patch`, `Bank`, `PatchData` y al manifest `.abdbank`; validación de `.abdbank` en plugin por intersección de scope
- Diseño: añadida la abstracción **`ContractRegistry`** (DOCS/architecture.md §4.5, mirror en implementation_plan.md) — registro declarativo de ModelContracts/ImportAdapters/ExportAdapters/HardwareLinks que el core consulta para auto-configurarse. La naturaleza standalone vs plugin la determina el conjunto de contratos registrados (standalone = bundle completo, plugin = solo su contrato + compatibles), sin modos ni flags. Incluye reglas de validación (Zod), tabla de auto-configuración derivada y actualización del diagrama de capas (§3), §7.1, estructura de proyecto (§10) y Fase 1 del plan
- Migración Dexie **v4**: purga del object store `settings` legado (v1/v2). Se declara `settings: null` (forma canónica de Dexie 4 para eliminar tablas — omitirlas no basta, el esquema final es la unión de todas las versiones) más un upgrade explícito `purgeLegacySettingsStore(tx)` como garantía defensiva/documental. Resultado: `db.tables` ya no incluye `settings` y el store se purga del IndexedDB en el upgrade v3→v4

### Added

- **Enforcement de `isFactory` y `programsPerBank`** (diseño §5.1/§4.1): los bancos de fábrica son **inmutables** — `assertBankEditable()` en la capa de persistencia (`persistence.js`) bloquea `updateBank`, `deleteBank`, `createPatch`, `updatePatch` y `movePatch` sobre bancos factory; `isFavorite` y `notes` son excepciones (preferencias del usuario, no mutaciones del banco). `assertBankHasCapacity()` valida el límite en `createPatch(bankId, data, { maxPatches })`. La UI refleja esto: badge `🔒 Fábrica` en la lista de bancos, botones editar/borrar deshabilitados (`disabled + pointer-events:none`), campos del panel de patch en read-only. 14 tests unitarios (`bankEnforcement.test.js`): guard puro sin IndexedDB. Suite: **155 passing | 5 skipped**

### Fixed
- **`pack8to7` perdía datos con tamaños no múltiplos de 7**: el último grupo se emitía incompleto, así que `unpack7to8` (que solo lee grupos completos de 8) descartaba la cola — p. ej. 288 bytes de un MS2000 se desempaquetaban en 287 y el byte final se perdía en el import; además `verifyChecksum` exigía `packed.length % 8 === 0`, que el pack violaba. Ahora el último grupo se **rellena a 7 bytes con ceros** (longitud de salida siempre múltiplo de 8, como en el wire format real). Arreglado en la fuente canónica `Source/Contracts/Adapters/sysexUtils.ts` (usada por los adapters Korg y Behringer) y en la copia legada de `Source/Contracts/Models/korg-ms2000.ts`. `WebUI/tests/unit/sysexAdapterRoundtrip.test.js` pasó de duplicar el algoritmo a **importar el canónico** (`@contracts/Adapters/sysexUtils`), con nuevos tests de grupo parcial y de `% 8`; corregidos de paso dos off-by-one preexistentes del test (checksum Juno en índice 25/26 y longitud DX7 = 137) y la expectativa de empaquetado 331→336 en `sysexRoundtrip.test.js`. Suite completa: **141 passing | 5 skipped** (antes el archivo fallaba y se excluía)

## [0.1.0] - 2026-08-26

### Added

- **Phase 0**: Project initialization with mandatory docs (README, CHANGELOG, HANDOFF, ROADMAP)
- **Phase 1**: Parameter Registry as SSOT — JSON schema + generator (C++ headers, JS registry, data JSON)
- **Phase 2**: Contracts & Adapters:
  - ModelContract for 5 manufacturers (15 variants): Casio CZ (4), Roland Juno (4), Korg MS2000 (3), Behringer DM12/Pro-800, Yamaha DX7/DX7II
  - ImportAdapter/ExportAdapter/HardwareLinkContract base interfaces + abstract classes
  - Retrocompat wrapper for Guide §9.1 legacy format
  - Edit Buffer support for audition without overwrite
  - **Note:** Concrete adapter implementations (per-manufacturer importers/exporters/hardware links) are NOT yet implemented
- **Phase 3**: Core Library:
  - Patch/Bank factory functions (`createPatch`, `createBank`) in `packages/core/src/models/`
  - Dexie.js persistence with versioned migrations (v1→v4) in `WebUI/src/store/persistence.js`
  - Patch Fingerprinting (SHA-256) in `packages/core/src/operations/fingerprint.js`
  - Zod validation schemas in `Source/Core/validationSchemas.ts`
  - Tags M:N with junction table (patch_tags)
  - **Note:** BankStore/PatchStore/Searcher (immutable CRUD operations) are NOT yet implemented
- **Phase 4**: WebUI:
  - ParamStore (centralized UI state sync)
  - RotaryKnob component (drag, shift+fine, wheel, double-click reset)
  - Registry-driven widget factory (`createWidget()` in app.js)
  - Settings panel for hardware global parameters
  - SysEx parser with manufacturer/model identification via ModelContracts
- **Phase 6**: C++ Module:
  - ABDBankManagerCore static library with JUCE 8 integration
  - WebUI binary data embedding via juce_add_binary_data
  - JUCE 8 submodule at GITS/JUCE (depth=1)
  - **Note:** el bridge inicial guardaba solo índices; fue ampliado posteriormente en la auditoría de seguimiento del 2026-08-31
- **Tests**: 72 passing across 9 test suites (registry, panelFactory, Zod, SysEx concepts, MIDI queue, ModelContracts×2, fingerprint; persistence skipped)
- **CI Pipeline**: GitHub Actions workflow (schema-validation, registry-generation, vitest jobs)
- **Build System**: Visual Studio 2026 (v18) auto-detected, JUCE 8 via submodule

### Changed
- CMake now auto-detects Visual Studio generator (no hardcoded "Visual Studio 17 2022")
- Added `"type": "module"` to package.json for ES module support

### Fixed
- **WebUI atascada en "Inicializando..." sin botones funcionales**: `WebUI/src/contracts/modelContracts.js` re-exportaba los contratos directamente desde `Source/Contracts/*.ts`, pero la WebUI se sirve estática y el navegador no ejecuta TypeScript (además, `ContractRegistry` arrastraba Zod, que no está en el importmap) — el grafo de módulos entero fallaba al cargar. Se transpilan los contratos con esbuild a un bundle JS generado (`WebUI/src/contracts/gen/modelContracts.gen.js`, vía `Scripts/build_contracts_web.js`, parte de `npm run generate`) y el wrapper lo consume; `ContractRegistry` queda solo en el core/standalone (fuente TS), no en la web. Verificado en Chrome headless (status "Listo", creación de banco y botones OK)
- JUCE C language requirement in CMake (added `LANGUAGES CXX C`)
- JUCE target linking (juce_core, juce_data_structures, juce_cryptography from parent scope)

---

## [0.0.1] - 2026-08-25

### Added

- Initial project scaffold
- Universal Bank Manager architecture design
- ModelContract, ImportAdapter, ExportAdapter, HardwareLinkContract interfaces
- Native `.abdbank` format specification
- Integration map for ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000
- Research on KnobKraft Orm, Dexie.js, Zod, WebMidi.js
- 17 identified tasks for implementation

---

## Template for future entries

## [X.Y.Z] - YYYY-MM-DD

### Added

- Feature description

### Changed
- Refactored X to improve Y

### Fixed
- Bug description (issue #N)

### Removed
- Deprecated feature