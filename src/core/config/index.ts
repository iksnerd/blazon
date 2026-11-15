import { PACKAGE_NAME } from '../package-name.js';
import { stripVTControlCharacters } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type { BlazonConfig, UserBlazonConfig } from '../../types/index.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { ConfigError, configName, resolveConfig } from './validate.js';

export { DEFAULT_CONFIG };
export { ConfigError, CONFIG_KEYS, resolveConfig } from './validate.js';

/**
 * Type helper for blazon.config.ts
 */
export function defineConfig(config: UserBlazonConfig): UserBlazonConfig {
  return config;
}

export const CONFIG_FILE_NAMES = ['blazon.config.ts', 'blazon.config.js', 'blazon.config.mjs', 'brandbook.config.ts', 'brandbook.config.js'];

/**
 * The module a config's `import { defineConfig } from '@iksnerd/blazon'` resolves to. From source that is this file. In the
 * built package the bundler moves this code into a shared chunk whose export names are mangled, so the alias must
 * point at the package's `config` entry (`dist/config/index.js`, which keeps the names) instead.
 */
export function configEntry(moduleUrl: string): string {
  const file = fileURLToPath(moduleUrl);
  return path.basename(path.dirname(file)) === 'chunks' ? path.resolve(path.dirname(file), '../config/index.js') : file;
}

/** An older config imports the package as `folio` or `@iksnerd/folio`. "Cannot find module" alone reads like a missing install, so the failure says the name changed. */
const importsOldName = (message: string): boolean => /(?:Cannot find (?:module|package)|Failed to resolve import) ['"](?:@iksnerd\/)?folio['"]/.test(message);
const renamedHint = (name: string): string =>
  `blazon replaces folio, and \`@iksnerd/folio\` is now \`${PACKAGE_NAME}\`: change the import in ${name} to \`import { defineConfig } from '${PACKAGE_NAME}'\``;

/**
 * Imports a config file through Vite's module runner: TypeScript works, `'@iksnerd/blazon'` resolves to this
 * module even where the package is not installed, and every call reads the file afresh.
 */
async function importConfigFile(configPath: string, cwd: string): Promise<UserBlazonConfig> {
  const name = configName(configPath);
  let module: { default?: UserBlazonConfig; config?: UserBlazonConfig };
  try {
    ({ module } = await runnerImport<{ default?: UserBlazonConfig; config?: UserBlazonConfig }>(configPath, {
      configFile: false,
      root: cwd,
      logLevel: 'error',
      resolve: { alias: { [PACKAGE_NAME]: configEntry(import.meta.url) } },
    }));
  } catch (err) {
    // The parser colors its message when color is forced; a message read by a person or a script has no escape codes
    const message = stripVTControlCharacters(err instanceof Error ? err.message : String(err));
    throw new Error(`Could not load ${name}: ${message}${importsOldName(message) ? `. ${renamedHint(name)}` : ''}`, { cause: err });
  }
  const config = module.default ?? module.config;
  if (config === undefined) throw new Error(`${name} has no default export; write \`export default defineConfig({ ... })\``);
  return config;
}

/**
 * Loads blazon.config from the given root directory or defaults
 */
export async function loadConfig(cwd: string = process.cwd(), overrides?: UserBlazonConfig): Promise<BlazonConfig> {
  let userConfig: UserBlazonConfig = {};

  // A config that cannot be loaded stops the run: a brand book built from the defaults looks fine and is wrong
  const configPath = CONFIG_FILE_NAMES.map((name) => path.resolve(cwd, name)).find((p) => fs.existsSync(p));
  if (configPath) userConfig = await importConfigFile(configPath, cwd);

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
