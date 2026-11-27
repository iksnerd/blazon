import path from 'node:path';
import type { Ctx } from '../context.js';
import { manifestName, metaContent, pageTitle } from '../html.js';
import type { FontsWritten } from './fonts.js';
import type { LogoFiles } from './logo.js';
import { readJson, writeJson, withFontStylesheets } from '../../vocabulary.js';

/** The site's name, description, logo and font stylesheets into blazon.json. */
export async function applyConfig(
  ctx: Ctx,
  logoFiles: LogoFiles,
  written: FontsWritten,
): Promise<{ title: string | undefined; description: string | undefined; configLogo: boolean }> {
  const { destDir, url, page, result, mayChange } = ctx;
  const { fontUrls } = written;
  const configFile = 'blazon.json';
  const named = metaContent(page.html, 'og:site_name') ?? metaContent(page.html, 'application-name') ?? (await manifestName(page.html, url, ctx.network));
  const title = named ?? pageTitle(page.html);
  const description = metaContent(page.html, 'description');
  if (!title) result.missing.push('no <title> on the page: the config title keeps the folder name');
  let configLogo = false;
  const wantsConfig = Boolean(title) || Boolean(description) || logoFiles.single || logoFiles.onLight || fontUrls.length > 0;
  if (wantsConfig && mayChange(configFile)) {
    const file = path.join(destDir, configFile);
    const config = readJson(file);
    if (title) config['title'] = title;
    if (description) config['description'] = description;
    const logoValue = logoFiles.single ?? (logoFiles.onLight ? { onLight: logoFiles.onLight, ...(logoFiles.onDark ? { onDark: logoFiles.onDark } : {}) } : undefined);
    if (logoValue) config['logo'] = logoValue;
    if (fontUrls.length > 0) config['fonts'] = withFontStylesheets(config['fonts'], fontUrls);
    writeJson(file, config);
    result.written.push(configFile);
    configLogo = Boolean(logoValue);
  }
  return { title, description, configLogo };
}
