import { describe, it, expect, beforeAll } from 'vitest';
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
  it('reports a numeric title as invalid-frontmatter instead of throwing in the sort', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '01-a.md'), '---\ntitle: 2026\norder: 1\n---\n\nBody.\n');
    fs.writeFileSync(path.join(dir, '02-b.md'), '---\ntitle: Fine\norder: 1\n---\n\nBody.\n');
    const problems: Finding[] = [];

    const docs = parseDocs(dir, problems);

    expect(docs.map((d) => d.title)).toEqual(['Fine']);
    expect(problems.map((p) => `${p.path}:${p.code}:${p.severity}`)).toEqual(['01-a.md:invalid-frontmatter:error']);
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
      // Notes (a project with no theme gets one) are not problems, and this project has no tokens, which is `tokens-empty`'s business
      expect(
        data.findings.filter((f) => f.severity !== 'info' && f.code !== 'tokens-empty').map((f) => `${f.path}:${f.code}:${f.severity}`),
        `compile ${run + 1}`,
      ).toEqual(['01-icons.md:invalid-frontmatter:error']);
      expect(data.docs.map((d) => d.title)).toEqual(['Fine']);
    }
  });
});
