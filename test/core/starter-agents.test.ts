import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { starterFiles } from '../../src/core/starter.js';
import { OPERATIONS, toolOf, toolOperations } from '../../src/core/operations/index.js';
import { SITE_URL } from '../../src/core/site.js';
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

  it('is copied by init and is not a starter-file finding', async () => {
    const root = await starterProject();
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    const data = await compileBlazonData(await loadConfig(root), root);
    const noted = data.findings.filter((f) => f.code === 'starter-file').map((f) => f.path);
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

  // `docs/` is not in the package and the repository is not public, so a user's agent reads the manual on the website.
  it('links the manual on the website, named once, never the repository', () => {
    expect(agents).not.toMatch(/docs\/manual|blazon repository/);
    expect(agents.split(`${SITE_URL}/docs`).length - 1).toBe(1);
    expect([...agents.matchAll(/https?:\/\/[^\s)`>]+/g)].map((m) => m[0]).filter((url) => !url.startsWith(SITE_URL))).toEqual([]);
    expect(agents).toContain('Accept: text/markdown');
    const chapters = new Set(fs.readdirSync(path.join(REPO, 'docs/manual')).map((file) => /^\d+-(.+)\.md$/.exec(file)?.[1]));
    const named = [...agents.matchAll(/`\/docs\/([a-z0-9-]+)(?:#[a-z0-9-]+)?`/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((slug) => !chapters.has(slug))).toEqual([]);
  });

  it('the starter pages link the manual on the website too, at a chapter that exists', () => {
    const docs = path.join(REPO, 'examples/blazon/docs');
    const pages = fs
      .readdirSync(docs)
      .map((file) => fs.readFileSync(path.join(docs, file), 'utf-8'))
      .join('\n');
    expect(pages).not.toMatch(/docs\/manual|blazon repository/);
    const chapters = new Set(fs.readdirSync(path.join(REPO, 'docs/manual')).map((file) => /^\d+-(.+)\.md$/.exec(file)?.[1]));
    const linked = [...pages.matchAll(/https?:\/\/blazon-[^\s)]*\/docs\/([a-z0-9-]+)/g)].map((m) => ({ url: m[0], slug: m[1]! }));
    expect(linked.filter(({ url, slug }) => !url.startsWith(`${SITE_URL}/docs/`) || !chapters.has(slug))).toEqual([]);
  });

  it('names the MCP server, its check and exactly the tools it serves, and says it is not published', () => {
    const section = /^## The MCP server\n([\s\S]*?)(?=^## )/m.exec(agents)?.[1] ?? '';
    expect(section).toContain('`blazon mcp --check`');
    expect(section).toMatch(/not (yet )?published/);
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
