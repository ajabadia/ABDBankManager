/**
 * ABD Bank Manager — ModelContract Interface
 * Defines the capabilities and structure of a synthesizer model
 */

export interface ModelContract {
  // ─── Identity ───
  modelId: string;              // 'casio-cz101', 'roland-juno106', 'korg-ms2000', 'behringer-deepmind12', 'yamaha-dx7'
  displayName: string;          // 'Casio CZ-101'
  manufacturer: string;         // 'Casio', 'Roland', 'Korg', 'Behringer', 'Yamaha'
  icon?: string;                // URL or SVG inline logo
  thumbnail?: string;           // Path to hardware image (~200x120px, WebP)

  // ─── Bank Structure ───
  bankCapacity: number;         // Total patches (16 CZ101, 128 Juno106, 128 MS2000, 1024 DM12)
  banksCount: number;           // Logical banks (1 CZ, 2 Juno, 8 MS2000, 8 DM12)
  programsPerBank: number;      // Patches per bank (16, 64, 16, 128)

  // ─── Addressing ───
  getProgramAddress(globalIndex: number): string;
  parseProgramAddress(address: string): number | null;

  // ─── Patch Data ───
  patchDataSize: number;        // Bytes per patch (128 CZ, 18 Juno, 288 MS2000, 242 DM12)
  patchNameMaxLength: number;   // Name chars (0 CZ, 0 Juno, 12 MS2000, 16 DM12)
  extractPatchName?(data: Uint8Array): string;

  // ─── Categories ───
  categories: string[];         // ['Bass','Lead','Pad','FX','Keys','Perc','Synth','Other']
  defaultCategory: string;      // 'Other'

  // ─── Compatibility ───
  compatibleModels?: string[];  // Models with identical patch format

  // ─── SysEx Metadata ───
  sysexManufacturerId: number[]; // [0x44,0x00,0x00] Casio, [0x41] Roland, [0x42] Korg
  formatVersion: number;        // Contract version for migrations

  // ─── MIDI Defaults (derived, not user-editable) ───
  midi?: {
    defaultChannel: number;   // MIDI channel 1-16 for SysEx dumps
    defaultDeviceId: number;  // Device ID for SysEx headers (e.g. Roland Juno: 0x18)
  };

  // ─── SysEx Operations (contract-driven import/export) ───
  /** Build a complete SysEx message for a single patch dump */
  buildPatchSysEx?(rawData: Uint8Array, slot: number, channel: number): Uint8Array;
  /** Parse a SysEx message into { rawData, slot } or null if not matching */
  parsePatchSysEx?(sysex: Uint8Array): { rawData: Uint8Array; slot: number } | null;
  /** Compute manufacturer-specific checksum byte for the given payload */
  computeChecksum?(data: Uint8Array): number;
  /** Verify checksum on a complete SysEx message (returns true if valid) */
  verifyChecksum?(sysex: Uint8Array): boolean;
  /** Build a dump request message (single slot or 'all') */
  buildDumpRequest?(slot: number | 'all', channel: number): Uint8Array;
  /** Parse a dump response (bulk) into an array of { rawData, slot } */
  parseDumpResponse?(sysex: Uint8Array): { rawData: Uint8Array; slot: number }[];
  /** Whether this model supports edit buffer (audition without overwrite) */
  supportsEditBuffer?: boolean;
  /** Minimum delay between SysEx messages (ms) */
  interMessageDelayMs?: number;
  /** Timeout waiting for dump response (ms) */
  dumpTimeoutMs?: number;

  // ─── Legacy Support (Guide §9.1 compat) ───
  legacySysEx?: {
    modelIdByte: number;
    buildDumpRequest: (channel: number) => Uint8Array;
    validateSysEx: (bytes: Uint8Array) => boolean;
  };
}

/**
 * Validates a ModelContract implementation
 */
export function validateModelContract(contract: ModelContract): { valid: boolean; errors: string[] } {
  const errors = [];

  if (!contract.modelId) errors.push('modelId is required');
  if (!contract.displayName) errors.push('displayName is required');
  if (!contract.manufacturer) errors.push('manufacturer is required');

  if (!Number.isInteger(contract.bankCapacity) || contract.bankCapacity <= 0) {
    errors.push('bankCapacity must be positive integer');
  }
  if (!Number.isInteger(contract.banksCount) || contract.banksCount <= 0) {
    errors.push('banksCount must be positive integer');
  }
  if (!Number.isInteger(contract.programsPerBank) || contract.programsPerBank <= 0) {
    errors.push('programsPerBank must be positive integer');
  }
  if (contract.banksCount * contract.programsPerBank !== contract.bankCapacity) {
    errors.push('banksCount * programsPerBank must equal bankCapacity');
  }

  if (typeof contract.getProgramAddress !== 'function') {
    errors.push('getProgramAddress function required');
  }
  if (typeof contract.parseProgramAddress !== 'function') {
    errors.push('parseProgramAddress function required');
  }

  if (!Number.isInteger(contract.patchDataSize) || contract.patchDataSize <= 0) {
    errors.push('patchDataSize must be positive integer');
  }
  if (!Number.isInteger(contract.patchNameMaxLength) || contract.patchNameMaxLength < 0) {
    errors.push('patchNameMaxLength must be non-negative integer');
  }

  if (!Array.isArray(contract.categories) || contract.categories.length === 0) {
    errors.push('categories must be non-empty array');
  }
  if (!contract.defaultCategory || !contract.categories.includes(contract.defaultCategory)) {
    errors.push('defaultCategory must be one of categories');
  }

  if (!Array.isArray(contract.sysexManufacturerId) || contract.sysexManufacturerId.length === 0) {
    errors.push('sysexManufacturerId must be non-empty array');
  }
  if (!Number.isInteger(contract.formatVersion) || contract.formatVersion < 1) {
    errors.push('formatVersion must be positive integer');
  }

  // Test round-trip addressing
  for (let i = 0; i < Math.min(10, contract.bankCapacity); i++) {
    const addr = contract.getProgramAddress(i);
    const parsed = contract.parseProgramAddress(addr);
    if (parsed !== i) {
      errors.push(`Address round-trip failed for index ${i}: ${addr} -> ${parsed}`);
    }
  }

  return { valid: errors.length === 0, errors };
}