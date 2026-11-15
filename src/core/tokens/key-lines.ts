/** Where each key of a JSON text sits, found without a parser that would drop the positions. */

/** The line (1-based) of each key, by dotted path: `color.brand.$value`, `list.1.k` for an array's second item. Only the first of a repeated key is kept. Text that is not JSON gives an empty map. */
export function keyLines(text: string): Map<string, number> {
  const found = new Map<string, number>();
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  const fail = (): never => {
    throw new SyntaxError('not JSON');
  };
  const skip = (): void => {
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '\n') line++;
      else if (c !== ' ' && c !== '\t' && c !== '\r') return;
    }
  };
  /** Reads a string starting at the quote and returns its value. A raw newline cannot be in one. */
  const string = (): string => {
    const start = i++;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '\\') i++;
      else if (c === '"') return JSON.parse(text.slice(start, ++i)) as string;
      else if (c === '\n') fail();
    }
    return fail();
  };
  const value = (path: string[]): void => {
    skip();
    const c = text[i];
    if (c === '{') {
      i++;
      skip();
      if (text[i] === '}') return void i++;
      for (;;) {
        skip();
        if (text[i] !== '"') fail();
        const at = line;
        const key = string();
        const here = [...path, key];
        const name = here.join('.');
        if (!found.has(name)) found.set(name, at);
        skip();
        if (text[i++] !== ':') fail();
        value(here);
        skip();
        const next = text[i++];
        if (next === '}') return;
        if (next !== ',') fail();
      }
    } else if (c === '[') {
      i++;
      skip();
      if (text[i] === ']') return void i++;
      for (let index = 0; ; index++) {
        value([...path, String(index)]);
        skip();
        const next = text[i++];
        if (next === ']') return;
        if (next !== ',') fail();
      }
    } else if (c === '"') {
      string();
    } else {
      const word = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 40));
      if (!word) fail();
      i += word![0].length;
    }
  };

  try {
    value([]);
    skip();
    if (i < text.length) fail();
    return found;
  } catch {
    return new Map();
  }
}

/** The line a JSON parser's complaint is about: from "(line L column C)" when the message has it, else from "position N" counted in `text`. */
export function jsonErrorLine(message: string, text: string): number | undefined {
  const named = /\(line (\d+) column \d+\)/.exec(message);
  if (named) return Number(named[1]);
  const position = /position (\d+)/.exec(message);
  if (!position) return undefined;
  const at = Number(position[1]);
  if (at > text.length) return undefined;
  let line = 1;
  for (let i = 0; i < at; i++) if (text[i] === '\n') line++;
  return line;
}
