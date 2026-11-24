import pc from '../../core/colors.js';
import { describeOutputs, OutputsError, type OutputsDescription } from '../../core/read/index.js';
import { UsageError } from '../errors.js';
import { loadProject } from '../project.js';
import type { Handler } from './types.js';

/**
 * `get_outputs`, `blazon outputs [dir] [--file <path>]`: the files the last `blazon tokens` or `blazon build` wrote, fresh or stale, and one file's text.
 * It reads only: no compile, no plugin, no write. A `file` that leaves the outputs folder, is not text or is not there exits 2.
 */
export const getOutputsHandler: Handler = async (args, { dir }) => {
  const config = await loadProject(dir);
  let answer: OutputsDescription;
  try {
    answer = describeOutputs(config, dir, typeof args.file === 'string' ? { file: args.file } : {});
  } catch (error) {
    if (error instanceof OutputsError) throw new UsageError(error.message, undefined, error.code);
    throw error;
  }
  const { text } = answer;
  return { command: 'outputs', status: 0, body: answer, text: () => (text === undefined ? print(answer) : printFile(answer)) };
};

function printFile(answer: OutputsDescription): void {
  process.stdout.write(answer.text ?? '');
  if (answer.truncated) console.error(pc.yellow('blazon: the file was cut at the size limit.'));
}

function print(answer: OutputsDescription): void {
  console.log(`\n  ${pc.bold(answer.outputsDir)}`);
  if (answer.files.length === 0) console.log(pc.dim('  Nothing is there.'));
  for (const file of answer.files) console.log(`  ${file.state === 'fresh' ? pc.green('fresh') : pc.yellow('stale')}  ${file.file}  ${pc.dim(`${file.bytes} bytes`)}`);
  for (const gone of answer.missing) console.log(`  ${pc.dim('no folder')}  ${gone.id}/  ${pc.dim('(a plugin may write nothing on this command)')}`);
  if (answer.fix) console.log(`\n  Run ${pc.bold(answer.fix)}.`);
  console.log(`\n  ${pc.dim(answer.note)}\n`);
}
