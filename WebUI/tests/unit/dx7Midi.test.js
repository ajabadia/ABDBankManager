import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';

describe('DX7 MIDI Transport', () => {
  const contract = getModelContract('yamaha-dx7');

  it('should have a valid DX7 contract', () => {
    expect(contract).toBeDefined();
    expect(contract.modelId).toBe('yamaha-dx7');
    expect(contract.manufacturer).toBe('Yamaha');
  });

  it('should build a dump request (7 bytes)', () => {
    const request = contract.buildDumpRequest(0, 1);
    expect(request).toBeInstanceOf(Uint8Array);
    expect(request.length).toBe(7);
    // Standard DX7: F0 43 00 09 20 00 F7 (channel 1 = 0x00, 0-based)
    expect(request[0]).toBe(0xF0);
    expect(request[1]).toBe(0x43); // Yamaha
    expect(request[2]).toBe(0x00); // channel 1 (0-based in SysEx)
    expect(request[3]).toBe(0x09); // CMD_BULK
    expect(request[4]).toBe(0x20); // SUB_SINGLE
    expect(request[5]).toBe(0x00); // address low
    expect(request[6]).toBe(0xF7);
  });

  it('should build a valid single voice SysEx (136 bytes)', () => {
    const rawData = new Uint8Array(128);
    rawData[118] = 0x54;  // T (ASCII at name offset)
    rawData[119] = 0x45; // E
    rawData[120] = 0x53; // S
    rawData[121] = 0x54; // T

    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    // VCED format: 6 header + 155 data + 1 checksum + 1 F7 = 163 bytes
    expect(sysex.length).toBe(6 + 155 + 2);
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x43);
    // DX7 VCED single voice header: 00 01 1B
    expect(sysex[3]).toBe(0x00);
    expect(sysex[4]).toBe(0x01);
    expect(sysex[5]).toBe(0x1B);
    expect(sysex[sysex.length - 1]).toBe(0xF7);
  });

  it('should verify checksum of valid SysEx', () => {
    const rawData = new Uint8Array(128);
    rawData[118] = 0x54;  // T (ASCII at name offset)
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    expect(contract.verifyChecksum(sysex)).toBe(true);
  });

  it('should detect invalid checksum', () => {
    const rawData = new Uint8Array(128);
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    sysex[sysex.length - 2] = (sysex[sysex.length - 2] + 1) % 128;
    expect(contract.verifyChecksum(sysex)).toBe(false);
  });

  it('should parse a single voice SysEx', () => {
    const rawData = new Uint8Array(128);
    rawData[118] = 0x42;  // B (ASCII at name offset)
    rawData[119] = 0x41; // A
    rawData[120] = 0x53; // S
    rawData[121] = 0x53; // S

    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    const parsed = contract.parsePatchSysEx(sysex);
    expect(parsed).not.toBeNull();
    expect(parsed.rawData.length).toBe(128);
    expect(parsed.rawData[118]).toBe(0x42);
    expect(parsed.rawData[119]).toBe(0x41);
  });

  it('should extract name from parsed data (ASCII at offset 118)', () => {
    // DX7 voice name is ASCII at bytes 118-127
    const rawData = new Uint8Array(128);
    const name = 'E.PIANO 1';
    for (let i = 0; i < name.length; i++) {
      rawData[118 + i] = name.charCodeAt(i);
    }

    expect(contract.extractPatchName(rawData)).toBe('E.PIANO 1');
  });

  it('should parse bulk dump response (32 voices)', () => {
    // Standard DX7 6-byte header
    const header = [0xF0, 0x43, 0x10, 0x09, 0x20, 0x00];
    const payload = new Uint8Array(32 * 128);
    // Set first voice name at offset 118 (ASCII)
    payload[118] = 0x56;  // V
    payload[119] = 0x31; // 1
    // Set second voice name at offset 118 (ASCII)
    payload[128 + 118] = 0x56;  // V
    payload[128 + 119] = 0x32;  // 2

    // Build checksum (covers data after 6-byte header)
    let sum = 0;
    for (const b of payload) sum += b;
    const checksum = (128 - (sum % 128)) & 0x7F;

    const fullSysex = new Uint8Array(header.length + payload.length + 2);
    fullSysex.set(new Uint8Array(header), 0);
    fullSysex.set(payload, header.length);
    fullSysex[header.length + payload.length] = checksum;
    fullSysex[header.length + payload.length + 1] = 0xF7;

    const results = contract.parseDumpResponse(fullSysex);
    expect(results.length).toBe(32);
    expect(results[0].rawData[118]).toBe(0x56);
    expect(results[0].rawData[119]).toBe(0x31);
    expect(results[1].rawData[118]).toBe(0x56);
    expect(results[1].rawData[119]).toBe(0x32);
  });

  it('should have bankCapacity of 32', () => {
    expect(contract.bankCapacity).toBe(32);
  });

  it('should have programsPerBank of 32', () => {
    expect(contract.programsPerBank).toBe(32);
  });

  it('should have patchDataSize of 128', () => {
    expect(contract.patchDataSize).toBe(128);
  });
});
