export type DocPiece = { html: string } | { code: string; language: string };

const FENCE = /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g;

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A page body cut at its fenced code blocks (what marked writes for a fence): prose as html, each fence as its text and language. */
export function splitCodeBlocks(html: string): DocPiece[] {
  const pieces: DocPiece[] = [];
  let last = 0;
  for (const match of html.matchAll(FENCE)) {
    if (match.index > last) pieces.push({ html: html.slice(last, match.index) });
    pieces.push({ code: unescapeHtml(match[2]!), language: match[1] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < html.length) pieces.push({ html: html.slice(last) });
  return pieces;
}
