import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { constructionSvg } from '../../../../src/shipped/logo-geometry/figure.js';
import { analyzeSvg, type Measurement } from '../../../../src/shipped/logo-geometry/measure.js';
import { ROOT_DIR } from '../../support/spec.js';

// The reading this plugin replaced was a Python script, scripts/logo-geometry.py. These are its reports and figures for the logos in
// examples/, taken from it before it was removed (blazon d997f6b), kept as the reference the TypeScript is held to: every number and every
// byte of the figure is the same. A change to the measuring that moves one of them is a change to what the plugin has always reported, so
// it is made on purpose or not at all.
//
// The two blazon logos are held as the files the Python measured, in oracle/sources/, not as the brand's current logos: the brand
// wordmark was redrawn when the project was renamed, and a reference regenerated from the code it checks would check nothing.

const ORACLE = path.join(import.meta.dirname, 'oracle');
const LOGOS: [name: string, file: string][] = [
  ['example-ink', 'examples/conformance/assets/logos/example-ink.svg'],
  ['example-lab-mark', 'examples/conformance/assets/logos/example-lab-mark.svg'],
  ['blazon-bone', 'test/plugins/shipped/logo-geometry/oracle/sources/blazon-bone.svg'],
  ['blazon-graphite', 'test/plugins/shipped/logo-geometry/oracle/sources/blazon-graphite.svg'],
];

describe.each(LOGOS)('%s', (name, file) => {
  const text = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8');
  const { measurement } = analyzeSvg(text);

  it('has the report the Python gave', () => {
    const expected = JSON.parse(fs.readFileSync(path.join(ORACLE, `${name}.report.json`), 'utf-8'));
    // JSON has no negative zero, so a number that is -0 in one and 0 in the other is the same number
    expect(JSON.parse(JSON.stringify(measurement))).toEqual(expected);
  });

  it('has the figure the Python drew, byte for byte', () => {
    const expected = fs.readFileSync(path.join(ORACLE, `${name}-construction.svg`), 'utf-8');
    expect(constructionSvg(text, measurement as Measurement & { box: NonNullable<Measurement['box']> }, '#ff5a1f', name)).toBe(expected);
  });
});
