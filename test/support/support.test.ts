import { describe, it, expect } from 'vitest';
import { DEFAULT_SPAWN_TIMEOUT_MS, execFileSync, spawnSync, withTimeout } from './spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/core/config/index.js';
import { copyProject, exampleProject, exampleRoot, hasExample, EXAMPLES } from './examples.js';
import { REPO } from './paths.js';
import { removeAll, setPlugins, starterProject, tempDir, tempProject } from './project.js';

// The shared test fixtures: a temporary project that is removed after the test file that made it, a fresh starter, and
// a copy of an example without the folders a build writes. Each test file used to write its own copy of this code.

describe('tempProject', () => {
  it('writes the files, objects as JSON and text as it is, with their folders, and returns a folder that exists', () => {
    const root = tempProject({ 'tokens/colors.json': { color: { $type: 'color' } }, 'docs/01-intro.md': '# Intro\n', 'a/b/c.txt': 'deep' });
    expect(path.isAbsolute(root)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'tokens/colors.json'), 'utf-8'))).toEqual({ color: { $type: 'color' } });
    expect(fs.readFileSync(path.join(root, 'docs/01-intro.md'), 'utf-8')).toBe('# Intro\n');
    expect(fs.readFileSync(path.join(root, 'a/b/c.txt'), 'utf-8')).toBe('deep');
  });

  it('is an empty folder when no file is given, and a different one each time', () => {
    const first = tempProject();
    const second = tempProject();
    expect(fs.readdirSync(first)).toEqual([]);
    expect(first).not.toBe(second);
  });

  it('is under the system temporary folder, resolved, so a path compared with a real path agrees', () => {
    const root = tempProject();
    expect(root.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
    expect(fs.realpathSync(root)).toBe(root);
  });
});

describe('tempDir', () => {
  it('starts its name with the prefix it is given', () => {
    expect(path.basename(tempDir('blazon-prefix-'))).toMatch(/^blazon-prefix-/);
  });
});

describe('removeAll', () => {
  it('removes every folder made so far, says how many, and does nothing the second time', () => {
    const before = removeAll();
    const a = tempProject({ 'x.txt': '1' });
    const b = tempDir();
    expect(removeAll()).toBe(2);
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
    expect(removeAll()).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

describe('after the test file', () => {
  it('removes what its tests made, without the file writing a cleanup of its own', () => {
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-support-run-')));
    try {
      const project = path.join(REPO, 'test/support/project.ts');
      fs.writeFileSync(
        path.join(scratch, 'made.test.ts'),
        `import { it, expect } from 'vitest';
import fs from 'node:fs';
import { tempProject } from ${JSON.stringify(project)};
it('makes a project', () => {
  const root = tempProject({ 'a.txt': 'x' });
  fs.writeFileSync(${JSON.stringify(path.join(scratch, 'where.txt'))}, root);
  expect(fs.existsSync(root)).toBe(true);
});
`,
      );
      fs.writeFileSync(path.join(scratch, 'vitest.config.mjs'), `export default { test: { globals: true, include: ['made.test.ts'], root: ${JSON.stringify(scratch)} } };\n`);
      const ran = spawnSync(path.join(REPO, 'node_modules/.bin/vitest'), ['run', '--config', path.join(scratch, 'vitest.config.mjs')], { cwd: scratch, encoding: 'utf-8' });
      expect(ran.status, ran.stdout + ran.stderr).toBe(0);
      const made = fs.readFileSync(path.join(scratch, 'where.txt'), 'utf-8');
      expect(fs.existsSync(made)).toBe(false);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('starterProject', () => {
  it('is what `blazon init` writes, and a config blazon can load', async () => {
    const root = await starterProject();
    for (const name of ['blazon.json', 'tokens', 'docs']) expect(fs.existsSync(path.join(root, name)), name).toBe(true);
    const config = await loadConfig(root);
    expect(config.tokensDir).toBeTruthy();
  }, 30_000);
});

describe('copyProject', () => {
  it('copies a project without dist, node_modules and .blazon, at any depth, and leaves the source alone', () => {
    const source = tempProject({
      'blazon.json': '{}\n',
      'tokens/colors.json': {},
      'dist/site/index.html': 'built',
      'node_modules/x/index.js': 'x',
      '.blazon/plugins/blazon-x': '#!/bin/sh\n',
      'assets/dist/keep-out.txt': 'nested dist',
      'assets/logos/mark.svg': '<svg/>',
    });
    const copy = copyProject(source);
    expect(copy).not.toBe(source);
    expect(fs.readdirSync(copy).sort()).toEqual(['assets', 'blazon.json', 'tokens']);
    expect(fs.readdirSync(path.join(copy, 'assets')).sort()).toEqual(['logos']);
    expect(fs.existsSync(path.join(source, 'dist/site/index.html'))).toBe(true);
  });

  it('is removed after the test file, like any temporary project', () => {
    const source = tempProject({ 'a.txt': '1' });
    const copy = copyProject(source);
    removeAll();
    expect(fs.existsSync(copy)).toBe(false);
  });
});

describe('exampleProject', () => {
  it('names the examples it knows, and refuses another with the list', () => {
    expect([...EXAMPLES].sort()).toEqual(['auth0', 'blazon', 'slack']);
    expect(() => exampleProject('nowhere' as never)).toThrow(/auth0.*blazon.*slack/);
  });

  for (const name of EXAMPLES) {
    it.skipIf(!hasExample(name))(`copies ${name} with its config, tokens and docs and none of what a build writes`, () => {
      const copy = exampleProject(name);
      for (const entry of ['blazon.json', 'tokens', 'docs']) expect(fs.existsSync(path.join(copy, entry)), entry).toBe(true);
      for (const entry of ['dist', 'node_modules', '.blazon']) expect(fs.existsSync(path.join(copy, entry)), entry).toBe(false);
    });
  }

  it('says so when a reference example is not there', () => {
    const missing = EXAMPLES.filter((name) => !hasExample(name));
    for (const name of missing) expect(() => exampleProject(name)).toThrow(/reference material/);
  });

  it('does not touch the example in the repository', () => {
    const before = fs.readdirSync(exampleRoot('blazon')).sort();
    const copy = exampleProject('blazon');
    fs.mkdirSync(path.join(copy, 'dist'));
    expect(fs.readdirSync(exampleRoot('blazon')).sort()).toEqual(before);
  });
});

describe('spawn helpers', () => {
  it('give every call a timeout and SIGKILL unless the caller sets its own', () => {
    expect(withTimeout()).toEqual({ timeout: DEFAULT_SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
    expect(withTimeout({ timeout: 5 })).toMatchObject({ timeout: 5, killSignal: 'SIGKILL' });
    expect(withTimeout({ killSignal: 'SIGTERM' })).toMatchObject({ timeout: DEFAULT_SPAWN_TIMEOUT_MS, killSignal: 'SIGTERM' });
  });

  it('stop a child that never exits, which a synchronous call cannot otherwise be interrupted from', () => {
    const started = Date.now();
    const ran = spawnSync('sleep', ['30'], { timeout: 300, encoding: 'utf-8' });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect((ran.error as NodeJS.ErrnoException | undefined)?.code).toBe('ETIMEDOUT');
    expect(ran.status).toBeNull();
  });

  it('accept the options-only form and still pass the arguments through', () => {
    const ran = spawnSync('echo', ['hi'], { encoding: 'utf-8' });
    expect(ran.stdout).toBe('hi\n');
    expect(spawnSync('pwd', { encoding: 'utf-8', cwd: os.tmpdir() }).status).toBe(0);
  });

  it('make execFileSync throw ETIMEDOUT instead of waiting', () => {
    expect(() => execFileSync('sleep', ['30'], { timeout: 300 })).toThrow(/ETIMEDOUT/);
  });

  it('hand input to the child as a file that ends by itself, and clean the file up', () => {
    // The helper writes into os.tmpdir(), which the other test files, running in parallel, share: count in a folder of our own,
    // or one of their requests, created or removed between the two counts, fails this test.
    const own = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-support-'));
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = own;
    try {
      const ran = spawnSync('cat', [], { input: 'a request\n', encoding: 'utf-8' });
      expect(ran.stdout).toBe('a request\n');
      expect(ran.status).toBe(0);
      expect(fs.readdirSync(own)).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
      fs.rmSync(own, { recursive: true, force: true });
    }
  });

  it('end a child that reads its stdin to the end, however large the input is', () => {
    const big = 'x'.repeat(3_000_000);
    const ran = spawnSync('wc', ['-c'], { input: big, encoding: 'utf-8' });
    expect(Number(ran.stdout.trim())).toBe(big.length);
  });

  it("keep the caller's other stdio settings and pass binary input through", () => {
    const ran = spawnSync('cat', [], { input: Buffer.from([0, 1, 2, 255]), stdio: ['pipe', 'pipe', 'ignore'] });
    expect([...(ran.stdout as Buffer)]).toEqual([0, 1, 2, 255]);
  });

  it('give execFileSync the same file-backed input', () => {
    expect(execFileSync('cat', [], { input: 'hello', encoding: 'utf-8' })).toBe('hello');
  });
});

describe('starterProject: the plugins a test wants', () => {
  const names = async (root: string) => ((await loadConfig(root)).plugins ?? []).map((plugin) => plugin.name);

  it('allows no plugin by default, though the starter was made with one', async () => {
    const root = await starterProject();
    expect(await names(root)).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'blazon.json'), 'utf-8')).not.toContain('blazon.copy');
  });

  it("keeps the starter's own list when the test says so", async () => {
    expect(await names(await starterProject({ plugins: 'starter' }))).toEqual(['blazon.copy', 'blazon.tailwind', 'blazon.shadcn']);
  });

  it('allows exactly the plugins it names, as names, with options as data', async () => {
    const root = await starterProject({ plugins: ['acme.a', { name: 'acme.b', options: { x: 1 } }, { name: 'acme.c', options: { y: 2 } }] });
    const config = await loadConfig(root);
    expect(config.plugins).toEqual([{ name: 'acme.a' }, { name: 'acme.b', options: { x: 1 } }, { name: 'acme.c', options: { y: 2 } }]);
    // The starter's own blazon.copy is not left behind to win over them
    expect(await names(root)).not.toContain('blazon.copy');
  });

  it('allows no plugin for an empty list, as for none', async () => {
    expect(await names(await starterProject({ plugins: [] }))).toEqual([]);
  });

  it('refuses a config it cannot put the plugins into, and says which', () => {
    const root = tempProject({ 'blazon.json': '[]\n' });
    expect(() => setPlugins(root, ['acme.a'])).toThrow(/must be a JSON object/);
  });
});
