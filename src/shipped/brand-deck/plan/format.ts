import { has, isObject } from '../brand.js';

/** An integer when the value is whole, so 180.0 reads and compares as 180. */
export function number(value: number): number {
  return Number.isInteger(value) ? value : Math.round(value * 1000) / 1000;
}

/** `webUsage` and `web-usage` become "Web usage". */
export function humanize(name: string): string {
  const words = name
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** (r, g, b, alpha) from #rgb, #rgba, #rrggbb or #rrggbbaa; undefined for any other value. */
export function parseHex(value: unknown): [number, number, number, number] | undefined {
  const match = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(String(value).trim());
  if (!match) return undefined;
  let digits = match[1]!;
  if (digits.length === 3 || digits.length === 4) digits = [...digits].map((ch) => ch + ch).join('');
  const channels = (digits.match(/../g) ?? []).map((pair) => parseInt(pair, 16));
  return [channels[0]!, channels[1]!, channels[2]!, channels.length === 4 ? channels[3]! / 255 : 1];
}

export const lastName = (path: string): string => path.slice(path.lastIndexOf('.') + 1);
export const parentOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('.'), 0));

export const unique = <T>(items: Iterable<T>): T[] => [...new Set(items)];

export const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
export const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export function sourceLine(source: unknown): string | null {
  return isObject(source) && has(source.doc) && has(source.locator) ? `Source: ${String(source.doc)}, ${String(source.locator)}` : null;
}
