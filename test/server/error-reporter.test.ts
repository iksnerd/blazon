import { describe, it, expect } from 'vitest';
import { ErrorReporter } from '../../src/server/error-reporter.js';
import type { Finding } from '../../src/types/index.js';

// `blazon dev` says in its terminal what is wrong with the brand as it changes: each error once, with where it is and what to do, and a
// line when they are gone. A person or an agent watching the terminal otherwise sees nothing while the book is broken.

const error = (code: string, over: Partial<Finding> = {}): Finding => ({ code, severity: 'error', path: 'color.bad', message: 'it is wrong', ...over });
const run = (reporter: ErrorReporter, findings: Finding[]): string[] => {
  const lines: string[] = [];
  reporter.report(findings, (line) => lines.push(line));
  return lines;
};

describe('ErrorReporter', () => {
  it('says each error in one line: where, its code, the message and what to do', () => {
    const lines = run(new ErrorReporter(), [error('token-value-invalid', { file: 'tokens/colors.json', line: 12, message: '"x" is not a color' })]);
    expect(lines).toEqual(['[blazon] tokens/colors.json:12 [token-value-invalid]: "x" is not a color. Change the value so it fits the token\'s $type; the message says how.']);
  });

  it('names the token path when a finding has no file', () => {
    expect(run(new ErrorReporter(), [error('some-code')])).toEqual(['[blazon] color.bad [some-code]: it is wrong']);
  });

  it('says nothing about warnings and notes', () => {
    expect(run(new ErrorReporter(), [error('x', { severity: 'warning' }), error('y', { severity: 'info' })])).toEqual([]);
  });

  it('says an error once, however many saves leave it there', () => {
    const reporter = new ErrorReporter();
    expect(run(reporter, [error('a')])).toHaveLength(1);
    expect(run(reporter, [error('a')])).toEqual([]);
    expect(run(reporter, [error('a')])).toEqual([]);
  });

  it('says a new error and not the old one again, and says it again when it comes back', () => {
    const reporter = new ErrorReporter();
    run(reporter, [error('a')]);
    expect(run(reporter, [error('a'), error('b')])).toEqual(['[blazon] color.bad [b]: it is wrong']);
    expect(run(reporter, [])).toEqual(['[blazon] the errors are fixed']);
    expect(run(reporter, [error('a')])).toHaveLength(1);
  });

  it('says the errors are fixed once, and nothing for a book that never had one', () => {
    const reporter = new ErrorReporter();
    expect(run(reporter, [])).toEqual([]);
    run(reporter, [error('a')]);
    expect(run(reporter, [])).toEqual(['[blazon] the errors are fixed']);
    expect(run(reporter, [])).toEqual([]);
  });

  it('caps a long list: the first ten, then how many more', () => {
    const many = Array.from({ length: 14 }, (_, i) => error('e', { path: `t.${i}` }));
    const lines = run(new ErrorReporter(), many);
    expect(lines).toHaveLength(11);
    expect(lines.at(-1)).toBe('[blazon] and 4 more errors; run blazon check for all of them');
  });
});
