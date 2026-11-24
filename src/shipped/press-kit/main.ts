import path from 'node:path';
import { runPlugin } from '../shared/plugin.js';
import { replaceFolder, writeFolder } from '../shared/folder.js';
import { zipOf } from '../shared/zip.js';
import { readBrand } from './brand.js';
import { colorsCss, colorsJson, colorsText, planColors } from './colors.js';
import { pdfFallbacks, planFonts } from './fonts.js';
import { chooseLogos, logoIds, logosText } from './logos.js';
import { finding, parseOptions, type Finding } from './options.js';
import { kitPage } from './html.js';
import { drawPdf } from './pdf.js';
import { jobFor, MANIFEST, NAME } from './request.js';
import { siteFile } from '../shared/site.js';
import { aboutText, readmeText } from './text.js';
import { brandedName } from '../shared/slug.js';

// blazon.press-kit: blazon's build role. Reads one request on standard input and writes into out_dir a folder, <brand>-press-kit/, and <brand>-press-kit.zip
// with the same files (press-kit/ and press-kit.zip when the brand has no title, or the `name` option): what an outsider needs from the brand. The logos that are ready to go (not marked needs-review, and a generated one only
// once reviewed), the colors as JSON, CSS and text, the fonts, the boilerplate, a README, and a one-page PDF drawn in Chrome. It answers
// {"findings": [...]}. Wrong options are findings, not a failure, and so is a PDF that cannot be drawn. A broken request is exit 2 with the
// reason as the first line of standard output, and nothing is written. Without the PDF it needs Node and nothing else.

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const { options, findings } = parseOptions(job.options, logoIds(brand), brandedName(brand.named ? brand.title : undefined, 'press-kit'));

  /** The kit's files by their path inside it */
  const files = new Map<string, Buffer | string>();

  const logos = chooseLogos(brand, options);
  findings.push(...logos.findings);
  const data = new Map<string, Buffer>();
  const present = logos.chosen.filter((item) => {
    const file = siteFile(job.siteDir, item.asset.file);
    if (!file) findings.push(finding('file-missing', 'error', item.asset.id, `${item.asset.id} is not in the built site at ${item.asset.file}`));
    else data.set(item.asset.id, file);
    return file;
  });
  for (const item of present) files.set(item.kitPath, data.get(item.asset.id)!);
  if (present.length > 0) files.set('logos/logos.txt', logosText(present));

  const colors = planColors(brand, options);
  findings.push(...colors.findings);
  if (colors.colors.length > 0) {
    files.set('colors/colors.json', colorsJson(colors.colors));
    files.set('colors/colors.css', colorsCss(colors.colors));
    files.set('colors/colors.txt', colorsText(colors.colors, options.note));
  }

  const fonts = planFonts(brand);
  findings.push(...fonts.findings);
  if (fonts.text) files.set('fonts.txt', fonts.text);

  const about = aboutText(brand, { company: options.company, terms: options.terms, note: options.note });
  findings.push(...about.findings);
  if (about.text) files.set('about.txt', about.text);

  if (options.pdf) {
    const shown = present.find((item) => item.surface === 'light') ?? present[0];
    try {
      const pdf = await drawPdf(
        {
          brand,
          colors: colors.colors,
          logo: shown && { data: data.get(shown.asset.id)!, format: shown.asset.format, surface: shown.surface },
          company: options.company,
          note: options.note,
          terms: options.terms,
        },
        process.env,
      );
      files.set(`${options.name}.pdf`, pdf);
      const fallen = pdfFallbacks(brand);
      if (fallen.length > 0)
        findings.push(
          finding(
            'pdf-font-fallback',
            'info',
            'theme.roles',
            `the PDF is not set in ${fallen.join(' or ')}: the brand names ${fallen.length === 1 ? 'it' : 'them'} but does not embed a font file, and the plugin fetches none, so Chrome sets the text in a font it has. To embed ${fallen.length === 1 ? 'it' : 'one'}, list its file in \`fonts\` of blazon.json as {"family": name, "file": path} (only if its license allows embedding)`,
          ),
        );
    } catch (error) {
      const reason = String((error as Error).message ?? error)
        .split('\n')[0]!
        .slice(0, 300);
      findings.push(finding('pdf-skipped', 'warning', 'options.pdf', `${options.name}.pdf is not in the kit: ${reason}`));
    }
  }
  // The page is drawn last, from the same data the files above were, and the README lists it with the rest
  files.set(
    'index.html',
    kitPage({ brand, company: options.company, terms: options.terms, note: options.note, logos: present, colors: colors.colors, fonts: fonts.model, paths: [...files.keys()] }),
  );
  files.set('README.txt', readmeText(brand.title, [...files.keys()], options.name, options.note, options.terms !== undefined));

  // Written once, whole, after the work is done. The host empties out_dir before a build plugin runs (src/plugins/roles/roles.ts), so a
  // call that ends earlier leaves it empty, not as it was. The folder is the plugin's own, so a file from an earlier run, such as a
  // logo that is no longer ready, does not stay in it, and the folder is swapped in only when the whole kit is written.
  const entries = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const folder = path.join(job.outDir, options.name);
  replaceFolder(folder, entries);
  writeFolder(job.outDir, [[`${options.name}.zip`, zipOf(entries.map(([file, content]) => [`${options.name}/${file}`, content]))]]);
  return { findings };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, build, 'the press kit could not be written', NAME).then((code) => {
  process.exitCode = code;
});
