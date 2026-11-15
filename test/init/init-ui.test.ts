import { describe, expect, it } from 'vitest';
import { contrastLines, kilobytes, labelNote, lookFor, PLAIN, swatch } from '../../src/cli/init-ui.js';

// The formatting layer: the same facts with and without color.

// eslint-disable-next-line no-control-regex -- ESC is what starts a terminal color code
const ANSI = /\x1b\[/;
const TRUE = { color: true, truecolor: true };

describe('looking for color', () => {
  it('is off under NO_COLOR, TERM=dumb and a non-terminal, and on for a terminal', () => {
    expect(lookFor({ NO_COLOR: '1' }, true).color).toBe(false);
    expect(lookFor({ TERM: 'dumb' }, true).color).toBe(false);
    expect(lookFor({}, false).color).toBe(false);
    expect(lookFor({}, true).color).toBe(true);
  });
  it('lets FORCE_COLOR turn it on, but not over NO_COLOR', () => {
    expect(lookFor({ FORCE_COLOR: '1' }, false).color).toBe(true);
    expect(lookFor({ FORCE_COLOR: '1', NO_COLOR: '1' }, false).color).toBe(false);
  });
  it('uses 24-bit color only when the terminal says so', () => {
    expect(lookFor({ COLORTERM: 'truecolor' }, true).truecolor).toBe(true);
    expect(lookFor({}, true).truecolor).toBe(false);
  });
});

describe('swatches', () => {
  it('draws 24-bit, 256-color and plain', () => {
    expect(swatch('#ff0066', TRUE)).toContain('48;2;255;0;102');
    expect(swatch('#ff0066', { color: true, truecolor: false })).toContain('48;5;');
    expect(swatch('#ff0066', PLAIN)).toBe('[#ff0066]');
  });
});

describe('what the lines say', () => {
  it('reports contrast on white and near-black', () => {
    const lines = contrastLines('#2563eb', PLAIN);
    expect(lines[0]).toBe('[#2563eb] #2563eb');
    expect(lines[1]).toMatch(/AA for text on white: yes \(5\.\d:1/);
    expect(lines[2]).toMatch(/near-black: (yes|no)/);
  });
  it('names the ink on the color: graphite where it reaches AA, bone where only bone does, a warning where neither does', () => {
    expect(labelNote('#ffd24a')).toMatch(/will be graphite/);
    expect(labelNote('#2563eb')).toMatch(/will be bone/);
    expect(labelNote('#808080')).toMatch(/Neither graphite nor bone reaches AA/);
  });
  it('writes sizes in words', () => {
    expect([kilobytes(500), kilobytes(2048)]).toEqual(['500 bytes', '2.0 KB']);
  });
  it('writes no ANSI at all when color is off', () => {
    const all = [...contrastLines('#2563eb', PLAIN), labelNote('#2563eb'), swatch('#fff', PLAIN)].join('\n');
    expect(all).not.toMatch(ANSI);
  });
});
