import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const rootDir = import.meta.dirname;

/** The Geist font is bundled into assets/ (OFL-1.1, which asks for the license to travel with the font): write the package's own LICENSE beside it. */
const geistLicense = {
  name: 'blazon-geist-license',
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): string }) {
    const pkg = createRequire(import.meta.url).resolve('@fontsource-variable/geist/package.json');
    this.emitFile({ type: 'asset', fileName: 'assets/geist-OFL.txt', source: fs.readFileSync(path.join(path.dirname(pkg), 'LICENSE'), 'utf-8') });
  },
};

// Builds the brand book viewer once, at publish time. Brand books copy dist/ui and inject their data.
export default defineConfig({
  root: path.resolve(rootDir, 'src/viewer'),
  base: './',
  plugins: [react(), tailwindcss(), geistLicense],
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src/viewer') },
  },
  build: {
    outDir: path.resolve(rootDir, 'dist/ui'),
    emptyOutDir: true,
  },
});
