/**
 * ABD Bank Manager — Contracts (WebUI)
 *
 * Re-export de artefactos generados desde la fuente canónica TypeScript.
 * La WebUI se sirve estática: el navegador no ejecuta TS, por eso los contratos
 * y el registry se transpilan con `npm run generate`.
 *
 * No mantener datos duplicados aquí — editar en Source/Contracts/ y regenerar.
 */

export {
  allModelContracts as MODEL_CONTRACTS,
  modelContractMap,
  getModelContract,
  getCompatibleModels,
  getHardwareIds,
  getContractsForManufacturer,
  getMidiConfig
} from './gen/modelContracts.gen.js';

export { contractRegistryData } from './gen/contractRegistry.gen.js';
