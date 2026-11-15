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
 * The forms section 3.5 has the host scrub: as it is, base64 in both alphabets without padding, and URL-encoded as a
 * query (a space as `+`), with `%20` for the space, and as a path segment. The unpadded base64 form is also the start
 * of the padded one, so it finds both.
 */
export function encodings(value: string): Buffer[] {
  const raw = Buffer.from(value);
  return [
    raw,
    Buffer.from(raw.toString('base64').replace(/=+$/, '')),
    Buffer.from(raw.toString('base64url')),
    Buffer.from(quote(value, ' ').replaceAll(' ', '+')),
    Buffer.from(quote(value, '')),
    // Go's url.PathEscape leaves these unescaped; the reference checks agree.
    Buffer.from(quote(value, '$&+,:;=@')),
  ];
}
