import pc from '../../core/colors.js';
import { loadProject } from '../project.js';
import { blazonPinFindings } from '../../core/blazon-pin.js';
import { compileBlazonData, emitTokenOutputs } from '../../core/index.js';
import { summarizeFindings } from '../../core/checker/index.js';
import { applyBuildPlugins, applyCheckPlugins } from '../../plugins/roles/integrate.js';
import { PluginRun } from '../../plugins/roles/roles.js';
import { shownDir } from '../where.js';
import { assertTokensPass, CheckFailed, namedPlugins, pluginsOff, printFindings, type PluginOptions } from './check.js';

/**
 * Writes the token files, then runs the build plugins with no site: a plugin that derives its files from the brand (blazon.platform-tokens,
 * blazon.tailwind, blazon.shadcn) writes them to `<tokensOutDir>/<name>/`, and one that needs the built site says so and writes nothing.
 */
export async function runTokens(cwd: string = process.cwd(), options?: PluginOptions) {
  const config = await loadProject(cwd);
  console.log(pc.cyan(`\n[blazon] Compiling design tokens...`));
  const data = await compileBlazonData(config, cwd);
  data.findings.push(...blazonPinFindings(cwd));
  // One unit of work, as in blazon build: a plugin that keeps breaking is stopped for the rest of the run, check and build roles alike
  const plugins = new PluginRun(config, cwd, { named: namedPlugins(options) });
  if (!pluginsOff(options)) await applyCheckPlugins(data, config, cwd, plugins);
  assertTokensPass(data, cwd);
  const emitted = await emitTokenOutputs(data, config, cwd);

  for (const file of [emitted.cssPath, emitted.typographyPath, emitted.tsPath, emitted.jsonPath]) {
    if (file) console.log(`  ${pc.green('✔')} Emitted ${pc.bold(file)}`);
  }
  console.log();

  const found = pluginsOff(options) ? [] : await applyBuildPlugins(data, config, cwd, plugins);
  if (found.length === 0) return { findings: data.findings };
  const result = summarizeFindings(found);
  printFindings(result, shownDir(cwd));
  console.log();
  if (result.errors.length > 0)
    throw new CheckFailed(
      `a build plugin reported ${result.errors.length} error(s)`,
      [...data.findings, ...found],
      "The token files are written; the plugin's findings above say what to fix.",
      'plugin-failed',
    );
  return { findings: [...data.findings, ...found] };
}
