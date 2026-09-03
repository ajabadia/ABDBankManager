# ABD Universal Bank Manager â€” Roadmap

## Status

| Phase | Description | Status |
|:---:|---|:---:|
| 0 | **Project Initialization & Documentation** | âœ… DONE |
| 1 | **Parameter Registry & Code Generation** | âœ… DONE |
| 2 | **Contracts & Adapters (Model, Import, Export, Hardware)** | ðŸ”„ PARTIAL â€” interfaces âœ…, adapters/links disponibles âœ…, cobertura universal y hardware fÃ­sico pendientes |
| 3 | **Core Library (BankStore, PatchStore, Searcher, Persistence)** | âœ… DONE â€” Dexie v1â†’v4 âœ…, CRUD puro inmutable âœ…, bÃºsqueda pura âœ…, auto-backup âœ… |
| 4 | **WebUI (panelFactory, ParamStore, Components)** | âœ… DONE |
| 5 | **Standalone App (Tauri + Vite)** | ðŸ”„ IN PROGRESS â€” SQLite + Rust CRUD + comandos MIDI |
| 6 | **C++ Module (ABDBankManagerCore for JUCE)** | ðŸ”„ PARTIAL â€” ValueTree + IPC callback âœ…, integraciÃ³n en plugins âŒ |
| 7 | **Integration & Migration (ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000)** | ðŸ”„ IN PROGRESS |
| 8 | **QA, Tests & Release** | â¸ PENDING |

> **ActualizaciÃ³n de estado (2026-08-31):** la fase 3 estÃ¡ **completada** (CRUD puro inmutable, bÃºsqueda pura, persistencia unificada, auto-backup). La fase 5 estÃ¡ **en progreso** (Tauri con SQLite e import/export base). La fase 6 sigue **parcial**: el core serializa `Library/Bank/Patch` en ValueTree v1 y el adaptador JSON expone IPC por callback; falta conectarlo a cada WebView/plugin real. La fase 2 registra 5 ImportAdapters, 5 ExportAdapters y 5 HardwareLinks Ãºnicos; la cobertura fÃ­sica y las variantes restantes siguen pendientes. Ver `HANDOFF.md` â†’ Known Issues / Blockers.

---

## Phase 0: Project Initialization & Documentation âœ…

- [x] Create mandatory docs: README.md, CHANGELOG.md, HANDOFF.md, ROADMAP.md
- [x] Document architecture in DOCS/architecture.md
- [x] Document implementation plan in DOCS/implementation_plan.md
- [x] Document research in DOCS/research.md
- [x] Initialize git repository with submodules (JUCE)
- [x] Create package.json with workspace config
- [x] Create root CMakeLists.txt
- [x] Create build.bat
- [x] Set up vitest.config.js
- [x] Configure .gitignore

### Definition of Done âœ…
- All 4 mandatory docs exist and are current
- Git repo initialized with JUCE submodule
- `npm install` works
- `build.bat` runs without errors

---

## Phase 1: Parameter Registry & Code Generation âœ…

- [x] Create `schemas/parameters-spec.schema.v1.json` with Bank Manager parameters
- [x] Create `schemas/program-dump.schema.v1.json`
- [x] Create `schemas/bank-file.schema.v1.json`
- [x] Create `schemas/bridge-messages.schema.v1.json`
- [x] Implement `Scripts/registry_core.js` â€” validation logic
- [x] Implement `Scripts/registry_generator.js` â€” generates:
  - `Source/State/ParameterRegistry.gen.h`
  - `Source/State/ParameterRegistry.gen.cpp`
  - `WebUI/src/contracts/registry.gen.js`
  - `schemas/parameter-registry.data.json`
- [x] Implement `Scripts/build_webui.js` â€” generates BuildVersion.h + buildVersion.js
- [x] Add `npm run generate` script
- [x] Add validation tests: no duplicate IDs, no duplicate CCs, auto-calculated sysex offsets

### Definition of Done âœ…
- `npm run generate` produces all 4 artifacts without errors
- Generated artifacts pass schema validation tests
- Registry is Single Source of Truth for all parameters

---

## Phase 2: Contracts & Adapters ðŸ”„ (parcial)

### 2.1 ModelContract Implementations âœ… (17 models)
- [x] `Source/Contracts/Models/casio-cz.ts` â€” CZ-101, CZ-1000, CZ-5000, CZ-1
- [x] `Source/Contracts/Models/roland-juno.ts` â€” Juno-106, Juno-60, Juno-6, HS-60
- [x] `Source/Contracts/Models/korg-ms2000.ts` â€” MS2000, microKORG, Prophecy
- [x] `Source/Contracts/Models/behringer-dm12.ts` â€” DeepMind 12
- [x] `Source/Contracts/Models/behringer-dm6.ts` â€” DeepMind 6
- [x] `Source/Contracts/Models/behringer-dm12d.ts` â€” DeepMind 12D
- [x] `Source/Contracts/Models/behringer-pro800.ts` â€” Pro-800
- [x] `Source/Contracts/Models/yamaha-dx7.ts` â€” DX7, DX7II
- [x] Retrocompat wrapper for Guide Â§9.1 format

### 2.2 ImportAdapter Interfaces âœ…
- [x] `Source/Contracts/ImportAdapter.ts` â€” Base class + `verifyChecksum()`
- [x] Importer interfaces for all manufacturers (stubs ready)

### 2.3 ExportAdapter Interfaces âœ…
- [x] `Source/Contracts/ExportAdapter.ts` â€” Base class
- [x] Exporter interfaces for all formats (stubs ready)

### 2.4 HardwareLinkContract Implementations ðŸ”„ (solo interfaz)
- [x] `Source/Contracts/HardwareLinkContract.ts` â€” Base class
- [x] Hardware configs: `HARDWARE_QUEUE_CONFIGS` (5 manufacturers)
- [x] `Source/Core/MidiSysExQueue.ts` â€” Rate-limited queue with retries
- [x] Edit Buffer support (audition without overwrite) â€” solo firma en interfaz

### 2.5 Implementaciones reales de adapters âœ… (6/8)
- [x] `sysex-casio-cz` â€” nibble encoding + checksum. Tests: 29/29.
- [x] `sysex-roland-juno` â€” bulk checksum `(-sum)&0x7F`, single sin checksum. Tests: 63/63.
- [x] `sysex-korg-ms2000` â€” 7â†’8 packing (MS2000/microKORG/Prophecy). Tests: 71/71.
- [x] `sysex-behringer-dm12` â€” framing ABDEep validado. Tests: Pro-800 30/30.
- [x] `sysex-yamaha-dx7` â€” VCED single + bulk dump (32 voces). Tests: 30/30.
- [ ] `tape` `.wav` â€” pendiente
- [ ] clipboard hex â€” pendiente
- [x] Tests de roundtrip byte-idÃ©ntico por formato â€” Casio, Roland, Korg, Behringer, Yamaha

### Definition of Done ðŸ”„ (parcial)
- All adapters implement interfaces correctly
- Checksum verification works per manufacturer spec
- MIDI queue tests passing (7 tests)

---

## Phase 3: Core Library ðŸ”„ (parcial)

- [x] `WebUI/src/store/persistence.js` â€” Dexie.js real (v1â†’v4): schemas, migraciones, CRUD, tags M:N, historial
- [x] `WebUI/src/core/importEngine.js` / `exportEngine.js` â€” import/export `.abdbank`, `.json`, `.syx` genÃ©rico
- [x] Patch Fingerprinting SHA-256 â€” `packages/core/src/operations/fingerprint.js` (con tests, **no integrado** en el import de la app)
- [x] `Source/Core/validationSchemas.ts` â€” Zod validation schemas for ImportResult, PatchData, Bank
- [x] Patch Version History â€” previousVersionId, versionNumber
- [x] Tags M:N â€” junction table patch_tags
- [~] `packages/core/src/PersistenceEngine.ts` â€” variante paralela (parcialmente unificada vÃ­a `libraryAdapter.js`)

### Pendiente (core de funciones puras segÃºn diseÃ±o Â§5.2)
- [x] Funciones puras inmutables (addBank, movePatch, copyPatchBetweenBanksâ€¦) â€” `packages/core/src/operations/library.js` con 12 operaciones y 49 tests
- [x] Searcher y filtros â€” `packages/core/src/search/searchPatches.js` con 25 tests
- [x] Integrar fingerprinting SHA-256 en el flujo de import de la app
- [x] Activar auto-backup â€” `runPreMigrationBackup()` se ejecuta al inicio
- [x] Tests reales de persistencia â€” 11 tests funcionando con `fake-indexeddb`
- [ ] Eliminar `console.log` en producciÃ³n de `packages/core/src/PersistenceEngine.ts:84`

### Bancos de fÃ¡brica vs. usuario + capacidad por modelo
- [x] **Bancos de fÃ¡brica vs. usuario** (diseÃ±o Â§5.1): `assertBankEditable()` en `persistence.js` bloquea mutaciones sobre bancos factory; la UI muestra badge `ðŸ”’ FÃ¡brica`, deshabilita botones editar/borrar y campos de patch (read-only). `isFavorite` y `notes` son excepciones (preferencias del usuario)
- [x] **ValidaciÃ³n de capacidad por contrato**: `assertBankHasCapacity(currentCount, maxPatches)` en `persistence.js`, llamado desde `createPatch(bankId, data, { maxPatches })`. El caller en la UI resuelve `programsPerBank` del `ModelContract` y lo pasa. 14 tests unitarios (`bankEnforcement.test.js`)

### Definition of Done ðŸ”„ (parcial)
- Dexie.js persistence works with schema migrations
- Fingerprinting detects duplicates correctly
- Auto-backup triggers before migration

---

## Phase 4: WebUI âœ…

- [x] `WebUI/src/store/paramStore.js` â€” Centralized UI state sync (ParamStore class)
- [x] `WebUI/src/ui/components/rotaryKnob.js` â€” Full interaction patterns (drag, shift+fine, wheel, double-click reset)
- [x] Registry-driven widget factory (`createWidget()` in app.js â€” renders from PARAMETER_REGISTRY)
- [x] Settings panel for hardware global parameters (Device ID, MIDI Ch, Tune, Transpose, etc.)
- [x] SysEx parser with manufacturer/model identification (`sysexParser.js` + `modelContracts.js`)
- [~] `WebUI/src/ui/panelFactory.js` â€” Exists but unused; app.js renders widgets inline via `createWidget()`
- [ ] **MF.9 â€” Drag & drop de archivos .syx** (no implementado):
  - [ ] Listeners de drag & drop en `app.js` para archivos `.syx` y `.abdlibrary`
  - [ ] Zona de drop visual (dashed border) que se activa al arrastrar
  - [ ] ImportaciÃ³n automÃ¡tica al banco activo del modelo correcto
  - [ ] CreaciÃ³n automÃ¡tica de banco si no hay banco activo o modelo no coincide
  - [ ] Soporte para mÃºltiples archivos simultÃ¡neos
  - [ ] Feedback visual: spinner durante importaciÃ³n, toast con resultado
  - [ ] Tests unitarios de drag & drop

### Definition of Done âœ…
- ParamStore syncs all controls on patch load/randomize/SysEx
- RotaryKnob follows interaction patterns (Â§7.7)
- Settings panel renders all 7 hardware global params
- SysEx parser identifies 15 manufacturer models

---

## Phase 5: Standalone App (Tauri + Vite) ðŸ”„ IN PROGRESS

- [x] `apps/standalone/src-tauri/` â€” Estructura Tauri 2 con Cargo.toml, tauri.conf.json
- [x] Backend Rust (`main.rs`, `lib.rs`, `commands.rs`, `database.rs`) con comandos CRUD
- [x] SQLite persistence layer (migraciones v1â†’v4, modelos Bank/Patch)
- [x] MIDI support (`midir` crate, comandos para puertos, envÃ­o SysEx)
- [x] `build.rs` para Tauri build
- [ ] Construir la WebUI con Vite y embeberla en el shell Tauri
- [ ] Import/Export de todos los formatos soportados
- [ ] Vista multi-modelo con Ã¡rbol de sintetizadores
- [ ] Ctrl+V (clipboard hex) y drag & drop de ficheros SysEx

### Definition of Done ðŸ”„
- `pnpm tauri dev` launches standalone app
- MIDI input/output works with connected hardware
- Global library persists across sessions (SQLite)
- Import/Export .abdbank works
- Hardware thumbnails display correctly

---

## Phase 6: C++ Module (ABDBankManagerCore) ðŸ”„ (parcial)

- [x] `cpp/ABDBankManagerCore.h/.cpp` â€” C++ wrapper:
  - toValueTree() / fromValueTree() for DAW state
  - selectPreset / getCurrentBankIndex / getCurrentPatchIndex
  - handleWebUIMessage / sendToWebUI (bridge)
- [x] `cpp/CMakeLists.txt` â€” Subdirectory inclusion for plugins
- [x] Binary data embedding for WebUI assets (juce_add_binary_data)
- [x] FetchContent for WebView2 (Windows)
- [x] ParameterRegistry.gen.h/.cpp integration
- [x] JUCE 8 submodule at GITS/JUCE (depth=1)
- [x] Build successful on Visual Studio 2026 (v18)

### Implementado en el core
- [x] Serializar y restaurar `Library/Bank/Patch` completa a ValueTree v1, incluyendo metadatos, tags, parÃ¡metros y `rawData` en Base64.
- [x] Implementar `handleWebUIMessage` / `sendToWebUI` con callback desacoplado de WebView2: `getState`, `requestState`, `setState`, `selectPreset`, `updateMetadata` y error para mensajes desconocidos.
- [x] AÃ±adir `cpp/tests/BankManagerCoreTests.cpp` y registro CTest para roundtrip ValueTree e IPC.

### Estado de integración
- [x] Host JUCE de referencia en `apps/juce-plugin/` con formatos VST3 y Standalone.
- [x] `WebBrowserComponent` con backend WebView2, proveedor de recursos binarios y canal `abdBankManagerMessage`.
- [x] Estado DAW mediante `AudioProcessor::getStateInformation`/`setStateInformation` y `ValueTree`.
- [ ] Probar manualmente WebView2 dentro de un DAW y trasladar el patrón a cada plugin ABD de producción.

### Definition of Done ðŸ”„ (parcial)
- CMake subdirectory builds in ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000
- State persists in DAW sessions
- No compilation warnings

---

## Phase 7: Integration & Migration ðŸ”„

### 7.1 ABDCZ101
- [ ] Migrate `contracts/bankLibrary.js` â†’ BankManagerCore
- [ ] Migrate `contracts/bankManager.js` â†’ Core operations
- [ ] Migrate `contracts/syxNames.js` â†’ sysex-casio-cz adapter
- [ ] Migrate `ui/bankManager.js` â†’ panelFactory + ParamStore
- [ ] Replace `Source/State/BankManager.cpp` â†’ ABDBankManagerCore.cpp

### 7.2 ABDEep
- [ ] Migrate `components/bank-manager.js` â†’ panelFactory
- [ ] Migrate `Source/Core/BankFileReader.h/cpp` â†’ sysex-behringer-dm12 adapter
- [ ] Migrate `Source/Core/PresetManager.h` â†’ ABDBankManagerCore + ModelContract

### 7.3 ABDJUNiO601
- [ ] Migrate `PresetManagerBase.h` â†’ ABDBankManagerCore.h
- [ ] Migrate `PresetManager.h/cpp` â†’ roland-juno106 ModelContract + Core
- [ ] Migrate `JunoSysexImporter.h/cpp` â†’ sysex-roland-juno adapter
- [ ] Migrate `JunoSysExEngine.h/cpp` â†’ hw-roland-juno HardwareLink

### 7.4 ABDMS2000
- [x] Design ModelContract for korg-ms2000 (Source/Contracts/Models/korg-ms2000.ts)
- [x] Implement sysex-korg-ms2000 Import/Export adapter & HardwareLink (Source/Contracts/Adapters/korgMs2000Adapter.ts)
- [x] Create universal modular component BankManagerModal.js + BankManagerModal.css with dynamic CSS theming contract
- [x] Implement bi-directional DSP communication bridge contract (synthBridge: audition, capture, commit bank)
- [x] Softsynth contract `abd-sm002` (isSoftsynth: true, `compatibleModels: ['korg-ms2000','korg-microkorg']`) — especc §10 del `BANK_MANAGER_INTEGRATION_SPEC.md` de ABDMS2000
- [x] WebUI source of truth via CMake FetchContent: ABDMS2000 consume `../ABDBankManager/WebUI` (dev) / tag `v0.3.0-lib` (CI/clones frescos). Sustituye al antiguo `Scripts/sync_bankmanager.js` (copias eliminadas: `WebUI/src/components/bank/`, `sync:bankmanager`, deps dexie/jszip)
- [ ] Wire physical hardware MIDI dumping in plugin WebUI — el transporte ya existe en ABDBankManager (`WebUI/src/bridge/hardwareMidi.js` + `cpp/HardwareMidiPipe.h`: acciones `hardware.send`/`hardware.listen`/`hardware.receive`), pero el puente del plugin ABDMS2000 (`WebUI/src/bridge/bridgeCore.js`) aún no las maneja (solo `sendMidiCC`). Falta enrutar esas acciones a un puerto MIDI físico JUCE para que "Send/Receive from MS2000 Hardware" del modal funcione dentro del plugin.
- [ ] **Crear bancos de fábrica** — el banco básico propio (de ABDSynths) para incrustar dentro del synth y/o como banco de fábrica de ABDBankManager. Diferido: infraestructura aún en maduración
- [ ] **Desplegar el WebUI en internet** — `npm run build` → `dist/` limpio (sin `.syx` de terceros) para host estático. Los fixtures `*.syx` quedan fuera (solo estudio local, protegidos en `.gitignore`)

### Definition of Done
- All 3 existing projects build with shared Bank Manager
- No duplicate bank/preset logic remains in projects
- Patches exportable from standalone â†’ importable in plugins
- Hardware fetch/dump works from plugin WebUI

---

## Phase 8: QA, Tests & Release â¸

- [ ] C++ Unit Tests (JUCE TestRunner):
  - [ ] SysEx roundtrip (encodeâ†’decode=identical) for all 5 manufacturers
  - [ ] Parameter roundtrip (applyToAPVTSâ†”extractFromAPVTS)
  - [ ] NaN/Inf detection â€” all param combos produce valid audio
  - [ ] Boundary values (0, 0.5, 1.0)
  - [ ] Allocation audit â€” 0 heap allocs in processBlock
- [ ] WebUI Vitest:
  - [ ] Registry validation (no duplicate IDs/CCs, sysex offsets)
  - [x] Bridge IPC roundtrip (adaptador JSON + CTest + test WebUI del protocolo)
  - [ ] Panel factory generation
  - [ ] ParamStore sync
- [x] **Activar tests skipped** â€” aliases de import en `vitest.config.js`; zodValidation, sysexAdapterRoundtrip, registry y panelFactory ejecutan en la suite principal.
- [~] **Tests de protocolo**: detecciÃ³n, checksum, mensajes concatenados/intercalados, corrupciÃ³n y packing con fixtures reales ya cubiertos para los modelos priorizados; faltan ampliar la matriz a todas las variantes y validar hardware fÃ­sico.
- [~] **Tests de integraciÃ³n**: persistencia/migraciones, backup/restore, Tauri facade y ContractRegistry ya tienen cobertura; faltan estabilidad Node/navegador del fingerprint, cobertura completa de todas las operaciones IndexedDB y pruebas WebView2 real y host JUCE.
- [ ] pluginval strictness â‰¥ 5 on all 4 plugin targets
- [ ] Sample rate resilience (44.1k, 48k, 88.2k, 96k, 192k)
- [ ] Buffer size variance (32â€“4096)
- [ ] Multi-instance test (8+ simultaneous)
- [ ] Security scan (XSS, DOM injection)
- [ ] CI Pipeline (GitHub Actions):
  - [x] schema-validation job
  - [x] registry-generation job
  - [x] vitest job
  - [x] cpp-unit-tests job (Windows)
  - [x] build-verification job
  - [ ] wasm-build job (stub â€” configures but no output verification)
  - [ ] pluginval job (stub â€” install + validation commented out)
  - [ ] allocation-audit job (partial â€” runs ASan but no exit code check)
  - [ ] security-scan job (partial â€” `audit-ci` swallows failures with `|| true`)
  - [ ] Corregir count en `HANDOFF.md`: "72 passing | 5 skipped" â†’ "113+ passing | 35 skipped"

### Definition of Done
- All tests pass (0 failures)
- pluginval passes strictness 5 on all targets
- Zero heap allocations in audio thread
- CI pipeline green
- Version tagged: `git tag -a v1.0.0 -m "Initial release"`

---

## Release Checklist (Pre-Release Mandatory)

- [ ] All C++ tests pass (0 failures)
- [ ] All WebUI tests pass (0 failures)
- [ ] `pluginval --strictness-level 5` passes on all 4 targets
- [ ] 0 heap allocations in processBlock (allocation audit)
- [ ] SysEx roundtrip test passes (byte-identical) for all manufacturers
- [ ] State save/restore verified in DAW (Reaper, Ableton, Logic)
- [ ] Sample rate resilience tested (44.1kâ€“192k)
- [ ] Buffer size variance tested (32â€“4096)
- [ ] No `mutex`, `new`, `malloc`, file I/O in audio thread
- [ ] `ScopedNoDenormals` in every processBlock
- [ ] Parameter smoothing on all frequency/amplitude params
- [ ] Voice stealing with fade-out (~5ms) â€” N/A for Bank Manager, but verify no audio thread code
- [ ] `getTailLengthSeconds()` returns realistic value â€” N/A
- [ ] `getNumPrograms()` returns â‰¥ 1 â€” verify preset count
- [ ] `getProgramName()` returns actual preset name â€” verify

---

## Improvements Backlog (code review 2026-09-01)

> Findings from a code-only architecture review (docs avoided).
> Correction: an earlier note claimed `cpp/tests` was empty — **incorrect**, `cpp/tests/BankManagerCoreTests.cpp` exists (ValueTree roundtrip + IPC, registered via CTest).

### Functional improvements

- [ ] **Bridge HardwareLink execution end-to-end**: `HardwareLinkContract` + `MidiSysExQueue` exist in TS and `Pro800MidiTransport` in C++, but no end-to-end MIDI send/receive pipeline runs from the WebUI hardware tab through the JUCE bridge. Wire the link methods through the WebView bridge so users can fetch/dump from real hardware.
- [ ] **Cross-model patch translation**: `compatibleModels` / `getHardwareIds()` associate blobs with compatible models, but no parameter translation exists. Define common-parameter maps so an imported patch is *usable* (not just associated) on other hardware.
- [ ] **Composite search / filter engine**: search is text-only on name/author/tags/notes (`searchPatches.js`). Add combined filters: category + tag + rating + favorite + parameter ranges.
- [ ] **Version diff/rollback UI**: `previousVersionId`/`versionNumber` and the `history` table exist, but there is no visual diff or one-click rollback between patch versions.
- [ ] **Audition/preview without hardware**: no way to hear a patch from the library. Even an approximate software render would transform UX.

### Technical improvements

- [ ] **Single source of truth for Patch/Bank models**: structs duplicated in TS (`Source/Contracts/`, `packages/core/src/models/`) and C++ (`cpp/ABDBankManagerCore.h`). Extend `Scripts/registry_generator.js` to generate C++ structs from TS contracts to prevent schema drift.
- [ ] **Promote `Source/Contracts` into the pnpm workspace**: `packages/contracts` is a shim re-exporting `../../Source/Contracts/index.ts` via fragile relative paths, and `Source/` sits outside `packages/*`. Move canonical sources under `packages/contracts/src` (or extend `pnpm-workspace.yaml`); update the `@contracts` alias in `vitest.config.js`.
- [ ] **Dedupe fingerprint implementations**: `packages/core/src/operations/fingerprint.js` and `WebUI/src/core/fingerprint.js` are near-identical SHA-256 implementations; consolidate into core and pipe to WebUI like other shared modules.
- [ ] **Fingerprint algorithm versioning**: fingerprints carry no `fpVersion` field; if the hash recipe (e.g. `extractSoundBytes` scoping) changes, existing libraries silently mismatch. Add a version tag to schemas and manifests.
- [ ] **C++ ValueTree migration strategy**: `valueTreeSchemaVersion = 1` exists with no visible upgrade path. Define forward/backward migration policy for DAW state before shipping plugins.
- [ ] **Trim WebUI binary data**: `juce_add_binary_data(WebUIAssets ...)` globs `WebUI/src/*` recursively plus `vendor/*` and `public/*`; filter by extension and exclude tests/sources to keep the plugin binary lean.
- [ ] **Fix persistence.js duplication with PersistenceEngine.ts**: `WebUI/src/store/persistence.js` (JS, Dexie v1→v4) and `packages/core/src/PersistenceEngine.ts` (TS, Dexie v1→v4) declare parallel schemas/migrations; the TS engine is not imported by the WebUI store. Unify or delete one.

### Suggested priority

1. Generate C++ structs from TS contracts (prevents desync bugs; codegen infra already exists).
2. Unify/dedupe the two persistence layers and two fingerprint implementations.
3. Wire HardwareLink execution end-to-end (largest functional gap).

