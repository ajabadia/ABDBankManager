/**
 * ABD Bank Manager — Model Contracts (WebUI)
 *
 * Re-export del bundle JS generado desde la fuente canónica TypeScript
 * (Source/Contracts/Models/*.ts → WebUI/src/contracts/gen/modelContracts.gen.js).
 * La WebUI se sirve estática: el navegador no ejecuta TS, por eso los contratos
 * se transpilan con `npm run generate` (Scripts/build_contracts_web.js).
 *
 * No mantener datos duplicados aquí — editar en Source/Contracts/Models/ y
 * regenerar. ContractRegistry NO se expone desde la web: depende de Zod y es
 * para el core/standalone (ver packages/contracts/tests/ContractRegistry.test.js).
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
