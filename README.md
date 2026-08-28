# ABD Universal Bank Manager

> Universal patch & bank management library for all ABDSynths projects — standalone app, embeddable WebView2 module, and portable `.abdbank` format.

## Features

> Estado actualizado 2026-08-26: `[x]` hecho, `[~]` parcial, `[ ]` pendiente. Ver HANDOFF.md → Known Issues.

- [x] **Universal Bank Manager** — Import, organize, export patches (WebUI CRUD funcional)
- [x] **Multi-model support** — Casio CZ, Roland Juno, Korg MS2000/microKORG, Behringer DeepMind 12, Yamaha DX7 (15 ModelContracts)
- [x] **ContractRegistry** — Registro declarativo de contratos con validación; el core/UI se auto-configuran (standalone = bundle completo, plugin = solo su modelo + compatibles)
- [x] **Multi-hardware association** — `hardwareIds` (canónico + compatibles) derivados de `compatibleModels`, en bancos, patches y manifest `.abdbank`; `parameters` reservado para plugins/editores (principio de asepsia)
- [~] **Pluggable Import/Export Adapters** — Interfaces base + motores genéricos SysEx/JSON/`.abdbank`. **Pendiente:** adapters por fabricante (nibble Casio, 7→8 Korg, checksums Roland/DX7), `.mid`, tape `.wav`, clipboard hex
- [ ] **Bidirectional Hardware Link** — Solo la interfaz + cola MIDI; sin dump/fetch real por hardware
- [~] **Patch Fingerprinting** — SHA-256 disponible (`fingerprint.js`, con tests), pero **no integrado** en el flujo de import de la app
- [x] **Native `.abdbank` / `.abdlibrary` Formats** — `.abdbank` = un banco (ZIP con manifest + blobs); `.abdlibrary` = toda la librería multi-banco (import/export en WebUI); el backup Dexie aún es JSON
- [~] **Registry-driven WebUI** — Registry SSOT + panelFactory/paramStore como **kit de editor para los plugins ABD**; el app del gestor no renderiza paneles de parámetros (registry vacío, los ajustes MIDI se derivan del ModelContract)
- [ ] **Cross-project compatibility** — Pendiente (Fase 7: migración de ABDCZ101, ABDEep, ABDJUNiO601)
- [~] **DAW State Persistence** — C++ `BankManagerCore` compila; ValueTree guarda solo índices y el bridge es no-op
- [x] **Parameter Registry (SSOT)** — JSON schema drives C++ headers, JS registry, documentation (vacío hasta que los plugins definan sus parámetros de editor)
- [x] **Async MIDI SysEx Queue** — Rate-limited per hardware (10-100ms), retry logic
- [x] **Zod Validation** — Runtime validation of all import/export data
- [~] **Dexie.js Persistence** — IndexedDB con migraciones v1→v3 y tags M:N (WebUI); auto-backup definido pero **no invocado**

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    ABD UNIVERSAL BANK MANAGER                     │
├──────────────────────────────────────────────────────────────────┤
│  Presentation:  Standalone (Tauri)  │  Plugin Modal (WebView2)   │
│  Contracts:     ModelContract, ImportAdapter, ExportAdapter,     │
│                 HardwareLinkContract                              │
│  Core:          BankStore, PatchStore, Searcher, Persistence     │
│  Storage:       Dexie.js (IndexedDB), localStorage, FileSystem   │
└──────────────────────────────────────────────────────────────────┘
```

## Supported Hardware

| Manufacturer | Models | Bank Capacity | Patch Size | SysEx ID |
|---|---|---|---|---|
| Casio | CZ-101, CZ-1000, CZ-5000, CZ-1 | 16–32 | 128–288 bytes | 0x44 |
| Roland | Juno-106, Juno-60, Juno-6, HS-60 | 128 (2×64) | 18 bytes | 0x41 |
| Korg | MS2000, microKORG, Prophecy | 128 (8×16) | 288 bytes | 0x42 |
| Behringer | DeepMind 12, Pro-800 | 1024 (8×128) | 242 bytes | 0x00 0x20 0x32 |
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
| JUCE Plugin Module (C++) | 🔄 Skeleton (compila; bridge no-op) |
| Web (Vite SPA) | ✅ Core Complete |
| Standalone (Tauri) | ⏸ Not Started (`apps/standalone/` vacío) |
| WASM AudioWorklet | ⏸ Planned |

## Project Structure

```
ABDBankManager/
├── README.md
├── CHANGELOG.md
├── HANDOFF.md
├── ROADMAP.md
├── package.json
├── CMakeLists.txt
├── build.bat
├── schemas/
│   ├── parameters-spec.schema.v1.json
│   ├── program-dump.schema.v1.json
│   ├── bank-file.schema.v1.json
│   ├── library-file.schema.v1.json
│   └── bridge-messages.schema.v1.json
├── Scripts/
│   ├── registry_generator.js
│   ├── registry_core.js
│   ├── build_contracts_web.js
│   ├── build_webui.js
│   └── build.bat
├── Source/
│   ├── Core/
│   │   ├── BankManagerCore.h/.cpp
│   │   ├── PersistenceEngine.ts
│   │   ├── validationSchemas.ts
│   │   └── MidiSysExQueue.ts
│   ├── Contracts/
│   │   ├── ModelContract.ts
│   │   ├── ImportAdapter.ts
│   │   ├── ExportAdapter.ts
│   │   └── HardwareLinkContract.ts
│   ├── Adapters/
│   │   ├── Models/
│   │   ├── Importers/
│   │   ├── Exporters/
│   │   └── Hardware/
│   └── Tests/
├── WebUI/
│   ├── src/
│   │   ├── bridge/
│   │   ├── contracts/
│   │   │   ├── gen/modelContracts.gen.js  ← bundle JS generado (esbuild)
│   │   │   └── modelContracts.js          ← wrapper que lo re-exporta
│   │   ├── store/
│   │   ├── ui/
│   │   │   ├── panelFactory.js
│   │   │   └── components/
│   │   └── styles/
│   └── tests/
├── apps/
│   └── standalone/
├── cpp/
│   ├── ABDBankManagerCore.h/.cpp
│   └── CMakeLists.txt
└── packages/
    ├── contracts/
    ├── core/
    └── adapters/
```

## Credits

- DSP architecture patterns from ABDMS2000, ABDEep, ABDCZ101, ABDJUNiO601
- SysEx adapter patterns inspired by KnobKraft Orm (christofmuc/KnobKraft-orm)
- Built with JUCE 8, C++20, TypeScript, Vite, Tauri, Dexie.js, Zod