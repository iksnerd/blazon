// ESLint, flat config. It looks for mistakes, not for style: layout is Prettier's (prettier.config.js).
// Run `npm run lint`; `npm run lint:fix` applies the fixes ESLint can make safely.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Built output, installed packages, and files that are data or someone else's: docs/personal/ is a maintainer's local
  // reference material, default-assets/ the pictures the starter's art is made from, golden/ the recorded outputs the tests compare.
  globalIgnores(['**/dist/**', '**/node_modules/**', 'docs/personal/**', 'default-assets/**', 'test/**/golden/**', '.idea/**', '.claude/**', '.blazon/**']),

  js.configs.recommended,
  tseslint.configs.recommended,

  { languageOptions: { globals: globals.node } },

  // Rules that need the types, for src/ only: a promise nobody awaits is how this code would fail without a word. They add about
  // five seconds to a run.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/no-misused-promises': 'error', '@typescript-eslint/await-thenable': 'error' },
  },

  // The brand-book viewer runs in the browser, in React
  {
    files: ['src/viewer/**/*.{ts,tsx}', 'test/viewer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    extends: [reactHooks.configs.flat.recommended],
  },

  // src/viewer/components/ui/ and hooks/use-mobile.ts are shadcn's code, added with `npx shadcn add` and replaced the same way,
  // so they are not held to the React Compiler rules of the hooks plugin, which their own effects do not meet
  {
    files: ['src/viewer/components/ui/**', 'src/viewer/hooks/use-mobile.ts'],
    rules: { 'react-hooks/set-state-in-effect': 'off', 'react-hooks/exhaustive-deps': 'off' },
  },

  // The tests check what the code does with whatever it is given, and some build that input loosely
  {
    files: ['test/**', 'mcp/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // A rule is off only where the code means it. Each of these says why.
  {
    rules: {
      // `_name` marks a parameter or a destructured value that is there on purpose to be left out
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // A caught error that is not used is fine; an empty `catch {}` is how this code says "this failing is expected"
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]);
