/** CSS's named easings as control points, so a keyword token can be drawn like a cubic-bezier one. */
const NAMED: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** The four control points of an easing: a DTCG array, a cubic-bezier() string or a CSS keyword. */
export function controlPoints(value: unknown): [number, number, number, number] | undefined {
  if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number')) {
    return value as [number, number, number, number];
  }
  if (typeof value !== 'string') return undefined;
  const named = NAMED[value.trim()];
  if (named) return named;
  const numbers = value
    .match(/^cubic-bezier\(([^)]+)\)$/)?.[1]
    ?.split(',')
    .map(Number);
  return numbers?.length === 4 && numbers.every(Number.isFinite) ? (numbers as [number, number, number, number]) : undefined;
}

/** An SVG path for the curve in a 100×100 box, time to the right and progress upwards. */
export function curvePath([x1, y1, x2, y2]: [number, number, number, number]): string {
  const at = (n: number) => Math.round(n * 1000) / 10;
  return `M0,100 C${at(x1)},${at(1 - y1)} ${at(x2)},${at(1 - y2)} 100,0`;
}

/** A DTCG dimension or duration as CSS text: "2px" stays, {value: 2, unit: "px"} becomes "2px". */
export function measureText(value: unknown): string {
  if (value && typeof value === 'object' && 'value' in value && 'unit' in value) {
    return `${(value as { value: number }).value}${(value as { unit: string }).unit}`;
  }
  return String(value);
}
