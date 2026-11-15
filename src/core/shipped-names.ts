import fs from 'node:fs';
import path from 'node:path';
import { isPluginName } from './plugin-name.js';
import { packageRoot } from './package-root.js';

/** The file in plugins/ at the package root that lists the plugins blazon ships (RFC 0005 section 3.6). */
export const SHIPPED_LOCK = 'shipped.lock';

/**
 * The names of the plugins blazon ships, sorted; empty when the lock cannot be read. Only for a hint to the person who
 * wrote the config ("blazon ships: ..."): it reads the names and trusts nothing, so a damaged lock still lists what it
 * names. The host checks the lock strictly before it runs anything (src/plugins/pins/shipped.ts).
 */
export function shippedNames(): string[] {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(packageRoot(), 'plugins', SHIPPED_LOCK), 'utf-8')) as { plugins?: unknown };
    const plugins = lock.plugins;
    if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) return [];
    return Object.keys(plugins).filter(isPluginName).sort();
  } catch {
    return [];
  }
}
