#!/usr/bin/env node
/**
 * ABD Bank Manager — WebUI Contracts Build
 *
 * Transpila los contratos canónicos TypeScript (Source/Contracts) a un bundle
 * JS que el navegador puede cargar directamente. La WebUI se sirve estática
 * (importmap + módulos ES, sin bundler en runtime): el navegador NO ejecuta
 * TypeScript, así que este paso genera `modelContracts.gen.js` (artefacto,
 * como registry.gen.js) desde el fuente canónico.
 *
 * Uso: node Scripts/build_contracts_web.js   (parte de `npm run generate`)
 *
 * Entrada:  Source/Contracts/Models/index.ts (los 15 ModelContracts + midi config)
 * Salida:   WebUI/src/contracts/gen/modelContracts.gen.js
 *
 * Nota: solo se bundlean los modelos y helpers que la WebUI usa en runtime.
 * ContractRegistry/validationSchemas (que dependen de Zod) quedan fuera —
 * son para el core/standalone, no para el navegador.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ENTRY = path.join(ROOT, 'Source', 'Contracts', 'Models', 'index.ts');
const OUT_DIR = path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen');
const OUT_FILE = path.join(OUT_DIR, 'modelContracts.gen.js');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: OUT_FILE,
    // Los contratos se validan a sí mismos al cargar (console.error si fallan);
    // en el bundle no hace falta validar en runtime ni ejecutar ese efecto.
    logLevel: 'warning',
    sourcemap: false
  });

  if (result.errors.length > 0) {
    console.error('❌ Bundle failed:', result.errors);
    process.exit(1);
  }

  // Cabecera de artefacto generado
  const banner = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_contracts_web.js
// Fuente canónica: Source/Contracts/Models/*.ts
`;
  const content = fs.readFileSync(OUT_FILE, 'utf-8');
  fs.writeFileSync(OUT_FILE, banner + content);

  console.log(`✅ Generated: ${path.relative(ROOT, OUT_FILE)} (${(content.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('❌ build_contracts_web failed:', e);
  process.exit(1);
});
