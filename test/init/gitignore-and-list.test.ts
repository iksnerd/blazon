import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runInit, type InitReport } from '../../src/cli/commands/init.js';
import { starterFiles } from '../../src/core/starter.js';
import { DEFAULT_CONFIG } from '../../src/core/config/index.js';
import { tempDir } from '../support/project';

// `blazon init` keeps a new brand's build output out of git (manual chapter 15), and what it prints names every top-level
// folder and file it wrote. npm drops a file named `.gitignore` from a package, so the line is written from code, never shipped in the starter.

// eslint-disable-next-line no-control-regex
const plain = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

async function init(dir: string): Promise<{ lines: string[]; report: InitReport }> {
  const lines: string[] = [];
  let report: InitReport | undefined;
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(plain(args.join(' '))));
  try {
    expect(await runInit(dir, { tty: false, yes: true, report: (r) => (report = r) })).toBe(0);
  } finally {
    log.mockRestore();
  }
  return { lines, report: report! };
}

afterEach(() => vi.restoreAllMocks());

/** The ignore lines the defaults ask for: both output folders sit under one top folder, so it is one line. */
const top = (p: string): string => p.replace(/^\.\//, '').split('/')[0]!;

describe('the .gitignore blazon init writes', () => {
  it('is not part of the starter, since npm would drop it from the package', () => {
    expect(starterFiles()).not.toContain('.gitignore');
  });

  it('is written from the config defaults when the folder has none', async () => {
    expect(top(DEFAULT_CONFIG.outDir)).toBe(top(DEFAULT_CONFIG.tokensOutDir));
    const dir = tempDir('blazon-gitignore-');
    await init(dir);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(`${top(DEFAULT_CONFIG.outDir)}/\n`);
  });

  it('is appended to an existing file once, without touching or reordering what is there', async () => {
    const dir = tempDir('blazon-gitignore-');
    const before = '# deps\nnode_modules\n.next\n*.log';
    fs.writeFileSync(path.join(dir, '.gitignore'), before);
    await init(dir);
    const after = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    expect(after).toBe(`${before}\ndist/\n`);
    // A second run in the same folder adds nothing
    await init(dir);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(after);
  });

  it('is left alone when the line is already there in any common spelling', async () => {
    for (const spelling of ['dist', '/dist', 'dist/', '/dist/\r']) {
      const dir = tempDir('blazon-gitignore-');
      const text = `build\n${spelling}\n`;
      fs.writeFileSync(path.join(dir, '.gitignore'), text);
      await init(dir);
      expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(text);
    }
  });

  it('is reported as written, or as updated when the file was there', async () => {
    const fresh = await init(tempDir('blazon-gitignore-'));
    expect(fresh.report.created).toContain('.gitignore');
    const dir = tempDir('blazon-gitignore-');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    const appended = await init(dir);
    expect(appended.report.created).not.toContain('.gitignore');
    expect(appended.report.updated).toEqual(['.gitignore']);
  });
});

describe('the list blazon init prints', () => {
  it('names every top-level folder and file in the folder it wrote, and nothing else', async () => {
    const dir = tempDir('blazon-list-');
    const { lines } = await init(dir);
    const named = lines
      .map((line) => /^\s*✔ Created (\S+)/.exec(line)?.[1]?.replace(/\/$/, ''))
      .filter((name): name is string => name !== undefined)
      .sort();
    const onDisk = fs.readdirSync(dir).sort();
    expect(named).toEqual(onDisk);
    // The cases the report named
    for (const name of ['fonts', 'AGENTS.md', 'CLAUDE.md', '.gitignore']) expect(named).toContain(name);
  });

  it('lists the same top level in the --json report', async () => {
    const dir = tempDir('blazon-list-');
    const { report } = await init(dir);
    const topLevel = [...new Set(report.created.map((file) => file.split('/')[0]!))].sort();
    expect(topLevel).toEqual(fs.readdirSync(dir).sort());
  });

  it('says "Updated" and not "Created" for a .gitignore it only added to', async () => {
    const dir = tempDir('blazon-list-');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    const { lines } = await init(dir);
    expect(lines.some((line) => /Updated \.gitignore/.test(line))).toBe(true);
    expect(lines.some((line) => /Created \.gitignore/.test(line))).toBe(false);
  });
});
