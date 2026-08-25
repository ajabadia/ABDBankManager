# ABD Universal Bank Manager

Universal synthesizer patch library, SysEx management, and hardware communication for all ABDSynths projects.

## Architecture

```
@abdsynths/bank-manager (monorepo)
├── packages/contracts   ← ModelContract, ImportAdapter, ExportAdapter, HardwareLinkContract
├── packages/core        ← Pure CRUD, search, fingerprinting, persistence (Dexie.js)
├── packages/adapters    ← Per-synth implementations (CZ-101, Juno-106, MS2000, DM12, DX7...)
├── packages/ui          ← Reusable UI components (BankManagerModal, PatchList, SearchBar)
├── apps/standalone      ← Tauri desktop + Vite SPA
└── cpp/                 ← C++ integration for JUCE plugins (CMake add_subdirectory)
```

## Quick Start

```bash
npm install
npm test
```

## License
MIT — ABD Synths
