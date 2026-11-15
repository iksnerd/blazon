import { PACKAGE_NAME } from '../package-name.js';
import path from 'node:path';
import fs from 'node:fs';
import type { BlazonConfig, UserBlazonConfig } from '../../types/index.js';
import { finding } from '../checker/catalogue.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { ConfigError, configName, resolveConfig } from './validate.js';
import { inProject, outsideMessage } from '../confine.js';

export { DEFAULT_CONFIG };
export { ConfigError, CONFIG_KEYS, resolveConfig } from './validate.js';

/** The one config file: plain JSON, read as data. It is never run. */
export const CONFIG_FILE = 'blazon.json';

/** Spellings older blazons read as code. None is read any more: each is refused, by name, with the file to use. */
export const OLD_CONFIG_FILE_NAMES = ['blazon.config.ts', 'blazon.config.js', 'blazon.config.mjs', 'brandbook.config.ts', 'brandbook.config.js'];

/** The files in `cwd` that were once a config, so that the one blazon reads is not shadowed by one it ignores. */
export function oldConfigFiles(cwd: string): string[] {
  return OLD_CONFIG_FILE_NAMES.filter((name) => fs.existsSync(path.resolve(cwd, name)));
}

/** Reads `blazon.json`: strict JSON, an object. Comments and trailing commas are errors, as in any JSON file. */
function readConfigFile(configPath: string): UserBlazonConfig {
  const name = configName(configPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not load ${name}: ${err instanceof Error ? err.message : String(err)}. ${name} is plain JSON: no comments, no trailing commas`, { cause: err });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object: {"title": "..."}`);
  return parsed as UserBlazonConfig;
}

/**
 * Loads blazon.json from the given root directory or defaults
 */
export async function loadConfig(cwd: string = process.cwd(), overrides?: UserBlazonConfig): Promise<BlazonConfig> {
  let userConfig: UserBlazonConfig = {};

  // A config that cannot be loaded stops the run: a brand book built from the defaults looks fine and is wrong
  const old = oldConfigFiles(cwd);
  if (old.length > 0) {
    throw new ConfigError(
      old[0]!,
      old.map((name) =>
        finding('config-invalid', {
          path: name,
          message: `${name} is not read any more: blazon reads plain JSON from ${CONFIG_FILE}. Move its values into ${CONFIG_FILE} and delete ${name}`,
        }),
      ),
    );
  }
  const configPath = path.resolve(cwd, CONFIG_FILE);
  if (fs.existsSync(configPath)) userConfig = readConfigFile(configPath);

  // blazon empties outDir and writes into both, so a brand's file may not point them outside its folder. What the person running blazon types
  // (`build -o`, an override) is theirs and is not asked
  const outputs = (['outDir', 'tokensOutDir'] as const).flatMap((key) => {
    const as = userConfig[key];
    return typeof as === 'string' && as !== '' && !inProject(cwd, path.resolve(cwd, as)) ? [finding('config-path-outside', { path: key, message: outsideMessage(key, as) })] : [];
  });
  if (outputs.length > 0) throw new ConfigError(configName(configPath), outputs);

  // Also check if package.json has a "name" to default the title
  let defaultTitle = DEFAULT_CONFIG.title;
  const pkgPath = path.resolve(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name && pkg.name !== PACKAGE_NAME) {
        defaultTitle = `${pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1)} Brand Book`;
      }
    } catch {
      // ignore
    }
  }

  const { config, problems } = resolveConfig({
    ...DEFAULT_CONFIG,
    title: defaultTitle,
    ...userConfig,
    ...overrides,
  });
  if (problems.length > 0) throw new ConfigError(configPath ? configName(configPath) : 'blazon config', problems);

  return config;
}
