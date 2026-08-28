/**
 * Adapters barrel — re-exports all concrete Import/Export/HardwareLink adapters
 */

export { RolandJunoImportAdapter, RolandJunoExportAdapter, RolandJunoHardwareLink } from './rolandJunoAdapter';
export { KorgMs2000ImportAdapter, KorgMs2000ExportAdapter, KorgMs2000HardwareLink } from './korgMs2000Adapter';
export { YamahaDx7ImportAdapter, YamahaDx7ExportAdapter, YamahaDx7HardwareLink } from './yamahaDx7Adapter';
export { CasioCzImportAdapter, CasioCzExportAdapter, CasioCzHardwareLink } from './casioCzAdapter';
export { BehringerDm12ImportAdapter, BehringerDm12ExportAdapter, BehringerDm12HardwareLink } from './behringerDm12Adapter';
export { BehringerDeepMind12HardwareLink } from './behringerDeepMindAdapter';

// ─── Registry ───

import { RolandJunoImportAdapter, RolandJunoExportAdapter } from './rolandJunoAdapter';
import { KorgMs2000ImportAdapter, KorgMs2000ExportAdapter } from './korgMs2000Adapter';
import { YamahaDx7ImportAdapter, YamahaDx7ExportAdapter } from './yamahaDx7Adapter';
import { CasioCzImportAdapter, CasioCzExportAdapter } from './casioCzAdapter';
import { BehringerDm12ImportAdapter, BehringerDm12ExportAdapter } from './behringerDm12Adapter';

import type { ImportAdapter } from '../ImportAdapter';
import type { ExportAdapter } from '../ExportAdapter';
import { BehringerDeepMind12HardwareLink } from './behringerDeepMindAdapter';

export const allHardwareLinks = [new BehringerDeepMind12HardwareLink()];

export const allImportAdapters: ImportAdapter[] = [
  new RolandJunoImportAdapter(),
  new KorgMs2000ImportAdapter(),
  new YamahaDx7ImportAdapter(),
  new CasioCzImportAdapter(),
  new BehringerDm12ImportAdapter(),
];

export const allExportAdapters: ExportAdapter[] = [
  new RolandJunoExportAdapter(),
  new KorgMs2000ExportAdapter(),
  new YamahaDx7ExportAdapter(),
  new CasioCzExportAdapter(),
  new BehringerDm12ExportAdapter(),
];

export function getImportAdapter(modelId: string): ImportAdapter | undefined {
  return allImportAdapters.find(a => a.targetModelIds.includes(modelId));
}

export function getExportAdapter(modelId: string): ExportAdapter | undefined {
  return allExportAdapters.find(a => a.targetModelIds.includes(modelId));
}
