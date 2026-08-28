# Handoff Document — ABD Universal Bank Manager

> Last updated: 2026-08-26 by AI Assistant
> Current phase: **Phase 7 — Integration & Migration** (READY TO START)

## What Was Done (Phases 0-6 — Completed / Partial)

> Estado corregido 2026-08-26: las fases 2, 3 y 6 estaban marcadas como completas pero son **parciales**.
> Lo marcado como pendiente abajo NO está implementado, solo diseñado/interfaz.

- [x] **Phase 0**: Mandatory docs (README, CHANGELOG, HANDOFF, ROADMAP) + git repo + JUCE submodule
- [x] **Phase 1**: Parameter Registry (SSOT) — JSON schema + `registry_generator.js` + `build_webui.js`
- [x] **Phase 2 (parcial)**: Contracts & Adapters — 5 manufacturers (**15** variants), all base interfaces, checksums (firma). **Pendiente: implementaciones de importers/exporters/hardware links** (ver Known Issues)
- [x] **Phase 3 (parcial)**: Core Library — CRUD + Dexie.js (v1→v3) reales en `WebUI/src/store/persistence.js`; fingerprinting, Zod, version history, tags M:N; enforcement `isFactory` (bancos de fábrica inmutables) + `programsPerBank` (validación de capacidad por contrato). **Pendiente: funciones puras (BankStore/PatchStore/Searcher) y search en `packages/core`**
- [x] **Phase 4**: WebUI — ParamStore, panelFactory, RotaryKnob, components
- [x] **Phase 6 (parcial)**: C++ Module — ABDBankManagerCore static lib, JUCE 8, WebUI embedding. **Parcial: `toValueTree()` solo guarda índices; bridge no-op**

## What's Next

1. **Phase 7 — Integration & Migration** (Priority):
   - Migrate ABDCZ101 (`bankLibrary.js`, `bankManager.js`, `syxNames.js`, `BankManager.cpp`)
   - Migrate ABDEep (`bank-manager.js`, `BankFileReader`, `PresetManager`)
   - Migrate ABDJUNiO601 (`PresetManagerBase`, `PresetManager`, `JunoSysexImporter`, `JunoSysExEngine`)

2. **Phase 5 — Standalone App** (Tauri + Vite):
   - `apps/standalone/` with MidiManager, GlobalLibrary, multi-model tree view
   - Hardware thumbnails, Paste/Drag SysEx input

3. **Phase 8 — QA & Release**:
   - pluginval strictness ≥ 5 on all 4 plugin targets
   - Sample rate/buffer size resilience testing
   - CI pipeline green, version tag

## Architecture Decisions (Finalized)

- **Parameter Registry as SSOT** — JSON schema drives C++ header, JS registry, docs
- **Immutable CRUD** — All library operations are pure functions
- **Dexie.js for persistence** — IndexedDB v1→v3 with auto-migration + backup
- **Patch Fingerprinting** — SHA-256 of sound bytes (KnobKraft pattern)
- **Zod validation** — Runtime validation of all imported data
- **Async MIDI Queue** — Rate-limited per hardware (10-100ms delays from HardwareLinkContract)
- **Auto-backup** — Export `.abdbank` before schema migration
- **Retrocompat wrapper** — Guide §9.1 ModelContract format supported
- **Visual Studio 2026 (v18)** — Auto-detected by CMake, JUCE 8 via submodule

## Known Issues / Blockers

- **Import/Export adapters por fabricante NO implementados** — solo un parser SysEx heurístico genérico (`WebUI/src/core/sysexParser.js`) + motores genéricos JSON/.abdbank. Sin `.mid`, tape `.wav`, clipboard hex, packing 7→8 ni checksums por fabricante. **Nota:** `sysexParser.js` solo cubre 13 de 15 modelos (falta `korg-prophecy` y `casio-cz1`)
- **HardwareLink sin implementar** — no hay `buildDumpRequest` / `buildPatchDump` / `parseDumpResponse` para ningún fabricante (solo interfaz + cola MIDI)
- **Contratos unificados (2026-08-26)** — `WebUI/src/contracts/modelContracts.js` re-exporta el fuente canónico TS (`Source/Contracts/Models/*.ts`, 15 modelos, incluido `korg-prophecy`); `packages/contracts/src` es un shim sin código duplicado
- **`packages/core/src/PersistenceEngine.ts` (import arreglado)** — aún pendiente: su fingerprint no es SHA-256 y su backup devuelve JSON, no ZIP
- **Auto-backup no invocado** — `backupBeforeMigration()` existe en `WebUI/src/store/persistence.js` pero nunca se llama
- **Fingerprinting no integrado** — `fingerprint.js` (SHA-256 real) no se usa en el flujo de import de la app
- Tauri standalone app not yet implemented (`apps/standalone/` — vacío)
- WASM AudioWorklet build target not configured
- Integration migration scripts not yet written for ABDCZ101/ABDEep/ABDJUNiO601
- WebView2 FetchContent in CMake needs verification on clean machines

## Build Instructions

```bash
# Windows
build.bat          # Full: generate + cmake + msbuild
build.bat generate # Just registry + build version
build.bat build    # Just cmake + msbuild

# Tests
npm test           # 72 passing | 5 skipped (persistence suite en describe.skip)

# Clean
build.bat clean
```

## Key Files

| File | Purpose |
|---|---|
| `schemas/parameters-spec.schema.v1.json` | SSOT del registro (vacío: los ajustes MIDI se derivan del `ModelContract.midi` + `HARDWARE_QUEUE_CONFIGS` vía `getMidiConfig()`) |
| `Scripts/registry_generator.js` | Generates .gen.h/.cpp/.js + data.json |
| `Scripts/build_webui.js` | Generates BuildVersion.h + buildVersion.js |
| `Source/Contracts/Models/*.ts` | 15 ModelContract implementations |
| `WebUI/src/store/persistence.js` | Dexie.js (v1→v3) with migrations + CRUD real + `assertBankEditable`/`assertBankHasCapacity` guards |
| `packages/core/src/PersistenceEngine.ts` | Variante paralela (import arreglado; fingerprint no SHA-256, backup JSON) |
| `Source/Core/MidiSysExQueue.ts` | Rate-limited MIDI queue |
| `WebUI/src/core/sysexParser.js` | SysEx manufacturer/model identification (13/15 models) |
| `WebUI/src/store/paramStore.js` | Centralized UI sync |
| `WebUI/src/ui/panelFactory.js` | Registry-driven panels (**exists but unused** — app.js renders inline via `createWidget()`) |
| `WebUI/src/ui/components/rotaryKnob.js` | Full interaction patterns |
| `cpp/ABDBankManagerCore.h/.cpp` | C++ static lib for JUCE plugins |
| `.github/workflows/ci.yml` | CI pipeline (5 reales: schema/registry/vitest/cpp/build-verification; 2 stubs: wasm/pluginval; 2 parciales: allocation-audit/security-scan) |

## Testing Status

- ✅ C++ tests: N/A (static lib only, no audio thread)
- ✅ WebUI Vitest: **155 passing | 5 skipped** — persistencia Dexie skipeada (IndexedDB), isFactory + capacity enforcement 14 tests, SysEx roundtrip reales (importa del canónico `@contracts/Adapters/sysexUtils`)
- ⏸ pluginval: Ready for Phase 8
- ✅ Schema validation: No duplicate IDs/CCs, sequential sysex offsets
- ✅ Registry generation: 4 artifacts produced