import { describe, it, expect } from 'vitest';
import { dialable, fieldProblems, fontStack, signatureDocument, signatureHtml, signatureText } from '../../src/core/email-signature.js';
import { resolveConfig } from '../../src/core/config/validate.js';
import { directiveFindings } from '../../src/core/docs/directives.js';
import type { DocItem, EmailSignatureConfig } from '../../src/types/index.js';

// The `<!-- blazon:email-signature -->` directive makes HTML that a mail app keeps: inline styles, a logo from a URL,
// and every field escaped, because what a person types ends up in other people's inboxes.

const CONFIG: EmailSignatureConfig = {
  logoUrl: 'https://example.com/email/logo@2x.png',
  logoSize: { width: 150, height: 35 },
  logoAlt: 'Acme',
  domains: ['acme.com'],
  lines: ['Acme Ltd · 1 Example Street', 'This email is confidential.'],
};
const STYLE = { text: '#111827', muted: '#4B5563', font: 'Mulish,ui-sans-serif,system-ui' };
const FIELDS = { name: 'Alex Morgan', position: 'Head of Partnerships', phone: '+44 20 7946 0000', email: 'Alex.Morgan@acme.com' };

describe('signatureHtml', () => {
  const html = signatureHtml(CONFIG, FIELDS, STYLE);

  it('is one table with inline styles and no style element, class or script', () => {
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('max-width:480px');
    expect(html).not.toMatch(/<style|class=|<script/);
  });

  it('loads the logo from its URL at the configured size, with its alternative text', () => {
    expect(html).toContain('<img src="https://example.com/email/logo@2x.png" width="150" height="35" alt="Acme"');
    expect(html).toContain('width:150px;height:35px');
  });

  it('links the phone to the digits it dials and the address in lower case', () => {
    expect(html).toContain('href="tel:+442079460000"');
    expect(html).toContain('href="mailto:alex.morgan@acme.com"');
  });

  it('puts the fixed lines after the logo, in order', () => {
    const logo = html.indexOf('<img');
    const company = html.indexOf('Acme Ltd');
    expect(logo).toBeGreaterThan(0);
    expect(company).toBeGreaterThan(logo);
    expect(html.indexOf('This email is confidential.')).toBeGreaterThan(company);
  });

  it('sets the brand font first and mail-safe families after it', () => {
    expect(html).toContain('font-family:Mulish, Arial, Helvetica, sans-serif');
  });

  it('escapes what a person types', () => {
    const typed = signatureHtml(CONFIG, { ...FIELDS, name: '<img src=x onerror=alert(1)>', position: '"><script>' }, STYLE);
    expect(typed).not.toContain('<img src=x');
    expect(typed).not.toContain('<script>');
    expect(typed).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the configured alternative text, lines and logo URL where they sit in an attribute or an element', () => {
    const config = {
      ...CONFIG,
      logoUrl: 'https://example.com/logo.png?a=1&b=2',
      logoAlt: 'Acme "the" <b>bold</b> \'one\'',
      lines: ['<script>alert(1)</script> & co'],
    };
    const html = signatureHtml(config, FIELDS, STYLE);
    expect(html).toContain('src="https://example.com/logo.png?a=1&amp;b=2"');
    expect(html).toContain('alt="Acme &quot;the&quot; &lt;b&gt;bold&lt;/b&gt; &#39;one&#39;"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).not.toMatch(/<script|<b>/);
  });

  it('shows another image in a preview where the signature loads the hosted logo, and the document and the default never do', () => {
    const local = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    const preview = signatureHtml(CONFIG, FIELDS, STYLE, { logoSrc: local });
    expect(preview).toContain(`<img src="${local}"`);
    expect(preview).not.toContain('https://example.com/email/logo@2x.png');
    expect(signatureHtml(CONFIG, FIELDS, STYLE)).toContain('<img src="https://example.com/email/logo@2x.png"');
    expect(signatureDocument(CONFIG, FIELDS, STYLE)).toContain('https://example.com/email/logo@2x.png');
  });

  it('escapes the preview image too', () => {
    const html = signatureHtml(CONFIG, FIELDS, STYLE, { logoSrc: 'x" onerror="alert(1)&' });
    expect(html).toContain('src="x&quot; onerror=&quot;alert(1)&amp;"');
    expect(html).not.toContain('onerror="alert');
  });

  it('writes the links with the address and the dialable number exactly, and nothing else in them', () => {
    const html = signatureHtml(CONFIG, FIELDS, STYLE);
    expect(html).toContain('href="tel:+442079460000"');
    expect(html).toContain('href="mailto:alex.morgan@acme.com"');
  });
});

describe('fontStack', () => {
  it('keeps the first family, quoting one with a space, and falls back to the mail-safe families alone for a generic one', () => {
    expect(fontStack('"Open Sans", sans-serif')).toBe("'Open Sans', Arial, Helvetica, sans-serif");
    expect(fontStack('system-ui, sans-serif')).toBe('Arial, Helvetica, sans-serif');
    expect(fontStack(undefined)).toBe('Arial, Helvetica, sans-serif');
  });
});

describe('dialable', () => {
  it('keeps a leading plus and the digits', () => {
    expect(dialable(' +359 (2) 123-4567 ')).toBe('+35921234567');
    expect(dialable('020 7946 0000')).toBe('02079460000');
  });
});

describe('fieldProblems', () => {
  it('passes a whole signature', () => {
    expect(fieldProblems(CONFIG, FIELDS)).toEqual({});
  });

  it('asks for every empty field', () => {
    expect(Object.keys(fieldProblems(CONFIG, { name: ' ', position: '', phone: '', email: '' })).sort()).toEqual(['email', 'name', 'phone', 'position']);
  });

  it('refuses an address on another domain, and names the one it accepts', () => {
    expect(fieldProblems(CONFIG, { ...FIELDS, email: 'alex@gmail.com' }).email).toBe('Use your @acme.com address');
    expect(fieldProblems(CONFIG, { ...FIELDS, email: 'alex@sub.acme.com' }).email).toBe('Use your @acme.com address');
  });

  it('refuses an address that would put another recipient or a header in the mailto: link, even on the right domain', () => {
    for (const email of ['x?cc=a%40gmail.com&@acme.com', 'a%40gmail.com,b@acme.com', 'a&bcc=b@acme.com', 'a#b@acme.com', "a'<b@acme.com", 'a b@acme.com']) {
      expect(fieldProblems(CONFIG, { ...FIELDS, email }).email, email).toBe('Enter a full email address, like name@company.com');
    }
  });

  it('accepts the ordinary shapes of a company address', () => {
    for (const email of ['alex@acme.com', 'Alex.Morgan+press@acme.com', "o'brien@acme.com", 'a_b-c@acme.com']) {
      expect(fieldProblems(CONFIG, { ...FIELDS, email }), email).toEqual({});
    }
  });

  it('accepts any domain when none is configured', () => {
    expect(fieldProblems({ ...CONFIG, domains: undefined }, { ...FIELDS, email: 'alex@gmail.com' })).toEqual({});
  });

  it('refuses a phone with letters, or too few or too many digits', () => {
    expect(fieldProblems(CONFIG, { ...FIELDS, phone: 'call me' }).phone).toBeDefined();
    expect(fieldProblems(CONFIG, { ...FIELDS, phone: '+44 12' }).phone).toBeDefined();
    expect(fieldProblems(CONFIG, { ...FIELDS, phone: '+1 2345 6789 0123 4567' }).phone).toBeDefined();
  });
});

describe('the plain text and the file', () => {
  it('lists the fields, the alternative text and the lines, one per line', () => {
    expect(signatureText(CONFIG, FIELDS).split('\n')).toEqual([
      'Alex Morgan',
      'Head of Partnerships',
      '+44 20 7946 0000',
      'alex.morgan@acme.com',
      '',
      'Acme',
      'Acme Ltd · 1 Example Street',
      'This email is confidential.',
    ]);
  });

  it('wraps the signature in a whole document with a charset', () => {
    const file = signatureDocument(CONFIG, FIELDS, STYLE);
    expect(file).toMatch(/^<!doctype html>/);
    expect(file).toContain('<meta charset="utf-8">');
    expect(file).toContain(signatureHtml(CONFIG, FIELDS, STYLE));
  });
});

describe('the emailSignature config', () => {
  const mistakes = (emailSignature: unknown) => resolveConfig({ emailSignature }).problems.map((p) => p.path);

  it('accepts a whole block', () => {
    expect(mistakes(CONFIG)).toEqual([]);
  });

  it('refuses a logo mail apps cannot load, a bad size, a missing alt, a bad domain and an unknown field', () => {
    expect(mistakes({ ...CONFIG, logoUrl: 'http://example.com/logo.png' })).toEqual(['emailSignature.logoUrl']);
    expect(mistakes({ ...CONFIG, logoUrl: 'https://example.com/logo.svg' })).toEqual(['emailSignature.logoUrl']);
    expect(mistakes({ ...CONFIG, logoSize: { width: 150 } })).toEqual(['emailSignature.logoSize']);
    expect(mistakes({ ...CONFIG, logoAlt: '' })).toEqual(['emailSignature.logoAlt']);
    expect(mistakes({ ...CONFIG, domains: ['@acme.com'] })).toEqual(['emailSignature.domains']);
    expect(mistakes({ ...CONFIG, colour: 'blue' })).toEqual(['emailSignature.colour']);
  });

  it('refuses a logo size that is zero, negative or not a whole number, an upper-case domain and a line that is not text', () => {
    for (const logoSize of [
      { width: 0, height: 34 },
      { width: -150, height: 34 },
      { width: 150, height: 1.5 },
      { width: '150', height: 34 },
    ]) {
      expect(mistakes({ ...CONFIG, logoSize }), JSON.stringify(logoSize)).toEqual(['emailSignature.logoSize']);
    }
    expect(mistakes({ ...CONFIG, domains: ['Acme.com'] })).toEqual(['emailSignature.domains']);
    expect(mistakes({ ...CONFIG, lines: ['fine', 5] })).toEqual(['emailSignature.lines']);
  });

  it('leaves a wrong block out of the config', () => {
    expect(resolveConfig({ emailSignature: { logoUrl: 'nope' } }).config.emailSignature).toBeUndefined();
  });
});

describe('blazon check on the directive', () => {
  const doc = (markdown: string) => ({ slug: 'p', filePath: 'p.md', title: 'P', order: 1, meta: {}, markdown, html: '' }) as DocItem;
  const context = (hasEmailSignature: boolean) => ({
    tokens: { items: [], groupMeta: [] },
    assets: { logos: [], icons: [], custom: {}, all: [] },
    hasLogo: false,
    hasEmailSignature,
  });
  const messages = (markdown: string, has: boolean) => directiveFindings([doc(markdown)], context(has)).map((f) => f.message);

  it('passes with an emailSignature block', () => {
    expect(messages('<!-- blazon:email-signature -->', true)).toEqual([]);
  });

  it('needs the block, and takes no arguments', () => {
    expect(messages('<!-- blazon:email-signature -->', false)).toEqual(['<!-- blazon:email-signature -->: needs an email signature (blazon.json → emailSignature)']);
    expect(messages('<!-- blazon:email-signature extra -->', true)).toEqual(['<!-- blazon:email-signature extra -->: takes no arguments']);
  });
});
