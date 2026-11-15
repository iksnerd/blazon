import path from 'node:path';
import type { Ctx } from '../context.js';
import { devBlazon, readJson, writeJson, type Json } from '../tree.js';
import { googleFontsUrl } from '../../shared/google-fonts.js';
import { fontOf, fontValue, type FontPick } from '../fonts.js';
import { rel } from '../context.js';
import { flagReview } from '../../vocabulary.js';

/** The site's fonts into tokens/typography.json: the body font is font.family.body, the heading font (else the body font) font.family.display. The Google Fonts stylesheets it can link come back for the config. */
export interface FontsWritten {
  /** The Google Fonts stylesheets the config should link */
  fontUrls: string[];
}

export function applyFonts(ctx: Ctx): FontsWritten {
  const { destDir, page, vars, result, note, review, source, mayChange } = ctx;
  const body = fontOf(page.css, vars, /^(body|html)$/);
  const heading = fontOf(page.css, vars, /^h[1-6]$/);
  const fontUrls: string[] = [];
  if (!body && !heading) result.missing.push('no font: no body or heading rule in the stylesheets names a font-family');
  else if (mayChange(rel('tokens', 'typography.json'))) {
    const file = path.join(destDir, 'tokens', 'typography.json');
    const tree = readJson(file);
    const families = (((tree['font'] ??= {}) as Json)['family'] ??= {}) as Json;
    const sans = body ?? heading!;
    const entries: [string, FontPick][] = [
      ['body', sans],
      ['display', heading ?? sans],
    ];
    for (const [name, pick] of entries) {
      const stylesheet = googleFontsUrl(pick.family);
      if (stylesheet) {
        if (!fontUrls.includes(stylesheet)) fontUrls.push(stylesheet);
      } else result.missing.push(`the font ${pick.family} is not one blazon knows a stylesheet for: add its stylesheet to fonts in blazon.config.ts`);
      families[name] = {
        $value: fontValue(pick),
        $extensions: devBlazon({
          // No cssVar: the token holds a family and a generic, the variable a whole stack, so drift would always differ
          source: source(pick.cssVar ? `${pick.locator}, from ${pick.cssVar}` : pick.locator),
          review: stylesheet ? review : { status: 'needs-review', note: `${note} The font ${pick.family} must be added to fonts in blazon.config.ts.` },
        }),
      };
    }
    // The mono face is not on the site's pages that were read: it stays blazon's, and is flagged
    const mono = families['mono'] as Json | undefined;
    if (mono) flagReview(mono, `${note} Still blazon's mono font: the site's stylesheets named no monospace font. Set the brand's own.`);
    writeJson(file, tree);
    result.written.push(rel('tokens', 'typography.json'));
  }
  return { fontUrls };
}
