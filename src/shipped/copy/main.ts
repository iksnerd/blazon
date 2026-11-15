import { runPlugin } from '../shared/plugin.js';
import { copyFindings } from './checks.js';
import { parseOptions } from './options.js';
import { jobFor, MANIFEST, NAME } from './request.js';

// blazon.copy: blazon's check role. Reads one request on standard input and holds the brand book's text to the brand's copy rules: the terms it
// avoids, the case of its headings and the length of its sentences. It reads brand.json only (the pages' Markdown and the assets' sidecar
// text) and answers {"findings": [...]}: all warnings, because they are heuristics, and an error for an option that is wrong. Wrong options are
// findings, not a failure. A broken request is exit 2 with the reason as the first line of standard output. It writes nothing, and it needs
// Node and nothing else.

async function check(text: string): Promise<{ findings: unknown[] }> {
  const job = jobFor(text);
  const { options, findings } = parseOptions(job.options);
  return { findings: [...findings, ...copyFindings(job.brand, options)] };
}

// Not a top-level await: the built program is CommonJS (scripts/build-plugins.mjs), which has none.
void runPlugin(process.argv.slice(2), MANIFEST, check, 'the copy rules could not be checked', NAME).then((code) => {
  process.exitCode = code;
});
