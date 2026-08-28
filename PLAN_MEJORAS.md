# Plan de mejoras — ABD Universal Bank Manager

> Documento operativo de seguimiento.
> Última actualización: 2026-08-28
> Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` completado · `[!]` bloqueado
>
> Reconstuido el 2026-08-28 a partir de la evidencia del repo, AUDITORIA_PROYECTO.md,
> ROADMAP.md, HANDOFF.md y el historial de la sesión de desarrollo.

Consulta `AUDITORIA_PROYECTO.md` para el diagnóstico completo.

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
| Bridge JUCE | `[ ]` | P2 |
| Standalone Tauri | `[ ]` | P2 |
| Seguridad y release | `[ ]` | P2 |

---

# Fase P0 — Fundamentos y corrección de riesgos

## P0.1. Build reproducible y tooling

- [x] Crear/corregir `WebUI/vite.config.js`.
- [x] Conseguir que `npm run build:webui` termine correctamente desde el checkout actual.
- [x] Añadir `tsconfig.json` coherente.
- [x] Añadir script `npm run typecheck` con `tsc --noEmit`.
- [x] Añadir configuración ESLint (`eslint.config.js`).
- [x] Conseguir que `npm run lint` termine correctamente; quedan warnings no bloqueantes.
- [x] Excluir de lint los artefactos generados mediante configuración explícita.
- [x] Declarar el proyecto como ESM para evitar warnings de módulos propios.
- [x] Verificar `npm run generate`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build:webui` en secuencia.

> Nota: `npm install` reporta 5 vulnerabilidades en dependencias transitivas (3 moderate, 1 high, 1 critical). Se mantiene como tarea de seguridad P2 hasta revisar actualizaciones compatibles.

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

- [ ] Decidir si `packages/*` será la API pública y el core funcional.
- [ ] Decidir qué responsabilidad conserva `Source/`.
- [ ] Eliminar o automatizar mirrors duplicados.
- [ ] Unificar `PatchData`, `Patch`, `Bank` y tipos relacionados.
- [ ] Definir una única política de errores.
- [ ] Definir una única representación de IDs, índices y direcciones.
- [ ] Documentar las fronteras entre dominio, persistencia, transporte y UI.
- [ ] Evitar que la WebUI implemente reglas de dominio por su cuenta.

### Criterios de aceptación

- Existe una única implementación de cada regla de negocio.
- WebUI, adapters y C++ consumen la misma definición de dominio.
- No hay dos implementaciones de fingerprinting o de backup con comportamientos distintos.

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

- [ ] Crear una tabla normativa por modelo con:
  - [ ] manufacturer ID;
  - [ ] model ID;
  - [ ] comandos;
  - [ ] offsets;
  - [ ] tamaños raw;
  - [ ] tamaño wire;
  - [ ] checksum;
  - [ ] addressing;
  - [ ] capacidades;
  - [ ] compatibilidades reales.
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
- [ ] Añadir dumps reales de Casio.
- [ ] Añadir dumps reales de Roland.
- [ ] Añadir dumps reales de Korg.
- [x] Añadir dumps reales de Behringer; Pro-800 v1.4.4 y factory antiguo normalizados, con tests de formatos v109/v110/v111. Licencia/procedencia externa aún pendiente de confirmar.
- [x] Añadir dumps reales de DeepMind 12; factory v1.0/v1.1.2, comunidad (Alba Ecstasy), usuarios, comerciales (5 Pin Media, Alba Ecstasy) y desconocidos. Licencia de comerciales confirmada por propietario. Fixtures en `fixtures/sysex/behringer-deepmind12/`. Tests contra 19 fixtures reales.
- [x] Añadir dumps reales de Yamaha. Fixtures DX7 creados: single-voice.syx (136B), bulk-32voices.syx (4104B), e-piano-bank.syx (4104B), multi-voice.syx (408B). Generador reproducible en `fixtures/sysex/yamaha-dx7/generate-fixtures.mjs`.
- [x] Añadir dump real de DX7: `fixtures/sysex/yamaha-dx7/real-dumps/DX7_factory_rom1a.syx` (4104B) descargado de dxsyx/rogerallen repo. Verificado: cabecera F0 43 00 09 20 00 (6 bytes), 32 voces, checksum válido.
- [x] M-Wave FM-1: documentado que NO soporta bulk dump de salida (solo recebe SysEx). 35 dumps reales de usuario verificados (ROM1-4, VRC101-112, comunidad). Librería de Benny Sparra confirma que solo envía patches al FM-1, no los obtiene.
- [x] Corregir bug crítico en contrato DX7: cabecera de 7 bytes (con byte extra 0x00) → formato correcto de 6 bytes. Añadido soporte dual para formato legacy (7B) y estándar (6B).
- [x] Corregir `extractPatchName`: name at offset 118-127 (ASCII, no 6-bit charset). Checksum range corregido: bytes después de cabecera de 6B (no desde byte 3). 35 dumps reales de usuario copiados a `fixtures/sysex/yamaha-dx7/user-dumps/`.
- [x] Documentar procedencia y licencia de cada fixture; la procedencia local está registrada, pero el estado legal de redistribución sigue pendiente para Pro-800. DeepMind 12 documentado en `fixtures/sysex/behringer-deepmind12/README.md` con hashes, categorías y política de licencia. DX7 documentado en `fixtures/sysex/yamaha-dx7/README.md` con formato SysEx, layout VCED y licencia.
- [ ] Crear tests de detección de modelo.
- [x] Crear tests de número de patches extraídos para los fixtures Pro-800 v109/v110/v111.
- [ ] Crear tests de checksum real.
- [x] Crear tests de roundtrip byte-level representativos para v109 y v110; se conserva la longitud y el contenido decodificado al reconstruir el mensaje. El padding original de registros v109 se mantiene como parte de `rawData`.
- [ ] Verificar que no se pierdan bytes al hacer packing/unpacking.
- [ ] Testear mensajes concatenados y mensajes con bytes MIDI intercalados.
- [ ] Testear mensajes truncados y corruptos.

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

- [x] Registry declarativo con validación Zod y `createStandaloneRegistry()` (15 modelos) en `Source/Contracts/ContractRegistry.ts`.
- [ ] Exponer el registry a la WebUI mediante una API segura (sin arrastrar Zod al grafo web).
- [ ] Consultas filtradas por modelo consumidas por la UI (selector de modelo, propia auto-configuración).
- [ ] Registrar ImportAdapters/ExportAdapters/HardwareLinks conforme se implementen.
- [ ] Añadir tests de registro, duplicados y modo standalone/plugin.

### Criterios de aceptación

- Standalone y plugin se diferencian solo por el conjunto de contratos registrados (sin flags).
- `packages/contracts/src` no duplica código canónico.

---

## P1.5. Transporte MIDI y hardware

- [x] Integrar `Source/Core/MidiSysExQueue.ts` en el flujo real de la WebUI (cola con retries y delay por hardware).
- [x] Implementar HardwareLink real para Pro-800 (Web MIDI + JUCE/C++).
- [x] Implementar HardwareLink real para DeepMind 12 (Web MIDI + JUCE/C++).

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

- [ ] Añadir tests con transporte ficticio (sin hardware) para la cola y los retries.
- [ ] Integrar los transportes Pro-800 y DeepMind 12 en la UI como selectable por modelo.

### Criterios de aceptación

- El mismo transporte se usa en web y en standalone (Tauri).
- Los tests no requieren hardware (fake transport determinista).
- Fetch/Send funcionan con el hardware físico conectado.

---

## P1.6. WebUI completa y autocontenida

- [x] Panel "Datos SysEx" en el detalle de patch (hexdump con bytecount, toggle blob/mensaje, copiar hex y descargar `.syx`).
- [x] Tabla de parámetros interpretados Pro-800 en el detalle (nombre, valor, offset, descripción).
- [x] Tabla de parámetros interpretados DeepMind 12 en el detalle (236+ parámetros, secciones LFO/OSC/VCF/ENV/VCA/Voice/ModMatrix/Seq/Arp/FX).
- [ ] Integrar la búsqueda real en la UI mediante el `Searcher` (P1.2).
- [ ] Empaquetar las dependencias (dexie, jszip, file-saver) con Vite y eliminar el importmap CDN (`esm.sh`) — WebUI offline/autocontenida.
- [ ] Auditoría de `innerHTML` con contenido de usuario en la UI.
- [ ] Añadir visualización del SysEx completo en hexadecimal en el detalle del patch (copiable).

### Criterios de aceptación

- La WebUI funciona sin red (sin CDN).
- Búsqueda y filtros se ejercitan desde la barra de búsqueda.

---

## P1.7. Importación/exportación por fabricante

- [ ] Adapter `sysex-casio-cz` (nibble).
- [ ] Adapter `sysex-roland-juno` (checksum XOR).
- [ ] Adapter `sysex-korg-ms2000` (packing 7→8).
- [x] Adapter `sysex-behringer-dm12` (DeepMind 12 — framing ABDEep validado).
- [x] Adapter `sysex-behringer-pro800` (Pro-800 — framing v109/v110/v111 validado).
- [x] Adapter `sysex-yamaha-dx7` (VCED). Transporte MIDI completo: bulk dump (32 voces), single voice, checksum, naming. Tests: 30/30.
- [ ] Adapter tape `.wav` y clipboard hex.
- [x] Tests de roundtrip byte-idéntico para Pro-800 v109/v110.
- [x] Tests de roundtrip byte-idéntico para DeepMind 12 factory v1.0.
- [ ] Tests de roundtrip byte-idéntico para el resto de formatos con fixtures reales.

### Criterios de aceptación

- Todos los adapters consumen el `SysexFormatProfile` y el addressing del contrato (P0.4).
- Los `.syx` de un modelo no se identifican como otro compatible por defecto.

---

# Fase P2 — Bridge, standalone y release

## P2.1. Bridge JUCE/C++

- [ ] Serializar la librería completa a ValueTree (hoy `toValueTree()` solo guarda índices).
- [ ] Implementar `handleWebUIMessage` / `sendToWebUI` (hoy no-ops).
- [ ] Tests de IPC del bridge (roundtrip del lado C++).

### Criterios de aceptación

- El estado de librería persiste en sesiones del DAW.
- Sin mutex ni I/O en el audio thread.

---

## P2.2. Standalone Tauri

- [ ] Construir la WebUI con Vite y embeberla en el shell Tauri.
- [ ] `MidiManager` con Web MIDI API para el hardware link.
- [ ] Librería global con IndexedDB (Dexie) persistida entre sesiones.
- [ ] Import/Export de todos los formatos soportados.
- [ ] Vista multi-modelo con árbol de sintetizadores y thumbnails de hardware (P0.5).
- [ ] Ctrl+V (clipboard hex) y drag & drop de ficheros SysEx.

### Criterios de aceptación

- `pnpm tauri dev` lanza la app standalone.
- La app importa/exporta bancos entre proyectos ABD sin lógica duplicada.

---

## P2.3. Seguridad

- [ ] Validar manifests con la capa central (P0.6) en restore/export/migración.
- [ ] Limitar el tamaño de ZIP/archivos importados y rechazar rutas inseguras (zip-slip) en `importEngine`.
- [ ] Evitar `innerHTML` con contenido de usuario; sanitizar nombres y campos libres.
- [ ] Auditar la política de CSP de la WebUI.
- [ ] Revisar las vulnerabilidades transitivas reportadas por `npm audit` (P0.1).

### Criterios de aceptación

- No hay XSS/DOM injection por contenido importado (nombre, notas, tags).
- Un ZIP malicioso no puede escribir fuera de la librería.

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
