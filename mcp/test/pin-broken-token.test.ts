import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { starterProject } from '../../test/support/init-project.js';
import { PINNED, TOOLS, pinHarness } from './pin-support.js';
import { installed } from './support.js';

// Covers brandHasErrors true in every tool when a token is wrong, pin or not. Kept apart from pin.test.ts so the two run in parallel;
// the stdio session setup is in pin-support.ts.

describe.skipIf(!installed)('brandHasErrors and pinMismatch over stdio', () => {
  let harness: ReturnType<typeof pinHarness>;

  beforeAll(() => {
    harness = pinHarness();
  });
  afterAll(async () => {
    await harness.closeAll();
  });

  it('says brandHasErrors true in every tool when a token is wrong, pin or not', async () => {
    const brand = await starterProject();
    const file = path.join(brand, 'tokens/colors.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"{color.ink.steel}"', '"{color.does.not.exist}"'));
    fs.writeFileSync(path.join(brand, 'blazon.lock'), `${JSON.stringify({ v: 1, commit: PINNED })}\n`);
    const call = await harness.session(brand);
    for (const [name, args] of TOOLS) {
      const result = (await call(name, args)).structuredContent;
      expect(result.brandHasErrors, name).toBe(true);
      expect(result.pinMismatch, name).toBeDefined();
    }
    expect((await call('check_brand', {})).structuredContent.passed).toBe(false);
  }, 60_000);
});
