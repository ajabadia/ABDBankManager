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
    // Sistema de presets del banco: 'sysex' | 'native' | null (sin declarar).
    // Un synth de software puede exponer los dos a la vez (el SysEx de la familia
    // que emula y su sistema propio), y un preset de uno no es un preset del otro,
    // así que el banco dice de dónde salió. `null` = bancos anteriores a este campo
    // (siempre SysEx). Ver DOCS/BANK_MANAGER_TRANSPORT_MODEL.md §7.3.
    presetFormat: overrides.presetFormat || null,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
  };
}
