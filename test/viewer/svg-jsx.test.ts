import { describe, it, expect } from 'vitest';
import { svgToJsx } from '../../src/viewer/lib/markup/sanitize';
import { typographyClassName } from '../../src/core/tokens/names.js';

describe('svgToJsx', () => {
  it('turns a style attribute into a style object, which React requires', () => {
    const jsx = svgToJsx('<svg><path style="fill:red;stroke-width: 2" class="a"/></svg>', 'my-icon');
    expect(jsx).toContain(`style={{ fill: "red", strokeWidth: "2" }}`);
    expect(jsx).toContain('className="a"');
    expect(jsx).not.toContain('style="');
  });

  it('wraps style element text in a template literal, since braces are JSX syntax', () => {
    const tricky = svgToJsx('<svg><style>a{content:"`' + '$' + '{x}\\n"}</style></svg>', 'i');
    expect(tricky).toContain('<style>{`a{content:"\\`\\' + '$' + '{x}\\\\n"}`}</style>');
    expect(svgToJsx('<svg><style>.m{fill:red}</style></svg>', 'i')).toContain('<style>{`.m{fill:red}`}</style>');
  });
});

describe('typographyClassName', () => {
  it('kebab-cases camelCase segments like the formatter', () => {
    expect(typographyClassName('type.bodyLarge')).toBe('type-body-large');
  });
});
