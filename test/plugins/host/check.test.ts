import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { check, setPointer, type CheckResult } from '../../../src/plugins/host/check.js';
import { TEST_ROLE, caseFiles, loadCase, name } from '../support/spec.js';
import { tempDir } from '../../support/project';

// RFC 0005 section 9: the check command starts a plugin the way the host does and runs the core cases. Each
// corpus plugin breaks exactly one rule, so the check must fail on that case and on no other.

function program(script: string): string {
  const file = path.join(tempDir(), 'plugin');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return file;
}

const failed = (results: CheckResult[]) => results.filter((r) => !r.passed && !r.skipped).map((r) => r.case).sort();

describe('the check command, against the corpus', () => {
  for (const file of caseFiles('check')) {
    it(`agrees with ${name(file)}`, async () => {
      const found = loadCase(file, ['about', 'rfc', 'program', 'check_env', 'data_request', 'marked_fields', 'request', 'expect']);
      const results = await check({
        host: 'corpus',
        profile: { roles: [TEST_ROLE], secretFields: found.marked_fields ?? [] },
        program: program(found.program.replaceAll('$role', TEST_ROLE)),
        validate: true,
        env: found.check_env ?? {},
        // The corpus plugins answer a record of version 1 with an exit code and no body.
        requests: { [TEST_ROLE]: found.request ?? '{"v":1}' },
        dataRequests: 'data_request' in found ? { [TEST_ROLE]: found.data_request } : {},
      });
      if (found.expect.check === 'pass') expect(failed(results), `${found.about}: ${JSON.stringify(results)}`).toEqual([]);
      else {
        expect(found.expect.check).toBe('fail');
        expect(failed(results), `${found.about}: ${JSON.stringify(results)}`).toEqual([found.expect.case]);
      }
    }, 60_000);
  }
});

describe('a conforming plugin', () => {
  const PLUGIN = `#!/bin/sh
case "$1" in
  --blazon-manifest) printf '%s' '{"v":2,"roles":["check"],"env":["BLAZON_SECRET_TOKEN"],"secret_env":["BLAZON_SECRET_TOKEN"]}'; exit 0;;
esac
in=$(cat)
case "$in" in
  '{'*) ;;
  *) echo 'the request is not JSON'; exit 2;;
esac
if printf '%s' "$in" | grep -Eq '"v" *: *1[,}]'; then
  echo '{"findings":[]}'
  exit 0
fi
echo 'unsupported record version'; exit 2
`;

  it('passes every case, and says which it ran', async () => {
    const results = await check({ host: 'blazon', profile: { roles: ['check', 'build'] }, program: program(PLUGIN), requests: { check: '{"v":1,"type":"check"}' } });
    expect(failed(results), JSON.stringify(results)).toEqual([]);
    expect(results.map((r) => r.case)).toEqual([1, 2, 3, 5, 4]);
    expect(results.find((r) => r.case === 5)).toMatchObject({ skipped: true });
  });

  it('fails case 1 and runs no other when the manifest is not one the host loads', async () => {
    const results = await check({ host: 'blazon', profile: { roles: ['check'] }, program: program('#!/bin/sh\necho \'{"v":3}\'\n') });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ case: 1, passed: false });
  });

  it('fails case 1 when the manifest call does not exit 0, and says how it ended', async () => {
    const results = await check({ host: 'blazon', profile: { roles: ['check'] }, program: program('#!/bin/sh\nexit 3\n') });
    expect(results[0]!.detail).toContain('exited with 3');
  });

  it('skips case 4 for a role with no secret and no request data to put a canary in, and says why', async () => {
    const plain = PLUGIN.replace(',"env":["BLAZON_SECRET_TOKEN"],"secret_env":["BLAZON_SECRET_TOKEN"]', '');
    const results = await check({ host: 'blazon', profile: { roles: ['check'] }, program: program(plain) });
    expect(results.find((r) => r.case === 4)).toMatchObject({ skipped: true });
    expect(results.find((r) => r.case === 4)!.detail).toContain('no secret_env');
  });
});

describe('setting a secret into a request at a JSON Pointer', () => {
  const put = (doc: unknown, pointer: string) => JSON.parse(setPointer(Buffer.from(JSON.stringify(doc)), pointer, 'V').toString());

  it('adds a key an object lacks, and an object on the way', () => {
    expect(put({ a: 1 }, '/b')).toEqual({ a: 1, b: 'V' });
    expect(put({}, '/auth/token')).toEqual({ auth: { token: 'V' } });
  });

  it('replaces a value that is there, and unescapes ~1 and ~0', () => {
    expect(put({ a: { b: 1 } }, '/a/b')).toEqual({ a: { b: 'V' } });
    expect(put({}, '/a~1b')).toEqual({ 'a/b': 'V' });
    expect(put({}, '/a~0b')).toEqual({ 'a~b': 'V' });
  });

  it('reaches an array element that exists', () => {
    expect(put({ list: ['x', 'y'] }, '/list/1')).toEqual({ list: ['x', 'V'] });
  });

  it.each([
    ['an array element that does not exist', { list: [] }, '/list/0'],
    ['a value that is neither an object nor an array', { a: 5 }, '/a/b'],
    ['a pointer that is not one', {}, 'a'],
  ])('refuses %s', (_name, doc, pointer) => {
    expect(() => setPointer(Buffer.from(JSON.stringify(doc)), pointer, 'V')).toThrow();
  });

  it('refuses when the role gives no valid request, or one that is not JSON', () => {
    expect(() => setPointer(undefined, '/a', 'V')).toThrow(/no valid request/);
    expect(() => setPointer(Buffer.from('not json'), '/a', 'V')).toThrow(/not JSON/);
  });
});
