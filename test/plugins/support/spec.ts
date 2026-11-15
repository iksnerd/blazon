import { execFileSync } from '../../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { onTestFinished } from 'vitest';

// Where the plugin protocol conformance corpus is, and how a case file is read. The copy in test/spec/ is made by
// scripts/vendor-spec-corpus.py, and a test (source.test.ts) fails when its files and its recorded digest disagree.

export const SPEC = path.resolve(__dirname, '../../spec');

/** The repository root, for the tests that run the real command. */
export const ROOT_DIR = path.resolve(__dirname, '../../..');

/** The one role the tests give a manifest, and the only role their profile defines. A case writes `$role` where any role will do. */
export const TEST_ROLE = 'test-role';

/** The case files of one corpus folder (`core/<folder>` by default), sorted. A folder with none means the corpus moved: that is a failure, not a pass. */
export function caseFiles(folder: string, base = 'core'): string[] {
  const dir = path.join(SPEC, base, folder);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(dir, name));
  if (files.length === 0) throw new Error(`no cases in ${dir}: the corpus moved or the test looks in the wrong place`);
  return files;
}

/**
 * When CONFORMANCE_READS names a file, a line for each corpus file a test reads, and whether that test passed, is added to `<file>.lines`:
 * the raw material of the report of what the host's own tests cover (scripts/conformance-reads.ts makes the `reads-v1` of it). Nothing
 * is written otherwise. Only a case read through loadCase counts: the test that checks the copy's digest reads every file and runs none.
 * The line says which test and which attempt it is, so that a test that passed on a retry is not counted as failing. vitest runs
 * `onTestFinished` before `onTestFailed`, so a flag set by the second would still be unset in the first: the state is read from the task,
 * which the runner has already set by then.
 */
function recordRead(file: string): void {
  const out = process.env.CONFORMANCE_READS;
  if (!out) return;
  const name = path.relative(SPEC, file).split(path.sep).join('/');
  onTestFinished(({ task }) => {
    const line = { file: name, test: task.id, attempt: task.result?.retryCount ?? 0, passed: task.result?.state !== 'fail' };
    fs.appendFileSync(`${out}.lines`, `${JSON.stringify(line)}\n`);
  });
}

/** One case file, read strictly: an unknown key is an error in the case, as the corpus README asks. */
export function loadCase(file: string, allowed: readonly string[]): any {
  const text = JSON.parse(fs.readFileSync(file, 'utf-8'));
  recordRead(file);
  const unknown = Object.keys(text).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${path.basename(file)}: unknown keys ${unknown.join(', ')}`);
  return text;
}

export const name = (file: string) => path.relative(SPEC, file);

export interface Entry {
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'fifo';
  exec?: boolean;
  content?: string;
  target?: string;
}

/** Build the tree a case describes under `into`, and return the path to hash. A FIFO and a newline in a name are what git cannot hold. */
export function materialize(found: { kind: string; root?: string; entries?: Entry[] }, into: string): string {
  const tree = path.join(into, 'tree');
  fs.mkdirSync(tree, { mode: 0o755 });
  fs.chmodSync(tree, 0o755);
  for (const entry of found.entries ?? []) {
    const where = path.join(tree, entry.path);
    if (entry.type === 'dir') {
      fs.mkdirSync(where, { mode: 0o755 });
      fs.chmodSync(where, 0o755);
    } else if (entry.type === 'file') {
      fs.writeFileSync(where, Buffer.from(entry.content ?? '', 'utf-8'));
      fs.chmodSync(where, entry.exec ? 0o755 : 0o644);
    } else if (entry.type === 'symlink') fs.symlinkSync(entry.target!, where);
    else execFileSync('mkfifo', ['-m', '644', where]);
  }
  const target = found.kind === 'file' ? path.join(tree, found.entries![0]!.path) : tree;
  if (found.root !== 'symlink') return target;
  const link = path.join(into, 'link');
  fs.symlinkSync(target, link);
  return link;
}

