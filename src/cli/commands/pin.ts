import pc from '../../core/colors.js';
import { BLAZON_LOCK, writeBlazonPin, type BlazonIdentity } from '../../core/blazon-pin.js';
import { requireFolder } from '../project.js';

/** `blazon pin [dir]`: write blazon.lock naming the blazon that runs it. Returns the exit status: 0, or 1 when this blazon is not a commit that can be named. `identity` is for tests. */
export function runPin(cwd: string = process.cwd(), options: { json?: boolean; identity?: BlazonIdentity | null } = {}): number {
  requireFolder(cwd);
  try {
    const commit = options.identity === undefined ? writeBlazonPin(cwd) : writeBlazonPin(cwd, options.identity);
    if (options.json) process.stdout.write(`${JSON.stringify({ command: 'pin', passed: true, commit, file: BLAZON_LOCK })}\n`);
    else console.log(`pinned blazon ${pc.bold(commit)} in ${BLAZON_LOCK}; commit the file with the book`);
    return 0;
  } catch (err) {
    // Under --json the caller says the error as JSON as well; the text form prints it here
    if (options.json) throw err;
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
