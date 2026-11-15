// Field checks that a sidecar and the `assets` config block share, so one shape means the same thing in both.

/** Where a statement came from: a document and the place in it. */
export interface Source {
  doc: string;
  locator: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSource(value: unknown): value is Source {
  return isObject(value) && typeof value.doc === 'string' && typeof value.locator === 'string';
}

/** A list of plain strings with at least one entry and no blank one. */
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
}

export const SOURCE_MESSAGE = 'source must be {"doc": string, "locator": string}';

export const listMessage = (name: string): string => `${name} must be a non-empty list of strings`;
