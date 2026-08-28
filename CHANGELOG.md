# Changelog

All notable changes to ABD Universal Bank Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Panel "Datos SysEx" en el detalle de patch**: vista hexadecimal (offset + hex + ASCII) del blob decodificado y del mensaje completo `F0…F7` reconstruido vía `contract.buildPatchSysEx`, con toggle Blob/Mensaje, botón copiar hex (portapapeles con fallback) y descarga del mensaje como `.syx`. Utilidades puras testeadas contra el dump real v1.4.4 (`WebUI/src/core/hexDump.js`, `patchSysEx.js`); la reconstrucción reproduce byte-a-byte el mensaje real de 210 bytes.
- **Formato `.abdlibrary`** (nuevo, dedicado a exportar/importar **toda la librería**): ZIP con manifest `format: "abdlibrary"` y `banks[]` (blobs en `banks/NN/patch_MMM.bin` por banco). Botón "Exportar Librería" lo genera; el import (`importLibrary`) reimporta todos los bancos. El `.abdbank` queda reservado a **un banco** (v1/v2 monobanco); un `.abdbank` con `banks[]` (v3 legado) se sigue importando por retrocompatibilidad. Esquema nuevo `schemas/library-file.schema.v1.json`; `exportLibraryToFile`/`buildLibraryZip` en `exportEngine.js`, refactor del import con helpers `readAbdzip`/`parseBankEntry`; arreglado de paso el `JSZip.loadAsync(file)` que fallaba en Node (ahora lee `arrayBuffer()` explícito)
- **Renombrado masivo con plantilla**: multi-selección de patches (checkbox en la lista) + modal de plantilla con placeholders `{name} {index} {address} {model} {bank}` (ej. "BRASS {address}" → "BRASS A1"), validación anti-duplicados y vista previa (`WebUI/src/core/patchBulk.js`). El ámbito cubre **selección, banco activo o toda la librería**: cada patch resuelve el contrato y el nombre de su propio banco (un CZ y un MS2000 reciben su dirección correcta), con plantilla por defecto `{bank} {address}` en modo librería
- **Exportar/Importar nombres CSV**: exporta todos los patches (bankId, bankName, index, name, address) a CSV para editarlos fuera, e importa el CSV renombrando por (bankId, index) con informe de ignorados; parsing CSV con comillas escapadas (`WebUI/src/core/patchBulk.js`). La cabecera de import es tolerante: columnas por nombre en cualquier orden, extra ignoradas, solo se exigen `bankId`, `index`, `name` (para CSVs generados/editados fuera, p. ej. Excel), con tolerancia a BOM UTF-8 y mayúsculas
- **Nombres de patch**: el parser ya extraía `extractPatchName` vía contrato (MS2000 @0x1C, DM12 @0x01, DX7 @0x09); ahora, cuando el formato no tiene nombre (CZ/Juno) o el nombre viene vacío, se genera un **placeholder único** con el addressing del contrato (`generatePatchName()` → "Casio CZ-101 A1") en importSyx/importAbdbank/importJson, y la UI avisa cuando se generan placeholders (editable a mano en el panel del patch)
- **ContractRegistry** (`Source/Contracts/ContractRegistry.ts`, diseño §4.5): registro declarativo de ModelContracts/ImportAdapters/ExportAdapters/HardwareLinks con validación (modelId/adapterId duplicados y HardwareLink sin modelo → error; `targetModelIds` huérfanos → warning), consultas filtradas por modelo, modo `standalone`/`plugin` derivado y `createStandaloneRegistry()` con los 15 modelos. Exportado desde `@contracts` y del wrapper de la WebUI
- **Asociación multi-hardware** `hardwareIds` (canónico + compatibles, derivado de `compatibleModels`): helper `getHardwareIds()` en el index de modelos, campo en Patch/Bank (factories puros, store Dexie, schemas Zod y manifest `.abdbank`), integrado en importEngine/exportEngine de la WebUI y en PersistenceEngine (import + backup)
- `parameters` marcado como **RESERVADO para plugins/editores** en las interfaces de contratos y schemas Zod (el gestor nunca lo usa ni lo muestra — principio de asepsia)
- Tauri standalone app integration (in progress)
- WASM AudioWorklet build target (planned)

### Fixed
- **`domainValidation` crash al crear/editar patches sin `originAddress`**: `validatePatchAgainstContract` llamaba `contract.parseProgramAddress(undefined)` (TypeError) cuando había `index` pero no dirección de origen — afectaba a las rutas `createPatch`/`updatePatch` con datos crudos importados, p. ej. "Fetch Pro-800". Ahora la validación de dirección solo se ejecuta cuando `originAddress` está presente
- **Auto-backup antes de migración**: `backupBeforeMigration` existía pero **nunca se invocaba** (la clase `BankManagerDB` solo arrancaba Dexie, sin hook de migración). Ahora `runPreMigrationBackup()` se ejecuta al inicio de la app y genera un JSON identificado (`format: "abdlibrary-json"`, `schemaVersion`, `sourceVersion`) antes de cualquier upgrade de esquema, con política clara: si el backup falla se loguea y **la migración continúa** (no se bloquea el arranque)

### Added
- **Backup robusto (P0.9)**:
  - Los manifests `.abdlibrary` ahora registran `schemaVersion` (versión de esquema Dexie) y `restoreFromBackup` **rechaza backups de una app más nueva** (forward-compat guard).
  - Auto-backup pre-migración real en la app: `runPreMigrationBackup()` + helpers puros testeados `shouldBackupBeforeMigration`, `getInstalledDbVersion`, `buildMigrationBackupPayload`, `downloadJsonBackup` (`WebUI/src/store/persistence.js`).
  - Tests de integración sobre `fake-indexeddb` (nueva devDependency): arranque en frío a v4, cadena `v1→v4` conservando datos y purgando físicamente el store `settings`, y **rollback atómico** (una migración que falla deja la base en su versión original sin pérdida). Backup vacío, corrupto y parcialmente corrupto rechazados sin escrituras parciales en el core (`packages/core/tests/persistence.test.js`).

### Changed
- Documentación corregida para reflejar el estado real: adapters por fabricante, HardwareLink, core de funciones puras (BankStore/PatchStore/Searcher) y serialización C++ a ValueTree marcados como **pendientes/parciales** (README, ROADMAP, HANDOFF)
- Contratos de modelos unificados: `WebUI/src/contracts/modelContracts.js` re-exporta el fuente canónico TS (15 modelos, incluido `korg-prophecy`); `packages/contracts/src` quedó como shim sin espejos `.ts`/`.js` duplicados; arreglado el import roto en `packages/core/src/PersistenceEngine.ts`

### Added
- Configuración MIDI **derivada** (no editable): campo `midi` (`defaultChannel`/`defaultDeviceId`) en el `ModelContract` y helper `getMidiConfig(modelId)` que fusiona el contrato con `HARDWARE_QUEUE_CONFIGS` (canal, device ID, delay y timeout por hardware)

### Removed
- Del registro de parámetros (SSOT): parámetros de dispositivo sin relación con la gestión de bancos (Master Tune, Transpose, Velocity Curve, Pedal Polarity, LCD Contrast), grupo DSP Quality (VCF Oversampling, VCF Pole Mode) y finalmente los editables MIDI Channel/Device ID. El registro queda vacío: la configuración MIDI se deriva del `ModelContract.midi` + `HARDWARE_QUEUE_CONFIGS`. Regenerados `ParameterRegistry.gen.h/.cpp`, `registry.gen.js` y `parameter-registry.data.json`; `PANEL_DEFS` vacío hasta que los plugins definan sus parámetros de editor
- Panel de settings de la WebUI y el stack de editor del app (`createWidget`, `paramStore`, `bridge.setParam`) — el gestor de bancos no edita parámetros de sintetizador
- Tabla `settings` y funciones `getSetting`/`setSetting` de `WebUI/src/store/persistence.js` — no hay settings que persistir (la configuración MIDI se deriva del `ModelContract` + `HARDWARE_QUEUE_CONFIGS`). El esquema Dexie v3 activo ya no la declara

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
  - Dexie.js persistence with versioned migrations (v1→v3) in `WebUI/src/store/persistence.js`
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
  - **Note:** ValueTree saves only indices; bridge is no-op
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