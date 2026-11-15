// Builds one brand with two builds of blazon and reports what differs, so moving a brand's pin from one blazon commit to another is one command
// and not an afternoon. It compares what `blazon check` found, every file `blazon tokens` and `blazon build` write under dist/, and brand.json
// (without the commit that built it). Nothing of the brand is changed: each build runs in a copy.
//
//   npx tsx scripts/pin-compare.ts <brand> <blazon-a> <blazon-b> [--ignore '*.pdf'] [--no-plugins] [--json]
//
// <blazon-a> and <blazon-b> are checkouts of blazon that have been built (`npm ci && npm run build`), for example two `git worktree`s. A brand's
// blazon.lock is left out of the copies, because it names one commit and the other build would refuse to run. The report lists the differences,
// and the exit status is 0 when there are none and 1 when there are. A file a plugin writes with a time in it (a PDF, a zip) differs on every
// build: name it with --ignore, which takes a path with * in it.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface FindingKey {
  severity: string;
  code: string;
  path: string;
  message: string;
}

export interface Difference<T> {
  added: T[];
  removed: T[];
}

export interface FileDifference {
  added: string[];
  removed: string[];
  changed: string[];
}

/** One line for a finding, which is what two builds are compared by. */
export const findingLine = (f: FindingKey): string => `${f.severity} ${f.code} ${f.path}: ${f.message}`;

/** The findings only the second build has (added) and only the first has (removed), compared by severity, code, path and message. */
export function diffFindings(a: FindingKey[], b: FindingKey[]): Difference<string> {
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  for (const f of a) left.set(findingLine(f), (left.get(findingLine(f)) ?? 0) + 1);
  for (const f of b) right.set(findingLine(f), (right.get(findingLine(f)) ?? 0) + 1);
  const only = (from: Map<string, number>, other: Map<string, number>) =>
    [...from]
      .filter(([line, count]) => count > (other.get(line) ?? 0))
      .map(([line]) => line)
      .sort();
  return { added: only(right, left), removed: only(left, right) };
}

/** A pattern with `*` (any run of characters, `/` included) as a regular expression that must match the whole path. Every other character is literal. */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
}

/** The files two builds wrote, by path and digest: those in one only, and those in both with other content. `ignore` leaves paths out. */
export function diffDigests(a: Record<string, string>, b: Record<string, string>, ignore: string[] = []): FileDifference {
  const skipped = ignore.map(globToRegExp);
  const kept = (file: string) => !skipped.some((pattern) => pattern.test(file));
  const names = (digests: Record<string, string>) => Object.keys(digests).filter(kept);
  return {
    added: names(b)
      .filter((file) => !(file in a))
      .sort(),
    removed: names(a)
      .filter((file) => !(file in b))
      .sort(),
    changed: names(a)
      .filter((file) => file in b && a[file] !== b[file])
      .sort(),
  };
}

/** brand.json as it is compared: without the blazon commit that wrote it, which differs between two builds by design. */
export function normalizeBrandJson(text: string): unknown {
  const brand = JSON.parse(text) as { generator?: Record<string, unknown> };
  if (brand.generator) {
    delete brand.generator.commit;
    delete brand.generator.dirty;
  }
  return brand;
}

/** The top-level keys of two brand.json documents that are not equal. */
export function diffBrandKeys(a: unknown, b: unknown): string[] {
  const left = (a ?? {}) as Record<string, unknown>;
  const right = (b ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).sort();
}

/** Every file under a folder, by path from it, with a digest of its bytes. A missing folder has none. */
export function digestTree(root: string): Record<string, string> {
  const digests: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) digests[path.relative(root, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return digests;
}

export interface BuildResult {
  blazon: string;
  checkStatus: number | null;
  buildStatus: number | null;
  findings: FindingKey[];
  tokens: Record<string, string>;
  site: Record<string, string>;
  brand: unknown;
}

export interface Comparison {
  brand: string;
  a: { blazon: string; checkStatus: number | null; buildStatus: number | null };
  b: { blazon: string; checkStatus: number | null; buildStatus: number | null };
  findings: Difference<string>;
  tokens: FileDifference;
  site: FileDifference;
  brandJsonKeys: string[];
  identical: boolean;
}

/** The report of two builds of one brand. Identical means no finding, no file and no brand.json key differs, and the exit statuses agree. */
export function compare(brand: string, a: BuildResult, b: BuildResult, ignore: string[] = []): Comparison {
  const findings = diffFindings(a.findings, b.findings);
  const tokens = diffDigests(a.tokens, b.tokens, ignore);
  const site = diffDigests(a.site, b.site, [...ignore, 'brand.json']);
  const brandJsonKeys = diffBrandKeys(a.brand, b.brand);
  const statuses = a.checkStatus === b.checkStatus && a.buildStatus === b.buildStatus;
  const none = (d: Difference<string> | FileDifference) => Object.values(d).every((list) => list.length === 0);
  return {
    brand,
    a: { blazon: a.blazon, checkStatus: a.checkStatus, buildStatus: a.buildStatus },
    b: { blazon: b.blazon, checkStatus: b.checkStatus, buildStatus: b.buildStatus },
    findings,
    tokens,
    site,
    brandJsonKeys,
    identical: statuses && none(findings) && none(tokens) && none(site) && brandJsonKeys.length === 0,
  };
}

const list = (title: string, items: string[]): string | undefined =>
  items.length === 0 ? undefined : `**${title}** (${items.length})\n\n${items.map((item) => `- ${item}`).join('\n')}\n`;

/** The comparison as Markdown, to read or to paste where the pin change is reviewed. */
export function report(c: Comparison): string {
  const status = (s: number | null) => (s === null ? 'did not run' : `exit ${s}`);
  const lists = [
    list('Findings only B reports', c.findings.added),
    list('Findings only A reports', c.findings.removed),
    list('Token and plugin files only B writes', c.tokens.added),
    list('Token and plugin files only A writes', c.tokens.removed),
    list('Token and plugin files that differ', c.tokens.changed),
    list('Site files only B writes', c.site.added),
    list('Site files only A writes', c.site.removed),
    list('Site files that differ', c.site.changed),
    list('brand.json keys that differ', c.brandJsonKeys),
  ].filter((part): part is string => part !== undefined);
  return [
    `# Pin comparison: ${path.basename(c.brand)}`,
    '',
    '| | blazon | check | build |',
    '|---|---|---|---|',
    `| A | \`${c.a.blazon}\` | ${status(c.a.checkStatus)} | ${status(c.a.buildStatus)} |`,
    `| B | \`${c.b.blazon}\` | ${status(c.b.checkStatus)} | ${status(c.b.buildStatus)} |`,
    '',
    c.identical ? 'No difference in the findings, the token files, the site files or brand.json.' : 'The two builds differ.',
    '',
    ...lists,
  ].join('\n');
}

/** A copy of the brand to build in: its files, its installed packages linked and no blazon.lock, which names one commit. */
function copyBrand(brand: string): string {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-pin-compare-'));
  fs.cpSync(brand, copy, { recursive: true, filter: (file) => !['dist', 'node_modules', '.git'].includes(path.basename(file)) && path.basename(file) !== 'blazon.lock' });
  const modules = path.join(brand, 'node_modules');
  if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(copy, 'node_modules'), 'dir');
  return copy;
}

/** Runs one build of blazon over a copy of the brand: the check, then the build, and what they left. */
export function build(brand: string, blazon: string, noPlugins: boolean): BuildResult {
  const bin = path.join(blazon, 'bin/blazon.js');
  if (!fs.existsSync(bin) || !fs.existsSync(path.join(blazon, 'dist')))
    throw new Error(`${blazon} is not a built blazon: it has no bin/blazon.js or no dist/ (run npm ci and npm run build there)`);
  const copy = copyBrand(brand);
  try {
    const flags = noPlugins ? ['--no-plugins'] : [];
    const run = (command: string) =>
      spawnSync(process.execPath, [bin, command, copy, '--json', ...flags], {
        encoding: 'utf-8',
        cwd: copy,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    const check = run('check');
    let findings: FindingKey[] = [];
    try {
      findings = (JSON.parse(check.stdout) as { findings?: FindingKey[] }).findings ?? [];
    } catch {
      /* the check printed no document: the statuses say so */
    }
    const built = run('build');
    const siteBrand = path.join(copy, 'dist/site/brand.json');
    return {
      blazon,
      checkStatus: check.status,
      buildStatus: built.status,
      findings,
      tokens: digestTree(path.join(copy, 'dist/tokens')),
      site: digestTree(path.join(copy, 'dist/site')),
      brand: fs.existsSync(siteBrand) ? normalizeBrandJson(fs.readFileSync(siteBrand, 'utf-8')) : undefined,
    };
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

function main(argv: string[]): number {
  const ignore: string[] = [];
  const positional: string[] = [];
  let json = false;
  let noPlugins = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--no-plugins') noPlugins = true;
    else if (arg === '--ignore') ignore.push(argv[++i] ?? '');
    else if (arg.startsWith('--')) {
      console.error(`pin-compare: unknown option ${arg}`);
      return 2;
    } else positional.push(arg);
  }
  const [brand, a, b] = positional.map((p) => path.resolve(p));
  if (!brand || !a || !b || positional.length !== 3 || ignore.includes('')) {
    console.error("usage: tsx scripts/pin-compare.ts <brand> <blazon-a> <blazon-b> [--ignore '*.pdf'] [--no-plugins] [--json]");
    return 2;
  }
  if (!fs.existsSync(path.join(brand, 'blazon.config.ts')) && !fs.existsSync(path.join(brand, 'tokens'))) {
    console.error(`pin-compare: ${brand} is not a brand (it has no blazon.config.ts and no tokens/)`);
    return 2;
  }
  try {
    const comparison = compare(brand, build(brand, a, noPlugins), build(brand, b, noPlugins), ignore);
    console.log(json ? JSON.stringify(comparison, null, 2) : report(comparison));
    return comparison.identical ? 0 : 1;
  } catch (error) {
    console.error(`pin-compare: ${(error as Error).message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
