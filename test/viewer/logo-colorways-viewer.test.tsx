// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { REPO } from '../support/paths';
import { cleanup, render } from '@testing-library/react';
import { loadConfig } from '../../src/core/config/index.js';
import { compileBlazonData } from '../../src/core/index.js';
import { contrastBetween, parseColor, ratioMessage } from '../../src/core/checker/contrast.js';
import { injectBlazonData } from '../../src/server/data-script.js';
import type { Asset, AssetMeta, DocItem, BlazonData } from '../../src/types/index.js';
import { App } from '../../src/viewer/App';

// `blazon:logo-colorways` draws each named colorway of a logo (RFC 0001 §10): the logo on its background, the name as the caption, the
// measured ratio and whether it reaches the level, in words and a mark, not by color alone.

const EXAMPLE = path.join(REPO, 'examples/blazon');
let data: BlazonData;
let GRAPHITE: string, BONE: string, ORANGE: string;
let graphite: Asset, bone: Asset;
beforeAll(async () => {
  data = await compileBlazonData(await loadConfig(EXAMPLE), EXAMPLE);
  GRAPHITE = value('color.ink.graphite');
  BONE = value('color.base.bone');
  ORANGE = value('color.signal.orange');
  graphite = asset('graphite', 'svg', {
    title: 'Acme logo',
    ink: GRAPHITE,
    colorways: [
      { name: 'Graphite on Bone', on: 'color.base.bone', min: 'AA' },
      { name: 'Bone on Orange', on: 'color.signal.orange', variant: 'logos/bone', min: 'AA' },
      { name: 'Graphite on Orange', on: 'color.signal.orange', min: 'AA' },
    ],
  });
  bone = asset('bone', 'svg', { title: 'Acme logo, bone', ink: BONE });
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
  localStorage.clear();
});

const asset = (name: string, format: 'svg' | 'png', meta?: AssetMeta): Asset => ({
  id: `logos/${name}`,
  name,
  category: 'logos',
  filePath: `logos/${name}.${format}`,
  format,
  mediaType: format === 'svg' ? 'image/svg+xml' : 'image/png',
  url: `brand-assets/logos/${name}.${format}`,
  bytes: 1,
  width: 100,
  height: 40,
  ...(meta && { meta }),
});

function open(directive: string, assets: Asset[]) {
  const doc: DocItem = { slug: 'guide', filePath: 'docs/guide.md', title: 'Guide', order: 99, meta: {}, sections: [], markdown: '', html: `<h2>Logo</h2>${directive}` };
  const brand: BlazonData = { ...data, docs: [...data.docs, doc], assets: { ...data.assets, logos: assets, icons: [], custom: {}, all: assets } };
  document.head.innerHTML = new DOMParser().parseFromString(injectBlazonData('<html><head></head><body></body></html>', brand), 'text/html').head.innerHTML;
  window.location.hash = '#doc/guide';
  return render(<App />);
}

const value = (token: string) => String(data.tokens.items.find((t) => t.path === token)!.value);
const ratio = (fg: string, bg: string) => contrastBetween(parseColor(fg)!, parseColor(bg)!)!;
const figures = () => [...document.querySelectorAll<HTMLElement>('main figure[data-logo-colorway]')];
const figure = (name: string) => figures().find((f) => f.dataset.logoColorway === name)!;

describe('blazon:logo-colorways', () => {
  it('draws one figure for each colorway, in order, captioned with its name', () => {
    open('<!-- blazon:logo-colorways logos/graphite -->', [graphite, bone]);
    expect(figures().map((f) => f.dataset.logoColorway)).toEqual(['Graphite on Bone', 'Bone on Orange', 'Graphite on Orange']);
    for (const f of figures()) expect(f.querySelector('figcaption')!.textContent).toContain(f.dataset.logoColorway);
  });

  it('draws the logo, or its variant, on the background token', () => {
    open('<!-- blazon:logo-colorways logos/graphite -->', [graphite, bone]);
    expect(figure('Graphite on Bone').querySelector('img')!.getAttribute('src')).toContain('brand-assets/logos/graphite.svg');
    expect(figure('Bone on Orange').querySelector('img')!.getAttribute('src')).toContain('brand-assets/logos/bone.svg');
    const stage = figure('Bone on Orange').querySelector<HTMLElement>('[data-colorway-stage]')!;
    expect(stage.style.background.toLowerCase()).toMatch(/rgb\(255, 90, 31\)|#ff5a1f/);
  });

  it('prints the measured ratio and the level, floored as the check prints it', () => {
    open('<!-- blazon:logo-colorways logos/graphite -->', [graphite, bone]);
    expect(figure('Graphite on Bone').querySelector('[data-colorway-result]')!.textContent).toContain(`${ratioMessage(ratio(GRAPHITE, BONE))}:1`);
    expect(figure('Bone on Orange').querySelector('[data-colorway-result]')!.textContent).toContain(`${ratioMessage(ratio(BONE, ORANGE))}:1`);
    expect(figure('Bone on Orange').querySelector('[data-colorway-result]')!.textContent).toContain('AA');
  });

  it('says pass or fail in words and a mark, not by color alone', () => {
    open('<!-- blazon:logo-colorways logos/graphite -->', [graphite, bone]);
    const pass = figure('Graphite on Bone');
    const fail = figure('Bone on Orange');
    expect(pass.dataset.colorwayPass).toBe('true');
    expect(fail.dataset.colorwayPass).toBe('false');
    expect(pass.querySelector('[data-colorway-result]')!.textContent).toMatch(/Passes AA/);
    expect(fail.querySelector('[data-colorway-result]')!.textContent).toMatch(/Fails AA/);
    for (const f of [pass, fail]) expect(f.querySelector('[data-colorway-result] svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names each figure for a screen reader by its caption, and the image by the logo, the background and the result', () => {
    open('<!-- blazon:logo-colorways logos/graphite -->', [graphite, bone]);
    const fail = figure('Bone on Orange');
    const caption = fail.querySelector('figcaption')!;
    expect(caption.id).not.toBe('');
    expect(fail.getAttribute('aria-labelledby')).toBe(caption.id);
    expect(fail.querySelector('img')!.getAttribute('alt')).toBe('Acme logo, bone, on color.signal.orange');
  });

  it('draws one file of a variant id with several, the same whatever the order', () => {
    const png = asset('bone', 'png', { ink: BONE });
    for (const all of [
      [graphite, bone, png],
      [png, bone, graphite],
    ]) {
      open('<!-- blazon:logo-colorways logos/graphite -->', all);
      expect(figure('Bone on Orange').querySelector('img')!.getAttribute('src')).toContain('bone.svg');
      cleanup();
    }
  });

  it('says so when the logo states no colorways, and when the logo does not exist', () => {
    open('<!-- blazon:logo-colorways logos/bone logos/nope -->', [graphite, bone]);
    expect(document.querySelector('main')!.textContent).toMatch(/logos\/bone states no colorways|No asset at logos\/bone/);
  });
});
