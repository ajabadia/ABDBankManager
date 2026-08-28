export function createPatch(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || 'Init',
    category: overrides.category || 'Other',
    author: overrides.author || '',
    tags: overrides.tags || [],
    notes: overrides.notes || '',
    isFavorite: overrides.isFavorite || false,
    rating: overrides.rating || 0,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
    originModel: overrides.originModel || '',
    // Asociación multi-hardware: canónico + compatibles (derivada en import);
    // default neutro: solo el modelo de origen si se conoce.
    hardwareIds: overrides.hardwareIds || (overrides.originModel ? [overrides.originModel] : []),
    originAddress: overrides.originAddress || '',
    originBank: overrides.originBank || '',
    rawData: overrides.rawData || null,
    // RESERVADO para plugins/editores — el gestor no lo usa ni lo muestra
    parameters: overrides.parameters || null,
    fingerprint: overrides.fingerprint || '',
    previousVersionId: overrides.previousVersionId || undefined,
    versionNumber: overrides.versionNumber || 1,
    importSource: overrides.importSource || '',
    importDate: overrides.importDate || new Date().toISOString(),
  };
}
