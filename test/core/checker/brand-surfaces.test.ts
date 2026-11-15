import { describe, it, expect } from 'vitest';
import { logoSurfaceFindings, paintedColors } from '../../../src/core/checker/logo-surfaces.js';
import { pageTokenFindings } from '../../../src/core/checker/page-tokens.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { writeProject } from '../../support/helpers.js';
import type { DocItem, TokenItem } from '../../../src/types/index.js';

// Two checks that came from reading finished brand books rather than their files: a logo whose own color is the color of a surface the book
// shows it on, and a page that talks about tokens and places none.

const svg = (fills: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${fills.map((f) => `<rect width="1" height="1" fill="${f}"/>`).join('')}</svg>`;
const uri = (text: string) => `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}`;

describe('the colors a logo paints', () => {
  it('reads fills and strokes from an SVG data URI, as written, once each', () => {
    expect(paintedColors(uri(svg(['#FF5A1F', '#1e1f21', '#FF5A1F'])))).toEqual(['#FF5A1F', '#1e1f21']);
    expect(paintedColors(`data:image/svg+xml,${encodeURIComponent('<svg><path style="fill:#abc;stroke:rgb(1,2,3)"/></svg>')}`)).toEqual(['#abc', 'rgb(1,2,3)']);
  });
  it('reads a named color as written, and not the words that paint nothing or something else', () => {
    expect(paintedColors(uri(svg(['white', 'Black', 'rebeccapurple'])))).toEqual(['white', 'Black', 'rebeccapurple']);
    expect(paintedColors(uri(svg(['none', 'transparent', 'currentColor', 'inherit', 'url(#gradient)'])))).toEqual([]);
    expect(paintedColors(`data:image/svg+xml,${encodeURIComponent('<svg><path style="fill:white;stroke:navy;fill-rule:evenodd;stroke-width:2"/></svg>')}`)).toEqual([
      'white',
      'navy',
    ]);
  });
  it('reads none from a raster, or from something that is not an image', () => {
    expect(paintedColors('data:image/png;base64,AAAA')).toEqual([]);
    expect(paintedColors('not a data uri')).toEqual([]);
  });
});

describe('logo-invisible', () => {
  const orange = '#FF5A1F';
  const logo = { onLight: uri(svg(['#1E1F21', orange])), onDark: uri(svg(['#F2F0EB', orange])) };
  const theme = { background: '#F2F0EB', inverse: '#1E1F21', accent: orange, accentText: '#1E1F21' };

  it('names a part of the logo that is the color of the surface it is shown on', () => {
    const found = logoSurfaceFindings(logo, theme, {}, []);
    expect(found).toHaveLength(1);
    // Graphite text on the accent means the light-surface logo is the one shown there
    expect(found[0]).toMatchObject({ code: 'logo-invisible', severity: 'warning', path: 'logo.onLight' });
    expect(found[0]!.message).toMatch(/light-surface logo draws #FF5A1F[^]*accent color \(#FF5A1F\)[^]*1\.0:1/);
  });

  it.each([['white'], ['#ffffff'], ['#fff'], ['WHITE'], ['rgb(255, 255, 255)']])('names white artwork on a white background however the white is written: %s', (fill) => {
    const found = logoSurfaceFindings({ onLight: uri(svg([fill])), onDark: uri(svg(['#F2F0EB'])) }, { background: '#ffffff' }, {}, []);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'logo-invisible', path: 'logo.onLight' });
  });

  it('is silent for artwork that paints nothing, or paints from a gradient', () => {
    expect(
      logoSurfaceFindings({ onLight: uri(svg(['none', 'transparent', 'url(#a)'])), onDark: uri(svg(['none'])) }, { background: '#ffffff', inverse: '#000000' }, {}, []),
    ).toEqual([]);
  });

  it('uses the dark-surface logo on an accent whose text is light', () => {
    const [found] = logoSurfaceFindings(logo, { ...theme, accentText: '#FFFFFF' }, {}, []);
    expect(found).toMatchObject({ path: 'logo.onDark' });
  });

  it('is silent for a logo whose colors differ from every surface, and for no logo, and for a role the brand does not map', () => {
    expect(logoSurfaceFindings({ onLight: uri(svg(['#1E1F21'])), onDark: uri(svg(['#F2F0EB'])) }, theme, {}, [])).toEqual([]);
    expect(logoSurfaceFindings(undefined, theme, {}, [])).toEqual([]);
    expect(logoSurfaceFindings(logo, { background: '#F2F0EB' }, {}, [])).toEqual([]);
  });

  it('is silent where the brand has forbidden the logo on that surface', () => {
    const accent = { path: 'interactive.primary', aliasOf: undefined, blazon: { logo: { deny: ['onLight'], reason: 'the fold vanishes' } } } as unknown as TokenItem;
    expect(logoSurfaceFindings(logo, theme, { accent: 'interactive.primary' }, [accent])).toEqual([]);
  });

  it('judges each surface by its darkness: a dark background gets the dark-surface logo, a light inverse the light-surface one', () => {
    // A dark theme: Graphite page with Bone text, a Bone inverse band with Graphite text
    const dark = { background: '#1E1F21', text: '#F2F0EB', inverse: '#F2F0EB', inverseText: '#1E1F21' };
    expect(logoSurfaceFindings(logo, dark, {}, [])).toEqual([]);
    // The same surfaces judged the light theme's way would hide each logo: Graphite artwork on the Graphite page
    const graphiteOnly = { onLight: uri(svg(['#1E1F21'])), onDark: uri(svg(['#1E1F21'])) };
    const found = logoSurfaceFindings(graphiteOnly, dark, {}, []);
    expect(found.map((f) => f.path)).toEqual(['logo.onDark']);
    expect(found[0]!.message).toMatch(/dark-surface logo draws #1E1F21[^]*the background \(#1E1F21\)/);
  });

  it('does not take a color that merely resembles the surface for it: only about the same color is not there', () => {
    expect(logoSurfaceFindings({ onLight: uri(svg(['#BDBAB3'])), onDark: logo.onDark }, { ...theme, accent: '#00AA00' }, {}, [])).toEqual([]);
  });
});

describe('tokens-not-shown', () => {
  const token = (path: string, value: string) => ({ path, type: 'color', value }) as unknown as TokenItem;
  const items = [
    token('color.a', '#111111'),
    token('color.b', '#222222'),
    token('color.c', '#333333'),
    token('color.d', '#444444'),
    token('color.e', '#555555'),
    token('color.f', '#666666'),
  ];
  const page = (markdown: string): DocItem => ({ filePath: '03-color.md', markdown }) as unknown as DocItem;
  const five = '`color.a` `color.b` `color.c` `color.d` `color.e`';

  it('notes a page that names five tokens and places none, and names the first four', () => {
    const [found] = pageTokenFindings([page(`Use ${five}.`)], items);
    expect(found).toMatchObject({ code: 'tokens-not-shown', severity: 'info', path: '03-color.md' });
    expect(found!.message).toContain('names 5 tokens in its text (color.a, color.b, color.c, color.d, ...)');
  });

  it('counts a color value that is a token as naming it', () => {
    expect(pageTokenFindings([page('#111111 #222222 #333333 #444444 #555555 #111111')], items)).toHaveLength(1);
    expect(pageTokenFindings([page('#111111 #222222 #333333 #444444')], items)).toEqual([]);
  });

  it('is silent for a page that places any token, shows pictures, names fewer than five, or only has them in a code block', () => {
    expect(pageTokenFindings([page(`${five}\n\n<!-- blazon:tokens color.a -->`)], items)).toEqual([]);
    expect(pageTokenFindings([page(`${five}\n\n<!-- blazon:assets logos -->`)], items)).toEqual([]);
    expect(pageTokenFindings([page('`color.a` `color.b` `color.c` `color.d`')], items)).toEqual([]);
    expect(pageTokenFindings([page(`\`\`\`\n${five}\n\`\`\``)], items)).toEqual([]);
  });

  it.each(['cards color.a', 'strokes color.a', 'spots color.a', 'logo-on color.a', 'formats social', 'patterns pattern'])(
    'is silent for a page with a %s directive, which places tokens too',
    (directive) => {
      expect(pageTokenFindings([page(`${five}\n\n<!-- blazon:${directive} -->`)], items)).toEqual([]);
    },
  );

  it('ignores a span that is not a token path', () => {
    expect(pageTokenFindings([page('`a.b` `c.d` `e.f` `g.h` `i.j`')], items)).toEqual([]);
  });
});

describe('both, through a compile', () => {
  const files = (extra: object = {}) => {
    const tokens = {
      color: { $type: 'color', base: { $value: '#F2F0EB' }, ink: { $value: '#1E1F21' }, signal: { $value: '#FF5A1F' }, line: { $value: '#54585D' }, hazard: { $value: '#F2C230' } },
      surface: { $type: 'color', page: { $value: '{color.base}' }, inverse: { $value: '{color.ink}' } },
      interactive: { $type: 'color', ...extra, primary: { $value: '{color.signal}' } },
    };
    return writeProject({
      'tokens/colors.json': tokens,
      'assets/logos/mark.svg': svg(['#1E1F21', '#FF5A1F']),
      'docs/01-color.md': 'Use `color.base`, `color.ink`, `color.signal`, `color.line` and `color.hazard`.\n',
    });
  };
  const config = {
    ...DEFAULT_CONFIG,
    logo: { onLight: './assets/logos/mark.svg' },
    theme: { background: 'surface.page', accent: 'interactive.primary', accentText: 'color.ink' },
  } as typeof DEFAULT_CONFIG;
  const codes = async (root: string) =>
    (await compileBlazonData(config, root)).findings
      .map((f) => f.code)
      .filter((c) => ['logo-invisible', 'tokens-not-shown'].includes(c))
      .sort();

  it('reports both, and a forbidden surface silences the logo one', async () => {
    expect(await codes(files())).toEqual(['logo-invisible', 'tokens-not-shown']);
    const rule = { $extensions: { 'dev.blazon': { logo: { deny: ['onLight'], reason: 'the mark is orange' } } } };
    expect(await codes(files(rule))).toEqual(['tokens-not-shown']);
  });
});

describe('logo-invisible in a context', () => {
  // The default theme is light, and the dark context makes the page dark and the inverse Bone
  const project = ({ onDark, lightInverse = '#1E1F21', darkBackground = '#1E1F21' }: { onDark: string; lightInverse?: string; darkBackground?: string }) =>
    writeProject({
      'tokens/colors.json': {
        color: { $type: 'color', bone: { $value: '#F2F0EB' }, graphite: { $value: '#1E1F21' }, band: { $value: lightInverse }, page: { $value: darkBackground } },
        text: { $type: 'color', primary: { $value: '{color.graphite}' }, inverse: { $value: '{color.bone}' } },
        surface: { $type: 'color', background: { $value: '{color.bone}' }, inverse: { $value: '{color.band}' } },
      },
      'tokens/theme/dark.json': {
        text: { primary: { $value: '{color.bone}' }, inverse: { $value: '{color.graphite}' } },
        surface: { background: { $value: '{color.page}' }, inverse: { $value: '{color.bone}' } },
      },
      'blazon.resolver.json': {
        version: '2025.10',
        sets: { base: { sources: [{ $ref: 'tokens/colors.json' }] } },
        modifiers: { theme: { contexts: { light: [], dark: [{ $ref: 'tokens/theme/dark.json' }] }, default: 'light' } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      },
      'assets/logos/graphite.svg': svg(['#1E1F21']),
      'assets/logos/other.svg': svg([onDark]),
      'docs/01-logo.md': '# Logo\n',
    });
  const config = {
    ...DEFAULT_CONFIG,
    logo: { onLight: './assets/logos/graphite.svg', onDark: './assets/logos/other.svg' },
    theme: { background: 'surface.background', text: 'text.primary', inverse: 'surface.inverse', inverseText: 'text.inverse' },
  } as typeof DEFAULT_CONFIG;
  const invisible = async (root: string) =>
    (await compileBlazonData(config, root)).findings.filter((f) => f.code === 'logo-invisible').map((f) => [f.path, f.context ?? 'default']);

  it('judges the light-surface logo on the Bone inverse and the dark-surface logo on the dark page, so a Bone logo passes in both', async () => {
    expect(await invisible(project({ onDark: '#F2F0EB' }))).toEqual([]);
  });

  it('reports each surface that hides a logo: the light inverse in the default, the dark page in the dark context', async () => {
    expect(await invisible(project({ onDark: '#1E1F21' }))).toEqual([
      ['logo.onDark', 'default'],
      ['logo.onDark', 'theme=dark'],
    ]);
  });

  it('tags a finding that only the dark context has with the context', async () => {
    // Black reads on a blue inverse band in light, and is the color of the black page in dark
    expect(await invisible(project({ onDark: '#000000', lightInverse: '#0033AA', darkBackground: '#000000' }))).toEqual([['logo.onDark', 'theme=dark']]);
  });
});
