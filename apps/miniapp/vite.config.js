import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const COMPRESSIBLE = /\.(js|css|html|svg|json)$/;

/**
 * Сжатые копии файлов сборки (.br и .gz) рядом с исходными. Сервер отдаёт их клиентам,
 * которые принимают сжатие: скрипт мини-приложения весит в 3–4 раза меньше. Без новых зависимостей.
 */
function precompress() {
  let outDir;
  return {
    name: 'posle9-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const entry of fs.readdirSync(outDir, { recursive: true })) {
        const file = path.join(outDir, entry);
        if (!COMPRESSIBLE.test(file) || !fs.statSync(file).isFile()) continue;
        const source = fs.readFileSync(file);
        if (source.length < 1024) continue;
        fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(source, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY },
        }));
        fs.writeFileSync(`${file}.gz`, zlib.gzipSync(source, { level: 9 }));
      }
    },
  };
}

// В режиме разработки запросы /api проксируются на локальный сервер (npm run dev:server).
export default defineConfig({
  plugins: [react(), precompress()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
