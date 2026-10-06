# ABDBankManager — Corte del Módulo Bancario: App vs Módulo Embeddable

> **Fecha:** 2026-09-05
> **Estado:** Ejecutado. **2026-10-06 — corte C++ realizado**: los 9 ficheros del módulo viven en `ABDSharedCode/BankManager/`, registrados en `ABDSharedCode/CMakeLists.txt` como INTERFACE `ABDShared_BankManagerCore` (alias `ABDShared::BankManagerCore`, opción `ABDSHAREDCODE_BUILD_BANKMANAGER`, patrón HardwareMidiDetect). La mitad TS (contratos y adapters) también: los 34 ficheros rastreados de `Source/Contracts/` viven ahora en `ABDSharedCode/BankManager/Contracts/` con shims en sus antiguos paths; **el modal queda pendiente** — ver §4 «Estado de ejecución».
> **Autoría:** Revisión del estado real de Tauri/SQLite/Rust + diseño de corte módulo.

---

## 1. Contexto

ABDBankManager es dos cosas distintas que hoy comparten el mismo árbol de proyecto:

1. **App standalone** — Tauri + WebView2 + CRUD en Rust + SQLite + vista de biblioteca multi-modelo. (Histórico: añadido en `64c343b` P2.2/P2.3, tag `v0.1.0-standalone`, luego eliminado de la línea principal — ver §3.)
2. **Módulo embeddable** — WebUI modal bancario para plugins JUCE (WebView2) + core C++ `ABDBankManagerCore` + contratos/implementaciones en JS (TS) + persistencia Dexie (web) o XML (JUCE). Eso es lo que MS2000 va a consumir, y eso es lo que tiene sentido convertir en un módulo compartido.

El criterio de corte que decide qué va a cada lado es:

> **¿Esto es específico de la app standalone, o es consumable por un synth embebido sin importarle qué más haga la app?**

---

## 2. Qué va a cada lado (corte real)

### 2a. ABDBankManager/ — se queda (app standalone, no compartido)

Todo lo que es propio de la app y no tiene sentido en un synth embebido:

- **Tauri** (`apps/standalone/src-tauri/`) — shell de app, no librería. (Estado: eliminado de línea principal 2026-09-05; ver §3.)
- **SQLite + Rust CRUD** (`Database`, `commands.rs`, `lib.rs`, `Cargo.toml`) — persistencia de app, no módulo. (Estado: eliminado de línea principal; ver §3.)
- **Vista de biblioteca completa** (multi-modelo, árbol de fabricantes, búsqueda global, stats, hex editor, etc.) — UI de la app.
- **Scripts de build del WebUI standalone** (`build_webui.js`, `registry_generator.js`, `generate_real_fixtures.js`, etc.) — herramientas de la app.
- **Fixtures SysEx reales**, catálogo DM12, logs, scripts de debug.

### 2b. ABDSharedCode/BankManager/ — va aquí (módulo embeddable contract-driven)

Lo que un synth (MS2000, ABDCZ101, ABDEep, ABDJUNiO601, y futuros) embebe sin importarle lo que hace la app:

- **C++ `ABDBankManagerCore`** — ✅ movido a `ABDSharedCode/BankManager/ABDBankManagerCore.h/.cpp` (ValueTree v1, blobs Base64, IPC por callback, `HardwareMidiPipe`). Este es el núcleo que un plugin JUCE enlaza.
- **C++ `BankManagerWebViewAdapter`** — ✅ movido a `ABDSharedCode/BankManager/BankManagerWebViewAdapter.h/.cpp` + `ABDSharedCode/BankManager/FactoryContentLoader.h/.cpp` (adaptador JSON ↔ core, sin dependencia de WebView2).
- **C++ `Pro800Midi`** — ✅ movido a `ABDSharedCode/BankManager/Pro800Midi.h/.cpp` (SysEx protocol implementation for Behringer Pro800: `buildDumpRequest`, `parseResponse`, `buildPatchDump` con packing 8-to-7, slot clamp 0–399). Es hardware-specific — va con los ModelContracts de Pro800 y su adaptador, no es reutilizable por otros módulos.
- **C++ `HardwareMidiPipe`** — ✅ movido a `ABDSharedCode/BankManager/HardwareMidiPipe.h` (pipe de transporte agnóstico: `SendFunction`/`ReceiveCallback` callbacks inyectados por el host, `sendToHardware`/`receiveFromHardware`). Genérico, transport-agnostic, reutilizable por cualquier módulo que incruste WebUI + hardware MIDI — no depende de ningún modelo. namespace `ABD::BankManager` (se mantuvo; renombrar a `ABD::shared` queda como decisión futura si otro módulo lo consume).
- **WebView2Bridge/**: **confirmado** — existe en `ABDSharedCode/WebView2Bridge/` (3 archivos, añadidos en `e81ba21 feat(shared)`). `JuceWebView2Component.h` (base JUCE Component con tema + reload + pageLoaded), `WebView2ResourceProvider.h/.cpp` (pipeline de resource provider genérico: normalize -> embedded catalog lookup -> ABDSharedAssets filesystem fallback). Ya lo consume `JuceHardwareMidiPicker` (inherits `abd::webview2::JuceWebView2Component`). Reutilizable por cualquier módulo con WebUI — no es de BankManager ni de ningún modelo en particular.
- **Contratos canónicos** — de `Source/Contracts/` los que definen la interfaz del módulo: `ModelContract.ts`, `ImportAdapter.ts`, `ExportAdapter.ts`, `HardwareLinkContract.ts`, `PatchData.ts`. Va aquí **como TypeScript** (el módulo embebido también tiene parte JS) — o se genera C++ desde ellos (actualmente no hay generación C++ de contratos; es una decisión de futuro).
- **Adapters de import/export por fabricante** — `Source/Contracts/Adapters/*.ts` (Casio CZ, Roland Juno, Korg MS2000, Yamaha DX7, Behringer DM12, Pro-800, AIRA, DeepMind 12 HardwareLink). Va aquí como parte del módulo JS.
- **Fingerprint SHA-256** — `WebUI/src/core/fingerprint.js` (lógica pura). Va aquí si se extrapola a C++ (`juce_cryptography` ya está en el core).
- **El modal WebUI embebible** — `WebUI/src/components/BankManagerModal.js` + `.css` + el host page del modal. Va aquí como WebUI embebido (embed binario vía `juce_add_binary_data`), similar al patrón de `HardwareMidiDetect` y del scope.

### 2c. ABDSharedAssets — consume (no define) lo visual y declarativo

Lo que el módulo embebido consume pero no define:

- **Estilos** (`styles/components/*.css`) — tokens, temas, componentes del modal bancario. El modal lo consume, no lo define.
- **Iconos** (`icons/`) — botones del modal.
- **Modelos e imágenes** (`models/`, `brands/`) — thumbnails de sintetizadores, logos de fabricantes.
- **Contratos JSON** — si se definen contratos canónicos en JSON (espec de hardware, etc.), van aquí como fuente única; el módulo los lee.

**Nota importante:** `ABDSharedAssets/contracts/` existe y está poblado con 32 JSONs de perfiles de hardware + `hardware_profile.schema.json` (esquema JSON Schema 2.0 estricto de validación, 13 KB). Los JSONs cubren Behringer, Casio, Roland, Korg, Yamaha, genéricos y ABD, con `schemaVersion: "2.0"`, `id` canónico, `aliases`, `displayName`, `deviceType`, `brand`, `midiIdentification`, `bankManagement.sysexProtocol` completo, y `functions` detallados en algunos (DX7/DX7II). **Esto es la representación declarativa de maquinaria de hardware — es el nivel que más sentido tiene vivir en ABDSharedAssets/contracts/ como fuente única compartida.** Los TS de `Source/Contracts/Models/` son la implementación de mezcla de bytes (parseFile, serializeFile, buildPatchSysEx, etc.) que consume/consume los JSONs. Ambos niveles pueden coexistir: JSONs = declaración, TS = implementación.

---

## 3. Estado real de Tauri / Rust / SQLite (verificado 2026-09-05)

### Tauri — eliminado, código muerto confirmado

- **Introducido en** `64c343b` (2026-08-31, tag `v0.1.0-standalone`): `apps/standalone/src-tauri/{Cargo.toml, tauri.conf.json, src/commands.rs, src/database.rs}` — 1641 líneas en 4 archivos.
- **Eliminado de la línea principal:** los 4 archivos están `D` (deleted) en el árbol de trabajo (`git status --short`). No están en disco (`apps/standalone/` no existe). `git ls-tree -r HEAD` los lista como existentes en `HEAD` pero no en el working tree.
- **Solo un commit** en toda la historia de `main` toca `apps/standalone/` o `*.rs` — `64c343b`. No hay commits posteriores, no hay rama, no hay tag que mantenga vivo el código.
- **Disponible en disco:** `apps/standalone/` no existe. `src-tauri/` no existe. No hay `.rs`, no hay `Cargo.toml` corriendo.

**Conclusión:** Tauri fue añadido en P2.2/P2.3 y luego eliminado de la línea principal. El código de esos 4 archivos no está en `main`. Es código muerto histórico — si se necesita, está recuperable de `64c343b`.

### SQLite + Rust — mismo destino: código muerto, solo histórico

- `database.rs` (771 líneas): wrapper `rusqlite::Connection` + `Arc<Mutex<>>`, schema con `banks`, `patches`, `tags`, `patchTags`, `history`, `__migrations`, migraciones, `PRAGMA foreign_keys = ON`. Solo en `64c343b`.
- `commands.rs` (803 líneas): comandos Tauri `#[command]` para CRUD bancos/patches, import/export `.abdbank` (ZIP, `manifest.json`), persistencia `State<Database>`, SysEx vía `std::fs` + `midiread`/`midisend`. Solo en `64c343b`.
- `lib.rs` (221 líneas): `#[cfg_attr(..., tauri::macos_alias)]`, `Builder::default().run();`. Solo en `64c343b`.
- `Cargo.toml` (220 líneas): dependencias `tauri 2`, `tauri-plugin-fs 2`, `tauri-plugin-dialog 2`, `tauri-plugin-clipboard-manager 2`, `tauri-plugin-shell 2`, `rusqlite 0.31` (con `bundled`), `chrono`, `uuid`, `tokio`, `anyhow`, `zip 0.6`, `midir 0.9`. Solo en `64c343b`.
- `tauri.conf.json` (39 líneas): `productName: "ABD Bank Manager"`, `devUrl: "http://localhost:1420"` sirviendo `../../../dist/webui`. Solo en `64c343b`.

**Conclusión:** SQLite vía `rusqlite` + CRUD Rust + contenedor Tauri son **todo código muerto** que fue añadido y luego retirado de la línea principal. No hay rastro en los archivos JS actuales (`backend.js`, `persistence.js`) de que usen `invoke` ni `loadLibrary/saveLibrary` de Tauri — usan Dexie.js en navegador y facade XML JUCE en plugin.

### Archivos JS que referenciaban Tauri — estado actual

| Archivo | Referencia Tauri | Estado |
|---|---|---|
| `WebUI/src/store/tauriMidi.js` | `import` de comandos Tauri MIDI | **No existe en disco** (eliminado con `apps/standalone/`). Era el único puente MIDI de Tauri. Ahora el puente MIDI real es `hardwareMidi.js` (bridge del plugin) y `pro800Midi.js` (Web MIDI nativo). |
| `WebUI/src/store/backend.js` | Comenta `invoke('loadLibrary'/'saveLibrary')` | El comentario existe (líneas 7-8, 194, 238), pero el código real usa `juceInvoke` (JUCE WebView2), no Tauri. **No es código muerto — es documentación del path usado.** |
| `WebUI/src/store/persistence.js` | No referencia Tauri | Usa Dexie.js + `libraryAdapter.js`. Clean. |
| `WebUI/src/app.js` | No referencia Tauri | Usa `bridgeManager.js` (plugin-host / JUCE / WebView2 / mock). No Tauri. |

### `apps/juce-plugin/` — ¿existe?

Sí — `apps/juce-plugin/` está **untracked** (`?? apps/juce-plugin/` en `git status --short`). Es el host de referencia JUCE (VST3/Standalone con `WebBrowserComponent` + WebView2) que sirve de plantilla para los plugins de producción (MS2000 y los demás). No es Tauri, no es Rust, es C++/JUCE. El plano de futuro es repetir este patrón en los plugins ABD reales.

### `devserver/` — ¿existe?

No está en el árbol tracked ni en `git ls-tree -r HEAD` bajo `apps/devserver`. El `README.md` de v0.4.0 menciona `apps/devserver/` como historia eliminada. No hay rastro de Tauri o Rust en la historia de `devserver/` (solo commits de carpeta vacía y README).

### Estado de la documentación interna (ahora desactualizada respecto a Tauri)

- `README.md` de v0.4.0: sigue mencionando `Standalone (Tauri)` en la tabla de arquitectura (línea 31: "Standalone (Tauri) | Plugin Modal (WebView2)") y en §Platforms ("Standalone (Tauri) | In Progress (`apps/standalone/src-tauri/` con SQLite + comandos CRUD)"). **Desactualizado** — el Tauri ya no está en la línea principal.
- `DOCS/architecture.md`: menciona `class TauriPersistence implements PersistenceEngine` como clase conceptual, y `type DeploymentMode = 'standalone' | 'plugin'` con Standalone = "si hay >1 modelo registrado". Conceptualmente sigue válido como modelo de despliegue (standalone vs plugin), pero la implementación concreta de Tauri ya no es el standalone.
- `HANDOFF.md` OUTRO: aún referencia "Phase 5: Standalone Tauri app" como pendiente. **Hay que actualizarlo** — la fase 5 ya no es Tauri.
- `CHANGELOG.md` [Unreleased] y [v0.4.0]: mencionan Tauri en contextos históricos (SCP, manifest, Tauri commands, Tauri persistence) pero no como feature activa.

---

## 4. ¿Tiene sentido el corte ahora?

**No todavía** — MS2000 está en Fase 7 (integración del modal embebible). Hacer el corte del módulo compartido antes de que MS2000 haya consumido e validado el modal embebible introduciría una capa extra de abstracción prematura.

**Cuándo tiene sentido:** una vez que el modal embebible está estable en MS2000 y la integración está completa (Fase 7 cerrada), el corte del módulo compartido es un paso natural de refactorización — mover `cpp/ABDBankManagerCore.*`, los contratos, los adapters, y el modal WebUI a `ABDSharedCode/BankManager/`, registrar el bloque en `ABDSharedCode/CMakeLists.txt` (patrón `HardwareMidiDetect`), y actualizar los consumidores (MS2000 primero, luego los demás).

### Estado de ejecución (2026-10-06)

La condición de corte se cumplió (MS2000 Fase 7 ✅ COMPLETADA y el modal se integra vía `BankManagerModal` + `Scripts/sync_bankmanager_ui.js`). Se ejecutó **la mitad C++**:

- **Hecho:** los 9 ficheros (`ABDBankManagerCore.*`, `BankManagerWebViewAdapter.*`, `FactoryContentLoader.*`, `Pro800Midi.*`, `HardwareMidiPipe.h`) están en `ABDSharedCode/BankManager/`; `ABDSharedCode/CMakeLists.txt` expone la INTERFACE `ABDShared_BankManagerCore` / alias `ABDShared::BankManagerCore` (option `ABDSHAREDCODE_BUILD_BANKMANAGER`, default OFF, patrón `HardwareMidiDetect`); el root de ABDBankManager la fuerza a ON; `cpp/CMakeLists.txt` ya no tiene fuentes propias — `ABDBankManagerCore` (STATIC) enlaza el target compartido y sus `.cpp` se compilan UNA vez dentro del estático (misma artefacto/ci: `ABDBankManagerCore.lib`).
- **Consumidores actualizados:** `apps/juce-plugin/PluginProcessor.{h,cpp}` y `cpp/tests/BankManagerCoreTests.cpp` incluyen `<BankManager/...>`; la raíz de ABDSharedCode llega como PUBLIC include de `ABDBankManagerCore` (sin repropagar los INTERFACE_SOURCES a cada consumidor).
- **Standalone (`cmake -S cpp`, lo que usa ci-lib.yml):** `cpp/CMakeLists.txt` se auto-integra (JUCE vía submódulo `GITS/JUCE`, ABDSharedCode vía hermano local o FetchContent de `master`) — configurado exitosamente. `ci-lib.yml` solo se dispara en tags, así que el FetchContent de `master` resuelve cuando ambos repos estén fusionados.
- **Dormido (no-regresión):** el embed `ABD_FACTORY_CONTENT_EMBEDDED` de `FactoryContentLoader.cpp` nunca estuvo definido por ningún CMake (antes y después del corte) y `factory-content-staging/` está vacío — la rama embebida sigue apagada, igual que antes.
- **Hecho (mitad TS, 2026-10-06):** los 34 ficheros rastreados de `Source/Contracts/` (8 adapters + barrel `Adapters/index.ts`, `Models/`, `ModelContract`, `HardwareLinkContract`, `ImportAdapter`, `ExportAdapter`, `ContractRegistry`, `Midi`, `PatchData`, `Pro800*`, `SysEx/`, `SysexFormatProfile`, barrel raíz) son canónicos en `ABDSharedCode/BankManager/Contracts/`. En su antiguo path queda un **shim por fichero** (`export * from '<…>/ABDSharedCode/BankManager/Contracts/…'` + `export { default }` donde el original lo exportaba), así ni los importadores relativos ni el alias `@contracts` de `vitest.config.js` cambian; `npm run generate` (esbuild), `tsc` y vitest resuelven a través de ellos hacia el hermano `../ABDSharedCode`.
- **Extracción SSOT:** `HARDWARE_QUEUE_CONFIGS` salió de `Source/Core/MidiSysExQueue.ts` (valores idénticos, verificados byte a byte) a `BankManager/Contracts/HardwareQueueConfigs.ts`; `MidiSysExQueue.ts` lo importa vía el shim `Source/Contracts/HardwareQueueConfigs.ts` y lo re-exporta. La cirugía dejó staged = HEAD + solo ediciones del corte y los deltas ajenos sin commitear.
- **CI/entorno:** los 3 jobs npm de `ci.yml` clonan el hermano (`git clone --depth 1 … ../ABDSharedCode`) antes de `generate`/`test`, y `npm run verificar:entorno` falla con instrucción clara si falta (el check va en `main()`, no en `verificar()`: esta es una función pura sobre un árbol fixture y sus tests exigen que no conoce nada fuera de él).
- **Preservación del WIP ajeno (no commiteado):** los deltas sin commitear de 12 de los 34 ficheros (+520/−149) viajan ahora como cambios **sin commitear en ABDSharedCode** (staged = HEAD + solo mis ediciones; worktree = HEAD + delta ajeno); los 5 splits `roland-aira-*` (untracked) se copiaron igual, sin trackear. Nada ajeno se commiteó en ninguno de los dos repos.
- **Pendiente (deferido, decisión consciente):** el modal (canónico en `packages/ui/src`, sincronizado a `WebUI/src/components/bank/` por `Scripts/sync_bankmanager_ui.js`). Moverlo rompería el contrato de sync; se hace en un paso posterior.

El Tauri/SQLite/Rust muerto no tiene que ver con este corte — es historia que ya fue eliminada. El documento de corte servirá para que, cuando se haga el corte, haya claro qué va a cada lado.

---

## 5. Contratos: qué va a ABDSharedAssets/contracts/ (ya existe y está poblado) vs qué se queda en el módulo

`ABDSharedAssets/contracts/` **ya existe y está poblado** con 32 JSONs de perfiles de hardware + `hardware_profile.schema.json`. No es una carpeta vacía — es la representación declarativa de maquinaria de hardware del monorepo.

### 5a. JSONs de `ABDSharedAssets/contracts/` — fuente declarativa compartida (ya en su lugar)

Los 32 JSONs son la definición declarativa de hardware en formato JSON Schema `2.0`:

| Grupo | Archivos | Cobertura |
|---|---|---|
| Behringer | deepmind12, deepmind12d, deepmind6, pro800, pro-vs-mini, jt4000, modular_140 | 7 |
| Casio | cz1, cz1000, cz101, cz5000 | 4 |
| Roland | juno106, juno6, juno60, hs60, aira-bitrazer, aira-demora, aira-patch_spec, aira-scooper, aira-submodules, aira-torcido | 10 |
| Korg | ms2000, microkorg, prophecy | 3 |
| Yamaha | dx7, dx7ii | 2 |
| Genéricos | generic_midi_synth, mock_va_synth, manual_eurorack_vcf | 3 |
| ABD | abd_sm002 | 1 |
| Schema | hardware_profile.schema.json | 1 (13 KB, validación estricta) |

Cada JSON tiene: `schemaVersion: "2.0"`, `id` canónico, `aliases`, `displayName`, `description`, `deviceType` (enum de 7 valores), `brand` + logos, `midiIdentification` (manufacturerIdHex, modelIdHex, sysexHeaderHex, autoDetectSysEx, portNameMatches), `bankManagement` (bankCapacity, banksCount, programsPerBank, patchDataSize, patchNameMaxLength, categories, addressingFormat, compatibleModels, sysexProtocol con encoding/checksumAlgorithm/modelIdByteHex/allDumpCommandHex/etc.), y en algunos `functions` (DX7/DX7II) con controles detallados.

**Esto es el nivel declarativo de maquinaria de hardware — ya vive en ABDSharedAssets/contracts/ como fuente única compartida.** El schema `hardware_profile.schema.json` es la validación estricta que garantiza que los JSONs cumplen el contrato.

### 5b. TS de `Source/Contracts/Models/` — implementación de mezcla de bytes (el otro nivel)

Los 11 archivos TS de `Source/Contracts/Models/` (casio-cz, korg-ms2000, korg-prophecy, roland-aira, roland-juno, yamaha-dx7, behringer-dm12, behringer-dm12d, behringer-dm6, behringer-pro800 + barrel index.ts) son la **implementación de mezcla de bytes**: parseFile, serializeFile, buildPatchSysEx, buildDumpRequest, parseDumpResponse, detectHardware, verifyChecksum, getProgramAddress, etc. El barrel agrupa 10 modelos con `allModelContracts`, `modelContractMap`, `getModelContract`, `getCompatibleModels`, `getHardwareIds`, `getContractsForManufacturer`, `getMidiConfig`.

**Son dos niveles distintos que pueden coexistir:**
- **JSONs** = declaración de hardware (qué es, cómo se identifica, cómo se gestionan los bancos, cómo es el protocolo SysEx) → ABDSharedAssets/contracts/
- **TS** = implementación de mezcla de bytes (cómo se codifica/descodifica el patch, cómo se construye el SysEx, cómo se detecta el hardware en runtime) → Source/Contracts/Models/ o, si se mueve al módulo compartido, ABDSharedCode/BankManager/Contracts/Models/

### 5c. ¿Duplicación o complementariedad?

No es duplicación — es complementariedad de niveles, pero hay que vigilar:
- Los JSONs ya cubren el mismo especto de modelos que los TS (casio-cz ↔ casio_cz1.json, korg-ms2000 ↔ korg_ms2000.json, yamaha-dx7 ↔ yamaha_dx7.json, behringer-pro800 ↔ behringer_pro800.json, roland-aira ↔ varios roland_aira_*.json).
- Los JSONs son la representación declarativa que cualquier herramienta (validador, generador de documentación, UI de catálogo) puede consumir sin depender de TS.
- Los TS son la implementación runtime que JS del bank manager usa para mezclar bytes en realidad.

**Riesgo de divergencia:** si un JSON se editó y el TS correspondiente no, hay desfase. Algunos JSONs (ej. `casio_cz1.json`) tienen en `description` una referencia explícita al TS ("SSOT: Source/Contracts/Models/casio-cz.ts") lo que sugiere que los TS son la fuente única de verdad actual y los JSONs son derivados (o viceversa). Hay que aclarar cuál es la SSOT en cada modelo.

### 5d. Recomendación de orden

1. **Verificar cobertura:** los 10 modelos de `Source/Contracts/Models/index.ts` vs los 31 JSONs de `ABDSharedAssets/contracts/` — ¿hay JSONs sin modelo TS correspondiente? ¿hay modelos TS sin JSON correspondiente? Especialmente AIRA (7 JSONs AIRA vs 1 modelo TS `roland-aira.ts`) y los de Fase 0 (jt4000, modular_140, pro-vs-mini, cz1000, cz5000, hs60, juno6, juno60, microkorg, prophecy, dx7ii) que pueden ser JSONs nuevos sin TS aún.
2. **SSOT por modelo:** para cada modelo, documentar si la SSOT es el JSON o el TS, o si hay sync bidireccional. Si los JSONs son la SSOT declarativa, los TS deberían generarse o validarse contra ellos; si los TS son la SSOT implementativa, los JSONs deberían generarse desde los TS (como hace el registry_generator del ParameterRegistry).
3. **Fusión recomendada:** no mover los TS a ABDSharedAssets/contracts/ como TS (sería mezclar niveles). Mantener JSONs en ABDSharedAssets/contracts/ como declaración compartida, y TS en Source/Contracts/Models/ (o movidos al módulo bancario como implementación) como lógica de mezcla de bytes. El barrel TS puede leer los JSONs para obtener la configuración declarativa y aplicarla en la mezcla de bytes.

---

## 6. Adapters (`Source/Contracts/Adapters/`) → van al módulo, no a assets

Los 8 adaptadores concretos (casioCzAdapter, rolandJunoAdapter, korgMs2000Adapter, yamahaDx7Adapter, behringerDm12Adapter, behringerPro800Adapter, behringerDeepMindAdapter, rolandAiraAdapter) son lógica de orquestación de import/export/HardwareLink que consume ModelContract. Pertenecen al módulo bancario, no a ABDSharedAssets. Se mencionaron en §2b.

- `README.md` (v0.4.0): sigue mencionando `Standalone (Tauri)` como plataforma. Actualizar para reflejar que el standalone es ahora JUCE/WebView2 (referencia `apps/juce-plugin/`) y que Tauri fue descartado.
- `DOCS/architecture.md`: el modelo conceptual `DeploymentMode = 'standalone' | 'plugin'` sigue válido, pero la implementación de `TauriPersistence` ya no es la realidad. Actualizar para reflejar que el despliegue standalone es el plugin JUCE de referencia + WebView2, no Tauri.
- `HANDOFF.md` OUTRO: actualizar para eliminar "Phase 5: Standalone Tauri app" como fase pendiente y registrar que Tauri/SQLite/Rust fueron descartados (ver §3 para detalles de commits).
- `CHANGELOG.md`: en [Unreleased] y [v0.4.0] se mencionan Tauri en contextos históricos; OK mantenerlos como referencia histórica, pero aclarar que no son feature activa.

---

## 8. Resumen ejecutivo

| Aspecto | Estado real 2026-09-05 |
|---|---|
| Tauri | Eliminado, código muerto histórico (commit `64c343b`, tag `v0.1.0-standalone`, 4 archivos eliminados de línea principal) |
| SQLite + Rust | Mismo destino: código muerto, solo en `64c343b` |
| `apps/juce-plugin/` | Existe como untracked — host de referencia JUCE (VST3/Standalone + WebView2), plantilla para plugins de producción |
| `devserver/` | Ausente en tracked; historia eliminada |
| Corte del módulo bancario (app vs módulo embeddable) | **Ejecutado 2026-10-06** — C++ (9 ficheros en `ABDSharedCode/BankManager/`, INTERFACE target + consumidores, ver §4) y TS (34 ficheros + `HardwareQueueConfigs` → `ABDSharedCode/BankManager/Contracts/` con shims en los paths originales). Modal aplazado. |
| Contratos (`Source/Contracts/Models/`) → ABDSharedAssets/contracts/ | Candidato fuerte a mover como fuente única de maquinaria de hardware (futuro; son TS, no JSON todavía) |
| Adapters (`Source/Contracts/Adapters/`) → ABDSharedCode/BankManager/Contracts/ImportExport/ | Van al módulo bancario, no a assets |
|| `ABDSharedAssets/contracts/` | **Existe y está poblado** con 32 JSONs + schema `hardware_profile.schema.json` (31 perfiles de hardware con `schemaVersion: "2.0"`, `bankManagement.sysexProtocol` completo, `functions` en algunos). Es la representación declarativa compartida — ya en su lugar. Los TS de `Source/Contracts/Models/` son implementación de mezcla de bytes (nivel distinto, complementario). Hay que verificar cobertura JSONs↔TS y decidir SSOT por modelo.

---

## 9. Referencias

- `64c343b` (2026-08-31): `P2.2/P2.3 complete: Tauri standalone SQLite persistence, Import/Export, Tree view, Ctrl+V, Drag&Drop, MSI+NSIS installers` — tag `v0.1.0-standalone`, añadió los 4 archivos Tauri/SQLite/Rust.
- `b5883ac` (2026-08-31): `P2.4 lib: CMake export config + versioned headers for find_package(ABDBankManager)`.
- `0b89465` (2026-09-04): `refactor: adaptadores SysEx a contratos (source of truth) + contrato softsynth abd-sm002` — tag `v0.3.0-lib`.
- `git status --short ABDBankManager/`: `D apps/standalone/src-tauri/Cargo.toml`, `D apps/standalone/src-tauri/src/commands.rs`, `D apps/standalone/src-tauri/src/database.rs`, `D apps/standalone/src-tauri/tauri.conf.json` — confirmación de eliminación en línea principal.
- `git ls-tree -r HEAD --name-only`: los 4 archivos aparecen en `HEAD` pero no en el working tree.
- `apps/juce-plugin/`: untracked (host de referencia JUCE).
- `WebUI/src/store/tauriMidi.js`: no existe en disco (eliminado).
- `WebUI/src/store/backend.js`: comentario de `invoke('loadLibrary'/'saveLibrary')` existe, pero código real usa `juceInvoke`.
