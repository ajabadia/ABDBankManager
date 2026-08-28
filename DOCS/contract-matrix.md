# Matriz normativa de contratos y perfiles SysEx

> Estado: inicial / pendiente de confirmar con fixtures reales y hardware.
> No debe interpretarse como certificación de protocolo mientras la fila no tenga evidencia.

## Estados de evidencia

- `designed`: definido en código o documentación.
- `implemented`: contrato/adaptador implementado.
- `unit-tested`: cubierto por tests sintéticos.
- `fixture-tested`: verificado contra un dump real conservado en `fixtures/`.
- `hardware-tested`: probado con el dispositivo físico y firmware indicado.

## Modelo de datos normativo

Cada combinación de modelo, revisión de hardware y rango de firmware se representa como un `SysexFormatProfile` con:

- `profileId`: identificador estable del perfil;
- `modelId`: modelo canónico del contrato;
- `hardwareRevision` y `firmwareRange`: opcionales hasta disponer de evidencia;
- manufacturer/model ID y comandos exactos;
- tamaño raw y wire;
- packing y checksum;
- reglas de addressing.

Un mismo hardware puede tener varios perfiles. La selección del perfil debe basarse en los bytes observados, metadatos del dump o identificación explícita del firmware; nunca debe asumirse que todos los firmwares comparten formato.

## Matriz inicial

| Perfil | Modelo | Manufacturer ID | Comandos | Raw | Wire | Packing | Checksum | Addressing | Estado |
|---|---|---:|---|---:|---:|---|---|---|---|
| `casio-cz101-default` | `casio-cz101` | `44 00 00` | dump `10`, request `30` | 128 | derivado | nibble | Casio | `A1..A16` | implemented, unit-tested |
| `casio-cz1000-default` | `casio-cz1000` | `44 00 00` | dump `10`, request `30` | 128 | derivado | nibble | Casio | `A1..A16` | implemented, unit-tested |
| `casio-cz5000-default` | `casio-cz5000` | `44 00 00` | dump `10`, request `30` | 128 | derivado | nibble | Casio | bancos de 16 | implemented, unit-tested |
| `casio-cz1-default` | `casio-cz1` | `44 00 00` | dump `10`, request `30` | 128 | derivado | nibble | Casio | bancos de 16 | implemented, unit-tested |
| `roland-juno106-default` | `roland-juno106` | `41` | patch `30`, bulk `01` | 18 | 18 | none | single/bulk | `A1..B64` | implemented, unit-tested |
| `roland-juno60-default` | `roland-juno60` | `41` | patch `30`, bulk `01` | 18 | 18 | none | single/bulk | `A1..B64` | implemented, unit-tested |
| `korg-ms2000-default` | `korg-ms2000` | `42` | dump `40`, all `4C` | 128 | derivado | 8to7 | none | `A.01..H.16` | implemented, unit-tested |
| `korg-microkorg-default` | `korg-microkorg` | `42` | dump `40`, all `4C` | 128 | derivado | 8to7 | none | `A.01..H.16` | implemented, unit-tested |
| `korg-prophecy-default` | `korg-prophecy` | `42` | dump `40`, all `4C` | 256 | derivado | 8to7 | none | revisar | designed, pendiente confirmar |
| `behringer-deepmind12-default` | `behringer-deepmind12` | `00 20 32` | dump `02`, request `01` | 242 | 278 (291 wire) | 8to7 | none | A–H / 0–127 | fixture-tested: factory v1.0/v1.1.2, community, user, commercial |
| `behringer-pro800-fw-legacy-v109` | `behringer-pro800` | `00 20 32 / 00 01 24` | response `78`, request `77` | 155–166* | derivado | 8to7 | none | `A001..D100` | fixture-tested: 98 registros |
| `behringer-pro800-fw-legacy-v110` | `behringer-pro800` | `00 20 32 / 00 01 24` | response `78`, request `77` | 168 | derivado | 8to7 | none | `A001..D100` | fixture-tested: 3 registros |
| `behringer-pro800-fw-v111` | `behringer-pro800` | `00 20 32 / 00 01 24` | response `78`, request `77` | 173 | derivado | 8to7 | none | `A001..D100` | fixture-tested: v1.4.4 |
| `yamaha-dx7-default` | `yamaha-dx7` | `43` | bulk `09/20` | 128 | variable | none | sum7 | `V01..V32` | implemented, unit-tested |
| `yamaha-dx7ii-default` | `yamaha-dx7ii` | `43` | bulk `09/20` | 155 | variable | none | sum7 | `V01..V64` | implemented, unit-tested |

## Variantes de hardware y firmware

Estas filas son deliberadamente placeholders hasta disponer de dumps verificables:

| Perfil futuro | Base | Diferencia esperada a confirmar | Evidencia requerida |
|---|---|---|---|
| `<model>-rev-<revision>` | cualquier modelo | offsets, tamaño o cabecera por revisión PCB | dump de cada revisión |
| `<model>-fw-<version>` | cualquier modelo | comando, checksum, packing o tamaño por firmware | dump + versión firmware |
| `<model>-legacy` | modelos con protocolos heredados | compatibilidad parcial o mensajes antiguos | manual/fixture/hardware |

### Reglas de compatibilidad

1. Un perfil solo puede declarar compatibilidad con otro si raw, wire, packing, checksum, addressing y semántica de slots son equivalentes.
2. Si cambia cualquiera de esos elementos, se crea un perfil separado aunque `modelId` sea el mismo.
3. La importación debe conservar `profileId` y la procedencia del perfil detectado.
4. La exportación debe exigir un perfil explícito cuando existan varias variantes ambiguas.
5. Un perfil no confirmado no se habilita para envío destructivo al hardware.

## Evidencia específica del Pro-800

La evidencia normativa se conserva en `fixtures/sysex/behringer-pro800/`; la documentación de investigación original permanece temporalmente en `DOCS/DOCS-pro800-borrar/`. Contiene:

- referencia de formato con cabecera, comandos, packing, offsets y versiones 109/110/111;
- `Pro 800.csv` con la tabla de CC;
- `fixtures/sysex/behringer-pro800/v1.4.4/PRO-800_Presets_v1.4.4.syx`, dump v1.4.4 con 100 mensajes y metadatos en `fixture.json`;
- dump de fábrica antiguo y documentación comunitaria adicional.

Conclusiones relevantes:

1. El contrato base del Pro-800 es correcto para la cabecera `F0 00 20 32 00 01 24 00`, comandos `0x77`/`0x78`, slots 0–399 y packing 8-to-7.
2. `patchDataSize = 173` solo es correcto como tamaño canónico v111; no debe tratarse como tamaño universal.
3. El byte decodificado `rawData[4]` distingue formatos v109, v110 y v111. El parser debe conservar la versión y no interpretar offsets v111 en registros antiguos.
4. El dump v1.4.4 confirma v111, 173 bytes y 100 presets; el fixture antiguo confirma 98 registros v109 de longitud variable (155–166 bytes observados) y 3 registros v110 de 168 bytes. El parser conserva la longitud decodificada de v109.
5. El CSV documenta CC/MIDI, pero no sustituye al mapa de offsets SysEx; son capas semánticas distintas.

## Evidencia específica del DeepMind 12

La evidencia normativa se conserva en `fixtures/sysex/behringer-deepmind12/`; el catálogo completo de 260 archivos disponibles está en `DOCS/dm12-library-catalog.json`.

### Fixtures incluidos

| Categoría | Archivos | Patches | Firmware | SHA-256 parcial |
|---|---|---|---|---|
| Factory v1.0 | Bank A–D | 128 × 4 = 512 | v1.0 | `2512dbae...`, `590fd88b...`, `fe2bb240...`, `40446dab...` |
| Factory v1.1.2 | Bank A, H | 128 × 2 = 256 | v1.1.2 | `21ed77a4...`, `841099ea...` |
| Community | AE Angelia, AE CinemaDrone | 2 | gratuito | `cacdf7b8...`, `d96b4e52...` |
| User | 80s, GROKa | 128 × 2 = 256 | desconocido | `cfb101b0...`, `05050a14...` |
| Commercial | 5P Media, Ambient Mind Vol 1 | 128 × 2 = 256 | desconocido | `e909d560...`, `51208d71...` |
| Unknown | Warmup, 80s | 1 + 128 | desconocido | `7056070b...`, `cfb101b0...` |

### Conclusiones del DeepMind 12

1. Todos los archivos .syx cumplen el framing ABDEep: `F0 00 20 32 20 <device> 02 <protocol> <bank> <program>`.
2. Manufacturer ID `00 20 32`, model ID `0x20`, dump command `0x02`, request command `0x01`.
3. Protocol version predominantemente `0x07`, con al menos un archivo (Warmup) en `0x06`.
4. Device ID varía: `0x00` en fábrica, `0x7F` en algunos desconocidos/usuarios.
5. Mensaje completo: 291 bytes. Payload empaquetado: 278 bytes. Patch data decodificado: 242 bytes.
6. Bank: `0x00–0x07` (A–H), program: `0x00–0x7F` (0–127), 1024 slots totales.
7. Nombre del patch en offsets decodificados 223–238 (16 caracteres).
8. Packing 8-to-7, sin checksum.
9. Roundtrip validado: parse → build → parse conserva rawData y slot.
10. `isDeepMindMessage()` actualizado para aceptar device IDs y protocolos variantes.

## Evidencia pendiente

- Añadir fixtures reales por fabricante en `fixtures/sysex/` (Casio, Roland, Korg, Yamaha).
- Registrar modelo, revisión y firmware de cada fixture.
- Añadir detección de perfil basada en cabecera/tamaño/comandos.
- Ejecutar roundtrip byte-level por perfil.
- Validar perfiles contra hardware físico.
- Validar DeepMind 12 con un DeepMind 12D físico (fetch/send).
