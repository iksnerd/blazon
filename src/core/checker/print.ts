import type { Finding, TokenItem } from '../../types/index.js';
import { finding } from './catalogue.js';

const isSingleLine = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && !/[\r\n]/.test(v);

/**
 * The `print` values of a token, each checked on its own:
 * - `ral` is a RAL number such as "5012": one non-empty line, without the "RAL" the book writes before it.
 * - `cmyk` is four numbers from 0 to 100, percent of each ink.
 * - `pms` is a Pantone name such as "2945 C": one non-empty line.
 */
export function printFindings(item: TokenItem): Finding[] {
  const print = item.blazon.print;
  const found: Finding[] = [];
  const message = (key: string, problem: string, value: unknown) => `print.${key} ${problem}, got ${JSON.stringify(value)}`;

  const cmyk: unknown = print?.cmyk;
  if (cmyk !== undefined && !(Array.isArray(cmyk) && cmyk.length === 4 && cmyk.every((n) => typeof n === 'number' && n >= 0 && n <= 100))) {
    found.push(finding('print-cmyk-invalid', { path: item.path, message: message('cmyk', 'must be four numbers from 0 to 100 such as [100, 60, 0, 30]', cmyk) }));
  }

  const pms: unknown = print?.pms;
  if (pms !== undefined && !isSingleLine(pms)) {
    found.push(finding('print-pms-invalid', { path: item.path, message: message('pms', 'must be a non-empty single-line string such as "2945 C"', pms) }));
  }

  const ral: unknown = print?.ral;
  if (ral !== undefined) {
    // "RAL" followed by anything but a letter: "RAL 5012", "RAL-5012", "RAL5012". `\b` missed the last, a digit being a word character.
    const problem = !isSingleLine(ral)
      ? 'must be a non-empty single-line string such as "5012"'
      : /^\s*ral(?![a-z])/i.test(ral)
        ? 'is written without the "RAL" prefix, which the book adds: use "5012", not "RAL 5012"'
        : undefined;
    if (problem) found.push(finding('print-ral-invalid', { path: item.path, message: message('ral', problem, ral) }));
  }

  return found;
}
