#!/usr/bin/env node
/**
 * ABD Bank Manager — ContractRegistry Data Build (WebUI)
 *
 * Genera `contractRegistry.gen.js` desde `modelContracts.gen.js` (ya existente).
 * El ContractRegistry standalone solo registra los 15 modelos, así que los
 * datos son determinísticos y derivables del modelContracts gen.
 *
 * Uso: node Scripts/build_contractRegistry_web.js   (parte de `npm run generate`)
 *
 * Entrada:  WebUI/src/contracts/gen/modelContracts.gen.js
 * Salida:   WebUI/src/contracts/gen/contractRegistry.gen.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MODEL_CONTRACTS_GEN = path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen', 'modelContracts.gen.js');
const OUT_DIR = path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen');
const OUT_FILE = path.join(OUT_DIR, 'contractRegistry.gen.js');

async function main() {
  if (!fs.existsSync(MODEL_CONTRACTS_GEN)) {
    throw new Error(`modelContracts.gen.js no encontrado en ${MODEL_CONTRACTS_GEN}. Ejecuta 'npm run generate' primero.`);
  }

  // Cargar modelContracts.gen.js usando file:// URL
  const modelContractsUrl = 'file://' + MODEL_CONTRACTS_GEN.replace(/\\/g, '/');
  const modelContractsModule = await import(modelContractsUrl);
  const { allModelContracts, modelContractMap, getHardwareIds, getMidiConfig } = modelContractsModule;

  // Simular createStandaloneRegistry(): registrar todos los modelos
  // Como modelContractMap ya tiene todos los modelos, los datos son equivalentes
  const modelIds = allModelContracts.map(c => c.modelId);

  const data = {
    // Modo: 'standalone' porque hay >1 modelo
    mode: 'standalone',

    // Issues: en un registry limpio sin adapters/links, no hay warnings
    issues: [],

    // HardwareLinks: no implementados aún (P1.4 pendiente)
    hardwareLinks: {},

    // ImportAdapters: no implementados aún
    importAdapters: {},

    // ExportAdapters: no implementados aún
    exportAdapters: {},

    // Lista de modelIds registrados (orden de allModelContracts)
    registeredModelIds: modelIds,

    // Metadatos para UI derivados de los ModelContracts
    modelMetadata: {}
  };

  for (const modelId of modelIds) {
    const model = modelContractMap.get(modelId);
    if (!model) continue;

    // HardwareLinks vacíos (no implementados)
    data.hardwareLinks[modelId] = [];

    // Import/Export adapters vacíos (no implementados)
    data.importAdapters[modelId] = [];
    data.exportAdapters[modelId] = [];

    // Metadatos para UI
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

  // Generar artefacto
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const banner = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_contractRegistry_web.js
// Fuente derivada: WebUI/src/contracts/gen/modelContracts.gen.js
`;
  const artifactContent = banner + `export const contractRegistryData = ${JSON.stringify(data, null, 2)};\n`;

  fs.writeFileSync(OUT_FILE, artifactContent);
  console.log(`✅ Generated: ${path.relative(ROOT, OUT_FILE)} (${(artifactContent.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('❌ build_contractRegistry_web failed:', e);
  process.exit(1);
});