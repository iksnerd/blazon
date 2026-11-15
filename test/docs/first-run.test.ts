import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { ROOT } from '../support/spec-helpers.js';
import { tempDir } from '../support/project.js';

// "The first run" in docs/manual/01-getting-started.md shows what `blazon init acme-brand` prints and how many notes
// `blazon check` gives. Both are computed here from a real run, so the sample cannot drift from the starter again.

const manual = fs.readFileSync(path.join(ROOT, 'docs/manual/01-getting-started.md'), 'utf-8');
const section = manual.slice(manual.indexOf('## The first run'), manual.indexOf('## The smallest project'));

afterEach(() => vi.restoreAllMocks());

describe('the first run in the manual', () => {
  it('shows the lines `blazon init` prints, and the note count `blazon check` gives', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
    // Run from the folder above the project, as the manual's sample does, so each path prints relative
    const parent = tempDir();
    const dir = path.join(parent, 'acme-brand');
    vi.spyOn(process, 'cwd').mockReturnValue(parent);
    expect(await runInit(dir, { yes: true })).toBe(0);
    // eslint-disable-next-line no-control-regex
    const printed = lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');

    const sample = section.match(/```text\n([\s\S]*?)```/)![1]!.trimEnd();
    expect(printed).toContain(sample);

    const { findings } = await runCheck(dir, false, { plugins: false });
    const notes = findings.filter((f) => f.severity === 'info');
    expect(notes.length).toBeGreaterThan(0);
    expect(section).toContain(
      `${findings.filter((f) => f.severity === 'error').length} errors, ${findings.filter((f) => f.severity === 'warning').length} warnings and ${notes.length} notes`,
    );
  });
});
