# Contract Matrix — SysEx Protocol Normativa

> Tabla normativa de todos los modelos soportados.
> Fuente canónica: `Source/Contracts/Models/*.ts`
> Última actualización: 2026-08-30

---

## Resumen de modelos

| # | Model ID | Display Name | Manufacturer | Manufacturer ID | Model ID Byte | Capacity | Banks | Programs/Bank | Patch Data Size | Wire Size | Checksum | Packing |
|---|----------|-------------|--------------|-----------------|---------------|----------|-------|---------------|-----------------|-----------|----------|---------|
| 1 | `casio-cz101` | Casio CZ-101 | Casio | `0x44` | `0x12` | 16 | 1 | 16 | 128 B | 256 nibbles | sum & 0x7F | Nibble |
| 2 | `casio-cz1000` | Casio CZ-1000 | Casio | `0x44` | `0x13` | 16 | 1 | 16 | 128 B | 256 nibbles | sum & 0x7F | Nibble |
| 3 | `casio-cz5000` | Casio CZ-5000 | Casio | `0x44` | `0x14` | 32 | 2 | 16 | 128 B | 256 nibbles | sum & 0x7F | Nibble |
| 4 | `casio-cz1` | Casio CZ-1 | Casio | `0x44` | `0x15` | 64 | 4 | 16 | 288 B | 576 nibbles | sum & 0x7F | Nibble |
| 5 | `roland-juno106` | Roland Juno-106 | Roland | `0x41` | `0x3E` | 128 | 2 | 64 | 18 B | 18 B (no pack) | (-sum) & 0x7F (bulk) | None |
| 6 | `roland-juno60` | Roland Juno-60 | Roland | `0x41` | `0x3D` | 128 | 2 | 64 | 18 B | 18 B | (-sum) & 0x7F (bulk) | None |
| 7 | `roland-juno6` | Roland Juno-6 | Roland | `0x41` | `0x3C` | 128 | 2 | 64 | 18 B | 18 B | (-sum) & 0x7F (bulk) | None |
| 8 | `roland-hs60` | Roland HS-60 | Roland | `0x41` | `0x3E` | 128 | 2 | 64 | 18 B | 18 B | (-sum) & 0x7F (bulk) | None |
| 9 | `korg-ms2000` | Korg MS2000 | Korg | `0x42` | `0x58` | 128 | 8 | 16 | 288 B | 336 B (7→8) | None (packing) | 7-to-8 |
| 10 | `korg-microkorg` | Korg microKORG | Korg | `0x42` | `0x58` | 128 | 8 | 16 | 288 B | 336 B (7→8) | None (packing) | 7-to-8 |
| 11 | `korg-prophecy` | Korg Prophecy | Korg | `0x42` | `0x5A` | 128 | 8 | 16 | 256 B | 296 B (7→8) | None (packing) | 7-to-8 |
| 12 | `behringer-deepmind12` | Behringer DeepMind 12 | Behringer | `00 20 32` | `0x20` | 1024 | 8 | 128 | 242 B | 278 B (7→8) | None (packing) | 7-to-8 |
| 13 | `behringer-pro800` | Behringer Pro-800 | Behringer | `00 20 32` | `00 01 24` | 400 | 4 | 100 | 173 B | ~200 B (7→8) | None (packing) | 7-to-8 |
| 14 | `yamaha-dx7` | Yamaha DX7 | Yamaha | `0x43` | — | 32 | 1 | 32 | 128 B | 128 B (no pack) | (128-sum)%128 | None |
| 15 | `yamaha-dx7ii` | Yamaha DX7II | Yamaha | `0x43` | `0x01` | 32 | 1 | 32 | 155 B | 155 B (no pack) | (128-sum)%128 | None |

---

## Detalle por fabricante

### Casio CZ Series

| Campo | CZ-101 | CZ-1000 | CZ-5000 | CZ-1 |
|-------|--------|---------|---------|------|
| **Model ID byte** | `0x12` | `0x13` | `0x14` | `0x15` |
| **Capacity** | 16 | 16 | 32 | 64 |
| **Banks** | 1 (A) | 1 (A) | 2 (A-B) | 4 (A-D) |
| **Programs/bank** | 16 | 16 | 16 | 16 |
| **Patch data** | 128 B | 128 B | 128 B | 288 B |
| **Wire size** | 256 nibbles | 256 nibbles | 256 nibbles | 576 nibbles |
| **Name length** | 0 (no name) | 0 | 0 | 0 |
| **Address format** | `A1`..`A16` | `A1`..`A16` | `A1`..`A16` | `A1`..`A16` |

**SysEx format:**
```
Dump:     F0 44 00 00 <modelId> 10 <ch> [nibbles] <checksum> F7
Request:  F0 44 00 00 <modelId> 30 <ch> F7
```

- Checksum: `sum(nibble_bytes) & 0x7F`
- Nibble encoding: each byte → 2 nibbles (high, low)
- Compatible models: CZ-101 ↔ CZ-1000 ↔ CZ-5000 ↔ CZ-1

---

### Roland Juno Series

| Campo | Juno-106 | Juno-60 | Juno-6 | HS-60 |
|-------|----------|---------|--------|-------|
| **Model ID byte** | `0x3E` | `0x3D` | `0x3C` | `0x3E` |
| **Capacity** | 128 | 128 | 128 | 128 |
| **Banks** | 2 (A-B) | 2 (A-B) | 2 (A-B) | 2 (A-B) |
| **Programs/bank** | 64 | 64 | 64 | 64 |
| **Patch data** | 18 B | 18 B | 18 B | 18 B |
| **Wire size** | 18 B | 18 B | 18 B | 18 B |
| **Name length** | 0 (no name) | 0 | 0 | 0 |
| **Address format** | `A1`..`A64`, `B1`..`B64` | same | same | same |

**SysEx format:**
```
Single:   F0 41 30 <ch> [18B data] F7                              (no checksum)
Bulk:     F0 41 30 02 01 [64×18B data] <(-sum)&0x7F> F7
Request:  F0 41 <ch> 3E 11 00 F7
```

- Checksum (bulk only): `(-sum(payload)) & 0x7F`
- 18-byte body: 16 slider params (0-127) + SW1 + SW2
- No patch name (hardware uses position numbers)
- Compatible models: Juno-106 ↔ Juno-60 ↔ Juno-6 ↔ HS-60

---

### Korg MS2000 / microKORG / Prophecy

| Campo | MS2000 | microKORG | Prophecy |
|-------|--------|-----------|----------|
| **Model ID byte** | `0x58` | `0x58` | `0x5A` |
| **Capacity** | 128 | 128 | 128 |
| **Banks** | 8 (A-H) | 8 (A-H) | 8 (A-H) |
| **Programs/bank** | 16 | 16 | 16 |
| **Patch data** | 288 B | 288 B | 256 B |
| **Wire size** | 336 B (7→8) | 336 B (7→8) | 296 B (7→8) |
| **Name length** | 12 chars | 12 chars | 12 chars |
| **Name offset** | `0x1C` | `0x1C` | `0x1C` |
| **Address format** | `A.01`..`A.16` | same | same |

**SysEx format:**
```
Single:   F0 42 <3n> <modelId> 40 [packed data] F7
All dump: F0 42 <3n> <modelId> 4C [128×packed] F7
Request:  F0 42 <3n> <modelId> 10 F7
All req:  F0 42 <3n> <modelId> 0E F7
Param:    F0 42 <3n> <modelId> 41 <offsetL> <offsetH> <value> F7
```

- No separate checksum — integrity via 7-to-8 packing structure
- Packing: every 7 data bytes → 1 control + 7 encoded bytes
- `<3n>` = `0x30 | (channel & 0x0F)`
- Compatible models: MS2000 ↔ microKORG (same format, same model byte)

---

### Behringer DeepMind 12

| Campo | Valor |
|-------|-------|
| **Manufacturer ID** | `00 20 32` (3 bytes) |
| **Model ID byte** | `0x20` (byte[4]) |
| **Capacity** | 1024 (8 banks × 128) |
| **Banks** | 8 (A-H) |
| **Programs/bank** | 128 |
| **Patch data** | 242 B |
| **Wire size** | 278 B (7→8) + 13 B header + 2 B tail = 291 B total |
| **Name length** | 16 chars |
| **Name offset (decoded)** | `223` |
| **Address format** | `A001`..`A128`, `B001`..`B128`, ... |

**SysEx format:**
```
Dump:     F0 00 20 32 20 00 02 07 <bank> <program> [278B packed] 00 00 F7
Request:  F0 00 20 32 20 00 01 <bank> <program> F7
```

- No separate checksum — integrity via 7-to-8 packing
- Protocol version: `0x07`
- Device ID: `0x00`
- Total message: 291 bytes

---

### Behringer Pro-800

| Campo | Valor |
|-------|-------|
| **Manufacturer ID** | `00 20 32` (3 bytes) |
| **Model ID** | `00 01 24` (3 bytes, bytes[4..6]) |
| **Capacity** | 400 (4 banks × 100) |
| **Banks** | 4 (A-D) |
| **Programs/bank** | 100 |
| **Patch data** | 173 B (v1.4.4 canonical) |
| **Wire size** | ~200 B (7→8) + 11 B header |
| **Name length** | 16 chars |
| **Name offset (decoded)** | `0x96` (150) |
| **Address format** | `A001`..`A100`, `B001`..`B100`, ... |

**SysEx format:**
```
Request:  F0 00 20 32 00 01 24 00 77 <LSB> <MSB> F7
Response: F0 00 20 32 00 01 24 00 78 <LSB> <MSB> [packed data] F7
```

- No checksum, no channel byte
- `<LSB>` = slot % 128, `<MSB>` = floor(slot / 128)
- Packed data starts at byte index 11
- Format versions: `0x6D` (v109, 173B), `0x6E` (v110, 168B), `0x6F` (v111, 173B)

---

### Yamaha DX7 / DX7II

| Campo | DX7 | DX7II |
|-------|-----|-------|
| **Manufacturer ID** | `0x43` | `0x43` |
| **Model byte** | `0x09` (sub-status) | `0x01` (model), `0x09` (sub) |
| **Capacity** | 32 | 32 |
| **Banks** | 1 | 1 |
| **Programs/bank** | 32 | 32 |
| **Patch data (VCED)** | 128 B | 155 B |
| **Patch data (VMEM)** | 128 B | 155 B |
| **Wire size** | 136 B (single), 4104 B (bulk) | 165 B (single) |
| **Name length** | 10 chars | 10 chars |
| **Name offset (VCED)** | 118 | 118 |
| **Address format** | 1-32 | 1-32 |

**SysEx format:**
```
Single:   F0 43 <gg> 09 20 00 [128B VCED] <checksum> F7           (136 bytes)
Bulk:     F0 43 <gg> 09 20 00 [32×128B VCED] <checksum> F7        (4104 bytes)
Request:  F0 43 <gg> 09 20 00 F7                                   (8 bytes)
```

- `<gg>`: `0x0g` (group, DX7) or `0x10|ch` (channel, DX7II)
- Checksum: `(128 - (sum(bytes[3..N-2]) % 128)) & 0x7F`
- DX7II model byte: `0x01` at offset 3
- VMEM (bulk) ↔ VCED (single) conversion: `unpackProgram()` / `packProgram()`

---

## Compatibilidad multi-hardware

| Modelo canónico | Modelos compatibles |
|----------------|---------------------|
| `casio-cz101` | `casio-cz1000`, `casio-cz5000`, `casio-cz1` |
| `roland-juno106` | `roland-juno60`, `roland-juno6`, `roland-hs60` |
| `korg-ms2000` | `korg-microkorg` |
| `korg-prophecy` | (ninguno) |
| `behringer-deepmind12` | (ninguno) |
| `behringer-pro800` | (ninguno) |
| `yamaha-dx7` | `yamaha-dx7ii` |

---

## Algoritmos de checksum

| Fabricante | Algoritmo | Fórmula | Ejemplo |
|-----------|-----------|---------|---------|
| **Casio** | sum & 0x7F | `Σ bytes & 0x7F` | `[0x01, 0x02, 0x03]` → `6` |
| **Roland** (bulk) | (-sum) & 0x7F | `(-Σ bytes) & 0x7F` | `[0x00×18]` → `0x7F` |
| **Roland** (single) | Ninguno | — | — |
| **Yamaha** | (128-sum)%128 | `(128 - (Σ bytes % 128)) & 0x7F` | `[0x01]` → `0x7F` |
| **Korg** | Ninguno (packing) | Integrity via 7-to-8 structure | — |
| **Behringer** | Ninguno (packing) | Integrity via 7-to-8 structure | — |

---

## Formatos de addressing

| Fabricante | Formato | Ejemplo | Rango |
|-----------|---------|---------|-------|
| **Casio** | `<bank><prog>` | `A1`, `A16`, `B1` | A-P × 1-16 |
| **Roland** | `<bank><prog>` | `A1`, `A64`, `B1` | A-B × 1-64 |
| **Korg** | `<bank>.<prog>` | `A.01`, `A.16`, `H.01` | A-H × 01-16 |
| **Behringer DM12** | `<bank><prog3>` | `A001`, `A128`, `H001` | A-H × 001-128 |
| **Behringer Pro-800** | `<bank><prog3>` | `A001`, `A100`, `D001` | A-D × 001-100 |
| **Yamaha DX7** | `<num>` | `1`, `32` | 1-32 |

---

## Notas pendientes (P0.4)

- [ ] Resolver discrepancia Korg microKORG (`0x58` frente a otros IDs) — microKORG comparte `0x58` con MS2000
- [ ] Resolver tamaños Korg MS2000/Prophecy en todas las capas — Prophecy tiene `patchDataSize: 256` vs MS2000 `288`
- [ ] Resolver comandos y estructura Roland — Juno-106/60/6/HS-60 comparten formato exacto
- [ ] Resolver comandos y offsets Casio — CZ-1 tiene `patchDataSize: 288` vs CZ-101 `128`
- [ ] Prohibir que la compatibilidad se deduzca solo del fabricante o del packing
- [ ] Hacer que todos los adapters consuman la tabla/contrato canónico
