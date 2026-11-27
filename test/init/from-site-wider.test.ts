import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { weightOf } from '../../src/core/init/from-site/fonts.js';
import { pickRadii } from '../../src/core/init/from-site/sections/radius.js';
import { inspectSite, savedSite } from '../../src/core/init/from-site/index.js';
import { toHex } from '../../src/core/init/shared/hex.js';
import { tempDir } from '../support/project';
import { acmeSavedSite } from './fixtures/acme-saved-site.js';

// What `init --from` and `--from-dir` read beyond the named hex colors: any CSS color, radii, font weights and the theme color. The role of
// a color still comes only from the custom property's name.

afterEach(() => vi.restoreAllMocks());

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const json = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('reading values', () => {
  it('reads any CSS color as hex through the core parser', () => {
    expect(toHex('oklch(0.55 0.2 264)')).toEqual({ hex: '#3266e4', exact: false });
    expect(toHex('hsl(200 80% 40%)')?.hex).toBe('#1481b8');
    expect(toHex('hsl(10, 10%, 10%)')?.hex).toBe('#1c1817');
    expect(toHex('white')?.hex).toBe('#ffffff');
    expect(toHex('oklch(0.7 0.4 30)')?.hex).toMatch(/^#[0-9a-f]{6}$/); // outside sRGB: mapped into it
    expect(toHex('oklch(0.5 0.1 200 / 40%)')?.hex).toHaveLength(9); // alpha kept, so it is skipped as an overlay
    expect(toHex('transparent')?.hex).toBe('#00000000');
    for (const text of ['currentColor', 'var(--x)', 'inherit', 'not-a-color']) expect(toHex(text)).toBeUndefined();
  });

  it('reads radii only from custom properties named for a radius, as one px or rem length', () => {
    const vars = new Map([
      ['--radius', '0.5rem'],
      ['--radius-lg', '12px'],
      ['--border-radius-sm', '0'],
      ['--radius-xl', 'calc(var(--radius) + 4px)'],
      ['--space-md', '1rem'],
    ]);
    const { picks, skipped } = pickRadii(vars);
    expect(picks.map((p) => [p.name, p.value])).toEqual([
      ['base', { value: 0.5, unit: 'rem' }],
      ['lg', { value: 12, unit: 'px' }],
      ['sm', { value: 0, unit: 'px' }],
    ]);
    expect(skipped.join()).toMatch(/--radius-xl .* is not one length/);
  });

  it('reads the weight the body and heading rules set', () => {
    const css = 'body { font-weight: normal } h2 { font-weight: 500 } h1, h3 { font-weight: var(--w) } h4 { font-weight: bolder }';
    const vars = new Map([['--w', '800']]);
    expect(weightOf(css, vars, /^(body|html)$/)).toEqual({ weight: 400, locator: 'body { font-weight }' });
    expect(weightOf(css, vars, /^h[1-6]$/, 'h1')).toEqual({ weight: 800, locator: 'h1 { font-weight }' });
  });
});

describe('a Tailwind v4 site with oklch colors, saved', () => {
  it('writes its named colors, radii and weights, all needs-review, and leaves the font license open', async () => {
    quiet();
    const dir = path.join(tempDir(), 'acme');
    expect(await runInit(dir, { fromDir: acmeSavedSite() })).toBe(0);

    const colors = json(dir, 'tokens/colors.json');
    expect(colors.color.primary.$value).toBe('#3266e4');
    // converted from oklch(), so the hex would never match the variable: no cssVar, as for rgb()
    expect(colors.color.primary.$extensions['dev.blazon'].source.cssVar).toBeUndefined();
    expect(colors.color.brand.secondary.$value).toBe('#1481b8');
    expect(colors.color.surface.card.$value).toBe('#ffffff');
    // the primary is the one NAMED primary: the most used color in the rules (#333333, then #1d4ed8 and #e5e7eb) is never chosen
    expect(colors.interactive.primary.$value).toBe('{color.primary}');
    expect(JSON.stringify(colors)).not.toMatch(/#333333|#1d4ed8|#e5e7eb/);
    // --color-gray-100 is not named for a brand role: it is not written
    expect(colors.color.gray).toBeUndefined();

    const form = json(dir, 'tokens/form.json');
    expect(form.radius.md).toMatchObject({ $value: { value: 0.5, unit: 'rem' } });
    expect(form.radius.md.$extensions['dev.blazon']).toMatchObject({ source: { cssVar: '--radius-md' }, review: { status: 'needs-review' } });
    expect(form.radius.lg.$value).toEqual({ value: 0.75, unit: 'rem' });
    // the starter's radii stay, and the 8px the rules use most is not a token
    expect(form.radius.none).toBeDefined();
    expect(JSON.stringify(form.radius)).not.toContain('"value":8');

    const type = json(dir, 'tokens/typography.json');
    expect(type.font.weight.body).toMatchObject({
      $value: 400,
      $extensions: { 'dev.blazon': { source: { locator: 'body { font-weight }' }, review: { status: 'needs-review' } } },
    });
    expect(type.font.weight.display).toMatchObject({ $value: 700, $extensions: { 'dev.blazon': { source: { locator: 'h1 { font-weight }' } } } });
    expect(type.font.weight.regular.$value).toBe(400); // the starter's named weights are kept
    // family names only: no license is set for the site's fonts, and no font file is downloaded
    for (const role of ['body', 'display']) expect(JSON.stringify(type.font.family[role])).not.toContain('license');
    const fonts = json(dir, 'blazon.json').fonts as unknown[];
    expect(fonts.filter((f) => typeof f === 'object' && JSON.stringify(f).match(/Inter|Space Grotesk/))).toEqual([]);
    expect(fs.readdirSync(path.join(dir, 'fonts')).some((f) => /inter|grotesk/i.test(f))).toBe(false);
  });

  it('says the theme color when it inspects, and writes no token for it', async () => {
    const findings = await inspectSite(savedSite(acmeSavedSite()));
    expect(findings.themeColor).toBe('#4338ca');
    expect(findings.colors.map((c) => c.cssVar)).toContain('--color-primary');
    quiet();
    const dir = path.join(tempDir(), 'acme');
    expect(await runInit(dir, { fromDir: acmeSavedSite() })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'tokens/colors.json'), 'utf8')).not.toContain('#4338ca');
  });

  it('chooses no primary by frequency: a site whose only colors are in its rules keeps the starter primary', async () => {
    const site = path.join(tempDir(), 'plain-site');
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, 'index.html'), '<html><head><title>Acme</title><link rel="stylesheet" href="s.css"></head></html>');
    fs.writeFileSync(path.join(site, 's.css'), Array.from({ length: 30 }, (_, i) => `.x${i} { color: #e11d48; }`).join('\n'));
    quiet();
    const dir = path.join(tempDir(), 'acme');
    expect(await runInit(dir, { fromDir: site })).toBe(0);
    const text = fs.readFileSync(path.join(dir, 'tokens/colors.json'), 'utf8');
    expect(text).not.toContain('#e11d48');
    expect(JSON.parse(text).interactive.primary.$value).toBe('{color.signal.orange}');
  });
});
