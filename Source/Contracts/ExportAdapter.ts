/**
 * ABD Bank Manager — ExportAdapter Interface
 * Serializes internal patches to external formats (SysEx, JSON, CSV, .abdbank)
 */

export interface ExportOptions {
  includeRawData: boolean;
  includeParameters: boolean;
  midiChannel: number;
  deviceId: number;
  format: 'single' | 'bank';
}

export interface ExportAdapter {
  adapterId: string;
  displayName: string;
  fileExtension: string;
  targetModelIds: string[];

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array;
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

export abstract class BaseExportAdapter implements ExportAdapter {
  abstract adapterId: string;
  abstract displayName: string;
  abstract fileExtension: string;
  abstract targetModelIds: string[];

  abstract serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array;

  protected getDefaultOptions(): ExportOptions {
    return {
      includeRawData: true,
      includeParameters: true,
      midiChannel: 0,
      deviceId: 0,
      format: 'bank'
    };
  }
}