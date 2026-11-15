// Prettier, for the code. The widths and quotes here are the ones the code already uses, so a file formatted by it changes
// as little as can be. ESLint (eslint.config.js) looks for mistakes; it has no opinion on layout.
// `npm run format` rewrites files; `npm run format:check` lists the ones that differ.
/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  printWidth: 180,
  trailingComma: 'all',
  arrowParens: 'always',
};
