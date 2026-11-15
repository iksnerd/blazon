import fs from 'node:fs';
import path from 'node:path';
import pc from '../../core/colors.js';
import { CHECKS } from '../../core/checker/catalogue.js';
import { blazonIdentity, blazonPinFindings, type BlazonIdentity } from '../../core/blazon-pin.js';
import { packageRoot } from '../../core/package-root.js';
import { chainProblem } from '../../plugins/pins/interpreter.js';
import { writableFix } from '../../plugins/roles/fixes.js';
import type { BlazonConfig } from '../../types/index.js';
import { loadProject } from '../project.js';
import { BlazonError } from '../errors.js';
import { printJson } from '../read.js';

// `blazon doctor`: is this machine and this folder fit to run blazon? It reads and reports; it runs no plugin and writes no file.

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: 'node' | 'brand' | 'plugin-host' | 'chrome' | 'lock';
  status: DoctorStatus;
  message: string;
  /** What to do about it; present when the status is not ok */
  fix?: string;
}

/** What the checks look at outside the folder, so a test can set each one. */
export interface DoctorEnv {
  nodeVersion: string;
  /** The `engines.node` range of blazon's package.json */
  engine: string | undefined;
  /** Why the plugin host would refuse to run a plugin from this folder, or undefined */
  hostProblem: (cwd: string) => string | undefined;
  /** Whether a Chrome that the drawing plugins can start is on this computer */
  chrome: () => boolean;
  identity: BlazonIdentity | null;
}

/**
 * The shipped plugins that start a browser to draw (their source calls `launchChrome`, src/shipped/shared/chrome.ts). A test holds this list
 * to the source, so a plugin that starts to draw cannot be left out.
 */
export const CHROME_PLUGINS: readonly string[] = [
  'blazon.brand-deck',
  'blazon.favicons',
  'blazon.logo-geometry',
  'blazon.logo-kit',
  'blazon.press-kit',
  'blazon.print-book',
  'blazon.social-cards',
];

const isProgram = (file: string): boolean => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/** The check the drawing plugins make: BLAZON_CHROME names a program, else Google Chrome is installed where the browser driver looks. Nothing is started. */
export function chromeFound(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.BLAZON_CHROME) return isProgram(env.BLAZON_CHROME);
  const places: string[] = [];
  if (process.platform === 'darwin') places.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  else if (process.platform === 'win32') {
    for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) if (base) places.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else
    places.push(
      '/opt/google/chrome/chrome',
      ...(env.PATH ?? '')
        .split(path.delimiter)
        .filter(Boolean)
        .flatMap((dir) => ['google-chrome', 'google-chrome-stable'].map((name) => path.join(dir, name))),
    );
  return places.some(isProgram);
}

const defaultEnv = (): DoctorEnv => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf-8')) as { engines?: { node?: string } };
  return {
    nodeVersion: process.version,
    engine: manifest.engines?.node,
    hostProblem: (cwd) => chainProblem(cwd, { final: 'dir' }),
    chrome: () => chromeFound(),
    identity: blazonIdentity(),
  };
};

/** `>=24` or `>=22.12`: the only range shape blazon's engines uses. Anything else cannot be compared, and is said so. */
function atLeast(version: string, range: string): boolean | undefined {
  const floor = /^>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
  const have = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!floor || !have) return undefined;
  const want = [floor[1], floor[2] ?? '0', floor[3] ?? '0'].map(Number);
  const got = [have[1], have[2], have[3]].map(Number);
  for (let i = 0; i < 3; i++) if (got[i]! !== want[i]!) return got[i]! > want[i]!;
  return true;
}

function nodeCheck(env: DoctorEnv): DoctorCheck {
  if (!env.engine) return { id: 'node', status: 'warn', message: `Node ${env.nodeVersion}; blazon's package.json names no engines range to compare`, fix: 'Reinstall blazon.' };
  const met = atLeast(env.nodeVersion, env.engine);
  if (met === undefined)
    return {
      id: 'node',
      status: 'warn',
      message: `Node ${env.nodeVersion}; engines is "${env.engine}", which doctor cannot compare`,
      fix: `Use a Node that satisfies ${env.engine}.`,
    };
  if (met) return { id: 'node', status: 'ok', message: `Node ${env.nodeVersion} (blazon needs ${env.engine})` };
  return {
    id: 'node',
    status: 'fail',
    message: `Node ${env.nodeVersion} is older than blazon needs (${env.engine})`,
    fix: `Install Node ${env.engine.replace(/^>=\s*/, '')} or newer, such as with nvm install ${env.engine.replace(/^>=\s*v?(\d+).*$/, '$1')}.`,
  };
}

async function brandCheck(cwd: string): Promise<{ check: DoctorCheck; config?: BlazonConfig }> {
  try {
    const config = await loadProject(cwd);
    return { check: { id: 'brand', status: 'ok', message: `brand folder found: tokens in ${config.tokensDir}, blazon.json loads` }, config };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fix = err instanceof BlazonError && err.fix ? err.fix : 'Fix the error in blazon.json, then run blazon doctor again.';
    return { check: { id: 'brand', status: 'fail', message, fix } };
  }
}

function hostCheck(cwd: string, env: DoctorEnv, plugins: number): DoctorCheck {
  const problem = env.hostProblem(cwd);
  if (!problem) return { id: 'plugin-host', status: 'ok', message: `${cwd} is a folder blazon will run plugins from` };
  const fix = /written by group or others/.test(problem) ? writableFix(cwd) : 'Run blazon from a folder under your own home folder that only you can write.';
  // With no plugin listed, nothing is refused yet: the folder is a risk for the day one is
  return { id: 'plugin-host', status: plugins > 0 ? 'fail' : 'warn', message: `${problem}, so blazon will refuse to run plugins from it`, fix };
}

function chromeCheck(env: DoctorEnv, config: BlazonConfig | undefined): DoctorCheck {
  const drawing = [...new Set((config?.plugins ?? []).map((plugin) => plugin.name).filter((name) => CHROME_PLUGINS.includes(name)))];
  if (drawing.length === 0) return { id: 'chrome', status: 'ok', message: 'Google Chrome is not needed: no configured plugin draws in a browser' };
  if (env.chrome()) return { id: 'chrome', status: 'ok', message: `Google Chrome found, for ${drawing.join(', ')}` };
  return {
    id: 'chrome',
    status: 'fail',
    message: `no Google Chrome found, and ${drawing.join(', ')} draw${drawing.length === 1 ? 's' : ''} in one`,
    fix: 'Install Google Chrome, or set BLAZON_CHROME to a Chrome or Chromium program; or take the plugin out of blazon.json.',
  };
}

function lockCheck(cwd: string, env: DoctorEnv): DoctorCheck {
  if (!fs.existsSync(path.join(cwd, 'blazon.lock'))) return { id: 'lock', status: 'ok', message: 'no blazon.lock: this book is not pinned to a blazon build' };
  const found = blazonPinFindings(cwd, env.identity)[0];
  if (!found) return { id: 'lock', status: 'ok', message: 'blazon.lock matches the blazon that is running' };
  return { id: 'lock', status: 'fail', message: found.message, fix: found.fix ?? (CHECKS[found.code as keyof typeof CHECKS] as { fix?: string }).fix };
}

/** Every check, in a fixed order. Reads files and the environment; runs no plugin and writes nothing. */
export async function doctorChecks(cwd: string, env: DoctorEnv = defaultEnv()): Promise<DoctorCheck[]> {
  const brand = await brandCheck(cwd);
  return [nodeCheck(env), brand.check, hostCheck(cwd, env, brand.config?.plugins?.length ?? 0), chromeCheck(env, brand.config), lockCheck(cwd, env)];
}

const paint: Record<DoctorStatus, (text: string) => string> = { ok: pc.green, warn: pc.yellow, fail: pc.red };

/** `blazon doctor`: one line per check, the fix under each that is not ok. Returns the exit status: 1 when a check fails, else 0. */
export async function runDoctor(cwd: string = process.cwd(), options: { json?: boolean } = {}): Promise<number> {
  const checks = await doctorChecks(cwd);
  const passed = !checks.some((check) => check.status === 'fail');
  if (options.json) {
    printJson('doctor', passed, { checks });
    return passed ? 0 : 1;
  }
  console.log();
  for (const check of checks) {
    console.log(`  ${paint[check.status](check.status.padEnd(4))}  ${check.id.padEnd(11)}  ${check.message}`);
    if (check.status !== 'ok' && check.fix) console.log(pc.dim(`        fix: ${check.fix}`));
  }
  console.log();
  return passed ? 0 : 1;
}
