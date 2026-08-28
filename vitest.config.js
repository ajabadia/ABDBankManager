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
    include: ['**/*.test.{js,ts}'],
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
      '@scripts': path.resolve(__dirname, 'Scripts'),
      '@contracts': path.resolve(__dirname, 'Source/Contracts'),
      '@adapters': path.resolve(__dirname, 'Source/Adapters'),
      '@store': path.resolve(__dirname, 'WebUI/src/store'),
      '@ui': path.resolve(__dirname, 'WebUI/src/ui')
    }
  }
});