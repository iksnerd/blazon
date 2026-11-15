// The forms a leaked value commonly takes. The check looks for them and the scrubber removes them, so both read one
// list (RFC 0005 section 3.5).

/** Percent-encode the UTF-8 bytes of `value` the way Python's `urllib.parse.quote` does: letters, digits and `_.-~` stay, as do the characters in `safe`. */
function quote(value: string, safe: string): string {
  let out = '';
  for (const byte of Buffer.from(value)) {
    const ch = String.fromCharCode(byte);
    out += /[A-Za-z0-9_.\-~]/.test(ch) || (byte < 0x80 && safe.includes(ch)) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * The characters of `value` in base64 as they stand whatever bytes sit around it, when `lead` bytes come before it (0, 1 or 2: the
 * three alignments a value can have in a larger base64 string, such as Basic auth's `user:` + value). The characters that hold bits of
 * the lead bytes are left out at the start, and the last character is left out when it holds bits of the bytes that follow.
 */
function embedded(value: string, lead: number, url: boolean): string {
  const bytes = Buffer.concat([Buffer.alloc(lead), Buffer.from(value)]);
  const text = bytes.toString(url ? 'base64url' : 'base64').replace(/=+$/, '');
  const start = [0, 2, 3][lead]!; // the characters that hold any bit of the lead bytes
  return text.slice(start, bytes.length % 3 === 0 ? undefined : -1);
}

/** A JSON string's body for `value`: quotes, backslashes and control characters escaped as JSON does (`\"`, `\\`, `\n`). */
const jsonBody = (value: string): string => JSON.stringify(value).slice(1, -1);
const hex4 = (unit: number, upper: boolean): string => `\\u${unit.toString(16).padStart(4, '0')[upper ? 'toUpperCase' : 'toLowerCase']()}`;

/**
 * The forms section 3.5 has the host scrub: as it is, base64 in both alphabets without padding, and URL-encoded as a
 * query (a space as `+`), with `%20` for the space, and as a path segment. The unpadded base64 form is also the start
 * of the padded one, so it finds both. After those, in this order, so that the first six keep their places:
 *
 * - the percent-encoded forms with lowercase hex (`%2f`), where that differs;
 * - base64 of a larger string that the value sits inside, at each of the three alignments and in both alphabets: the part that
 *   does not depend on the bytes around the value (Basic auth sends `base64("api:" + value)`);
 * - the value as the body of a JSON string, with non-ASCII characters as `\uXXXX` in either case of hex, and with `<`, `>` and `&`
 *   escaped as Go's encoder does.
 */
export function encodings(value: string): Buffer[] {
  const raw = Buffer.from(value);
  const forms: string[] = [
    value,
    raw.toString('base64').replace(/=+$/, ''),
    raw.toString('base64url'),
    quote(value, ' ').replaceAll(' ', '+'),
    quote(value, ''),
    // Go's url.PathEscape leaves these unescaped; the reference checks agree.
    quote(value, '$&+,:;=@'),
  ];
  const first = forms.length;
  for (const form of forms.slice(3, first)) forms.push(form.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()));
  for (const lead of [0, 1, 2]) for (const url of [false, true]) forms.push(embedded(value, lead, url));
  const body = jsonBody(value);
  const ascii = (upper: boolean, html: boolean) =>
    Array.from(body, (ch) => {
      const unit = ch.charCodeAt(0);
      return ch.length === 1 && unit < 0x80 && !(html && '<>&'.includes(ch)) ? ch : Array.from({ length: ch.length }, (_, i) => hex4(ch.charCodeAt(i), upper)).join('');
    }).join('');
  for (const html of [false, true]) for (const upper of [false, true]) forms.push(ascii(upper, html));
  forms.push(body);
  // The first six keep their places even when two are alike; a form added after them is added once, and never empty
  const kept = forms.slice(0, first);
  for (const form of forms.slice(first)) if (form !== '' && !kept.includes(form)) kept.push(form);
  return kept.map((form) => Buffer.from(form));
}
