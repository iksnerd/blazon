export function compareVersions(a: string, b: string): -1 | 0 | 1;
export const FRAGMENT_KINDS: readonly string[];
export interface Fragment {
  file: string;
  kind: string;
  body: string;
}
export function unreleasedText(text: string): string;
export function readFragments(cwd?: string): Fragment[];
export function assembleSection(fragments: Fragment[], version: string, date: string): string;
export function releaseChangelog(text: string, version: string, date: string, fragments?: Fragment[]): string;
export function previewChangelog(cwd?: string, now?: Date): string;
export function release(version: string | undefined, cwd?: string, now?: Date): void;
