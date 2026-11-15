import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { CHECKS, type CheckCode } from '../../src/core/checker/catalogue.js';
import { DIRECTIVES } from '../../src/core/docs/directives.js';
import { commandOperations, OPERATIONS, type CliSpec } from '../../src/core/operations/index.js';
import { ROOT, read, walk, interfaceKeys, findingCodes, manualPage } from '../support/spec-helpers.js';

// The manual (docs/manual/) must mention every part of the product's surface, and its links must work.
// Expectations are read from the code, so adding a command, config key, directive, dev.blazon field or
// finding code without documenting it fails here. This does not judge the prose.

const manualFiles = fs.existsSync(path.join(ROOT, 'docs/manual')) ? walk('docs/manual').filter((f) => f.endsWith('.md')) : [];
const manual = manualFiles.map(read).join('\n');

const mentions = (text: string) => manual.includes(text);
const backticked = (word: string) => manual.includes(`\`${word}\``);

describe('the manual exists', () => {
  it('has an index and chapters', () => {
    expect(manualFiles).toContain(path.join('docs/manual', 'index.md'));
    expect(manualFiles.length).toBeGreaterThanOrEqual(8);
  });
});

describe('the manual covers the product surface', () => {
  const cli = read('src/cli/index.ts');
  // The read commands are registered from the operations list, not in index.ts
  const handWritten = [...cli.matchAll(/\.command\('([a-z]+)/g)].map((m) => m[1]!);
  const fromList = commandOperations(OPERATIONS).map((op) => (op.cli as CliSpec).command[0]!);
  const listFlags = commandOperations(OPERATIONS).flatMap((op) => (op.cli as CliSpec).options.map((option) => `--${option.property}`));

  it('finds the commands it is checking', () => {
    // If the extraction breaks, fail loudly instead of checking nothing
    expect(handWritten.length).toBeGreaterThanOrEqual(8);
    expect(fromList.length).toBeGreaterThanOrEqual(7);
  });

  it.each([...new Set([...handWritten, ...fromList])])('documents the `blazon %s` command', (command) => {
    expect(mentions(`blazon ${command}`)).toBe(true);
  });

  it.each([...new Set([...[...cli.matchAll(/\.option\('(?:-[a-z], )?(--[A-Za-z]+)/g)].map((m) => m[1]!), ...listFlags])])('documents the %s flag', (flag) => {
    expect(mentions(flag)).toBe(true);
  });

  it.each(interfaceKeys('BlazonConfig'))('documents the `%s` config key', (key) => {
    expect(backticked(key)).toBe(true);
  });

  it.each(Object.keys(DIRECTIVES))('documents the blazon:%s directive', (name) => {
    expect(mentions(`blazon:${name}`)).toBe(true);
  });

  it.each(interfaceKeys('BlazonExtension'))('documents the `%s` dev.blazon field', (field) => {
    expect(backticked(field)).toBe(true);
  });

  it('finds the finding codes it is checking', () => {
    // If the extraction above breaks, fail loudly instead of checking nothing
    expect(findingCodes().length).toBe(Object.keys(CHECKS).length);
  });

  // Each code is named in backticks on the page its catalogue record names, not just somewhere in the manual.
  it.each(findingCodes())('documents the `%s` finding on the page its record names', (code) => {
    const { manual: page } = CHECKS[code as CheckCode];
    expect(manualPage(page), `${page}.md`).toContain(`\`${code}\``);
  });
});

/** GitHub's heading slug: lowercase, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

describe('links in the README and the manual resolve', () => {
  const docs = ['README.md', ...manualFiles];

  it.each(docs)('%s: every relative link and anchor goes somewhere', (file) => {
    const text = read(file).replace(/```[\s\S]*?```/g, '');
    const broken: string[] = [];
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!;
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [rel, anchor] = target.split('#');
      const targetFile = rel ? path.normalize(path.join(path.dirname(file), rel)) : file;
      if (!fs.existsSync(path.join(ROOT, targetFile))) {
        broken.push(`${target}: no file ${targetFile}`);
        continue;
      }
      if (anchor && targetFile.endsWith('.md')) {
        const headings = [
          ...read(targetFile)
            .replace(/```[\s\S]*?```/g, '')
            .matchAll(/^#{1,6} (.+)$/gm),
        ].map((h) => slug(h[1]!));
        if (!headings.includes(anchor)) broken.push(`${target}: no heading #${anchor} in ${targetFile}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('the manual lists the links that leave it', () => {
  // A site that mirrors the manual rewrites these by prefix (docs/manual/index.md). A new kind of prefix must be added there.
  const listed = ['../rfc/', '../../README.md', '../../SECURITY.md', '../../examples/', '../../scripts/', '../../src/'];

  it.each(manualFiles)('%s: every link outside the manual starts with a listed prefix', (file) => {
    const text = read(file).replace(/```[\s\S]*?```/g, '');
    const unlisted: string[] = [];
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!;
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const rel = target.split('#')[0]!;
      if (!rel.startsWith('../')) continue;
      if (!listed.some((prefix) => rel.startsWith(prefix))) unlisted.push(target);
    }
    expect(unlisted).toEqual([]);
  });

  it('names every prefix in docs/manual/index.md', () => {
    const index = read('docs/manual/index.md');
    for (const prefix of listed) expect(index).toContain(`\`${prefix}\``);
  });
});

describe('the manual and the README do not describe what is gone', () => {
  const docs = ['README.md', ...manualFiles];
  const cli = read('src/cli/index.ts');

  /** The flags of each command, read from the CLI's own declarations; what comes before the first command is global. */
  const flagsOf = (() => {
    const optionsIn = (code: string) => [...code.matchAll(/\.option\('(?:-[a-zA-Z], )?(--[A-Za-z][A-Za-z-]*)/g)].map((m) => m[1]!);
    const parts = cli.split(/\.command\('/);
    const global = new Set(['--help', '--version', ...optionsIn(parts[0]!)]);
    const byCommand = new Map<string, Set<string>>();
    for (const part of parts.slice(1)) {
      const name = /^([a-z]+)/.exec(part)![1]!;
      const flags = byCommand.get(name) ?? new Set<string>();
      for (const flag of optionsIn(part)) flags.add(flag);
      byCommand.set(name, flags);
    }
    for (const op of commandOperations(OPERATIONS)) {
      const spec = op.cli as CliSpec;
      byCommand.set(spec.command[0]!, new Set(spec.options.map((option) => `--${option.property}`)));
    }
    return { global, byCommand };
  })();

  it.each(docs)('%s: every flag written right after a blazon command is one that command has', (file) => {
    const wrong: string[] = [];
    const commands = [...flagsOf.byCommand.keys()].join('|');
    for (const m of read(file).matchAll(new RegExp('\\bblazon (' + commands + ')\\b([^`\\n|]*)', 'g'))) {
      const own = flagsOf.byCommand.get(m[1]!)!;
      for (const flag of m[2]!.matchAll(/(?<![\w-])(--[A-Za-z][A-Za-z-]*)/g)) {
        if (!own.has(flag[1]!) && !flagsOf.global.has(flag[1]!)) wrong.push(`blazon ${m[1]} ${flag[1]}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it.each(docs)("%s: every path into blazon's own source, tests, plugins, examples or RFCs exists", (file) => {
    const missing: string[] = [];
    for (const m of read(file).matchAll(/`((?:src|test|plugins|examples|bin|docs\/rfc|docs\/manual)\/[A-Za-z0-9_./-]*[A-Za-z0-9_/])`/g)) {
      const target = m[1]!.replace(/\/$/, '');
      if (!fs.existsSync(path.join(ROOT, target))) missing.push(m[1]!);
    }
    expect(missing).toEqual([]);
  });
});
