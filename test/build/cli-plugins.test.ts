import { describe, it, expect } from 'vitest';
import { spawnSync } from '../support/spawn';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../support/paths';
import { starterProject } from '../support/project';
import { shippedPluginNames } from '../support/starter-facts';

// A plugin named in the config that blazon cannot find: the message says which plugin it thinks was meant.

const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

async function projectWithPlugin(name: string): Promise<string> {
  const root = await starterProject();
  fs.writeFileSync(path.join(root, 'blazon.config.ts'), `export default { title: 'T', plugins: [{ name: '${name}' }] };\n`);
  return root;
}

describe('a plugin name that matches nothing', () => {
  it('says which shipped plugin was meant', async () => {
    const ran = blazon('check', await projectWithPlugin('blazon.favicns'));
    expect(ran.status, ran.stdout + ran.stderr).toBe(1);
    expect(ran.stdout).toContain(
      'no program found: it is not pinned (see blazon plugin pin), and there is no blazon-blazon.favicns in .blazon/plugins or on PATH; did you mean "blazon.favicons"?',
    );
  });

  it('says nothing about a name that is near none', async () => {
    const ran = blazon('check', await projectWithPlugin('acme.zzzzzzzz'));
    expect(ran.stdout).toContain('no program found');
    expect(ran.stdout).not.toContain('did you mean');
  });
});

describe('plugins: ["nope"] in the config', () => {
  it('says each entry is an object, lists the shipped plugins, and offers the near one', async () => {
    const root = await starterProject();
    fs.writeFileSync(path.join(root, 'blazon.config.ts'), "export default { title: 'T', plugins: ['blazon.favicns'] };\n");
    const ran = blazon('check', root, '--json');
    expect(ran.status, ran.stdout + ran.stderr).toBe(1);
    const message = JSON.parse(ran.stdout).error.message as string;
    expect(message).toContain('plugins[0] must be an object {"name": "<plugin>"}, not a string');
    expect(message).toContain(`blazon ships: ${shippedPluginNames().join(', ')}`);
    expect(message).toContain('did you mean {"name": "blazon.favicons"}?');
  });
});
