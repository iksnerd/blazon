import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Blazon's own rule: interactive.primary (orange) is a fill or an edge, never text.
// `text-primary-foreground` is fine: it is the text on an orange fill.
const ORANGE_TEXT = /(?<![\w-])(?:[\w[\]&>:.=-]+:)*text-primary(?![\w-])/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('viewer text colour', () => {
  it('never paints text in the primary (orange) colour', () => {
    const hits = files('src/viewer').flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (ORANGE_TEXT.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
