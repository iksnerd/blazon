import fs from 'node:fs';
import path from 'node:path';
import { readBrand, type Brand } from './brand.js';
import { launch } from './browser.js';
import { readOptions, type Finding } from './checks.js';
import { DeckError, readFavicons } from './favicons.js';
import { FontTable, fontFolders } from './fonts.js';
import { drawDeck, type Deck } from './render.js';
import { Cannot, jobFor, MANIFEST, NAME } from './request.js';

// blazon.brand-deck: blazon's build role. Reads one request on standard input, draws the brand as a PDF deck (brand-deck.pdf) in
// out_dir, and answers {"findings": [...]}. Wrong options are findings, not a failure. When the request is broken, a file the deck
// needs cannot be read, or there is no browser to draw with, it exits 2 with the reason as the first line of standard output, and
// writes nothing. When blazon.favicons has drawn its set beside this plugin's folder, the deck ends with a Favicons part, so that
// plugin is listed first. The images are read from site_dir, beside brand.json.
//
// Given arguments, it is a command line instead, as the Python deck was: blazon-blazon.brand-deck brand.json -o deck.pdf
// [--favicons DIR] [--skip CATEGORY]... [--fonts DIR]...

const say = (line: string): void => void process.stderr.write(`${line}\n`);

/** The fonts the brand's own text can be set in: the folders given and named by BLAZON_DECK_FONTS, then the config's */
function fontsFor(brand: Brand, folders: string[]): FontTable {
  const table = FontTable.scan(folders);
  table.addSheets(brand.theme.fonts);
  for (const [file, why] of table.skipped) say(`font not used: ${file}: ${why}`);
  return table;
}

async function draw(brand: Brand, siteDir: string, favicons: ReturnType<typeof readFavicons>, table: FontTable, skip: string[]): Promise<Deck> {
  const browser = await launch(process.env);
  try {
    return await drawDeck(browser, { brand, siteDir, favicons, table, skip });
  } finally {
    await browser.close();
  }
}

/** Written once, whole, after the browser is done: a call that ends earlier leaves nothing behind */
function write(file: string, pdf: Buffer): void {
  fs.writeFileSync(`${file}.part`, pdf);
  fs.renameSync(`${file}.part`, file);
}

async function build(text: string): Promise<{ findings: Finding[] }> {
  const job = jobFor(text);
  const brand = readBrand(job.brand);
  const table = fontsFor(brand, fontFolders(process.env.BLAZON_DECK_FONTS));
  const { skip, findings } = readOptions(job.options, brand);
  // What blazon keeps of standard error is little, and only when a plugin breaks, so what the deck leaves out is a finding too
  for (const [file, why] of table.skipped) findings.push({ code: `${NAME}/font-not-used`, severity: 'warning', path: file, message: `the font file is not used: ${why}` });
  const favicons = readFavicons(path.join(path.dirname(path.resolve(job.outDir)), 'blazon.favicons'), brand, (message) => {
    say(message);
    findings.push({ code: `${NAME}/favicons-not-drawn`, severity: 'warning', path: 'blazon.favicons/favicons.json', message });
  });
  const deck = await draw(brand, job.siteDir, favicons, table, skip);
  if (deck.pages !== deck.slides.length) {
    findings.push({
      code: `${NAME}/page-count`,
      severity: 'warning',
      path: 'brand-deck.pdf',
      message: `the deck planned ${deck.slides.length} slides, and the PDF has ${deck.pages} pages`,
    });
  }
  write(path.join(job.outDir, 'brand-deck.pdf'), deck.pdf);
  return { findings };
}

const USAGE = 'usage: blazon-blazon.brand-deck BRAND.json [-o deck.pdf] [--favicons DIR] [--skip CATEGORY]... [--fonts DIR]...';

/** The command line. Exit 0 on success; 1 when a file the deck needs cannot be read (nothing is written); 2 when the input is not a blazon brand, or is not given. */
async function cli(args: string[]): Promise<number> {
  let brandFile: string | undefined;
  let output = 'brand-deck.pdf';
  let favicons: string | undefined;
  const skip: string[] = [];
  const fonts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const flag = (names: string[]): string | undefined => (names.includes(arg) ? (args[++i] ?? '') : undefined);
    const value = flag(['-o', '--output']) ?? flag(['--favicons']) ?? flag(['--skip']) ?? flag(['--fonts']);
    if (value !== undefined) {
      if (value === '') {
        say(`${arg} needs a value\n${USAGE}`);
        return 2;
      }
      if (arg === '-o' || arg === '--output') output = value;
      else if (arg === '--favicons') favicons = value;
      else if (arg === '--skip') skip.push(value);
      else fonts.push(value);
    } else if (arg.startsWith('-')) {
      say(`${arg} is not an option\n${USAGE}`);
      return 2;
    } else if (brandFile === undefined) brandFile = arg;
    else {
      say(`more than one brand.json: ${brandFile} and ${arg}\n${USAGE}`);
      return 2;
    }
  }
  if (brandFile === undefined) {
    say(USAGE);
    return 2;
  }
  const folders = [...fonts, ...fontFolders(process.env.BLAZON_DECK_FONTS)];
  // A folder that is not there is said before anything is read
  for (const folder of folders) {
    if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
      say(`font folder ${folder} does not exist`);
      return 2;
    }
  }
  let brand: Brand;
  try {
    brand = readBrand(JSON.parse(fs.readFileSync(brandFile, 'utf-8')), brandFile);
  } catch (error) {
    say(error instanceof Cannot ? error.message : `cannot read ${brandFile}: ${(error as Error).message}`);
    return 2;
  }
  const { skip: left, findings } = readOptions({ skip }, brand);
  for (const finding of findings) say(finding.message);
  try {
    const table = fontsFor(brand, folders);
    const deck = await draw(brand, path.dirname(path.resolve(brandFile)), favicons ? readFavicons(favicons, brand, say) : null, table, left);
    write(output, deck.pdf);
    process.stdout.write(`wrote ${output} (${deck.slides.length} slides)\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof DeckError || error instanceof Cannot)) throw error;
    say(error.message);
    return 1;
  }
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === '--blazon-manifest') {
    process.stdout.write(`${JSON.stringify(MANIFEST)}\n`);
    return 0;
  }
  if (argv.length > 0) {
    try {
      return await cli(argv);
    } catch (error) {
      say(`the browser could not draw the deck: ${String((error as Error).message ?? error).split('\n')[0]}`);
      return 1;
    }
  }
  try {
    process.stdout.write(`${JSON.stringify(await build(fs.readFileSync(0, 'utf-8')))}\n`);
    return 0;
  } catch (error) {
    const reason =
      error instanceof Cannot || error instanceof DeckError
        ? error.message
        : `the browser could not draw the deck: ${String((error as Error).message ?? error)
            .split('\n')[0]!
            .slice(0, 500)}`;
    process.stdout.write(`${reason}\n`);
    return 2;
  }
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
