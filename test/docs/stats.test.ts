import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildStats, statsText } from '../../scripts/docs-stats.js';
import { ROOT } from '../support/spec-helpers.js';

// docs/stats.json is what a website reads. It must be what the code says today: run `npm run docs:stats` and commit the result.

describe('docs/stats.json', () => {
  it('matches the code', () => {
    const committed = fs.readFileSync(path.join(ROOT, 'docs/stats.json'), 'utf-8');
    expect(committed, 'docs/stats.json is stale: run `npm run docs:stats`').toBe(statsText());
  });

  it('finds what it counts', () => {
    const stats = buildStats();
    expect(stats.commands.length).toBeGreaterThanOrEqual(15);
    expect(stats.mcpTools.length).toBeGreaterThanOrEqual(8);
    expect(stats.chapters.length).toBeGreaterThanOrEqual(20);
    expect(stats.checks.error + stats.checks.warning + stats.checks.info).toBe(stats.checks.total);
  });
});
