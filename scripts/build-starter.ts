// Makes template/, the starter blazon's package carries, from examples/blazon: the one copy of blazon's own brand book.
// `npm pack` runs it through `prepack`; template/ is git-ignored and never committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyStarter } from '../src/core/starter.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'examples', 'blazon');
const out = path.join(root, 'template');

fs.rmSync(out, { recursive: true, force: true });
const { written } = copyStarter(out, source);
console.log(`build-starter: wrote ${written.length} files to template/ from examples/blazon`);
