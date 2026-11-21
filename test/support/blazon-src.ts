import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from './spawn';
import { starterProject } from './init-project';
import { REPO } from './paths';

/** Runs the CLI from source, with no colour and an empty standard input. */
export const blazon = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/blazon-src.ts'), ...args], {
    encoding: 'utf-8',
    cwd: REPO,
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
  });

/** The starter, with its first color token set to something that is not a color. */
export async function brokenProject(): Promise<string> {
  const root = await starterProject();
  const file = path.join(root, 'tokens/colors.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const first = (group: Record<string, any>): Record<string, any> | undefined => {
    for (const value of Object.values(group)) {
      if (value && typeof value === 'object' && '$value' in value) return value;
      if (value && typeof value === 'object') {
        const found = first(value);
        if (found) return found;
      }
    }
  };
  first(data)!.$value = 'notacolor';
  fs.writeFileSync(file, JSON.stringify(data));
  return root;
}
