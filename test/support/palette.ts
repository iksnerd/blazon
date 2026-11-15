import fs from 'node:fs';
import path from 'node:path';

/**
 * A brand book page of colour swatches drawn from tokens, as a brand's palette page is: a heading, a sentence and a
 * `blazon:tokens` directive over `count` colour tokens, which the book draws as a grid of cards (a swatch, a name, a path
 * and a value each). A token grid, not an asset grid. Written into a project made by `starterProject()`; the page is
 * `docs/<file>` and its tokens are `<group>.shade-NN` in `tokens/<group>.json`. Returns the token names.
 */
export function writePalette(root: string, { count = 36, group = 'swatch', file = '16-palette.md', order = 16 } = {}): string[] {
  const names = Array.from({ length: count }, (_, i) => `shade-${String(i + 1).padStart(2, '0')}`);
  const tokens = Object.fromEntries(names.map((name, i) => [name, { $value: hexOf((i * 360) / count), $description: `Shade ${i + 1}` }]));
  fs.writeFileSync(path.join(root, `tokens/${group}.json`), JSON.stringify({ [group]: { $type: 'color', ...tokens } }));
  // the resolver lists the files a compile reads
  const resolver = path.join(root, 'blazon.resolver.json');
  const doc = JSON.parse(fs.readFileSync(resolver, 'utf-8')) as { sets: { base: { sources: unknown[] } } };
  doc.sets.base.sources.push({ $ref: `tokens/${group}.json` });
  fs.writeFileSync(resolver, JSON.stringify(doc));
  fs.writeFileSync(
    path.join(root, 'docs', file),
    `---\ntitle: ${group}\nsection: overview\norder: ${order}\n---\n\n## The complete palette: ${count} colors\n\nThese are the only values allowed.\n\n<!-- blazon:tokens ${group} -->\n`,
  );
  return names;
}

/** A colour of this hue (degrees) as #rrggbb, so each swatch differs */
function hexOf(hue: number): string {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = 0.55 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
