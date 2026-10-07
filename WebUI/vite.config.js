import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

// El mundo embebido tiene DOS directorios estaticos: CMake globs "WebUI/vendor/*"
// y "WebUI/public/*" y el provider los resuelve aplanados por basename. vite solo
// admite UN publicDir, asi que aqui publicDir queda desactivado y un plugin proprio
// los sirve (dev) y los copia (build) en la raiz con la misma semantica en ambos
// casos: public/ pisa a vendor/ si alguna ruta choca. Asi embebido, vite dev y dist
// ven exactamente las mismas rutas en la raiz.
const WEBUI_ROOT = __dirname;
const DEV_SERVE_ORDER = ['public', 'vendor']; // precedencia en dev: public gana
const BUILD_COPY_ORDER = ['vendor', 'public']; // copia en build: public se copia al final

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};

// Resuelve una URL contra los dos directorios publicos, en orden de precedencia.
// Devuelve la ruta absoluta o null. No escapa de WEBUI_ROOT ni indexa directorios.
function resolveStaticFile(urlPath) {
  let rel = urlPath.split('?')[0].split('#')[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  rel = rel.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rel || rel.split(/[/\\]/).includes('..')) return null;

  for (const dir of DEV_SERVE_ORDER) {
    const base = path.resolve(WEBUI_ROOT, dir);
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) continue;
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isFile()) return abs;
    if (st.isDirectory()) {
      const index = path.join(abs, 'index.html');
      if (fs.existsSync(index)) return index;
    }
  }
  return null;
}

function dualPublicDirs() {
  return {
    name: 'dual-public-dirs',
    // Dev: middleware propio ANTES de los internals de vite, para que las dos
    // carpetas se sirvan en la raiz igual que hace publicDir (y igual que el
    // plugin embebido). Lo que no exista en ellas cae al pipeline normal.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const file = resolveStaticFile(req.url || '');
        if (!file) return next();
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
        if (req.method === 'HEAD') {
          res.statusCode = 200;
          res.end();
          return;
        }
        const stream = fs.createReadStream(file);
        stream.on('error', () => {
          if (res.headersSent) res.destroy();
          else next();
        });
        stream.pipe(res);
      });
    },
    // Build: tras escribir el bundle, copia las dos carpetas a la raiz de dist
    // (vendor primero y public encima, misma precedencia que en dev).
    closeBundle() {
      const outDir = path.resolve(WEBUI_ROOT, '../dist/webui');
      if (!fs.existsSync(outDir)) return;
      for (const dir of BUILD_COPY_ORDER) {
        const src = path.resolve(WEBUI_ROOT, dir);
        if (!fs.existsSync(src)) continue;
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          // dereference: vendor/ contiene junctions NTFS a ABDSharedAssets; sin el,
          // Windows intenta recrear el link y muere con EPERM.
          fs.cpSync(path.join(src, entry.name), path.join(outDir, entry.name), { recursive: true, dereference: true });
        }
      }
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname),
  // vite solo admite un publicDir; los dos los maneja dualPublicDirs() abajo.
  publicDir: false,
  plugins: [dualPublicDirs()],
  server: {
    port: 1420,
    strictPort: true
  },
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
