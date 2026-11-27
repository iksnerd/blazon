import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../../support/init-project';
import { blazon, output } from '../../support/plugin-roles';

// Manual chapter 19 says `contextSelectors` gives shadcn's `.dark`; this runs that exact config through the real command, with the v4 options on.

describe('blazon tokens with blazon.shadcn and contextSelectors', () => {
  it('writes .dark in shadcn.css, theme.css and, with themeInline, a theme file for the .dark variant', async () => {
    const root = await starterProject({ plugins: [{ name: 'blazon.shadcn', options: { format: 'oklch', themeInline: true, chart: 'color.pigment' } }] });
    const file = path.join(root, 'blazon.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf-8')), contextSelectors: { theme: '.{context}' } }));
    const result = blazon(root, 'tokens');
    expect(result.status, output(result)).toBe(0);
    const out = path.join(root, 'dist/tokens');
    expect(fs.readFileSync(path.join(out, 'blazon.shadcn/shadcn.css'), 'utf-8')).toContain('\n.dark {\n');
    expect(fs.readFileSync(path.join(out, 'theme.css'), 'utf-8')).toContain('.dark {');
    expect(fs.readFileSync(path.join(out, 'blazon.shadcn/shadcn.css'), 'utf-8')).toMatch(/--primary: oklch\(/);
    expect(fs.readFileSync(path.join(out, 'blazon.shadcn/shadcn-theme.css'), 'utf-8')).toContain('@custom-variant dark (&:is(.dark *));');
    expect(fs.readFileSync(path.join(out, 'blazon.shadcn/shadcn.css'), 'utf-8')).toContain('--chart-1: oklch(');
  }, 120_000);
});
