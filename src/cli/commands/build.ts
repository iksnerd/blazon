import pc from '../../core/colors.js';
import { loadProject } from '../project.js';
import { blazonPinFindings } from '../../core/blazon-pin.js';
import { compileBlazonData } from '../../core/index.js';
import { summarizeFindings } from '../../core/checker/index.js';
import { buildSite } from '../../builder/site-builder.js';
import { applyBuildPlugins, applyCheckPlugins } from '../../plugins/roles/integrate.js';
import { PluginRun } from '../../plugins/roles/roles.js';
import type { Finding } from '../../types/index.js';
import { shownDir } from '../where.js';
import { assertTokensPass, CheckFailed, namedPlugins, pluginsOff, printFindings, type PluginOptions } from './check.js';

/** Builds the site. Returns the findings of the check and of the build plugins; throws CheckFailed when either has errors. */
/** `outDirOverride` is a path from the book, as `outDir` is in the config; the command line turns what a person typed into a path from where they are. */
export async function runBuild(cwd: string = process.cwd(), outDirOverride?: string, options?: PluginOptions): Promise<{ findings: Finding[] }> {
  const config = await loadProject(cwd, outDirOverride ? { outDir: outDirOverride } : undefined);
  const data = await compileBlazonData(config, cwd);
  data.findings.push(...blazonPinFindings(cwd));
  // One unit of work: a plugin that keeps breaking is stopped for the rest of this build, check and build roles alike.
  const plugins = new PluginRun(config, cwd, { named: namedPlugins(options) });
  if (!pluginsOff(options)) await applyCheckPlugins(data, config, cwd, plugins);
  assertTokensPass(data, cwd);
  const { siteOutDir } = await buildSite(config, cwd, { data });

  const found = pluginsOff(options) ? [] : await applyBuildPlugins(data, config, cwd, plugins, siteOutDir);
  if (found.length === 0) return { findings: data.findings };
  const result = summarizeFindings(found);
  console.log();
  printFindings(result, shownDir(cwd));
  console.log();
  if (result.errors.length > 0)
    throw new CheckFailed(
      `a build plugin reported ${result.errors.length} error(s)`,
      [...data.findings, ...found],
      "The site is built; the plugin's findings above say what to fix.",
      'plugin-failed',
    );
  console.log(pc.dim('  Build plugins finished.'));
  return { findings: [...data.findings, ...found] };
}
