import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runTokens } from '../../../src/cli/commands/tokens.js';
import { loadConfig } from '../../../src/core/config/index.js';
import { MAX_TEXT } from '../../../src/core/operations/limits.js';
import { OutputsError, describeOutputs } from '../../../src/core/read/index.js';
import type { BlazonConfig } from '../../../src/types/index.js';
import { starterProject } from '../../support/init-project.js';
import { tempDir } from '../../support/project.js';

// `describeOutputs` only reads what `blazon tokens` wrote: it lists the files, says whether an input of the brand is newer than each, and
// can return one file's text. It starts no plugin and writes nothing.

let root: string;
let config: BlazonConfig;
const outDir = () => path.join(root, 'dist', 'tokens');
const hour = 3600;
const now = () => Math.floor(Date.now() / 1000);
const touch = (file: string, seconds: number) => fs.utimesSync(file, seconds, seconds);
const tokenFile = () =>
  path.join(
    root,
    'tokens',
    fs.readdirSync(path.join(root, 'tokens')).find((f) => f.endsWith('.json'))!,
  );

beforeAll(async () => {
  root = await starterProject();
  config = await loadConfig(root);
  await runTokens(root);
}, 120_000);

const refusal = (file: string): string => {
  try {
    describeOutputs(config, root, { file });
  } catch (error) {
    expect(error).toBeInstanceOf(OutputsError);
    return (error as Error).message;
  }
  throw new Error(`${JSON.stringify(file)} was not refused`);
};

describe('describeOutputs', () => {
  it('lists the files blazon tokens wrote, fresh, with sizes and both paths', () => {
    // Every output newer than every input
    for (const entry of fs.readdirSync(outDir())) touch(path.join(outDir(), entry), now() + hour);
    const answer = describeOutputs(config, root);
    expect(answer.outputsDir).toBe('dist/tokens');
    const css = answer.files.find((f) => f.file === 'theme.css');
    expect(css).toMatchObject({ relative: 'dist/tokens/theme.css', path: path.join(outDir(), 'theme.css'), state: 'fresh' });
    expect(css?.bytes).toBe(fs.statSync(path.join(outDir(), 'theme.css')).size);
    expect(answer.files.length).toBeGreaterThan(1);
    expect(answer.files.every((f) => f.state === 'fresh')).toBe(true);
    expect(answer.missing).toEqual([]);
    expect(answer).not.toHaveProperty('fix');
    expect(answer).not.toHaveProperty('text');
    expect(answer.note).toBe('fresh means no input of the brand is newer than the file, by timestamp; a git checkout rewrites timestamps');
  });

  it('calls every file stale once a token file is newer, and names the fix', () => {
    touch(tokenFile(), now() + 2 * hour);
    const answer = describeOutputs(config, root);
    expect(answer.files.every((f) => f.state === 'stale')).toBe(true);
    expect(answer.fix).toBe('blazon tokens');
    touch(tokenFile(), now() - 10 * hour);
    expect(describeOutputs(config, root).files.every((f) => f.state === 'fresh')).toBe(true);
  });

  it('gives no files, every configured plugin missing and the fix when the folder is gone, and creates nothing', () => {
    const copy = tempDir('blazon-outputs-');
    fs.cpSync(root, copy, { recursive: true });
    fs.rmSync(path.join(copy, 'dist'), { recursive: true, force: true });
    const asked = { ...config, plugins: [{ name: 'blazon.tailwind' }, { name: 'blazon.shadcn', as: 'acme.shadcn' }] } as BlazonConfig;
    const answer = describeOutputs(asked, copy);
    expect(answer.files).toEqual([]);
    expect(answer.missing.map((m) => m.id)).toEqual(['blazon.tailwind', 'acme.shadcn']);
    expect(answer.missing[0]).not.toHaveProperty('fix');
    expect(answer.fix).toBe('blazon tokens');
    expect(fs.existsSync(path.join(copy, 'dist'))).toBe(false);
  });

  it('lists a configured plugin whose folder is absent as missing, and not one whose folder exists', () => {
    fs.mkdirSync(path.join(outDir(), 'blazon.tailwind'), { recursive: true });
    fs.writeFileSync(path.join(outDir(), 'blazon.tailwind', 'theme.css'), '@theme {}');
    const asked = { ...config, plugins: [{ name: 'blazon.tailwind' }, { name: 'blazon.shadcn' }] } as BlazonConfig;
    const answer = describeOutputs(asked, root);
    expect(answer.missing.map((m) => m.id)).toEqual(['blazon.shadcn']);
    // a plugin with no folder may simply write nothing on `blazon tokens`: running it again would never clear that, so it is not a fix
    expect(answer).not.toHaveProperty('fix');
    expect(answer.missing[0]).not.toHaveProperty('fix');
    expect(answer.files.map((f) => f.file)).toContain('blazon.tailwind/theme.css');
    fs.rmSync(path.join(outDir(), 'blazon.tailwind'), { recursive: true });
  });

  it('returns the text of one file, named as under the outputs folder', () => {
    const answer = describeOutputs(config, root, { file: 'theme.css' });
    expect(answer.text).toBe(fs.readFileSync(path.join(outDir(), 'theme.css'), 'utf-8'));
    expect(answer.truncated).toBe(false);
  });

  it('cuts a file over the limit at MAX_TEXT characters and says so', () => {
    expect(MAX_TEXT).toBe(40_000);
    const big = path.join(outDir(), 'big.txt');
    fs.writeFileSync(big, `${'a'.repeat(MAX_TEXT)}b`);
    const cut = describeOutputs(config, root, { file: 'big.txt' });
    expect(cut.text).toBe('a'.repeat(MAX_TEXT));
    expect(cut.truncated).toBe(true);
    fs.writeFileSync(big, 'a'.repeat(MAX_TEXT));
    expect(describeOutputs(config, root, { file: 'big.txt' }).truncated).toBe(false);
    fs.rmSync(big);
  });

  it('refuses a file that is not text, one that is not there, and a folder', () => {
    fs.writeFileSync(path.join(outDir(), 'raw.bin'), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    expect(refusal('raw.bin')).toMatch(/not text/);
    fs.rmSync(path.join(outDir(), 'raw.bin'));
    expect(refusal('nope.css')).toMatch(/no file/);
    fs.mkdirSync(path.join(outDir(), 'sub'), { recursive: true });
    expect(refusal('sub')).toMatch(/not a file/);
    fs.rmdirSync(path.join(outDir(), 'sub'));
  });

  it('refuses a file outside the outputs folder, by every route', () => {
    fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
    fs.symlinkSync(path.join(root, 'secret.txt'), path.join(outDir(), 'link.txt'));
    fs.symlinkSync(root, path.join(outDir(), 'dirlink'));
    const hostile = [
      '../x',
      '../../secret.txt',
      'sub/../../x',
      '..',
      '/etc/hosts',
      path.join(root, 'secret.txt'),
      'link.txt',
      'dirlink/secret.txt',
      '',
      'a\0b',
      'C:\\x',
      '\\\\host\\share\\x',
    ];
    for (const file of hostile) expect(() => describeOutputs(config, root, { file }), JSON.stringify(file)).toThrow(OutputsError);
    expect(refusal('link.txt')).not.toContain('private');
    fs.unlinkSync(path.join(outDir(), 'dirlink'));
    fs.unlinkSync(path.join(outDir(), 'link.txt'));
  });

  it('does not list a link, and writes nothing', () => {
    fs.symlinkSync(path.join(root, 'secret.txt'), path.join(outDir(), 'link.txt'));
    const before = fs.readdirSync(outDir(), { recursive: true }).sort();
    const answer = describeOutputs(config, root);
    expect(answer.files.map((f) => f.file)).not.toContain('link.txt');
    expect(fs.readdirSync(outDir(), { recursive: true }).sort()).toEqual(before);
    fs.unlinkSync(path.join(outDir(), 'link.txt'));
  });
});
