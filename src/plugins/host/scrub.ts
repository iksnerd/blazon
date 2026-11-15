import { encodings } from '../wire/forms.js';

// What a host does with a plugin's output before it stores, shows or logs any of it (RFC 0005 section 3.5).

export const REDACTED = '[REDACTED]';

/**
 * Remove every labelled value from `text`, and the forms of it that section 3.5 has the host scrub. Each place one
 * was found becomes REDACTED, and the text around it is kept. It looks for every form at every position, overlaps
 * included, and replaces the union of the places once, so two secrets that overlap leave no tail of either behind.
 * A value is text, never a pattern, and an empty secret matches nothing. A string comes back a string, a Buffer a Buffer.
 */
export function scrub<T extends string | Buffer>(text: T, secrets: Iterable<string>): T {
  const isText = typeof text === 'string';
  const spans: [number, number][] = [];
  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of encodings(secret)) {
      const needle: string | Buffer = isText ? form.toString() : form;
      let at = (text as string | Buffer).indexOf(needle as never);
      while (at >= 0) {
        spans.push([at, at + needle.length]);
        at = (text as string | Buffer).indexOf(needle as never, at + 1);
      }
    }
  }
  if (spans.length === 0) return text;
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pieces: (string | Buffer)[] = [];
  let end = 0;
  for (let i = 0; i < spans.length; ) {
    const start = spans[i]![0];
    let stop = spans[i]![1];
    i += 1;
    while (i < spans.length && spans[i]![0] <= stop) {
      stop = Math.max(stop, spans[i]![1]);
      i += 1;
    }
    pieces.push(isText ? (text as string).slice(end, start) : (text as Buffer).subarray(end, start), isText ? REDACTED : Buffer.from(REDACTED));
    end = stop;
  }
  pieces.push(isText ? (text as string).slice(end) : (text as Buffer).subarray(end));
  return (isText ? pieces.join('') : Buffer.concat(pieces as Buffer[])) as T;
}
