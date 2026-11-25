import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chainProblem } from '../../../src/plugins/pins/interpreter.js';
import { Pin, treeDigest } from '../../../src/plugins/pins/pin.js';
import { run } from '../../../src/plugins/host/call.js';
import { fixOf, interpreterFix } from '../../../src/plugins/roles/fixes.js';
import { ROOT_DIR } from '../support/spec.js';

// What the finding says to do about each reason the host refuses the interpreter of a pinned plugin. The refusal itself is the host's and
// is tested in interpreter.test.ts; here only the fix text is, for each reason, through the same call the roles make.

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const cache = path.join(ROOT_DIR, 'node_modules/.cache');
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(cache, 'blazon-interpreter-fix-')));
  dirs.push(dir);
  return dir;
}
const base = scratch();
const cleanHere = chainProblem(base, { final: 'dir' }) === undefined;
if (!cleanHere) console.warn(`interpreter-fix.test: skipped, the scratch folder is not clean: ${chainProblem(base, { final: 'dir' })}`);
const here = cleanHere ? it : it.skip;

const write = (file: string, content: string, mode = 0o755) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, mode);
  return file;
};

/** The fix of a pinned plugin whose first line is `firstLine`, as the check role would give it. */
async function fixFor(firstLine: string, env: Record<string, string> = {}): Promise<{ fix: string | undefined; reason: string }> {
  const root = path.join(scratch(), 'tree');
  write(path.join(root, 'plugin'), `${firstLine}\nexit 0\n`);
  const pin = new Pin('tree', root, treeDigest(root), 'plugin');
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const result = await run({ pin, timeout: 5, store: scratch() });
    expect(result.answered).toBe(false);
    expect(result.cause).toBe('interpreter');
    return { fix: fixOf(result, 'acme.lint', 'plugins/acme.lint'), reason: result.breakReason };
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

describe('the fix for a refused interpreter', () => {
  it('asks for the #! line to be edited and the plugin pinned again, for a line that breaks the rules', async () => {
    const { fix } = await fixFor('#!python3');
    expect(fix).toBe("Edit the first line (#!) of the plugin's program as the message says, then pin it again: blazon plugin pin plugins/acme.lint --name acme.lint.");
  });

  it('names the interpreter and BLAZON_PLUGIN_PATH for a name env cannot find', async () => {
    const { fix } = await fixFor('#!/usr/bin/env acme-no-such-interpreter');
    expect(fix).toContain('Install acme-no-such-interpreter in a folder that only you or root can write');
    expect(fix).toContain('BLAZON_PLUGIN_PATH');
    expect(fix).toContain('docs/manual/12-plugins.md');
  });

  here('names the folder the operator listed that was left out, for a name env cannot find', async () => {
    const open = path.join(scratch(), 'open');
    write(path.join(open, 'acme-tool'), '#!/bin/sh\n');
    fs.chmodSync(open, 0o775);
    const { fix } = await fixFor('#!/usr/bin/env acme-tool', { BLAZON_PLUGIN_PATH: open });
    expect(fix).toContain(`BLAZON_PLUGIN_PATH names ${open}, which was left out`);
  });

  here('names the path, its mode and the chmod for an interpreter in a folder others can write', async () => {
    const open = path.join(scratch(), 'open');
    const interpreter = write(path.join(open, 'sh2'), '#!/bin/sh\n');
    fs.chmodSync(open, 0o775);
    const { fix } = await fixFor(`#!${interpreter}`);
    expect(fix).toBe(`${open} has mode 775, so it is group-writable (g+w). If it is yours, run: chmod g-w ${open}`);
  });

  here('names the file and its mode when the interpreter itself is the writable one', async () => {
    const interpreter = write(path.join(scratch(), 'sh2'), '#!/bin/sh\n', 0o757);
    const { fix } = await fixFor(`#!${interpreter}`);
    expect(fix).toBe(`${interpreter} has mode 757, so it is other-writable (o+w). If it is yours, run: chmod o-w ${interpreter}`);
  });

  it('says where to put the interpreter when the writable folder is not the user\'s to change', () => {
    const shared = { kind: 'writable' as const, path: '/tmp', message: '', writable: { path: '/tmp', mode: 0o1777, uid: 0 } };
    const fix = interpreterFix({ kind: 'chain', interpreter: '/tmp/acme-sh', fault: shared }, 'acme.lint', undefined, 501);
    expect(fix).toContain('/tmp can be written by other users and is not yours to change');
    expect(fix).toContain('BLAZON_PLUGIN_PATH');
    expect(fix).not.toContain('chmod');
  });

  it('says where to put the interpreter when another user owns the folder on the way', () => {
    const fault = { kind: 'owner' as const, path: '/opt/acme', message: '' };
    const fix = interpreterFix({ kind: 'chain', interpreter: '/opt/acme/sh', fault }, 'acme.lint');
    expect(fix).toBe('/opt/acme belongs to another user: install the interpreter in a folder that only you or root can write, and name that folder in BLAZON_PLUGIN_PATH (docs/manual/12-plugins.md).');
  });

  here('names the missing interpreter and how to pin the plugin again', async () => {
    const missing = path.join(scratch(), 'no-such-interpreter');
    const { fix } = await fixFor(`#!${missing}`);
    expect(fix).toBe(`${missing} does not exist. Install the interpreter there, or change the #! line to where it is, then pin the plugin again: blazon plugin pin plugins/acme.lint --name acme.lint.`);
  });

  here('names the interpreter that is not executable and the chmod +x', async () => {
    const interpreter = write(path.join(scratch(), 'sh2'), '#!/bin/sh\n', 0o644);
    const { fix } = await fixFor(`#!${interpreter}`);
    expect(fix).toBe(`${interpreter} is not executable. If it is yours, run: chmod +x ${interpreter}`);
  });

  here('asks for a regular program when the interpreter is a folder', async () => {
    const folder = scratch();
    const { fix } = await fixFor(`#!${folder}`);
    expect(fix).toBe(`${folder} is not the kind of file an interpreter is. Point the #! line at a regular program file, then pin the plugin again: blazon plugin pin plugins/acme.lint --name acme.lint.`);
  });

  here('says a loop of links is to be replaced by the real interpreter', async () => {
    const dir = scratch();
    fs.symlinkSync(path.join(dir, 'b'), path.join(dir, 'a'));
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'));
    const { fix } = await fixFor(`#!${path.join(dir, 'a')}`);
    expect(fix).toBe(`${path.join(dir, 'a')} leads through a loop of links. Point the #! line at the real interpreter, then pin the plugin again: blazon plugin pin plugins/acme.lint --name acme.lint.`);
  });
});
