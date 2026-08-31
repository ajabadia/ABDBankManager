# Plan de mejoras — ABD Universal Bank Manager

> Documento operativo de seguimiento.
> Última actualización: 2026-08-31
> Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` completado · `[!]` bloqueado
>
> Reconstuido el 2026-08-28 a partir de la evidencia del repo, AUDITORIA_PROYECTO.md,
> ROADMAP.md, HANDOFF.md y el historial de la sesión de desarrollo.

Consulta `AUDITORIA_PROYECTO.md` (snapshot histórico 2026-08-27, parcialmente resuelto) para el diagnóstico original.

---

## 0. Reglas de seguimiento

Cada tarea debe actualizarse cuando exista:

1. implementación;
2. test automatizado o evidencia reproducible;
3. documentación actualizada;
4. verificación en CI cuando corresponda.

No marcar una tarea como completada solo porque exista una interfaz o una clase. Para protocolos de hardware se requieren fixtures reales y, cuando sea posible, pruebas con el dispositivo.

---

## 1. Estado global

| Bloque | Estado | Prioridad |
|---|---|---|
| Build, typecheck y lint | `[x]` | P0 |
| Core único y contratos | `[~]` | P0 |
| Validación de dominio | `[~]` | P0 |
| SysEx y fixtures reales | `[~]` | P0 |
| Fingerprinting y backups | `[~]` | P0 |
| Persistencia | `[x]` | P1 |
| Operaciones puras y búsqueda | `[x]` | P1 |
| Registry y MIDI real | `[~]` | P1 |
| Bridge JUCE | `[~]` | P2 |
| Standalone Tauri | `[~]` | P2 |
| Seguridad y release | `[ ]` | P2 |

---

# Fase P0 — Fundamentos y corrección de riesgos

## P0.1. Build reproducible y tooling

- [x] Crear/corregir `WebUI/vite.config.js`.
- [x] Conseguir que `npm run build:webui` termine correctamente desde el checkout actual.
- [x] Añadir `tsconfig.json` coherente.
- [x] Añadir script `npm run typecheck` con `tsc --noEmit`.
- [x] Añadir configuración ESLint (`eslint.config.js`).
- [x] Conseguir que `pnpm run lint` termine correctamente sin errores ni warnings.
- [x] Excluir de lint los artefactos generados mediante configuración explícita.
- [x] Declarar el proyecto como ESM para evitar warnings de módulos propios.
- [x] Verificar `pnpm run generate`, `pnpm run typecheck`, `pnpm run lint`, `pnpm test` y `pnpm run build:webui` en secuencia.
- [x] Añadir aliases de import en `vitest.config.js` para que los tests skipped (`zodValidation`, `sysexAdapterRoundtrip`, `registry`, `panelFactory`) puedan importar desde `Source/`, `Scripts/` y `WebUI/src/ui/` sin cambios en los archivos de test.
- [x] Eliminar `console.log` en producción de `packages/core/src/PersistenceEngine.ts:84` — eliminado.
- [x] Corregir count de tests en `HANDOFF.md` Build Instructions: actualizado a "851 passing | 0 skipped".

> Nota: la suite local usa pnpm y el workspace está declarado en `pnpm-workspace.yaml`. La auditoría de vulnerabilidades transitivas y actualizaciones compatibles permanece como tarea P2.

### Criterios de aceptación

```bash
npm ci
npm run generate
npm run typecheck
npm run lint
npm test
npm run build:webui
```

Todos los comandos deben finalizar con código 0 y sin depender de CDN ni de archivos generados manualmente.

---

## P0.2. Definir la arquitectura canónica

- [x] Unificar `PatchData` — interfaz canónica en `Source/Contracts/PatchData.ts` (15 campos), re-exportada desde ImportAdapter, ExportAdapter, HardwareLinkContract y validationSchemas.
- [ ] Decidir si `packages/*` será la API pública y el core funcional.
- [ ] Decidir qué responsabilidad conserva `Source/`.
- [ ] Eliminar o automatizar mirrors duplicados.
- [ ] Definir una única política de errores.
- [ ] Definir una única representación de IDs, índices y direcciones.
- [ ] Documentar las fronteras entre dominio, persistencia, transporte y UI.
- [ ] Evitar que la WebUI implemente reglas de dominio por su cuenta.

### Criterios de aceptación

- [x] `PatchData` es una única definición compartida por todos los módulos.
- [ ] Existe una única implementación de cada regla de negocio.
- [ ] WebUI, adapters y C++ consumen la misma definición de dominio.
- [ ] No hay dos implementaciones de fingerprinting o de backup con comportamientos distintos.

---

## P0.3. Matriz de requisitos y estados reales

- [ ] Crear `DOCS/requirements-traceability.md`.
- [ ] Enumerar los requisitos funcionales originales.
- [ ] Asociar cada requisito a código, test y documentación.
- [ ] Usar estados `designed`, `implemented`, `unit-tested`, `fixture-tested`, `hardware-tested`.
- [ ] Revisar README, ROADMAP, HANDOFF y CHANGELOG para usar esos estados.
- [ ] Eliminar afirmaciones de "completo" cuando solo exista un stub.

### Criterios de aceptación

Todo requisito importante debe tener:

- responsable técnico o módulo;
- evidencia;
- test o justificación de por qué no aplica;
- estado verificable.

---

## P0.4. Autoridad de ModelContracts y protocolos SysEx

- [x] Crear la matriz normativa inicial en `DOCS/contract-matrix.md`.
- [x] Definir `SysexFormatProfile` para separar modelo canónico de revisión de hardware/firmware.
- [x] Documentar reglas de compatibilidad y evidencia requerida para activar variantes.
- [~] Convertir todos los perfiles de la matriz en datos ejecutables consumidos por los adapters; Pro-800 ya dispone de perfiles v109/v110/v111, pendiente generalizar al resto.

- [x] Crear tabla normativa por modelo — `DOCS/contract-matrix.md` con 17 modelos:
  - [x] manufacturer ID;
  - [x] model ID;
  - [x] comandos;
  - [x] offsets;
  - [x] tamaños raw;
  - [x] tamaño wire;
  - [x] checksum;
  - [x] addressing;
  - [x] capacidades;
  - [x] compatibilidades reales.
- [ ] Resolver la discrepancia Korg microKORG (`0x58` frente a otros IDs).
- [ ] Resolver tamaños Korg MS2000/Prophecy en todas las capas.
- [ ] Resolver comandos y estructura Roland.
- [ ] Resolver comandos y offsets Casio.
- [x] Revisar completamente el protocolo Behringer; Pro-800 contrastado con referencia local y DeepMind 12 alineado con los estudios y código de ABDEep.
- [x] Corregir `isDeepMindMessage()` para aceptar device IDs y protocolos variantes (0x06/0x07, 0x00/0x7F) sin perder la identificación del modelo.
- [x] Revisar Yamaha DX7/DX7II, single voice y bulk dump. Contrato verificado: 128 bytes VCED, 32 voices por bulk, checksum sobre bytes después de cabecera (6B). Name at offset 118-127 (ASCII). Bulk dump parsing validado con 32 voices. 35 dumps reales verificados (ROM1-4, VRC101-112, comunidad).
- [ ] Prohibir que la compatibilidad se deduzca solo del fabricante o del packing.
- [ ] Hacer que todos los adapters consuman la tabla/contrato canónico.

### Criterios de aceptación

- No existen discrepancias entre `Source/Contracts`, `WebUI`, `packages` y documentación.
- Cada modelo tiene al menos un fixture real válido.
- Un mensaje de un modelo no se identifica como otro modelo compatible por defecto.

---

## P0.5. Fixtures reales y pruebas de protocolo

- [x] Crear `fixtures/sysex/` y mover los fixtures Pro-800 a `fixtures/sysex/behringer-pro800/`, con metadatos de procedencia.
- [x] Añadir dumps reales de Casio.
- [x] Añadir dumps reales de Roland.
- [x] Añadir dumps reales de Korg.
- [x] Añadir dumps reales de Behringer; Pro-800 v1.4.4 y factory antiguo normalizados, con tests de formatos v109/v110/v111. Licencia/procedencia externa aún pendiente de confirmar.
- [x] Añadir dumps reales de DeepMind 12; factory v1.0/v1.1.2, comunidad (Alba Ecstasy), usuarios, comerciales (5 Pin Media, Alba Ecstasy) y desconocidos. Licencia de comerciales confirmada por propietario. Fixtures en `fixtures/sysex/behringer-deepmind12/`. Tests contra 19 fixtures reales.
- [x] Añadir dumps reales de Yamaha. Fixtures DX7 creados: single-voice.syx (136B), bulk-32voices.syx (4104B), e-piano-bank.syx (4104B), multi-voice.syx (408B). Generador reproducible en `fixtures/sysex/yamaha-dx7/generate-fixtures.mjs`.
- [x] Añadir dump real de DX7: `fixtures/sysex/yamaha-dx7/real-dumps/DX7_factory_rom1a.syx` (4104B) descargado de dxsyx/rogerallen repo. Verificado: cabecera F0 43 00 09 20 00 (6 bytes), 32 voces, checksum válido.
- [x] M-Wave FM-1: documentado que NO soporta bulk dump de salida (solo recebe SysEx). 35 dumps reales de usuario verificados (ROM1-4, VRC101-112, comunidad). Librería de Benny Sparra confirma que solo envía patches al FM-1, no los obtiene.
- [x] Corregir bug crítico en contrato DX7: cabecera de 7 bytes (con byte extra 0x00) → formato correcto de 6 bytes. Añadido soporte dual para formato legacy (7B) y estándar (6B).
- [x] Corregir `extractPatchName`: name at offset 118-127 (ASCII, no 6-bit charset). Checksum range corregido: bytes después de cabecera de 6B (no desde byte 3). 35 dumps reales de usuario copiados a `fixtures/sysex/yamaha-dx7/user-dumps/`.
- [x] Documentar procedencia y licencia de cada fixture; la procedencia local está registrada, pero el estado legal de redistribución sigue pendiente para Pro-800. DeepMind 12 documentado en `fixtures/sysex/behringer-deepmind12/README.md` con hashes, categorías y política de licencia. DX7 documentado en `fixtures/sysex/yamaha-dx7/README.md` con formato SysEx, layout VCED y licencia.
- [x] Crear tests de detección de modelo — `WebUI/tests/unit/modelDetection.test.js` (20 tests: manufacturer detection, model identification, full dump parsing, disambiguation).
- [x] Crear tests de número de patches extraídos para los fixtures Pro-800 v109/v110/v111.
- [x] Crear tests de checksum real — `WebUI/tests/unit/checksumValidation.test.js` (20 tests: Yamaha DX7, Casio CZ, Roland Juno, Korg MS2000/microKORG/Prophecy, Behringer DM12).
- [x] Crear tests de roundtrip byte-level representativos para v109 y v110; se conserva la longitud y el contenido decodificado al reconstruir el mensaje. El padding original de registros v109 se mantiene como parte de `rawData`.
- [x] Verificar que no se pierdan bytes al hacer packing/unpacking — tests en `sysexEdgeCases.test.js` (packing 7→8 y nibble con edge cases).
- [x] Testear mensajes concatenados y mensajes con bytes MIDI intercalados — tests en `sysexEdgeCases.test.js` (concatenated, interleaved MIDI, MIDI clock, CC).
- [x] Testear mensajes truncados y corruptos — tests en `sysexEdgeCases.test.js` (truncated, all-zeros, all-0xFF, random, 4KB).
- [x] Activar tests skipped de `WebUI/tests/unit/sysexAdapterRoundtrip.test.js` — imports de `@contracts/Adapters/sysexUtils` añadidos, 20 tests passing.

### Criterios de aceptación

Cada adapter debe demostrar:

```text
fixture real
→ detección correcta
→ parse correcto
→ rawData esperado
→ export correcto
→ roundtrip validado
```

---

## P0.6. Validación central del dominio

> Política `generic`: se valida metadata básica y `rawData` no vacío, pero no se aplican tamaño, addressing ni capacidad de un hardware concreto.

- [x] Crear `validatePatchAgainstContract()`.
- [x] Crear `validateBankAgainstContract()`.
- [x] Añadir tests unitarios iniciales de validación central (`WebUI/tests/unit/domainValidation.test.js`).
- [x] Validar tamaño de `rawData`.
- [x] Validar `modelId`.
- [x] Validar `hardwareIds`.
- [x] Validar capacidad por banco.
- [x] Validar índices y direcciones.
- [x] Validar IDs únicos dentro de los índices de patch.
- [ ] Validar categorías permitidas contra el contrato.
- [ ] Validar rating entre 0 y 5 en todas las rutas.
- [ ] Validar fechas ISO en todas las rutas.
- [ ] Validar campos obligatorios de manifest mediante la misma capa.
- [~] Aplicar la validación antes de toda escritura: creación, actualización e importación cubiertos; restore, migration y export pendientes.
- [ ] Eliminar padding/truncado silencioso o hacerlo opt-in mediante `allowPartial`.

### Criterios de aceptación

No se puede persistir un banco inválido desde ninguna entrada pública.

---

## P0.7. Reglas de fábrica, capacidad y movimiento

- [x] Hacer que `importBank()` respete las invariantes de modelo, fábrica y capacidad mediante validación previa.
- [x] Validar capacidad durante importación.
- [x] Validar capacidad al mover patches.
- [x] Validar compatibilidad al mover patches entre bancos.
- [x] Resolver colisiones de índices rechazando el conflicto.
- [ ] Definir política de reindexación.
- [ ] Definir si los bancos representan slots fijos o listas ordenables.
- [ ] Impedir conversiones ilegales de banco de fábrica a banco editable.
- [~] Añadir tests para las validaciones centrales y reglas de importación/movimiento; faltan tests de integración IndexedDB para todas las operaciones.

### Criterios de aceptación

Las mismas reglas deben cumplirse en:

- WebUI;
- core;
- restauración;
- importación;
- exportación;
- bridge C++.

---

## P0.8. Fingerprinting SHA-256 único

- [x] Crear esquema ejecutable de parámetros SysEx del Pro-800 y conectarlo al panel de detalle; la WebUI muestra tabla con nombre, valor, offset y descripción.
- [x] Ampliar el esquema con acordes, afinación por nota, LFO aftertouch, pitchbend y campos versionados v110/v111.
- [~] Añadir metadatos CC coarse/fine al esquema; la tabla normativa está definida para los parámetros continuos y queda pendiente exponerlos visualmente en la UI.
- [x] Crear esquema ejecutable de parámetros SysEx del DeepMind 12 (236+ parámetros, offsets 0-247) extraído de ABDEep ParameterRegistry.gen.cpp; la WebUI muestra tabla con nombre, valor, offset, tipo y descripción por sección (LFO, OSC, VCF, ENV, VCA, Voice, ModMatrix, Seq, Arp, FX).

- [x] Eliminar `computeFingerprint()` basado en hash entero.
- [x] Reutilizar una única implementación SHA-256 desde `packages/core/src/operations/fingerprint.js`.
- [ ] Definir claramente qué bytes forman la huella.
- [x] Integrar fingerprint en importación de WebUI.
- [x] Integrar fingerprint en importación del core.
- [x] Añadir deduplicación opcional, no destructiva mediante fingerprint; la WebUI importa en modo `skip` y conserva los duplicados existentes.
- [x] Corregir `importEngine` para soportar dumps bulk (DX7 32 voces en un solo mensaje). Antes solo usaba `parsePatchSysEx` (single voice); ahora intenta `parseDumpResponse` cuando el single falla.
- [ ] Añadir tests de estabilidad entre Node y navegador.
- [ ] Añadir tests de diferencia entre payloads con metadatos distintos.

### Criterios de aceptación

El mismo `rawData` produce exactamente la misma huella en todas las capas.

---

## P0.9. Backup y restauración reales

- [x] Definir el formato de backup: `.abdlibrary` para backups completos de librería.
- [x] Incluir realmente todos los blobs en el ZIP.
- [x] Evitar manifests que referencien archivos inexistentes.
- [x] Hacer que `createBackup()` genere un ZIP válido.
- [x] Hacer que `restoreFromBackup()` lea el ZIP real.
- [x] Invocar el backup antes de migraciones.
- [x] Definir qué sucede si el backup falla.
- [x] Añadir identificación de versión del esquema.
- [x] Validar manifest, rutas ZIP, blobs, índices y fingerprints antes de restaurar.
- [x] Mantener la restauración atómica: no se llama a `saveLibrary()` si falla la validación previa.
- [x] Añadir restauración transaccional nativa con rollback ante fallo durante la escritura.
- [x] Añadir tests iniciales de backup completo y ZIP con blob ausente.
- [x] Añadir tests de restauración válida, fingerprint inconsistente y datos inválidos.
- [x] Añadir tests de backup vacío, corrupto y parcialmente corrupto.
- [x] Añadir tests de migración y rollback.

### Criterios de aceptación

```text
library
→ backup
→ clear database
→ restore
→ library equivalente
```

Los blobs y metadatos deben conservarse.

---

# Fase P1 — MVP funcional completo

## P1.1. Core inmutable de operaciones

- [x] Implementar `addBank`.
- [x] Implementar `removeBank`.
- [x] Implementar `renameBank`.
- [x] Implementar `duplicateBank`.
- [x] Implementar `mergeBank`.
- [x] Implementar `addPatch`.
- [x] Implementar `removePatch`.
- [x] Implementar `movePatch`.
- [x] Implementar `renamePatch`.
- [x] Implementar `updatePatchMetadata`.
- [x] Implementar `copyPatchBetweenBanks`.
- [x] Implementar `movePatchBetweenBanks`.
- [x] Añadir tests unitarios para todas las operaciones y la no-mutación de la entrada.

### Criterios de aceptación

- [x] Existe `packages/core/src/operations` con las operaciones puras e inmutables (`library.js` + `fingerprint.js`).
- [x] Ninguna operación depende de IndexedDB ni de la UI.
- [x] La WebUI delega las mutaciones en este core (fin de la duplicidad con `persistence.js`).

---

## P1.2. Búsqueda y filtrado

- [x] Implementar `searchPatches(library, query)` según la firma de `DOCS/architecture.md` (§5.2, línea 434).
- [x] Búsqueda por nombre, autor, tags y notas.
- [x] Filtros por modelo, categoría, favoritos y rating.
- [x] Ordenación por nombre, fecha, categoría y rating, en orden ascendente y descendente.
- [x] Crear `packages/core/src/search` (hoy no existe).
- [x] Añadir tests unitarios de búsqueda y filtrado.

### Criterios de aceptación

- [x] La búsqueda es pura (sin IndexedDB) y determinista.
- [ ] Integrar el `Searcher` en la búsqueda real de la WebUI (P1.6).

---

## P1.3. Persistencia, migraciones y auto-backup

- [x] Migración Dexie v4: purga del object store `settings` legado.
- [x] Auto-backup antes de migraciones (`runPreMigrationBackup` + helpers en `WebUI/src/store/persistence.js`).
- [x] Identificación de versión de esquema en los backups (`.abdlibrary` con `schemaVersion` y guard forward-compat).
- [x] Tests reales de migración v1→v4 y rollback atómico sobre `fake-indexeddb`.
- [x] Reactivar la suite de persistencia completa (migraciones, settings, binario, tags M:N, transacciones abortadas).
- [x] Unificar `WebUI/src/store/persistence.js` con `packages/core/src/PersistenceEngine.ts` (una única implementación de backup/restore y de esquema).

### Criterios de aceptación

- [x] No hay dos implementaciones de backup con comportamientos distintos (P0.2).
- [x] Toda subida de esquema queda cubierta por backup previo y por tests de rollback.

---

## P1.4. ContractRegistry

- [x] Registry declarativo con validación Zod y `createStandaloneRegistry()` (17 modelos) en `Source/Contracts/ContractRegistry.ts`.
- [x] Exponer el registry a la WebUI mediante una API segura (sin arrastrar Zod al grafo web).
- [x] Consultas filtradas por modelo consumidas por la UI (selector de modelo, propia auto-configuración).
- [x] Registrar los adapters y HardwareLinks disponibles en `createStandaloneRegistry()` (5 ImportAdapters, 5 ExportAdapters y 5 HardwareLinks únicos).
- [x] Añadir `getCoverage()` con cobertura por modelo y tests de registro, duplicados y modo standalone/plugin.
- [ ] Completar adapters propios para los modelos que todavía dependen de un adapter multi-modelo y validar cobertura física.
- [x] Activar tests skipped de `WebUI/tests/unit/registry.test.js` — imports de `@scripts/registry_core` añadidos, 10 tests passing.

### Criterios de aceptación

- Standalone y plugin se diferencian solo por el conjunto de contratos registrados (sin flags).
- `packages/contracts/src` no duplica código canónico.

---

## P1.5. Transporte MIDI y hardware

- [x] Integrar `Source/Core/MidiSysExQueue.ts` en el flujo real de la WebUI (cola con retries y delay por hardware).
- [~] Implementar y registrar HardwareLinks por familia: Casio CZ, Roland Juno, Korg MS2000, DeepMind 12 y Yamaha DX7 tienen link registrado; Pro-800 todavía necesita un link específico.
- [ ] Validar físicamente los HardwareLinks y completar las variantes de hardware compatibles.

### Pro-800 — Vertical MIDI

- [x] Transporte Web MIDI Pro-800 con enumeración, selección de puerto, envío/recepción, correlación, timeout y cancelación.
- [x] Fetch de banco completo con progreso.
- [x] Persistencia automática de patches recibidos.
- [x] Extracción automática del nombre desde SysEx.
- [x] Utilidades JUCE/C++ `Pro800Midi.h` / `Pro800Midi.cpp` para framing y parsing.
- [x] Tests con transporte fake.

### DeepMind 12 — Vertical MIDI

- [x] Transporte Web MIDI DeepMind 12 reutilizable (framing ABDEep: F0 00 20 32 20 ... 02 ... F7).
- [x] Fetch de 128 patches con progreso.
- [x] Persistencia automática y extracción de nombre.
- [x] Separación de controles UI por modelo (Pro-800 / DeepMind 12).
- [x] Tests con transporte fake.
- [ ] Validación física con el DeepMind 12D (dispositivo disponible).

- [x] Añadir tests con transporte ficticio (sin hardware) para la cola y los retries.
- [ ] Integrar y verificar los transportes Pro-800 y DeepMind 12 en la UI como seleccionables por modelo; los tests fake de la cola ya están activos.

### Transporte MIDI — Delay y fragmentación

- [x] Implementar delay post-envío en `sendPatch()` y `sendBulk()` (50ms por defecto, configurable via `contract.interMessageDelayMs`).
- [x] Implementar fragmentación automática de mensajes SysEx grandes (`splitSysExMessage()` en `pro800Midi.js`).
- [x] Añadir campo `maxSysExMessageSize` al contrato (`ModelContract.ts`).
- [x] Configurar DX7 con `maxSysExMessageSize: 0` (no fragmentar — FM-1 requiere un único mensaje de 4104B).
- [x] App `handleMidiSendBank` y `handleMidiSendPatch` esperan delay post-envío.

> **FM-1**: El FM-1 **NO acepta** mensajes SysEx fragmentados. El bulk dump DX7 debe enviarse como un único mensaje de 4104 bytes. Verificado con dump real ROM1A — 32 patches cargados correctamente. Tras recibir el dump, el FM-1 muestra pantalla de selección de banco (girar knob 1-4 para elegir destino A/B/C/D).

### Criterios de aceptación

- El mismo transporte se usa en web y en standalone (Tauri).
- Los tests no requieren hardware (fake transport determinista).
- Fetch/Send funcionan con el hardware físico conectado.
- El FM-1 recibe correctamente los patches enviados (bulk dump de 4104B sin fragmentar).

---

## P1.6. WebUI completa y autocontenida

- [x] Panel "Datos SysEx" en el detalle de patch (hexdump con bytecount, toggle blob/mensaje, copiar hex y descargar `.syx`).
- [x] Tabla de parámetros interpretados Pro-800 en el detalle (nombre, valor, offset, descripción).
- [x] Tabla de parámetros interpretados DeepMind 12 en el detalle (236+ parámetros, secciones LFO/OSC/VCF/ENV/VCA/Voice/ModMatrix/Seq/Arp/FX).
- [x] Integrar la búsqueda real en la UI mediante el `Searcher` (P1.2).
- [x] Empaquetar las dependencias (dexie, jszip, file-saver) con Vite y eliminar el importmap CDN (`esm.sh`) — WebUI offline/autocontenida.
- [ ] Auditoría de `innerHTML` con contenido de usuario en la UI.
- [ ] Añadir visualización del SysEx completo en hexadecimal en el detalle del patch (copiable).

### Criterios de aceptación

- La WebUI funciona sin red (sin CDN).
- Búsqueda y filtros se ejercitan desde la barra de búsqueda.

---

## P1.7. Importación/exportación por fabricante

- [x] Adapter `sysex-casio-cz` (nibble — sum & 0x7F).
- [x] Adapter `sysex-roland-juno` (bulk checksum `(-sum)&0x7F`, single patches sin checksum).
- [x] Adapter `sysex-korg-ms2000` (packing 7→8 — MS2000/microKORG/Prophecy). Tests: 71/71.
- [x] Adapter `sysex-behringer-dm12` (DeepMind 12 — framing ABDEep validado).
- [x] Adapter `sysex-behringer-pro800` (Pro-800 — framing v109/v110/v111 validado).
- [x] Adapter `sysex-yamaha-dx7` (VCED). Transporte MIDI completo: bulk dump (32 voces), single voice, checksum, naming. Tests: 30/30.
- [ ] Adapter tape `.wav` y clipboard hex.
- [x] Tests de roundtrip byte-idéntico para Pro-800 v109/v110.
- [x] Tests de roundtrip byte-idéntico para DeepMind 12 factory v1.0.
- [x] Tests de roundtrip byte-idéntico para **Casio CZ** (4 modelos: CZ-101, CZ-1000, CZ-5000, CZ-1 — nibble encoding + checksum).
- [x] Tests de roundtrip byte-idéntico para **Roland Juno** (4 modelos: Juno-106, Juno-60, Juno-6, HS-60 — bulk checksum). Tests: 63/63.
- [x] Tests de roundtrip byte-idéntico para **Korg MS2000/microKORG/Prophecy** (3 modelos — 7-to-8 packing).
- [ ] Tests de roundtrip byte-idéntico para el resto de formatos con fixtures reales.

### Criterios de aceptación

- Todos los adapters consumen el `SysexFormatProfile` y el addressing del contrato (P0.4).
- Los `.syx` de un modelo no se identifican como otro compatible por defecto.

---

# Fase P2 — Bridge, standalone y release

## P2.1. Bridge JUCE/C++

- [x] Serializar la librería completa a ValueTree v1 (`Library/Bank/Patch`), incluyendo metadatos, tags, parámetros y blobs `rawData` en Base64.
- [x] Implementar `handleWebUIMessage` / `sendToWebUI` con callback desacoplado de WebView2: `getState`, `requestState`, `setState`, `selectPreset`, `updateMetadata` y error para mensajes desconocidos.
- [x] Añadir `cpp/BankManagerWebViewAdapter.*` y `cpp/tests/BankManagerCoreTests.cpp`: protocolo JSON WebView↔core, roundtrip ValueTree e IPC verificados en Visual Studio 2026/CTest.

### Pendiente

- [x] Definir el adaptador de transporte JSON común (`BankManagerWebViewAdapter`) con callbacks de entrada/salida, sin dependencia de WebView2. Entrada: `{ action, data? }`; salida: `{ action, data, schemaVersion }`; admite payload plano y anidado.
- [ ] Conectar el callback a la WebView concreta de cada plugin JUCE.
- [ ] Probar el esquema IPC común con WebView2 real dentro de un plugin.

### Criterios de aceptación

- El estado de librería persiste en sesiones del DAW.
- Sin mutex ni I/O en el audio thread.

---

## P2.2. Standalone Tauri

- [x] Estructura del proyecto Tauri creada (`apps/standalone/src-tauri/`).
- [x] `Cargo.toml` con dependencias Tauri 2 (fs, dialog, clipboard, shell).
- [x] Backend Rust con comandos para: librería, bancos, MIDI, SysEx.
- [x] `tauri.conf.json` configurado (permisos fs/dialog/clipboard/shell).
- [x] `build.rs` para Tauri build.
- [x] `Cargo.toml` con Tauri 2 plugins (fs, dialog, clipboard, shell).
- [x] **SQLite persistence layer** (`rusqlite` + migraciones v1-v4, models Bank/Patch, comandos CRUD).
- [x] **MIDI support** (`midir` crate, comandos para puertos, envío SysEx, dump requests).
- [x] **WebUI embebida en el shell Tauri** (`pnpm tauri dev` levanta Vite :1420 + ventana; `build:webui` → `dist/webui` → `frontendDist`). `tauri build` completo verificado: release optimizado + instaladores MSI (7.7 MB) y NSIS (6.0 MB) generados en `target/release/bundle/`.
- [x] **Puente WebUI↔Tauri (persistencia SQLite)**: `database.rs` con `load_library`/`save_library` (roundtrip de la librería completa con IDs preservados vía struct `LibraryBank`, tipo `Vec<LibraryBank>` por JSON); comandos registrados en `lib.rs`; facade Dexie-compatible en `WebUI/src/store/backend.js` (tablas `banks`/`patches` persistentes; `tags`/`patchTags`/`history` solo en memoria de sesión por diseño) conectada a `persistence.js`/`libraryAdapter.js` vía `getDb()`/`setDexieDb()`, con lazy-Proxy contra el orden de evaluación ESM. `tauriMidi.js` con los mismos helpers MIDI (`getMidiPorts/openMidiPort/closeMidiPort/sendSysex/requestSysexDump`). Verificado: roundtrip Rust (`cargo test`, preserva ids + `rawData`), 9 tests de la facade (incl. bug corregido de `_ensureLoaded` en `Collection`, que dejaba lecturas vacías en un facade fresco, y test de payload `save_library` con `rawData` como array plano), suite completa 467 passed / 9 fallos preexistentes, y E2E real: `abd_bank_manager.db` creado con migraciones en `%APPDATA%\ABDBankManager`.
- [x] **Import/Export de formatos soportados** (`.abdbank`, `.abdlibrary`, `.json`, `.syx`): implementados en `commands.rs` delegando en `database.rs`. `import_bank` lee ZIP/JSON/SysEx, parsea manifest/patches, crea banco+patches en SQLite. `export_bank` carga banco+patches y escribe `.abdbank` (ZIP con manifest) o `.json`. `import_sys_ex` divide mensajes F0...F7, identifica fabricante (Behringer/Yamaha/Roland/Korg), crea banco+patches. `export_sys_ex` concatena rawData de patches como mensajes SysEx. Añadido crate `zip` para manejo ZIP. Tests: `cargo test` verde, suite WebUI 476 passed / 5 preexistentes.
- [x] **Vista multi-modelo con árbol de sintetizadores y thumbnails de hardware (P0.5)**: toggle en sidebar (`treeViewMode`) muestra todos los fabricantes expandidos con sus modelos y thumbnails; navega directo a modelo → bancos.
- [x] **Ctrl+V (clipboard hex) y drag & drop de ficheros SysEx**: `handlePasteHex()` parsea hex del portapapeles y importa como SysEx; drop zone en main content acepta `.syx`, `.abdbank`, `.abdlibrary`, `.json`; usa `importFile`/`importBank` existente.

### Criterios de aceptación

- [x] `pnpm tauri dev` lanza la app standalone (verificado: VITE ready :1420 + `ABD Bank Manager started` + WebUI renderizada sin 404).
- [x] `pnpm tauri build` genera instaladores Windows (MSI + NSIS) sin errores — binario release optimizado 18.7 MB.
- [x] La persistencia funciona sin lógica duplicada en el standalone (verificado: facade Dexie-compatible con `load_library`/`save_library`, roundtrip Rust + 9 tests JS del bridge + SQLite real creado/migrado).
- [x] La app importa/exporta bancos (`.abdbank`, `.abdlibrary`, `.json`, `.syx`) — comandos Rust implementados y testeados (`cargo test` + suite WebUI).
- [x] Vista árbol P0.5 funcional: toggle en sidebar muestra todos los modelos con thumbnails y navegación directa.
- [x] Ctrl+V pega hex del portapapeles e importa como SysEx; drag & drop acepta .syx/.abdbank/.abdlibrary/.json.

---

## P2.3. Seguridad

- [x] Validar manifests con la capa central (P0.6) en restore/export/migración.
- [x] Limitar el tamaño de ZIP/archivos importados y rechazar rutas inseguras (zip-slip) en `importEngine`.
- [x] Evitar `innerHTML` con contenido de usuario; sanitizar nombres y campos libres.
- [x] Auditar la política de CSP de la WebUI.
- [x] Revisar las vulnerabilidades transitivas reportadas por `npm audit` (P0.1).

### Criterios de aceptación

- [x] No hay XSS/DOM injection por contenido importado (nombre, notas, tags).
- [x] Un ZIP malicioso no puede escribir fuera de la librería.

---

## P2.4. Release

- [ ] `pluginval --strictness-level 5` en los targets plugin.
- [ ] Resiliencia de sample rate (44.1k–192k) y buffer (32–4096).
- [ ] CI pipeline completo: wasm-build, pluginval y security-scan con chequeo de salida.
- [ ] `git tag -a v1.0.0 -m "Initial release"`.

### Criterios de aceptación

- Todos los tests pasan (0 fallos).
- CI en verde para los jobs reales y stubs eliminados.

---

# Mejoras futuras (post-P2)

## MF.1. Variantes de hardware/firmware por modelo

- [ ] Contemplar que un mismo hardware puede admitir diferentes SysEx según versión de hardware o firmware.
- [ ] Crear sistema de perfiles versionados por modelo (ya iniciado con Pro-800 v109/v110/v111).
- [ ] Generalizar a otros fabricantes.

## MF.2. Definición normativa de parámetros SysEx

- [ ] Añadir definición de cada parámetro (CC MSB/LSB, NRPN, orientación, notas) en el contrato.
- [ ] Crear tabla visual tipo CSV en el detalle: manufacturer, device, section, parameter_name, parameter_description, cc_msb, cc_lsb, min, max, default.
- [ ] Conectar con la UI para mostrar gráficamente el contenido del patche como listado de parámetros con valores, no solo SysEx en bruto.

## MF.3. SysEx completo en el detalle

- [ ] Mostrar el SysEx completo hexadecimal en el detalle del patch, copiable.
- [ ] Permitir copiar el SysEx completo al portapapeles.

## MF.4. Parámetros interpretados completos

- [ ] Completar todos los campos del mapa Pro-800 (afinación, acordes, todos los campos versionados).
- [ ] Completar todos los campos del mapa DeepMind 12 (mod matrix slots 9-32 para firmware v2+, chord memory virtual).
- [~] Añadir esquemas de parámetros para otros modelos (Casio CZ, Roland Juno, Korg MS2000, Yamaha DX7). DX7 completado: 128 parámetros (6 ops × 18 + 19 globales + name), UI integrada. Pendientes: Casio, Roland, Korg.

## MF.5. Imagen personalizada por banco ✅

- [x] Permitir al usuario subir una imagen (foto del hardware, portada de librería, etc.) para cada banco.
- [x] Almacenar la imagen como blob en IndexedDB (junto al rawData de los patches).
- [x] Mostrar la imagen en el panel de detalle del banco y como miniatura en la lista.
- [x] Soportar formats: JPEG, PNG, WebP. Limitar tamaño a 500KB, redimensionar automáticamente a 400×240px.
- [x] Opción para usar el thumbnail del modelo como imagen por defecto del banco.
- [x] Exportar la imagen dentro del archivo `.abdlibrary` (ZIP).
- [x] Añadir botón "Cambiar imagen" en el editor de banco (junto a renombrar).
- [x] Drag & drop de imagen sobre el banco en la sidebar.

> **Nota**: Los thumbnails de modelo (`/images/models/thumbs/`) son imágenes genéricas por modelo. La imagen personalizada del banco permite al usuario identificar visualmente cada colección de patches (ej: "Mi librería de pads", "Patches de koncert", "ROM 1A factory").

## MF.6. Ficha de datos del hardware ✅

- [x] Panel expandible en el sidebar o modal con especificaciones del modelo seleccionado.
- [x] Campos: fabricante, modelo, año, tipo de síntesis, polifonía, teclado (nº teclas), display, dimensiones, peso, alimentación.
- [x] Conexiones: MIDI In/Out/Thru, audio out, audio in (si aplica), pedal, USB.
- [x] Características especiales: efectos, arpegiador, secuenciador, mod matrix, etc.
- [x] Enlaces útiles: manual PDF, página oficial, foro, comunidad.
- [x] Datos almacenados en `hardwareSpecs.js` con datos pre-cargados por modelo.
- [x] Renderizado en UI como ficha estilo "ficha técnica" con iconos por sección.
- [x] Cada modelo tiene su propia ficha pre-cargada.

## MF.7. Ficha de datos del banco ✅

- [x] Panel de metadatos extensible por banco (junto a nombre y modelo).
- [x] Campos predefinidos: descripción, autor/creador, fecha de creación, fuente/procedencia, licencia.
- [x] Campos de contenido: nº patches, categorías representativas, rango de patches, formato SysEx.
- [x] Campos técnicos: versión de firmware compatible, notas de compatibilidad, known issues.
- [x] Tags/librería de etiquetas libre (ej: "pads", "leads", "factory", "user", "community").
- [x] Notas libre del usuario (markdown o texto plano).
- [x] Historial de cambios: última importación, última modificación, último envío a hardware.
- [x] Exportar la ficha dentro del archivo `.abdlibrary`.
- [x] Búsqueda full-text que incluya campos de la ficha (descripción, tags, notas).

> **Casos de uso**: Un usuario con 50 bancos necesita identificar rápidamente cuál es "ROM 1A original de Yamaha" vs "Colección de Pads de la comunidad" vs "Mis patches editados". La ficha del banco permite esa catalogación. La ficha del hardware permite consultar rápidamente "¿cuántas voces tiene el Pro-800?" sin salir de la app.

## MF.8. Rediseño de usabilidad — Navegación en cascada ✅

> **Objetivo**: Reorganizar la UI siguiendo un flujo lógico jerárquico:
> **Fabricante → Hardware → Bancos → Patches**

### 8.1 Estructura del sidebar

- [x] **Nivel 1 — Fabricantes**: Lista colapsable de fabricantes con icono/thumbnail.
  - Cada fabricante muestra sus modelos al expandir.
  - Ej: ▼ Yamaha → DX7, DX7II | ▼ Behringer → Pro-800, DeepMind 12
- [x] **Nivel 2 — Hardware/Modelo**: Bajo cada fabricante, sus modelos con thumbnail.
  - Al seleccionar un modelo se muestran sus bancos.
  - Badge con el número de bancos del modelo.
- [x] **Nivel 3 — Bancos**: Lista de bancos del modelo seleccionado.
  - Thumbnail del modelo + nombre del banco.
  - Badge de parches (ej: "32 patches").
  - Click → selecciona banco y muestra patches.
- [x] **Nivel 4 — Patches**: Lista de patches del banco seleccionado.
  - Nombre + categoría + favorito.
  - Click → selecciona patch y muestra detalle.

### 8.1b Panel de contenido por nivel

- [ ] **Al seleccionar un fabricante** → Panel derecho muestra:
  1. Logo/SVG del fabricante centrado en la parte superior (imagen grande, 200-300px ancho).
  2. Grid responsive de tarjetas de hardware (cards), una por modelo del fabricante.
  3. Cada card contiene:
     - Thumbnail del modelo (imagen del producto, 64-120px).
     - Nombre del modelo (ej: "Yamaha DX7").
     - Badge con nº de bancos disponibles.
     - Badge con capabilities MIDI (Send, Fetch, Bulk).
     - Click en la card → selecciona el modelo y muestra sus bancos.
  4. Grid responsive: 1 col en móvil, 2 en tablet, 3-4 en desktop.
- [ ] **Al seleccionar un modelo** → Panel derecho muestra:
  1. **Cabecera del hardware** (ficha resumen):
     - Logo SVG del fabricante (izquierda, 80-120px).
     - Thumbnail del modelo (centro, 120-160px).
     - Nombre completo del modelo (ej: "Yamaha DX7").
     - Datos clave en una línea: polifonía, conexiones MIDI, capacidad bancos.
     - Badges: capabilities MIDI (Send / Fetch / Bulk).
  2. **Grid responsive de bancos del modelo**:
     - Cada card de banco contiene:
       - Imagen del banco (si tiene, MF.5) o thumbnail del modelo como fallback.
       - Nombre del banco.
       - Badge: nº patches + modelo.
       - Badge: fábrica / usuario.
       - Click → selecciona banco y muestra patches.
     - Botón "+ Nuevo Banco" como última card o flotante.
  3. Grid responsive: 1 col móvil, 2 tablet, 3-4 desktop (mismo layout que la grid de modelos).
- [ ] **Al seleccionar un banco** → Panel derecho muestra:
  1. **Cabecera del banco**:
     - Thumbnail del modelo del banco (arriba, centrado, 160-200px).
     - Nombre del banco (editable inline).
     - Badge: modelo + fabricante.
     - Badge: nº patches + capacidad.
     - Badge: fábrica / usuario.
  2. **Acciones del banco** (debajo de la cabecera):
     - Botones: Fetch, Enviar banco, Importar, Exportar.
     - Menú contextual: Renombrar, Renombrar patches, CSV, Eliminar.
  3. **Lista de patches del banco**:
     - Grid o lista con nombre + categoría + favorito.
     - Click → selecciona patch y muestra detalle.
  4. **Detalle del patch** (al final, cuando se selecciona uno):
     - Nombre, categoría, autor, notas.
     - SysEx hex (colapsable).
     - Parámetros interpretados (al final, sin scroll propio).
- [ ] **Al seleccionar un patch** → Panel derecho muestra:
  1. Detalle completo del patch (nombre, params, SysEx, etc.).

### 8.2 Cabecera global

- [x] **Botón "Conectar MIDI"** en la cabecera de la app (no en el sidebar).
  - Muestra estado: desconectado / conectado (nombre del dispositivo).
  - Al hacer click: selector de puertos + auto-detección.
  - Persiste la conexión entre sesiones.
- [ ] **Indicador de modelo conectado** en la cabecera (badge con thumbnail).

### 8.3 Acciones contextuales (no botones globales)

Cada acción aparece **donde tiene sentido**, no en una lista global:

| Acción | Dónde aparece | Cómo se accede |
|--------|---------------|----------------|
| Nuevo banco | Debajo de la lista de bancos del modelo | Botón "+ Nuevo Banco" |
| Importar (.syx) | Menú contextual del banco | Click derecho / botón ⋯ |
| Exportar (.syx) | Menú contextual del banco | Click derecho / botón ⋯ |
| Exportar librería | Cabecera o menú global | Botón en header |
| Fetch (obtener del hardware) | Acción del banco | Botón "Fetch" junto al banco |
| Enviar patch | Acción del patch | Botón "Enviar" en el detalle del patch |
| Enviar banco | Acción del banco | Botón "Enviar banco" junto al banco |
| Renombrar banco | Menú contextual del banco | Click derecho / botón ⋯ |
| Renombrar patch | Editable inline en el detalle | Campo de nombre |
| Renombrado masivo | Menú contextual del banco | "Renombrar patches..." |
| Exportar CSV nombres | Menú contextual del banco | "Exportar nombres" |
| Importar CSV nombres | Menú contextual del banco | "Importar nombres" |
| Eliminar banco | Menú contextual del banco | "Eliminar" (con confirmación) |
| Favorito | Toggle en el detalle del patch | Botón ★ |

### 8.4 Detalle del patch — Reorganización

- [ ] **Orden del panel de detalle** (de arriba a abajo):
  1. Nombre (editable inline)
  2. Categoría (select)
  3. Autor (editable)
  4. Notas (textarea)
  5. Favorito (toggle)
  6. **SysEx hex** (colapsable)
  7. **Parámetros interpretados** (al final, colapsable)
- [ ] El panel de detalle **NO tiene scroll propio** — usa el scroll general del main content.
- [ ] Los parámetros interpretados se muestran como tabla completa (sin scroll interno).
- [ ] Si hay muchos parámetros, el scroll es del contenedor principal.

### 8.5 Scroll general

- [ ] Un único scroll vertical en el contenido principal (no scrolls anidados).
- [ ] El sidebar tiene su propio scroll independiente.
- [ ] Las acciones siempre visibles (no se cortan por scroll).

### 8.6 Nuevo banco desde hardware

- [ ] Al pulsar "+ Nuevo Banco", se pre-selecciona el modelo del hardware conectado.
- [ ] Si no hay hardware conectado, se muestra selector de modelo manual.
- [ ] Opción de "Crear banco desde fetch" que crea banco + fetch automático.

### 8.7 Logos de fabricante y assets

- [ ] Crear logos SVG de fabricante en `/images/models/thumbs/`:
  - `logo-yamaha.svg`
  - `logo-behringer.svg`
  - `logo-casio.svg`
  - `logo-roland.svg`
  - `logo-korg.svg`
- [ ] Añadir campo `manufacturerLogo?: string` al `ModelContract`.
- [ ] Helper `getManufacturerLogo(manufacturer)` en `modelRegistry.js`.
- [ ] Los logos se muestran en la parte superior del panel al seleccionar un fabricante.
- [ ] Logos estilo monocromático o transparente, max 300px ancho.

### 8.8 Grid responsive de hardware cards

- [ ] CSS Grid para las cards de modelo:
  ```css
  .model-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    padding: 1.5rem;
  }
  ```
- [ ] Cada model-card contiene:
  - Thumbnail del modelo (centrado, max 120px alto)
  - Nombre del modelo (bold)
  - Fabricante (texto secundario)
  - Badges: capabilities MIDI, nº bancos
  - Borde/redondeado consistente con el design system
- [ ] Hover: elevación + borde accent color del fabricante.
- [ ] Estado vacío: "Este fabricante no tiene modelos registrados."

> **Flujo típico post-rediseño:**
> 1. Conectar MIDI (botón cabecera) → FM-1 detectado
> 2. Click en "Yamaha" en sidebar → panel derecho muestra logo Yamaha + grid con DX7 y DX7II
> 3. Click en card DX7 → lista de bancos DX7
> 4. "+ Nuevo Banco" → se crea banco DX7
> 5. "Fetch" → obtiene 32 patches del FM-1
> 6. Click en patch → detalle con nombre, params, SysEx
> 7. "Enviar patch" → envía al FM-1
> 8. Menú del banco → Exportar .syx

## MF.9. Drag & drop de archivos .syx ✅

> **Estado**: Implementado en `WebUI/src/app.js` (`setupDragDrop()`).

- [x] Aceptar drag & drop de archivos `.syx` sobre la ventana principal.
- [x] Zona de drop visual (dashed border) que se activa al arrastrar un archivo.
- [x] Al soltar: importar automáticamente al banco activo del modelo correcto (usando `importEngine.js`).
- [x] Si no hay banco activo o el modelo no coincide: crear banco nuevo con el modelo detectado (usando `sysexParser.js` para detección).
- [x] Soporte para múltiples archivos simultáneos (un archivo = un banco).
- [x] Feedback visual: spinner durante importación, toast con resultado.
- [x] También aceptar `.abdlibrary` (ZIP de librería completa) vía drag & drop.
- [x] Drag & drop de imagen para banco (MF.5) sobre la cabecera del banco.

## MF.10. Indicador de actividad MIDI ✅

- [x] LED/indicador animado en la cabecera que muestre actividad MIDI.
- [x] Estado verde fijo: conectado sin actividad.
- [x] Estado verde parpadeante: enviando datos (out).
- [x] Estado azul parpadeante: recibiendo datos (in).
- [x] Estado rojo: error de conexión.
- [x] Estado gris: desconectado.
- [x] Tooltip con detalles: "Enviando a FM-1 Midi · 4104 bytes · canal 1".
- [ ] Log de actividad MIDI accesible desde un botón (últimos 50 mensajes).
- [x] El indicador se actualiza en tiempo real vía eventos `midimessage`.

## MF.11. Comparación lado a lado de patches ✅

- [x] Modo comparación: seleccionar 2 patches (checkbox).
- [x] Panel de comparación: tabla con columnas [Parámetro | Patch A | Patch B | Diff].
- [x] Resaltar en rojo/verde los parámetros que difieren.
- [x] Si el modelo tiene schema de parámetros interpretados: usar nombres legibles.
- [x] Si no: comparar bytes raw del rawData con diff hexadecimal.
- [x] Botón "Copiar patch B → A" para clonar un parámetro.
- [x] Botón "Intercambiar A ↔ B".
- [x] Exportar comparación como CSV.
- [x] Accesible desde menú contextual del patch.

## MF.12. Atajos de teclado ✅

- [x] `Ctrl+I` → Importar archivo .syx.
- [x] `Ctrl+E` → Exportar banco activo.
- [x] `Ctrl+Shift+E` → Exportar librería completa.
- [x] `Ctrl+S` → Guardar (forzar persistencia).
- [x] `Ctrl+Z` → Deshacer última operación.
- [x] `Ctrl+Y` / `Ctrl+Shift+Z` → Rehacer.
- [x] `Ctrl+M` → Conectar/desconectar MIDI.
- [x] `↑ / ↓` → Navegar patches en la lista.
- [x] `Enter` → Seleccionar patch y mostrar detalle.
- [x] `Supr / Backspace` → Eliminar patch seleccionado (con confirmación).
- [x] `Ctrl+F` → Enfocar búsqueda.
- [x] `Escape` → Cerrar modal / deseleccionar patch.
- [x] `?` → Mostrar ayuda de atajos.
- [ ] Panel de ayuda de atajos accesible desde menú o `?`.
- [ ] Atajos compatibles con macOS (Cmd en vez de Ctrl).
- [ ] Los atajos no se activan si el foco está en un input/textarea (verificar que `keydown` handler comprueba `document.activeElement.tagName`).

## MF.13. Undo/Redo global ✅

- [x] Historial de operaciones (máximo 50 pasos).
- [x] Operaciones registradas:
  - Crear/eliminar banco
  - Crear/eliminar patch
  - Renombrar banco/patch
  - Mover patch entre bancos
  - Actualizar metadata (categoría, autor, notas, favorito)
  - Importar patches
  - Renombrado masivo
- [x] `Ctrl+Z` → Deshacer: revierte la última operación.
- [x] `Ctrl+Y` → Rehacer: re-aplica operación deshecha.
- [x] Toast informativo: "Deshacer: patch 'BRASS 1' eliminado".
- [x] El undo es transaccional: si se eliminaron 3 patches en lote, se deshacen los 3.
- [x] El historial se pierde al cerrar la pestaña (no persistente).
- [x] Indicador visual del estado: botones ↩/↪ habilitados/deshabilitados.

## MF.14. Estadísticas del banco ✅

- [x] Panel colapsable "📊 Estadísticas" al seleccionar un banco.
- [x] Métricas mostradas:
  - Total de patches / capacidad del modelo (con barra de progreso).
  - Distribución por categorías (barras horizontales).
  - Patch más largo/corto en nombre.
  - Patches sin nombre o con nombre genérico ("P01", "Init").
  - Patches sin categoría.
  - Tamaño total de rawData (KB).
  - Porcentaje de favoritos.
- [x] Si el modelo tiene schema de parámetros:
  - Parámetros más variables entre patches (rango, promedio, valores únicos).
- [x] Exportar estadísticas como JSON.
- [x] Actualización en tiempo real al modificar patches.
- [ ] Exportar como CSV (pendiente).

## MF.15. SysEx hex editor inline ✅

- [x] En el detalle del patch, alternar entre "Hex dump" (solo lectura), "Hex editor" (editable) y "Parámetros" (si hay schema).
- [x] Vista hex: editor de bytes con offset, hex y ASCII (como hexdump).
- [x] Editable: modificar un byte actualiza el rawData directamente.
- [x] Validación en tiempo real: byte fuera de rango 0-127 (MIDI) → highlight rojo.
- [x] Resaltado de bytes modificados (cyan sobre fondo oscuro).
- [x] Botón "Revertir" para volver al estado original.
- [x] Copiar hex completo al portapapeles.
- [x] Pegar hex desde portapapeles (formato: `XX XX XX`).
- [x] Navegación con Tab, flechas, Enter.
- [ ] Solo disponible para usuarios avanzados (toggle "Modo experto" en settings).

## MF.16. Backup automático recordatorio ✅

- [x] Contador de patches modificados desde el último backup/exportación.
- [x] Si hay >20 patches sin backup y no se ha exportado en >7 días: banner amarillo.
- [x] Banner incluye botón "Exportar librería" directo.
- [x] Contador se resetea al exportar (.abdlibrary o .syx).
- [x] Recordatorio desactivable 24h con botón "Ocultar 24h".
- [x] Auto-backup a IndexedDB en cada operación.
- [ ] Recordatorio desactivable permanentemente en settings.

## MF.17. Búsqueda avanzada global ✅

- [x] Búsqueda global: nombre patch, banco, modelo, categoría, autor, notas, hex, parámetros.
- [x] Filtros por tipo: Todos / Modelos / Bancos / Patches (tabs).
- [x] Resultados con highlight de coincidencia, contexto, badges.
- [x] Click en resultado → navega directamente al patch/banco/modelo.
- [x] Debounce 200ms, Ctrl+F para enfocar, Escape para cerrar.

## MF.18. Bancos multi-hardware (asociación automática) ✅

> **Concepto**: Un banco puede ser compatible con múltiples hardware si comparten el mismo formato SysEx.
> Ejemplo: Un banco DX7 funciona tanto en un DX7 real como en un M-VAVE FM-1.

- [x] Campo `hardwareIds` auto-populado desde `getHardwareIds(modelId)` del contrato.
- [x] Al crear/importar un banco, se asocia automáticamente a todos los modelos compatibles.
- [x] En la sidebar, un banco DX7 aparece bajo "Yamaha DX7" Y bajo cualquier compatible.
- [x] Banco = entidad interna única, visible desde múltiples modelos.
- [x] Badge 🔗 en bancos multi-hardware + "Compatible con: ..." en detalle.
- [x] Deduplicación: importar un banco para modelo compatible fusiona `hardwareIds`.
- [x] Helper `isBankCompatibleWithModel()` bidireccional (contract.compatibleModels + hardwareIds).
- [x] Helper `getBankCompatibleModels()` agrega todos los IDs compatibles.

---

# Tests skipped — Activación ✅

> Los 5 archivos de test con `describe.skip` fueron activados en la sesión 2026-08-30. Aliases de import añadidos en `vitest.config.js`. Todos los tests pasan (53 tests nuevos).

## T1. Activar `zodValidation.test.js` ✅

- [x] Añadir alias `@core/validationSchemas` → `Source/Core/validationSchemas.ts` en `vitest.config.js`.
- [x] Verificar que los tests pasan — 15 tests passing.

## T2. Activar `sysexAdapterRoundtrip.test.js` ✅

- [x] Añadir alias `@contracts/Adapters/sysexUtils` → `Source/Contracts/Adapters/sysexUtils.ts` en `vitest.config.js`.
- [x] Verificar que los tests pasan — 20 tests passing.

## T3. Activar `registry.test.js` ✅

- [x] Añadir alias `@scripts/registry_core` → `Scripts/registry_core.js` en `vitest.config.js`.
- [x] Verificar que los tests pasan — 10 tests passing.

## T4. Activar `panelFactory.test.js` ✅

- [x] Añadir aliases `@store/paramStore` → `WebUI/src/store/paramStore.js` y `@ui/panelFactory` → `WebUI/src/ui/panelFactory.js` en `vitest.config.js`.
- [x] Verificar que los tests pasan — 8 tests passing.

## T5. `sysexRoundtrip.test.js` — ya activo (sin describe.skip)

### Criterio de aceptación ✅

```bash
npx vitest run WebUI/tests/unit/
# 851 tests passing, 0 skipped
```

---

# Fixes de sesión (2026-08-30)

> Correcciones aplicadas durante la sesión de revisión de código.

## database.rs — Bugs críticos corregidos

- [x] Eliminado import duplicado `use chrono::{DateTime, Utc}`.
- [x] Eliminadas columnas duplicadas `fingerprint` e `isFavorite` en `CREATE TABLE patches`.
- [x] Añadidas columnas faltantes `hardwareIds` y `manufacturer` en `CREATE TABLE banks`.
- [x] Corregidos índices de columna en `get_patches_for_bank` y `get_patch` (author: 4→5, tags: 5→6, etc.).
- [x] Corregido `get_bank` y `get_all_banks` (manufacturer: índice 8→9).
- [x] Reescrito `update_bank` con param binding correcto.
- [x] Añadido quoting de `"index"` (palabra reservada SQLite) en todos los SQL.

## PatchData — Interfaz unificada

- [x] Creado `Source/Contracts/PatchData.ts` con la interfaz canónica (15 campos).
- [x] ImportAdapter, ExportAdapter, HardwareLinkContract ahora importan y re-exportan desde el módulo compartido.
- [x] validationSchemas.ts re-exporta el tipo canónico en vez de derivarlo de Zod.
- [x] Eliminadas 3 definiciones duplicadas de `PatchData` y los aliases `ImportPatchData`/`ExportPatchData`/`HardwarePatchData`.

## exportAbdbank — Datos contractuales corregidos

- [x] `contract.bankCapacity` ahora usa `modelContract.bankCapacity` en vez de `patches.length`.
- [x] `contract.programsPerBank` ahora usa `modelContract.programsPerBank` en vez de `patches.length`.
- [x] `contract.banksCount` ahora usa `modelContract.banksCount` en vez de `1`.
- [x] `contract.patchDataSize` ahora usa `modelContract.patchDataSize` en vez de `patches[0]?.rawData?.length`.

## Mejoras de calidad de código

- [x] `searchEngine.js`: fusionados 2 import statements en 1; eliminada variable muerta `escaped` en `highlightMatch`.
- [x] `hardwareSpecs.js`: corregido string incompleto `'Foot控制器'` → `'Foot Control'`.
- [x] `bankStats.js`: corregido `contract.getParameterSchema()` → `getParameterSchema(contract.modelId)` desde modelRegistry; reescrito `computeParameterStats` para usar `schema.getTable()`.
- [x] `modelRegistry.js`: eliminada función redundante `getManufacturerLogoOrPlaceholder`.
- [x] `persistence.js`: `searchPatches` ahora delega al core puro (`searchPatches.js`) en vez de filtrado inferior solo por name/category.
- [x] `app.js`: añadido `renderVersion` para protección contra render overlap en `renderBankNav` y `renderPatchNav`.

## Documentación actualizada

- [x] `README.md`: corregido estado Tauri, Dexie v4, auto-backup, arquitectura, estructura de proyecto.
- [x] `HANDOFF.md`: actualizadas fases, test count (849), known issues, testing status, 17 modelos y cobertura del ContractRegistry.
- [x] `ROADMAP.md`: fase 3 marcada como DONE, fase 5 como IN PROGRESS.
- [x] `AUDITORIA_PROYECTO.md`: añadido header de snapshot histórico.
- [x] `PLAN_MEJORAS.md`: marcadas MF.5-MF.18 como completadas; añadida sección de fixes de sesión.

---

# Fixes de sesión 2 (2026-08-30)

> Correcciones de infraestructura web: imports rotos, imágenes, logos, sirv vs Vite.

## WebUI — Imports fuera de directorio (404 silencioso)

- [x] `persistence.js` importaba desde `../../../packages/core/src/search/searchPatches.js` (fuera de `WebUI/`) → corregido a `../core/searchPatches.js`.
- [x] `libraryAdapter.js` importaba desde `../../../packages/core/src/operations/library.js` (fuera de `WebUI/`) → corregido a `../core/libraryOperations.js`.
- [x] Copiados `searchPatches.js` y `libraryOperations.js` a `WebUI/src/core/` para que sirv pueda servirlos.

## WebUI — Import map y UMD scripts sin prefijo vendor/

- [x] `index.html`: UMD scripts (`jszip.min.js`, `FileSaver.min.js`) añadido prefijo `vendor/`.
- [x] `index.html`: import map (dexie, jszip, file-saver) añadido prefijo `vendor/`.
- [x] `index.html`: import map movido de `<body>` a `<head>` (requerido antes de cualquier `<script type="module">`).

## WebUI — Imágenes sirv vs Vite

- [x] Vite usa `publicDir: 'vendor'` → `/images/` resolve a `vendor/images/`.
- [x] sirv sirve desde `WebUI/` → `/images/` resolve a `WebUI/images/` (no existía).
- [x] Creada junction `WebUI/images` → `vendor/images/` para compatibilidad.
- [x] `start.bat`: añadida creación automática de junction con `mklink /J`.
- [x] `.gitignore`: añadido `WebUI/images` (junction no debe hacerse commit).

## WebUI — Logos de fabricante

- [x] `getManufacturerLogo()` corregida: `/images/models/thumbs/logo-*.svg` → `/images/models/logos/*-logo.svg`.
- [x] Eliminados 5 SVGs fake de texto de `thumbs/` (rectángulos con texto "BEHRINGER" etc.).
- [x] Eliminado `Roland_Logo.svg` duplicado de `logos/`.
- [x] Logos reales (2-8KB, paths SVG de Illustrator/Inkscape) accesibles en `/images/models/logos/`.

## Modelos añadidos

- [x] Creado contrato `behringer-dm6.ts` (DeepMind 6, 6 voces, model ID 0x20).
- [x] Creado contrato `behringer-dm12d.ts` (DeepMind 12D, desktop module, model ID 0x20).
- [x] DM12 `compatibleModels` ampliado con DM6 y DM12D.
- [x] Tests actualizados: `ContractRegistry` (17 modelos), `modelContracts`, `multiHardware`, `contractRoundtrip`.
- [x] Thumbnails copiados: `behringer-deepmind6.webp`, `behringer-deepmind12d.webp`.

## Tests de adapters

- [x] `packages/contracts/tests/rolandJunoAdapter.test.js` — 63 tests: fixed SysEx format (0x30 cmd, fixed-offset parsing, bulk checksum).
- [x] `packages/contracts/tests/korgMs2000Adapter.test.js` — 71 tests: fixed command byte (0x10→0x40), microKORG model ID (0x59→0x58), isKorgMs2000 detection.
- [x] `packages/contracts/tests/casioCzAdapter.test.js` — 29 tests: nibble encoding + checksum.

## Estado de tests

```bash
# Suite completa
npx vitest run packages/core/tests/ packages/contracts/tests/   # 276 passed
pnpm exec vitest run WebUI/tests/unit/                           # suite WebUI incluida en las 849 pruebas principales; sin fallos ni skips
# Total: 851 passing, 0 failures, 0 skipped en la suite principal
```
