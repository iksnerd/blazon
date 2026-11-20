/** Where each key of a JSON text sits, found without a parser that would drop the positions. */

/** The text without one leading byte order mark, which an editor on Windows may write and `JSON.parse` refuses. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** A JSON number as the grammar spells it: no leading zero, no bare sign, no trailing point. Sticky, so it matches at `lastIndex` only. */
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** An object or array the scanner is inside: its own path, and the index of the item it is reading (arrays only). */
interface Frame {
  readonly kind: 'object' | 'array';
  readonly path: string | undefined;
  index: number;
}

/** Thrown for text that breaks the JSON grammar; `keyLines` turns it into an empty map. Any other error is a bug and goes up. */
class NotJson extends SyntaxError {}

/** The path of a child: the parent's, a dot, the child's name. The top value has no path, so its children are just their names. */
const child = (parent: string | undefined, name: string): string => (parent === undefined ? name : `${parent}.${name}`);

/** The line (1-based) of each key, by dotted path: `color.brand.$value`, `list.1.k` for an array's second item. Only the first of a repeated key is kept. Text that is not JSON gives an empty map. */
export function keyLines(text: string): Map<string, number> {
  const found = new Map<string, number>();
  try {
    new Scanner(text, found).document();
    return found;
  } catch (error) {
    if (error instanceof NotJson) return new Map();
    throw error;
  }
}

/**
 * Walks one JSON text and records the line of each key. It keeps a stack of open containers instead of calling itself, so depth is limited by memory, not by the call stack.
 * The scanner checks the grammar itself except inside a string, where `JSON.parse` is the authority on escapes and control characters.
 */
class Scanner {
  /** Offset of the next character to read. */
  private i: number;
  /** Line (1-based) of that character. Only `\n` ends a line, so `\r\n` counts once and a lone `\r` not at all. */
  private line = 1;
  private readonly stack: Frame[] = [];

  constructor(
    private readonly text: string,
    private readonly found: Map<string, number>,
  ) {
    this.i = text.length - stripBom(text).length;
  }

  /** One value, then nothing but whitespace. */
  document(): void {
    this.values();
    this.skipSpace();
    if (this.i < this.text.length) this.fail();
  }

  private fail(): never {
    throw new NotJson('not JSON');
  }

  private skipSpace(): void {
    const { text } = this;
    for (; this.i < text.length; this.i++) {
      const c = text[this.i];
      if (c === '\n') this.line++;
      else if (c !== ' ' && c !== '\t' && c !== '\r') return;
    }
  }

  /** The main loop: read a value at `path`. A non-empty container opens a frame and goes on to its first item. Any other value ends, and the frames it closes are popped. */
  private values(): void {
    const { text, stack } = this;
    let path: string | undefined;
    for (;;) {
      this.skipSpace();
      const c = text[this.i];
      if (c === '{') {
        this.i++;
        this.skipSpace();
        if (text[this.i] !== '}') {
          stack.push({ kind: 'object', path, index: 0 });
          path = this.member(path);
          continue;
        }
        this.i++;
      } else if (c === '[') {
        this.i++;
        this.skipSpace();
        if (text[this.i] !== ']') {
          stack.push({ kind: 'array', path, index: 0 });
          path = child(path, '0');
          continue;
        }
        this.i++;
      } else if (c === '"') {
        this.string();
      } else {
        this.literal();
      }
      const next = this.afterValue();
      if (next === undefined) return;
      path = next.path;
    }
  }

  /** A value has ended. Pops every container that ends here and returns where the next value sits, or undefined when the top value is complete. */
  private afterValue(): { path: string } | undefined {
    const { text, stack } = this;
    for (;;) {
      const frame = stack[stack.length - 1];
      if (!frame) return undefined;
      this.skipSpace();
      const c = text[this.i++];
      if (c === ',') {
        if (frame.kind === 'object') return { path: this.member(frame.path) };
        return { path: child(frame.path, String(++frame.index)) };
      }
      if (c !== (frame.kind === 'object' ? '}' : ']')) this.fail();
      stack.pop();
    }
  }

  /** Reads `"key" :` of an object member, records the key's line if it is new, and returns the member's path. */
  private member(parent: string | undefined): string {
    this.skipSpace();
    if (this.text[this.i] !== '"') this.fail();
    const at = this.line;
    const path = child(parent, this.string());
    if (!this.found.has(path)) this.found.set(path, at);
    this.skipSpace();
    if (this.text[this.i++] !== ':') this.fail();
    return path;
  }

  /** Reads a string from its opening quote to its closing one and returns its value. A raw newline cannot be in one. */
  private string(): string {
    const { text } = this;
    const start = this.i++;
    for (; this.i < text.length; this.i++) {
      const c = text[this.i];
      if (c === '"') return this.decode(text.slice(start, ++this.i));
      // A backslash and the character after it make one escape, so an escaped quote does not end the string. Whether the escape is a valid one is for the JSON.parse above.
      if (c === '\\') this.i++;
      else if (c === '\n') this.fail();
    }
    return this.fail();
  }

  /** The value of a quoted string, or a failure when it holds a bad escape or a raw control character. */
  private decode(quoted: string): string {
    try {
      return JSON.parse(quoted) as string;
    } catch {
      return this.fail();
    }
  }

  /** Reads `true`, `false`, `null` or a number. */
  private literal(): void {
    const { text } = this;
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, this.i)) {
        this.i += word.length;
        return;
      }
    }
    NUMBER.lastIndex = this.i;
    const number = NUMBER.exec(text);
    if (!number) this.fail();
    this.i += number![0].length;
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
