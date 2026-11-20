/**
 * The largest text block a tool returns, in characters. A bigger answer is cut and says so. About 10 000 tokens, the point where Claude Code
 * starts to warn about a tool result; its own cut is at 25 000 tokens.
 */
export const MAX_TEXT = 40_000;

/** The default and largest number of findings `check_brand` returns. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** An error the model can read: blazon's own message. */
export const failure = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

/** What to do about an answer that is too large, by tool: the arguments that make the question smaller. */
export const NARROW_BY_PATH = 'narrow with a path';
export const NARROW_FINDINGS = 'narrow with severity';
export const NARROW_TOKENS = 'narrow with group or type';
/** For a tool that takes no argument that makes its answer smaller. */
export const NARROW_NONE = 'this tool has no argument that narrows it, so tell the user the brand file is too large to read whole';

// The characters that hide text from a person and not from a model: zero-width and bidirectional controls, and the Unicode tag block.
const INVISIBLE = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;

/**
 * The value with invisible characters taken out of every string and key, and how many were taken out. Text in an answer comes from the brand's
 * files, so a brand can hide an instruction in it; the zero-width joiner and non-joiner stay, because scripts need them.
 */
export function stripInvisible<T>(value: T): { value: T; removed: number } {
  let removed = 0;
  const clean = (text: string): string => text.replace(INVISIBLE, () => (removed++, ''));
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return clean(node);
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === 'object' && node !== null) return Object.fromEntries(Object.entries(node).map(([key, item]) => [clean(key), walk(item)]));
    return node;
  };
  const result = walk(value) as T;
  return { value: result, removed };
}

/** The line that tells the model its answer was cleaned. */
export const removedNotice = (count: number): string => `Removed ${count} invisible character(s) from the brand's text in this answer.`;

/** The pin a tool answer names when the book's blazon.lock is not met: blazon's own words. Absent from an answer when the pin is met. */
export interface PinMismatch {
  pinned: string;
  running: string;
  message: string;
}

/** The line `blazon list`, `get` and the other read commands print for a mismatch (src/core/blazon-pin.ts, pinMismatchLine). */
const PIN_MISMATCH_LINE = /^blazon: pin mismatch \(pinned (\S+), running (.+?)\): (.+)$/;

/** The mismatch in blazon's lines on standard error, or undefined. */
export function pinMismatchIn(warnings: string[]): PinMismatch | undefined {
  for (const line of warnings) {
    const m = PIN_MISMATCH_LINE.exec(line);
    if (m) return { pinned: m[1]!, running: m[2]!, message: m[3]! };
  }
  return undefined;
}

/**
 * Whether the brand's own data has errors, so a value may be wrong. blazon says so: `check --json` in its `brandHasErrors` field, and a read
 * command in an "N error(s)" line on standard error. A pin mismatch is neither: it is `pinMismatch`.
 */
export const hasBrandErrors = (document: Record<string, unknown>, warnings: string[]): boolean =>
  typeof document.brandHasErrors === 'boolean' ? document.brandHasErrors : warnings.some((w) => /\b\d+ error\(s\)/.test(w));

/**
 * A successful answer. `structuredContent` is blazon's document plus `warnings` (what blazon said on standard error) and `brandHasErrors`;
 * the text is the same JSON, compact, as the MCP spec asks for a client that reads only content. Warnings also come first as their own text
 * block, since a model reads that before it reads the value. A document over MAX_TEXT characters is cut in the text, and the
 * structured result then holds the notice, the warnings and, when the document has them, `counts` and `passed`.
 */
export function answerWith(
  document: Record<string, unknown>,
  warnings: string[],
  narrow: string = NARROW_BY_PATH,
  brandHasErrors = hasBrandErrors(document, warnings),
): ToolResult {
  const structured = { ...document, warnings, brandHasErrors };
  const json = JSON.stringify(structured);
  const lead: ToolResult['content'] = warnings.length > 0 ? [{ type: 'text', text: `Warning from blazon: ${warnings.join(' ')}` }] : [];
  if (json.length <= MAX_TEXT) return { content: [...lead, { type: 'text', text: json }], structuredContent: structured };
  // Cut on code points, so a surrogate pair is never split; every length here counts code points.
  const points = Array.from(json);
  const notice = `Truncated: the answer is ${points.length} characters (Unicode code points) and the limit is ${MAX_TEXT}; ${narrow}.`;
  const whole = (['counts', 'passed', 'pinMismatch'] as const).filter((key) => key in document).map((key) => [key, document[key]] as const);
  return {
    content: [...lead, { type: 'text', text: `${points.slice(0, MAX_TEXT).join('')}\n[${notice}]` }],
    structuredContent: { ...Object.fromEntries(whole), truncated: true, notice, warnings, brandHasErrors },
  };
}

/**
 * Keeps the first `limit` items of the list at `key`, and fewer if the answer would still pass MAX_TEXT, so the rest of the document
 * (`counts` and `passed` of a check) always survives whole. Adds `<key>Total`, `truncated` and, when it cut, a `notice`.
 */
export function limitItems(document: Record<string, unknown>, key: string, limit: number, narrow: string, warnings: string[] = []): Record<string, unknown> {
  const all = Array.isArray(document[key]) ? (document[key] as unknown[]) : [];
  const build = (n: number) => ({
    ...document,
    [key]: all.slice(0, n),
    [`${key}Total`]: all.length,
    truncated: n < all.length,
    ...(n < all.length ? { notice: `Showing ${n} of ${all.length} ${key}; ${narrow}${Number.isFinite(limit) ? ', or raise limit' : ''}.` } : {}),
  });
  // answerWith serializes the document with the warnings and brandHasErrors; measure that, so what fits here fits there.
  const fits = (n: number) => JSON.stringify({ ...build(n), warnings, brandHasErrors: true }).length <= MAX_TEXT;
  // The size grows with n, so the largest n that fits is found by binary search.
  let low = 0;
  let high = Math.min(limit, all.length);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return build(low);
}
