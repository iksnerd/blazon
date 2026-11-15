import { describe, it, expect } from 'vitest';
import { isPluginName, pluginEntry, pluginNameOfEntry, shippedLayoutProblem, PLUGIN_EXTENSION } from '../../../src/core/plugin-name.js';
import { ManifestError, decodeManifest, manifestTimeout, type Profile } from '../../../src/plugins/wire/manifest.js';
import { TIMEOUT_CAP } from '../../../src/plugins/wire/limits.js';
import { graphemeCount, message, truncateGraphemes } from '../../../src/plugins/wire/text.js';
import { TEST_ROLE, caseFiles, loadCase, name } from '../support/spec.js';

// RFC 0005 sections 3.1 (names), 3.8 (the manifest) and 5 (the message). Every corpus file must agree with
// the host; the unit cases below are blazon's own, for what the corpus cannot say.

const PROFILE: Profile = { roles: [TEST_ROLE] };

describe('plugin names (3.1)', () => {
  it.each([['name/valid', true], ['name/invalid', false]] as const)('every name in %s is %s', (folder, want) => {
    for (const file of caseFiles(folder)) {
      const found = loadCase(file, ['about', 'rfc', 'names']);
      expect(found.names.length, `${name(file)} has no names: a case that checks nothing`).toBeGreaterThan(0);
      for (const candidate of found.names) expect(isPluginName(candidate), `${name(file)}: ${JSON.stringify(candidate)} (${found.about})`).toBe(want);
    }
  });

  it('refuses a name with a final newline, which a pattern ending in $ would take in some languages', () => {
    expect(isPluginName('acme.vault\n')).toBe(false);
  });
});

describe('the program of a shipped plugin (3.6)', () => {
  it('is bin/blazon-<name>.🔌, and the name comes back out of the file name', () => {
    expect(PLUGIN_EXTENSION).toBe('.🔌');
    expect(pluginEntry('blazon.print-book')).toBe('bin/blazon-blazon.print-book.🔌');
    expect(pluginNameOfEntry('blazon-blazon.print-book.🔌')).toBe('blazon.print-book');
  });

  it.each(['blazon-blazon.copy', 'blazon-blazon.copy.js', 'blazon-.🔌', 'blazon-copy.🔌', 'blazon-Blazon.Copy.🔌', 'blazon.copy.🔌', 'blazon-blazon.copy.🔌.bak'])('does not read a name from %s', (file) => {
    expect(pluginNameOfEntry(file)).toBeUndefined();
  });
});

const text = (found: { raw?: string; manifest?: unknown }) => (found.raw ?? JSON.stringify(found.manifest)).replaceAll('$role', TEST_ROLE);

describe('the manifest (3.8)', () => {
  it.each([['manifest/valid', false], ['manifest/invalid', true]] as const)('every manifest in %s is %s', (folder, refused) => {
    for (const file of caseFiles(folder)) {
      const found = loadCase(file, ['about', 'rfc', 'manifest', 'raw', 'refuse']);
      expect(Boolean(found.refuse), `${name(file)} is in ${folder} but says refuse=${found.refuse}`).toBe(refused);
      if (refused) expect(() => decodeManifest(text(found), PROFILE), `${name(file)}: ${found.about}`).toThrow(ManifestError);
      else expect(() => decodeManifest(text(found), PROFILE), `${name(file)}: ${found.about}`).not.toThrow();
    }
  });

  it.each([
    ['{"v":2,"roles":["test-role"]}', 5],
    ['{"v":2,"roles":["test-role"],"timeout_ms":8000}', 8],
    ['{"v":2,"roles":["test-role"],"timeout_ms":60000}', 60],
    ['{"v":2,"roles":["test-role"],"timeout_ms":90000}', 60],
    ['{"v":2,"roles":["test-role"],"timeout_ms":1}', 0.001],
    ['{"v":2,"roles":["test-role"],"timeout_ms":99999999999999999999999}', 60],
  ])('gives a call %s a timeout of %s seconds: the default, or the manifest\'s, never over the cap', (raw, seconds) => {
    expect(manifestTimeout(decodeManifest(raw, PROFILE), TIMEOUT_CAP)).toBeCloseTo(seconds, 6);
  });

  it('lets a profile raise the cap for a named role, never below the core\'s', () => {
    const profile: Profile = { roles: ['slow', 'fast'], timeoutCaps: { slow: 300 } };
    const slow = decodeManifest('{"v":2,"roles":["slow"],"timeout_ms":200000}', profile);
    expect(manifestTimeout(slow, profile)).toBe(200);
    expect(manifestTimeout(decodeManifest('{"v":2,"roles":["fast"],"timeout_ms":200000}', profile), profile)).toBe(60);
  });

  it('returns what was declared, and ignores a field it does not know', () => {
    const manifest = decodeManifest(
      '{"v":2,"roles":["test-role"],"env":["A","B"],"secret_env":["B"],"title":"Example","description":"Checks it.","version":"1.2.0","homepage":"https://example.com/p","from_the_future":1}',
      PROFILE
    );
    expect(manifest).toMatchObject({ roles: [TEST_ROLE], env: ['A', 'B'], secretEnv: ['B'], title: 'Example', description: 'Checks it.', version: '1.2.0', homepage: 'https://example.com/p' });
    expect(manifest).not.toHaveProperty('from_the_future');
  });

  it.each([
    ['a fraction written as an exponent', '{"v":2,"roles":["test-role"],"timeout_ms":5e3}'],
    ['a float spelled with a zero fraction', '{"v":2,"roles":["test-role"],"timeout_ms":5000.0}'],
    ['a version written as a float', '{"v":2.0,"roles":["test-role"]}'],
    ['true for a version', '{"v":true,"roles":["test-role"]}'],
    ['a JSON constant JSON does not have', '{"v":2,"roles":["test-role"],"timeout_ms":Infinity}'],
  ])('refuses %s, which JSON parsers read differently', (_name, raw) => {
    expect(() => decodeManifest(raw, PROFILE)).toThrow(ManifestError);
  });

  it('reads a version past the range of a double without losing it', () => {
    expect(() => decodeManifest('{"v":2,"roles":["test-role"],"timeout_ms":' + '9'.repeat(5000) + '}', PROFILE)).not.toThrow();
  });
});

describe('the message of a plugin that exited 2 (5)', () => {
  const FALLBACK = 'plugin acme.vault could not answer';
  const LONG = 'a'.repeat(400);
  const CUT = 'é'.repeat(300);

  it.each<[string, Buffer | string, string]>([
    ['the first line', 'cannot judge: input missing\nsecond line\n', 'cannot judge: input missing'],
    ['trimmed', '   spaced out \t\n', 'spaced out'],
    ['without controls', 'a\x1b[31mred\x07\n', 'a[31mred'],
    ['without format characters, a bidi override and a zero-width space', 'ab‮cd​ef\n', 'abcdef'],
    ['up to the carriage return', 'one\r\ntwo\n', 'one'],
    ['cut to 300 characters', `${LONG}\n`, LONG.slice(0, 300)],
    ['cut to 300 clusters, not code points', `${CUT}ééééé\n`, CUT],
    ['kept at exactly 300 clusters', `${CUT}\n`, CUT],
    ['the host\'s own when the first line is empty', '\nthe second line is not the message\n', FALLBACK],
    ['the host\'s own when the first line is white space', '  \nthe second line is not the message\n', FALLBACK],
    ['the host\'s own when it is not UTF-8', Buffer.from('caf\xe9 broke\n', 'latin1'), FALLBACK],
    ['the host\'s own when stdout is empty', '', FALLBACK],
    ['the host\'s own when only white space is there', ' \t \n', FALLBACK],
    ['the host\'s own when only controls are there', '\x1b​\n', FALLBACK],
    ['a line with no newline', 'reason', 'reason'],
  ])('is %s', (_name, stdout, want) => {
    expect(message(typeof stdout === 'string' ? Buffer.from(stdout) : stdout, FALLBACK)).toBe(want);
  });

  it.each([
    ['abcdef', 3, 'abc'],
    ['ééé', 2, 'éé'],
    ['\u{1f1e7}\u{1f1ec}\u{1f1e9}\u{1f1ea}', 1, '\u{1f1e7}\u{1f1ec}'],
    ['ab', 5, 'ab'],
    ['', 3, ''],
  ])('truncates %j to %i clusters without splitting one: %j', (value, n, want) => {
    expect(truncateGraphemes(value, n)).toBe(want);
  });

  it('counts a flag, a combining mark and a skin tone as one character each', () => {
    expect(graphemeCount('\u{1f1e7}\u{1f1ec}')).toBe(1);
    expect(graphemeCount('é')).toBe(1);
    expect(graphemeCount('\u{1f44d}\u{1f3fd}')).toBe(1);
    expect(graphemeCount('a\u{1f1e7}\u{1f1ec}\u{1f1e9}\u{1f1ea}b')).toBe(4);
  });
});

describe('the layout of a shipped plugin (3.6)', () => {
  const GOOD = '/home/u/plugins/acme.first/bin/blazon-acme.first.🔌';
  it.each([
    ['a correct name', GOOD],
    ['a plugin outside the layout: one file beside a README', '/home/u/examples/acme.first/blazon-acme.first'],
    ['a pinned copy under .blazon/plugins', '/home/u/proj/.blazon/plugins/acme.first/blazon-acme.first'],
    ['a bin folder whose parent is not a plugin name', '/home/u/proj/tools/bin/blazon-thing'],
    ['a bin folder whose parent has uppercase', '/home/u/Acme.First/bin/blazon-whatever.js'],
    ['a file that does not start with blazon-', '/home/u/acme.first/bin/run.sh'],
    ['a bare file name', 'blazon-acme.first.js'],
  ])('is silent for %s', (_, program) => {
    expect(shippedLayoutProblem(program)).toBeUndefined();
  });

  it.each([
    ['the extension .js', 'blazon-acme.first.js'],
    ['no extension', 'blazon-acme.first'],
    ['a trailing .bak after the extension', 'blazon-acme.first.🔌.bak'],
    ['a name that is not the folder', 'blazon-acme.second.🔌'],
    ['uppercase in the name', 'blazon-Acme.first.🔌'],
    ['a dotted name that is only the first word', 'blazon-acme.🔌'],
  ])('names the right file for %s', (_, file) => {
    expect(shippedLayoutProblem(`/home/u/plugins/acme.first/bin/${file}`)).toBe(
      `the program of the plugin acme.first is in acme.first/bin, so its file name should be blazon-acme.first.🔌, not ${file}`,
    );
  });

  it('reads Windows separators too', () => {
    expect(shippedLayoutProblem('C:\\p\\acme.first\\bin\\blazon-acme.first.js')).toContain('should be blazon-acme.first.🔌');
  });
});
