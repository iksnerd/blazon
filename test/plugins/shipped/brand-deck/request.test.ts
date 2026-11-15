import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { tempDir } from '../../../support/project';
import { jobFor, MANIFEST, NAME } from '../../../../src/shipped/brand-deck/request.js';
import { browser, plugin, run, world } from './helpers.js';

describe('the request', () => {
  const folder = tempDir('blazon-deck-request-');
  const ask = (extra: object) => JSON.stringify({ v: 1, type: 'build', site_dir: folder, out_dir: folder, brand: {}, ...extra });

  it('is the plugin of the build role, with the manifest blazon reads', () => {
    expect(NAME).toBe('blazon.brand-deck');
    expect(MANIFEST).toMatchObject({ v: 2, roles: ['build'], timeout_ms: 60000 });
    expect(MANIFEST.env).toEqual(expect.arrayContaining(['BLAZON_CHROME', 'BLAZON_DECK_FONTS']));
  });

  it('is refused, with the reason, when it is not JSON, not version 1, not a build, or names no folders', () => {
    const reason = (input: string) => {
      try {
        jobFor(input);
      } catch (error) {
        return (error as Error).message;
      }
      return undefined;
    };
    expect(reason('{ nope')).toBe('the request is not JSON');
    expect(reason('[]')).toBe('the request is not a JSON object');
    expect(reason(ask({ v: 2 }))).toBe('this plugin speaks version 1 of the request');
    expect(reason(ask({ type: 'check' }))).toBe('this plugin fills the build role');
    expect(reason(ask({ site_dir: path.join(folder, 'nowhere') }))).toBe('site_dir must name a directory that exists');
    expect(reason(ask({ out_dir: 7 }))).toBe('out_dir must name a directory that exists');
    expect(reason(ask({}))).toBeUndefined();
  });
});

describe('the deck plugin, as blazon starts it', () => {
  it('prints its manifest', () => {
    const ran = plugin('', {}, ['--blazon-manifest']);
    expect(ran.status, ran.err).toBe(0);
    expect(JSON.parse(ran.out)).toEqual(MANIFEST);
  });

  it('exits 2 with the reason on its first line, and writes nothing, when the request is broken', () => {
    const ran = plugin('{ nope');
    expect(ran.status).toBe(2);
    expect(ran.out.split('\n')[0]).toBe('the request is not JSON');
  });

  it('exits 2 when the brand is not a blazon brand, or of a version it does not read', () => {
    const w = world();
    const outDir = tempDir('blazon-deck-out-');
    const ask = (brand: unknown) => plugin(JSON.stringify({ v: 1, type: 'build', options: {}, brand, site_dir: w.siteDir, out_dir: outDir }), browser);
    expect(ask({ format: 'other', version: 1 }).out.split('\n')[0]).toBe("the brand in the request is not a blazon brand: its format is 'other', not 'blazon-brand'");
    expect(ask({ ...w.brand, version: 99 }).out.split('\n')[0]).toBe('the brand in the request is version 99; this reader understands version 1');
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('exits 2 with the install hint when BLAZON_CHROME names no program', () => {
    const { ran, outDir } = run(world(), {}, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status).toBe(2);
    expect(ran.out).toMatch(/^no browser to draw the deck with: BLAZON_CHROME names \/nonexistent\/chrome, which is not a program/);
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('exits 2 naming a font folder that does not exist, and writes nothing', () => {
    const { ran, outDir } = run(world(), {}, { ...browser, BLAZON_DECK_FONTS: '/nonexistent/fonts' });
    expect(ran.status).toBe(2);
    expect(ran.out.split('\n')[0]).toBe('font folder /nonexistent/fonts does not exist');
    expect(fs.readdirSync(outDir)).toEqual([]);
  });
});
