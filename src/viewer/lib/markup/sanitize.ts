import DOMPurify from 'dompurify';

/**
 * SVG markup with scripts, event handlers, javascript: URLs and foreignObject removed, for Copy SVG
 * and Copy JSX. Asset files come from anyone who can add to the assets folder, and a copied SVG
 * lands in someone's app. The SVG profile also drops HTML, so non-SVG markup comes back empty.
 */
export function sanitizeSvg(markup: string): string {
  return DOMPurify.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true } });
}

/** A React component wrapping already-sanitized SVG markup. */
export function svgToJsx(svg: string, name: string): string {
  const component = name
    .split(/[-_]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const jsx = svg
    .replace(/class=/g, 'className=')
    .replace(/fill-rule=/g, 'fillRule=')
    .replace(/clip-rule=/g, 'clipRule=')
    .replace(/\sstyle="([^"]*)"/g, (_m, css: string) => ` style={${styleObject(css)}}`)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_m, open: string, css: string, close: string) =>
      css.trim() === '' ? `${open}${close}` : `${open}{\`${css.replace(/[\\`]|\$\{/g, (c) => `\\${c}`)}\`}${close}`,
    )
    .replace('<svg', '<svg {...props}');
  return `export function ${component}Icon(props: React.SVGProps<SVGSVGElement>) {\n  return (\n    ${jsx}\n  );\n}`;
}

/** A CSS declaration list as a React style object literal: `fill:red;stroke-width:2` -> `{ fill: 'red', strokeWidth: '2' }`. */
function styleObject(css: string): string {
  const entries = css
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .flatMap((d) => {
      const i = d.indexOf(':');
      if (i < 1) return [];
      const name = d.slice(0, i).trim();
      const key = name.startsWith('--') ? JSON.stringify(name) : name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      return [
        `${key}: ${JSON.stringify(
          d
            .slice(i + 1)
            .trim()
            .replace(/&quot;/g, '"'),
        )}`,
      ];
    });
  return `{ ${entries.join(', ')} }`.replace('{  }', '{}');
}
