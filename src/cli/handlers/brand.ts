import { buildBrandExport } from '../../core/brand/export.js';
import { UsageError } from '../errors.js';
import { readBrand } from '../read.js';
import type { Handler } from './types.js';

/** The value at a dotted path of a JSON document, or `undefined` when a step is missing. */
function valueAt(document: unknown, key: string): unknown {
  let at = document;
  for (const step of key.split('.')) {
    if (at === null || typeof at !== 'object' || !Object.prototype.hasOwnProperty.call(at, step)) return undefined;
    at = (at as Record<string, unknown>)[step];
  }
  return at;
}

/**
 * `get_brand`, `blazon brand`: the brand as brand.json holds it, compiled now and printed to standard output, so nothing is written and
 * nothing is stale. `--key theme.shadcn` prints only that part. Always JSON; exits 2 for a key the document does not have.
 */
export const getBrandHandler: Handler = async ({ key }, { dir }) => {
  const { config, data } = await readBrand(dir);
  const document = buildBrandExport(data, config, dir);
  const shown = key === undefined ? document : valueAt(document, key as string);
  if (shown === undefined) throw new UsageError(`brand.json has no "${String(key)}". Run blazon brand without --key to see the keys.`, undefined, 'unknown-key');
  // always JSON, with no `command` or `passed` around it: the document is the answer
  return { command: 'brand', passed: true, status: 0, body: {}, text: () => void process.stdout.write(`${JSON.stringify(shown, null, 2)}\n`) };
};
