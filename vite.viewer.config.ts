import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const rootDir = import.meta.dirname;

// Builds the brand book viewer once, at publish time. Brand books copy dist/ui and inject their data.
export default defineConfig({
  root: path.resolve(rootDir, 'src/viewer'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src/viewer') },
  },
  build: {
    outDir: path.resolve(rootDir, 'dist/ui'),
    emptyOutDir: true,
  },
});
