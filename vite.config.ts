import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = import.meta.dirname;

// The commit this build is made from, compiled into the CLI so `blazon` can tell a book's pin (blazon.lock) from the blazon it is.
// null when the checkout cannot say (a copy with no .git): the build then reports itself as unknown rather than guess.
function buildStamp(): { commit: string; dirty: boolean } | null {
  const run = (...args: string[]) => execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const commit = run('rev-parse', 'HEAD').trim();
    return /^[0-9a-f]{40}$/.test(commit) ? { commit, dirty: run('status', '--porcelain').trim() !== '' } : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  define: { __BLAZON_BUILD__: JSON.stringify(buildStamp()) },
  build: {
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: path.resolve(rootDir, 'src/index.ts'),
        'cli/index': path.resolve(rootDir, 'src/cli/index.ts'),
        'config/index': path.resolve(rootDir, 'src/core/config/index.ts'),
        // The plugins blazon ships are not entries here: scripts/build-plugins.mjs builds each into its own folder under plugins/
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        /^node:.*/,
        'node:fs',
        'node:path',
        'node:url',
        'node:http',
        'node:https',
        'fs',
        'path',
        'url',
        'http',
        'https',
        'vite',
        'cac',
        'picocolors',
        '@clack/prompts',
        'marked',
        'gray-matter',
      ],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['src/viewer/**', 'src/shipped/**'],
      outDirs: ['dist'],
    }),
  ],
});
