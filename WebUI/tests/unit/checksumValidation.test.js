/**
 * Real Checksum Validation Tests
 * Verifies that checksums in real SysEx fixture files are valid
 * for each manufacturer's algorithm (Casio, Roland, Yamaha, Korg, Behringer).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { splitSysExMessages } from '../../src/core/sysexParser.js';
import { getModelContract } from '../../src/contracts/modelContracts.js';

// ─── Helpers ───

function readFixture(path) {
  return new Uint8Array(fs.readFileSync(path));
}

function getMessages(raw) {
  const msgs = splitSysExMessages(raw);
  expect(msgs.length).toBeGreaterThan(0);
  return msgs;
}

// ─── Yamaha DX7 — sum & 0x7F checksum ───

describe('Yamaha DX7 checksum validation (real fixtures)', () => {
  const contract = getModelContract('yamaha-dx7');

  it('validates checksum on single voice dump', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/single-voice.syx');
    const msgs = getMessages(raw);
    // DX7 single voice: F0 43 ch 09 20 00 <128 bytes voice> checksum F7
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on bulk 32-voice dump', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/fixtures/bulk-32voices.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on factory ROM1A', () => {
    const raw = readFixture('fixtures/sysex/yamaha-dx7/real-dumps/DX7_factory_rom1a.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on community dumps', () => {
    const communityFiles = [
      'fixtures/sysex/yamaha-dx7/user-dumps/community/2.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/community/5.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/community/7.syx'
    ];
    for (const file of communityFiles) {
      const raw = readFixture(file);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on ROM dumps', () => {
    const romFiles = [
      'fixtures/sysex/yamaha-dx7/user-dumps/rom/rom1a.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/rom/rom2a.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/rom/rom3b.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/rom/rom4a.syx'
    ];
    for (const file of romFiles) {
      const raw = readFixture(file);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on VRC dumps', () => {
    const vrcFiles = [
      'fixtures/sysex/yamaha-dx7/user-dumps/vrc/vrc101a.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/vrc/vrc105b.syx',
      'fixtures/sysex/yamaha-dx7/user-dumps/vrc/vrc112a.syx'
    ];
    for (const file of vrcFiles) {
      const raw = readFixture(file);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Casio CZ — sum & 0x7F checksum ───

describe('Casio CZ checksum validation (real fixtures)', () => {
  const contract = getModelContract('casio-cz101');

  it('validates checksum on CZ-101 bank', () => {
    const raw = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on CZ-1000 bank', () => {
    const raw = readFixture('fixtures/sysex/casio-cz/factory/CZ1000_Bank_A.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on CZ-5000 banks', () => {
    for (const bank of ['CZ5000_Bank_A.syx', 'CZ5000_Bank_B.syx']) {
      const raw = readFixture(`fixtures/sysex/casio-cz/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on CZ-1 banks', () => {
    for (const bank of ['CZ1_Bank_A.syx', 'CZ1_Bank_B.syx', 'CZ1_Bank_C.syx', 'CZ1_Bank_D.syx']) {
      const raw = readFixture(`fixtures/sysex/casio-cz/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Roland Juno — XOR checksum ───

describe('Roland Juno checksum validation (real fixtures)', () => {
  const contract = getModelContract('roland-juno106');

  // Roland Juno banks contain mixed message lengths: 23-byte single patch dumps
  // (CMD_PATCH_DUMP) plus shorter non-patch SysEx commands (bulk function, etc).
  // verifyChecksum only validates patch dump messages (length 23 with CMD_PATCH_DUMP).
  function patchDumpMessages(msgs) {
    return msgs.filter(m => m.length === 23 && m[2] === 0x30); // CMD_PATCH_DUMP = 0x30
  }

  it('validates checksum on Juno-106 patch dumps', () => {
    for (const bank of ['Juno106_Bank_A.syx', 'Juno106_Bank_B.syx']) {
      const raw = readFixture(`fixtures/sysex/roland-juno/factory/${bank}`);
      const msgs = patchDumpMessages(getMessages(raw));
      expect(msgs.length).toBeGreaterThan(0);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on Juno-60 patch dumps', () => {
    for (const bank of ['Juno60_Bank_A.syx', 'Juno60_Bank_B.syx']) {
      const raw = readFixture(`fixtures/sysex/roland-juno/factory/${bank}`);
      const msgs = patchDumpMessages(getMessages(raw));
      expect(msgs.length).toBeGreaterThan(0);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on Juno-6 patch dumps', () => {
    for (const bank of ['Juno6_Bank_A.syx', 'Juno6_Bank_B.syx']) {
      const raw = readFixture(`fixtures/sysex/roland-juno/factory/${bank}`);
      const msgs = patchDumpMessages(getMessages(raw));
      expect(msgs.length).toBeGreaterThan(0);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on HS-60 patch dumps', () => {
    for (const bank of ['HS60_Bank_A.syx', 'HS60_Bank_B.syx']) {
      const raw = readFixture(`fixtures/sysex/roland-juno/factory/${bank}`);
      const msgs = patchDumpMessages(getMessages(raw));
      expect(msgs.length).toBeGreaterThan(0);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Korg MS2000 — 7-to-8 packing checksum ───

describe('Korg MS2000 checksum validation (real fixtures)', () => {
  const contract = getModelContract('korg-ms2000');

  it('validates checksum on all MS2000 factory banks', () => {
    const banks = ['MS2000_Bank_A.syx', 'MS2000_Bank_B.syx', 'MS2000_Bank_C.syx', 'MS2000_Bank_D.syx'];
    for (const bank of banks) {
      const raw = readFixture(`fixtures/sysex/korg-ms2000/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Korg microKORG — 7-to-8 packing checksum ───

describe('Korg microKORG checksum validation (real fixtures)', () => {
  const contract = getModelContract('korg-microkorg');

  it('validates checksum on all microKORG factory banks', () => {
    const banks = ['MicroKORG_Bank_A.syx', 'MicroKORG_Bank_B.syx', 'MicroKORG_Bank_C.syx', 'MicroKORG_Bank_D.syx'];
    for (const bank of banks) {
      const raw = readFixture(`fixtures/sysex/korg-microkorg/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Korg Prophecy — 7-to-8 packing checksum (ctrl-at-end) ───

describe('Korg Prophecy checksum validation (real fixtures)', () => {
  const contract = getModelContract('korg-prophecy');

  it('validates checksum on Prophecy single dumps (cmd 0x40)', () => {
    const singles = ['VCS3.SYX', 'STEELBLL.SYX', '70SAW.SYX', '5000HZ.SYX', 'Whiskey.syx'];
    for (const bank of singles) {
      const raw = readFixture(`fixtures/sysex/korg-prophecy/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });

  it('validates checksum on Prophecy bank dumps (cmd 0x4C)', () => {
    const banks = ['Megawave.syx', 'Modmodel.syx'];
    for (const bank of banks) {
      const raw = readFixture(`fixtures/sysex/korg-prophecy/factory/${bank}`);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});

// ─── Behringer DeepMind 12 — 7-to-8 packing checksum ───

describe('Behringer DeepMind 12 checksum validation (real fixtures)', () => {
  const contract = getModelContract('behringer-deepmind12');

  it('validates checksum on factory bank v1.0', () => {
    const raw = readFixture('fixtures/sysex/behringer-deepmind12/factory/Factory Bank A v1.0.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on factory bank v1.1.2', () => {
    const raw = readFixture('fixtures/sysex/behringer-deepmind12/factory/Factory Bank A v1.1.2.syx');
    const msgs = getMessages(raw);
    for (const msg of msgs) {
      expect(contract.verifyChecksum(msg)).toBe(true);
    }
  });

  it('validates checksum on community dumps', () => {
    const communityFiles = [
      'fixtures/sysex/behringer-deepmind12/community/AE Angelia.syx',
      'fixtures/sysex/behringer-deepmind12/community/AE CinemaDrone.syx'
    ];
    for (const file of communityFiles) {
      const raw = readFixture(file);
      const msgs = getMessages(raw);
      for (const msg of msgs) {
        expect(contract.verifyChecksum(msg)).toBe(true);
      }
    }
  });
});
