
import { createStandaloneRegistry } from 'file:///D:/desarrollos/ABDSynths/ABDBankManager/Source/Contracts/ContractRegistry.ts';
import { allModelContracts } from 'file:///D:/desarrollos/ABDSynths/ABDBankManager/Source/Contracts/Models/index.ts';

const registry = createStandaloneRegistry();

// Serializar solo los datos consultables que la WebUI necesita
const data = {
  // Modo del registry ('standalone' | 'plugin')
  mode: registry.mode,

  // Issues acumulados durante el registro (warnings/errores no fatales)
  issues: registry.getIssues(),

  // HardwareLinks por modelo
  hardwareLinks: {},
  // ImportAdapters por modelo
  importAdapters: {},
  // ExportAdapters por modelo
  exportAdapters: {},

  // Lista de modelIds registrados (orden de registro)
  registeredModelIds: registry.getModels().map(c => c.modelId),

  // Metadatos para UI: displayName, manufacturer, etc. por modelId
  modelMetadata: {}
};

// Poblar hardwareLinks, importAdapters, exportAdapters
for (const modelId of data.registeredModelIds) {
  data.hardwareLinks[modelId] = registry.getHardwareLinks(modelId);
  data.importAdapters[modelId] = registry.getImportAdapters(modelId).map(a => ({
    adapterId: a.adapterId,
    targetModelIds: a.targetModelIds,
    displayName: a.displayName
  }));
  data.exportAdapters[modelId] = registry.getExportAdapters(modelId).map(a => ({
    adapterId: a.adapterId,
    targetModelIds: a.targetModelIds,
    displayName: a.displayName
  }));

  const model = registry.getModel(modelId);
  if (model) {
    data.modelMetadata[modelId] = {
      displayName: model.displayName,
      manufacturer: model.manufacturer,
      bankCapacity: model.bankCapacity,
      programsPerBank: model.programsPerBank,
      patchDataSize: model.patchDataSize,
      patchNameMaxLength: model.patchNameMaxLength,
      categories: model.categories,
      defaultCategory: model.defaultCategory,
      sysexManufacturerId: model.sysexManufacturerId,
      formatVersion: model.formatVersion,
      compatibleModels: model.compatibleModels || []
    };
  }
}

// Output como JSON que se envolverá en un módulo ES
console.log(JSON.stringify(data, null, 2));
