/** `info` is a note for the author: it never fails a check, even with --strict, and the brand book does not show it. */
export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  code: string;
  severity: Severity;
  /** Token or group path the finding is about, or a file name for parse errors */
  path: string;
  message: string;
  /** Set when the finding only occurs in one resolver context, e.g. "locale=ja" */
  context?: string;
  /** The file the finding is about, relative to the project, when `path` names a token or an asset: "tokens/colors.json" */
  file?: string;
  /** The line (1-based) in `file` where the key of the token `path` names is written, or, for invalid-json, where the parser stopped. Left out when it is not known */
  line?: number;
  /** What to do about this finding, when it is not the fix the catalogue gives its code: a plugin-failed finding carries the fix for its own cause */
  fix?: string;
}
