export interface AllowlistEntry {
  id: string;
  package: string;
  reason: string;
  expires: string;
}
export type FindingStatus = 'allowed' | 'noted' | 'blocking' | 'expired' | 'stale' | 'error';
export interface Finding {
  id: string;
  package: string;
  severity: string;
  status: FindingStatus;
  message: string;
}
export function validateAllowlist(value: unknown): AllowlistEntry[];
export function evaluate(reports: unknown, allowlist: unknown, today: string): { ok: boolean; findings: Finding[] };
export function formatTable(findings: Finding[]): string;
