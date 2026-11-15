import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { TEST_CONFIG, writeTokenProject } from '../../support/helpers.js';

// A brand must have a logo: an unset `logo` is the same error as a logo file that is not there.

const tokens = { 'a.json': { color: { $type: 'color', ink: { $value: '#111111' } } } };

describe('a brand with no logo configured', () => {
  it('fails the check with logo-missing, naming the config', async () => {
    const data = await compileBlazonData({ ...DEFAULT_CONFIG }, writeTokenProject(tokens));
    expect(data.findings).toContainEqual(expect.objectContaining({ code: 'logo-missing', severity: 'error', path: 'blazon.json' }));
  });

  it('passes once a logo is set', async () => {
    const data = await compileBlazonData({ ...TEST_CONFIG }, writeTokenProject(tokens));
    expect(data.findings.filter((f) => f.code === 'logo-missing')).toEqual([]);
  });
});
