export function detectAdapter(data, filename, adapters) {
  for (const adapter of adapters) {
    try {
      if (adapter.canParse(data, filename)) {
        if (adapter.verifyChecksum && !adapter.verifyChecksum(data)) {
          console.warn(`Adapter ${adapter.adapterId}: checksum failed for ${filename}`);
          continue;
        }
        return adapter;
      }
    } catch (e) {
      console.warn(`Adapter ${adapter.adapterId} threw during canParse:`, e);
    }
  }
  return null;
}
