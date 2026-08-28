/**
 * ABD Bank Manager — ImportAdapter Interface
 * Parses external formats (SysEx, MIDI, Tape, JSON) into internal PatchData
 */

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

export interface ImportAdapter {
  // ─── Identity ───
  adapterId: string;
  displayName: string;
  supportedExtensions: string[];
  targetModelIds: string[];

  // ─── Detection ───
  canParse(data: Uint8Array, filename: string): boolean;

  // ─── Integrity ───
  verifyChecksum?(data: Uint8Array): boolean;

  // ─── Parsing ───
  parse(data: Uint8Array, filename: string): ImportResult;
}

export interface BaseImportAdapterOptions {
  strictMode?: boolean;
  allowPartial?: boolean;
}

/**
 * Base class for ImportAdapter implementations
 */
export abstract class BaseImportAdapter implements ImportAdapter {
  abstract adapterId: string;
  abstract displayName: string;
  abstract supportedExtensions: string[];
  abstract targetModelIds: string[];
  abstract parse(data: Uint8Array, filename: string): ImportResult;

  canParse(data: Uint8Array, filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return this.supportedExtensions.some(e => e.toLowerCase() === `.${ext}`);
  }

  verifyChecksum(data: Uint8Array): boolean {
    return true; // Override in subclasses
  }

  protected createResult(overrides: Partial<ImportResult>): ImportResult {
    return {
      success: true,
      modelId: '',
      bankName: 'Imported Bank',
      patches: [],
      warnings: [],
      ...overrides
    };
  }

  protected createPatchData(overrides: Partial<PatchData>): PatchData {
    return {
      name: 'Init Patch',
      category: 'Other',
      author: 'Unknown',
      tags: [],
      notes: '',
      originAddress: 'A.01',
      rawData: new Uint8Array(),
      parameters: {},
      isFavorite: false,
      creationDate: new Date().toISOString(),
      ...overrides
    };
  }
}