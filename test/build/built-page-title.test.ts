import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { starterProject } from '../support/init-project';
import { buildSite } from '../../src/builder/site-builder.js';
import { loadConfig } from '../../src/core/config/index.js';

// The built site names itself in its HTML, not only once its script has run: a link preview, a search result and the tab while the page
// loads read the HTML, and it used to say "Brand Book" for every brand.

describe('a built site names itself', () => {
  let project: string;

  beforeAll(async () => {
    project = await starterProject();
  }, 60_000);

  const pageOf = async (title: string, description?: string) => {
    const config = { ...(await loadConfig(project)), title, ...(description !== undefined && { description }), outDir: './built-title' };
    await buildSite(config, project);
    return fs.readFileSync(path.join(project, 'built-title/index.html'), 'utf-8');
  };

  it("puts the brand's title and description in the page's title and meta tags", async () => {
    const html = await pageOf('Acme Brand Guidelines', 'How Acme looks and sounds');
    expect(html).toContain('<title>Acme Brand Guidelines</title>');
    expect(html).not.toContain('<title>Brand Book</title>');
    expect(html).toContain('<meta name="description" content="How Acme looks and sounds" />');
    expect(html).toContain('<meta property="og:title" content="Acme Brand Guidelines" />');
  }, 60_000);

  it('writes a title in which markup is text', async () => {
    const html = await pageOf('Fish & <Chips>');
    expect(html).toContain('<title>Fish &#38; &#60;Chips&#62;</title>');
  }, 60_000);
});
