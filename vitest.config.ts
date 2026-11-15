import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src/viewer') },
  },
  test: {
    globals: true,
    // Hooks that remove a test's temporary folders (the 10,000-file tree in pin.test.ts) or start a dev server or git repo take
    // longer than the 10s default on a slow or loaded machine.
    hookTimeout: 60_000,
    // A test that starts several processes (blazon check four times, a plugin four times) takes about 1.4s alone and took 7s on a busy
    // machine, so it failed at the 5s default one run in several. 30s is twenty times the time alone, and a test that hangs still
    // fails, after 30s and not 5s. A test that needs longer says so itself, as the dev-server tests do with 60_000.
    testTimeout: 30_000,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'mcp/test/**/*.test.ts'],
    setupFiles: ['test/support/setup-dom.ts'],
    globalSetup: ['test/support/global-setup.ts'],
  },
});
