import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/project';

// The read commands `fonts`, `logo` and `brand`: the fonts the brand loads, the logo variants, and the compiled brand.json. Split from the read-command tests.

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

describe('blazon fonts and blazon logo', () => {
  it('print the fonts the brand loads and the logo variants with their sidecar rules', () => {
    const fonts = JSON.parse(blazon('fonts', root, '--json').stdout);
    expect(fonts).toMatchObject({ command: 'fonts', passed: true });
    expect(fonts.stylesheets.length).toBeGreaterThan(0);
    expect(fonts.families.map((f: { family: string }) => f.family)).toContain('IBM Plex Sans');
    const logo = JSON.parse(blazon('logo', root, '--json').stdout);
    expect(logo).toMatchObject({ command: 'logo', passed: true, variants: [{ variant: 'onLight' }, { variant: 'onDark' }] });
    expect(logo.assets[0].rules).toHaveProperty('clearSpace');
    const wordmark = logo.assets.find((a: { id: string }) => a.id === 'logos/blazon-graphite');
    expect(wordmark.rules.minSize).toEqual({ height: { value: 32, unit: 'px' } });
    const text = blazon('logo', root).stdout;
    expect(text).toContain('Variants');
    expect(text).toContain('min size      height 32px');
  }, 120_000);

  it('--css prints the @font-face rule of the font file, --base moves its path, and --json carries the text', () => {
    const ran = blazon('fonts', root, '--css', '--base', '/fonts/');
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toMatch(/@font-face \{\n {2}font-family: "IBM Plex Mono";\n {2}src: url\("\/fonts\/IBMPlexMono[^"]*\.woff2"\) format\("woff2"\);/);
    expect(ran.stdout).toContain('font-display: swap');
    expect(ran.stdout).toMatch(/^\/\* Stylesheet, not fetched by blazon: https:\/\/fonts\.googleapis\.com/m);
    expect(blazon('fonts', root, '--css').stdout).toMatch(/url\("fonts\/IBMPlexMono/);
    const json = JSON.parse(blazon('fonts', root, '--css', '--json').stdout);
    expect(json.fontFace).toContain('@font-face');
    expect(json.files.length).toBeGreaterThan(0);
    expect(blazon('fonts', root, '--base', '/f/').status).toBe(2);
  }, 120_000);

  it('exit 2 for a folder with no brand book in it', () => {
    expect(blazon('fonts', '/nonexistent-blazon-folder').status).toBe(2);
  }, 120_000);
});

describe('blazon brand', () => {
  it('prints the compiled brand.json, or one part of it, and writes nothing', () => {
    const whole = blazon('brand', root);
    expect(whole.status, whole.stderr).toBe(0);
    expect(JSON.parse(whole.stdout)).toMatchObject({ format: 'blazon-brand', version: 2 });
    const part = blazon('brand', root, '--key', 'theme.roles');
    expect(part.status, part.stderr).toBe(0);
    expect(JSON.parse(part.stdout).accent).toBe('#FF5A1F');
    expect(fs.existsSync(path.join(root, 'dist'))).toBe(false);
  });

  it('exits 2 for a key the document does not have, and prints nothing on standard output', () => {
    const missing = blazon('brand', root, '--key', 'theme.nope');
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toMatch(/no "theme\.nope"/);
  });
});
