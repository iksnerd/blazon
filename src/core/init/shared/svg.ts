import { parseXml, XmlError, type XmlElement } from '../../svg/xml.js';

// A logo that `init --from` or `--from-dir` reads comes from a site the user does not control, and the brand book shows it. The decision is
// made on the parsed tree (src/core/svg/xml.ts), never by editing the text: an SVG that holds anything that runs or loads is not imported at
// all, and init keeps its placeholder logo. Editing such a file into a safe one is a game of patterns (unquoted attributes, self-closing
// tags, entities) that a regex loses.

/** Elements that run code or embed another document. */
const ACTIVE = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'handler', 'listener']);
/** Elements that change an attribute over time: one that targets href could swap a safe link for any other. */
const ANIMATION = new Set(['animate', 'set', 'animatemotion', 'animatetransform']);

const local = (name: string): string => name.slice(name.lastIndexOf(':') + 1).toLowerCase();
/** A value as a browser reads it in a URL: ASCII whitespace and control characters dropped, lower case. */
const asUrl = (value: string): string =>
  [...value]
    .filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase();
const SCHEME = /(?:^|[^a-z0-9+.-])(javascript|vbscript|data):/;

/** Why a CSS text (a `style` attribute or a `<style>` sheet) may not be imported: a remote url(), @import, an escape that could hide either. */
function cssRefusal(css: string, where: string): string | undefined {
  if (css.includes('\\')) return `a CSS escape in ${where}`;
  if (/@import/i.test(css)) return `an @import in ${where}`;
  if (/(?:image-set|expression)\s*\(/i.test(css)) return `${/expression/i.test(css) ? 'expression()' : 'image-set()'} in ${where}`;
  return urlRefusal(css, where);
}

/** A url() whose target is not a fragment of this document (`url(#gradient)`). An unclosed url( runs to the end, as CSS reads it. */
function urlRefusal(value: string, where: string): string | undefined {
  for (const match of value.matchAll(/url\s*\(/gi)) {
    const target = value
      .slice(match.index + match[0].length)
      .replace(/^[\s"']+/, '')
      .split(/["')]/)[0]!
      .trim();
    if (!target.startsWith('#')) return `url() to "${target}" in ${where}`;
  }
  return undefined;
}

function elementRefusal(element: XmlElement): string | undefined {
  const tag = element.tag.toLowerCase();
  if (ACTIVE.has(tag)) return `a <${element.tag}> element`;
  if (ANIMATION.has(tag) && local(element.attrs.get('attributeName') ?? '') === 'href') return `a <${element.tag}> that changes href`;
  for (const [name, value] of element.attrs) {
    const key = local(name);
    if (key.startsWith('on')) return `an event handler attribute ${name} on <${element.tag}>`;
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    const url = asUrl(value);
    const scheme = SCHEME.exec(url);
    if (scheme) return `a ${scheme[1]}: address in ${name} on <${element.tag}>`;
    if ((key === 'href' || key === 'src') && !url.startsWith('#')) return `${name}="${value.trim()}" on <${element.tag}>, which is not a reference inside the SVG (#id)`;
    const where = `${name} on <${element.tag}>`;
    const css = key === 'style' ? cssRefusal(value, where) : urlRefusal(value, where);
    if (css) return css;
  }
  if (tag === 'style') {
    const css = cssRefusal(element.text, 'a <style> element');
    if (css) return css;
    const scheme = SCHEME.exec(asUrl(element.text));
    if (scheme) return `a ${scheme[1]}: address in a <style> element`;
  }
  for (const child of element.children) {
    const reason = elementRefusal(child);
    if (reason) return reason;
  }
  return undefined;
}

/**
 * Why an SVG read from a site may not be imported, in words; undefined when it may. Refused: an SVG that is not well-formed XML, a DOCTYPE
 * that declares entities, an `<?xml-stylesheet?>`, script, foreignObject, iframe, embed and object, an animation of href, any `on*`
 * attribute, an href or src that is not `#id`, and a `javascript:`, `data:` or remote URL anywhere, `style` and `<style>` included.
 */
export function svgRefusal(svg: string): string | undefined {
  // The reader skips a DOCTYPE and processing instructions without reading them, so they are judged on the text: a browser would expand the
  // entities a DOCTYPE declares, and fetch the stylesheet an xml-stylesheet names
  if (/<!DOCTYPE[^>]*\[/i.test(svg)) return 'a DOCTYPE that declares entities';
  if (/<\?xml-stylesheet/i.test(svg)) return 'an <?xml-stylesheet?> instruction';
  let root: XmlElement;
  try {
    root = parseXml(svg);
  } catch (err) {
    if (err instanceof XmlError) return `it is not well-formed XML (${err.message})`;
    throw err;
  }
  if (root.tag.toLowerCase() !== 'svg') return `it is not an SVG (its root is <${root.tag}>)`;
  return elementRefusal(root);
}

/** An SVG with a namespace, for a file that passed `svgRefusal` or one the user gave (`--logo`): no script, no event handler. */
export function cleanSvg(svg: string): string {
  let out = svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
  if (!/<svg\b[^>]*\sxmlns\s*=/i.test(out)) out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `${out.trim()}\n`;
}
