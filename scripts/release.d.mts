export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function releaseChangelog(text: string, version: string, date: string): string;
export function release(version: string | undefined, cwd?: string, now?: Date): void;
