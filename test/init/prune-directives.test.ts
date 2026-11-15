import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { pruneTokenDirectives } from '../../src/core/init/from-site/sections/directives.js';
import type { Ctx } from '../../src/core/init/from-site/context.js';
import { tempProject } from '../support/project';

// `init --from` replaces the starter's tokens with the site's. A directive in a starter page that names a token that is gone would fail
// `blazon check`, so it loses the name, and the directive goes when none is left.

const project = (page: string, created = ['docs/a.md']) => {
  const dir = tempProject({
    'tokens/colors.json': { color: { $type: 'color', base: { $value: '#fff' }, ink: { $value: '#000' }, brand: { primary: { $value: '#f00' } } } },
    'docs/a.md': page,
    'docs/b.md': page,
  });
  const ctx = { destDir: dir, created: new Set(created), result: { written: [], missing: [], removed: [], repointed: [] } } as unknown as Ctx;
  pruneTokenDirectives(ctx);
  return { text: (name: string) => fs.readFileSync(path.join(dir, 'docs', name), 'utf-8'), removed: ctx.result.removed };
};

describe('pruneTokenDirectives', () => {
  it('keeps the names that still resolve, a group that has tokens under it included', () => {
    const { text, removed } = project('Intro.\n\n<!-- blazon:tokens color.base color.signal color.brand -->\n\nOutro.\n');
    expect(text('a.md')).toBe('Intro.\n\n<!-- blazon:tokens color.base color.brand -->\n\nOutro.\n');
    expect(removed).toEqual(['color.signal in docs/a.md (the site has no such token to show)']);
  });

  it('takes the directive out when none of its names resolve, and the blank lines it leaves', () => {
    const { text } = project('Intro.\n\n<!-- blazon:tokens color.signal color.hazard -->\n\nOutro.\n');
    expect(text('a.md')).toBe('Intro.\n\nOutro.\n');
  });

  it('leaves a directive whose names all resolve, other directives, and a page init did not write', () => {
    const page = 'A.\n\n<!-- blazon:tokens color.base -->\n\n<!-- blazon:assets logos -->\n';
    expect(project(page).text('a.md')).toBe(page);
    const gone = 'A.\n\n<!-- blazon:tokens color.signal -->\n';
    expect(project(gone).text('b.md')).toBe(gone);
  });
});
