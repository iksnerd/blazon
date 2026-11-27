import { describe, it, expect } from 'vitest';
import { starterProject } from '../../support/init-project';
import { blazon, output } from '../../support/plugin-roles';

// blazon.shadcn fills the check role too: the destructive-duplicate warning reaches `blazon check`, through the real command and the shipped program.

const options = (extra: object) => ({ variables: { destructive: 'text.primary', ring: 'text.primary' }, ...extra });

describe('blazon check with blazon.shadcn', () => {
  it('warns when destructive is the same color as ring, once the plugin is listed, and says how to fix it', async () => {
    const root = await starterProject({ plugins: [{ name: 'blazon.shadcn', options: options({}) }] });
    const result = blazon(root, 'check', '--json', '--severity', 'warning');
    expect(result.status, output(result)).toBe(0);
    const findings = JSON.parse(result.stdout).findings as { code: string; severity: string; message: string }[];
    const clash = findings.filter((f) => f.code === 'blazon.shadcn/destructive-duplicate');
    expect(clash.length).toBeGreaterThan(0);
    expect(clash[0]).toMatchObject({ severity: 'warning' });
    expect(clash[0]!.message).toContain('is the same color as `ring`');
  }, 120_000);

  it('is silent when the pair is listed in allowSame', async () => {
    const root = await starterProject({ plugins: [{ name: 'blazon.shadcn', options: options({ allowSame: { destructive: 'ring' } }) }] });
    const result = blazon(root, 'check', '--json', '--severity', 'warning');
    expect(result.status, output(result)).toBe(0);
    expect(JSON.parse(result.stdout).findings.some((f: { code: string }) => f.code.startsWith('blazon.shadcn/'))).toBe(false);
  }, 120_000);
});
