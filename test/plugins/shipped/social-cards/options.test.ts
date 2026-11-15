import { describe, it, expect } from 'vitest';
import { NAME } from '../../../../src/shipped/social-cards/request.js';
import { parseOptions, type Known } from '../../../../src/shipped/social-cards/options.js';

// blazon.social-cards, the plugin blazon ships to compose marketing images from a brand's tokens, logo and a background.
// Seam: parseOptions.

const known: Known = {
  formats: new Set(['horizontal', 'square']),
  backgrounds: new Set(['backgrounds/aurora', 'color.surface.inverse']),
  colors: new Set(['text.primary']),
};
const card = (extra: object = {}) => ({ id: 'launch', format: 'horizontal', background: 'backgrounds/aurora', headline: 'Say it in one line.', ...extra });

describe('options', () => {
  it('accepts a card, with defaults for the logo, the alignment and the scale', () => {
    const parsed = parseOptions({ cards: [card()] }, known);
    expect(parsed.findings).toEqual([]);
    expect(parsed.scale).toBe(1);
    expect(parsed.cards).toEqual([{ id: 'launch', format: 'horizontal', background: 'backgrounds/aurora', headline: 'Say it in one line.', logo: 'auto', align: 'left' }]);
  });

  it('keeps the optional fields and the 2x scale', () => {
    const parsed = parseOptions({ scale: 2, cards: [card({ subline: 'More.', logo: 'dark', textColor: 'text.primary', align: 'center', anchor: 'top' })] }, known);
    expect(parsed.scale).toBe(2);
    expect(parsed.cards[0]).toMatchObject({ subline: 'More.', logo: 'dark', textColor: 'text.primary', align: 'center', anchor: 'top' });
  });

  it.each([
    ['options that are not an object', [], 'options must be an object'],
    ['no cards', {}, 'cards must be a non-empty list'],
    ['an empty list of cards', { cards: [] }, 'cards must be a non-empty list'],
    ['an unknown option', { cards: [card()], sizes: 2 }, 'unknown option "sizes"'],
    ['a scale that is not 1 or 2', { cards: [card()], scale: 3 }, 'scale must be 1 or 2'],
  ])('reports %s as one card-option-invalid error, and draws nothing', (_, options, message) => {
    const parsed = parseOptions(options, known);
    expect(parsed.cards).toEqual([]);
    expect(parsed.findings).toEqual([{ code: `${NAME}/card-option-invalid`, severity: 'error', path: 'options', message: expect.stringContaining(message) }]);
  });

  it.each([
    ['a card that is not an object', 'x', 'card 1 must be an object'],
    ['no id', card({ id: undefined }), 'id must be'],
    ['an id that is not a file name', card({ id: '../x' }), 'id must be'],
    ['no format', card({ format: undefined }), 'format is required'],
    ['a format the tokens do not have', card({ format: 'story' }), 'format "story" is not a group under social.format (horizontal, square)'],
    ['a background that is not an asset or a token', card({ background: 'backgrounds/none' }), 'background "backgrounds/none" is not an asset or a color or gradient token'],
    ['no headline', card({ headline: ' ' }), 'headline must be a non-empty string'],
    ['an unknown key', card({ colour: 'red' }), 'unknown key "colour"'],
    ['a logo that is not auto, light or dark', card({ logo: 'blue' }), 'logo must be auto, light or dark'],
    ['an alignment that is not left or center', card({ align: 'right' }), 'align must be left or center'],
    ['an anchor that is not top or bottom', card({ anchor: 'middle' }), 'anchor must be top or bottom'],
    ['a logoWidth that is zero', card({ logoWidth: 0 }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth that is negative', card({ logoWidth: -40 }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth that is a word', card({ logoWidth: 'wide' }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth in px written as text', card({ logoWidth: '120px' }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth of more than the whole side', card({ logoWidth: '101%' }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth of 0%', card({ logoWidth: '0%' }), 'logoWidth must be a number of px above 0'],
    ['a logoWidth that is not finite', card({ logoWidth: Infinity }), 'logoWidth must be a number of px above 0'],
    ['a logoCorner that is not a corner', card({ logoCorner: 'middle' }), 'logoCorner must be top-left, top-right, bottom-left, bottom-right'],
    ['a text color that is not a color token', card({ textColor: 'nope' }), 'textColor "nope" is not a color token'],
    ['a subline that is not text', card({ subline: 4 }), 'subline must be a string'],
  ])('reports %s, and skips that card', (_, bad, message) => {
    const parsed = parseOptions({ cards: [bad, card({ id: 'ok' })] }, known);
    expect(parsed.cards.map((c) => c.id)).toEqual(['ok']);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({ code: `${NAME}/card-option-invalid`, severity: 'error', message: expect.stringContaining(message) });
  });

  it('keeps logoWidth as px or a percentage, and logoCorner, and leaves them out of a card that has none', () => {
    const parsed = parseOptions({ cards: [card({ id: 'a', logoWidth: 120, logoCorner: 'top-right' }), card({ id: 'b', logoWidth: '22%' }), card({ id: 'c', logoWidth: '12.5%' })] }, known);
    expect(parsed.findings).toEqual([]);
    expect(parsed.cards.map((c) => [c.logoWidth, c.logoCorner])).toEqual([[120, 'top-right'], ['22%', undefined], ['12.5%', undefined]]);
    expect(Object.keys(parseOptions({ cards: [card()] }, known).cards[0]!)).not.toContain('logoWidth');
  });

  it('keeps keepClear as rectangles in percent, a named zone as its numbers and its name, and leaves it out of a card that has none', () => {
    const parsed = parseOptions({ cards: [card({ keepClear: ['avatar', { x: 70, y: 0, width: 30, height: 20 }] }), card({ id: 'none', keepClear: [] }), card({ id: 'edge', keepClear: [{ x: 0, y: 0, width: 100, height: 100 }] })] }, known);
    expect(parsed.findings).toEqual([]);
    expect(parsed.cards[0]!.keepClear).toEqual([{ name: 'avatar', x: 0, y: 50, width: 25, height: 50 }, { x: 70, y: 0, width: 30, height: 20 }]);
    expect(parsed.cards[2]!.keepClear).toEqual([{ x: 0, y: 0, width: 100, height: 100 }]);
    expect(Object.keys(parsed.cards[1]!)).not.toContain('keepClear');
    expect(Object.keys(parseOptions({ cards: [card()] }, known).cards[0]!)).not.toContain('keepClear');
  });

  const area = { x: 0, y: 50, width: 25, height: 50 };
  it.each([
    ['a keepClear that is not a list', 'avatar', 'keepClear must be a list'],
    ['a zone that has no name', ['corner'], 'keepClear[1] "corner" is not a named zone (avatar)'],
    ['a zone name that is an object property', ['constructor'], 'keepClear[1] "constructor" is not a named zone'],
    ['an entry that is a number', [{ ...area }, 4], 'keepClear[2] must be a named zone (avatar) or { x, y, width, height }'],
    ['a rectangle with an unknown key', [{ ...area, w: 3 }], 'keepClear[1] has the unknown key "w"'],
    ['a rectangle without a height', [{ x: 0, y: 50, width: 25 }], 'keepClear[1] needs height as a number of percent'],
    ['a rectangle with a percentage written as text', [{ ...area, width: '25%' }], 'keepClear[1] needs width as a number of percent'],
    ['a rectangle with a value that is not finite', [{ ...area, x: Infinity }], 'keepClear[1] needs x as a number of percent'],
    ['a negative x', [{ ...area, x: -1 }], 'keepClear[1] x is -1, outside 0 to 100'],
    ['a width over 100', [{ ...area, width: 101 }], 'keepClear[1] width is 101, outside 0 to 100'],
    ['a rectangle with no width', [{ ...area, width: 0 }], 'keepClear[1] needs a width and a height above 0'],
    ['a rectangle that reaches past the right edge', [{ ...area, x: 80 }], 'keepClear[1] reaches past the card (x + width is 105'],
    ['a rectangle that reaches past the bottom edge', [{ ...area, y: 60 }], 'keepClear[1] reaches past the card (x + width is 25, y + height is 110'],
  ])('reports %s, and skips that card', (_, keepClear, message) => {
    const parsed = parseOptions({ cards: [card({ keepClear }), card({ id: 'ok' })] }, known);
    expect(parsed.cards.map((c) => c.id)).toEqual(['ok']);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({ code: `${NAME}/card-option-invalid`, severity: 'error', path: 'launch', message: expect.stringContaining(message) });
  });

  it('reports each wrong keepClear entry of a card', () => {
    const parsed = parseOptions({ cards: [card({ keepClear: ['avatar', 'nope', { ...area, y: -5 }] })] }, known);
    expect(parsed.findings.map((f) => f.message)).toEqual([expect.stringContaining('keepClear[2]'), expect.stringContaining('keepClear[3]')]);
  });

  it('reports a duplicate id and keeps the first card', () => {
    const parsed = parseOptions({ cards: [card(), card({ headline: 'Again' })] }, known);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]!.headline).toBe('Say it in one line.');
    expect(parsed.findings).toEqual([{ code: `${NAME}/card-option-invalid`, severity: 'error', path: 'launch', message: 'card 2: id "launch" is used twice' }]);
  });
});
