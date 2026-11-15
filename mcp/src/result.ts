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
  brandHasErrors = warnings.some((w) => /\b\d+ error\(s\)/.test(w)),
): ToolResult {
  const structured = { ...document, warnings, brandHasErrors };
  const json = JSON.stringify(structured);
  const lead: ToolResult['content'] = warnings.length > 0 ? [{ type: 'text', text: `Warning from blazon: ${warnings.join(' ')}` }] : [];
  if (json.length <= MAX_TEXT) return { content: [...lead, { type: 'text', text: json }], structuredContent: structured };
  // Cut on code points, so a surrogate pair is never split; every length here counts code points.
  const points = Array.from(json);
  const notice = `Truncated: the answer is ${points.length} characters (Unicode code points) and the limit is ${MAX_TEXT}; ${narrow}.`;
  const whole = (['counts', 'passed'] as const).filter((key) => key in document).map((key) => [key, document[key]] as const);
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
