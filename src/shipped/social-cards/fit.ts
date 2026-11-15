const FACTOR = 0.92;

/** Type sizes from `start` down to `floor`, each 8% smaller than the one before, the last exactly the floor. */
export function typeSteps(start: number, floor: number): number[] {
  const steps = [Math.round(start)];
  for (let size = Math.round(start * FACTOR); size > floor; size = Math.min(size - 1, Math.round(size * FACTOR))) {
    if (size < steps.at(-1)!) steps.push(size);
  }
  if (steps.at(-1)! > floor) steps.push(Math.round(floor));
  return steps;
}

/** The first (largest) step at which the text fits, or the floor with `fits: false` when none does. */
export async function fitHeadline(steps: readonly number[], fits: (size: number) => boolean | Promise<boolean>): Promise<{ size: number; fits: boolean }> {
  for (const size of steps) if (await fits(size)) return { size, fits: true };
  return { size: steps.at(-1)!, fits: false };
}
