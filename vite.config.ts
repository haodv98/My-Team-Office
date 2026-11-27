import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'src/web/index.html'),
        list: resolve(import.meta.dirname, 'src/web/list.html'),
      },
    },
  },
  server: { proxy: { '/api': 'http://localhost:4800' } },
});
