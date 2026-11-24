import path from 'node:path';
import { chainFault, readShebang, type ChainFault } from './interpreter.js';
import { readLockFile, type LockEntry } from './lock.js';
import { packageRoot } from '../../core/package-root.js';
import { SHIPPED_LOCK } from '../../core/shipped-names.js';
import { treeDigest } from './pin.js';

// Plugins that ship inside blazon's own package (RFC 0005 section 3.6: "pinned like any other, by a lock the
// release ships beside it"). They live in plugins/<name>/ at the package root and plugins/shipped.lock records the tree
// digest of each. They run in place, not from a private copy, because they need blazon's own node_modules and built code.
// So before every call the host checks two things: the folder is the one the lock names, and nobody but the user and
// root can change the folder or any directory above it. Between the check and the start, whoever can write the folder
// could still change it: the second check is what keeps that to the owner of the install.

export { SHIPPED_LOCK };

/** A shipped plugin as the lock describes it, with absolute paths. */
export interface Shipped {
  /** The plugin's folder; the program runs with this as its working directory */
  directory: string;
  /** The program, inside the folder */
  entry: string;
  digest: string;
}

/** The folder that holds the shipped plugins and their lock. */
export const shippedDirectory = (): string => path.join(packageRoot(), 'plugins');

/** The two faults of chainProblem that are about who else can change a folder, not about what is in it. */
const OPEN_PLACE = / can be written by group or others$| is owned by user \d+, who is neither you nor root$/;
const inside = (value: string) => value !== '' && !value.startsWith('/') && !value.split('/').includes('..');
const isNodeFile = (file: string) => /\.(?:js|cjs|mjs)$/.test(file);

/**
 * The shipped plugin called `name`: undefined when the lock does not list it, a reason when the lock cannot be used or
 * its entry is wrong. A lock that cannot be read lists nothing, so it is a reason for every name, never a way to look
 * past it.
 */
export function findShipped(directory: string, name: string): Shipped | { problem: string } | undefined {
  const { lock, problems } = readLockFile(path.join(directory, SHIPPED_LOCK), SHIPPED_LOCK);
  if (problems.length > 0) return { problem: `the lock that ships with blazon cannot be used (${problems.map((p) => p.message).join('; ')}); reinstall blazon` };
  const entry: LockEntry | undefined = lock.plugins[name];
  if (!entry) return undefined;
  if (entry.kind !== 'tree' || !inside(entry.path) || entry.entry === undefined) {
    return { problem: `${SHIPPED_LOCK} describes ${name} as something blazon does not run: a tree inside plugins/ with a program in it; reinstall blazon` };
  }
  const folder = path.join(directory, entry.path);
  return { directory: folder, entry: path.join(folder, entry.entry), digest: entry.digest };
}

/** Why a shipped plugin may not run now, or undefined. Done before every call: a change after the last one is caught by the next. */
export function shippedProblem(shipped: Shipped): string | undefined {
  return shippedTrouble(shipped)?.problem;
}

/**
 * The same, with `place` set when the cause is where blazon is installed: a folder on the way that another user can write
 * or owns. That one is not fixed by reinstalling in the same place, so the host gives it a fix of its own.
 */
export function shippedTrouble(shipped: Shipped): { problem: string; place: boolean; writable?: ChainFault['writable'] } | undefined {
  const fault = chainFault(shipped.directory, { final: 'dir' }) ?? chainFault(shipped.entry);
  if (fault) {
    const untrusted = fault.message;
    const place = OPEN_PLACE.test(untrusted);
    return { writable: fault.writable, problem: `${untrusted}, so blazon will not run a plugin from ${shipped.directory}${place ? '' : '; reinstall blazon'}`, place };
  }
  let got: string;
  try {
    got = treeDigest(shipped.directory);
  } catch (err) {
    return { problem: `the plugin folder ${shipped.directory} cannot be read (${err instanceof Error ? err.message : String(err)}); reinstall blazon`, place: false };
  }
  if (got !== shipped.digest) return { problem: `the plugin folder ${shipped.directory} does not match the lock that ships with blazon (want ${shipped.digest}, found ${got}); reinstall blazon`, place: false };
  return undefined;
}

/**
 * How to start the program. JavaScript runs on the node that runs blazon, by its own path: a lookup on PATH would run
 * whatever node the environment names, and the interpreter search of a pinned copy refuses a machine whose node sits
 * in a directory others can write. Anything else is started as the kernel starts it.
 */
export function shippedLaunch(entry: string): { program: string; args: string[] } {
  if (isNodeFile(entry)) return { program: process.execPath, args: [entry] };
  const shebang = readShebang(entry);
  const node = shebang !== undefined && shebang.arg === undefined && (shebang.viaEnv ? shebang.interpreter === 'node' : shebang.interpreter === '/usr/bin/node');
  return node ? { program: process.execPath, args: [entry] } : { program: entry, args: [] };
}
