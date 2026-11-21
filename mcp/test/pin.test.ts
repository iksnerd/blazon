import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { starterProject } from '../../test/support/project.js';
import { PINNED, TOOLS, pinHarness } from './pin-support.js';
import { installed } from './support.js';

// One meaning of `brandHasErrors` for every tool: the brand's own data has error findings. A blazon.lock that names another blazon build is
// not that, so it is reported on its own as `pinMismatch`. Driven through the real stdio server, as an agent uses it.
// The test with a wrong token is in pin-broken-token.test.ts, so the two files run in parallel; the stdio session setup is in pin-support.ts.

describe.skipIf(!installed)('brandHasErrors and pinMismatch over stdio', () => {
  let harness: ReturnType<typeof pinHarness>;

  beforeAll(() => {
    harness = pinHarness();
  });
  afterAll(async () => {
    await harness.closeAll();
  });

  it('says brandHasErrors false and names the pin in every tool when only blazon.lock disagrees', async () => {
    const brand = await starterProject();
    fs.writeFileSync(path.join(brand, 'blazon.lock'), `${JSON.stringify({ v: 1, commit: PINNED })}\n`);
    const call = await harness.session(brand);
    for (const [name, args] of TOOLS) {
      const result = (await call(name, args)).structuredContent;
      expect(result.brandHasErrors, name).toBe(false);
      expect(result.pinMismatch, name).toMatchObject({ pinned: PINNED.slice(0, 12), message: expect.stringContaining('pinned to blazon') });
      expect(typeof result.pinMismatch.running, name).toBe('string');
    }
    const check = (await call('check_brand', {})).structuredContent;
    expect(check.passed).toBe(true);
    expect(check.findings.map((f: { code: string }) => f.code)).toContain('pin-mismatch');
  }, 60_000);

  it('has no pinMismatch when there is no pin', async () => {
    const call = await harness.session(await starterProject());
    for (const [name, args] of TOOLS) expect((await call(name, args)).structuredContent, name).not.toHaveProperty('pinMismatch');
  }, 60_000);
});
