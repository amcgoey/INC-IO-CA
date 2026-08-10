import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      'node:test': path.resolve(__dirname, 'test/setup.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/Main.ts'),
      name: 'App',
      formats: ['iife'],
      fileName: () => 'Code.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  plugins: [
    {
      name: 'copy-appsscript-json',
      closeBundle() {
        if (fs.existsSync('src/appsscript.json')) {
          fs.copyFileSync('src/appsscript.json', 'dist/appsscript.json');
        }
      },
    },
  ],
});
