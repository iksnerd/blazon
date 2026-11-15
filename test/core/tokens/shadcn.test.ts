import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveShadcn, SHADCN_FROM_ROLES } from '../../../src/core/tokens/shadcn.js';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { canUse } from '../../../src/core/read/index.js';
import { SHADCN_VARIABLES, type TokenItem } from '../../../src/types/index.js';
import { REPO } from '../../support/paths';
import { starterProject } from '../../support/project';

const item = (tokenPath: string, value: string): TokenItem => ({ path: tokenPath, type: 'color', value }) as unknown as TokenItem;
const items = [item('surface.bg', '#fff'), item('text.body', '#111'), item('brand.red', '#f00'), item('brand.pink', '#f9c'), item('brand.ink', '#000')];
const roles = { background: '#fff', text: '#111', accent: '#f00', accentText: '#fff' };
const roleTokens = { background: 'surface.bg', text: 'text.body', accent: 'brand.red', accentText: 'surface.bg' };

describe('deriveShadcn', () => {
  it('takes a variable from the role it reads, and says which role and token', () => {
    const { variables } = deriveShadcn(roles, roleTokens, undefined, items);
    expect(variables.primary).toEqual({ token: 'brand.red', value: '#f00', from: 'theme', role: 'accent' });
    expect(variables['card-foreground']).toEqual({ token: 'text.body', value: '#111', from: 'theme', role: 'text' });
    expect(variables['sidebar-ring']).toMatchObject({ token: 'brand.red', role: 'accent' });
  });

  it('lists what nothing supplies, in shadcn order', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, undefined, items);
    expect(unsupplied).toContain('destructive');
    expect(unsupplied).toContain('chart-1');
    // no canvas, muted, border or radius role was given
    expect(unsupplied).toContain('secondary');
    expect(unsupplied).toContain('border');
    expect(unsupplied).toEqual(SHADCN_VARIABLES.filter((name) => !variables[name]));
  });

  it('lets the mapping fill a gap and win over a role', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, { destructive: 'brand.red', 'chart-1': 'brand.pink', ring: 'brand.ink' }, items);
    expect(variables.destructive).toEqual({ token: 'brand.red', value: '#f00', from: 'config' });
    expect(variables['chart-1']).toMatchObject({ value: '#f9c', from: 'config' });
    expect(variables.ring).toMatchObject({ token: 'brand.ink', from: 'config' });
    expect(variables['sidebar-ring']).toMatchObject({ from: 'theme' });
    expect(unsupplied).not.toContain('destructive');
    expect(unsupplied).toContain('chart-2');
  });

  it('ignores a mapping to a token that does not exist, and falls back to the role', () => {
    const { variables, unsupplied } = deriveShadcn(roles, roleTokens, { primary: 'no.such', destructive: 'no.such' }, items);
    expect(variables.primary).toMatchObject({ token: 'brand.red', from: 'theme' });
    expect(unsupplied).toContain('destructive');
  });

  it('notes pairs only when the brand declares some, and says whether a rule covers each', () => {
    expect(deriveShadcn(roles, roleTokens, undefined, items).pairs).toBeUndefined();
    const { pairs } = deriveShadcn(roles, roleTokens, undefined, items, [{ fg: '{text.body}', bg: '{surface.bg}' }]);
    expect(pairs).toContainEqual({ background: 'background', foreground: 'foreground', backgroundToken: 'surface.bg', foregroundToken: 'text.body', declared: true });
    expect(pairs).toContainEqual({ background: 'primary', foreground: 'primary-foreground', backgroundToken: 'brand.red', foregroundToken: 'surface.bg', declared: false });
    // a pair with a variable nothing supplies is left out
    expect(pairs!.some((pair) => pair.background === 'secondary')).toBe(false);
  });
});

describe('the brand book stylesheet', () => {
  it('derives its light-mode variables from the same roles as SHADCN_FROM_ROLES', () => {
    const css = fs.readFileSync(path.join(REPO, 'src/viewer/index.css'), 'utf-8');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const blazonVar: Record<string, string> = { background: 'bg', canvas: 'canvas', text: 'text', muted: 'muted', border: 'border', accent: 'accent', accentText: 'accent-text' };
    for (const [name, role] of Object.entries(SHADCN_FROM_ROLES)) {
      if (role === 'radius') continue;
      expect(root, `--${name}`).toMatch(new RegExp(`\\n  --${name}: var\\(--blazon-${blazonVar[role]!}\\);`));
    }
  });
});

describe('theme.shadcn in brand.json', () => {
  it('states the variables of a starter, the mapping, and what is left', async () => {
    const root = await starterProject();
    const file = path.join(root, 'blazon.json');
    // the starter supplies destructive and the five chart colors itself; this run swaps two of them for colors of its own
    const source = fs.readFileSync(file, 'utf-8');
    const edited = source.replace('"destructive": "text.primary"', '"destructive": "color.signal.hazard"').replace('"chart-1": "text.primary"', '"chart-1": "color.signal.orange"');
    expect(edited).not.toBe(source);
    fs.writeFileSync(file, edited);
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    const { shadcn } = buildBrandExport(data, config, root).theme;
    expect(shadcn.variables.primary).toEqual({ token: 'interactive.primary', value: '#FF5A1F', from: 'theme', role: 'accent' });
    expect(shadcn.variables.destructive).toEqual({ token: 'color.signal.hazard', value: '#F2C230', from: 'config' });
    // the starter's own config moves the focus ring off the primary action color, as its Web page says
    expect(shadcn.variables.ring).toEqual({ token: 'text.primary', value: '#1E1F21', from: 'config' });
    expect(shadcn.variables['sidebar-ring']).toMatchObject({ token: 'text.primary', from: 'config' });
    expect(shadcn.variables['chart-1']).toEqual({ token: 'color.signal.orange', value: expect.any(String), from: 'config' });
    expect(shadcn.unsupplied).toEqual([]);
    expect(shadcn.pairs).toContainEqual(expect.objectContaining({ background: 'primary', foreground: 'primary-foreground', declared: true }));
    expect(data.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('has the starter supply destructive and chart-1 to chart-5, so nothing is left unsupplied', async () => {
    const root = await starterProject();
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    const { shadcn } = buildBrandExport(data, config, root).theme;
    expect(shadcn.unsupplied).toEqual([]);
    const names = ['destructive', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const;
    const picks = names.map((name) => [name, shadcn.variables[name]?.token]);
    expect(picks).toEqual([
      ['destructive', 'text.primary'],
      ['chart-1', 'text.primary'],
      ['chart-2', 'text.muted'],
      ['chart-3', 'surface.canvas'],
      ['chart-4', 'rule.default'],
      ['chart-5', 'rule.quiet'],
    ]);
  });

  it('says a shadcn pair is declared exactly when blazon can finds a pair rule for it, through aliases', async () => {
    const root = await starterProject();
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    const { shadcn } = buildBrandExport(data, config, root).theme;
    expect(shadcn.pairs!.length).toBeGreaterThan(0);
    for (const pair of shadcn.pairs!) {
      const rule = canUse(data, pair.foregroundToken, pair.backgroundToken).checks.find((c) => c.rule === 'pairs')!;
      expect(pair.declared, `${pair.foregroundToken} on ${pair.backgroundToken}: ${rule.message}`).toBe(rule.from !== undefined);
    }
  });

  it('counts a pair written on the token a shadcn token aliases', () => {
    const base = { type: 'color' } as const;
    const list = [
      { ...base, path: 'color.orange', value: '#f00' },
      { ...base, path: 'color.ink', value: '#000' },
      { ...base, path: 'interactive.primary', value: '#f00', aliasOf: 'color.orange' },
      { ...base, path: 'text.onPrimary', value: '#000', aliasOf: 'color.ink' },
    ] as unknown as TokenItem[];
    const { pairs } = deriveShadcn({ accent: '#f00', accentText: '#000' }, { accent: 'interactive.primary', accentText: 'text.onPrimary' }, undefined, list, [
      { fg: '{color.ink}', bg: '{color.orange}' },
    ]);
    expect(pairs).toContainEqual(expect.objectContaining({ background: 'primary', foreground: 'primary-foreground', declared: true }));
  });

  it('reports a shadcn variable that points at a missing token, as a theme token does', async () => {
    const root = await starterProject();
    const file = path.join(root, 'blazon.json');
    const source = fs.readFileSync(file, 'utf-8');
    const edited = source.replace('"destructive": "text.primary"', '"destructive": "color.missing"');
    expect(edited).not.toBe(source);
    fs.writeFileSync(file, edited);
    const config = await loadConfig(root);
    const data = await compileBlazonData(config, root);
    expect(data.findings).toContainEqual(
      expect.objectContaining({
        code: 'theme-unresolved',
        severity: 'error',
        path: 'color.missing',
        message: 'shadcn.destructive points at {color.missing}, which is not a token',
      }),
    );
    expect(buildBrandExport(data, config, root).theme.shadcn.unsupplied).toContain('destructive');
  });
});
