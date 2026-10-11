/**
 * Convención del canal `3n` de Korg — item 4 del roadmap de ABDMS2000.
 *
 * La cabecera de Korg es `F0 42 3n …`. El Bank Manager emitía `0x30 | channel` (canal 1 →
 * `F0 42 31 …`), **un desplazado** frente al plugin (`MS2000HardwareProgram::korgChannelByte`,
 * `0x30 | (canal − 1)`) y frente a los volcados reales de fábrica del repo (23 de los 24 `.syx`
 * de Korg en `fixtures/` empiezan por `F0 42 30`). **Corregido el 2026-09-15** pasando el byte
 * al punto único `korgChannelByte`, que ahora comparten el MS2000/microKORG y el Prophecy.
 *
 * Este test fija el comportamiento corregido (canal 1 → `0x30`) para que un cambio se vea en un
 * solo sitio. La corrección está decidida **por evidencia**, no confirmada por el equipo: queda
 * pendiente mandarle las dos tramas de abajo con el MS2000 en canal 1. Si contestara al `0x31`,
 * se pone `KORG_CHANNEL_ZERO_BASED = false` y este test pasa a esperar `0x31`.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import korgMs2000Contract, {
  KORG_CHANNEL_BYTE_BASE,
  KORG_CHANNEL_ZERO_BASED,
  korgChannelByte,
} from '../../../Source/Contracts/Models/korg-ms2000.ts';
import { korgProphecyContract } from '../../../Source/Contracts/Models/korg-prophecy.ts';

const CMD_REQUEST = 0x10;
const CMD_ALL_REQUEST = 0x0E;

/** Lo que manda el Banco con el equipo en canal 1 (y lo que manda el plugin). */
const PROBE_CANAL_1 = [0xF0, 0x42, 0x30, 0x58, CMD_REQUEST, 0xF7];
/** La otra lectura: lo que habría que poner si el equipo contesta a este byte. */
const PROBE_ALTERNATIVA = [0xF0, 0x42, 0x31, 0x58, CMD_REQUEST, 0xF7];

/** `0x30 | (canal − 1)`, en una sola línea, para comprobar el helper desde fuera. */
const desplazada = channel => KORG_CHANNEL_BYTE_BASE | ((channel - 1) & 0x0F);

describe('convención del canal 3n — el byte corregido', () => {
  it('la constante declara la lectura desplazada (canal 1 → 0x30)', () => {
    expect(KORG_CHANNEL_ZERO_BASED).toBe(true);
    expect(KORG_CHANNEL_BYTE_BASE).toBe(0x30);
    expect(korgChannelByte(1)).toBe(0x30);
  });

  it('el helper es el punto único: cubre los 16 canales dentro de 0x30..0x3F', () => {
    for (let channel = 1; channel <= 16; channel++) {
      expect(korgChannelByte(channel)).toBe(desplazada(channel));
    }
    expect(korgChannelByte(1)).toBe(0x30);
    expect(korgChannelByte(16)).toBe(0x3F);
  });

  it('acota el canal fuera de rango en vez de desbordar el nibble (igual que el C++)', () => {
    // `0`/`undefined`/`NaN` son «canal por defecto», no un canal válido distinto.
    expect(korgChannelByte(0)).toBe(0x30);
    expect(korgChannelByte(undefined)).toBe(0x30);
    expect(korgChannelByte(NaN)).toBe(0x30);
    expect(korgChannelByte(17)).toBe(0x3F);
    expect(korgChannelByte(-3)).toBe(0x30);
  });

  it('la petición de volcado del canal 1 sale con 0x30, individual y de banco completo', () => {
    expect([...korgMs2000Contract.buildDumpRequest(0, 1)]).toEqual(PROBE_CANAL_1);
    expect([...korgMs2000Contract.buildDumpRequest('all', 1)]).toEqual([0xF0, 0x42, 0x30, 0x58, CMD_ALL_REQUEST, 0xF7]);
  });

  it('y el patch individual, igual: mismo helper para todas las tramas', () => {
    const sysex = korgMs2000Contract.buildPatchSysEx(new Uint8Array(254), 0, 1);
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x42);
    expect(sysex[2]).toBe(0x30);
    expect(sysex[3]).toBe(0x58);
  });

  it('el canal 2 va a 0x31 (el desplazamiento no es un canal fijo)', () => {
    expect([...korgMs2000Contract.buildDumpRequest(0, 2)][2]).toBe(0x31);
    expect(korgChannelByte(15)).toBe(0x3E);
  });

  it('el Prophecy comparte el mismo byte: una sola convención de Korg en el repo', () => {
    // Misma cabecera (`F0 42 3n`), mismo helper, mismo byte para el canal 1. Antes este
    // contrato repetía la lectura desplazada al revés.
    expect(korgProphecyContract.midi?.defaultChannel).toBe(1);
    expect([...korgProphecyContract.buildDumpRequest(0, 1)]).toEqual([0xF0, 0x42, 0x30, 0x41, CMD_REQUEST, 0xF7]);
    const sysex = korgProphecyContract.buildPatchSysEx(new Uint8Array(535), 0, 1);
    expect(sysex[2]).toBe(0x30);
    expect(sysex[3]).toBe(0x41);
  });

  it('el parseo no filtra por canal, así que revertir no rompería la lectura', () => {
    // Un dump del equipo entra igual venga en 0x30 o en 0x31: la ida y vuelta con el plugin
    // (que devuelve el mismo byte que recibe) no depende de esta decisión.
    const raw = new Uint8Array(254).fill(7);
    const own = korgMs2000Contract.buildPatchSysEx(raw, 0, 1);
    expect(own[2]).toBe(0x30);
    expect(korgMs2000Contract.parsePatchSysEx(own)).not.toBeNull();

    const shifted = new Uint8Array(own);
    shifted[2] = 0x31;
    const parsed = korgMs2000Contract.parsePatchSysEx(shifted);
    expect(parsed).not.toBeNull();
    expect(parsed.rawData).toEqual(raw);
  });
});

describe('evidencia de los volcados reales de Korg del repo', () => {
  const root = path.resolve('fixtures/sysex');

  const syxFiles = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...syxFiles(full));
      else if (entry.name.toLowerCase().endsWith('.syx')) out.push(full);
    }
    return out;
  };

  const korgFiles = fs.existsSync(root)
    ? syxFiles(root).filter(file => /korg/i.test(file))
    : [];

  it('los volcados de fábrica de Korg del repo empiezan por F0 42 30 (canal 1 desplazado)', () => {
    expect(korgFiles.length).toBeGreaterThan(10);

    const channelBytes = korgFiles.map(file => fs.readFileSync(file)[2]);
    // Todos son cabeceras de canal válidas (0x30..0x3F).
    expect(channelBytes.every(byte => byte >= 0x30 && byte <= 0x3F)).toBe(true);

    // El byte dominante es 0x30, que es lo que emite ya el Banco: esa es la evidencia en la
    // que se apoyó la corrección.
    const at0x30 = channelBytes.filter(byte => byte === 0x30).length;
    expect(at0x30).toBeGreaterThanOrEqual(korgFiles.length - 1);
    expect(at0x30 / korgFiles.length).toBeGreaterThan(0.9);
  });

  it('la prueba que queda pendiente con el equipo: cuál de las dos tramas contesta', () => {
    // Con el MS2000 en canal 1. Hoy el Banco manda PROBE_CANAL_1 (0x30); si el equipo
    // contestara solo al 0x31, se revierte `KORG_CHANNEL_ZERO_BASED` a `false`.
    expect(PROBE_CANAL_1[2]).toBe(0x30);
    expect(PROBE_ALTERNATIVA[2]).toBe(0x31);
    expect(PROBE_ALTERNATIVA[2] - PROBE_CANAL_1[2]).toBe(1);
  });
});
