import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../../support/spawn';
import { readBrand as readBrandRaw } from '../../../src/shipped/logo-kit/brand.js';
import { fileName, planPieces, type ClearSpacePiece, type InitiativePiece, type PartnershipPiece } from '../../../src/shipped/logo-kit/kit.js';
import { parseOptions } from '../../../src/shipped/logo-kit/options.js';
import { MAX_SIDE } from '../../../src/shipped/logo-kit/render.js';
import { MANIFEST, NAME } from '../../../src/shipped/logo-kit/request.js';
import { clearSpaceSvg, initiativeSvg, inkOf, partnershipSvg } from '../../../src/shipped/logo-kit/svg.js';
import { ROOT_DIR } from '../support/spec.js';
import { tempDir } from '../../support/project';

// A brand.json always carries its format and version (RFC 0001); a fixture that is only a piece of one gets them here
const readBrand = (brand: object) => readBrandRaw({ format: 'blazon-brand', version: 1, ...brand });

// blazon.logo-kit, the plugin blazon ships to draw the files a brand's logo rules describe: a lockup for a logo and each partner, and a sheet
// that shows the clear space. Seams: the pure parts (options, what to draw, the SVG), and the entry, run as blazon runs it.

const ENTRY = path.join(ROOT_DIR, 'src/shipped/logo-kit/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');
if (!CHROME) {
  if (process.env.BLAZON_REQUIRE_CHROME) throw new Error('BLAZON_REQUIRE_CHROME is set, and there is no Chrome to draw with');
  console.warn('logo-kit plugin test: PNG tests skipped, no Chrome to draw with (set BLAZON_CHROME)');
}

const px = (value: number) => ({ value, unit: 'px' as const });
const svgFile = (width: number, height: number, fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`;
const MARK_META = { background: 'light', unit: px(12), clearSpace: { units: 1 }, partnership: { gap: { units: 1 }, dividerHeight: px(40) } };

const asset = (id: string, extra: object = {}) => ({ id, name: id.split('/')[1], category: id.split('/')[0], file: `brand-assets/${id}.svg`, format: 'svg', width: 100, height: 40, ...extra });

/** A built site that is only the files the kit reads, and the brand.json that describes it. */
const world = (over: { assets?: object[]; files?: Record<string, string> } = {}) => {
  const siteDir = tempDir('blazon-logo-kit-site-');
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
    fs.writeFileSync(path.join(siteDir, file), text);
  };
  write('index.html', '<html></html>');
  write('brand-assets/logos/mark.svg', svgFile(100, 40, '#1E1F21'));
  write('brand-assets/partners/acme.svg', svgFile(50, 20, '#FF5A1F'));
  for (const [file, text] of Object.entries(over.files ?? {})) write(file, text);
  const brand = { format: 'blazon-brand', version: 1, assets: [asset('logos/mark', { meta: MARK_META }), asset('partners/acme', { width: 50, height: 20 }), ...(over.assets ?? [])] };
  return { siteDir, brand };
};

const pieces = (assets: object[], options = {}) => planPieces(readBrand({ assets }), { formats: ['svg', 'png'], scale: 1, ...options });

describe('experimental categories', () => {
  it('draws pieces for the logos and partners categories only, so an experimental category is never in the kit', () => {
    const sketch = asset('experiments/sketch', { meta: MARK_META });
    const { pieces: planned } = pieces([asset('logos/mark', { meta: MARK_META }), sketch]);
    expect(JSON.stringify(planned)).not.toContain('experiments/');
    expect(JSON.stringify(planned)).toContain('logos/mark');
  });
});

describe('options', () => {
  const known = new Set(['logos/mark', 'partners/acme']);

  it('has defaults: both formats, one scale, every logo and partner', () => {
    expect(parseOptions({}, known)).toEqual({ options: { formats: ['svg', 'png'], scale: 1 }, findings: [] });
  });

  it('reports an unknown key, an asset that is not there, a wrong format list and a wrong scale, as findings, and keeps the rest', () => {
    const { options, findings } = parseOptions({ bogus: 1, logos: ['logos/mark', 'logos/nope'], partners: 'acme', formats: ['gif'], scale: 3 }, known);
    expect(findings.map((f) => f.code)).toEqual(Array(5).fill(`${NAME}/option-invalid`));
    expect(findings.map((f) => f.message).join('\n')).toMatch(/unknown option "bogus"[^]*"logos\/nope"[^]*partners must be a list[^]*formats must be[^]*scale must be 1 or 2/);
    expect(options).toEqual({ logos: ['logos/mark'], formats: ['svg', 'png'], scale: 1 });
  });

  it('takes formats and scale when they are right', () => {
    expect(parseOptions({ formats: ['svg', 'svg'], scale: 2 }, known).options).toEqual({ formats: ['svg'], scale: 2 });
  });

  it('answers a request whose options are not an object with one finding', () => {
    expect(parseOptions([], known).findings).toHaveLength(1);
  });
});

describe('what the kit draws', () => {
  it('draws a lockup for each logo with a partnership and each partner, and a sheet for each logo with a clear space', () => {
    const { pieces: drawn, findings } = pieces(world().brand.assets);
    expect(findings).toEqual([]);
    expect(drawn.map((p) => p.stem)).toEqual(['partnership-logos-mark--partners-acme', 'clear-space-logos-mark']);
    const lockup = drawn[0] as PartnershipPiece;
    expect([lockup.layout.width, lockup.layout.height]).toEqual([225, 40]);
    expect((drawn[1] as ClearSpacePiece).space).toBe(12);
  });

  it('skips a logo with no rule quietly when the logos were not named, and says so when they were', () => {
    const bare = asset('logos/bare');
    expect(pieces([...world().brand.assets, bare]).findings).toEqual([]);
    const named = pieces([...world().brand.assets, bare], { logos: ['logos/bare'] });
    expect(named.findings.map((f) => f.code)).toEqual([`${NAME}/no-partnership-rule`, `${NAME}/no-clear-space`, `${NAME}/nothing-to-draw`]);
  });

  it('says so when a file does not give its size, and when there is nothing to draw', () => {
    const nosize = { ...asset('logos/mark', { meta: MARK_META }), width: undefined, height: undefined };
    const { pieces: drawn, findings } = pieces([nosize, asset('partners/acme')]);
    expect(drawn).toEqual([]);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/no-size`, `${NAME}/nothing-to-draw`]);
  });

  it('names a file with nothing but letters, digits, dots, hyphens and underscores, so it cannot leave out_dir', () => {
    expect(fileName('logos/mark')).toBe('logos-mark');
    expect(fileName('../../etc/passwd')).toBe('etc-passwd');
    expect(fileName('a b/c?d"e')).toBe('a-b-c-d-e');
    expect(fileName('///')).toBe('asset');
  });
});

describe('the SVG', () => {
  const [lockup, sheet] = pieces(world().brand.assets).pieces as [PartnershipPiece, ClearSpacePiece];

  it('lays a lockup out as the brand book does: logo, divider, partner on one baseline, and nothing else', () => {
    const svg = partnershipSvg(lockup, { logo: 'data:image/svg+xml;base64,AAA', partner: 'data:image/svg+xml;base64,BBB' });
    expect(svg).toContain('viewBox="0 0 225 40"');
    expect(svg.match(/<image /g)).toHaveLength(2);
    expect(svg).toContain('<image href="data:image/svg+xml;base64,AAA" x="0" y="0" width="100" height="40"/>');
    expect(svg).toContain('<image href="data:image/svg+xml;base64,BBB" x="125" y="0" width="100" height="40"/>');
    expect(svg).toContain('<line x1="112.5" x2="112.5" y1="0" y2="40" stroke="#000000" stroke-width="1"/>');
    expect(svg).not.toMatch(/<script|<style|<text|onload/i);
  });

  it('draws the divider in the logo\'s ink when the sidecar gives a color, and white for a logo made for a dark surface', () => {
    expect(inkOf({ logo: { meta: { ink: '#FF5A1F', background: 'light' } } })).toBe('#FF5A1F');
    expect(inkOf({ logo: { meta: { background: 'dark' } } })).toBe('#FFFFFF');
    expect(inkOf({ logo: { meta: { ink: 'url(javascript:alert(1))' } } })).toBe('#000000');
  });

  it('escapes what it prints', () => {
    const odd = { ...lockup, logo: { ...lockup.logo, id: 'logos/"><x' }, partner: { ...lockup.partner, id: 'partners/a&b' } };
    const svg = partnershipSvg(odd, { logo: 'data:,x', partner: 'data:,y' });
    expect(svg).toContain('aria-label="logos/&quot;&gt;&lt;x and partners/a&amp;b"');
  });

  it('draws the clear space as a band around the logo, on the surface it is made for', () => {
    const svg = clearSpaceSvg(sheet, 'data:image/svg+xml;base64,AAA');
    expect(svg).toContain('viewBox="0 0 124 64"');
    expect(svg).toContain('<rect width="124" height="64" fill="#FFFFFF"/>');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('<image href="data:image/svg+xml;base64,AAA" x="12" y="12" width="100" height="40"/>');
    const dark = clearSpaceSvg({ ...sheet, logo: { ...sheet.logo, meta: { ...sheet.logo.meta, background: 'dark' } } }, 'data:,x');
    expect(dark).toContain('fill="#000000"');
  });
});

interface Ran {
  status: number | null;
  out: string;
  err: string;
}
const plugin = (input: string, env: Record<string, string> = {}, args: string[] = []): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const run = (w: ReturnType<typeof world>, options: object, env: Record<string, string> = {}) => {
  const outDir = tempDir('blazon-logo-kit-out-');
  const ran = plugin(JSON.stringify({ v: 1, type: 'build', options, brand: w.brand, site_dir: w.siteDir, out_dir: outDir }), env);
  return { ran, outDir, findings: ran.status === 0 ? (JSON.parse(ran.out).findings as { code: string; severity: string; path: string; message: string }[]) : [] };
};
const png = (file: string) => {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
};

describe('the entry, as blazon starts it', () => {
  it('prints its manifest', () => {
    const ran = plugin('', {}, ['--blazon-manifest']);
    expect(ran.status, ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual(MANIFEST);
  });

  it('writes the SVG files without a browser when only svg is asked for', () => {
    const { ran, outDir, findings } = run(world(), { formats: ['svg'] }, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings).toEqual([]);
    expect(fs.readdirSync(outDir).sort()).toEqual(['clear-space-logos-mark.svg', 'partnership-logos-mark--partners-acme.svg']);
    const lockup = fs.readFileSync(path.join(outDir, 'partnership-logos-mark--partners-acme.svg'), 'utf-8');
    expect(lockup).toMatch(/<image href="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" x="0"/);
  });

  it('answers a wrong option with a finding and exit 0, and draws the rest', () => {
    const { ran, outDir, findings } = run(world(), { formats: ['svg'], scale: 7 });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/option-invalid`]);
    expect(fs.readdirSync(outDir)).toHaveLength(2);
  });

  it('reports a file that is not in the site, and does not read a path that leaves it', () => {
    const w = world({ assets: [asset('logos/gone', { file: 'brand-assets/logos/gone.svg', meta: MARK_META }), asset('logos/out', { file: '../../../../etc/hosts', meta: MARK_META })] });
    const { ran, outDir, findings } = run(w, { formats: ['svg'] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings.filter((f) => f.code === `${NAME}/file-missing`).map((f) => f.path).sort()).toEqual(['logos/gone', 'logos/out']);
    expect(fs.readdirSync(outDir).sort()).toEqual(['clear-space-logos-mark.svg', 'partnership-logos-mark--partners-acme.svg']);
  });

  it('exits 2 with the install hint when a PNG is asked for and BLAZON_CHROME names no program, and writes nothing', () => {
    const { ran, outDir } = run(world(), {}, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status).toBe(2);
    expect(ran.out).toMatch(/^no browser to draw the kit with: BLAZON_CHROME names \/nonexistent\/chrome, which is not a program/);
    expect(fs.readdirSync(outDir)).toEqual([]);
  });
});

describe.skipIf(!CHROME)('the PNG files, in a real browser', () => {
  const browser = { BLAZON_CHROME: CHROME };

  it('draws each piece at its own size, and at twice that with scale 2, on a see-through background', () => {
    const { ran, outDir } = run(world(), { scale: 2 }, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort()).toEqual([
      'clear-space-logos-mark.png',
      'clear-space-logos-mark@2x.png',
      'partnership-logos-mark--partners-acme.png',
      'partnership-logos-mark--partners-acme@2x.png',
    ]);
    expect(png(path.join(outDir, 'partnership-logos-mark--partners-acme.png'))).toEqual({ width: 225, height: 40, colorType: 6 });
    expect(png(path.join(outDir, 'partnership-logos-mark--partners-acme@2x.png'))).toMatchObject({ width: 450, height: 80 });
    expect(png(path.join(outDir, 'clear-space-logos-mark.png'))).toMatchObject({ width: 124, height: 64 });
  }, 120_000);

  it('draws the program lockup as a PNG of the size its plan says, and at twice that with scale 2', () => {
    const lab = asset('initiatives/lab', { width: 60, height: 20 });
    const program = asset('logos/program', { meta: { unit: px(12), initiative: { name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 } } } });
    const w = world({ assets: [program, lab], files: { 'brand-assets/logos/program.svg': svgFile(100, 40, '#123456'), 'brand-assets/initiatives/lab.svg': svgFile(60, 20, '#654321') } });
    const [planned] = planPieces(readBrand(w.brand), { logos: ['logos/program'], formats: ['png'], scale: 1 }).pieces as [InitiativePiece];
    expect([planned.layout.width, planned.layout.height]).toEqual([244, 40]);
    const { ran, outDir } = run(w, { logos: ['logos/program'], formats: ['png'], scale: 2 }, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(fs.readdirSync(outDir).sort()).toEqual(['initiative-logos-program--initiatives-lab.png', 'initiative-logos-program--initiatives-lab@2x.png']);
    expect(png(path.join(outDir, 'initiative-logos-program--initiatives-lab.png'))).toEqual({ width: 244, height: 40, colorType: 6 });
    expect(png(path.join(outDir, 'initiative-logos-program--initiatives-lab@2x.png'))).toMatchObject({ width: 488, height: 80 });
  }, 120_000);

  it('draws a huge artwork smaller instead of asking the browser for a canvas that size', () => {
    const w = world({ files: { 'brand-assets/logos/huge.svg': svgFile(20000, 8000, '#123456') }, assets: [asset('logos/huge', { width: 20000, height: 8000, meta: { background: 'light', clearSpace: px(10) } })] });
    const { ran, outDir } = run(w, { logos: ['logos/huge'], formats: ['png'] }, browser);
    expect(ran.status, ran.out + ran.err).toBe(0);
    const size = png(path.join(outDir, 'clear-space-logos-huge.png'));
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_SIDE);
    expect(size.width / size.height).toBeCloseTo(20020 / 8020, 1);
  }, 120_000);

  it('writes the same bytes for the same request', () => {
    const w = world();
    const [a, b] = [run(w, {}, browser), run(w, {}, browser)];
    expect(a.ran.status, a.ran.out + a.ran.err).toBe(0);
    for (const file of fs.readdirSync(a.outDir)) expect(fs.readFileSync(path.join(b.outDir, file)).equals(fs.readFileSync(path.join(a.outDir, file))), file).toBe(true);
  }, 180_000);
});

describe('the program lockup', () => {
  const INITIATIVE = { name: 'Open Banking Lab', mark: 'initiatives/lab', gap: { units: 2 } };
  const lab = asset('initiatives/lab', { width: 60, height: 20 });
  const program = (rule: object = INITIATIVE) => asset('logos/program', { meta: { unit: px(12), initiative: rule } });

  it('draws a lockup for a logo that states an initiative, beside it by default, and no sheet or partnership it did not ask for', () => {
    const { pieces: drawn, findings } = pieces([program(), lab]);
    expect(findings).toEqual([]);
    expect(drawn.map((p) => p.stem)).toEqual(['initiative-logos-program--initiatives-lab']);
    const piece = drawn[0] as InitiativePiece;
    expect(piece.name).toBe('Open Banking Lab');
    // 100 + 24 + 120 wide, 40 high
    expect([piece.layout.width, piece.layout.height]).toEqual([244, 40]);
  });

  it('draws the mark under the logo when the rule says below', () => {
    const [piece] = pieces([program({ ...INITIATIVE, position: 'below' }), lab]).pieces as [InitiativePiece];
    expect([piece.layout.width, piece.layout.height]).toEqual([120, 104]);
    expect(piece.layout.mark).toEqual({ x: 0, y: 64, width: 120, height: 40 });
  });

  it('draws it alongside a partnership and a clear space for the same logo', () => {
    const both = asset('logos/mark', { meta: { ...MARK_META, initiative: INITIATIVE } });
    const { pieces: drawn } = pieces([both, asset('partners/acme', { width: 50, height: 20 }), lab]);
    expect(drawn.map((p) => p.kind)).toEqual(['partnership', 'initiative', 'clear-space']);
  });

  it('says so when the mark is not an asset of the brand, or has no size, and draws nothing for it', () => {
    const missing = pieces([program()]);
    expect(missing.pieces).toEqual([]);
    expect(missing.findings.map((f) => f.code)).toEqual([`${NAME}/initiative-mark-missing`, `${NAME}/nothing-to-draw`]);
    const nosize = pieces([program(), { ...lab, width: undefined, height: undefined }]);
    expect(nosize.findings.map((f) => f.code)).toEqual([`${NAME}/no-size`, `${NAME}/nothing-to-draw`]);
  });

  it('draws a logo with no initiative as before', () => {
    expect(pieces(world().brand.assets).pieces.map((p) => p.kind)).toEqual(['partnership', 'clear-space']);
  });

  it('lays the SVG out as the brand book does: logo and mark, nothing else, the name escaped', () => {
    const [piece] = pieces([program({ ...INITIATIVE, name: 'A&B "Lab"' }), lab]).pieces as [InitiativePiece];
    const svg = initiativeSvg(piece, { logo: 'data:image/svg+xml;base64,AAA', mark: 'data:image/svg+xml;base64,BBB' });
    expect(svg).toContain('viewBox="0 0 244 40"');
    expect(svg).toContain('<image href="data:image/svg+xml;base64,AAA" x="0" y="0" width="100" height="40"/>');
    expect(svg).toContain('<image href="data:image/svg+xml;base64,BBB" x="124" y="0" width="120" height="40"/>');
    expect(svg).toContain('aria-label="logos/program, A&amp;B &quot;Lab&quot;"');
    expect(svg.match(/<image /g)).toHaveLength(2);
    expect(svg).not.toMatch(/<script|<style|<text|<line|onload/i);
  });

  it('writes the SVG from the entry', () => {
    const w = world({ assets: [program(), lab], files: { 'brand-assets/logos/program.svg': svgFile(100, 40, '#123456'), 'brand-assets/initiatives/lab.svg': svgFile(60, 20, '#654321') } });
    const { ran, outDir, findings } = run(w, { formats: ['svg'], logos: ['logos/program'] });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/no-partnership-rule`, `${NAME}/no-clear-space`]);
    expect(fs.readdirSync(outDir)).toEqual(['initiative-logos-program--initiatives-lab.svg']);
    const svg = fs.readFileSync(path.join(outDir, 'initiative-logos-program--initiatives-lab.svg'), 'utf-8');
    expect(svg).toMatch(/<image href="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" x="124"/);
  });
});
