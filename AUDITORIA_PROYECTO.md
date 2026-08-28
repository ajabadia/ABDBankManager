# Auditoría del proyecto ABD Universal Bank Manager

> Fecha de auditoría: 2026-08-27  
> Estado evaluado: rama `main`, versión `0.1.0`  
> Alcance: documentación, arquitectura, calidad de código, funcionalidad, persistencia, SysEx/MIDI, WebUI, C++/JUCE, pruebas, CI y preparación para producción.

---

## 1. Veredicto ejecutivo

El proyecto tiene una **base arquitectónica razonable y una documentación bastante transparente**, pero actualmente es un **prototipo avanzado / MVP parcial**, no una solución terminada ni preparada para producción.

| Área | Evaluación |
|---|---:|
| Documentación | 7/10 |
| Arquitectura conceptual | 7/10 |
| Calidad del código | 5/10 |
| Funcionalidad real | 4/10 |
| Persistencia | 5/10 |
| SysEx/MIDI | 3/10 |
| WebUI | 5/10 |
| C++/JUCE | 3/10 |
| Testing | 5/10 |
| Preparación para producción | 2–3/10 |

La documentación reconoce muchas carencias, lo cual es positivo. Sin embargo, existe una diferencia relevante entre:

- interfaces diseñadas;
- implementaciones conceptuales;
- adaptadores que compilan;
- funcionalidad real validada con hardware y formatos reales.

En varios puntos se presenta como implementado algo que en realidad es parcial o inconsistente.

---

## 2. Ajuste a lo solicitado

### 2.1. Implementado o parcialmente implementado

- Estructura inicial del monorepo.
- Documentación de arquitectura, roadmap y handoff.
- ModelContracts para 15 variantes de hardware.
- Registro declarativo de contratos.
- Persistencia Dexie con migraciones.
- CRUD básico de bancos y patches en la WebUI.
- Formato ZIP `.abdbank`.
- Formato `.abdlibrary`.
- Validación con Zod.
- Gestión de bancos de fábrica.
- Límite de capacidad por banco en determinadas rutas.
- Fingerprinting SHA-256 en una utilidad independiente.
- Cola MIDI con rate limiting y reintentos.
- Adaptadores TypeScript con framing, packing y checksums conceptuales.
- Tests unitarios para modelos, registry, utilidades SysEx y reglas de negocio.

### 2.2. No terminado o no validado

- La aplicación standalone Tauri no está implementada.
- El bridge C++ ↔ WebUI es un no-op.
- `toValueTree()` solo guarda dos índices.
- No existe persistencia completa de la librería en C++.
- No hay comunicación MIDI real integrada en la aplicación.
- No hay migración efectiva de ABDCZ101, ABDEep, ABDJUNiO601 ni ABDMS2000.
- No existe búsqueda pura completa en `packages/core`.
- No existe el core inmutable de operaciones definido en la arquitectura.
- El fingerprinting no está integrado en el flujo principal de importación de la WebUI.
- El auto-backup no se invoca antes de las migraciones.
- La persistencia real está omitida en los tests.
- Tape `.wav`, `.mid`, clipboard hex y JSON de terceros no están implementados como adapters completos.
- La mayoría de los adapters de hardware no están integrados en un flujo operativo.
- No hay pruebas contra dumps reales de hardware.
- La CI contiene jobs declarados como válidos que en realidad son stubs o pueden pasar sin ejecutar validaciones relevantes.

### 2.3. Estimación de cumplimiento

- Si el objetivo era un **gestor universal funcional e integrable en plugins**: aproximadamente **35–45 %**.
- Si el objetivo era una **base arquitectónica/prototipo**: aproximadamente **65–70 %**.

---

## 3. Verificación ejecutada

### Tests

```text
248 tests passed
5 tests skipped
16 test files passed
1 test file skipped
```

La suite es un buen punto de partida, pero no cubre completamente persistencia, hardware real ni integración extremo a extremo.

### Lint

```text
npm run lint → falla
```

Motivo: no existe configuración ESLint.

### Build WebUI

```text
npm run build:webui → falla
```

Motivo: el script apunta a `WebUI/vite.config.js`, archivo que no existe.

### Generación

```text
npm run generate → funciona
```

Produce warnings de módulos ESM por falta de configuración coherente del tipo de módulo en los scripts.

---

## 4. Documentación

### 4.1. Puntos positivos

- README, roadmap, handoff y arquitectura están alineados en muchos aspectos.
- Se indican explícitamente funcionalidades parciales.
- Se documentan decisiones arquitectónicas importantes.
- Se explica el principio de “asepsia”: el gestor trata los patches como blobs opacos.
- Se documenta la distinción entre `.abdbank` y `.abdlibrary`.
- Se especifican modelos, capacidades, addressing, compatibilidades y formatos.
- `HANDOFF.md` es útil para continuar el trabajo.

### 4.2. Riesgos documentales

#### Documentación duplicada

`DOCS/architecture.md` y `DOCS/implementation_plan.md` contienen grandes bloques prácticamente duplicados. Esto genera riesgo de divergencia.

Recomendación:

- `architecture.md`: decisiones y diseño estable.
- `implementation_plan.md`: tareas ejecutables y estado.
- Eliminar del plan la copia completa de la arquitectura y enlazar a las secciones correspondientes.

#### Estados demasiado optimistas

La documentación menciona adaptadores “implementados”, mientras que `HANDOFF.md` aclara que faltan adaptadores reales por fabricante.

Debe distinguirse formalmente entre:

- `designed`;
- `implemented`;
- `unit-tested`;
- `validated-with-real-dumps`;
- `validated-on-hardware`.

#### Falta una matriz de requisitos

Conviene crear una matriz con:

| Requisito | Evidencia | Estado | Test |
|---|---|---|---|

#### Falta especificación normativa completa del formato

El formato `.abdbank` necesita decisiones formales sobre:

- compatibilidad entre versiones;
- campos obligatorios;
- blobs ausentes;
- límites de tamaño;
- IDs duplicados;
- modelos incompatibles;
- versionado semántico del formato.

---

## 5. Arquitectura

### 5.1. Aspectos bien planteados

- Separación entre `ModelContract`, `ImportAdapter`, `ExportAdapter`, `HardwareLinkContract` y `ContractRegistry`.
- Registro declarativo para evitar hardcodear completamente los modelos en la UI.
- Principio de blobs opacos: el gestor no debe convertirse en editor de todos los sintetizadores.
- Distinción conceptual entre standalone y plugin mediante el conjunto de contratos registrados.

### 5.2. Problemas

#### Existen dos arquitecturas de facto

Hay dos caminos paralelos:

1. `WebUI/src/store/persistence.js`.
2. `packages/core/src/PersistenceEngine.ts`.

También existen distintas fuentes de lógica SysEx y contratos. Esto puede provocar que:

- una importación funcione en la WebUI y otra no en el core;
- el fingerprint sea distinto según el camino;
- el backup tenga formatos diferentes;
- las reglas de fábrica/capacidad no se apliquen homogéneamente.

Debe existir un único core funcional y una política única de datos.

#### Paquetes parcialmente integrados

`packages/core`, `packages/contracts`, `packages/adapters` y `packages/ui` existen, pero la aplicación principal continúa importando directamente desde `Source/` y `WebUI/src/`.

Debe decidirse si:

- `packages/*` es la API pública y contiene la lógica real;
- `Source/` es solo fuente canónica para C++/generación;
- o se usa otra estructura, pero sin duplicaciones ni shims innecesarios.

#### Contrato excesivamente amplio

`ModelContract` mezcla identidad, capacidad, addressing, SysEx, MIDI, checksum y hardware link.

A medio plazo sería más mantenible separar:

```text
HardwareIdentity
BankLayout
PatchCodec
SysExProtocol
HardwareTransport
```

---

## 6. Problemas funcionales

### 6.1. Capacidad no aplicada consistentemente

`createPatch()` recibe opcionalmente `maxPatches`, pero la integridad depende de que el caller recuerde pasarlo.

`importBank()` inserta directamente en Dexie sin comprobar necesariamente:

- capacidad;
- índice duplicado;
- modelo válido;
- tamaño de `rawData`;
- compatibilidad entre `hardwareIds` y `modelId`.

Debe existir una validación central que se aplique a creación, importación, duplicado, movimiento, restauración y exportación.

### 6.2. `movePatch()` es incompleto

No valida de forma suficiente:

- capacidad del destino;
- compatibilidad de hardware;
- colisión de índices;
- origen y destino iguales;
- reindexación del origen.

### 6.3. `importBank()` puede saltarse las reglas de fábrica

Aunque `createPatch`, `updatePatch` y `deletePatch` tienen guards, `importBank()` escribe directamente en Dexie.

Puede importar contenido marcado como banco de fábrica sin pasar por la política de inmutabilidad.

### 6.4. Índices inconsistentes

`createPatch()` usa el número de patches como siguiente índice. Eso no garantiza que sea el siguiente índice libre tras eliminaciones o importaciones con índices no secuenciales.

### 6.5. Búsqueda insuficiente

La búsqueda actual contempla básicamente `name` y `category`, mientras que el diseño promete también:

- author;
- tags;
- notes;
- model;
- favoritos;
- rating;
- ordenación.

### 6.6. Tamaño de patches no validado

Se truncan o rellenan datos con ceros en varias rutas. Para SysEx, esto puede producir patches aparentemente válidos pero corruptos.

Debe rechazarse por defecto o permitirse explícitamente mediante una opción como `allowPartial`.

---

## 7. SysEx y MIDI

Esta es la zona de mayor riesgo técnico.

### 7.1. Tests no equivalentes a validación real

Los tests actuales validan principalmente algoritmos y mensajes artificiales. Eso no demuestra que el protocolo sea correcto para hardware real.

Se necesitan fixtures reales por fabricante y modelo con:

- dump original;
- modelo esperado;
- número de patches;
- payload esperado;
- checksum esperado;
- roundtrip byte a byte.

### 7.2. Inconsistencias observadas

#### Korg

El adapter usa IDs distintos de los definidos en ModelContracts para microKORG y hay discrepancias de tamaño de patch entre capas.

#### Roland

La documentación y las implementaciones no coinciden completamente en comandos, posición de canal, modelo, dirección y checksum.

#### Casio

Existen discrepancias entre comandos, offsets de dirección, modelos y capacidades.

#### Behringer

`compatibleModels` declara compatibilidades que no deberían asumirse solo por compartir una técnica de empaquetado.

### 7.3. `hardwareIds` asignado incorrectamente

Varios adapters generan:

```ts
[modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)]
```

Esto marca el patch como compatible con todos los modelos del fabricante, aunque el contrato indique compatibilidades limitadas.

Debe utilizarse una función canónica equivalente a:

```ts
getHardwareIds(modelId)
```

### 7.4. Adapters no registrados completamente

`createStandaloneRegistry()` registra modelos, pero no registra import adapters, export adapters ni hardware links. Por tanto, el registry no ofrece todavía el comportamiento universal descrito.

### 7.5. Interfaces débiles

Se utiliza `any[]` para dispositivos MIDI y se duplican interfaces `PatchData` en distintos contratos.

Debe existir un tipo compartido y una abstracción de transporte MIDI claramente definida.

---

## 8. Persistencia y backups

### 8.1. Backup incompleto

La interfaz documenta un backup `.abdbank` ZIP, pero `packages/core/src/PersistenceEngine.ts` devuelve JSON plano y referencia blobs que no se incorporan realmente.

Ese backup no es equivalente al formato documentado ni garantiza restauración.

### 8.2. Fingerprint incorrecto en una capa

`PersistenceEngine` usa una función hash simple aunque el comentario la describe como SHA-256. Existe una utilidad SHA-256 independiente, pero no se usa desde esa capa.

Esto puede generar fingerprints incompatibles.

### 8.3. Auto-backup no integrado

`backupBeforeMigration()` está definido, pero no se invoca en el ciclo de migración y además crea JSON descargable en lugar de `.abdbank`.

### 8.4. Tests de persistencia omitidos

La suite de persistencia aparece completa en `describe.skip`, por lo que una parte crítica no está verificada.

---

## 9. WebUI

### 9.1. Aspectos positivos

- La UI se inicializa correctamente en el entorno comprobado.
- Hay escape HTML para varios nombres.
- Se muestran reglas de bancos de fábrica.
- Existen importación/exportación, CSV y renombrado masivo.
- Hay feedback de estado y toast.

### 9.2. Problemas

- `app.js` concentra demasiadas responsabilidades.
- Se usa HTML inline y handlers inline.
- La UI real es mucho menor que la UI descrita en arquitectura.
- No hay standalone multi-modelo implementado.
- Falta integración visible de Dump/Fetch.
- El build de Vite falla por configuración inexistente.
- Se cargan dependencias desde CDN, lo cual es inadecuado para plugin y desktop offline.

---

## 10. C++ / JUCE

El estado actual es un skeleton.

### Implementado

- Compilación de una librería estática.
- Clase `BankManagerCore`.
- Guardado de dos índices en `ValueTree`.
- API preliminar del bridge.

### No implementado

```cpp
void handleWebUIMessage(...)
void sendToWebUI(...)
```

son no-op.

`toValueTree()` no persiste bancos, patches, rawData, metadatos, favoritos ni versionado.

Por tanto, no cumple todavía la especificación de persistencia DAW.

---

## 11. Testing

### Fortalezas

- Tests de registry.
- Tests de contratos.
- Tests de reglas de fábrica/capacidad.
- Tests de packing y checksums.
- Tests de roundtrip ZIP.
- Tests de nomenclatura y operaciones masivas.

### Debilidades

- Persistencia omitida.
- Tests SysEx principalmente conceptuales.
- Falta cobertura de archivos corruptos, blobs ausentes, checksums inválidos, modelos incompatibles, restauración y migraciones.
- Falta una prueba completa de importación → validación → fingerprint → persistencia → exportación → reimportación.
- No existen fixtures reales de hardware.

---

## 12. Calidad y tooling

### ESLint

`npm run lint` falla por falta de configuración ESLint.

### Typecheck

No existe un script de typecheck ni un flujo `tsc --noEmit` claramente integrado.

### Warnings ESM

`npm run generate` produce warnings por configuración incoherente de módulos.

### CI

La CI contiene varios jobs que no validan realmente lo que anuncian:

- pluginval está comentado;
- `audit-ci` usa `|| true`;
- allocation audit no falla si no encuentra tests;
- los tests C++ pueden no existir y solo producir warning;
- WASM no verifica suficientemente el resultado.

---

## 13. Buenas prácticas de mercado

### Se siguen parcialmente

- Separación por contratos.
- Migraciones versionadas.
- ZIP con manifest y blobs.
- Validación runtime con Zod.
- Tests unitarios.
- Generación desde una fuente de verdad.
- Blobs binarios opacos.
- Documentación de decisiones.

### Pendientes

- Un único core de dominio.
- Tipado estricto extremo a extremo.
- CI fiable.
- Builds reproducibles.
- Tests de integración.
- Fixtures reales.
- Contratos versionados.
- Seguridad del parsing de ZIP y JSON.
- Validación centralizada de invariantes.
- Release pipeline real.
- Manejo transaccional completo.
- Separación clara entre prototipo y funcionalidad certificada.

---

## 14. Mejoras prioritarias

### P0 — Antes de añadir más hardware

1. Unificar el core.
2. Resolver autoridad de contratos y protocolos SysEx.
3. Crear validación central de bancos y patches.
4. Corregir el backup y hacerlo restaurable.
5. Eliminar el hash falso y usar SHA-256 común.
6. Corregir el build de WebUI.
7. Añadir typecheck y lint funcionales.

### P1 — MVP funcional

8. Implementar búsqueda completa.
9. Implementar operaciones puras inmutables.
10. Completar y probar persistencia.
11. Registrar adapters y hardware links en el registry.
12. Integrar MIDI real.
13. Añadir fixtures reales de hardware.

### P2 — Producto y release

14. Completar standalone Tauri.
15. Completar bridge JUCE.
16. Añadir mensajes IPC versionados.
17. Reforzar seguridad y CSP.
18. Eliminar dependencias CDN en producción.
19. Hacer que la CI falle ante validaciones no ejecutadas.

---

## 15. Orden recomendado

```text
build + typecheck + lint
→ core único
→ matriz de requisitos
→ protocolos reales y fixtures
→ validación central
→ fingerprint y backup
→ persistencia real
→ operaciones puras y búsqueda
→ registry completo
→ MIDI real
→ bridge C++
→ standalone
→ integración y release
```

---

## Conclusión

El proyecto **no está listo para considerarse una solución universal de producción**, pero tiene una base prometedora.

Lo mejor del proyecto es:

- intención arquitectónica;
- documentación;
- separación conceptual por contratos;
- transparencia sobre lo que falta;
- cobertura inicial de tests.

Los principales riesgos son:

- duplicación de fuentes de verdad;
- protocolos SysEx potencialmente incorrectos o inconsistentes;
- validación incompleta;
- backup no funcional en una de las capas;
- C++ y standalone todavía como skeleton;
- CI que puede dar una falsa sensación de calidad;
- ausencia de fixtures y pruebas con hardware real.

La recomendación principal es **no ampliar todavía el número de sintetizadores**. Primero debe cerrarse un vertical completo y fiable:

```text
import real SysEx
→ validate checksum
→ extract patch
→ fingerprint SHA-256
→ persist in Dexie
→ edit metadata
→ export native SysEx
→ byte-level roundtrip
→ hardware send/fetch
```

Cuando ese flujo esté validado extremo a extremo, se puede generalizar con seguridad al resto de fabricantes.
