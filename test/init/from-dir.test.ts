import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/cli/commands/init.js';
import { folderPath } from '../../src/core/init/from-site/folder.js';
import { inspectSite, savedSite } from '../../src/core/init/from-site/index.js';
import { stubNetwork } from '../support/network.js';
import { tempDir } from '../support/project';
import { acmeSavedSite } from './fixtures/acme-saved-site.js';

// `blazon init --from-dir <folder>`: the reading of `--from`, on a saved copy of a site. Nothing is fetched and nothing outside the folder
// is read.

afterEach(() => vi.restoreAllMocks());

/** Runs init with the console captured; returns the exit status and everything it printed. */
async function init(dir: string, options: Parameters<typeof runInit>[1]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  const code = await runInit(dir, options);
  vi.restoreAllMocks();
  return { code, out: lines.join('\n') };
}

const json = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('where --from-dir may read', () => {
  const folder = acmeSavedSite();

  it('takes a path relative to the page, inside the folder', () => {
    expect(folderPath(folder, 'index.html', './acme_files/theme.css')).toEqual({ file: 'acme_files/theme.css' });
    expect(folderPath(folder, 'acme_files/theme.css', 'tokens.css?v=2')).toEqual({ file: 'acme_files/tokens.css' });
  });

  it.each([
    ['https://cdn.example.test/a.css', /is a URL.*fetches nothing/],
    ['//cdn.example.test/a.css', /is a URL/],
    ['file:///etc/hosts', /is a URL/],
    ['/etc/hosts', /absolute path/],
    ['../outside.css', /goes up with "\.\."/],
    ['acme_files/../../outside.css', /goes up/],
    ['%2e%2e/outside.css', /goes up/],
  ])('refuses %s', (href, reason) => {
    const where = folderPath(folder, 'index.html', href);
    expect('reason' in where && where.reason).toMatch(reason);
  });

  it('refuses a link that leads out of the folder', () => {
    fs.symlinkSync(path.join(folder, '..', 'outside.css'), path.join(folder, 'acme_files', 'linked.css'));
    const where = folderPath(folder, 'index.html', 'acme_files/linked.css');
    expect('reason' in where && where.reason).toMatch(/link that leads out of the folder/);
  });
});

describe('blazon init --from-dir', () => {
  it('reads the saved page, its stylesheets and their @import, and fetches nothing', async () => {
    const site = acmeSavedSite();
    const dir = path.join(tempDir(), 'acme');
    const network = stubNetwork({});
    const { code, out } = await init(dir, { fromDir: site, network });
    expect(code).toBe(0);
    expect(network.calls).toEqual([]);

    // the @import of theme.css is read: tokens.css holds --brand-ink
    const colors = json(dir, 'tokens/colors.json');
    expect(colors.color.brand.ink.$value).toBe('#1e1b4b');
    expect(colors.color.brand.ink.$extensions['dev.blazon'].source.doc).toMatch(/the stylesheets of index\.html in the saved folder acme-site, read /);
    expect(colors.color.brand.$extensions['dev.blazon'].review).toMatchObject({
      status: 'needs-review',
      note: expect.stringContaining('Read from acme-site/index.html (a saved copy) on '),
    });
    // the file beside the folder is never read
    expect(JSON.stringify(colors)).not.toContain('#ff0000');

    const type = json(dir, 'tokens/typography.json');
    expect(type.font.family.body.$value).toEqual(['Inter', 'sans-serif']);
    expect(type.font.family.display.$value).toEqual(['Space Grotesk', 'sans-serif']);

    expect(fs.readFileSync(path.join(dir, 'assets/logos/acme-site.svg'), 'utf8')).toContain('fill="#111111"');
    expect(json(dir, 'assets/logos/acme-site.json').source.doc).toMatch(/index\.html in the saved folder acme-site/);

    const config = json(dir, 'blazon.json');
    expect(config.title).toBe('Acme');
    expect(config.description).toBe('Acme makes rockets, anvils and portable holes.');

    // what was skipped is said, with the reason
    expect(out).toMatch(/Read from acme-site\/index\.html \(a saved copy\):/);
    expect(out).toMatch(/https:\/\/cdn\.example\.test\/remote\.css\): --from-dir reads only files in the folder and fetches nothing/);
    expect(out).toMatch(/fonts\.example\.test\/acme\.css\).*fetches nothing/);
    expect(out).toMatch(/\(\.\.\/outside\.css\) goes up/);
    expect(out).toMatch(/\(\/etc\/acme\.css\) is an absolute path/);
  });

  it('reads the page the user names, and a stylesheet linked out of the folder is not read', async () => {
    const site = acmeSavedSite();
    fs.symlinkSync(path.join(site, '..', 'outside.css'), path.join(site, 'acme_files', 'linked.css'));
    fs.writeFileSync(path.join(site, 'about.html'), '<html><head><title>About Acme</title><link rel="stylesheet" href="acme_files/linked.css"></head></html>');
    const dir = path.join(tempDir(), 'acme');
    const { code, out } = await init(dir, { fromDir: path.join(site, 'about.html') });
    expect(code).toBe(0);
    expect(out).toMatch(/link that leads out of the folder/);
    expect(fs.readFileSync(path.join(dir, 'tokens/colors.json'), 'utf8')).not.toContain('#ff0000');
  });

  it('combines with --name and --font as --from does', async () => {
    const dir = path.join(tempDir(), 'acme');
    const { code } = await init(dir, { fromDir: acmeSavedSite(), name: 'Acme Rockets', font: 'Inter' });
    expect(code).toBe(0);
    expect(json(dir, 'blazon.json').title).toBe('Acme Rockets');
  });

  it('refuses --from with --from-dir, and a folder that is not there, before copying anything', async () => {
    const dir = path.join(tempDir(), 'acme');
    const both = await init(dir, { from: 'https://acme.example', fromDir: acmeSavedSite() });
    expect(both.code).toBe(2);
    expect(both.out).toMatch(/give one of them/);
    const none = await init(dir, { fromDir: path.join(tempDir(), 'no-such-folder') });
    expect(none.code).toBe(2);
    expect(none.out).toMatch(/--from-dir needs a folder/);
    const empty = tempDir();
    const noPage = await init(dir, { fromDir: empty });
    expect(noPage.code).toBe(2);
    expect(noPage.out).toMatch(/there is no index\.html/);
    expect(fs.existsSync(path.join(dir, 'blazon.json'))).toBe(false);
  });

  it('inspects a saved folder the way it inspects a site', async () => {
    const findings = await inspectSite(savedSite(acmeSavedSite()));
    expect(findings.name).toBe('Acme');
    expect(findings.logo).toMatch(/inline SVG/);
    expect(findings.missing.join('\n')).toMatch(/remote\.css/);
  });
});
