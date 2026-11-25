// Covers get_outputs through the server: a plugin file near the 40 000 character cut must keep its `text`, and say so when it is cut.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../src/result.js';
import { installed, lastText, startShared, structured } from './support.js';

describe.skipIf(!installed)('get_outputs text', () => {
  let client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  let folder: string;

  beforeAll(async () => {
    const shared = await startShared();
    client = shared.client;
    folder = path.join(shared.brand, 'dist', 'tokens', 'acme.plugin');
    fs.mkdirSync(folder, { recursive: true });
  });
  afterAll(async () => {
    await client?.close();
  });

  const put = (name: string, text: string) => fs.writeFileSync(path.join(folder, name), text);
  const call = (file: string) => client.callTool({ name: 'get_outputs', arguments: { file: `acme.plugin/${file}` } });

  it('returns a small file whole', async () => {
    put('small.css', 'a { color: red; }\n');
    const answer = structured(await call('small.css'));
    expect(answer.text).toBe('a { color: red; }\n');
    expect(answer.truncated).not.toBe(true);
  });

  it('keeps `text` for a file just under the core cut, whose JSON escapes push the answer over the whole-answer limit', async () => {
    // 39 990 characters, half of them quotes and newlines, which JSON writes as two characters each
    const body = '"x"\n'.repeat(Math.floor(39_990 / 4));
    put('near.css', body);
    const result = await call('near.css');
    const answer = structured(result);
    expect(typeof answer.text).toBe('string');
    expect(answer.text.length).toBeGreaterThan(0);
    expect(body.startsWith(answer.text)).toBe(true);
    // not cut by the whole-answer cut: the text content block is valid JSON and holds the same text
    expect(JSON.parse(lastText(result)).text).toBe(answer.text);
    // cut, and says which file and why
    expect(answer.truncated).toBe(true);
    expect(answer.notice).toContain('acme.plugin/near.css');
    expect(answer.notice).toContain(String(MAX_TEXT));
    expect(lastText(result).length).toBeLessThanOrEqual(MAX_TEXT);
  });

  it('keeps `text` for a file over the core cut, and says it was cut', async () => {
    put('big.css', 'a{b:c}\n'.repeat(10_000));
    const answer = structured(await call('big.css'));
    expect(answer.text.length).toBeGreaterThan(1000);
    expect(answer.truncated).toBe(true);
    expect(answer.notice).toContain('acme.plugin/big.css');
  });
});
