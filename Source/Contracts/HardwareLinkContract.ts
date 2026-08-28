/**
 * ABD Bank Manager — HardwareLinkContract Interface
 * Bidirectional MIDI SysEx communication with hardware synthesizers
 */

export interface HardwareDevice {
  name: string;
  inputId: string;
  outputId: string;
  manufacturer: string;
  modelId: string;
}

export interface HardwareLinkContract {
  modelId: string;

  // ─── Discovery ───
  detectHardware(midiOutputs: any[]): HardwareDevice | null;

  // ─── Dump TO Synth ───
  buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[];
  buildBankDump(patches: PatchData[], channel: number): Uint8Array[];

  // ─── Fetch FROM Synth ───
  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array;
  parseDumpResponse(data: Uint8Array): ImportResult;

  // ─── Edit Buffer (audition without overwrite) ───
  supportsEditBuffer: boolean;
  buildEditBufferDump?(patch: PatchData, channel: number): Uint8Array[];

  // ─── Timing ───
  interMessageDelayMs: number;
  dumpTimeoutMs: number;
}

export interface PatchData {
  name: string;
  category: string;
  author: string;
  tags: string[];
  notes: string;
  originAddress: string;
  rawData: Uint8Array;
  hardwareIds?: string[];        // Hardwares donde el blob es válido (canónico + compatibles); si falta, se deriva del contrato
  parameters?: Record<string, number>; // RESERVADO para plugins/editores — el gestor nunca lo usa ni lo muestra
  isFavorite: boolean;
  creationDate: string;
}

export interface ImportResult {
  success: boolean;
  modelId: string;
  bankName: string;
  patches: PatchData[];
  warnings: string[];
  error?: string;
}

/**
 * Base class with common MIDI utilities
 */
export abstract class BaseHardwareLink implements HardwareLinkContract {
  abstract modelId: string;
  abstract buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[];
  abstract buildBankDump(patches: PatchData[], channel: number): Uint8Array[];
  abstract buildDumpRequest(slot: number | 'all', channel: number): Uint8Array;
  abstract parseDumpResponse(data: Uint8Array): ImportResult;
  abstract supportsEditBuffer: boolean;
  abstract interMessageDelayMs: number;
  abstract dumpTimeoutMs: number;

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    // Override in subclasses for specific detection logic
    return null;
  }

  buildEditBufferDump?(patch: PatchData, channel: number): Uint8Array[] {
    return this.buildPatchDump(patch, 0x7F, channel); // 0x7F = edit buffer slot
  }

  protected createSysexHeader(command: number, channel: number): number[] {
    return [0xF0, ...this.getManufacturerId(), channel & 0x0F, this.getModelId(), command];
  }

  protected abstract getManufacturerId(): number[];
  protected abstract getModelId(): number;

  protected addChecksum(bytes: number[]): number[] {
    // Default: no checksum (Korg style). Override for Roland XOR, Yamaha sum & 0x7F
    return bytes;
  }

  protected finalizeSysex(bytes: number[]): Uint8Array {
    return new Uint8Array([...bytes, 0xF7]);
  }
}