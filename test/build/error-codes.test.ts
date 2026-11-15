import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { ERROR_CODES } from '../../src/cli/errors.js';

// The codes in `error.code` of a `--json` error are a closed list, written down once in src/cli/errors.ts and in the manual.

describe('the error codes of --json', () => {
  const manual = fs.readFileSync(path.join(REPO, 'docs/manual/03-checks.md'), 'utf-8');

  it('are kebab-case and listed once', () => {
    for (const code of ERROR_CODES) expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it.each([...ERROR_CODES])('%s is in the manual', (code) => {
    expect(manual).toContain(`\`${code}\``);
  });
});
