import pc from '../../core/colors.js';
import { CHECKS, type CheckCode } from '../../core/checker/catalogue.js';
import { fixFor } from '../../core/checker/fixes.js';
import { closest } from '../../core/suggest.js';
import { UsageError } from '../errors.js';
import { printJson } from '../read.js';

/** What the catalogue says about one code, as `explain` prints it and `--json` carries it. */
function entry(code: CheckCode) {
  const check = CHECKS[code];
  const fix = fixFor(code);
  return { code, severity: check.severity, summary: check.summary, ...(fix !== undefined && { fix }), appliesTo: [...check.appliesTo], rfc: check.rfc, manual: check.manual };
}

type Entry = ReturnType<typeof entry>;

/** `1#4` is section 4 of RFC 0001. */
function rfcText(rfc: string): string {
  const [number = '', section] = rfc.split('#');
  return `RFC ${number.padStart(4, '0')}${section ? `, section ${section}` : ''}`;
}

/** Up to three codes near what was typed, nearest first: the helper that suggests a command, asked again without the one it named. */
function nearest(typed: string): string[] {
  const left = Object.keys(CHECKS);
  const found: string[] = [];
  for (let i = 0; i < 3; i++) {
    const code = closest(typed, left);
    if (code === undefined) break;
    found.push(code);
    left.splice(left.indexOf(code), 1);
  }
  return found;
}

function printOne(item: Entry): void {
  const color = item.severity === 'error' ? pc.red : item.severity === 'warning' ? pc.yellow : pc.dim;
  console.log(`\n  ${pc.bold(item.code)}  ${color(item.severity)}\n`);
  console.log(`  ${item.summary}`);
  if (item.fix !== undefined) console.log(`\n  ${pc.bold('Fix')}  ${item.fix}`);
  console.log(`\n  ${pc.bold('Read')}  docs/manual/${item.manual}.md, ${rfcText(item.rfc)}\n`);
}

/** `blazon explain [code]`: one code in full, or every code with its severity and summary. Exit 2 for a code that does not exist. */
export function runExplain(code: string | undefined, options: { json?: boolean } = {}): number {
  if (code === undefined) {
    const items = Object.keys(CHECKS)
      .sort()
      .map((name) => entry(name as CheckCode));
    if (options.json) printJson('explain', true, { codes: items });
    else {
      const width = Math.max(...items.map((item) => item.code.length));
      console.log();
      for (const item of items) console.log(`  ${item.code.padEnd(width)}  ${item.severity.padEnd(7)}  ${item.summary}`);
      console.log('\n  Run blazon explain <code> for the fix and where to read more.\n');
    }
    return 0;
  }
  if (!Object.hasOwn(CHECKS, code)) {
    const near = nearest(code);
    throw new UsageError(
      `unknown code "${code}"`,
      near.length > 0 ? `Did you mean ${near.map((name) => `"${name}"`).join(', ')}? Run blazon explain to list every code.` : 'Run blazon explain to list every code.',
      'unknown-finding-code',
    );
  }
  const item = entry(code as CheckCode);
  if (options.json) printJson('explain', true, item);
  else printOne(item);
  return 0;
}
