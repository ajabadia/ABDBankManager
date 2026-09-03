/**
 * Roland AIRA Modular adapter tests
 * - DT1/RQ1 framing + Roland 7-bit checksum
 * - Canonical state roundtrip: build DT1 stream → parse → state ≡ original
 */
import { describe, it, expect } from 'vitest';
import {
  rolandChecksum, buildDt1, buildRq1, parseDt1,
  encodeAiraState, decodeAiraState, buildStateDt1s,
  RolandAiraImportAdapter, RolandAiraExportAdapter, RolandAiraHardwareLink,
} from '@contracts/Adapters/rolandAiraAdapter';

describe('AIRA — DT1/RQ1 framing', () => {
  it('computes the Roland 7-bit checksum', () => {
    // sum(0x10, 0x00, 0x00, 0x01) = 0x11 → checksum = 0x80 - 0x11 = 0x6F
    expect(rolandChecksum(new Uint8Array([0x10, 0x00, 0x00, 0x01]))).toBe(0x6F);
    // Zero-sum → 0x80 & 0x7F = 0
    expect(rolandChecksum(new Uint8Array([0x00]))).toBe(0x00);
  });

  it('frames a DT1 write message with valid checksum', () => {
    const msg = buildDt1(0x15, [0x10, 0x00, 0x00, 0x01], new Uint8Array([0x2A]));
    expect(msg[0]).toBe(0xF0);
    expect(msg[1]).toBe(0x41);
    expect(msg[2]).toBe(0x10);
    expect(msg[7]).toBe(0x12); // DT1
    expect(msg[msg.length - 1]).toBe(0xF7);
    expect(parseDt1(msg)).not.toBeNull();
  });

  it('rejects DT1 messages with a bad checksum', () => {
    const msg = buildDt1(0x15, [0x10, 0x00, 0x00, 0x01], new Uint8Array([0x2A]));
    const corrupted = Uint8Array.from(msg);
    corrupted[corrupted.length - 2] = (corrupted[corrupted.length - 2] + 1) & 0x7F;
    expect(parseDt1(corrupted)).toBeNull();
  });

  it('rejects non-AIRA messages', () => {
    expect(parseDt1(new Uint8Array([0xF0, 0x42, 0x10, 0x00, 0x00, 0x00, 0x15, 0x12,
      0x10, 0x00, 0x00, 0x01, 0x2A, 0x6F, 0xF7]))).toBeNull();
  });

  it('builds an RQ1 read request', () => {
    const rq1 = buildRq1(0x15, [0x10, 0x00, 0x00, 0x00], [0x00, 0x00, 0x00, 0x10]);
    expect(rq1[0]).toBe(0xF0);
    expect(rq1[7]).toBe(0x11); // RQ1
    expect(rq1[rq1.length - 1]).toBe(0xF7);
  });
});

describe('AIRA — canonical state roundtrip', () => {
  function sampleState() {
    return {
      modelId: 'roland-aira-demora',
      mainParams: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      slotTypes: [1, 2, 3, 0, 5, 0],
      slotParams: [
        [10, 20, 30, 40], [50, 60, 70, 80], [90, 100, 110, 120],
        [0, 0, 0, 0], [10, 20, 30, 40], [0, 0, 0, 0],
      ],
      cables: [{ source: 0, destination: 6 }, { source: 3, destination: 9 }],
      conditions: new Uint8Array(22 * 6),
    };
  }

  it('roundtrips state → canonical bytes → state', () => {
    const state = sampleState();
    const encoded = encodeAiraState(state);
    expect(encoded.length).toBeGreaterThanOrEqual(302);
    expect(encoded[0]).toBe(0x17); // demora

    const decoded = decodeAiraState(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.modelId).toBe('roland-aira-demora');
    expect(decoded!.mainParams).toEqual(state.mainParams);
    expect(decoded!.slotTypes).toEqual(state.slotTypes);
    expect(decoded!.slotParams).toEqual(state.slotParams);
    expect(decoded!.cables).toEqual(state.cables);
  });

  it('roundtrips DT1 stream → parse → identical state', () => {
    const state = sampleState();
    const stream = buildStateDt1s(0x17, state);

    const parsed = stream.map(m => parseDt1(m)).filter(m => m !== null);
    expect(parsed.length).toBeGreaterThan(0);

    const rebuilt = {
      modelId: 'roland-aira-demora',
      mainParams: new Array(10).fill(0),
      slotTypes: new Array(6).fill(0),
      slotParams: Array.from({ length: 6 }, () => new Array(4).fill(0)),
      cables: [],
      conditions: new Uint8Array(22 * 6),
    };
    for (const dt1 of parsed) {
      const [q, w, x, y] = dt1!.addr;
      if (q === 0x10 && w === 0x00 && x === 0x00) {
        for (let k = 0; k < dt1!.data.length; k++) {
          const idx = y - 1 + k;
          if (idx >= 0 && idx < 10) rebuilt.mainParams[idx] = dt1!.data[k];
        }
      } else if (q === 0x10 && w === 0x10 && x === 0x00) {
        const slot = Math.floor(y / 5);
        const off = y % 5;
        for (let k = 0; k < dt1!.data.length; k++) {
          const o = off + k;
          if (o === 0) rebuilt.slotTypes[slot] = dt1!.data[k];
          else if (o <= 4) rebuilt.slotParams[slot][o - 1] = dt1!.data[k];
        }
      } else if (q === 0x10 && w === 0x20) {
        rebuilt.cables.push({ source: x, destination: y });
      }
    }

    expect(rebuilt.mainParams).toEqual(state.mainParams);
    expect(rebuilt.slotTypes).toEqual(state.slotTypes);
    expect(rebuilt.slotParams).toEqual(state.slotParams);
    expect(rebuilt.cables).toEqual(state.cables);
  });
});

describe('AIRA — import/export adapters', () => {
  it('rejects non-AIRA .syx files', () => {
    const adapter = new RolandAiraImportAdapter();
    const junk = new Uint8Array([0xF0, 0x41, 0x10, 0x00, 0x00, 0x00, 0x3E, 0x12,
      0x10, 0x00, 0x00, 0x01, 0x2A, 0x6F, 0xF7]); // modelId 0x3E = Juno, not AIRA
    expect(adapter.canParse(junk, 'patch.syx')).toBe(false);
  });

  it('accepts and parses a valid AIRA DT1 stream', () => {
    const state = {
      modelId: 'roland-aira-bitrazer',
      mainParams: [64, 64, 64, 64, 64, 64, 64, 64, 64, 64],
      slotTypes: [1, 0, 0, 0, 0, 0],
      slotParams: [[50, 100, 20, 80], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      cables: [{ source: 0, destination: 6 }],
      conditions: new Uint8Array(22 * 6),
    };
    const stream = buildStateDt1s(0x15, state);

    const result = new RolandAiraImportAdapter().parse(stream, 'aira.syx');
    expect(result.success).toBe(true);
    expect(result.modelId).toBe('roland-aira-bitrazer');
    expect(result.patches.length).toBe(1);
    expect(result.patches[0].rawData[0]).toBe(0x15);
  });

  it('export → import roundtrips the state', () => {
    const state = {
      modelId: 'roland-aira-scooper',
      mainParams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      slotTypes: [1, 2, 0, 0, 0, 0],
      slotParams: [[1, 2, 3, 4], [5, 6, 7, 8], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      cables: [{ source: 2, destination: 8 }],
      conditions: new Uint8Array(22 * 6),
    };
    const encoded = encodeAiraState(state);
    const patch = {
      name: 'x', category: 'Other', author: '', tags: [], notes: '',
      originAddress: 'AIRA', rawData: encoded, parameters: {}, isFavorite: false,
      creationDate: new Date().toISOString(),
    };
    const stream = new RolandAiraExportAdapter().serialize([patch], 'bank');
    const result = new RolandAiraImportAdapter().parse(stream, 'aira.syx');
    expect(result.success).toBe(true);
    expect(result.modelId).toBe('roland-aira-scooper');

    const decoded = decodeAiraState(result.patches[0].rawData);
    expect(decoded).not.toBeNull();
    expect(decoded!.modelId).toBe('roland-aira-scooper');
    expect(decoded!.mainParams).toEqual(state.mainParams);
    expect(decoded!.slotTypes).toEqual(state.slotTypes);
    expect(decoded!.slotParams).toEqual(state.slotParams);
    expect(decoded!.cables).toEqual(state.cables);
  });
});

describe('AIRA — hardware link', () => {
  it('detects AIRA modules by name', () => {
    const link = new RolandAiraHardwareLink();
    const ports = [
      { id: 'p1', name: 'Bitrazer MIDI', manufacturer: '' },
      { id: 'p2', name: 'Some Other Device', manufacturer: '' },
    ];
    const detected = link.detectHardware(ports as never);
    expect(detected).not.toBeNull();
    expect(detected!.name).toBe('Bitrazer MIDI');
    expect(link.detectHardware([ports[1]] as never)).toBeNull();
  });

  it('builds a full DT1 stream from a state patch', () => {
    const link = new RolandAiraHardwareLink();
    const state = {
      modelId: 'roland-aira-torcido',
      mainParams: new Array(10).fill(64),
      slotTypes: new Array(6).fill(0),
      slotParams: Array.from({ length: 6 }, () => new Array(4).fill(0)),
      cables: [],
      conditions: new Uint8Array(22 * 6),
    };
    const encoded = encodeAiraState(state);
    const patch = {
      name: 'x', category: 'Other', author: '', tags: [], notes: '',
      originAddress: 'AIRA', rawData: encoded, parameters: {}, isFavorite: false,
      creationDate: new Date().toISOString(),
    };
    const msgs = link.buildPatchDump(patch, 0, 0);
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(m[0]).toBe(0xF0);
      expect(m[m.length - 1]).toBe(0xF7);
      expect(parseDt1(m)).not.toBeNull();
    }
  });
});
