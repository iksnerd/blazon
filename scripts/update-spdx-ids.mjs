// Rewrites src/core/checker/spdx-ids.json from the SPDX license list (https://github.com/spdx/license-list-data, CC0-1.0).
// The check for a font's `license` (src/core/checker/font-meta.ts) reads that file; it never goes to the network. Run this by
// hand when SPDX publishes a new list, read the diff, and commit it: `node scripts/update-spdx-ids.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/spdx/license-list-data/main/json';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/core/checker/spdx-ids.json');

async function get(name) {
  const response = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const [licenses, exceptions] = await Promise.all([get('licenses.json'), get('exceptions.json')]);
if (!Array.isArray(licenses.licenses) || !Array.isArray(exceptions.exceptions)) throw new Error('the SPDX files do not have the shape this script reads');

const ids = (list, key) => list.map((entry) => entry[key]).sort((a, b) => a.localeCompare(b));
const snapshot = {
  source: 'https://github.com/spdx/license-list-data (CC0-1.0), written by scripts/update-spdx-ids.mjs',
  listVersion: licenses.licenseListVersion,
  releaseDate: String(licenses.releaseDate).slice(0, 10),
  licenses: ids(licenses.licenses, 'licenseId'),
  exceptions: ids(exceptions.exceptions, 'licenseExceptionId'),
};
fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.error(`spdx-ids.json: ${snapshot.licenses.length} licenses and ${snapshot.exceptions.length} exceptions, list ${snapshot.listVersion} of ${snapshot.releaseDate}`);
