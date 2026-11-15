import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MANIFEST, NAME } from '../../../../src/shipped/social-cards/request.js';
import { plugin, run, world, cardOf } from './helpers.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: the entry, run as blazon runs it, for the answers that need no browser.

describe('the social-cards plugin, as blazon starts it', () => {
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

  it('answers bad options with findings and exit 0, without needing a browser', () => {
    const w = world();
    const { ran, findings, outDir } = run(w, { cards: [cardOf({ format: 'story' })] }, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status, ran.out + ran.err).toBe(0);
    expect(findings.map((f) => f.code)).toEqual([`${NAME}/card-option-invalid`]);
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('exits 2 with the install hint when BLAZON_CHROME names no program and a card has to be drawn', () => {
    const { ran } = run(world(), { cards: [cardOf()] }, { BLAZON_CHROME: '/nonexistent/chrome' });
    expect(ran.status).toBe(2);
    expect(ran.out).toMatch(/^no browser to draw the cards with: BLAZON_CHROME names \/nonexistent\/chrome, which is not a program/);
  });
});
