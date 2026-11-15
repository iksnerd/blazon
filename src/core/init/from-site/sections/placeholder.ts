import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import type { LogoFiles } from './logo.js';
import { readJson, writeJson } from '../tree.js';
import { STARTER_LOGOS, STARTER_LOGO_FILES } from '../../vocabulary.js';

/** Blazon's own logo goes once the config points at the site's: its rules move to the site's sidecar. */
export function removePlaceholderLogo(ctx: Ctx, logoFiles: LogoFiles, configLogo: boolean): void {
  const { destDir, created, result } = ctx;
  const siteLogo = logoFiles.single ?? logoFiles.onLight;
  if (configLogo && siteLogo) {
    // The logo page's sections read these rules from a sidecar: the site's logo takes blazon's rules, flagged
    const masterRules = path.join(destDir, `assets/logos/${STARTER_LOGOS[0]}.json`);
    const siteSidecar = path.join(destDir, siteLogo.replace(/^\.\//, '').replace(/\.[a-z]+$/, '.json'));
    if (created.has(`assets/logos/${STARTER_LOGOS[0]}.json`) && fs.existsSync(masterRules) && fs.existsSync(siteSidecar)) {
      const { description: _d, background: _b, ...rules } = readJson(masterRules);
      const sidecarData = readJson(siteSidecar);
      const art = fs.readFileSync(path.join(destDir, siteLogo.replace(/^\.\//, '')), 'utf-8').match(/<svg\b[^>]*>/i)?.[0] ?? '';
      const box = art.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+[\d.]+[\s,]+([\d.]+)/i)?.[1] ?? art.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1];
      // Blazon's clear space is the height of its mark's fold, 0.3 of the mark's height; the same share of the site's artwork stands in, flagged below
      if (box && Number(box) > 0) rules['clearSpace'] = { value: Math.max(1, Math.round(Number(box) * 0.3 * 100) / 100), unit: 'px' };
      for (const [key, value] of Object.entries(rules)) sidecarData[key] ??= value;
      sidecarData['description'] = `${String(sidecarData['description'])} Clear space, minimum size, lockup, placement and partnership are blazon's, not the brand's: set them.`;
      writeJson(siteSidecar, sidecarData);
    }
    for (const name of STARTER_LOGO_FILES) {
      for (const ext of ['svg', 'json']) {
        const old = `assets/logos/${name}.${ext}`;
        if (!created.has(old)) continue;
        fs.rmSync(path.join(destDir, old), { force: true });
        result.removed.push(`${old} (blazon's own logo)`);
      }
    }
  }
}
