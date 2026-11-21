import path from 'node:path';
import pc from '../../core/colors.js';
import { loadProject } from '../project.js';
import { compileBlazonData } from '../../core/index.js';
import { categoryDirs } from '../../core/assets/categories.js';
import { approvals } from '../../core/checker/approvals.js';

/** Where a recorded fingerprint stands against the value today. */
type Standing = 'recorded' | 'stale' | 'not recorded';

/**
 * Prints every token and asset id marked `review.status: ok` with the fingerprint of its value today and whether `review.value` holds
 * it, so a person who has confirmed a value can copy the fingerprint into the review. It writes nothing. Returns the exit status.
 */
export async function runApprovals(dir: string = process.cwd(), options: { json?: boolean } = {}): Promise<number> {
  const config = await loadProject(dir);
  const data = await compileBlazonData(config, dir);
  const found = approvals(data.tokens, data.assets.all, { assetsDir: path.resolve(dir, config.assetsDir), dirs: categoryDirs(config.assets, dir) });
  const standing = (a: (typeof found)[number]): Standing => (a.review.value === undefined ? 'not recorded' : a.review.value === a.current ? 'recorded' : 'stale');
  if (options.json) {
    // fingerprint is the value today (null for a token with no value); state says whether review.value holds it; an asset id lists its files
    const approvals = found.map((a) => ({ path: a.path, fingerprint: a.current ?? null, state: standing(a), ...(a.files && { files: a.files }) }));
    process.stdout.write(`${JSON.stringify({ command: 'approvals', passed: true, approvals })}\n`);
    return 0;
  }
  if (found.length === 0) {
    console.log(pc.dim('\n  No token or asset is marked review.status: ok.\n'));
    return 0;
  }
  const width = Math.max(...found.map((a) => a.path.length));
  console.log();
  for (const a of found) {
    const state = standing(a);
    const paint = state === 'recorded' ? pc.green : state === 'stale' ? pc.yellow : pc.dim;
    const files = a.files ? `  ${pc.dim(a.files.join(', '))}` : '';
    console.log(`  ${a.path.padEnd(width)}  ${(a.current ?? '(no value)').padEnd(12)}  ${paint(state)}${' '.repeat(12 - state.length)}${files}`.trimEnd());
  }
  console.log();
  console.log(pc.dim('  Set review.value to the fingerprint once a person has confirmed the value.\n'));
  return 0;
}
