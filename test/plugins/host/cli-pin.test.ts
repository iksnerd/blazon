import { describe, it, expect } from 'vitest';
import { BLAZON_PROFILE } from '../../../src/plugins/wire/profile.js';
import { tempDir } from '../../support/project';
import { caseFiles, loadCase, materialize } from '../support/spec.js';
import { blazon } from '../../support/plugin-cli';

// `blazon plugin check <program>` is the host's check command (RFC 0005 section 9) and `blazon plugin pin <path>` prints the digest of a
// file or a tree (section 3.4), run as the real command. This file: the action list, `plugin pin` and the profile. The rest is in cli-*.test.ts.

describe('blazon plugin', () => {
  it.each([[[]], [['frobnicate']], [['frobnicate', 'x']]])('exits 2 and lists the two actions for %j', (args) => {
    const result = blazon('plugin', ...args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('blazon plugin check <program>');
    expect(result.stderr).toContain('blazon plugin pin <path>');
  }, 60_000);
});

describe('blazon plugin pin', () => {
  it('prints the digest the corpus gives for the same tree, and for the same file', () => {
    for (const [file, kind] of [['nested', 'tree'], ['single-exec-file', 'tree'], ['file-pin', 'file']] as const) {
      const found = loadCase(caseFiles('valid', 'tree-digest').find((candidate) => candidate.endsWith(`${file}.json`))!, ['about', 'kind', 'root', 'entries', 'digest', 'refuse']);
      expect(found.kind).toBe(kind);
      const result = blazon('plugin', 'pin', materialize(found, tempDir()));
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(found.digest);
    }
  }, 60_000);

  it('exits 1 and says why for a tree a host must refuse', () => {
    const found = loadCase(caseFiles('invalid', 'tree-digest').find((candidate) => candidate.endsWith('symlink-to-file.json'))!, ['about', 'kind', 'root', 'entries', 'digest', 'refuse']);
    const result = blazon('plugin', 'pin', materialize(found, tempDir()));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refused: symlink');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('exits 2 when it is not given a path', () => {
    const result = blazon('plugin', 'pin');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage');
  }, 60_000);
});

describe("blazon's profile", () => {
  it('is a document with the fields the profile defines: a host, its check command, its roles and their exit codes', () => {
    expect(BLAZON_PROFILE).toMatchObject({ v: 1, host: 'blazon', check_command: 'blazon plugin check' });
    expect(BLAZON_PROFILE.roles.map((role) => role.name)).toEqual(['check', 'build']);
    for (const role of BLAZON_PROFILE.roles) expect(Object.keys(role.exit_codes)).toEqual(['0', '2']);
  });

  it('says exit 1 is not an answer for either role, so a plugin that dies on an uncaught exception is a break', () => {
    for (const role of BLAZON_PROFILE.roles) expect(role.exit_codes).not.toHaveProperty('1');
  });

  it('holds no secret and no path of the operator: it is the same for every install', () => {
    expect(JSON.stringify(BLAZON_PROFILE)).not.toMatch(/\/Users\/|\/home\//);
  });
});
