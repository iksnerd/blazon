import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocs } from '../../../src/core/docs/parser.js';
import type { Finding } from '../../../src/types/index.js';
import { tempDir } from '../../support/project';

describe('Docs Parser', () => {
  let tempDocsDir: string;

  beforeAll(() => {
    tempDocsDir = tempDir();
    fs.writeFileSync(
      path.join(tempDocsDir, '01-intro.md'),
      `---
title: Welcome to Blazon
order: 1
description: Introduction to our design principles.
---

# Brand Overview
This is **strong** text.
`,
    );

    fs.writeFileSync(
      path.join(tempDocsDir, '02-colors.md'),
      `---
title: Colors Guide
---

# Colors Palette
Color guidelines here.
`,
    );
  });

  it('should parse markdown files, extract frontmatter, and sort by order', () => {
    const docs = parseDocs(tempDocsDir);

    expect(docs).toHaveLength(2);

    expect(docs[0]?.title).toBe('Welcome to Blazon');
    expect(docs[0]?.order).toBe(1);
    expect(docs[0]?.meta.description).toBe('Introduction to our design principles.');
    expect(docs[0]?.html).toContain('<h1>Brand Overview</h1>');
    expect(docs[0]?.html).toContain('<strong>strong</strong>');

    expect(docs[1]?.title).toBe('Colors Guide');
    expect(docs[1]?.order).toBe(2);
    expect(docs[1]?.html).toContain('<h1>Colors Palette</h1>');
  });

  it('reads a decimal file prefix as a sub-page number, not as part of the slug', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '07-illustration.md'), '# Illustration\n');
    fs.writeFileSync(path.join(dir, '07.1-photography.md'), '# Photography\n');
    fs.writeFileSync(path.join(dir, '08-motion.md'), '# Motion\n');

    const docs = parseDocs(dir);

    expect(docs.map((d) => d.slug)).toEqual(['illustration', 'photography', 'motion']);
    expect(docs[1]?.order).toBe(7.1);
  });
});

describe('parseDocs: a front matter title that is not a string', () => {
  it('reports a numeric title as page-frontmatter-invalid instead of throwing in the sort', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '01-a.md'), '---\ntitle: 2026\norder: 1\n---\n\nBody.\n');
    fs.writeFileSync(path.join(dir, '02-b.md'), '---\ntitle: Fine\norder: 1\n---\n\nBody.\n');
    const problems: Finding[] = [];

    const docs = parseDocs(dir, problems);

    expect(docs.map((d) => d.title)).toEqual(['Fine']);
    expect(problems.map((p) => `${p.path}:${p.code}:${p.severity}`)).toEqual(['01-a.md:page-frontmatter-invalid:error']);
  });
});

describe('parseDocs: slugs, titles and unreadable pages', () => {
  const write = (files: Record<string, string>) => {
    const dir = tempDir();
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
  };

  it('reports two pages with one slug, naming both files', () => {
    const problems: Finding[] = [];
    const docs = parseDocs(write({ '01-colors.md': '# One\n', 'colors.md': '# Two\n' }), problems);
    expect(docs).toHaveLength(2);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'page-slug-duplicate', severity: 'error', path: 'colors.md' });
    expect(problems[0]!.message).toContain('01-colors.md');
    expect(problems[0]!.message).toContain('colors.md');
  });

  it('reports a leftover <!-- folio:name --> with its page and line, and says folio: became blazon:', () => {
    const problems: Finding[] = [];
    parseDocs(write({ 'a.md': '---\ntitle: A\n---\n\ntext\n<!-- folio:tokens color.ink -->\n' }), problems);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'directive-deprecated', severity: 'warning', path: 'a.md', line: 6 });
    expect(problems[0]!.message).toContain('blazon:tokens');
  });

  it('does not report a folio: comment in a code fence or inline code, a plain comment, or a blazon: directive', () => {
    const problems: Finding[] = [];
    parseDocs(write({ 'a.md': '```md\n<!-- folio:tokens -->\n```\n\n`<!-- folio:tokens -->`\n\n<!-- just a note -->\n<!-- blazon:tokens color.ink -->\n' }), problems);
    expect(problems).toEqual([]);
  });

  it('does not take a heading inside a code fence for the title', () => {
    const [doc] = parseDocs(write({ 'install.md': 'Intro\n\n```bash\n# install\nnpm i\n```\n\n~~~\n# also code\n~~~\n\n# Real title\n' }));
    expect(doc!.title).toBe('Real title');
    const [bare] = parseDocs(write({ 'setup-guide.md': '```sh\n# install\n```\n' }));
    expect(bare!.title).toBe('Setup Guide');
  });

  it('does not let a lone # reach over a line break to the next line for the title', () => {
    const [doc] = parseDocs(write({ 'plain-name.md': '#\nNot a title\n' }));
    expect(doc!.title).toBe('Plain Name');
  });

  it('reports a page that cannot be read as a finding, and writes nothing to the console', () => {
    const dir = write({ 'ok.md': '# Fine\n' });
    fs.mkdirSync(path.join(dir, 'folder.md'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const problems: Finding[] = [];
    const docs = parseDocs(dir, problems);
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(0);
    expect(docs.map((d) => d.slug)).toEqual(['ok']);
    expect(problems).toMatchObject([{ code: 'page-unreadable', severity: 'error', path: 'folder.md' }]);
  });
});

describe('compileBlazonData: guideline pages with broken front matter', () => {
  it('reports invalid YAML as an error finding on every compile, not only the first', async () => {
    const { writeProject, TEST_CONFIG } = await import('../../support/helpers.js');
    const { compileBlazonData } = await import('../../../src/core/index.js');
    const root = writeProject({
      'docs/01-icons.md': '---\ntitle: Icons\ndescription: Three systems with their own rules: system, marketing, feature.\n---\n\nBody.\n',
      'docs/02-ok.md': '---\ntitle: Fine\n---\n\nBody.\n',
    });

    for (let run = 0; run < 2; run++) {
      const data = await compileBlazonData({ ...TEST_CONFIG }, root);
      // Notes (a project with no theme gets one) are not problems, and this project has no tokens, which is `tokens-missing`'s business
      expect(
        data.findings.filter((f) => f.severity !== 'info' && f.code !== 'tokens-missing').map((f) => `${f.path}:${f.code}:${f.severity}`),
        `compile ${run + 1}`,
      ).toEqual(['01-icons.md:page-frontmatter-invalid:error']);
      expect(data.docs.map((d) => d.title)).toEqual(['Fine']);
    }
  });
});
