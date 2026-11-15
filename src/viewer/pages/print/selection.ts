/** What a print hash asks for: the chapters, and the cover's own title and subtitle when it carries them. */
export interface PrintHash {
  selection: string;
  title?: string;
  subtitle?: string;
}

/** `#print`, `#print/essentials` or `#print/pages=a,b`, then optionally `?title=...&subtitle=...` (percent-encoded). */
export function parsePrintHash(hash: string): PrintHash {
  const [path = '', query = ''] = splitOnce(hash, '?');
  const parsed: PrintHash = { selection: path.slice('#print/'.length) };
  for (const part of query.split('&')) {
    const [key = '', value = ''] = splitOnce(part, '=');
    if (key !== 'title' && key !== 'subtitle') continue;
    try {
      const text = decodeURIComponent(value);
      if (text !== '') parsed[key] = text;
    } catch {
      // A malformed escape is ignored: the cover keeps the brand's own words
    }
  }
  return parsed;
}

function splitOnce(text: string, at: string): [string, string?] {
  const i = text.indexOf(at);
  return i < 0 ? [text] : [text.slice(0, i), text.slice(i + 1)];
}
