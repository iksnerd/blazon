import type { Browser } from 'playwright-core';
import { launchChrome } from '../shared/chrome.js';

/** The browser to draw with: the program BLAZON_CHROME names, else the Google Chrome installed on this computer. */
export const launch = (env: NodeJS.ProcessEnv): Promise<Browser> => launchChrome(env, 'draw the cards with');
