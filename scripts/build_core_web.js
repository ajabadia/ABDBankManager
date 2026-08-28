#!/usr/bin/env node
/**
 * ABD Bank Manager — Core Operations Library Build (WebUI)
 *
 * Transpila/bundla la librería pura de operaciones (`packages/core/src/operations/library.js`)
 * a un artefacto JS que el navegador puede cargar directamente. La WebUI se sirve estática
 * (importmap + módulos ES, sin bundler en runtime).
 *
 * Uso: node Scripts/build_core_web.js   (parte de `npm run generate`)
 *
 * Entrada:  packages/core/src/operations/library.js
 * Salida:   WebUI/src/contracts/gen/library.gen.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ENTRY = path.join(ROOT, 'packages', 'core', 'src', 'operations', 'library.js');
const OUT_DIR = path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen');
const OUT_FILE = path.join(OUT_DIR, 'library.gen.js');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: OUT_FILE,
    logLevel: 'warning',
    sourcemap: false
  });

  if (result.errors.length > 0) {
    console.error('❌ Bundle failed:', result.errors);
    process.exit(1);
  }

  const banner = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_core_web.js
// Fuente canónica: packages/core/src/operations/library.js
`;
  const content = fs.readFileSync(OUT_FILE, 'utf-8');
  fs.writeFileSync(OUT_FILE, banner + content);

  console.log(`✅ Generated: ${path.relative(ROOT, OUT_FILE)} (${(content.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('❌ build_core_web failed:', e);
  process.exit(1);
});