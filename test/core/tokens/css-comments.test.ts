import { describe, it, expect } from 'vitest';
import { formatCssTokens } from '../../../src/core/tokens/formatters/css.js';
import { compileTokens } from '../../support/helpers.js';

describe('a comment in the generated CSS', () => {
  const css = async (files: Record<string, unknown>) => {
    const data = await compileTokens(files);
    return formatCssTokens(data.tokens);
  };
  const closers = (text: string) => text.split('*/').length - 1;
  const opens = (text: string) => text.split('/*').length - 1;

  it('cannot be closed by a deprecation message', async () => {
    const out = await css({ 'a.json': { color: { $type: 'color', ink: { $value: '#000', $deprecated: 'use */ color.x' } } } });
    expect(closers(out)).toBe(opens(out));
  });

  it('cannot be closed by a description', async () => {
    const out = await css({ 'a.json': { color: { $type: 'color', ink: { $value: '#000', $description: 'x */ y' } } } });
    expect(closers(out)).toBe(opens(out));
  });

  it('cannot be closed by a group name', () => {
    const out = formatCssTokens({ groups: [{ name: 'g*/', tokens: [{ path: 'a', cssVariable: '--a', value: '1' } as never] }] } as never);
    expect(closers(out)).toBe(opens(out));
  });

  it('cannot be closed by a context name', () => {
    const out = formatCssTokens({
      groups: [],
      contexts: [{ modifier: 'm*/', context: 'c*/', selector: '[x]', tokens: [{ path: 'a', cssVariable: '--a', value: '1' } as never] }],
    } as never);
    expect(closers(out)).toBe(opens(out));
  });
});
