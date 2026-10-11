/**
 * Korg All Data Dump (`0x4C`) import — the machine memory read back.
 *
 * `fetchAll()` in the MIDI transport asks for the whole memory with a `0x0E` request
 * (`buildDumpRequest('all')`) and hands whatever arrives to `parseDumpResponse`. The
 * MS2000 real device — and now the ABDMS2000 plugin acting as hardware — answers with a
 * single `F0 42 3n 58 4C ... F7` frame carrying **all** the programs.
 *
 * The Korg 7→8 packing goes over the concatenated stream, not per program (254 is not a
 * multiple of 7), so the frame has to be unpacked whole and split afterwards. Reading it
 * as a `0x40` returned just the first program and dropped the other 127 silently.
 */

import { describe, it, expect } from 'vitest';
import korgMs2000Contract from '../../../Source/Contracts/Models/korg-ms2000.ts';
import { pack8to7NoPad } from '../../../Source/Contracts/SysEx/codec.ts';
import { createMidiTransport } from '../../src/core/pro800Midi.js';

const PATCH_SIZE = 254;
const CMD_DUMP = 0x40;
const CMD_ALL_DUMP = 0x4C;

/** A real-size program whose bytes say which slot it is (name + a marker byte). */
function fakeProgram(index) {
  const raw = new Uint8Array(PATCH_SIZE);
  const name = `PROG ${String(index).padStart(3, '0')}`;
  for (let i = 0; i < name.length; i++) raw[0x00 + i] = name.charCodeAt(i);
  raw[0x26 + 20] = 64 + index; // cutoff del Timbre 1, distinto en cada programa
  return raw;
}

// `3n` de Korg con la lectura desplazada (canal 1 → 0x30), que es la que emite el Banco y la
// que traen los volcados reales de fábrica del repo.
function allDataFrame(programs, channel = 1) {
  const stream = new Uint8Array(programs.length * PATCH_SIZE);
  programs.forEach((p, i) => stream.set(p, i * PATCH_SIZE));
  const packed = pack8to7NoPad(stream);
  return new Uint8Array([0xF0, 0x42, 0x30 | ((channel - 1) & 0x0F), 0x58, CMD_ALL_DUMP, ...packed, 0xF7]);
}

function singleFrame(raw, channel = 1) {
  const packed = pack8to7NoPad(raw);
  return new Uint8Array([0xF0, 0x42, 0x30 | ((channel - 1) & 0x0F), 0x58, CMD_DUMP, ...packed, 0xF7]);
}

describe('Korg All Data Dump (0x4C) import', () => {
  it('reads the whole memory as N programs, not just the first one', () => {
    const programs = [fakeProgram(0), fakeProgram(1), fakeProgram(2)];
    const patches = korgMs2000Contract.parseDumpResponse(allDataFrame(programs));

    expect(patches).toHaveLength(3);
    patches.forEach((patch, i) => {
      expect(patch.rawData).toHaveLength(PATCH_SIZE);
      // Byte-exact: lo que el equipo (o el plugin haciendo de equipo) mandó es lo que entra.
      expect(Array.from(patch.rawData)).toEqual(Array.from(programs[i]));
      expect(korgMs2000Contract.extractPatchName(patch.rawData)).toBe(`PROG 00${i}`);
      expect(patch.rawData[0x26 + 20]).toBe(64 + i);
    });
  });

  it('reads the full 128-program memory of the machine', () => {
    const programs = Array.from({ length: 128 }, (_, i) => fakeProgram(i));
    const frame = allDataFrame(programs);
    const patches = korgMs2000Contract.parseDumpResponse(frame);

    expect(patches).toHaveLength(128);
    expect(patches[127].rawData[0x26 + 20]).toBe(64 + 127);
    expect(korgMs2000Contract.extractPatchName(patches[3].rawData)).toBe('PROG 003');
  });

  it('keeps single dumps (`0x40`) as one patch and mixes both in one buffer', () => {
    const bulk = allDataFrame([fakeProgram(0), fakeProgram(1)]);
    const single = singleFrame(fakeProgram(9));
    const mixed = new Uint8Array([...bulk, ...single]);

    // Un `0x40` sigue siendo un patch: no se parte en trozos.
    expect(korgMs2000Contract.parseDumpResponse(single)).toHaveLength(1);
    const patches = korgMs2000Contract.parseDumpResponse(mixed);
    expect(patches).toHaveLength(3);
    expect(korgMs2000Contract.extractPatchName(patches[2].rawData)).toBe('PROG 009');
  });

  it('ignores a frame that does not hold a whole program', () => {
    // Payload de 7 B → un programa de 254 B no cabe: nada que importar, y sin lanzar.
    const short = new Uint8Array([0xF0, 0x42, 0x30, 0x58, CMD_ALL_DUMP, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0xF7]);
    expect(korgMs2000Contract.parseDumpResponse(short)).toEqual([]);
  });
});

// ─── Transport: `fetchAll` de punta a punta ───

function fakePorts() {
  const listeners = new Set();
  const sent = [];
  const input = {
    id: 'fake-in',
    name: 'Fake In',
    addEventListener(type, cb) { if (type === 'midimessage') listeners.add(cb); },
    removeEventListener(type, cb) { if (type === 'midimessage') listeners.delete(cb); },
  };
  const output = {
    id: 'fake-out',
    name: 'Fake Out',
    send(bytes) { sent.push(Uint8Array.from(bytes)); },
  };
  return { input, output, sent, emit(bytes) { for (const cb of listeners) cb({ data: Uint8Array.from(bytes) }); } };
}

describe('fetchAll — pedir la memoria completa y recibirla', () => {
  it('pide el banco con un 0x0E de Korg y trae los 128 programas del 0x4C', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'korg-ms2000', input: ports.input, output: ports.output, timeoutMs: 250 });

    const pending = transport.fetchAll();
    // `3n` de Korg con el canal por defecto (1 → 0x30, lectura desplazada): F0 42 3n 58 0E F7.
    expect(Array.from(ports.sent[0])).toEqual([0xF0, 0x42, 0x30, 0x58, 0x0E, 0xF7]);

    const programs = Array.from({ length: 128 }, (_, i) => fakeProgram(i));
    ports.emit(allDataFrame(programs));

    const patches = await pending;
    expect(patches).toHaveLength(128);
    expect(korgMs2000Contract.extractPatchName(patches[127].rawData)).toBe('PROG 127');
    transport.close();
  });

  it('no trunca un banco que llega en varias tramas dentro del mismo burst', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'korg-ms2000', input: ports.input, output: ports.output, timeoutMs: 250 });

    const pending = transport.fetchAll();
    // Dos volcados de un programa en el mismo evento MIDI (el caso que antes se quedaba
    // con el primero y resolvía con 1 patch).
    ports.emit(new Uint8Array([...singleFrame(fakeProgram(0)), ...singleFrame(fakeProgram(1))]));

    const patches = await pending;
    expect(patches).toHaveLength(2);
    expect(korgMs2000Contract.extractPatchName(patches[1].rawData)).toBe('PROG 001');
    transport.close();
  });

  it('un volcado parcial se importa entero (el aviso de plazas lo da la UI)', async () => {
    const ports = fakePorts();
    const transport = createMidiTransport({ modelId: 'korg-ms2000', input: ports.input, output: ports.output, timeoutMs: 250 });

    const pending = transport.fetchAll();
    ports.emit(allDataFrame([fakeProgram(0), fakeProgram(1), fakeProgram(2)]));

    const patches = await pending;
    expect(patches).toHaveLength(3);
    transport.close();
  });
});
