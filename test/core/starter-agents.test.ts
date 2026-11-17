import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { starterFiles } from '../../src/core/starter.js';
import { OPERATIONS, toolOf, toolOperations } from '../../src/core/operations/index.js';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';

// The starter carries notes for a coding agent (examples/blazon/AGENTS.md). They are guidance, not brand text, so a fresh
// copy must not be told to replace them, and every command and flag they name must exist.

const read = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf-8');
const agents = read('examples/blazon/AGENTS.md');

describe('the starter AGENTS.md', () => {
  it('is in the starter, with a CLAUDE.md that points to it', () => {
    expect(starterFiles()).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md']));
    expect(read('examples/blazon/CLAUDE.md').trim()).toBe('@AGENTS.md');
  });

  it('is copied by init and is not a starter-file-unchanged finding', async () => {
    const root = await starterProject();
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    const data = await compileBlazonData(await loadConfig(root), root);
    const noted = data.findings.filter((f) => f.code === 'starter-file-unchanged').map((f) => f.path);
    expect(noted).not.toContain('AGENTS.md');
    expect(noted).not.toContain('CLAUDE.md');
    expect(noted.length).toBeGreaterThan(0); // the check still notes the brand's own starter files
  });

  it('names only commands and flags the CLI has, and finding codes the catalogue has', () => {
    const cli = read('src/cli/index.ts');
    const parts = cli.split(/\.command\(\s*'/);
    const optionsIn = (code: string) => [...code.matchAll(/\.option\('(?:-[a-zA-Z], )?(--[A-Za-z][A-Za-z-]*)/g)].map((m) => m[1]!);
    const global = new Set(['--help', ...optionsIn(parts[0]!)]);
    const byCommand = new Map<string, Set<string>>();
    for (const part of parts.slice(1)) {
      const name = /^([a-z]+)/.exec(part)![1]!;
      byCommand.set(name, new Set([...(byCommand.get(name) ?? []), ...optionsIn(part)]));
    }
    const wrong: string[] = [];
    for (const m of agents.matchAll(/`blazon ([a-z]+)([^`]*)`/g)) {
      const own = byCommand.get(m[1]!);
      if (!own) {
        wrong.push(`blazon ${m[1]}`);
        continue;
      }
      for (const flag of m[2]!.matchAll(/(?<![\w-])(--[A-Za-z][A-Za-z-]*)/g)) if (!own.has(flag[1]!) && !global.has(flag[1]!)) wrong.push(`blazon ${m[1]} ${flag[1]}`);
    }
    // a flag in prose, "Add `--no-plugins`", belongs to some command
    const all = new Set([...global, ...[...byCommand.values()].flatMap((s) => [...s])]);
    for (const m of agents.matchAll(/`(--[A-Za-z][A-Za-z-]*)/g)) if (!all.has(m[1]!)) wrong.push(m[1]!);
    const catalogue = read('src/core/checker/catalogue.ts');
    for (const m of agents.matchAll(/^- `([a-z][a-z-]+)`/gm)) if (!catalogue.includes(`'${m[1]}': {`)) wrong.push(`code ${m[1]}`);
    expect(wrong).toEqual([]);
  });

  it('stays short', () => {
    expect(agents.trimEnd().split('\n').length).toBeLessThan(60);
  });

  // `docs/` is not in the package and blazon has no website yet, so the starter names the manual's folder once and chapters by title.
  it('names the manual folder once and no web address', () => {
    expect(agents.split('docs/manual/').length - 1).toBe(2);
    expect(agents).not.toMatch(/https?:\/\//);
    const chapters = new Set(fs.readdirSync(path.join(REPO, 'docs/manual')).map((file) => /^\d+-(.+)\.md$/.exec(file)?.[1]));
    const named = [...agents.matchAll(/`([a-z0-9-]+)` chapter/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((slug) => !chapters.has(slug))).toEqual([]);
    expect(agents).toContain('`docs/manual/03-checks.md`');
  });

  it('the starter pages carry no web address for the manual, and name a chapter file that exists', () => {
    const docs = path.join(REPO, 'examples/blazon/docs');
    const pages = fs
      .readdirSync(docs)
      .map((file) => fs.readFileSync(path.join(docs, file), 'utf-8'))
      .join('\n');
    expect(pages).not.toMatch(/vercel\.app|blazon-website/);
    const named = [...pages.matchAll(/`docs\/manual\/([a-z0-9-]+\.md)`/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((file) => !fs.existsSync(path.join(REPO, 'docs/manual', file)))).toEqual([]);
  });

  it('names the MCP server, its check and exactly the tools it serves, and says it ships in the blazon package', () => {
    const section = /^## The MCP server\n([\s\S]*?)(?=^## )/m.exec(agents)?.[1] ?? '';
    expect(section).toContain('`blazon mcp --check`');
    expect(section).toContain('ships inside the blazon package');
    expect(section).not.toMatch(/not (yet )?published/);
    const listed = [...section.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!).sort();
    expect(listed).toEqual(
      toolOperations(OPERATIONS)
        .map((op) => toolOf(op).name)
        .sort(),
    );
  });

  it('tells an agent how to use blazon', () => {
    const section = /^## How an agent should use blazon\n([\s\S]*?)(?=^## )/m.exec(agents)?.[1] ?? '';
    expect(section).toContain('`blazon check --json');
    expect(section).toContain('`dist/`');
  });
});
