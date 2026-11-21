import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBrand as readBrandRaw } from '../../../src/shipped/press-kit/brand.js';
import { planFonts } from '../../../src/shipped/press-kit/fonts.js';
import { kitPage } from '../../../src/shipped/press-kit/html.js';
import { ROOT_DIR } from '../support/spec.js';

// A font token's role and reason (RFC 0001 §2, `font`): fonts.txt and the press kit page both read one model that planFonts returns,
// so the text format can change without the page noticing. A brand that sets none of the fields gets the bytes it got before.

const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 2, ...brand });
const family = (p: string, stack: string[], font?: object) => ({ path: p, type: 'fontFamily', value: stack.join(', '), resolvedValue: stack, ...(font && { blazon: { font } }) });
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const WITH_ROLES = readBrand({
  brand: { title: 'Acme Co' },
  theme: { roles: { fontDisplay: "'Acme Sans', Arial, sans-serif" }, fonts: [] },
  tokens: [
    family('font.family.display', ['Acme Sans', 'Arial', 'sans-serif'], { source: 'Acme Type', license: 'OFL-1.1', role: 'primary', reason: 'Headlines and running text' }),
    family('font.family.mono', ['Acme Mono', 'monospace'], { source: 'Acme Type', role: 'monospace' }),
    family('font.family.slides', ['Arial'], { role: 'fallback', reason: 'Works in Slides', fallbackFor: 'font.family.display' }),
  ],
});

describe('fonts.txt with roles', () => {
  const { text } = planFonts(WITH_ROLES);

  it('prints a Role line, a Why line, and Stands in for on a fallback, between Used for and Source', () => {
    expect(text).toBe(
      [
        'Fonts',
        '',
        'Acme Sans',
        '  Used for: headings (the fontDisplay role), font.family.display',
        '  Role: primary',
        '  Why: Headlines and running text',
        '  Source: Acme Type',
        '  License:',
        '    OFL-1.1',
        '',
        'Acme Mono',
        '  Used for: font.family.mono',
        '  Role: monospace',
        '  Source: Acme Type',
        '  License: not stated',
        '',
        'Arial',
        '  Used for: font.family.slides',
        '  Role: fallback',
        '  Why: Works in Slides',
        '  Stands in for: Acme Sans',
        '',
        'Fallback fonts, not shipped: sans-serif, monospace',
        '',
      ].join('\n'),
    );
  });

  it('says nothing about license for a fallback that states none, and the unstated finding counts only the brand fonts', () => {
    const findings = planFonts(WITH_ROLES).findings;
    expect(findings.map((f) => f.message).join()).toContain('1 font has no license stated: Acme Mono');
  });

  it('leaves out a reason or fallbackFor that is not valid', () => {
    const brand = readBrand({
      tokens: [family('font.family.a', ['Acme Sans'], { role: 'secondary', reason: 'one\ntwo', fallbackFor: 'Acme Serif' }), family('font.family.b', ['Acme Mono'], { role: 'wide' })],
    });
    const out = planFonts(brand).text!;
    expect(out).toContain('Acme Sans\n  Used for: font.family.a\n  Role: secondary\n  Source: not stated');
    expect(out).not.toMatch(/Why|Stands in for/);
    expect(out).not.toContain('wide');
  });
});

describe('the page Fonts section', () => {
  const page = (fonts: ReturnType<typeof planFonts>['model']) => kitPage({ brand: WITH_ROLES, logos: [], colors: [], fonts, paths: [] });

  it('shows role, reason and what a fallback stands in for, from the model', () => {
    const html = page(planFonts(WITH_ROLES).model);
    expect(html).toContain('<dt>Role</dt><dd>primary</dd>');
    expect(html).toContain('<dt>Why</dt><dd>Headlines and running text</dd>');
    expect(html).toContain('<dt>Stands in for</dt><dd>Acme Sans</dd>');
    expect(html).toContain('Fallback fonts, not shipped: sans-serif, monospace');
  });

  it('does not read fonts.txt: a model whose text would not parse draws the same page', () => {
    const model = planFonts(WITH_ROLES).model!;
    expect(page(model)).toBe(page(structuredClone(model)));
    const source = fs.readFileSync(path.join(ROOT_DIR, 'src/shipped/press-kit/html.ts'), 'utf-8');
    expect(source).not.toMatch(/readFonts|FontBlock/);
    expect(typeof model).toBe('object');
  });

  it('escapes the role and the reason', () => {
    const evil = '<script>alert(1)</script>"x\'&';
    const brand = readBrand({ tokens: [family('font.family.a', ['Acme Sans'], { role: 'primary', reason: evil })] });
    const html = kitPage({ brand, logos: [], colors: [], fonts: planFonts(brand).model, paths: [] });
    expect(html.match(/<script/gi)).toBeNull();
    expect(html).toContain('&#60;script&#62;alert(1)&#60;/script&#62;&#34;x&#39;&#38;');
  });
});

describe('a brand with none of the new fields', () => {
  const brand = readBrand({
    brand: { title: 'Acme Co' },
    theme: { roles: { fontDisplay: "'Big Shoulders Display', sans-serif", fontBody: 'Arial, sans-serif' }, fonts: ['https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&display=swap'] },
    tokens: [family('font.family.display', ['Big Shoulders Display', 'sans-serif'], { source: 'Acme Type', license: 'OFL-1.1', licenseUrl: 'https://example.com/ofl' })],
  });

  it('gets the same fonts.txt and the same page as before', () => {
    const plan = planFonts(brand);
    expect(sha(plan.text!)).toBe('d827b9ad87c28c13c393cea13f3da79bf6529dcadd734859327805603ffe171b');
    expect(sha(kitPage({ brand, logos: [], colors: [], fonts: plan.model, paths: [] }))).toBe('289c7510dc0f25706675c7fd84fb8178c45fc75130cb8f7b1563748e2b169ce3');
  });
});
