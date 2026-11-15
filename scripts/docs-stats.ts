import fs from 'node:fs';
import path from 'node:path';
import { CHECKS } from '../src/core/checker/catalogue.js';
import { commandOperations, OPERATIONS, toolOperations, type CliSpec } from '../src/core/operations/index.js';

// docs/stats.json: the numbers, names and lists a website about blazon shows, read from the code. A site must not type them.
// `npm run docs:stats` writes it; test/docs/stats.test.ts fails when the committed file differs from what this builds.

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf-8');

export interface Stats {
  schema: 1;
  version: string;
  commands: { name: string; usage: string; summary: string }[];
  checks: { total: number; error: number; warning: number; info: number };
  mcpTools: { name: string; title: string; description: string }[];
  chapters: { number: number; file: string; title: string }[];
  /** From package.json. */
  package: { name: string; license: string; node: string; repository: string; issues: string };
  /** From README.md: the word after "Status:", the Quick start commands and the agent setup prompt, as written there. */
  readme: { status: string; quickStart: string; agentPrompt: string };
}

/** The commands registered by hand in src/cli/index.ts, then the read commands from the operations list, as the manual test reads them. */
function commands(): Stats['commands'] {
  const cli = read('src/cli/index.ts');
  const handWritten = [...cli.matchAll(/\.command\(\s*'([a-z]+)((?: [^']*)?)',\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => ({
    name: m[1]!,
    usage: `blazon ${m[1]!}${m[2]!}`,
    summary: m[3]!.replace(/\\'/g, "'"),
  }));
  const fromList = commandOperations(OPERATIONS).map((op) => {
    const spec = op.cli as CliSpec;
    const positional = spec.positional.map((p) => `[${p}]`).join(' ');
    return { name: spec.command[0]!, usage: `blazon ${spec.command.join(' ')}${positional ? ` ${positional}` : ''}`, summary: spec.summary };
  });
  return [...handWritten, ...fromList];
}

function chapters(): Stats['chapters'] {
  return fs
    .readdirSync(path.join(ROOT, 'docs/manual'))
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const title = /^# (.+)$/m.exec(read(`docs/manual/${file}`))?.[1];
      if (!title) throw new Error(`docs/manual/${file} has no H1`);
      return { number: Number(file.slice(0, 2)), file, title };
    });
}

/** The first fenced block with this language after the heading. */
function blockAfter(text: string, heading: string, lang: string): string {
  const from = text.indexOf(`\n## ${heading}\n`);
  if (from === -1) throw new Error(`README.md has no "## ${heading}" section`);
  const block = new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```').exec(text.slice(from + 1));
  if (!block) throw new Error(`README.md "${heading}" has no ${lang} block`);
  return block[1]!;
}

function readme(): Stats['readme'] {
  const text = read('README.md');
  const status = /Status: ([a-z-]+)/.exec(text)?.[1];
  if (!status) throw new Error('README.md has no "Status: <word>" line');
  return { status, quickStart: blockAfter(text, 'Quick start', 'bash'), agentPrompt: blockAfter(text, 'Set up with your agent', 'text') };
}

export function buildStats(): Stats {
  const pkg = JSON.parse(read('package.json')) as {
    name: string;
    version: string;
    license: string;
    engines: { node: string };
    repository: { url: string };
    bugs: { url: string };
  };
  const severities = Object.values(CHECKS).map((c) => c.severity);
  const count = (s: string) => severities.filter((x) => x === s).length;
  return {
    schema: 1,
    version: pkg.version,
    commands: commands(),
    checks: { total: severities.length, error: count('error'), warning: count('warning'), info: count('info') },
    mcpTools: toolOperations(OPERATIONS).map((op) => ({ name: op.name, title: op.title, description: op.description })),
    chapters: chapters(),
    package: {
      name: pkg.name,
      license: pkg.license,
      node: pkg.engines.node,
      repository: pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
      issues: pkg.bugs.url,
    },
    readme: readme(),
  };
}

export const statsText = () => `${JSON.stringify(buildStats(), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  fs.writeFileSync(path.join(ROOT, 'docs/stats.json'), statsText());
  console.log('wrote docs/stats.json');
}
