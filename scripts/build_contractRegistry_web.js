#!/usr/bin/env node
/**
 * ABD Bank Manager — ContractRegistry Data Build (WebUI)
 *
 * Genera `contractRegistry.gen.js` desde `modelContracts.gen.js` (ya existente).
 * El artefacto web contiene descriptores serializables de los adapters y links
 * registrados en Source/Contracts; no arrastra implementaciones TypeScript ni Zod.
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
  const { allModelContracts, modelContractMap } = modelContractsModule;

  const modelIds = allModelContracts.map(c => c.modelId);

  // Descriptores serializables equivalentes a los registros concretos del
  // ContractRegistry TypeScript. Las implementaciones siguen viviendo en
  // Source/Contracts/Adapters; la WebUI solo necesita estos metadatos.
  const importAdapters = [
    { adapterId: 'sysex-casio-cz', displayName: 'Casio CZ SysEx', targetModelIds: ['casio-cz101', 'casio-cz1000', 'casio-cz5000', 'casio-cz1'] },
    { adapterId: 'sysex-roland-juno', displayName: 'Roland Juno SysEx', targetModelIds: ['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'] },
    { adapterId: 'sysex-korg-ms2000', displayName: 'Korg MS2000 SysEx', targetModelIds: ['korg-ms2000', 'korg-microkorg', 'korg-prophecy'] },
    { adapterId: 'sysex-behringer-dm12', displayName: 'Behringer DeepMind 12 / Pro-800 SysEx', targetModelIds: ['behringer-deepmind12', 'behringer-pro800'] },
    { adapterId: 'sysex-yamaha-dx7', displayName: 'Yamaha DX7 SysEx', targetModelIds: ['yamaha-dx7', 'yamaha-dx7ii'] }
  ];
  const exportAdapters = [
    { adapterId: 'export-casio-cz', displayName: 'Casio CZ SysEx', targetModelIds: ['casio-cz101', 'casio-cz1000', 'casio-cz5000', 'casio-cz1'] },
    { adapterId: 'export-roland-juno', displayName: 'Roland Juno SysEx', targetModelIds: ['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'] },
    { adapterId: 'export-korg-ms2000', displayName: 'Korg MS2000 SysEx', targetModelIds: ['korg-ms2000', 'korg-microkorg', 'korg-prophecy'] },
    { adapterId: 'export-behringer-dm12', displayName: 'Behringer DeepMind 12 / Pro-800 SysEx', targetModelIds: ['behringer-deepmind12', 'behringer-pro800'] },
    { adapterId: 'export-yamaha-dx7', displayName: 'Yamaha DX7 SysEx', targetModelIds: ['yamaha-dx7', 'yamaha-dx7ii'] }
  ];
  const hardwareLinks = [
    { modelId: 'casio-cz101', displayName: 'Casio CZ Hardware Link' },
    { modelId: 'roland-juno106', displayName: 'Roland Juno Hardware Link' },
    { modelId: 'korg-ms2000', displayName: 'Korg MS2000 Hardware Link' },
    { modelId: 'behringer-deepmind12', displayName: 'Behringer DeepMind 12 Hardware Link' },
    { modelId: 'yamaha-dx7', displayName: 'Yamaha DX7 Hardware Link' }
  ];

  const data = {
    // Modo: 'standalone' porque hay >1 modelo
    mode: 'standalone',

    // Issues: el bundle concreto no contiene referencias huérfanas.
    issues: [],

    // Descriptores de HardwareLinks, agrupados por modelo.
    hardwareLinks: {},

    // Descriptores de ImportAdapters, agrupados por modelo.
    importAdapters: {},

    // Descriptores de ExportAdapters, agrupados por modelo.
    exportAdapters: {},

    // Lista de modelIds registrados (orden de allModelContracts)
    registeredModelIds: modelIds,

    // Metadatos para UI derivados de los ModelContracts
    modelMetadata: {}
  };

  for (const modelId of modelIds) {
    const model = modelContractMap.get(modelId);
    if (!model) continue;

    data.hardwareLinks[modelId] = hardwareLinks.filter(link => link.modelId === modelId);
    data.importAdapters[modelId] = importAdapters.filter(adapter => adapter.targetModelIds.includes(modelId));
    data.exportAdapters[modelId] = exportAdapters.filter(adapter => adapter.targetModelIds.includes(modelId));

    // Metadatos para UI
    // Nota: `modelId` se incluye aunque sea la clave del mapa; la UI necesita
    // el id dentro del objeto (p. ej. data-model-id del selector) y no debe
    // depender de tener la clave a mano.
    data.modelMetadata[modelId] = {
      modelId,
      displayName: model.displayName,
      thumbnail: model.thumbnail,
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