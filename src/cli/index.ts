import path from 'node:path';
import { cac } from 'cac';
import { runDev } from './commands/dev.js';
import { runBuild } from './commands/build.js';
import { runTokens } from './commands/tokens.js';
import { runInit } from './commands/init.js';
import { runPreview } from './commands/preview.js';
import { runCheck } from './commands/check.js';
import { runPlugin } from './commands/plugin.js';
import { runPin } from './commands/pin.js';
import { runDrift } from './commands/drift.js';
import { runApprovals } from './commands/approvals.js';
import { applyAllowDirs, applyCwd } from './commands/cwd.js';
import { runDoctor } from './commands/doctor.js';
import { JSON_COMMANDS, registerOperations } from './operations.js';
import { runMcp } from './commands/mcp.js';
import { runExplain } from './commands/explain.js';
import { failed, isUsageError, jsonErrors, refuse, sentence } from './errors.js';
import { restoreOptionText } from './options.js';
import { asJson, initAsJson, SEVERITIES, type SeverityOption } from './json.js';
import { helpSections } from './help.js';
import { closest } from '../core/suggest.js';
import { BLAZON_VERSION } from '../core/version.js';

/** The port a command was given, or the reason (exit 2, nothing started) it is not one. */
function portOf(command: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const text = String(value);
  const port = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(port >= 1 && port <= 65535))
    refuse(`blazon ${command}: the port must be a whole number from 1 to 65535, not "${text}".`, 'invalid-port', { fix: 'Give a whole number from 1 to 65535.' });
  return port;
}

/** What `--host` asked for: nothing (localhost only), every interface (no address) or one address. The parser reads a number-like address as a number. */
const hostOf = (value: string | boolean | number | undefined): string | boolean | undefined => (typeof value === 'number' ? String(value) : value);

/** `--no-plugins` runs none, so it cannot also name one to run: exit 2, nothing started. */
function pluginFlags(command: string, options?: { plugin?: unknown; plugins?: boolean }): void {
  if (options?.plugins === false && options.plugin !== undefined)
    refuse(`blazon ${command}: --no-plugins runs no plugin, so it cannot be used with --plugin.`, 'conflicting-options', { fix: 'Leave out --no-plugins, or leave out --plugin.' });
}

/** The level `--severity` names, or the reason (exit 2, nothing run) it is not one. */
function severityOf(command: string, value: unknown, json: unknown): SeverityOption | undefined {
  if (value === undefined) return undefined;
  if (!json)
    refuse(`blazon ${command}: --severity cuts the list that --json prints; add --json, or leave --severity out.`, 'conflicting-options', {
      fix: 'Add --json, or leave --severity out.',
    });
  if (!SEVERITIES.includes(value as SeverityOption))
    refuse(`blazon ${command}: --severity must be error, warning or info, not "${String(value)}".`, 'invalid-option-value', { fix: 'Use --severity error, warning or info.' });
  return value as SeverityOption;
}

/** The first word typed after `blazon`, when it is a command whose output `--json` can ask for. */
const jsonCommandOf = (argv: string[]): string | undefined => {
  const [first, second] = argv.slice(2).filter((arg, i, all) => !arg.startsWith('-') && all[i - 1] !== '--cwd' && all[i - 1] !== '--allow-dir');
  if (!argv.includes('--json') || first === undefined) return undefined;
  if (first === 'plugin') return second === 'check' ? 'plugin check' : undefined;
  return ['check', 'build', 'tokens', 'init', 'drift', 'approvals', 'pin', 'explain', 'doctor', ...JSON_COMMANDS, 'mcp'].includes(first) ? first : undefined;
};

/** `blazon help` and `blazon help <command>` are `--help` and `<command> --help`: the first thing a person types after a tool they do not know. */
function helpAlias(argv: string[]): string[] {
  if (argv[2] !== 'help') return argv;
  const command = argv[3];
  return command !== undefined && !command.startsWith('-') ? [...argv.slice(0, 2), command, '--help', ...argv.slice(4)] : [...argv.slice(0, 2), '--help'];
}

export async function runCli(rawArgv: string[] = process.argv): Promise<void> {
  const argv = helpAlias(rawArgv);
  const debug = argv.includes('--debug');
  jsonErrors(jsonCommandOf(argv));
  const cli = cac('blazon');
  cli.option('--debug', 'Show the stack of an error');
  cli.option('--allow-dir <folder>', 'Approve a folder outside the project for an asset category dir (repeat for more; or BLAZON_ALLOW_DIRS)');
  cli.option('--cwd <dir>', 'Work from this folder, as if blazon were run there; a folder argument is then relative to it');

  cli
    .command('dev [dir]', 'Start interactive Brand Book dev server with HMR')
    .option('-p, --port <port>', 'Port number to listen on (default: the port in blazon.json, else 3000)')
    .option('--strict-port', 'Exit 2 when the port is in use, instead of taking the next free one')
    .option('--host [address]', 'Listen on this address, or on every network interface with no address (default: localhost only)')
    .action(async (dir?: string, options?: { port?: number; strictPort?: boolean; host?: string | boolean }) => {
      try {
        await runDev(dir ? dir : process.cwd(), portOf('dev', options?.port), { strictPort: options?.strictPort, host: hostOf(options?.host) });
      } catch (err) {
        failed('dev', err, debug);
      }
    });

  cli
    .command('build [dir]', 'Build static brand book site and compiled design tokens')
    .option('-o, --outDir <dir>', 'Output directory for static site')
    .option('--plugin <program>', 'Run a plugin program that the config does not allow or the lock does not pin, once, with a warning (repeat for more)')
    .option('--no-plugins', 'Run no plugin at all, whatever the config lists: the tokens and the book only (no browser needed)')
    .option('--json', 'Print the findings as JSON on standard output; everything else goes to standard error')
    .option('--severity <level>', 'With --json: list only the findings at this level or worse (error, warning or info); the counts stay whole')
    .action(async (dir?: string, options?: { outDir?: string; plugin?: string | string[]; plugins?: boolean; json?: boolean; severity?: string }) => {
      try {
        pluginFlags('build', options);
        const severity = severityOf('build', options?.severity, options?.json);
        // -o is a path from where blazon is run; runBuild takes one from the book
        const build = () => runBuild(dir ? dir : process.cwd(), options?.outDir === undefined ? undefined : path.resolve(process.cwd(), options.outDir), options);
        if (options?.json) await asJson('build', false, build, severity, dir ? dir : process.cwd());
        else await build();
      } catch (err) {
        failed('build', err, debug);
      }
    });

  cli
    .command('tokens [dir]', 'Compile design tokens only (theme.css, tokens.ts, tokens.json)')
    .option('--plugin <program>', 'Run a plugin program that the config does not allow or the lock does not pin, once, with a warning (repeat for more)')
    .option('--no-plugins', 'Run no plugin at all, whatever the config lists: the tokens and the book only (no browser needed)')
    .option('--json', 'Print the findings as JSON on standard output; everything else goes to standard error')
    .option('--severity <level>', 'With --json: list only the findings at this level or worse (error, warning or info); the counts stay whole')
    .action(async (dir?: string, options?: { plugin?: string | string[]; plugins?: boolean; json?: boolean; severity?: string }) => {
      try {
        pluginFlags('tokens', options);
        const severity = severityOf('tokens', options?.severity, options?.json);
        const tokens = () => runTokens(dir ? dir : process.cwd(), options);
        if (options?.json) await asJson('tokens', false, tokens, severity, dir ? dir : process.cwd());
        else await tokens();
      } catch (err) {
        failed('tokens', err, debug);
      }
    });

  cli
    .command('check [dir]', 'Check tokens: aliases, types, usage rules, contrast pairs, duplicates and review flags')
    .option('--strict', 'Treat warnings as errors (useful for CI/CD pipelines)')
    .option('--plugin <program>', 'Run a plugin program that the config does not allow or the lock does not pin, once, with a warning (repeat for more)')
    .option('--no-plugins', 'Run no plugin at all, whatever the config lists: the tokens and the book only (no browser needed)')
    .option('--json', 'Print the findings as JSON on standard output; everything else goes to standard error')
    .option('--severity <level>', 'With --json: list only the findings at this level or worse (error, warning or info); the counts stay whole')
    .action(async (dir?: string, options?: { strict?: boolean; plugin?: string | string[]; plugins?: boolean; json?: boolean; severity?: string }) => {
      try {
        pluginFlags('check', options);
        const severity = severityOf('check', options?.severity, options?.json);
        const check = () => runCheck(dir ? dir : process.cwd(), options?.strict, options);
        if (options?.json) await asJson('check', Boolean(options.strict), check, severity, dir ? dir : process.cwd());
        else if (!(await check()).passed) process.exitCode = 1;
      } catch (err) {
        failed('check', err, debug);
      }
    });

  registerOperations(cli, debug);

  cli
    .command('mcp', 'Set up blazon-mcp, the MCP server for coding agents: --print-config prints what registers it in a client, --check tests that it works; neither writes a file')
    .option('--print-config', 'Print the config that registers blazon-mcp (stdio) in a client')
    .option('--check', 'Test that the server is built, finds blazon, answers a real MCP handshake and is registered in the client; runs no plugin')
    .option('--client <client>', 'With --print-config or --check: claude-code (default), claude-desktop, cursor or vscode')
    .option('--brand <dir>', 'The brand folder: with --print-config, written into the config as an absolute path; with --check, the folder the server starts on')
    .option('--name <name>', "The server's name in the client: by default the brand's title as a slug, such as acme-brand (blazon when the brand has none)")
    .option('--json', 'Print the config or the check as JSON on standard output')
    .action(async (options?: { printConfig?: boolean; check?: boolean; client?: string; brand?: string; name?: string; json?: boolean }) => {
      try {
        process.exitCode = await runMcp(options);
      } catch (err) {
        failed('mcp', err, debug);
      }
    });

  cli
    .command('drift [target]', 'Find tokens that have drifted from the live site: compare each token that names a source.cssVar with a page (http or https address) or a CSS file')
    .option('--json', 'Print the findings as JSON')
    .option('--tokens <dir>', 'Read the tokens from this folder instead of the one the config names')
    .action(async (target?: string, options?: { json?: boolean; tokens?: string }) => {
      try {
        process.exitCode = await runDrift(target, options);
      } catch (err) {
        failed('drift', err, debug);
      }
    });

  cli
    .command(
      'approvals [dir]',
      'List the tokens and assets marked review ok with the fingerprint of their value today, to record in review.value so `blazon check` sees a later change',
    )
    .option('--json', 'Print the list as JSON on standard output')
    .action(async (dir?: string, options?: { json?: boolean }) => {
      try {
        process.exitCode = await runApprovals(dir ? dir : process.cwd(), { json: options?.json });
      } catch (err) {
        failed('approvals', err, debug);
      }
    });

  cli
    .command(
      'plugin [action] [target]',
      'Plugins: `check <program>` checks that a program follows the plugin protocol, `pin <path>` prints the digest that pins it, `profile` prints the profile blazon enforces',
    )
    .option('--name <name>', 'With `pin`: record the pin in blazon.plugins.lock under this plugin name')
    .option('--digest <digest>', 'With `pin --name`: the digest you vouch for; the bytes must be those')
    .option('--entry <path>', 'With `pin --name` on a directory: the program inside it, when it is not blazon-<name>')
    .option('--json', 'With `check`: print the cases as JSON on standard output')
    .option('--core', "With `check`: run only the core cases of the protocol (1 to 5), not blazon's role cases or the layout of a shipped plugin")
    .action(async (action?: string, target?: string, options?: { name?: string; digest?: string; entry?: string; json?: boolean; core?: boolean }) => {
      try {
        if (options?.json && action !== 'check')
          refuse('blazon plugin: --json is for `blazon plugin check`; `pin` prints a digest and `profile` prints JSON already.', 'conflicting-options', {
            fix: 'Leave out --json, or use it with `blazon plugin check`.',
          });
        if (options?.core && action !== 'check')
          refuse('blazon plugin: --core is for `blazon plugin check`; `pin` and `profile` run no cases.', 'conflicting-options', {
            fix: 'Leave out --core, or use it with `blazon plugin check`.',
          });
        if (action !== 'pin')
          for (const flag of ['name', 'digest', 'entry'] as const)
            if (options?.[flag] !== undefined)
              refuse(`blazon plugin: --${flag} is for \`blazon plugin pin\`; \`${action ?? 'check'}\` does not take it.`, 'conflicting-options', {
                fix: `Leave out --${flag}, or use it with \`blazon plugin pin\`.`,
              });
        if (action === 'profile' && target !== undefined)
          refuse('blazon plugin: `profile` takes no target.', 'conflicting-options', { fix: 'Run `blazon plugin profile` on its own.' });
        process.exitCode = await runPlugin(action, target, options);
      } catch (err) {
        failed('plugin', err, debug);
      }
    });

  cli
    .command('explain [code]', 'Explain a finding code: its severity, what it means, the fix and where to read more; with no code, list every code')
    .option('--json', 'Print the explanation as JSON on standard output')
    .action((code?: string, options?: { json?: boolean }) => {
      try {
        process.exitCode = runExplain(code, { json: options?.json });
      } catch (err) {
        failed('explain', err, debug);
      }
    });

  cli
    .command('pin [dir]', 'Pin the blazon you build with: write blazon.lock with the commit of the blazon that runs this, so check, tokens and build refuse any other')
    .option('--json', 'Print the pinned commit as JSON on standard output')
    .action((dir?: string, options?: { json?: boolean }) => {
      try {
        process.exitCode = runPin(dir ? dir : process.cwd(), { json: options?.json });
      } catch (err) {
        failed('pin', err, debug);
      }
    });

  cli
    .command('init [dir]', 'Scaffold a new Blazon brand book and design token structure')
    .option('--from <url>', 'Start from a live site: read its stylesheets and page for the brand colors, fonts, logo and title (all marked needs-review)')
    .option('--from-dir <folder>', 'Start from a saved copy of a site, offline: its index.html (or the page named) and stylesheets, nothing outside it')
    .option('--name <text>', 'With `init`: the brand book title, as given')
    .option('--description <text>', 'With `init`: one sentence on the brand: the config description')
    .option('--color <hex>', 'With `init`: the primary color as hex, with or without the #: #2563eb, 2563eb or #26e')
    .option('--font <family>', 'With `init`: the font family, a Google Fonts name')
    .option('--logo <file>', 'With `init`: an SVG or PNG file to use as the logo')
    .option('--minimal', 'With `init`: copy only the smallest brand (four token files, the logo and the config), with no pages, fonts, dark theme or agent guide')
    .option('--dev', 'With `init`: start `blazon dev` when it is done')
    .option('--json', 'Print what init made as JSON on standard output; everything else goes to standard error (never asks)')
    .option('--yes', 'With `init`: accept every default and never ask')
    .option('--no-input', 'With `init`: same as --yes; implied when stdin or stdout is not a terminal')
    .action(
      async (
        dir?: string,
        options?: {
          from?: string;
          fromDir?: string;
          name?: string;
          color?: string;
          font?: string;
          logo?: string;
          minimal?: boolean;
          dev?: boolean;
          yes?: boolean;
          input?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          if (options?.json) {
            if (options.dev)
              refuse('blazon init: --dev starts a server that never ends, so it cannot be used with --json.', 'conflicting-options', {
                fix: 'Leave out --dev, or leave out --json.',
              });
            process.exitCode = await initAsJson(dir || '.', options);
          } else process.exitCode = await runInit(dir || '.', { ...options });
        } catch (err) {
          failed('init', err, debug);
        }
      },
    );

  cli
    .command('preview [dir]', 'Preview the static production brand book build')
    .option('-p, --port <port>', 'Port number to listen on (default: the port in blazon.json, else 3000)')
    .option('--strict-port', 'Exit 2 when the port is in use, instead of taking the next free one')
    .option('--host [address]', 'Listen on this address, or on every network interface with no address (default: localhost only)')
    .action(async (dir?: string, options?: { port?: number; strictPort?: boolean; host?: string | boolean }) => {
      try {
        await runPreview(dir ? dir : process.cwd(), portOf('preview', options?.port), { strictPort: options?.strictPort, host: hostOf(options?.host) });
      } catch (err) {
        failed('preview', err, debug);
      }
    });

  cli
    .command('doctor', 'Check this machine and folder: Node version, brand folder, plugin folder safety, Chrome (if a plugin needs it) and blazon.lock; writes nothing')
    .option('--json', 'Print the checks as JSON on standard output')
    .action(async (options?: { json?: boolean }) => {
      try {
        process.exitCode = await runDoctor(process.cwd(), { json: options?.json });
      } catch (err) {
        failed('doctor', err, debug);
      }
    });

  cli.example('  $ blazon init my-brand');
  cli.example('  $ blazon check my-brand --json');
  cli.example('  $ blazon build my-brand');
  cli.example('  $ blazon list ./my-brand --type color');
  cli.example('  $ blazon get color.brand.primary my-brand --json');
  cli.example('  $ blazon can text.primary surface.canvas my-brand');
  cli.help((sections) => helpSections(sections, cli.matchedCommand?.name, cli.args[0]));
  cli.version(BLAZON_VERSION);

  // Nothing typed: show what can be typed. Printing nothing and exiting 0 reads as a command that worked.
  if (argv.slice(2).length === 0) return cli.outputHelp();

  cli.addEventListener('command:*', (event) => {
    // `blazon chek --help` has shown the help already: say nothing more
    if (cli.options.help || cli.options.version) return;
    const typed = String((event as CustomEvent).detail);
    const meant = closest(typed, cli.commands.map((command) => command.name).filter(Boolean));
    refuse(`blazon: unknown command "${typed}"${meant ? `; did you mean "${meant}"?` : '.'} Run blazon --help for the commands.`, 'unknown-command', {
      fix: meant ? `Run blazon ${meant}, or blazon --help for the commands.` : 'Run blazon --help for the commands.',
    });
  });

  try {
    cli.parse(argv, { run: false });
    restoreOptionText(cli, argv);
    try {
      // Before --cwd moves the process: a relative folder is relative to where blazon was started
      applyAllowDirs(cli.options.allowDir);
      applyCwd(cli.options.cwd);
    } catch (err) {
      failed(cli.matchedCommand?.name ?? '', err, debug);
    }
    await cli.runMatchedCommand();
  } catch (error) {
    if (!isUsageError(error)) return failed('', error, debug);
    const command = cli.matchedCommand?.name;
    const where = command ? `blazon ${command}` : 'blazon';
    const [, dashes = '', unknown] = /^Unknown option `(-{1,2})([^`]+)`$/.exec(error.message) ?? [];
    const stack = debug ? error.stack : undefined;
    // `-p -1`: the parser reads -1 as an option of its own
    if (unknown !== undefined && /^\d+$/.test(unknown) && (command === 'dev' || command === 'preview'))
      refuse(`blazon ${command}: the port must be a whole number from 1 to 65535, not "-${unknown}".`, 'invalid-port', { fix: 'Give a whole number from 1 to 65535.' });
    if (command === 'get' && /^missing required args/i.test(error.message))
      refuse('blazon get: give a token path, such as blazon get color.brand.primary; blazon list shows the token paths.', 'missing-argument', {
        stack,
        fix: 'Run blazon list to see the token paths.',
      });
    if (unknown === undefined)
      refuse(`${where}: ${sentence(error.message)}. Run ${where} --help for the options.`, 'missing-argument', { stack, fix: `Run ${where} --help for the options.` });
    // `--dir brand`: every command that reads a brand takes the folder as its last argument, and `--cwd` works on all of them
    if (dashes === '--' && ['dir', 'project', 'path'].includes(unknown)) {
      const takesDir = cli.matchedCommand?.args.some((arg) => arg.value === 'dir');
      refuse(
        `${where}: unknown option --${unknown}: ${takesDir ? `give the folder as the last argument, ${where} <dir>, or use --cwd <dir>` : 'use --cwd <dir> to run it in another folder'}`,
        'unknown-option',
        { stack, fix: takesDir ? `Write ${where} <dir>, or use --cwd <dir>.` : 'Use --cwd <dir>.' },
      );
    }
    const known = [...(cli.matchedCommand?.options ?? []), ...cli.globalCommand.options].map((option) => option.name);
    const meant = closest(unknown, known);
    refuse(`${where}: unknown option "${dashes}${unknown}"${meant ? `; did you mean "--${meant}"?` : '.'} Run ${where} --help for the options.`, 'unknown-option', {
      stack,
      fix: meant ? `Use --${meant}, or run ${where} --help for the options.` : `Run ${where} --help for the options.`,
    });
  }
}
