export function createBank(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || 'New Bank',
    modelId: overrides.modelId || '',
    // Asociación multi-hardware: canónico + compatibles (derivada en import);
    // default neutro: solo el modelo canónico.
    hardwareIds: overrides.hardwareIds || (overrides.modelId ? [overrides.modelId] : []),
    isFactory: overrides.isFactory || false,
    isLocked: overrides.isLocked || false,
    patches: overrides.patches || [],
    source: overrides.source || null,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
  };
}
