import { describe, it, expect, beforeAll } from 'vitest';
import { blazon } from '../support/blazon-src';
import { starterProject } from '../support/init-project';

// The read commands `rules` and `can`: the rules of a group or brand, and whether a foreground and background pair is allowed. Split from the read-command tests.

let root: string;
beforeAll(async () => {
  root = await starterProject();
}, 120_000);

describe('blazon rules', () => {
  it('lists the rules of a group, of the whole brand, and of a folder given as the only argument', () => {
    const group = JSON.parse(blazon('rules', 'text', root, '--json').stdout);
    expect(group).toMatchObject({ command: 'rules', kind: 'group', entries: [{ at: 'text', kind: 'group', role: 'text' }] });
    const all = JSON.parse(blazon('rules', root, '--json').stdout);
    expect(all.kind).toBe('brand');
    expect(all.entries.map((e: { at: string }) => e.at)).toEqual(expect.arrayContaining(['text', 'color.signal']));
    expect(blazon('rules', 'nothing-here', root).status).toBe(2);
  }, 120_000);
});

describe('blazon can', () => {
  it('exits 0 for a pair the brand lists, 1 for a denied one, 2 for an unknown token', () => {
    const allowed = blazon('can', 'text.primary', 'surface.canvas', root);
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain('allowed');
    const denied = blazon('can', 'color.signal.orange', 'surface.canvas', root, '--json');
    expect(denied.status).toBe(1);
    expect(JSON.parse(denied.stdout)).toMatchObject({ command: 'can', passed: false, allowed: false, reason: expect.stringContaining('denies "text"') });
    expect(blazon('can', 'text.primary', 'surface.nope', root).status).toBe(2);
  }, 120_000);

  it('--role ui judges a non-text pair by 3:1, and refuses an unknown role', () => {
    const ui = blazon('can', 'color.signal.orange', 'surface.canvas', root, '--role', 'ui', '--json');
    expect(JSON.parse(ui.stdout)).toMatchObject({ command: 'can', role: 'ui', contrast: { threshold: 3 } });
    const text = blazon('can', 'text.primary', 'surface.canvas', root, '--role', 'ui');
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain('as a non-text element (--role ui)');
    expect(blazon('can', 'text.primary', 'surface.canvas', root, '--role', 'icon').status).toBe(2);
  }, 120_000);

  it('--theme judges the pair in a resolver context, and an unknown theme exits 2 with the valid ones', () => {
    const dark = blazon('can', 'text.primary', 'surface.canvas', root, '--theme', 'dark', '--json');
    expect(dark.status, dark.stderr).toBe(0);
    expect(JSON.parse(dark.stdout)).toMatchObject({ command: 'can', allowed: true, theme: 'dark' });
    const ring = JSON.parse(blazon('can', 'color.signal.orange', 'surface.background', root, '--role', 'ui', '--theme', 'dark', '--json').stdout);
    expect(ring).toMatchObject({ theme: 'dark', contrast: { ratio: 5.29 } });
    const unknown = blazon('can', 'text.primary', 'surface.canvas', root, '--theme', 'sepia');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('"light", "dark"');
  }, 120_000);
});
