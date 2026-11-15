import fs from 'node:fs';
import path from 'node:path';
import { hasReference, referencePath } from '../support/reference';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import type { BlazonData } from '../../src/types/index.js';

/**
 * examples/slack: a brand derived with `blazon init` from the Slack Brand Guidelines PDF. Slack forbids
 * distributing its art, so the images are rendered locally by examples/slack/render-art.py and are not in
 * git. These tests hold with or without that art.
 */
const EXAMPLE = referencePath('examples/slack');
const PRESENT = hasReference('examples/slack');

let data: BlazonData;
beforeAll(async () => {
  if (!PRESENT) return;
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
});

const token = (p: string) => data.tokens.items.find((t) => t.path === p)!;

describe.skipIf(!PRESENT)('the Slack example', () => {
  it('has no findings but a note for each art folder not rendered here', () => {
    const rendered = (dir: string) => fs.readdirSync(path.join(EXAMPLE, 'assets', dir)).some((f) => /\.(png|webp)$/.test(f));
    const absent = ['logos', 'logo-usage', 'type-specimens'].filter((dir) => !rendered(dir));
    expect(data.findings.map((f) => `${f.code} ${f.path}`)).toEqual(absent.map((dir) => `asset-local-absent ${dir}`).sort());
  });

  it('holds the palette from page 17, with its print values', () => {
    expect(['blue', 'yellow', 'green', 'red'].map((c) => token(`color.logo.${c}`).value)).toEqual(['#36C5F0', '#ECB22E', '#2EB67D', '#E01E5A']);
    expect(token('color.logo.blue').blazon.print).toEqual({ cmyk: [65, 10, 2, 0], pms: '298' });
    expect(token('color.accent.aubergine').value).toBe('#4A154B');
    expect(token('text.link').aliasOf).toBe('color.accessible.blue');
    expect(token('color.accessible.blue').value).toBe('#1264A3');
  });

  it('keeps the logo colors out of text and fields of color', () => {
    expect(token('color.logo.red').blazon.usage).toEqual({ deny: ['text', 'background'] });
  });

  it('sets the ideal stack in px from its print points, with the print tracking', () => {
    expect(token('type.h1').value).toBe("700 48px/1.056 Larsseit, 'Proxima Nova', sans-serif");
    expect(token('type.p').parts).toMatchObject({ fontSize: '9.333px', letterSpacing: '-0.01em' });
  });

  it('says the brand book cannot load its typefaces, which are commercial', () => {
    expect(['headline', 'text', 'substitute'].map((f) => token(`font.family.${f}`).blazon.webFont)).toEqual([false, false, false]);
  });

  it('expects only the four sections the guidelines cover, and holds each', () => {
    expect(data.docs.map((d) => d.sections)).toEqual([['intro'], ['logo'], ['color'], ['typography']]);
    expect(data.findings.filter((f) => f.code.startsWith('section-'))).toEqual([]);
  });

  it('describes exactly the art render-art.py makes', () => {
    const script = fs.readFileSync(path.join(EXAMPLE, 'render-art.py'), 'utf-8');
    const pages = [...script.matchAll(/^ {4}'([a-z-]+\/[a-z-]+)': \d+,$/gm)].map((m) => m[1]);
    const marks = [...script.matchAll(/^ {4}'([a-z-]+)': \(\d+, /gm)].map((m) => `logos/${m[1]}`);
    const logos = [...['horizontal', 'stacked'].flatMap((lockup) => ['color', 'white'].map((v) => `logos/${lockup}-${v}`)), ...marks];
    const sidecars = ['logos', 'logo-usage', 'type-specimens'].flatMap((dir) =>
      fs.readdirSync(path.join(EXAMPLE, 'assets', dir)).filter((f) => f.endsWith('.json')).map((f) => `${dir}/${f.replace(/\.json$/, '')}`)
    );
    expect(sidecars.sort()).toEqual([...logos, ...pages].sort());
  });

  it('keeps every rendered image out of git', () => {
    const ignore = fs.readFileSync(path.join(EXAMPLE, '.gitignore'), 'utf-8');
    expect(ignore).toMatch(/^assets\/\*\*\/\*\.png$/m);
    expect(ignore).toMatch(/^assets\/\*\*\/\*\.webp$/m);
  });

  it('uses the small octothorpe below 30px (page 8)', () => {
    const rule = path.join(EXAMPLE, 'assets/logos/octothorpe.json');
    expect(JSON.parse(fs.readFileSync(rule, 'utf-8')).replacedBelow).toEqual({ width: { value: 30, unit: 'px' }, by: 'logos/small-octothorpe' });
  });
});
