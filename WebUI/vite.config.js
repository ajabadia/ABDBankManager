import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: 'vendor',
  build: {
    outDir: path.resolve(__dirname, '../dist/webui'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@webui': path.resolve(__dirname, 'src')
    }
  }
});
