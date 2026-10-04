import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.{js,ts}', 'WebUI/tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.gen.*', '**/coverage/**']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'WebUI/src'),
      '@webui': path.resolve(__dirname, 'WebUI/src'),
      '@core': path.resolve(__dirname, 'packages/core/src'),
      // En minuscula, y con mayusculas el rojo sale solo en Linux. El arbol tiene
      // las dos carpetas --Scripts/ y scripts/-- porque Windows no distingue, asi
      // que en local `Scripts` encuentra `scripts/registry_core.js` sin problema.
      // En git solo esta la de minuscula, y en un runner Ubuntu un alias a
      // `Scripts` no resuelve y el test muere con "Cannot find package
      // '@scripts/registry_core'" antes de mirar una sola asercion.
      '@scripts': path.resolve(__dirname, 'scripts'),
      '@contracts': path.resolve(__dirname, 'Source/Contracts'),
      '@adapters': path.resolve(__dirname, 'Source/Adapters'),
      '@store': path.resolve(__dirname, 'WebUI/src/store'),
      '@ui': path.resolve(__dirname, 'WebUI/src/ui')
    }
  }
});