import pc from '../../core/colors.js';
import { loadProject } from '../project.js';
import { blazonPinFindings } from '../../core/blazon-pin.js';
import { compileBlazonData, emitTokenOutputs } from '../../core/index.js';
import { applyCheckPlugins } from '../../plugins/roles/integrate.js';
import { PluginRun } from '../../plugins/roles/roles.js';
import { assertTokensPass, namedPlugins, pluginsOff, type PluginOptions } from './check.js';

export async function runTokens(cwd: string = process.cwd(), options?: PluginOptions) {
  const config = await loadProject(cwd);
  console.log(pc.cyan(`\n[blazon] Compiling design tokens...`));
  const data = await compileBlazonData(config, cwd);
  data.findings.push(...blazonPinFindings(cwd));
  if (!pluginsOff(options)) await applyCheckPlugins(data, config, cwd, new PluginRun(config, cwd, { named: namedPlugins(options) }));
  assertTokensPass(data, cwd);
  const emitted = await emitTokenOutputs(data, config, cwd);

  for (const file of [emitted.cssPath, emitted.typographyPath, emitted.tailwindPath, emitted.tailwindResetPath, emitted.tsPath, emitted.jsonPath]) {
    if (file) console.log(`  ${pc.green('✔')} Emitted ${pc.bold(file)}`);
  }
  console.log();
  return { findings: data.findings };
}
