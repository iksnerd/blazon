import { formatBrandJson } from '../../core/brand/export.js';
import type { Finding, BlazonConfig, BlazonData } from '../../types/index.js';
import type { PluginRun } from './roles.js';

// How the roles meet a blazon command: the brand a plugin is given, and where its findings go.

/** brand.json as a value: what a plugin receives as `brand`, and exactly what the site holds. */
export function brandFor(data: BlazonData, config: BlazonConfig, cwd: string): unknown {
  return JSON.parse(formatBrandJson(data, config, cwd));
}

/**
 * Run the `check` role and add what the plugins found to `data.findings`, after the core's. A plugin is given the brand as
 * the core's findings left it, never another plugin's. Nothing is built when the project allows no plugin.
 */
export async function applyCheckPlugins(data: BlazonData, config: BlazonConfig, cwd: string, run: PluginRun): Promise<void> {
  if (!run.active) return;
  data.findings.push(...(await run.check(brandFor(data, config, cwd))));
}

/** Run the `build` role once the site is written. `data` is the brand the site holds, plugin findings included. */
export async function applyBuildPlugins(data: BlazonData, config: BlazonConfig, cwd: string, run: PluginRun, siteDir: string): Promise<Finding[]> {
  if (!run.active) return [];
  return run.build(brandFor(data, config, cwd), siteDir);
}
