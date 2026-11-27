import fs from 'node:fs';
import path from 'node:path';
import pc from '../../core/colors.js';
import { copyStarter, ensureBuildIgnored, getTemplateDir } from '../../core/starter.js';
import { applyFromSite, savedSite, webSite, type FromSiteResult, type SiteInput, type SitePage } from '../../core/init/from-site/index.js';
import { applyAnswers, parseColor, parseDescription, parseFont, parseLogo, parseName, type Answers } from '../../core/init/answers.js';
import { readJson, writeJson } from '../../core/init/vocabulary.js';
import { clackPrompter, PromptCancelled, type Prompter } from '../../core/init/prompts.js';
import { runGuided, type Plan } from '../init-flow.js';
import { lookFor, type Look } from '../init-ui.js';
import type { ErrorCode } from '../errors.js';
import type { Network } from '../../core/drift/fetch.js';
import { blazonCommand, inDir, shownDir } from '../where.js';

/** The last line of the next steps: the folder, not its name, is what makes a project. */
const PROJECT_LINE = 'This folder is your project: the one holding blazon.json. Run blazon here, or give its path.';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What was written under one top-level folder, in words: its files, or its pages, or the folders the files sit in. */
function describeCreated(folder: string, files: string[]): string | undefined {
  const names = files.map((f) => f.split('/').slice(1));
  if (names.length === 0) return undefined;
  if (folder === 'docs') return `${plural(names.length, 'page', 'pages')}, ${names[0]![0]} to ${names[names.length - 1]![0]}`;
  // Token files are few and each one is edited by name, a context's file in its folder too (theme/dark.json)
  if (folder === 'tokens') return `${plural(names.length, 'file', 'files')}: ${names.map((n) => n.join('/')).join(', ')}`;
  const subfolders = [...new Set(names.filter((n) => n.length > 1).map((n) => n[0]!))];
  if (subfolders.length > 0) return `${plural(names.length, 'file', 'files')} in ${plural(subfolders.length, 'folder', 'folders')}: ${subfolders.join(', ')}`;
  return `${plural(names.length, 'file', 'files')}: ${names.map((n) => n[0]).join(', ')}`;
}

/** The folders init writes first, in the order a person reads them; any other folder follows by name, then the files at the top. */
const FOLDER_ORDER = ['tokens', 'assets', 'docs', 'fonts'];
const FILE_ORDER = ['blazon.json', 'blazon.resolver.json', 'AGENTS.md', 'CLAUDE.md'];
const rank = (order: string[], name: string): number => (order.includes(name) ? order.indexOf(name) : order.length);

/** One line for each top-level folder (with what is in it) and each top-level file among the written paths. */
function topLevelLines(written: string[], ignoreLines: string[]): string[] {
  const folders = [...new Set(written.filter((f) => f.includes('/')).map((f) => f.split('/')[0]!))].sort(
    (a, b) => rank(FOLDER_ORDER, a) - rank(FOLDER_ORDER, b) || (a < b ? -1 : 1),
  );
  const files = written.filter((f) => !f.includes('/')).sort((a, b) => rank(FILE_ORDER, a) - rank(FILE_ORDER, b) || (a < b ? -1 : 1));
  return [
    ...folders.map((folder) => {
      const what = describeCreated(
        folder,
        written.filter((f) => f.startsWith(`${folder}/`)),
      );
      return what ? `${folder}/ (${what})` : `${folder}/`;
    }),
    ...files.map((file) => (file === '.gitignore' ? `.gitignore (${ignoreLines.join(', ')})` : file)),
  ];
}

// Words a folder name often ends with that the title says itself: "acme-brand" is "Acme Brand Book", not "Acme Brand Brand Book".
const TITLE_SUFFIX = /^(brand|book|guidelines|guide)$/i;

function brandTitle(dir: string): string {
  let words = path
    .basename(dir)
    .split(/[-_\s]+/)
    .filter(Boolean);
  const named = words.length > 0;
  while (words.length > 0 && TITLE_SUFFIX.test(words[words.length - 1]!)) words = words.slice(0, -1);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  // A folder that is only "brand" says nothing more than the title does
  return name ? `${name} Brand Book` : named ? 'Brand Book' : 'Blazon Brand Book';
}

export interface InitOptions {
  /** An http(s) address to read the first colors, fonts and logo from */
  from?: string;
  /** A folder holding a saved copy of a site (`index.html`, or the `.html` file named, and its stylesheets): the same reading as `from`, offline */
  fromDir?: string;
  /** The config title, as given */
  name?: string;
  /** One sentence on the brand */
  description?: string;
  /** The primary color, hex */
  color?: string;
  /** A font family name */
  font?: string;
  /** A logo file to copy in */
  logo?: string;
  /** Copy only what the smallest brand needs: four token files, the logo and the config, with no pages, fonts, dark theme or agent guide */
  minimal?: boolean;
  /** Start `blazon dev` in the folder when init is done */
  dev?: boolean;
  /** Accept every default and never ask */
  yes?: boolean;
  /** cac sets this to false for `--no-input`, an alias of `yes` */
  input?: boolean;
  /** The prompter; a test passes a scripted one. Without it a terminal session uses @clack/prompts */
  prompter?: Prompter;
  /** Whether stdin and stdout are a terminal; defaults to the process's own */
  tty?: boolean;
  /** How the output may look; defaults to what the environment allows */
  look?: Look;
  /** Starts the dev server; defaults to `blazon dev` */
  startDev?: (dir: string) => Promise<void>;
  /** Told what was made, once the starter is in place: the folder, the files written and those that were already there (relative paths) */
  report?: (made: InitReport) => void;
  /**
   * Where a fetch may connect. Only a test passes one (to reach the server it started on 127.0.0.1): the command line has no flag for it and
   * a value that is not a pair of functions is ignored, so a user cannot switch the public-address rule off.
   */
  network?: Network;
  /** Told why init ended with a status other than 0, as the code and the sentence `--json` carries */
  failure?: (failure: { code: ErrorCode; message: string }) => void;
}

export interface InitReport {
  dir: string;
  created: string[];
  kept: string[];
  /** Files that were already there and that init added a line to (`.gitignore`); empty when it changed none */
  updated: string[];
}

const FLAGS = [
  ['--name', 'name', parseName],
  ['--description', 'description', parseDescription],
  ['--color', 'color', parseColor],
  ['--font', 'font', parseFont],
  ['--logo', 'logo', (t: string) => parseLogo(t)],
] as const;

/** Returns the exit status: 0; 2 when a flag is not valid or the site cannot be read; 130 when the questions are cancelled. */
export async function runInit(targetDir: string = '.', options: InitOptions = {}): Promise<number> {
  if (options.from !== undefined && !/^https?:\/\/[^\s/]/i.test(options.from)) {
    const message = `--from needs an http(s) address, got ${JSON.stringify(options.from)}`;
    console.error(pc.red(`blazon init: ${message}`));
    options.failure?.({ code: 'invalid-option-value', message });
    return 2;
  }
  if (options.from !== undefined && options.fromDir !== undefined) {
    const message = '--from reads a live site and --from-dir a saved copy: give one of them';
    console.error(pc.red(`blazon init: ${message}`));
    options.failure?.({ code: 'conflicting-options', message });
    return 2;
  }
  let saved: SiteInput | undefined;
  if (options.fromDir !== undefined) {
    try {
      saved = savedSite(path.resolve(process.cwd(), String(options.fromDir)));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(path.resolve(process.cwd(), String(options.fromDir)), String(options.fromDir)) : String(err);
      console.error(pc.red(`blazon init: ${message}`));
      options.failure?.({ code: 'no-file', message });
      return 2;
    }
  }
  const answers: Answers = {};
  for (const [flag, key, parse] of FLAGS) {
    const given = options[key];
    if (given === undefined) continue;
    const parsed = parse(String(given));
    if ('hint' in parsed) {
      console.error(pc.red(`blazon init: ${flag}: ${parsed.hint}`));
      options.failure?.({ code: 'invalid-option-value', message: `${flag}: ${parsed.hint}` });
      return 2;
    }
    answers[key] = parsed.value;
  }
  // The page and its stylesheets are read before anything is copied, as a saved folder is: a page that cannot be read (refused by the
  // fetch policy, an error status, no answer) leaves nothing behind. What is missing once the page is read is a note further down.
  let page: SitePage | undefined;
  if (options.from !== undefined) {
    try {
      page = await webSite(options.from, options.network).page();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`blazon init: ${message}`));
      console.error(pc.dim('  Nothing was written.\n'));
      options.failure?.({ code: 'site-unreadable', message });
      return 2;
    }
  }
  const destDir = path.resolve(process.cwd(), targetDir);
  const templateDir = getTemplateDir();
  if (!fs.existsSync(templateDir)) throw new Error(`Template directory not found at ${templateDir}`);

  const tty = options.tty ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const givenAny = [options.from, options.fromDir, options.name, options.description, options.color, options.font, options.logo].some((v) => v !== undefined);
  const guided = tty && !givenAny && !options.yes && options.input !== false;
  const prompter = guided ? (options.prompter ?? clackPrompter()) : undefined;
  const look = options.look ?? lookFor(process.env, tty);

  if (!guided) console.log(pc.cyan(`\n✨ Initializing Blazon Brand Book in ${pc.bold(destDir)}...\n`));

  const configPath = path.join(destDir, 'blazon.json');
  const hadConfig = fs.existsSync(configPath);
  const copied = copyStarter(destDir, templateDir, { minimal: options.minimal });
  const kept = copied.kept;
  const written = copied.written.map((f) => path.relative(destDir, f).split(path.sep).join('/')).sort();
  // The build output stays out of git (manual chapter 15). Written here, never copied from the starter: npm leaves a `.gitignore` out of a package
  const ignored = ensureBuildIgnored(destDir);
  if (ignored.status === 'created') written.push('.gitignore');
  const created = new Set(written);
  options.report?.({
    dir: destDir,
    created: written,
    kept: kept.map((f) => path.relative(destDir, f).split(path.sep).join('/')).sort(),
    updated: ignored.status === 'updated' ? ['.gitignore'] : [],
  });

  // A new config is named after the project folder: "acme-brand" -> "Acme Brand Book".
  if (!hadConfig && fs.existsSync(configPath)) {
    const config = readJson(configPath);
    // The description is blazon's own: a new book says what it is until its owner writes it
    writeJson(configPath, { ...config, title: brandTitle(destDir), description: 'Brand guidelines, built from design tokens' });
  }

  // One line for each top-level folder and file init wrote, built from what was written so the list cannot fall behind the starter
  const created_lines = topLevelLines(written, ignored.added);
  const updated_lines = ignored.status === 'updated' ? [`.gitignore (added ${ignored.added.join(', ')})`] : [];

  let plan: Plan = { answers };
  if (prompter) {
    try {
      plan = await runGuided({ prompter, look, dir: destDir, kept: kept.length, network: options.network });
    } catch (err) {
      if (err instanceof PromptCancelled) {
        prompter.cancel('Stopped. The starter was copied as it is, and nothing else was changed.');
        return 130;
      }
      throw err;
    }
  } else {
    for (const line of created_lines) console.log(`  ${pc.green('✔')} Created ${line}`);
    for (const line of updated_lines) console.log(`  ${pc.green('✔')} Updated ${line}`);
    if (kept.length > 0) console.log(`  ${pc.yellow('!')} ${kept.length} starter files were already here and are kept as they are`);
    console.log();
  }

  // Apply
  const from: string | SiteInput | undefined = plan.site?.url ?? options.from ?? saved;
  const fromLabel = typeof from === 'string' ? from : from?.label;
  let code = 0;
  let site: FromSiteResult | undefined;
  const spin = prompter?.spinner();
  spin?.start('Writing the brand book');
  if (from !== undefined) {
    try {
      site = await applyFromSite(destDir, from, created, new Date(), { page: plan.site?.findings.page ?? page, skipVars: plan.site?.skipVars, network: options.network });
      if (!prompter) {
        console.log(pc.bold(`Read from ${fromLabel}:`));
        for (const file of site.written) console.log(`  ${pc.green('✔')} Wrote ${file}`);
        for (const item of site.removed) console.log(`  ${pc.green('✔')} Removed ${item}`);
        for (const item of site.repointed) console.log(`  ${pc.green('✔')} Re-pointed ${item}`);
        for (const item of site.missing) console.log(`  ${pc.yellow('!')} ${item}`);
        console.log(pc.dim('\n  All of it is marked needs-review: it is a starting point, so confirm it with the brand owner.\n'));
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      options.failure?.({ code: 'site-unreadable', message: reason });
      if (prompter)
        prompter.log.error(
          `Could not read ${fromLabel}: ${reason}\nThe starter was copied as it is. To start from the site, run blazon init again with --from in a new folder (a folder that already has the starter is kept as it is), or carry on with the starter.`,
        );
      else {
        console.error(pc.red(`blazon init: ${reason}`));
        console.error(
          pc.dim(
            '  The starter was copied as it is. To start from the site, run blazon init again with --from in a new folder (a folder that already has the starter is kept as it is), or carry on with the starter.\n',
          ),
        );
      }
      code = 2;
    }
  }
  let applied: ReturnType<typeof applyAnswers>;
  try {
    applied = applyAnswers(destDir, plan.answers, created);
  } catch (err) {
    spin?.error('Could not write the brand book');
    throw err;
  }
  spin?.stop('Wrote the brand book');

  // Report. Every step is a command or a path that works from the folder blazon was run in: `blazon init a` says `blazon dev a`.
  const em = (t: string): string => (look.color ? pc.cyan(t) : t);
  const dir = shownDir(destDir);
  // A minimal book has no pages and no agent guide, so its steps name neither
  const nextSteps = options.minimal
    ? [
        `Run ${em(blazonCommand('dev', dir))} to see the book`,
        `Replace blazon's logo in ${em(inDir(dir, 'assets/logos/'))}`,
        `Run ${em(blazonCommand('check', dir))} to see what is left`,
      ]
    : [
        `Run ${em(blazonCommand('dev', dir))} to see the book`,
        `Replace blazon's artwork in ${em(inDir(dir, 'assets/'))} and the text in ${em(inDir(dir, 'docs/'))}`,
        `Run ${em(blazonCommand('check', dir))} to see what is left`,
        `Point a coding agent at ${em(inDir(dir, 'AGENTS.md'))}: it is the guide for editing this brand`,
      ];
  // A site that gave no logo leaves blazon's own: say what to do, since blazon check warns about it
  if (site && !site.written.some((file) => file.startsWith('assets/logos/')))
    nextSteps.splice(
      1,
      0,
      `Add your logo: the book still shows blazon's own. Put it in ${em(inDir(dir, 'assets/logos/'))} and point ${em('logo')} in ${em(inDir(dir, 'blazon.json'))} at it`,
    );
  // The colors step says what is already done: --color set the primary, a site wrote the palette
  const colors = em(inDir(dir, 'tokens/colors.json'));
  const colorStep = applied.set.some((item) => item.startsWith('primary color'))
    ? `Finish the palette in ${colors}: the primary color is set, the rest is still blazon's`
    : site?.written.includes('tokens/colors.json')
      ? `Confirm the colors read from the site in ${colors} with the brand owner`
      : `Edit ${colors} with your colors`;
  if (prompter) {
    const wrote = [...created_lines.map((l) => `Created ${l}`), ...updated_lines.map((l) => `Updated ${l}`)];
    if (site)
      wrote.push(`Read from ${fromLabel}: ${site.written.length} files written, ${site.removed.length} starter files removed`, ...site.missing.map((m) => `Not found: ${m}`));
    for (const item of applied.set) wrote.push(`Set ${item}`);
    wrote.push(...applied.hints.map((h) => `Note: ${h}`));
    prompter.note(wrote.join('\n'), 'What was written');
    if (code === 0) prompter.note([...nextSteps.map((s, i) => `${i + 1}. ${s}`), '', PROJECT_LINE].join('\n'), 'Next steps');
    let dev: boolean;
    try {
      dev = options.dev ?? (await prompter.confirm({ message: 'Start the dev server now?', initialValue: false }));
    } catch (err) {
      if (!(err instanceof PromptCancelled)) throw err;
      prompter.cancel('Stopped. Everything above was written.');
      return code === 0 ? 130 : code;
    }
    prompter.outro(dev ? 'Starting blazon dev. Press Ctrl-C to stop it.' : `Done. Run ${em(blazonCommand('dev', dir))} when you are ready.`);
    if (dev) await (options.startDev ?? startDev)(destDir);
    return code;
  }

  for (const hint of applied.hints) console.log(`  ${pc.yellow('!')} ${hint}`);
  if (applied.set.length > 0) console.log(`  ${pc.green('✔')} Set ${applied.set.join(', ')}\n`);
  if (code === 0) {
    console.log(pc.bold('Next steps:'));
    console.log(`  1. ${colorStep}`);
    nextSteps.forEach((step, i) => console.log(`  ${i + 2}. ${step}`));
    console.log(`\n  ${PROJECT_LINE}`);
  }
  console.log();
  if (options.dev) await (options.startDev ?? startDev)(destDir);
  return code;
}

async function startDev(dir: string): Promise<void> {
  const { runDev } = await import('./dev.js');
  await runDev(dir);
}
