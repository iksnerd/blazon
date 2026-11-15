/** An SVG that is safe to keep: no script, no event handler, a namespace. */
export function cleanSvg(svg: string): string {
  let out = svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
  if (!/<svg\b[^>]*\sxmlns\s*=/i.test(out)) out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `${out.trim()}\n`;
}
