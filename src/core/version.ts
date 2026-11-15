import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from './package-root.js';

/** The version in blazon's own package.json: the one place a release number is written. */
export const BLAZON_VERSION: string = (JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf-8')) as { version: string }).version;
