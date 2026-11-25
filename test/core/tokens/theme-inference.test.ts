import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { logoConfig } from '../../support/helpers.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { runCheck } from '../../../src/cli/commands/check.js';
import { tempDir } from '../../support/project';

// A brand with no `theme` block: the brand book should take its roles from conventional token names.

afterEach(() => {
  vi.restoreAllMocks();
});

type Tokens = Record<string, unknown>;

function project(tokens: Tokens): string {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'tokens'));
  fs.writeFileSync(path.join(dir, 'tokens/all.json'), JSON.stringify(tokens));
  fs.writeFileSync(path.join(dir, 'blazon.json'), '{"logo": "./logo.svg"}\n');
  logoConfig(dir);
  return dir;
}

const color = (value: string) => ({ $type: 'color', $value: value });

const conventional: Tokens = {
  surface: { background: color('#ffffff'), subtle: color('#f4f5f6') },
  text: { primary: color('#111111'), muted: color('#666666'), inverse: color('#ffffff') },
  border: { default: color('#dddddd') },
  interactive: { primary: color('#635dff') },
  font: { family: { sans: { $type: 'fontFamily', $value: 'Inter' }, mono: { $type: 'fontFamily', $value: 'Acme Mono' } } },
  radius: { default: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
};

const compile = (dir: string, theme?: Record<string, string>) => compileBlazonData({ ...logoConfig(dir), ...(theme && { theme }) }, dir);

describe('theme without a theme block', () => {
  it('takes each role from the conventional token name, and says where from', async () => {
    const data = await compile(project(conventional));
    expect(data.theme).toEqual({
      background: '#ffffff',
      canvas: '#f4f5f6',
      text: '#111111',
      muted: '#666666',
      border: '#dddddd',
      accent: '#635dff',
      accentText: '#ffffff',
      inverseText: '#ffffff',
      fontDisplay: 'Inter',
      fontBody: 'Inter',
      fontMono: "'Acme Mono'",
      radius: '8px',
    });
    const finding = data.findings.find((f) => f.code === 'theme-inferred');
    expect(finding).toMatchObject({ severity: 'info', path: 'theme' });
    expect(finding!.message).toMatch(/accent = \{interactive\.primary\}/);
    expect(finding!.message).toMatch(/text = \{text\.primary\}/);
    expect(finding!.message).toMatch(/Set theme in blazon\.json/);
  });

  it('names the token behind each role, so a context that changes the token can change the role', async () => {
    const inferred = await compile(project(conventional));
    expect(inferred.themeTokens).toMatchObject({ accent: 'interactive.primary', text: 'text.primary', fontBody: 'font.family.sans' });
    // A theme block names them itself; a role whose token is missing is left out
    const mapped = await compile(project(conventional), { accent: 'interactive.primary', fontBody: 'font.family.sans', muted: 'text.nope' });
    expect(mapped.themeTokens).toEqual({ accent: 'interactive.primary', fontBody: 'font.family.sans' });
  });

  it('takes the monospace role from font.family.mono, so code can be set in the brand font', async () => {
    const data = await compile(project(conventional));
    expect(data.theme.fontMono).toBe("'Acme Mono'");
    expect(data.themeTokens).toMatchObject({ fontMono: 'font.family.mono' });
  });

  it('prefers the first conventional name when a brand has several', async () => {
    const data = await compile(project({ ...conventional, brand: { primary: color('#ff0000') } }));
    expect(data.theme.accent).toBe('#635dff');
  });

  it('falls back to the next conventional name', async () => {
    const data = await compile(project({ brand: { primary: color('#ff0000') } }));
    expect(data.theme).toEqual({ accent: '#ff0000' });
  });

  it('skips a token of the wrong type for the role', async () => {
    const data = await compile(project({ text: { primary: { $type: 'dimension', $value: { value: 4, unit: 'px' } } }, brand: { primary: color('#ff0000') } }));
    expect(data.theme.text).toBeUndefined();
    expect(data.theme.accent).toBe('#ff0000');
  });

  it('leaves an explicit theme alone: no inference, no finding', async () => {
    const data = await compile(project(conventional), { accent: 'interactive.primary' });
    expect(data.theme).toEqual({ accent: '#635dff' });
    expect(data.findings.filter((f) => f.code.startsWith('theme-'))).toEqual([]);
  });

  it('says so when no token has a conventional name', async () => {
    const data = await compile(project({ weird: { thing: color('#123456') } }));
    expect(data.theme).toEqual({});
    expect(data.findings.find((f) => f.code === 'theme-missing')).toMatchObject({ severity: 'info', path: 'theme' });
  });
});

describe('blazon check with an info finding', () => {
  it('prints it and still passes, even with --strict', async () => {
    const dir = project(conventional);
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => void printed.push(args.join(' ')));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    await runCheck(dir, true);
    expect(exit).not.toHaveBeenCalled();
    const output = printed.join('\n');
    expect(output).toMatch(/theme-inferred/);
    expect(output).toMatch(/Check passed/);
    expect(output).not.toMatch(/warning/);
  });
});
