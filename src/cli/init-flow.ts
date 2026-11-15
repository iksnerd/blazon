import path from 'node:path';
import pc from '../core/colors.js';
import { inspectLogo, isWebAddress, parseColor, parseDescription, parseFont, parseLogo, type Answers } from '../core/init/answers.js';
import { inspectSite, type SiteFindings } from '../core/init/from-site/index.js';
import { googleFontsUrl } from '../core/init/shared/google-fonts.js';
import type { Prompter, Validate } from '../core/init/prompts.js';
import { contrastLines, kilobytes, labelNote, stepTitle, swatch, type Look } from './init-ui.js';

// The questions of the guided start, in order. It writes nothing: it returns what the user chose, and `runInit` applies it.

export interface FlowContext {
  prompter: Prompter;
  look: Look;
  /** The folder being initialised, for the header */
  dir: string;
  /** Starter files that were already in the folder and were kept */
  kept?: number;
  /** Reads a site; replaced in tests */
  inspect?: (url: string) => Promise<SiteFindings>;
}

export interface Plan {
  answers: Answers;
  site?: { url: string; findings: SiteFindings; skipVars: Set<string> };
}

const TOTAL = 4;

/** Prints the reason for a question on the rail, just above it, and returns the question. */
function ask(p: Prompter, question: string, reason: string, look: Look): string {
  p.log.message(look.color ? pc.dim(reason) : reason);
  return question;
}

/** An optional answer: empty is fine, anything else must parse. */
function optional<T>(parse: (text: string) => { value: T } | { hint: string }): Validate {
  return (text) => {
    if (text.trim() === '') return undefined;
    const parsed = parse(text);
    return 'hint' in parsed ? parsed.hint : undefined;
  };
}

const value = <T>(parse: (text: string) => { value: T } | { hint: string }, text: string): T | undefined => {
  const parsed = text.trim() === '' ? undefined : parse(text);
  return parsed && 'value' in parsed ? parsed.value : undefined;
};

export async function runGuided(ctx: FlowContext): Promise<Plan> {
  const { prompter: p, look } = ctx;
  const answers: Answers = {};
  p.intro(look.color ? pc.bold(`blazon init  ${pc.dim(ctx.dir)}`) : `blazon init  ${ctx.dir}`);

  if (ctx.kept)
    p.log.warn(
      `${ctx.kept} starter ${ctx.kept === 1 ? 'file is' : 'files are'} already in this folder and ${ctx.kept === 1 ? 'is' : 'are'} kept as ${ctx.kept === 1 ? 'it is' : 'they are'}. Only missing files are added.`,
    );
  p.log.step(stepTitle(1, TOTAL, 'Brand'));
  const name = (
    await p.text({
      message: ask(p, 'Brand name', 'The title of the brand book. Enter keeps the name taken from the folder.', look),
      placeholder: 'from the folder name',
      validate: () => undefined,
    })
  ).trim();
  if (name) answers.name = name;
  const description = (
    await p.text({
      message: ask(p, 'One-line description', 'What the brand is, in a sentence. It goes in the config and opens the intro page. Enter skips it.', look),
      placeholder: 'what the brand is, in one sentence',
      validate: (t) => ('hint' in parseDescription(t) ? 'Keep it to one sentence, 240 characters at most.' : undefined),
    })
  ).trim();
  if (description) answers.description = description;

  const source = await p.select({
    message: ask(p, 'Where should the colors, fonts and logo come from?', 'Reading a live site fills them in for you to review before anything is written.', look),
    options: [
      { value: 'manual' as const, label: 'I will give them here', hint: 'color, font and logo, each optional' },
      { value: 'site' as const, label: 'Read them from my website', hint: 'you review what was found first' },
    ],
  });

  if (source === 'site') {
    const site = await readSite(ctx);
    if (site) return { answers, site };
    p.log.info('Nothing from a site will be written. Giving the values here instead.');
  }

  p.log.step(stepTitle(2, TOTAL, 'Colors'));
  const color = (
    await p.text({
      message: ask(p, 'Primary color', 'Hex, for example #2563eb. Buttons and links use it. Enter keeps the orange it starts with.', look),
      placeholder: '#2563eb',
      validate: optional(parseColor),
    })
  ).trim();
  const hex = value(parseColor, color);
  if (hex) {
    answers.color = hex;
    p.log.info(contrastLines(hex, look).join('\n'));
    p.log.info(labelNote(hex));
  }

  p.log.step(stepTitle(3, TOTAL, 'Type'));
  const font = (
    await p.text({
      message: ask(p, 'Font family', 'A Google Fonts name, for example Inter. Enter keeps the fonts it starts with.', look),
      placeholder: 'Inter',
      validate: optional(parseFont),
    })
  ).trim();
  const family = value(parseFont, font);
  if (family) {
    answers.font = family;
    if (googleFontsUrl(family)) p.log.success(`${family} is on Google Fonts. Its stylesheet will be added to fonts in blazon.json.`);
    else p.log.warn(`${family} is not in blazon's short list of Google Fonts, so only the font name is written. Add its stylesheet to fonts in blazon.json.`);
  }

  p.log.step(stepTitle(4, TOTAL, 'Logo'));
  const logoText = (
    await p.text({
      message: ask(p, 'Logo file', 'The path to an SVG or PNG. Enter skips it and keeps the logo it starts with.', look),
      placeholder: './logo.svg',
      validate: optional((t) => parseLogo(t)),
    })
  ).trim();
  const logo = value((t) => parseLogo(t), logoText);
  if (logo) {
    answers.logo = logo;
    const info = inspectLogo(logo);
    const base = path.basename(logo);
    p.log.info(
      [
        `${base}: ${info.svg ? 'SVG' : 'raster image'}, ${kilobytes(info.bytes)}.`,
        `It will be copied to assets/logos/ and replace the starter's placeholder.`,
        ...(info.usesCurrentColor ? ['It draws in currentColor, so it takes the text color of the page it is on.'] : []),
        ...(!info.svg ? ['A raster logo cannot be recolored; an SVG is better if you have one.'] : []),
      ].join('\n'),
    );
  }
  return { answers };
}

/** Reads the site with a spinner, shows what was found, and returns the user's selection; undefined to go manual. */
async function readSite(ctx: FlowContext): Promise<Plan['site'] | undefined> {
  const { prompter: p, look } = ctx;
  const inspect = ctx.inspect ?? inspectSite;
  for (;;) {
    const url = (
      await p.text({
        message: ask(p, 'Website address', "Blazon reads its stylesheets and page. It sends no cookies and runs none of the site's scripts.", look),
        placeholder: 'https://example.com  (leave empty to enter the values by hand)',
        validate: (t) =>
          t.trim() === '' || isWebAddress(t.trim()) ? undefined : 'Give the full address, starting with http:// or https://, or leave it empty to enter the values by hand.',
      })
    ).trim();
    if (url === '') {
      p.log.info('No address given: you can enter the values by hand.');
      return undefined;
    }
    const spin = p.spinner();
    spin.start(`Reading ${url}`);
    let findings: SiteFindings | undefined;
    try {
      findings = await inspect(url);
      spin.stop(`Read ${url}`);
    } catch (err) {
      spin.error(`Could not read ${url}`);
      p.log.error(`${err instanceof Error ? err.message : String(err)}\nCheck the address and your connection. The starter is in place, so nothing is lost.`);
    }
    if (findings) {
      const skipVars = await review(ctx, url, findings);
      return skipVars ? { url, findings, skipVars } : undefined;
    }
    if (!(await p.confirm({ message: 'Try a different address?', initialValue: true }))) return undefined;
  }
}

/** Shows what was found. Returns the colors to leave out, or undefined when the user declines to write any of it. */
async function review(ctx: FlowContext, url: string, f: SiteFindings): Promise<Set<string> | undefined> {
  const { prompter: p, look } = ctx;
  const found: string[] = [];
  if (f.name) found.push(`Name: ${f.name}`);
  if (f.description) found.push(`Description: ${f.description}`);
  for (const font of f.fonts)
    found.push(
      `Font (${font.role}): ${font.family}${font.stylesheet ? ', its Google Fonts stylesheet will be added' : ", not in blazon's short list, so add its stylesheet yourself"}`,
    );
  if (f.logo) found.push(`Logo: ${f.logo}`);
  p.log.info(found.length > 0 ? `Found at ${url}\n${found.join('\n')}` : `Found nothing usable at ${url}`);
  for (const m of f.missing) p.log.warn(`Not found: ${m}`);

  let skip = new Set<string>();
  if (f.colors.length > 0) {
    const chosen = await p.multiselect({
      message: ask(p, 'Brand colors found', 'Untick any you do not want. Everything written is marked needs-review.', look),
      options: f.colors.map((c) => ({ value: c.cssVar, label: `${swatch(c.hex, look)} ${c.hex}  ${c.cssVar}` })),
      initialValues: f.colors.map((c) => c.cssVar),
    });
    skip = new Set(f.colors.map((c) => c.cssVar).filter((v) => !chosen.includes(v)));
  }
  const ok = await p.confirm({ message: 'Write these into the brand book?', initialValue: true });
  return ok ? skip : undefined;
}
