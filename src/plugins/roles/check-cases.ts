import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { result, type CheckResult, type RoleCases } from '../host/check.js';
import { isPluginName, pluginNameOfEntry } from '../../core/plugin-name.js';
import { STDOUT_LIMIT } from '../wire/limits.js';
import { blazonRequests, roleRuntime } from '../wire/profile.js';
import { MAX_FINDINGS, readAnswer, type Role } from './roles.js';

// The cases blazon adds to the core ones of RFC 0005 section 9, for each of its roles a plugin's manifest declares. Each is
// read from the profile (BLAZON_PROFILE: the exit codes, the stdout limit) and from the answer blazon's roles accept
// (readAnswer), so the check and the host cannot disagree. They are numbered after the core cases.

/** Where the build role is documented: a plugin writes only into its own folder. */
const OUTPUT_FOLDER_DOC = 'docs/manual/12-plugins.md ("What a plugin can look at, and where it writes")';

/** The plugin name in a program's file name, `blazon-<name>` or `blazon-<name>.🔌`; undefined when it has none. */
function pluginNameOf(program: string): string | undefined {
  const file = path.basename(program);
  const name = pluginNameOfEntry(file) ?? file.replace(/^blazon-/, '');
  return isPluginName(name) ? name : undefined;
}

/** Every file and folder under `root`, relative to it, leaving out `skip` and what is inside it. */
function written(root: string, skip: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[]).filter((entry) => path.join(root, entry) !== skip && !path.join(root, entry).startsWith(skip + path.sep)).sort();
}

/** The cases of blazon's roles for the plugin at `program`. */
export function blazonRoleCases(program: string): RoleCases {
  const name = pluginNameOf(program);
  return async (role, call) => {
    const runtime = roleRuntime(role);
    const codes = runtime.answers.join(' or ');
    const limit = runtime.stdoutLimit ?? STDOUT_LIMIT;
    const results: CheckResult[] = [];
    const names = {
      exit: `a valid request is answered with exit ${codes}`,
      limit: `the answer is at most ${limit} bytes`,
      shape: `the answer is one the ${role} role accepts: a findings list of at most ${MAX_FINDINGS}, each with the plugin's code, a severity, a path and a message`,
      folder: 'the plugin writes into out_dir and nothing beside it',
    };

    // The request blazon sends, with a build plugin's folders as blazon lays them out: out_dir is <tokens_dir>/<id>, empty
    const request = JSON.parse(blazonRequests()[role]!) as Record<string, unknown>;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blazon-plugin-check-'));
    const tokensDir = path.join(root, 'tokens');
    const outDir = path.join(tokensDir, name ?? 'plugin');
    try {
      if (role === 'build') {
        fs.mkdirSync(path.join(root, 'site'));
        fs.mkdirSync(outDir, { recursive: true });
        Object.assign(request, { site_dir: path.join(root, 'site'), tokens_dir: tokensDir, out_dir: outDir });
      }
      const answer = await call(Buffer.from(JSON.stringify(request)), limit);
      const over = !answer.answered && answer.breakReason.startsWith('output over the limit');

      // Case 6: an exit code the role defines. Exit 1 is the core's, but no blazon role defines it
      if (over) results.push(result(6, names.exit, role, { skipped: true, detail: 'the output went over the limit before the plugin exited (case 7)' }));
      else if (answer.answered && runtime.answers.includes(answer.code)) results.push(result(6, names.exit, role, { passed: true }));
      else if (answer.answered && answer.code === 1)
        results.push(result(6, names.exit, role, { detail: `got exit 1, and exit 1 is a break in blazon: the ${role} role defines only ${codes}, so blazon reports the plugin as failed and counts it toward its breaker. Exit 2 with the reason on the first line when the plugin cannot answer` }));
      else results.push(result(6, names.exit, role, { detail: answer.answered ? `got exit ${answer.code}` : `a break: ${answer.breakReason}` }));

      // Case 7: the role's stdout limit, or the core's when the role raises none
      const whose = runtime.stdoutLimit === undefined ? "the core's limit, which the role does not raise" : `the ${role} role's limit (stdout_limit_bytes)`;
      results.push(over ? result(7, names.limit, role, { detail: `the plugin printed more than ${limit} bytes, ${whose}` }) : result(7, names.limit, role, { passed: true }));

      // Case 8: the answer blazon's role reads. Exit 2 is an answer with a reason and no findings
      if (!answer.answered || answer.code !== 0) results.push(result(8, names.shape, role, { skipped: true, detail: 'the plugin did not answer with exit 0' }));
      else if (name === undefined) results.push(result(8, names.shape, role, { skipped: true, detail: "the program's file name is not blazon-<plugin name>, so the check does not know the plugin's code prefix" }));
      else {
        const read = readAnswer(role as Role, name, answer.stdout, []);
        results.push('problem' in read ? result(8, names.shape, role, { detail: read.problem }) : result(8, names.shape, role, { passed: true }));
      }

      // Case 9, build only: nothing written beside out_dir in tokens_dir. A warning, not a failure: no folder for a plugin's own state is defined yet
      if (role === 'build') {
        const beside = written(tokensDir, outDir);
        results.push(
          beside.length === 0
            ? result(9, names.folder, role, { passed: true })
            : result(9, names.folder, role, {
                passed: true,
                warning: true,
                detail: `it wrote ${beside.map((entry) => `tokens_dir/${entry}`).join(', ')}. Blazon empties only out_dir before a build, so a file beside it is never cleaned and can collide with another plugin's. Blazon has no folder for a plugin's own state yet, so this is a warning; see ${OUTPUT_FOLDER_DOC}`,
              }),
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
    return results;
  };
}
