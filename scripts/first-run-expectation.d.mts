export interface FirstRunExpectation {
  errors: number;
  codes: Record<string, string>;
  max: Record<string, number>;
}
export function firstRunProblems(result: { findings: { code: string; severity: string; path: string; file?: string; message: string }[] }, expected: FirstRunExpectation): string[];
