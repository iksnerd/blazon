import fs from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { Cannot } from './plugin.js';

// The browser the plugins that draw with one share. It is apart from plugin.ts so that a plugin that never draws reads no
// BLAZON_CHROME, and its manifest does not have to list it.

const INSTALL_HINT = 'install Google Chrome, or set BLAZON_CHROME to a Chrome or Chromium program';

/**
 * The browser: the program BLAZON_CHROME names, else the Google Chrome installed on this computer. It never downloads one.
 * `what` completes "no browser to ...", such as "print with".
 */
export async function launchChrome(env: NodeJS.ProcessEnv, what: string): Promise<Browser> {
  const named = env.BLAZON_CHROME;
  if (named) {
    if (!isProgram(named)) throw new Cannot(`no browser to ${what}: BLAZON_CHROME names ${named}, which is not a program; ${INSTALL_HINT}`);
    return chromium.launch({ executablePath: named });
  }
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    throw new Cannot(`no browser to ${what}: ${INSTALL_HINT}`);
  }
}

function isProgram(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
