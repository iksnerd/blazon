import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveShadcn, SHADCN_FROM_ROLES } from '../../../src/core/tokens/shadcn.js';
import { SHADCN_VARIABLES, type TokenItem } from '../../../src/types/index.js';
import { REPO } from '../../support/paths';

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
