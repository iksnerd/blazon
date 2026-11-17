import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { CHECKS } from '../../src/core/checker/catalogue.js';
import { BLAZON_PROFILE } from '../../src/plugins/wire/profile.js';
import { STANDARD_LOGO_LOCKUPS, STANDARD_SECTION_IDS, STANDARD_USAGE_ROLES } from '../../src/types/index.js';
import { commandOperations, OPERATIONS, toolOperations, type CliSpec } from '../../src/core/operations/index.js';
import { flagOf, rawName } from '../../src/cli/operations.js';
import { ROOT, read, interfaceKeys, unionMembers, findingCodes } from '../support/spec-helpers.js';

// What an adopter can write against, as one list: the CLI, the config, the token and sidecar fields, the finding codes, brand.json, the plugin
// protocol and the shipped plugins. It is compared with test/surface/public-surface.json, so a change to any of it is a decision and not an
// accident: the manual's stability chapter says which of these are stable, and a change to a stable one is a "Breaking" entry in CHANGELOG.md.
// After a deliberate change, `UPDATE_SURFACE=1 npx vitest run test/surface` writes the file; review the diff before committing it.

const SNAPSHOT = path.join(ROOT, 'test/surface/public-surface.json');
const sorted = (items: Iterable<string>): string[] => [...new Set(items)].sort();

/** The severity of each core finding code, in code order: a change of severity is as visible to a CI gate as a new code. */
function severityByCode(): Record<string, string> {
  return Object.fromEntries(sorted(findingCodes()).map((code) => [code, CHECKS[code as keyof typeof CHECKS].severity]));
}

/** The surface of the working tree, from the types, the schema, the CLI definition, the protocol profile and the lock. */
export function currentSurface(): Record<string, unknown> {
  const cli = read('src/cli/index.ts');
  const schema = JSON.parse(read('src/core/brand/brand.schema.json')) as { properties: Record<string, { const?: unknown }>; required: string[]; $defs: Record<string, unknown> };
  const emit = read('src/core/emit.ts');
  const lock = JSON.parse(read('plugins/shipped.lock')) as { plugins: Record<string, unknown> };
  return {
    cli: {
      // The read commands are registered from the operations list, the rest in index.ts.
      commands: sorted([...cli.matchAll(/\.command\(\s*'([^']+)'/g)].map((m) => m[1]!).concat(commandOperations(OPERATIONS).map(rawName))),
      options: sorted(
        [...cli.matchAll(/\.option\(\s*'([^']+)'/g)]
          .map((m) => m[1]!)
          .concat(commandOperations(OPERATIONS).flatMap((op) => (op.cli as CliSpec).options.map((option) => flagOf(op, option)))),
      ),
    },
    config: {
      keys: sorted(interfaceKeys('BlazonConfig')),
      assetCategory: sorted(interfaceKeys('AssetCategoryConfig')),
      assetRules: sorted(interfaceKeys('AssetRules')),
      iconSet: sorted(interfaceKeys('IconSetConfig')),
      plugin: sorted(interfaceKeys('PluginConfig')),
      emailSignature: sorted(interfaceKeys('EmailSignatureConfig')),
      localFont: sorted(interfaceKeys('LocalFont')),
    },
    tokens: {
      devBlazon: sorted(interfaceKeys('BlazonExtension')),
      review: sorted(interfaceKeys('Review')),
      contrastPair: sorted(interfaceKeys('ContrastPair')),
      font: sorted(interfaceKeys('FontMeta')),
      types: sorted(unionMembers('TokenType')),
      tiers: sorted(unionMembers('Tier')),
      contrastLevels: sorted(unionMembers('ContrastLevel')),
      patternKinds: sorted(unionMembers('PatternKind')),
      previewKinds: sorted(unionMembers('PreviewKind')),
    },
    pages: { frontMatter: sorted([...interfaceKeys('DocFrontmatter'), 'section']), sections: sorted(STANDARD_SECTION_IDS) },
    assets: {
      sidecar: sorted(interfaceKeys('AssetMeta')),
      formats: sorted(unionMembers('AssetFormat')),
      lockups: sorted(STANDARD_LOGO_LOCKUPS),
      logoCorners: sorted(unionMembers('LogoCorner')),
      usageRoles: sorted(STANDARD_USAGE_ROLES),
    },
    theme: { roles: sorted(unionMembers('ThemeRole')) },
    findings: { severities: sorted(unionMembers('Severity')), fields: sorted(interfaceKeys('Finding')), coreCodes: sorted(findingCodes()), severityByCode: severityByCode() },
    outputs: { tokenFiles: sorted([...emit.matchAll(/files\.set\(\s*'([^']+)'/g)].map((m) => m[1]!)) },
    brandJson: {
      format: schema.properties.format?.const,
      version: schema.properties.version?.const,
      keys: sorted(Object.keys(schema.properties).filter((key) => !key.startsWith('$'))),
      required: sorted(schema.required),
      definitions: sorted(Object.keys(schema.$defs)),
    },
    // The MCP server that ships in the package: the program names npm links, how it is started and the tools it offers.
    mcpServer: {
      bins: sorted(Object.keys((JSON.parse(read('package.json')) as { bin: Record<string, string> }).bin)),
      options: ['--brand', '--version'],
      environment: ['BLAZON_BIN', 'BLAZON_BRAND'],
      tools: sorted(toolOperations(OPERATIONS).map((op) => op.name)),
    },
    pluginProtocol: BLAZON_PROFILE,
    shippedPlugins: sorted(Object.keys(lock.plugins)),
  };
}

describe('the public surface', () => {
  it('is the one recorded in test/surface/public-surface.json (UPDATE_SURFACE=1 writes it after a deliberate change)', () => {
    const current = JSON.parse(JSON.stringify(currentSurface())) as unknown;
    if (process.env.UPDATE_SURFACE === '1') fs.writeFileSync(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`);
    const recorded = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')) as unknown;
    expect(current).toEqual(recorded);
  });

  it('is not empty in any part, so a moved type or a changed pattern fails here and does not pass as an empty list', () => {
    const surface = JSON.parse(JSON.stringify(currentSurface())) as Record<string, Record<string, unknown>>;
    const empty: string[] = [];
    // The protocol profile is a document and may hold an empty list on purpose (`adopts`); the rest is read out of code
    for (const [group, parts] of Object.entries(surface).filter(([group]) => group !== 'pluginProtocol'))
      for (const [name, value] of Object.entries(parts)) if (Array.isArray(value) && value.length === 0) empty.push(`${group}.${name}`);
    expect(empty).toEqual([]);
  });
});
