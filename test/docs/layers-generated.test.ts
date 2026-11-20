import { describe, it, expect } from 'vitest';
import { block, FILE, readLayers, withBlock } from '../../scripts/gen-layers-docs.js';
import { read } from '../support/spec-helpers.js';

// The diagram of which folder of src/ may import which is written into ARCHITECTURE.md from scripts/layers.json by
// scripts/gen-layers-docs.ts. This runs the generator in memory and compares: a change to the rules or the generator without
// `npm run layers-docs` fails here.

describe('the layers diagram is generated from the layer rules', () => {
  it('ARCHITECTURE.md holds the diagram the rules make (run npm run layers-docs)', () => {
    expect(read(FILE) === withBlock(read(FILE), readLayers()), `${FILE} is out of date: run npm run layers-docs`).toBe(true);
  });

  it('draws one arrow for each allowed import and none for a forbidden one', () => {
    const arrows = block({ a: [], b: ['a'], c: ['a', 'b'] })
      .split('\n')
      .filter((line) => line.includes('-->'));
    expect(arrows).toEqual(['  b --> a', '  c --> a', '  c --> b']);
  });

  it('refuses a document without its markers, so it never rewrites the wrong text', () => {
    expect(() => withBlock('no markers here', readLayers())).toThrow(/layers:begin/);
  });
});
