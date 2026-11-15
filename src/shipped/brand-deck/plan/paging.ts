/** Each chunk with its slide title, numbered when there are several. */
export function titled<T>(title: string, chunks: T[][]): [string, T[]][] {
  return chunks.map((chunk, index) => [chunks.length > 1 ? `${title} (${index + 1} of ${chunks.length})` : title, chunk]);
}

/** Items over as few slides of at most `count` as that allows, shared as evenly as they divide, in order: seven over slides of six are four and three, never six and one. */
export function balanced<T>(items: T[], count: number): T[][] {
  if (items.length === 0) return [];
  const slides = Math.ceil(items.length / count);
  const base = Math.floor(items.length / slides);
  const extra = items.length % slides;
  const chunks: T[][] = [];
  let start = 0;
  for (let index = 0; index < slides; index++) {
    const size = base + (index < extra ? 1 : 0);
    chunks.push(items.slice(start, start + size));
    start += size;
  }
  return chunks;
}

/** Split items evenly over slides of at most `count`, numbering the titles when there are several. */
export function paged<T>(title: string, count: number, items: T[]): [string, T[]][] {
  return titled(title, balanced(items, count));
}
