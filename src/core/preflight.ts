import type { Finding, BlazonConfig, BlazonData } from '../types/index.js';
import { blazonPinFindings } from './blazon-pin.js';
import { outputDirProblems } from './outputs.js';

// What has to be true before blazon writes anything, in one place. `blazon build` and `blazon tokens` ask it, and so do buildSite and
// emitTokenOutputs themselves, so a program that calls them gets what the command gets: the same refusals, in the same words.
//
// Three things stop a write:
//  - an output folder in the way of an input (outputs.ts): the build would delete the brand, or read its own output back. Never bypassed.
//  - this blazon is not the one the book is pinned to (blazon.lock). Never bypassed: the pin is the operator's statement of which blazon may write.
//  - an error in the brand's own findings, which `blazon check` would fail on. A caller that knows it is building a broken brand (a
//    test, a preview of work in progress) says so with `allowErrors`.

export interface WriteOptions {
  /** Write although the brand has errors in its findings. The unsafe-output and pin refusals still stand */
  allowErrors?: boolean;
}

/** The most errors a refusal names; the rest are counted. */
const SHOWN = 5;

const describe = (finding: Finding): string => `${finding.code}${finding.path ? ` (${finding.path})` : ''}: ${finding.message}`;

/** Whether a finding code is about blazon.lock; those refusals are read fresh from the lock file and never lifted. */
const isPinCode = (code: string): boolean => code.startsWith('blazon-pin-');

/** Why blazon may not write now, as sentences; empty when it may. */
export function writeBlockers(data: BlazonData, config: BlazonConfig, cwd: string, options: WriteOptions = {}): string[] {
  const blockers = outputDirProblems(config, cwd);
  // The pin is read here as well as by the commands that show it, so a caller that never asked for it is still held to it
  const pin = blazonPinFindings(cwd).filter((finding) => finding.severity === 'error');
  const errors = options.allowErrors ? [] : data.findings.filter((finding) => finding.severity === 'error' && !isPinCode(finding.code));
  const refused = [...pin, ...errors];
  if (refused.length > 0) {
    const shown = refused.slice(0, SHOWN).map(describe).join('; ');
    const more = refused.length > SHOWN ? ` and ${refused.length - SHOWN} more` : '';
    blockers.push(`the brand has ${refused.length} error${refused.length === 1 ? '' : 's'}, so nothing is written: ${shown}${more}`);
  }
  return blockers;
}

/** Throws, naming every reason, when blazon may not write. */
export function assertCanWrite(data: BlazonData, config: BlazonConfig, cwd: string, options: WriteOptions = {}): void {
  const blockers = writeBlockers(data, config, cwd, options);
  if (blockers.length > 0) throw new Error(`[blazon] ${blockers.join('; ')}`);
}
