// A CSS font stack, read for the families it names: what the plugins that write a font into a file take from a brand's font roles.

const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** The families of a CSS font stack, unquoted, in order */
export function families(stack: string): string[] {
  return [...stack.matchAll(/\s*"([^"]+)"|\s*'([^']+)'|([^,]+)/g)].map((match) => (match[1] ?? match[2] ?? match[3]!).trim()).filter((name) => name !== '');
}

/** The first family of the stack that names a font: not a generic, not a var(). */
export const fontOf = (stack: string | undefined): string | undefined =>
  stack ? families(stack).find((name) => !GENERIC.has(name.toLowerCase()) && !/[()]/.test(name)) : undefined;
