// The numbers the report and the figure print. They are written the way the Python this plugin replaced wrote them (round half to even,
// at the digit asked for), so that a report and a figure are the same bytes whichever wrote them, and so the goldens taken from the
// Python still hold. JavaScript rounds a tie up; Python rounds it to the even digit. A tie can only be exact for a value that is a
// whole number of 1/2^(digits+1), and no other value is affected.

const isTie = (value: number, digits: number): boolean => {
  const scaled = value * 2 ** (digits + 1);
  return Number.isInteger(scaled) && Math.abs(scaled) % 2 === 1;
};

/** `value` rounded to `digits` decimal places, a tie to the even digit. */
export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  if (isTie(value, digits)) {
    const scaled = value * factor;
    const floor = Math.floor(scaled);
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Number(value.toFixed(digits));
}

/** `value` with exactly `digits` decimal places, a tie to the even digit, as Python's `f"{value:.{digits}f}"`. */
export function fixed(value: number, digits: number): string {
  const rounded = round(value, digits);
  const text = rounded.toFixed(digits);
  return Object.is(rounded, -0) || (rounded === 0 && value < 0) ? `-${text.replace(/^-/, '')}` : text;
}

/** `fixed` with a leading + on a value that is not negative, as `f"{value:+.1f}"`. */
export const signed = (value: number, digits: number): string => {
  const text = fixed(value, digits);
  return text.startsWith('-') ? text : `+${text}`;
};

/** A coordinate in a figure: three places, the zeros after the point dropped. */
export function coordinate(value: number): string {
  return fixed(value, 3).replace(/0+$/, '').replace(/\.$/, '');
}
