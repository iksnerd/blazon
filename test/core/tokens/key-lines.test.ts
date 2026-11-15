import { describe, it, expect } from 'vitest';
import { keyLines, jsonErrorLine } from '../../../src/core/tokens/key-lines.js';

// The line of each key in a JSON token file, so a finding can say where to look.

const lines = (text: string) => Object.fromEntries(keyLines(text));

describe('keyLines', () => {
  it('gives the line of every key, groups and tokens, by dotted path', () => {
    const text = ['{', '  "color": {', '    "brand": {', '      "$value": "#fff"', '    },', '    "ink": { "$value": "#000" }', '  }', '}'].join('\n');
    expect(lines(text)).toMatchObject({ color: 2, 'color.brand': 3, 'color.brand.$value': 4, 'color.ink': 6 });
  });

  it('counts a CRLF line ending once, and a lone CR not at all', () => {
    const text = '{\r\n  "a": {\r\n    "b": 1\r\n  },\r\n  "c": 2\r\n}';
    expect(lines(text)).toMatchObject({ a: 2, 'a.b': 3, c: 5 });
    expect(lines('{"a":1,\r"b":2}')).toMatchObject({ a: 1, b: 1 });
  });

  it('is not fooled by braces, quotes, escapes and newlines escaped inside strings', () => {
    const text = ['{', '  "a": { "$description": "}{ \\" \\\\", "$value": "x\\ny" },', '  "b": "\\\\",', '  "c": 1', '}'].join('\n');
    expect(lines(text)).toMatchObject({ a: 2, 'a.$description': 2, 'a.$value': 2, b: 3, c: 4 });
  });

  it('reads keys with escapes as the key they spell', () => {
    expect(lines('{\n"a\\u0062": 1,\n"q\\"x": 2\n}')).toMatchObject({ ab: 2, 'q"x': 3 });
  });

  it('walks into arrays by index, and past values of every kind', () => {
    const text = ['{', '  "list": [', '    1,', '    { "k": true },', '    [null, { "deep": -1.5e3 }]', '  ],', '  "after": false', '}'].join('\n');
    expect(lines(text)).toMatchObject({ list: 2, 'list.1.k': 4, 'list.2.1.deep': 5, after: 7 });
  });

  it('keeps the first line of a key that is repeated', () => {
    expect(lines('{\n"a": 1,\n"a": 2\n}')).toMatchObject({ a: 2 });
  });

  it('skips a BOM and leading whitespace', () => {
    expect(lines('﻿\n\n{"a": 1}')).toMatchObject({ a: 3 });
  });

  it('returns nothing for text that is not JSON', () => {
    expect(keyLines('{"a": ').size).toBe(0);
    expect(keyLines('not json').size).toBe(0);
    expect(keyLines('').size).toBe(0);
  });

  it('does not treat a key called __proto__ specially', () => {
    expect(keyLines('{\n"__proto__": {"x": 1}}').get('__proto__.x')).toBe(2);
  });
});

describe('jsonErrorLine', () => {
  it('takes "line L column C" from the message', () => {
    expect(jsonErrorLine("SyntaxError: Expected ',' or '}' after property value in JSON at position 20 (line 3 column 5)", '')).toBe(3);
  });

  it('turns "position N" into a line of the text', () => {
    const text = '{\n  "a": 1\n  "b": 2\n}';
    expect(jsonErrorLine(`SyntaxError: Expected ',' or '}' after property value in JSON at position ${text.indexOf('"b"')}`, text)).toBe(3);
  });

  it('counts CRLF once', () => {
    const text = '{\r\n  "a": 1\r\n  "b": 2\r\n}';
    expect(jsonErrorLine(`Unexpected string in JSON at position ${text.indexOf('"b"')}`, text)).toBe(3);
  });

  it('is undefined when the message names no place, or one outside the text', () => {
    expect(jsonErrorLine('SyntaxError: Unexpected end of JSON input', '{')).toBeUndefined();
    expect(jsonErrorLine('in JSON at position 999', '{}')).toBeUndefined();
  });
});
