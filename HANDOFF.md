## 5. Ecosystem consolidation — cut decision: app vs embeddable module, Tauri/SQLite/Rust, contracts (2026-09-05)

**Court decision: what lives where.** ABDBankManager is two things sharing one tree: a standalone app (Tauri/SQLite/Rust — now dead) and the embeddable bank-manager module (what MS2000 will consume). The cut point:

- **Stays in ABDBankManager/**: the standalone app (Tauri/SQLite/Rust — see below, dead), the full multi-model tree view, hex editor, stats, build scripts, fixtures, logs.
- **Now in ABDSharedCode/BankManager/ (C++ cut executed 2026-10-06)**: `ABDBankManagerCore`, `BankManagerWebViewAdapter`, `FactoryContentLoader`, `Pro800Midi`, `HardwareMidiPipe` — exposed as INTERFACE `ABDShared::BankManagerCore` (option `ABDSHAREDCODE_BUILD_BANKMANAGER`); `cpp/CMakeLists.txt` consumes it and consumers include `<BankManager/...>`.
- **Later goes to ABDSharedCode/BankManager/**: the canonical TS contracts (ModelContract, ImportAdapter, ExportAdapter, HardwareLinkContract, PatchData) and the 8 per-manufacturer adapters (still canonical in `Source/Contracts/` behind the `packages/contracts` shim); SHA-256 fingerprinting; the embeddable WebUI modal (canonical in `packages/ui/src`, synced to `WebUI/` — deferred so the sync contract keeps working).
- **Consumed from ABDSharedAssets (not defined by the module)**: styles, icons, model images, brand logos, contract JSON (if contracts become JSON — today they are TS, see below).
- **Deferred**: all of the above is a design decision, not executed yet — MS2000 is still in Phase 7 (integration of the embeddable modal). The cut is done after Phase 7 closes, not before.

**Status of Tauri / SQLite / Rust (verified 2026-09-05):** added in `64c343b` (2026-08-31, tag `v0.1.0-standalone`) and then removed from the main line. The 4 files (`apps/standalone/src-tauri/{Cargo.toml, commands.rs, database.rs, tauri.conf.json}`) are `D` in `git status --short`, not on disk (`apps/standalone/` does not exist), and no later commit or branch touches them. SQLite (`rusqlite` + `database.rs`) and the Rust CRUD (`commands.rs`) share the same fate — added and then discarded. The JS runtime no longer references Tauri: `WebUI/src/store/tauriMidi.js` does not exist on disk (was the only Tauri MIDI bridge); `backend.js` has a comment about `invoke('loadLibrary'/'saveLibrary')` but the real code uses `juceInvoke` (JUCE WebView2); `persistence.js` and `app.js` have no Tauri reference. **Dead-code read: yes, Tauri/SQLite/Rust are dead code, historically discarded** — recoverable from `64c343b` if ever needed, not runnable from the project today. The actual standalone host of reference is now `apps/juce-plugin/` (untracked): a JUCE VST3/Standalone with `WebBrowserComponent` + WebView2, the template for production ABD plugins (MS2000 first).

**Contracts — where they belong.** Three layers in `Source/Contracts/`:

1. **ModelContract + 11 model implementations** (`Source/Contracts/Models/*.ts`) — the reusable hardware-description layer. Strong candidate to move to `ABDSharedAssets/contracts/` as the single source of hardware contracts (today they are TS, not JSON — decided in the cut doc `DOCS/bank-manager-module-cut.md` §5; not executed yet).
2. **ImportAdapter / ExportAdapter / HardwareLinkContract + 8 per-manufacturer adapters** — orchestration adapters that belong to the bank-manager module, not to SharedAssets.
3. **PatchData** — canonical patch-data interface; belongs to the bank-manager module (`ABDSharedCode/BankManager/Contracts/PatchData.*`), not to SharedAssets.

**Documentation still out of date (relative to Tauri being dead):**

- `README.md` (v0.4.0) still lists `Standalone (Tauri)` as a platform and says `apps/standalone/src-tauri/` is "In Progress". Update to reflect that the standalone host of reference is now the JUCE plugin template in `apps/juce-plugin/` and that Tauri was discarded.
- `DOCS/architecture.md`: the `DeploymentMode = 'standalone' | 'plugin'` model is still conceptually correct, but `TauriPersistence implements PersistenceEngine` no longer describes the real deployment (WebUI persistence is Dexie.js in browser, XML facade in JUCE plugin). Update to match reality.
- `HANDOFF.md` outro below registers the cut and the dead-code status; the phase table no longer lists "Standalone Tauri app" as an open phase.

**Cut document:** `DOCS/bank-manager-module-cut.md` — full design of the cut (what goes where, contracts disposition, what stays in ABDBankManager, what later goes to ABDSharedCode, why Tauri/SQLite/Rust are dead, what is out of date in the docs).
