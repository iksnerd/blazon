import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import type { LogoFiles } from './logo.js';
import { readJson, writeJson } from '../tree.js';
import { estimateClearSpace, LOGO_RULES_NOTE, STARTER_LOGOS, STARTER_LOGO_FILES } from '../../vocabulary.js';

/** Blazon's own logo goes once the config points at the site's. The site's sidecar gets no number of blazon's mark: the clear space is a stand-in measured on the site's artwork, the minimum size is not carried. */
export function removePlaceholderLogo(ctx: Ctx, logoFiles: LogoFiles, configLogo: boolean): void {
  const { destDir, created, result } = ctx;
  const siteLogo = logoFiles.single ?? logoFiles.onLight;
  if (configLogo && siteLogo) {
    // The logo page's sections read these rules from a sidecar: the site's logo gets a clear space measured on its own artwork, flagged
    const siteSidecar = path.join(destDir, siteLogo.replace(/^\.\//, '').replace(/\.[a-z]+$/, '.json'));
    if (created.has(`assets/logos/${STARTER_LOGOS[0]}.json`) && fs.existsSync(siteSidecar)) {
      const sidecarData = readJson(siteSidecar);
      const file = siteLogo.replace(/^\.\//, '');
      const svg = file.toLowerCase().endsWith('.svg');
      sidecarData['clearSpace'] ??= estimateClearSpace({ svg, text: svg ? fs.readFileSync(path.join(destDir, file), 'utf-8') : undefined });
      sidecarData['description'] = `${String(sidecarData['description'])} ${LOGO_RULES_NOTE}`;
      result.missing.push("the logo's minimum size, and a measured clear space: blazon's mark numbers were not carried to the site logo's sidecar");
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
