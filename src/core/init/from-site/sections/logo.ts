import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import { cleanSvg } from '../../shared/svg.js';
import { favicon, headerLogo, type Favicon } from '../logo.js';
import { writeJson, type Json } from '../tree.js';

export interface LogoFiles {
  onLight?: string;
  onDark?: string;
  single?: string;
}

/** The site's logo (the header's SVG, else the site icon) into assets/logos, with a sidecar marked for review. */
export async function applyLogo(ctx: Ctx): Promise<LogoFiles> {
  const { destDir, site, date, page, result, note, review } = ctx;
  const logoFiles: { onLight?: string; onDark?: string; single?: string } = {};
  const name = site.logoName;
  const sidecar = (file: string, locator: string, extra: Json) => {
    writeJson(path.join(destDir, file.replace(/\.[a-z]+$/, '.json')), {
      description: note,
      ...extra,
      source: { doc: `${site.sourceDoc('page')}, read ${date}`, locator },
      review,
    });
    result.written.push(file.replace(/\.[a-z]+$/, '.json'));
  };
  const writeAsset = (file: string, data: string | Buffer): boolean => {
    const full = path.join(destDir, file);
    const side = file.replace(/\.[a-z]+$/, '.json');
    const taken = [file, side].filter((f) => fs.existsSync(path.join(destDir, f)));
    if (taken.length > 0) {
      result.missing.push(
        `${taken.join(' and ')} already existed, so ${taken.length > 1 ? 'they were' : 'it was'} kept as ${taken.length > 1 ? 'they were' : 'it was'}, and no logo was written to ${file}`,
      );
      return false;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    result.written.push(file);
    return true;
  };
  const logo = headerLogo(page.html, site);
  let svg: string | undefined;
  let locator = '';
  if (logo?.kind === 'inline') {
    svg = logo.svg;
    locator = logo.locator;
  } else if (logo?.kind === 'url') {
    try {
      svg = (await site.read(logo.url, 'image')).toString('utf8');
      locator = `${logo.locator} (${logo.url})`;
    } catch (err) {
      result.missing.push(`the header logo could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (svg !== undefined && !/<svg\b/i.test(svg)) {
      svg = undefined;
      result.missing.push(`${logo.url} is not an SVG`);
    }
  }
  let icon: Favicon | undefined;
  if (svg === undefined) {
    icon = favicon(page.html, site);
    if (icon?.svg) {
      try {
        svg = (await site.read(icon.url, 'image')).toString('utf8');
        locator = `${icon.locator} (${icon.url})`;
        if (!/<svg\b/i.test(svg)) svg = undefined;
      } catch (err) {
        result.missing.push(`the icon could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  if (svg !== undefined) {
    const clean = cleanSvg(svg);
    if (/<use\b/i.test(clean) && !/<symbol\b/i.test(clean)) result.missing.push('the logo uses <use> to point at a sprite elsewhere on the page, so it may draw nothing: check it');
    if (/currentColor/i.test(clean)) {
      const dark = `assets/logos/${name}.svg`;
      const white = `assets/logos/${name}-white.svg`;
      if (writeAsset(dark, clean.replace(/currentColor/gi, '#111111'))) {
        sidecar(dark, locator, { title: 'Logo', background: 'light', ink: '#111111' });
        logoFiles.onLight = `./${dark}`;
      }
      if (writeAsset(white, clean.replace(/currentColor/gi, '#ffffff'))) {
        sidecar(white, locator, { title: 'White logo', background: 'dark', ink: '#ffffff' });
        logoFiles.onDark = `./${white}`;
      }
    } else {
      const file = `assets/logos/${name}.svg`;
      if (writeAsset(file, clean)) {
        sidecar(file, locator, { title: 'Logo' });
        logoFiles.single = `./${file}`;
      }
    }
  } else if (icon) {
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(icon.ext)) {
      result.missing.push(`only a ${icon.ext} icon was found (${icon.url}), which blazon cannot show: no logo was written`);
    } else {
      try {
        const file = `assets/logos/${name}${icon.ext === '.jpeg' ? '.jpg' : icon.ext}`;
        if (writeAsset(file, await site.read(icon.url, 'image'))) {
          sidecar(file, icon.locator, { title: 'Site icon' });
          logoFiles.single = `./${file}`;
          result.missing.push(`no SVG logo was found: ${file} is the site's raster icon (${icon.url}), not a logo, so replace it with the real one`);
        }
      } catch (err) {
        result.missing.push(`the icon could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    result.missing.push('no logo: no SVG in the header and no <link rel="icon"> on the page');
  }
  return logoFiles;
}
