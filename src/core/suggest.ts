/** The edit distance between two words: the fewest single-letter inserts, deletes and changes that turn one into the other. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/**
 * The name that `typed` was most likely meant to be, or undefined when none is near. A name is near when it is within a third
 * of the longer word's length (at least one letter) of what was typed: `chek` is `check`, `zzzzzzzz` is nothing. The first
 * of two equally near names wins.
 */
export function closest(typed: string, names: string[]): string | undefined {
  let best: { name: string; away: number } | undefined;
  for (const name of names) {
    const away = distance(typed.toLowerCase(), name.toLowerCase());
    if (away > Math.max(1, Math.floor(Math.max(typed.length, name.length) / 3))) continue;
    if (!best || away < best.away) best = { name, away };
  }
  return best?.name;
}
