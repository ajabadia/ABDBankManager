export function createBank(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || 'New Bank',
    modelId: overrides.modelId || '',
    isFactory: overrides.isFactory || false,
    isLocked: overrides.isLocked || false,
    patches: overrides.patches || [],
    source: overrides.source || null,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
  };
}
