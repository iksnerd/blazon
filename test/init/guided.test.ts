import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { PLAIN } from '../../src/cli/init-ui.js';
import { CANCEL, scriptedPrompter } from '../../src/core/init/prompts.js';
import { tempDir } from '../support/project';

// The guided start, answered by a scripted prompter: no terminal. The website answer reads a local server.

const PAGE = '<html><head><title>Acme Corp | Payments</title><meta name="description" content="Payments for all."><link rel="stylesheet" href="/s.css"></head><body></body></html>';
const SHEET = ':root { --brand-primary: #635DFF; --brand-accent: #00c67d; } body { font-family: "Inter", sans-serif; }';
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') return void res.setHeader('content-type', 'text/html').end(PAGE);
    if (req.url === '/s.css') return void res.setHeader('content-type', 'text/css').end(SHEET);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const text = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const json = (dir: string, file: string) => JSON.parse(text(dir, file));
const project = () => path.join(tempDir(), 'acme-brand');
const SVG = '<svg viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10z"/></svg>';
const logoFile = (name = 'my logo.svg') => {
  const file = path.join(tempDir(), name);
  fs.writeFileSync(file, SVG);
  return file;
};
const run = (dir: string, answers: unknown[], extra = {}) => {
  const prompter = scriptedPrompter(answers);
  return runInit(dir, { prompter, tty: true, look: PLAIN, ...extra }).then((code) => ({ code, p: prompter }));
};

describe('a failure while writing the answers', () => {
  it('ends the spinner as failed and lets the error through', async () => {
    quiet();
    const real = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(file).endsWith('colors.json')) throw new Error('disk full');
      return (real as (...a: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync);
    const prompter = scriptedPrompter(['', '', 'manual', '#ff0066', '', '', false]);
    await expect(runInit(project(), { prompter, tty: true, look: PLAIN })).rejects.toThrow('disk full');
    const out = prompter.output.join('\n');
    expect(out).toContain('spinner: Writing the brand book');
    expect(out).toContain('spinner failed: Could not write the brand book');
    expect(out).not.toContain('spinner done: Wrote the brand book');
  });
});

describe('the manual path', () => {
  it('asks name, source, color, font, logo, then offers the dev server, in four numbered steps', async () => {
    quiet();
    const dir = project();
    const { code, p } = await run(dir, ['Acme Payments', 'Payments for teams that move money every day.', 'manual', '#ff0066', 'Inter', logoFile(), false]);
    expect(code).toBe(0);
    expect(p.asked.map((a) => a.kind)).toEqual(['text', 'text', 'select', 'text', 'text', 'text', 'confirm']);
    const out = p.output.join('\n');
    for (const step of ['1 of 4  Brand', '2 of 4  Colors', '3 of 4  Type', '4 of 4  Logo']) expect(out).toContain(step);
    // a reason sits on the line under each question
    expect(p.asked[3]!.message).toBe('Primary color');
    expect(out).toContain('message: Hex, for example #2563eb');
    expect(out).toMatch(/AA for text on white: (yes|no) \(\d+\.\d:1/);
    expect(out).toContain('Inter is on Google Fonts');
    expect(out).toContain('currentColor');
    const config = text(dir, 'blazon.config.ts');
    expect(config).toContain('title: "Acme Payments"');
    expect(config).toContain('description: "Payments for teams that move money every day."');
    expect(config).toContain('logo: "./assets/logos/my-logo.svg"');
    expect(config).toContain('fonts: ["https://fonts.googleapis.com/css2?family=Inter');
    expect(config).toContain("{ family: 'IBM Plex Mono', file: 'fonts/IBMPlexMono-Regular-latin.woff2'"); // --font sets display and body, so the mono file stays
    expect(config).not.toContain('Big+Shoulders');
    const colors = json(dir, 'tokens/colors.json');
    // the brand's color is the signal color, and interactive.primary uses it
    expect(colors.color.signal.primary.$value).toBe('#ff0066');
    expect(colors.color.signal.orange).toBeUndefined();
    expect(colors.interactive.primary.$value).toBe('{color.signal.primary}');
    const type = json(dir, 'tokens/typography.json');
    expect(type.font.family.display.$value).toEqual(['Inter', 'sans-serif']);
    expect(type.font.family.body.$value).toEqual(['Inter', 'sans-serif']);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-graphite.svg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-bone.svg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-mark.svg'))).toBe(false);
    expect(out).toMatch(/note What was written:[\s\S]*Set name "Acme Payments"[\s\S]*Set primary color #ff0066/);
    expect(out).toMatch(/note Next steps: 1\. Run blazon dev/);
    expect(out).toContain('outro: Done');
  });

  it("keeps blazon's brand on Enter at every question", async () => {
    quiet();
    const dir = project();
    const { code, p } = await run(dir, ['', '', 'manual', '', '', '', false]);
    expect(code).toBe(0);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Acme Brand Book"');
    expect(json(dir, 'tokens/colors.json').color.signal.orange.$value).toBe('#FF5A1F');
    expect(fs.existsSync(path.join(dir, 'assets/logos/blazon-graphite.svg'))).toBe(true);
    expect(p.output.join('\n')).not.toContain('Set ');
  });

  it('refuses a bad hex with the validator message and takes the next try', async () => {
    quiet();
    const dir = project();
    const { p } = await run(dir, ['', '', 'manual', 'blue', '0af', '', '', false]);
    expect(p.rejected).toEqual(['Give the color as hex, for example #2563eb or #26e.']);
    expect(json(dir, 'tokens/colors.json').color.signal.primary.$value).toBe('#00aaff');
  });

  it('sets the signal color that interactive.primary points at, and gives it bone labels when graphite fails AA', async () => {
    quiet();
    const dir = project();
    const { p } = await run(dir, ['', '', 'manual', '#123456', '', '', false]);
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.color.signal.primary.$value).toBe('#123456');
    expect(colors.interactive.primary.$value).toBe('{color.signal.primary}');
    expect(colors.text.onSignal.$value).toBe('{color.base.bone}');
    expect(colors.text.$extensions['dev.blazon'].pairs.find((pair: { fg: string }) => pair.fg === '{text.onSignal}').bg).toBe('{color.signal.primary}');
    expect(p.output.join('\n')).toContain('Labels on #123456 will be bone');
  });

  it('keeps graphite labels, and the pair over every signal color, on a color graphite reaches AA on', async () => {
    quiet();
    const dir = project();
    await run(dir, ['', '', 'manual', '#ffd24a', '', '', false]);
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.text.onSignal.$value).toBe('{color.ink.graphite}');
    expect(colors.text.$extensions['dev.blazon'].pairs.find((pair: { fg: string }) => pair.fg === '{text.onSignal}').bg).toBe('{color.signal.*}');
  });

  it('says, without blocking, when neither graphite nor bone can label the primary', async () => {
    quiet();
    const dir = project();
    const { p } = await run(dir, ['', '', 'manual', '#808080', '', '', false]);
    expect(p.output.join('\n')).toMatch(/info: Neither graphite nor bone reaches AA/);
    expect(json(dir, 'tokens/colors.json').color.signal.primary.$value).toBe('#808080');
  });

  it('says what happens to a font blazon has no stylesheet for, a missing logo and a wrong logo type', async () => {
    quiet();
    const dir = project();
    const txt = path.join(tempDir(), 'logo.txt');
    fs.writeFileSync(txt, 'x');
    const { p } = await run(dir, ['', '', 'manual', '', 'Fancy Display', '/nope/logo.svg', txt, '', false]);
    const out = p.output.join('\n');
    expect(out).toContain("Fancy Display is not in blazon's short list");
    expect(p.rejected[0]).toContain('There is no file at /nope/logo.svg');
    expect(p.rejected[1]).toContain('must be an SVG or PNG');
    // the stylesheet in the config is still blazon's, and the hint says to add the brand's own
    expect(text(dir, 'blazon.config.ts')).toContain('Big+Shoulders');
    expect(out).toContain('Add its stylesheet to fonts in blazon.config.ts');
  });

  it('starts the dev server only when asked', async () => {
    quiet();
    const startDev = vi.fn(async () => {});
    const dir = project();
    await run(dir, ['', '', 'manual', '', '', '', true], { startDev });
    expect(startDev).toHaveBeenCalledWith(dir);
    const none = vi.fn(async () => {});
    await run(project(), ['', '', 'manual', '', '', '', false], { startDev: none });
    expect(none).not.toHaveBeenCalled();
  });

  it('tells a second run that the starter files are kept', async () => {
    quiet();
    const dir = project();
    await run(dir, ['', '', 'manual', '', '', '', false]);
    const { p } = await run(dir, ['', '', 'manual', '', '', '', false]);
    expect(p.output.join('\n')).toMatch(/warn: \d+ starter files are already in this folder and are kept as they are/);
  });
});

describe('the website path', () => {
  it('shows what was found, lets colors be unticked, and writes only after the confirm', async () => {
    quiet();
    const dir = project();
    const p = scriptedPrompter(['', '', 'site', `${base}/`, ['--brand-primary'], true, false]);
    let sawBeforeWrite = false;
    const confirm = p.confirm;
    p.confirm = async (o) => {
      if (o.message.startsWith('Write these')) sawBeforeWrite = !text(dir, 'blazon.config.ts').includes('Acme Corp');
      return confirm(o);
    };
    expect(await runInit(dir, { prompter: p, tty: true, look: PLAIN })).toBe(0);
    expect(sawBeforeWrite).toBe(true);
    const out = p.output.join('\n');
    expect(out).toContain('Name: Acme Corp');
    expect(out).toContain('Description: Payments for all.');
    expect(out).toContain('Font (body): Inter, its Google Fonts stylesheet will be added');
    expect(out).toContain('Not found: no logo');
    expect(p.asked.map((a) => a.kind)).toEqual(['text', 'text', 'select', 'text', 'multiselect', 'confirm', 'confirm']);
    // one option per color, each a swatch, the hex and the variable name in fixed columns
    const options = p.asked[4]!.options!;
    expect(options).toEqual(['[#635dff] #635dff  --brand-primary', '[#00c67d] #00c67d  --brand-accent']);
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.color.brand.primary.$value).toBe('#635dff');
    expect(colors.color.brand.accent).toBeUndefined();
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Acme Corp"');
  });

  it('a typed name wins over the site title', async () => {
    quiet();
    const dir = project();
    await run(dir, ['Mine', '', 'site', `${base}/`, ['--brand-primary', '--brand-accent'], true, false]);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Mine"');
  });

  it('on an unreachable site says what happened, offers to give values by hand, and writes nothing from the site', async () => {
    quiet();
    const dir = project();
    const { code, p } = await run(dir, ['', '', 'site', 'http://127.0.0.1:1/', false, '', '', '', false]);
    expect(code).toBe(0);
    const out = p.output.join('\n');
    expect(out).toContain('spinner failed: Could not read http://127.0.0.1:1/');
    expect(out).toContain('Check the address and your connection');
    expect(out).not.toMatch(/at \S+\.(ts|js):\d+/);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Acme Brand Book"');
  });

  it('an empty website address, first or on a retry, goes to the manual questions instead of asking again', async () => {
    quiet();
    const first = await run(project(), ['', '', 'site', '', '', '', '', false]);
    expect(first.code).toBe(0);
    expect(first.p.output.join('\n')).toContain('No address given: you can enter the values by hand.');
    quiet();
    const retry = await run(project(), ['', '', 'site', 'http://127.0.0.1:1/', true, '', '', '', '', false]);
    expect(retry.code).toBe(0);
    expect(retry.p.output.join('\n')).toContain('No address given: you can enter the values by hand.');
  });

  it('declining the review writes nothing from the site and falls back to the manual questions', async () => {
    quiet();
    const dir = project();
    const { p } = await run(dir, ['', '', 'site', `${base}/`, ['--brand-primary'], false, '#0af', '', '', false]);
    expect(p.output.join('\n')).toContain('Nothing from a site will be written');
    expect(json(dir, 'tokens/colors.json').color.brand).toBeUndefined();
    expect(json(dir, 'tokens/colors.json').color.signal.primary.$value).toBe('#00aaff');
  });
});

describe('cancelling', () => {
  it('Ctrl-C at a question exits 130, says so, and leaves the starter as copied', async () => {
    quiet();
    const dir = project();
    const { code, p } = await run(dir, ['Half Way', '', 'manual', CANCEL]);
    expect(code).toBe(130);
    expect(p.output.join('\n')).toContain('cancel: Stopped. The starter was copied as it is');
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Acme Brand Book"');
    expect(fs.existsSync(path.join(dir, 'tokens/colors.json'))).toBe(true);
  });

  it('the end of input exits 130 too', async () => {
    quiet();
    expect((await run(project(), ['x'])).code).toBe(130);
  });
});

describe('without questions', () => {
  it("skipping the description gives a new book a plain one of its own, not blazon's", async () => {
    quiet();
    const dir = project();
    await run(dir, ['Acme', '', 'manual', '', '', false]);
    expect(text(dir, 'blazon.config.ts')).toContain('description: "Brand guidelines, built from design tokens"');
    expect(text(dir, 'blazon.config.ts')).not.toContain('neo-industrial');
  });

  it('refuses a description over 240 characters from the flag, before anything is copied', async () => {
    quiet();
    const dir = path.join(tempDir(), 'long');
    expect(await runInit(dir, { description: 'x'.repeat(241), tty: false })).toBe(2);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("marks blazon's hazard yellow for review when the primary is chosen, and only then", async () => {
    quiet();
    const chosen = project();
    const { p } = await run(chosen, ['', '', 'manual', '#0b5fff', '', '', false]);
    const colors = json(chosen, 'tokens/colors.json');
    const review = colors.color.signal.hazard.$extensions['dev.blazon'].review;
    expect(review.status).toBe('needs-review');
    expect(review.note).toContain("blazon's hazard yellow");
    expect(colors.color.signal.primary.$extensions?.['dev.blazon']?.review).toBeUndefined();
    expect(p.output.join('\n')).toContain('color.signal.hazard is still blazon');

    quiet();
    const kept = project();
    await run(kept, ['', '', 'manual', '', '', '', false]);
    expect(json(kept, 'tokens/colors.json').color.signal.hazard.$extensions?.['dev.blazon']?.review).toBeUndefined();
  });

  it("marks blazon's mono font for review when a font is chosen", async () => {
    quiet();
    const dir = project();
    await run(dir, ['', '', 'manual', '', 'Inter', '', false]);
    expect(json(dir, 'tokens/typography.json').font.family.mono.$extensions['dev.blazon'].review.status).toBe('needs-review');
  });

  it('applies the flags without asking', async () => {
    quiet();
    const dir = project();
    const p = scriptedPrompter([]);
    const code = await runInit(dir, {
      name: 'Flagged',
      description: 'A flagged brand.',
      color: '#123456',
      font: 'DM Sans',
      logo: logoFile('mark.svg'),
      prompter: p,
      tty: true,
    });
    expect(code).toBe(0);
    expect(p.asked).toEqual([]);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Flagged"');
    expect(json(dir, 'tokens/colors.json').color.signal.primary.$value).toBe('#123456');
    expect(json(dir, 'tokens/typography.json').font.family.display.$value).toEqual(['DM Sans', 'sans-serif']);
    expect(json(dir, 'tokens/typography.json').font.family.body.$value).toEqual(['DM Sans', 'sans-serif']);
  });

  it('lets --name win over the site title with --from', async () => {
    quiet();
    const dir = project();
    expect(await runInit(dir, { from: `${base}/`, name: 'Mine', prompter: scriptedPrompter([]), tty: true })).toBe(0);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Mine"');
  });

  it('keeps an existing logo and sidecar of the same name instead of overwriting them', async () => {
    quiet();
    const dir = project();
    fs.mkdirSync(path.join(dir, 'assets/logos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets/logos/brand.svg'), '<svg id="mine"/>');
    fs.writeFileSync(path.join(dir, 'assets/logos/brand.json'), '{"title":"Mine"}');
    const code = await runInit(dir, { logo: logoFile('brand.svg'), prompter: scriptedPrompter([]), tty: true });
    expect(code).toBe(0);
    expect(text(dir, 'assets/logos/brand.svg')).toBe('<svg id="mine"/>');
    expect(text(dir, 'assets/logos/brand.json')).toBe('{"title":"Mine"}');
    expect(text(dir, 'blazon.config.ts')).not.toContain('./assets/logos/brand.svg');
  });

  it('starts the dev server with --dev', async () => {
    quiet();
    const startDev = vi.fn(async () => {});
    await runInit(project(), { yes: true, dev: true, startDev });
    expect(startDev).toHaveBeenCalledTimes(1);
  });

  it('refuses a bad flag value in plain words before copying anything', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = project();
    expect(await runInit(dir, { color: 'blue' })).toBe(2);
    expect(await runInit(dir, { logo: '/no/such/logo.svg' })).toBe(2);
    expect(err.mock.calls.flat().join('\n')).toContain('There is no file at /no/such/logo.svg');
    expect(fs.existsSync(dir)).toBe(false);
  });

  it.each([
    ['--yes', { yes: true }],
    ['--no-input', { input: false }],
    ['a non-terminal', { tty: false }],
  ])('never asks with %s', async (_name, extra) => {
    quiet();
    const dir = project();
    const p = scriptedPrompter([]);
    expect(await runInit(dir, { prompter: p, tty: true, ...extra })).toBe(0);
    expect(p.asked).toEqual([]);
    expect(text(dir, 'blazon.config.ts')).toContain('title: "Acme Brand Book"');
  });
});

describe('plain output', () => {
  it('writes no ANSI to the prompter when NO_COLOR is set', async () => {
    quiet();
    vi.stubEnv('NO_COLOR', '1');
    const prompter = scriptedPrompter(['', '', 'manual', '#2563eb', 'Inter', '', false]);
    await runInit(project(), { prompter, tty: true });
    const all = [...prompter.output, ...prompter.asked.map((a) => a.message)].join('\n');
    expect(all).toContain('[#2563eb]');
    // eslint-disable-next-line no-control-regex -- ESC is what starts a terminal color code
    expect(all).not.toMatch(/\x1b\[/);
  });
});
