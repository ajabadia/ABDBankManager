#!/usr/bin/env node
/**
 * ABD Bank Manager — Core Operations Library Build (WebUI)
 *
 * Transpila/bundla la librería pura de `packages/core` (SSOT) a artefactos JS
 * que el navegador puede cargar directamente. La WebUI se sirve estática
 * (importmap + módulos ES, sin bundler en runtime).
 *
 * Uso: node Scripts/build_core_web.js   (parte de `npm run generate`)
 *
 * Entradas:
 *   packages/core/src/operations/library.js  → WebUI/src/contracts/gen/library.gen.js (artefacto histórico, no consumido en runtime)
 *   packages/core/src/index.js               → WebUI/src/contracts/gen/core.gen.js   (SSOT completo: models + operations + search + fingerprint)
 *
 * Shims (re-exportadores, eliminan los forks históricos):
 *   WebUI/src/core/libraryOperations.js  → re-exporta de ../contracts/gen/core.gen.js
 *   WebUI/src/core/fingerprint.js        → re-exporta de ../contracts/gen/core.gen.js
 *   WebUI/src/core/searchPatches.js      → re-exporta de ../contracts/gen/core.gen.js
 *
 * REGLA: no editar los shims ni los .gen.js — editar packages/core y regenerar.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const GEN_DIR = path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen');

const BUNDLES = [
  {
    entry: path.join(ROOT, 'packages', 'core', 'src', 'operations', 'library.js'),
    out: path.join(GEN_DIR, 'library.gen.js'),
    sourceLabel: 'packages/core/src/operations/library.js'
  },
  {
    entry: path.join(ROOT, 'packages', 'core', 'src', 'index.js'),
    out: path.join(GEN_DIR, 'core.gen.js'),
    sourceLabel: 'packages/core/src/index.js'
  }
];

// Shims que sustituyen a los antiguos forks hand-copiados en WebUI/src/core.
// Importan del artefacto generado (mismo paquete core, fuente única).
const SHIM_DIR = path.join(ROOT, 'WebUI', 'src', 'core');
const SHIMS = [
  {
    file: path.join(SHIM_DIR, 'libraryOperations.js'),
    header: `/**
 * GENERATED SHIM — DO NOT EDIT
 * Sustituye al antiguo fork hand-copiado. Fuente única: packages/core/src/operations/library.js
 * (empaquetada en ../contracts/gen/core.gen.js por Scripts/build_core_web.js).
 */
export * from '../contracts/gen/core.gen.js';
`,
    requires: []
  },
  {
    file: path.join(SHIM_DIR, 'fingerprint.js'),
    header: `/**
 * GENERATED SHIM — DO NOT EDIT
 * Sustituye al antiguo fork hand-copiado. Fuente única: packages/core/src/operations/fingerprint.js
 * (empaquetada en ../contracts/gen/core.gen.js por Scripts/build_core_web.js).
 */
export { calculateFingerprint, checkDuplicate, FINGERPRINT_VERSION } from '../contracts/gen/core.gen.js';
`,
    requires: [['calculateFingerprint', 'checkDuplicate', 'FINGERPRINT_VERSION']]
  },
  {
    file: path.join(SHIM_DIR, 'searchPatches.js'),
    header: `/**
 * GENERATED SHIM — DO NOT EDIT
 * Sustituye al antiguo fork hand-copiado. Fuente única: packages/core/src/search/searchPatches.js
 * (empaquetada en ../contracts/gen/core.gen.js por Scripts/build_core_web.js).
 */
export { searchPatches, getFilteredPatches, createSearcher } from '../contracts/gen/core.gen.js';
`,
    requires: [['searchPatches', 'getFilteredPatches', 'createSearcher']]
  }
];

async function main() {
  fs.mkdirSync(GEN_DIR, { recursive: true });

  for (const { entry, out, sourceLabel } of BUNDLES) {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      outfile: out,
      logLevel: 'warning',
      sourcemap: false
    });

    if (result.errors.length > 0) {
      console.error('❌ Bundle failed:', result.errors);
      process.exit(1);
    }

    const banner = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_core_web.js
// Fuente canónica: ${sourceLabel}
`;
    const content = fs.readFileSync(out, 'utf-8');
    fs.writeFileSync(out, banner + content);

    console.log(`✅ Generated: ${path.relative(ROOT, out)} (${(content.length / 1024).toFixed(1)} KB)`);
  }

  // Verify that every symbol re-exported by the shims exists in the bundle.
  const coreBundle = fs.readFileSync(path.join(GEN_DIR, 'core.gen.js'), 'utf-8');
  let shimsOk = true;
  for (const { file, header, requires } of SHIMS) {
    for (const symbols of requires) {
      for (const sym of symbols) {
        const exported = new RegExp(`export\\s*{[^}]*\\b${sym}\\b`).test(coreBundle)
          || new RegExp(`as ${sym}\\b`).test(coreBundle)
          || new RegExp(`function ${sym}\\b|const ${sym}\\b`).test(coreBundle);
        if (!exported) {
          console.error(`❌ Shim ${path.basename(file)} re-exports '${sym}' but packages/core does not export it.`);
          shimsOk = false;
        }
      }
    }
    fs.writeFileSync(file, header, 'utf-8');
    console.log(`✅ Shim: ${path.relative(ROOT, file)}`);
  }

  if (!shimsOk) process.exit(1);
}

main().catch((e) => {
  console.error('❌ build_core_web failed:', e);
  process.exit(1);
});
