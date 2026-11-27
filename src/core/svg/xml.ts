// A reader for the SVG a logo is: elements and their attributes, nothing else. It is not an XML parser. It does not expand entities beyond the
// five the language defines and character references, it never reads a DOCTYPE, and it fetches nothing, so a logo cannot make it open a
// file or a URL. The geometry is in the attributes; an element's own text (a `<style>` sheet, say) is kept as `text`, for a reader that must
// judge it.

export interface XmlElement {
  /** The tag without its namespace prefix: `svg:rect` is `rect` */
  tag: string;
  attrs: Map<string, string>;
  children: XmlElement[];
  /** The element's own text and CDATA, decoded and joined, without its children's */
  text: string;
}

/** The document is not something this reader can take apart; the message says where. */
export class XmlError extends Error {}

const MAX_DEPTH = 200;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

const local = (name: string): string => name.slice(name.lastIndexOf(':') + 1);

/** Where `needle` first appears at or after `from`, or an XmlError saying what was left open. */
function after(text: string, needle: string, from: number, what: string): number {
  const at = text.indexOf(needle, from);
  if (at < 0) throw new XmlError(`${what} is never closed`);
  return at + needle.length;
}

/** The end of a `<!DOCTYPE ...>`, which may hold a bracketed subset with `>` inside it. Nothing in it is read. */
function afterDoctype(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const ch = text[at];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === '>' && depth <= 0) return at + 1;
  }
  throw new XmlError('<!DOCTYPE is never closed');
}

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

/** The root element of a document. */
export function parseXml(source: string): XmlElement {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('<', at);
    const top = stack[stack.length - 1];
    if (top) top.text += decode(text.slice(at, open < 0 ? text.length : open));
    if (open < 0) break;
    if (text.startsWith('<!--', open)) at = after(text, '-->', open + 4, 'a comment');
    else if (text.startsWith('<![CDATA[', open)) {
      at = after(text, ']]>', open + 9, 'a CDATA section');
      if (top) top.text += text.slice(open + 9, at - 3);
    } else if (text.startsWith('<?', open)) at = after(text, '?>', open + 2, 'a processing instruction');
    else if (text.startsWith('<!', open)) at = afterDoctype(text, open + 2);
    else if (text.startsWith('</', open)) {
      const end = after(text, '>', open + 2, 'a closing tag');
      const name = local(text.slice(open + 2, end - 1).trim());
      const top = stack.pop();
      if (!top || top.tag !== name) throw new XmlError(`</${name}> closes ${top ? `<${top.tag}>` : 'nothing'}`);
      at = end;
    } else {
      const named = /^<([^\s/>]+)/.exec(text.slice(open, open + 256));
      if (!named) throw new XmlError('a < that opens no tag');
      const element: XmlElement = { tag: local(named[1]!), attrs: new Map(), children: [], text: '' };
      let cursor = open + named[0].length;
      for (;;) {
        while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
        if (cursor >= text.length) throw new XmlError(`<${element.tag}> is never closed`);
        if (text[cursor] === '>' || (text[cursor] === '/' && text[cursor + 1] === '>')) break;
        ATTRIBUTE.lastIndex = cursor;
        const attribute = ATTRIBUTE.exec(text);
        if (!attribute) throw new XmlError(`<${element.tag}> has an attribute this reader cannot take apart near "${text.slice(cursor, cursor + 20)}"`);
        const key = attribute[1]!;
        // The first value of an attribute wins, and a prefixed one (xlink:href) does not shadow a plain one
        if (!element.attrs.has(key)) element.attrs.set(key, decode(attribute[2] ?? attribute[3] ?? ''));
        cursor = ATTRIBUTE.lastIndex;
      }
      const selfClosing = text[cursor] === '/';
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(element);
      else if (root) throw new XmlError('there is more than one root element');
      else root = element;
      if (!selfClosing) {
        stack.push(element);
        if (stack.length > MAX_DEPTH) throw new XmlError(`elements are nested more than ${MAX_DEPTH} deep`);
      }
      at = cursor + (selfClosing ? 2 : 1);
    }
  }
  if (stack.length > 0) throw new XmlError(`<${stack[stack.length - 1]!.tag}> is never closed`);
  if (!root) throw new XmlError('there is no element');
  return root;
}
