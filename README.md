# ABD Universal Bank Manager

> Universal patch & bank management library for all ABDSynths projects â€” standalone app, embeddable WebView2 module, and portable `.abdbank` format.

## Features

> Estado actualizado 2026-08-31: `[x]` hecho, `[~]` parcial, `[ ]` pendiente. Ver HANDOFF.md â†’ Known Issues.

- [x] **Universal Bank Manager** â€” Import, organize, export patches (WebUI CRUD funcional)
- [x] **Multi-model support** â€” Casio CZ, Roland Juno, Korg MS2000/microKORG/Prophecy, Behringer DeepMind 6/12/12D, Pro-800, Yamaha DX7/DX7II (17 ModelContracts)
- [x] **ContractRegistry** â€” Registro declarativo de contratos con validaciÃ³n; el core/UI se auto-configuran (standalone = bundle completo, plugin = solo su modelo + compatibles)
- [x] **Multi-hardware association** â€” `hardwareIds` (canÃ³nico + compatibles) derivados de `compatibleModels`, en bancos, patches y manifest `.abdbank`; `parameters` reservado para plugins/editores (principio de asepsia)
- [x] **Pluggable Import/Export Adapters** â€” 6 adapters implementados: Casio CZ (nibble), Roland Juno (bulk checksum), Korg MS2000/microKORG/Prophecy (7â†’8 packing), Behringer DM12, Pro-800, Yamaha DX7. **Pendiente:** tape `.wav`, clipboard hex
- [~] **Bidirectional Hardware Link** â€” HardwareLinks registrados para Casio CZ-101, Roland Juno-106, Korg MS2000, DeepMind 12 y Yamaha DX7; falta cubrir Pro-800/variantes y validar con hardware fÃ­sico
- [x] **Patch Fingerprinting** â€” SHA-256 (`fingerprint.js`, con tests), **integrado** en importaciÃ³n WebUI y core; deduplicaciÃ³n opcional no destructiva
- [x] **Native `.abdbank` / `.abdlibrary` Formats** â€” `.abdbank` = un banco (ZIP con manifest + blobs); `.abdlibrary` = toda la librerÃ­a multi-banco (import/export en WebUI); el backup Dexie aÃºn es JSON
- [x] **Registry-driven WebUI** â€” Registry SSOT + panelFactory/paramStore como **kit de editor para los plugins ABD**; ajustes MIDI derivados del ModelContract + HARDWARE_QUEUE_CONFIGS
- [ ] **Cross-project compatibility** â€” Pendiente (Fase 7: migraciÃ³n de ABDCZ101, ABDEep, ABDJUNiO601)
- [~] **DAW State Persistence** â€” C++ `BankManagerCore` serializa `Library/Bank/Patch` completa en `ValueTree` v1, conserva blobs como Base64 y expone IPC por callback; falta integrarlo en cada plugin JUCE real
- [x] **Parameter Registry (SSOT)** â€” JSON schema drives C++ headers, JS registry, documentation (vacÃ­o hasta que los plugins definan sus parÃ¡metros de editor)
- [x] **Async MIDI SysEx Queue** â€” Rate-limited per hardware (10-100ms), retry logic
- [x] **Zod Validation** â€” Runtime validation of all import/export data
- [x] **Dexie.js Persistence** â€” IndexedDB con migraciones v1â†’v4 y tags M:N (WebUI); auto-backup pre-migraciÃ³n invocado; persistencia unificada vÃ­a `libraryAdapter.js`

## Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    ABD UNIVERSAL BANK MANAGER                     â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Presentation:  Standalone (Tauri)  â”‚  Plugin Modal (WebView2)   â”‚
â”‚  Contracts:     ModelContract, PatchData, ImportAdapter,         â”‚
â”‚                 ExportAdapter, HardwareLinkContract                â”‚
â”‚  Core:          library.js (immutable CRUD), searchPatches.js,   â”‚
â”‚                 fingerprint.js, validationSchemas.ts               â”‚
â”‚  Bridge:        libraryAdapter.js (Dexie â‡„ Core), persistence.js â”‚
â”‚  Storage:       Dexie.js v4 (IndexedDB), SQLite (Tauri)          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Supported Hardware

| Manufacturer | Models | Bank Capacity | Patch Size | SysEx ID |
|---|---|---|---|---|
| Casio | CZ-101, CZ-1000, CZ-5000, CZ-1 | 16â€“32 | 128â€“288 bytes | 0x44 |
| Roland | Juno-106, Juno-60, Juno-6, HS-60 | 128 (2Ã—64) | 18 bytes | 0x41 |
| Korg | MS2000, microKORG, Prophecy | 128 (8Ã—16) | 288 bytes | 0x42 |
| Behringer | DeepMind 6, DeepMind 12, DeepMind 12D, Pro-800 | 1024 (8Ã—128) | 242 bytes | 0x00 0x20 0x32 |
| Yamaha | DX7, DX7II | 32 (cartridge) | 128 bytes (VCED) | 0x43 |

## Build

```bash
# Windows
build.bat

# macOS / Linux
mkdir build && cd build && cmake .. && cmake --build .
```

## Platforms

| Format | Status |
|---|---|
| JUCE Plugin Module (C++) | ðŸ”„ Core + adaptador JSON funcionales (ValueTree + IPC callback); integraciÃ³n en plugins pendiente |
| Web (Vite SPA) | âœ… Core Complete |
| Standalone (Tauri) | ðŸ”„ In Progress (`apps/standalone/src-tauri/` con SQLite + comandos CRUD) |
| WASM AudioWorklet | â¸ Planned |

## Project Structure

```
ABDBankManager/
â”œâ”€â”€ README.md
â”œâ”€â”€ CHANGELOG.md
â”œâ”€â”€ HANDOFF.md
â”œâ”€â”€ ROADMAP.md
â”œâ”€â”€ package.json
â”œâ”€â”€ CMakeLists.txt
â”œâ”€â”€ build.bat
â”œâ”€â”€ schemas/
â”‚   â”œâ”€â”€ parameters-spec.schema.v1.json
â”‚   â”œâ”€â”€ program-dump.schema.v1.json
â”‚   â”œâ”€â”€ bank-file.schema.v1.json
â”‚   â”œâ”€â”€ library-file.schema.v1.json
â”‚   â””â”€â”€ bridge-messages.schema.v1.json
â”œâ”€â”€ Scripts/
â”‚   â”œâ”€â”€ registry_generator.js
â”‚   â”œâ”€â”€ registry_core.js
â”‚   â”œâ”€â”€ build_contracts_web.js
â”‚   â”œâ”€â”€ build_webui.js
â”‚   â””â”€â”€ build.bat
â”œâ”€â”€ Source/
â”‚   â”œâ”€â”€ Core/
â”‚   â”‚   â”œâ”€â”€ domainValidation.ts
â”‚   â”‚   â”œâ”€â”€ validationSchemas.ts
â”‚   â”‚   â””â”€â”€ MidiSysExQueue.ts
â”‚   â”œâ”€â”€ Contracts/
â”‚   â”‚   â”œâ”€â”€ PatchData.ts            â† interfaz canÃ³nica unificada
â”‚   â”‚   â”œâ”€â”€ ModelContract.ts
â”‚   â”‚   â”œâ”€â”€ ImportAdapter.ts
â”‚   â”‚   â”œâ”€â”€ ExportAdapter.ts
â”‚   â”‚   â”œâ”€â”€ HardwareLinkContract.ts
â”‚   â”‚   â”œâ”€â”€ ContractRegistry.ts
â”‚   â”‚   â””â”€â”€ Models/ (15 contratos)
â”‚   â””â”€â”€ Contracts/Adapters/ (nibble, 7â†’8, checksums)
â”œâ”€â”€ WebUI/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ contracts/gen/  â† bundle JS generado (esbuild)
â”‚   â”‚   â”œâ”€â”€ store/ (persistence.js, libraryAdapter.js)
â”‚   â”‚   â”œâ”€â”€ core/ (importEngine, exportEngine, searchEngine, ...)
â”‚   â”‚   â””â”€â”€ ui/components/
â”‚   â””â”€â”€ tests/unit/ (41 archivos)
â”œâ”€â”€ apps/standalone/src-tauri/  â† Tauri 2 + SQLite + Rust CRUD
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ core/src/operations/library.js  â† CRUD puro inmutable
â”‚   â”œâ”€â”€ core/src/search/searchPatches.js
â”‚   â””â”€â”€ contracts/src/ (shim)
â””â”€â”€ fixtures/sysex/  â† dumps reales por fabricante
```

## Credits

- DSP architecture patterns from ABDMS2000, ABDEep, ABDCZ101, ABDJUNiO601
- SysEx adapter patterns inspired by KnobKraft Orm (christofmuc/KnobKraft-orm)
- Built with JUCE 8, C++20, TypeScript, Vite, Tauri, Dexie.js, Zod
## Documentation & Integration Guides

- 📘 [**Guía Técnica de Integración en Sintetizadores (DOCS/SYNTH_INTEGRATION_GUIDE.md)**](DOCS/SYNTH_INTEGRATION_GUIDE.md) — Paso a paso para integrar el Bank Manager en ABDMS2000, ABDCZ101, ABDJUNiO601, ABDEep, etc.
- 📐 [Architecture Documentation](DOCS/architecture.md) — Visión global de subsistemas y contratos.
- 📋 [Contract Matrix](DOCS/contract-matrix.md) — Matriz comparativa de especificaciones por fabricante.
- 🗺️ [Roadmap](ROADMAP.md) — Estado de fases e hitos de integración.
- 🤝 [Handoff Notes](HANDOFF.md) — Notas para desarrollo y mantenimiento.
