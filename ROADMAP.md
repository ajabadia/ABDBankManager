# ABD Universal Bank Manager — Roadmap

## Status

| Phase | Description | Status |
|:---:|---|:---:|
| 0 | **Project Initialization & Documentation** | ✅ DONE |
| 1 | **Parameter Registry & Code Generation** | ✅ DONE |
| 2 | **Contracts & Adapters (Model, Import, Export, Hardware)** | 🔄 PARTIAL — interfaces ✅, implementaciones ❌ |
| 3 | **Core Library (BankStore, PatchStore, Searcher, Persistence)** | 🔄 PARTIAL — Dexie en WebUI ✅, funciones puras/búsqueda ❌ |
| 4 | **WebUI (panelFactory, ParamStore, Components)** | ✅ DONE |
| 5 | **Standalone App (Tauri + Vite)** | ⏸ PENDING |
| 6 | **C++ Module (ABDBankManagerCore for JUCE)** | 🔄 PARTIAL — compila ✅, serialización/bridge ❌ |
| 7 | **Integration & Migration (ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000)** | 🔄 IN PROGRESS |
| 8 | **QA, Tests & Release** | ⏸ PENDING |

> **Actualización de estado (2026-08-26):** las fases 2, 3 y 6 se marcan como **parciales**.
> Existen las interfaces y contratos (15 ModelContracts, MIDI queue, Dexie en `WebUI/src/store`),
> pero faltan: las implementaciones de Import/Export/Hardware adapters por fabricante,
> el core de funciones puras (BankStore/PatchStore/Searcher) en `packages/core`, y la
> serialización completa a ValueTree en C++. Ver HANDOFF.md → Known Issues / Blockers.

---

## Phase 0: Project Initialization & Documentation ✅

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

### Definition of Done ✅
- All 4 mandatory docs exist and are current
- Git repo initialized with JUCE submodule
- `npm install` works
- `build.bat` runs without errors

---

## Phase 1: Parameter Registry & Code Generation ✅

- [x] Create `schemas/parameters-spec.schema.v1.json` with Bank Manager parameters
- [x] Create `schemas/program-dump.schema.v1.json`
- [x] Create `schemas/bank-file.schema.v1.json`
- [x] Create `schemas/bridge-messages.schema.v1.json`
- [x] Implement `Scripts/registry_core.js` — validation logic
- [x] Implement `Scripts/registry_generator.js` — generates:
  - `Source/State/ParameterRegistry.gen.h`
  - `Source/State/ParameterRegistry.gen.cpp`
  - `WebUI/src/contracts/registry.gen.js`
  - `schemas/parameter-registry.data.json`
- [x] Implement `Scripts/build_webui.js` — generates BuildVersion.h + buildVersion.js
- [x] Add `npm run generate` script
- [x] Add validation tests: no duplicate IDs, no duplicate CCs, auto-calculated sysex offsets

### Definition of Done ✅
- `npm run generate` produces all 4 artifacts without errors
- Generated artifacts pass schema validation tests
- Registry is Single Source of Truth for all parameters

---

## Phase 2: Contracts & Adapters 🔄 (parcial)

### 2.1 ModelContract Implementations ✅
- [x] `Source/Contracts/Models/casio-cz.ts` — CZ-101, CZ-1000, CZ-5000, CZ-1
- [x] `Source/Contracts/Models/roland-juno.ts` — Juno-106, Juno-60, Juno-6, HS-60
- [x] `Source/Contracts/Models/korg-ms2000.ts` — MS2000, microKORG, Prophecy
- [x] `Source/Contracts/Models/behringer-dm12.ts` — DeepMind 12, Pro-800
- [x] `Source/Contracts/Models/yamaha-dx7.ts` — DX7, DX7II
- [x] Retrocompat wrapper for Guide §9.1 format

### 2.2 ImportAdapter Interfaces ✅
- [x] `Source/Contracts/ImportAdapter.ts` — Base class + `verifyChecksum()`
- [x] Importer interfaces for all manufacturers (stubs ready)

### 2.3 ExportAdapter Interfaces ✅
- [x] `Source/Contracts/ExportAdapter.ts` — Base class
- [x] Exporter interfaces for all formats (stubs ready)

### 2.4 HardwareLinkContract Implementations 🔄 (solo interfaz)
- [x] `Source/Contracts/HardwareLinkContract.ts` — Base class
- [x] Hardware configs: `HARDWARE_QUEUE_CONFIGS` (5 manufacturers)
- [x] `Source/Core/MidiSysExQueue.ts` — Rate-limited queue with retries
- [x] Edit Buffer support (audition without overwrite) — solo firma en interfaz

### 2.5 Pendiente — Implementaciones reales de adapters
- [ ] Importers por fabricante: `sysex-casio-cz` (nibble), `sysex-roland-juno` (checksum XOR), `sysex-korg-ms2000` (7→8 packing), `sysex-behringer-dm12`, `sysex-yamaha-dx7` (VCED), `tape` `.wav`, `midi` `.mid`, clipboard hex
- [ ] Exporters por fabricante: `export-sysex-*` (framing + checksum), `export-csv`
- [ ] HardwareLinks: `buildDumpRequest` / `buildPatchDump` / `parseDumpResponse` por fabricante (7 previstos)
- [ ] Tests de roundtrip byte-idéntico por formato (los actuales son "concept validation", no roundtrips reales)

### Definition of Done 🔄 (parcial)
- All adapters implement interfaces correctly
- Checksum verification works per manufacturer spec
- MIDI queue tests passing (7 tests)

---

## Phase 3: Core Library 🔄 (parcial)

- [x] `WebUI/src/store/persistence.js` — Dexie.js real (v1→v3): schemas, migraciones, CRUD, tags M:N, historial
- [x] `WebUI/src/core/importEngine.js` / `exportEngine.js` — import/export `.abdbank`, `.json`, `.syx` genérico
- [x] Patch Fingerprinting SHA-256 — `packages/core/src/operations/fingerprint.js` (con tests, **no integrado** en el import de la app)
- [x] `Source/Core/validationSchemas.ts` — Zod validation schemas for ImportResult, PatchData, Bank
- [x] Patch Version History — previousVersionId, versionNumber
- [x] Tags M:N — junction table patch_tags
- [~] `packages/core/src/PersistenceEngine.ts` — variante paralela: import arreglado; fingerprint no SHA-256, backup devuelve JSON en vez de ZIP

### Pendiente (core de funciones puras según diseño §5.2)
- [ ] Funciones puras inmutables (addBank, movePatch, copyPatchBetweenBanks…) — `packages/core/src/operations` solo tiene `fingerprint.js`
- [ ] Searcher y filtros — `packages/core/src/search` vacío
- [ ] Integrar fingerprinting SHA-256 en el flujo de import de la app
- [ ] Activar auto-backup — `backupBeforeMigration()` está definido pero nunca se invoca
- [ ] Tests reales de persistencia — la suite actual está entera en `describe.skip`

### Bancos de fábrica vs. usuario + capacidad por modelo
- [x] **Bancos de fábrica vs. usuario** (diseño §5.1): `assertBankEditable()` en `persistence.js` bloquea mutaciones sobre bancos factory; la UI muestra badge `🔒 Fábrica`, deshabilita botones editar/borrar y campos de patch (read-only). `isFavorite` y `notes` son excepciones (preferencias del usuario)
- [x] **Validación de capacidad por contrato**: `assertBankHasCapacity(currentCount, maxPatches)` en `persistence.js`, llamado desde `createPatch(bankId, data, { maxPatches })`. El caller en la UI resuelve `programsPerBank` del `ModelContract` y lo pasa. 14 tests unitarios (`bankEnforcement.test.js`)

### Definition of Done 🔄 (parcial)
- Dexie.js persistence works with schema migrations
- Fingerprinting detects duplicates correctly
- Auto-backup triggers before migration

---

## Phase 4: WebUI ✅

- [x] `WebUI/src/store/paramStore.js` — Centralized UI state sync (ParamStore class)
- [x] `WebUI/src/ui/components/rotaryKnob.js` — Full interaction patterns (drag, shift+fine, wheel, double-click reset)
- [x] Registry-driven widget factory (`createWidget()` in app.js — renders from PARAMETER_REGISTRY)
- [x] Settings panel for hardware global parameters (Device ID, MIDI Ch, Tune, Transpose, etc.)
- [x] SysEx parser with manufacturer/model identification (`sysexParser.js` + `modelContracts.js`)
- [~] `WebUI/src/ui/panelFactory.js` — Exists but unused; app.js renders widgets inline via `createWidget()`

### Definition of Done ✅
- ParamStore syncs all controls on patch load/randomize/SysEx
- RotaryKnob follows interaction patterns (§7.7)
- Settings panel renders all 7 hardware global params
- SysEx parser identifies 15 manufacturer models

---

## Phase 5: Standalone App (Tauri + Vite) ⏸

- [ ] `apps/standalone/src/App.js` — Shell with synthesizer tree + global library
- [ ] `apps/standalone/src/MidiManager.js` — Web MIDI API for hardware link
- [ ] `apps/standalone/src/GlobalLibrary.js` — IndexedDB persistence (Dexie)
- [ ] `apps/standalone/index.html` — Entry point
- [ ] `apps/standalone/package.json` — Tauri config
- [ ] Thumbnail assets in `WebUI/src/assets/thumbnails/`
- [ ] Paste & Drag SysEx input (§8.4)
- [ ] Multi-model library view with hardware thumbnails

### Definition of Done
- `npm run tauri dev` launches standalone app
- MIDI input/output works with connected hardware
- Global library persists across sessions
- Import/Export .abdbank works
- Hardware thumbnails display correctly

---

## Phase 6: C++ Module (ABDBankManagerCore) 🔄 (parcial)

- [x] `cpp/ABDBankManagerCore.h/.cpp` — C++ wrapper:
  - toValueTree() / fromValueTree() for DAW state
  - selectPreset / getCurrentBankIndex / getCurrentPatchIndex
  - handleWebUIMessage / sendToWebUI (bridge)
- [x] `cpp/CMakeLists.txt` — Subdirectory inclusion for plugins
- [x] Binary data embedding for WebUI assets (juce_add_binary_data)
- [x] FetchContent for WebView2 (Windows)
- [x] ParameterRegistry.gen.h/.cpp integration
- [x] JUCE 8 submodule at GITS/JUCE (depth=1)
- [x] Build successful on Visual Studio 2026 (v18)

### Pendiente
- [ ] Serializar la librería completa a ValueTree (hoy `toValueTree()` solo guarda 2 índices)
- [ ] Implementar `handleWebUIMessage` / `sendToWebUI` (hoy no-ops)

### Definition of Done 🔄 (parcial)
- CMake subdirectory builds in ABDCZ101, ABDEep, ABDJUNiO601, ABDMS2000
- State persists in DAW sessions
- No compilation warnings

---

## Phase 7: Integration & Migration 🔄

### 7.1 ABDCZ101
- [ ] Migrate `contracts/bankLibrary.js` → BankManagerCore
- [ ] Migrate `contracts/bankManager.js` → Core operations
- [ ] Migrate `contracts/syxNames.js` → sysex-casio-cz adapter
- [ ] Migrate `ui/bankManager.js` → panelFactory + ParamStore
- [ ] Replace `Source/State/BankManager.cpp` → ABDBankManagerCore.cpp

### 7.2 ABDEep
- [ ] Migrate `components/bank-manager.js` → panelFactory
- [ ] Migrate `Source/Core/BankFileReader.h/cpp` → sysex-behringer-dm12 adapter
- [ ] Migrate `Source/Core/PresetManager.h` → ABDBankManagerCore + ModelContract

### 7.3 ABDJUNiO601
- [ ] Migrate `PresetManagerBase.h` → ABDBankManagerCore.h
- [ ] Migrate `PresetManager.h/cpp` → roland-juno106 ModelContract + Core
- [ ] Migrate `JunoSysexImporter.h/cpp` → sysex-roland-juno adapter
- [ ] Migrate `JunoSysExEngine.h/cpp` → hw-roland-juno HardwareLink

### 7.4 ABDMS2000 (future)
- [ ] Design ModelContract for korg-ms2000
- [ ] Implement sysex-korg-ms2000 adapter

### Definition of Done
- All 3 existing projects build with shared Bank Manager
- No duplicate bank/preset logic remains in projects
- Patches exportable from standalone → importable in plugins
- Hardware fetch/dump works from plugin WebUI

---

## Phase 8: QA, Tests & Release ⏸

- [ ] C++ Unit Tests (JUCE TestRunner):
  - [ ] SysEx roundtrip (encode→decode=identical) for all 5 manufacturers
  - [ ] Parameter roundtrip (applyToAPVTS↔extractFromAPVTS)
  - [ ] NaN/Inf detection — all param combos produce valid audio
  - [ ] Boundary values (0, 0.5, 1.0)
  - [ ] Allocation audit — 0 heap allocs in processBlock
- [ ] WebUI Vitest:
  - [ ] Registry validation (no duplicate IDs/CCs, sysex offsets)
  - [ ] Bridge IPC roundtrip
  - [ ] Panel factory generation
  - [ ] ParamStore sync
- [ ] pluginval strictness ≥ 5 on all 4 plugin targets
- [ ] Sample rate resilience (44.1k, 48k, 88.2k, 96k, 192k)
- [ ] Buffer size variance (32–4096)
- [ ] Multi-instance test (8+ simultaneous)
- [ ] Security scan (XSS, DOM injection)
- [ ] CI Pipeline (GitHub Actions):
  - [x] schema-validation job
  - [x] registry-generation job
  - [x] vitest job
  - [x] cpp-unit-tests job (Windows)
  - [x] build-verification job
  - [ ] wasm-build job (stub — configures but no output verification)
  - [ ] pluginval job (stub — install + validation commented out)
  - [ ] allocation-audit job (partial — runs ASan but no exit code check)
  - [ ] security-scan job (partial — `audit-ci` swallows failures with `|| true`)

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
- [ ] Sample rate resilience tested (44.1k–192k)
- [ ] Buffer size variance tested (32–4096)
- [ ] No `mutex`, `new`, `malloc`, file I/O in audio thread
- [ ] `ScopedNoDenormals` in every processBlock
- [ ] Parameter smoothing on all frequency/amplitude params
- [ ] Voice stealing with fade-out (~5ms) — N/A for Bank Manager, but verify no audio thread code
- [ ] `getTailLengthSeconds()` returns realistic value — N/A
- [ ] `getNumPrograms()` returns ≥ 1 — verify preset count
- [ ] `getProgramName()` returns actual preset name — verify