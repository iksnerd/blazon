import { inkOnPaint } from './color';

// A color written as text is a badge: a pill filled with the color, in black or white by contrast.

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The badge as HTML, for prose; `tag` is `code` when it stands for a token path. */
export function colorBadgeHtml(paint: string, label: string, tag: 'span' | 'code' = 'span'): string {
  return `<${tag} class="blazon-badge" data-color-badge style="background:${escapeAttr(paint)};color:${inkOnPaint(paint)}">${escapeAttr(label)}</${tag}>`;
}

/**
 * Six- or eight-digit hex and rgb()/rgba() codes. Three-digit hex is left out on purpose: `#123` is as
 * likely an issue number as a color. A `#` or `rgb` glued to a word is not a color either.
 */
export const COLOR_CODE = /(?<![\w&#])(?:#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-zA-Z])|rgba?\(\s*\d{1,3}\s*[,\s]\s*\d{1,3}\s*[,\s]\s*\d{1,3}(?:\s*[,/]\s*[\d.]+%?)?\s*\))/g;

/** Text inside these is a code block, a link or already a badge: a color there is shown as written. Inline code is not in the list: see below. */
const LEAVE_ALONE = 'pre, a, script, style, [data-color-badge]';

/**
 * Doc HTML with each color code in its text turned into a badge: in prose, and in inline code. A code span that is only a color
 * becomes the badge (monospace, like a token path's); in a code span with more in it (`blue.500 #3F73F8`, a gradient
 * `#2050C8 → #1B2642`) each color becomes a badge and the rest stays code. Code blocks, links and attributes are untouched.
 */
export function badgeColorCodes(html: string): string {
  if (!/#[0-9a-fA-F]{6}|rgba?\(/.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

  for (const text of texts) {
    if (text.parentElement?.closest(LEAVE_ALONE)) continue;
    const matches = [...text.data.matchAll(COLOR_CODE)];
    if (matches.length === 0) continue;
    // A code span that is nothing but one color is that color's badge
    const code = text.parentElement?.closest('code');
    if (code && code.childNodes.length === 1 && matches.length === 1 && matches[0]![0] === text.data.trim()) {
      const color = matches[0]![0];
      const badge = doc.createElement('code');
      badge.className = 'blazon-badge';
      badge.setAttribute('data-color-badge', '');
      badge.style.background = color;
      badge.style.color = inkOnPaint(color);
      badge.textContent = color;
      code.replaceWith(badge);
      continue;
    }
    const parts = doc.createDocumentFragment();
    let at = 0;
    for (const match of matches) {
      const start = match.index!;
      if (start > at) parts.append(text.data.slice(at, start));
      const badge = doc.createElement('span');
      badge.className = 'blazon-badge';
      badge.setAttribute('data-color-badge', '');
      badge.style.background = match[0];
      badge.style.color = inkOnPaint(match[0]);
      badge.textContent = match[0];
      parts.append(badge);
      at = start + match[0].length;
    }
    if (at < text.data.length) parts.append(text.data.slice(at));
    text.replaceWith(parts);
  }
  return root.innerHTML;
}
