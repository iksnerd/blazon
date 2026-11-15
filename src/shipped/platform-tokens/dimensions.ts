// A dimension token as dp, the unit Android and Compose use and the point size iOS uses: a px is 1 dp and a rem is 16.

const REM = 16;

function one(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)?$/.exec(value.trim());
    return match ? parseFloat(match[1]!) * (match[2] === 'rem' ? REM : 1) : undefined;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const { value: amount, unit } = value as { value?: unknown; unit?: unknown };
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
    return unit === 'px' ? amount : unit === 'rem' ? amount * REM : undefined;
  }
  return undefined;
}

/** The dp of a token from its resolved value ({ value, unit }) or, failing that, its CSS value ("24px"); undefined for any other unit or a calculation. */
export const readDimension = (resolved: unknown, value: unknown): number | undefined => one(resolved) ?? one(value);

/** A number of dp as text, without float noise */
export const dp = (amount: number): string => String(Number(amount.toFixed(4)));
