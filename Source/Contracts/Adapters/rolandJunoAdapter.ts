/**
 * Roland Juno-106 / Juno-60 / Juno-6 / HS-60 Adapter
 *
 * SysEx format: F0 41 <ch> <modelId> <cmd> <addr> <data...> <checksum> F7
 * - modelId: 0x3E (106/HS-60), 0x3D (60), 0x3C (6)
 * - cmd: 0x12 = patch dump data, 0x11 = request
 * - addr: bank(0=20,1=21) + patchNum(0-63)
 * - checksum: XOR all bytes from ch to last data byte, invert, & 0x7F
 * - patch data: 18 bytes (DCO, HPF, VCF, VCA, ENV, LFO, Chorus)
 * - No patch name in data
 */

import { BaseImportAdapter, ImportResult, PatchData } from '../ImportAdapter';
import { BaseExportAdapter, ExportOptions } from '../ExportAdapter';
import { BaseHardwareLink, HardwareDevice, ImportResult as HLImportResult } from '../HardwareLinkContract';
import { rolandChecksum, splitSysexMessages } from './sysexUtils';

// ─── Constants ───

const MANUFACTURER_ID = [0x41];
const MODEL_IDS: Record<string, number> = {
  'roland-juno106': 0x3E,
  'roland-juno60':  0x3D,
  'roland-juno6':   0x3C,
  'roland-hs60':    0x3E,
};

const PATCH_DATA_SIZE = 18;
const CMD_PATCH_DUMP = 0x12;
const CMD_REQUEST    = 0x11;
const ADDR_BANK_A    = 0x20;
const ADDR_BANK_B    = 0x21;

const ALL_MODEL_IDS = Object.keys(MODEL_IDS);

// ─── Import Adapter ───

export class RolandJunoImportAdapter extends BaseImportAdapter {
  adapterId = 'sysex-roland-juno';
  displayName = 'Roland Juno-106 / 60 / 6 / HS-60';
  supportedExtensions = ['.syx'];
  targetModelIds = ALL_MODEL_IDS;

  canParse(data: Uint8Array, filename: string): boolean {
    if (!filename.toLowerCase().endsWith('.syx')) return false;
    const msgs = splitSysexMessages(data);
    return msgs.some(m => this.isRolandJuno(m));
  }

  private isRolandJuno(msg: Uint8Array): boolean {
    return msg.length >= 6
      && msg[0] === 0xF0
      && msg[1] === 0x41
      && msg[3] in MODEL_IDS
      && msg[4] === CMD_PATCH_DUMP;
  }

  verifyChecksum(data: Uint8Array): boolean {
    const msgs = splitSysexMessages(data);
    for (const msg of msgs) {
      if (!this.isRolandJuno(msg)) continue;
      // XOR bytes from [1] to [-2] (before checksum), checksum is at [-2]
      const payload = msg.slice(1, msg.length - 2);
      const expected = rolandChecksum(payload);
      if (msg[msg.length - 2] !== expected) return false;
    }
    return true;
  }

  parse(data: Uint8Array, filename: string): ImportResult {
    const msgs = splitSysexMessages(data).filter(m => this.isRolandJuno(m));
    if (msgs.length === 0) {
      return this.createResult({
        success: false,
        modelId: 'roland-juno106',
        error: 'No se encontraron mensajes SysEx Roland Juno válidos',
      });
    }

    const modelIdByte = msgs[0][3];
    const modelId = Object.entries(MODEL_IDS).find(([,id]) => id === modelIdByte)?.[0] || 'roland-juno106';
    const patches: PatchData[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const bank = msg[5] === ADDR_BANK_B ? 1 : 0;
      const patchNum = msg[6];
      const globalIndex = bank * 64 + patchNum;
      const rawData = msg.slice(7, 7 + PATCH_DATA_SIZE);

      patches.push(this.createPatchData({
        name: `${bank ? 'B' : 'A'}${patchNum + 1}`,
        originAddress: `${bank ? 'B' : 'A'}${patchNum + 1}`,
        rawData: new Uint8Array(rawData),
        hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
      }));
    }

    return this.createResult({
      modelId,
      bankName: `Roland ${modelId.replace('roland-', '').toUpperCase()}`,
      patches,
    });
  }
}

// ─── Export Adapter ───

export class RolandJunoExportAdapter extends BaseExportAdapter {
  adapterId = 'export-roland-juno';
  displayName = 'Roland Juno-106 / 60 / 6 / HS-60';
  fileExtension = '.syx';
  targetModelIds = ALL_MODEL_IDS;

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array {
    const opts = { ...this.getDefaultOptions(), ...options };
    const modelId = this.resolveModelId(opts.deviceId);
    const parts: number[] = [];

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const bank = i < 64 ? ADDR_BANK_A : ADDR_BANK_B;
      const patchNum = i % 64;

      // Header: F0 41 <ch> <modelId> 0x12 <bank> <patchNum>
      const header = [0xF0, 0x41, opts.midiChannel & 0x0F, modelId, CMD_PATCH_DUMP, bank, patchNum];
      const data = Array.from(p.rawData.slice(0, PATCH_DATA_SIZE));
      // Pad if shorter
      while (data.length < PATCH_DATA_SIZE) data.push(0);

      const payload = Uint8Array.from([...header.slice(1), ...data]); // exclude F0
      const checksum = rolandChecksum(payload);

      parts.push(...header, ...data, checksum, 0xF7);
    }

    return new Uint8Array(parts);
  }

  private resolveModelId(deviceId: number): number {
    // deviceId maps to model ID; default to Juno-106
    return MODEL_IDS['roland-juno106'];
  }
}

// ─── Hardware Link ───

export class RolandJunoHardwareLink extends BaseHardwareLink {
  modelId = 'roland-juno106';
  supportsEditBuffer = false; // Juno-106 has no edit buffer
  interMessageDelayMs = 50;
  dumpTimeoutMs = 3000;

  protected getManufacturerId(): number[] { return MANUFACTURER_ID; }
  protected getModelId(): number { return MODEL_IDS[this.modelId] || 0x3E; }

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    for (const output of midiOutputs) {
      const name = output.name || '';
      if (/juno.?106/i.test(name) || /juno.?60/i.test(name) || /juno.?6[^0]/i.test(name) || /hs.?60/i.test(name)) {
        return {
          name,
          inputId: output.id || '',
          outputId: output.id || '',
          manufacturer: 'Roland',
          modelId: this.modelId,
        };
      }
    }
    return null;
  }

  buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[] {
    const bank = slot < 64 ? ADDR_BANK_A : ADDR_BANK_B;
    const patchNum = slot % 64;
    const header = this.createSysexHeader(CMD_PATCH_DUMP, channel);
    const payload = [...header.slice(1), bank, patchNum, ...Array.from(patch.rawData.slice(0, PATCH_DATA_SIZE))];
    const checksum = rolandChecksum(Uint8Array.from(payload));
    return [this.finalizeSysex([...payload, checksum])];
  }

  buildBankDump(patches: PatchData[], channel: number): Uint8Array[] {
    return patches.flatMap((p, i) => this.buildPatchDump(p, i, channel));
  }

  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array {
    // Request single patch or all patches
    const modelId = this.getModelId();
    if (slot === 'all') {
      // All patches request
      return new Uint8Array([0xF0, 0x41, channel & 0x0F, modelId, CMD_REQUEST, ADDR_BANK_A, 0x00, 0x00, 0xF7]);
    }
    const bank = slot < 64 ? ADDR_BANK_A : ADDR_BANK_B;
    const patchNum = slot % 64;
    return new Uint8Array([0xF0, 0x41, channel & 0x0F, modelId, CMD_REQUEST, bank, patchNum, 0xF7]);
  }

  parseDumpResponse(data: Uint8Array): HLImportResult {
    const adapter = new RolandJunoImportAdapter();
    return adapter.parse(data, 'dump.syx');
  }
}
