import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { svgRefusal } from '../../src/core/init/shared/svg.js';
import { stubNetwork } from '../support/network.js';
import { tempDir } from '../support/project';

// A logo that `init --from` or `--from-dir` reads comes from a site the user does not control. One that holds active or remote content is
// not imported: the decision is made on the parsed tree, never by editing the text, and the placeholder logo stays.

afterEach(() => vi.restoreAllMocks());

const ACTIVE: [string, string, RegExp][] = [
  ['an unquoted event handler', '<svg onload=alert(1) viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>', /not well-formed XML/],
  ['a quoted event handler', '<svg viewBox="0 0 10 10"><path onclick="x()" d="M0 0h10v10z"/></svg>', /event handler attribute onclick/],
  ['a self-closing script', '<svg viewBox="0 0 10 10"><script href="data:,x"/><path d="M0 0h10v10z"/></svg>', /<script>/],
  ['a script with content', '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>', /<script>/],
  ['an entity-encoded javascript: link', '<svg viewBox="0 0 10 10"><a href="java&#115;cript:alert(1)"><path d="M0 0h10v10z"/></a></svg>', /javascript:/],
  ['a tab-split javascript: link', '<svg viewBox="0 0 10 10"><a xlink:href=" java&#x09;script:alert(1)"><path d="M0 0h10v10z"/></a></svg>', /javascript:/],
  [
    'an iframe in a foreignObject',
    '<svg viewBox="0 0 10 10"><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:alert(1)"></iframe></foreignObject></svg>',
    /<foreignObject>/,
  ],
  ['an image from the metadata address', '<svg viewBox="0 0 10 10"><image href="http://169.254.169.254/x" width="10" height="10"/></svg>', /href.*http:\/\/169\.254\.169\.254\/x/],
  ['a data: image', '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AAAA" width="10" height="10"/></svg>', /data:/],
  ['a use of another file', '<svg viewBox="0 0 10 10"><use href="sprite.svg#mark"/></svg>', /href.*sprite\.svg#mark/],
  [
    'a remote url() in a style attribute',
    '<svg viewBox="0 0 10 10"><path style="fill: url( \'https://acme.example/p.svg#g\')" d="M0 0h10v10z"/></svg>',
    /url\(\) .*https:\/\/acme\.example/,
  ],
  ['a remote url() in a fill', '<svg viewBox="0 0 10 10"><path fill="url(https://acme.example/p.svg#g)" d="M0 0h10v10z"/></svg>', /url\(\)/],
  ['an @import in a style element', '<svg viewBox="0 0 10 10"><style>@import "https://acme.example/a.css"; path { fill: red }</style></svg>', /@import/],
  ['a remote url() in a style element', '<svg viewBox="0 0 10 10"><style><![CDATA[ path { fill: url(//acme.example/g) } ]]></style></svg>', /url\(\)/],
  ['an animation of href', '<svg viewBox="0 0 10 10"><a href="#x"><set attributeName="xlink:href" to="#y"/></a></svg>', /<set> that changes href/],
  ['an embed', '<svg viewBox="0 0 10 10"><embed src="#x"/></svg>', /<embed>/],
  ['an object', '<svg viewBox="0 0 10 10"><object data="#x"/></svg>', /<object>/],
  ['a remote stylesheet instruction', '<?xml-stylesheet href="https://acme.example/a.css"?><svg viewBox="0 0 10 10"/>', /xml-stylesheet/],
  ['a DOCTYPE that declares entities', '<!DOCTYPE svg [<!ENTITY x "javascript:alert(1)">]><svg viewBox="0 0 10 10"><a href="&x;"/></svg>', /DOCTYPE/],
  ['malformed XML', '<svg viewBox="0 0 10 10"><g><path d="M0 0h10v10z"></svg>', /not well-formed XML/],
  ['something that is not an SVG', '<html><body/></html>', /not an SVG/],
];

const CLEAN = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 40 10">
<defs><linearGradient id="g"><stop offset="0" stop-color="#635dff"/><stop offset="1" stop-color="#112233"/></linearGradient>
<path id="x" d="M0 0h10v10H0z"/></defs>
<style>.mark { fill: url(#g); }</style>
<use href="#x"/><use xlink:href="#x" x="12"/><rect class="mark" x="24" width="16" height="10" style="fill: url('#g')"/>
</svg>`;

describe('which imported SVG is refused', () => {
  it.each(ACTIVE)('%s', (_what, svg, reason) => {
    expect(svgRefusal(svg)).toMatch(reason);
  });

  it('takes a clean SVG with gradients, a style element and <use href="#x">', () => {
    expect(svgRefusal(CLEAN)).toBeUndefined();
    expect(svgRefusal('<svg viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10z"/></svg>')).toBeUndefined();
  });
});

/** A saved copy of an Acme page whose header logo is `svg`. */
function savedSite(svg: string): string {
  const dir = path.join(tempDir(), 'acme-site');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'site.css'), ':root { --brand-primary: #635dff; }');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<html><head><title>Acme</title><link rel="stylesheet" href="site.css"></head><body><header><a href="./">${svg}</a></header></body></html>`,
  );
  return dir;
}

async function init(dir: string, fromDir: string): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  const code = await runInit(dir, { fromDir, network: stubNetwork({}) });
  vi.restoreAllMocks();
  return { code, out: lines.join('\n') };
}

describe('init --from-dir with an untrusted logo', () => {
  it.each([
    ['onload', '<svg onload=alert(1) viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'],
    ['script', '<svg viewBox="0 0 10 10"><script href="data:,x"/><path d="M0 0h10v10z"/></svg>'],
    ['javascript', '<svg viewBox="0 0 10 10"><a href="java&#115;cript:alert(1)"><path d="M0 0h10v10z"/></a></svg>'],
    ['foreignObject', '<svg viewBox="0 0 10 10"><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>'],
    ['image', '<svg viewBox="0 0 10 10"><image href="http://169.254.169.254/x"/></svg>'],
  ])('keeps the placeholder logo for a logo with %s, says why in one line and records it in extract.json', async (_what, svg) => {
    const dir = path.join(tempDir(), 'acme');
    const { code, out } = await init(dir, savedSite(svg));
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'assets/logos/acme-site.svg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-graphite.svg'))).toBe(true);
    expect(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'blazon.json'), 'utf8')).logo)).not.toMatch(/acme-site/);
    const said = out.split('\n').filter((line) => /logo was not imported/.test(line));
    expect(said).toHaveLength(1);
    const proof = JSON.parse(fs.readFileSync(path.join(dir, 'extract.json'), 'utf8'));
    const logo = proof.values.find((v: { kind: string }) => v.kind === 'logo');
    expect(logo.refused).toMatch(/.+/);
    expect(said[0]).toContain(logo.refused);
  });

  it('imports a clean SVG as before', async () => {
    const dir = path.join(tempDir(), 'acme');
    const { code } = await init(dir, savedSite(CLEAN));
    expect(code).toBe(0);
    const written = fs.readFileSync(path.join(dir, 'assets/logos/acme-site.svg'), 'utf8');
    expect(written).toBe(`${CLEAN}\n`);
    const proof = JSON.parse(fs.readFileSync(path.join(dir, 'extract.json'), 'utf8'));
    expect(proof.values.find((v: { kind: string }) => v.kind === 'logo').refused).toBeUndefined();
  });
});
