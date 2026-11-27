import { describe, it, expect, beforeAll } from 'vitest';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/init-project';

// `blazon contrast`: a measurement. Exit 0 whatever the ratio, 2 for what it cannot measure, and no `allowed` or `passed` in the JSON.

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

describe('blazon contrast', () => {
  it('measures a blend, exits 0, and prints a document with no verdict', () => {
    const ran = blazon('contrast', 'text.primary', 'surface.canvas', root, '--with', 'surface.inverse', '--with-alpha', '0.12', '--alpha', '0.9', '--json');
    expect(ran.status).toBe(0);
    const body = JSON.parse(ran.stdout);
    expect(body).toMatchObject({
      command: 'contrast',
      fg: 'text.primary',
      bg: 'surface.canvas',
      with: 'surface.inverse',
      withAlpha: 0.12,
      alpha: 0.9,
      note: 'a measurement, not a brand approval',
    });
    expect(typeof body.ratio).toBe('number');
    expect(Object.keys(body)).not.toContain('allowed');
    expect(Object.keys(body)).not.toContain('passed');
    expect(Array.isArray(body.brandPairs)).toBe(true);
  }, 120_000);

  it('puts the ratio, the level and the tokens on the first line of the text', () => {
    const ran = blazon('contrast', 'text.primary', 'surface.canvas', root);
    const body = JSON.parse(blazon('contrast', 'text.primary', 'surface.canvas', root, '--json').stdout);
    const first = ran.stdout.split('\n').find((line) => line.trim() !== '')!;
    expect(first.trim()).toBe(`${body.ratio.toFixed(2)}:1  ${body.level}  text.primary on surface.canvas`);
    expect(ran.stdout).toContain('non-text');
  }, 120_000);

  it('exits 0 for a ratio below every level, and prints text for a person', () => {
    const ran = blazon('contrast', 'surface.canvas', 'surface.canvas', root);
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('1.00:1');
    expect(ran.stdout).toContain('a measurement, not a brand approval');
  }, 120_000);

  it('exits 2 with the reason for each thing it refuses to measure', () => {
    const cases: [string[], RegExp][] = [
      [['text.primary', 'surface.canvs'], /did you mean "surface.canvas"/],
      [['text.primary', 'surface.canvas', '--with', 'surface.inverse'], /with and withAlpha go together/],
      [['text.primary', 'surface.canvas', '--with', 'surface.inverse', '--with-alpha', '1.5'], /withAlpha must be a number from 0 to 1/],
      [['text.primary', 'surface.canvas', '--alpha', 'abc'], /alpha must be a number from 0 to 1/],
    ];
    for (const [args, message] of cases) {
      const ran = blazon('contrast', ...args, root);
      expect(ran.status, args.join(' ')).toBe(2);
      expect(ran.stderr).toMatch(message);
    }
  }, 120_000);
});
