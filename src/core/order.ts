import type { Finding } from '../types/index.js';

/** Compares two strings by UTF-16 code unit. It gives the same answer on every host, which a locale-aware compare does not. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

/** A missing optional value sorts before a present one. */
function compareOptional<T extends string | number>(a: T | undefined, b: T | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The total order of findings (RFC 0001 section 4): severity (error, warning, info), then path, code, context, file, line and
 * message. Strings compare by code unit and a missing context, file or line sorts before a present one.
 */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    compareText(a.path, b.path) ||
    compareText(a.code, b.code) ||
    compareOptional(a.context, b.context) ||
    compareOptional(a.file, b.file) ||
    compareOptional(a.line, b.line) ||
    compareText(a.message, b.message)
  );
}
