import { expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from '../../../support/spawn';
import { ROOT_DIR } from '../../support/spec.js';
import { tempDir } from '../../../support/project';

// What the social-cards tests share: the fixtures and the runner that starts the entry as blazon does.

export const ENTRY = path.join(ROOT_DIR, 'src/shipped/social-cards/main.ts');
const TSX = pathToFileURL(path.join(ROOT_DIR, 'node_modules/tsx/dist/esm/index.mjs')).href;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const CHROME = process.env.BLAZON_CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : '');

interface Ran { status: number | null; out: string; err: string }
export const plugin = (input: string, env: Record<string, string> = {}, args: string[] = []): Ran => {
  const result = spawnSync(process.execPath, ['--import', TSX, ENTRY, ...args], { input, encoding: 'utf-8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env } });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
export const browser = { BLAZON_CHROME: CHROME };

/** An 8-bit-per-channel PNG's size, from its header. */
export const pngSize = (file: string): { width: number; height: number } => {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

interface Png { width: number; height: number; data: Buffer; channels: number }
/** An 8-bit RGB or RGBA PNG, not interlaced, as the browser writes it: just enough to look at pixels. */
export const readPng = (file: string): Png => {
  const bytes = fs.readFileSync(file);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  expect([bytes[24], bytes[26] === 0, bytes[28]]).toEqual([8, true, 0]);
  const channels = bytes[25] === 6 ? 4 : 3;
  const parts: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') parts.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? data[y * stride + x - channels]! : 0;
      const up = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? data[(y - 1) * stride + x - channels]! : 0;
      const paeth = () => {
        const p = left + up - upLeft;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return a <= b && a <= c ? left : b <= c ? up : upLeft;
      };
      const add = [0, left, up, (left + up) >> 1, paeth()][filter]!;
      data[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + add) & 255;
    }
  }
  return { width, height, data, channels };
};
/** The box around the light pixels (every channel over 200: the bone of the text and the logo, on a dark plate) inside x0..x1, y0..y1; right and bottom are exclusive. */
export const lightBox = (png: Png, x0: number, y0: number, x1: number, y1: number): { left: number; top: number; right: number; bottom: number } | undefined => {
  let box: { left: number; top: number; right: number; bottom: number } | undefined;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const at = (y * png.width + x) * png.channels;
      if (png.data[at]! > 200 && png.data[at + 1]! > 200 && png.data[at + 2]! > 200) {
        box = { left: Math.min(box?.left ?? x, x), top: Math.min(box?.top ?? y, y), right: Math.max(box?.right ?? 0, x + 1), bottom: Math.max(box?.bottom ?? 0, y + 1) };
      }
    }
  return box;
};

export const rule = (value: number) => ({ value, unit: 'px' });
export const tok = (p: string, type: string, value: unknown, extra: object = {}) => ({ path: p, type, value: typeof value === 'object' ? '' : String(value), resolvedValue: value, ...extra });
export const fmt = (name: string, width: number, height: number, margin: number) => [
  tok(`social.format.${name}.width`, 'dimension', rule(width)), tok(`social.format.${name}.height`, 'dimension', rule(height)), tok(`social.format.${name}.margin`, 'dimension', rule(margin)),
];
const LOGO = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 182 40" width="364" height="80"><rect width="182" height="40" fill="${fill}"/></svg>`;
const BG_DARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><rect width="1200" height="630" fill="#20242a"/></svg>';
const BG_LIGHT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><rect width="1200" height="630" fill="#c9d3dd"/></svg>';

/** A built site that is only the files a card reads: brand-assets and an index.html, with a brand as brand.json describes it. */
export const world = (over: { assets?: object[]; tokens?: object[]; logoMeta?: object } = {}) => {
  const siteDir = tempDir('blazon-cards-site-');
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
    fs.writeFileSync(path.join(siteDir, file), text);
  };
  write('index.html', '<html></html>');
  write('brand-assets/backgrounds/dark.svg', BG_DARK);
  write('brand-assets/backgrounds/light.svg', BG_LIGHT);
  write('brand-assets/logos/onlight.svg', LOGO('#1E1F21'));
  write('brand-assets/logos/ondark.svg', LOGO('#F2F0EB'));
  const asset = (id: string, extra: object = {}) => ({ id, name: id.split('/')[1], category: id.split('/')[0], file: `brand-assets/${id}.svg`, format: 'svg', mediaType: 'image/svg+xml', bytes: 1, width: 1200, height: 630, ...extra });
  const brand = {
    format: 'blazon-brand', version: 2,
    theme: { roles: { inverse: '#1E1F21', inverseText: '#F2F0EB', text: '#1E1F21', accent: '#FF5A1F', fontDisplay: 'Georgia, serif', fontBody: 'Arial, sans-serif' }, tokens: {}, fonts: [] },
    logo: { onLight: 'brand-assets/logos/onlight.svg', onDark: 'brand-assets/logos/ondark.svg' },
    tokens: [
      ...fmt('horizontal', 1200, 630, 64), ...fmt('square', 600, 600, 48), ...fmt('tiny', 360, 160, 24),
      tok('color.mid', 'color', '#808080'),
      tok('type.display', 'typography', '', { parts: { fontFamily: 'Georgia, serif', fontSize: '96px', fontWeight: 700, letterSpacing: '0em', lineHeight: 1 } }),
      tok('type.h2', 'typography', '', { parts: { fontFamily: 'Georgia, serif', fontSize: '40px', fontWeight: 700, letterSpacing: '0em', lineHeight: 1.1 } }),
      ...(over.tokens ?? []),
    ],
    assets: [
      asset('backgrounds/dark'), asset('backgrounds/light'),
      asset('logos/onlight', { width: 364, height: 80, meta: over.logoMeta ?? { placement: ['top-left'], minSize: { width: rule(160) }, clearSpace: rule(24) } }),
      asset('logos/ondark', { width: 364, height: 80, meta: over.logoMeta ?? { placement: ['top-left'], minSize: { width: rule(160) }, clearSpace: rule(24) } }),
      ...(over.assets ?? []),
    ],
  };
  return { siteDir, brand };
};
export const run = (w: ReturnType<typeof world>, options: object, env: Record<string, string> = browser) => {
  const outDir = tempDir('blazon-cards-out-');
  const ran = plugin(JSON.stringify({ v: 2, type: 'build', options, brand: w.brand, site_dir: w.siteDir, out_dir: outDir }), env);
  return { ran, outDir, findings: ran.status === 0 ? (JSON.parse(ran.out).findings as { code: string; severity: string; path: string; message: string }[]) : [] };
};
export const cardOf = (extra: object = {}) => ({ id: 'launch', format: 'horizontal', background: 'backgrounds/dark', headline: 'Say it in one line.', ...extra });
