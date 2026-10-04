# Korg MS2000 / microKORG / Prophecy — Fixtures SysEx

## Estructura

```
korg-ms2000/
korg-microkorg/
korg-prophecy/
├── factory/     # Bancos de fábrica (8 bancos × 16 patches = 128 total)
├── community/
└── user/
```

## Bancos de fábrica generados

### MS2000 / microKORG (254 bytes raw / patch)

| Modelo | Bancos | Patches/banco | Tamaño raw | Tamaño wire (7→8) |
|--------|--------|---------------|------------|-------------------|
| MS2000 | 8 | 16 | 254 bytes | 291 bytes (36 grupos + 1 control + 2 datos) |
| microKORG | 8 | 16 | 254 bytes | 291 bytes |

> El programa real son **254 B** (nombre en `0x00`, Timbre 1 en `0x26`, Timbre 2 en `0x92`),
> no 288 B con el nombre en `0x1C`. El último grupo parcial **no** se rellena: 254 → 291 B.
> Ver `ABDMS2000/DOCS/MS2000_SysEx_Spec.md`.

### Prophecy (256 bytes raw / patch)

| Modelo | Bancos | Patches/banco | Tamaño raw | Tamaño wire |
|--------|--------|---------------|------------|-------------|
| Prophecy | 8 | 16 | 256 bytes | 296 bytes (256/7*8=292.5→296) |

## Formato SysEx

- **Fabricante**: 0x42 (Korg)
- **Packing**: 7-to-8 bit (7 bytes datos → 8 bytes wire, 1 byte control + 7 datos)
- **Sin checksum separado** — integridad vía estructura de packing
- **Estructura single dump**: `F0 42 3n 58 40 <packed> F7`
- **Model IDs**: MS2000/microKORG=0x58, Prophecy=0x5A
- **CMD**: 0x40 (Program Data Dump)

## Generación

Generados con `ModelContract` canónico (`Source/Contracts/Models/korg-ms2000.ts`). Roundtrip verificado:

```typescript
const packed = pack8to7NoPad(rawData);   // Korg, sin rellenar el grupo parcial
const sysex = buildPatchSysEx(rawData);
const unpacked = unpack7to8Tolerant(sysex.slice(...));
unpacked.slice(0, rawData.length) === rawData
```

## Validación

```bash
pnpm exec vitest run WebUI/tests/unit/korgMs2000RealFixture.test.js
```

## Licencia

Fixtures generados sintéticamente — sin restricciones de redistribución.