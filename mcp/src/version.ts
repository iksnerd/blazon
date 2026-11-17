import fs from 'node:fs';

/** What the build froze into the bundle (scripts/build-mcp.mjs): blazon's version and the versions of the two packages it carries. */
export interface BundledVersions {
  blazon: string;
  sdk: string;
  zod: string;
}

declare const __BLAZON_MCP_VERSIONS__: BundledVersions | undefined;

const readVersion = (file: string): string => (JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8')) as { version: string }).version;

/**
 * The versions this server is made of. In the built file they are the ones the build wrote in; from source (the tests) they are
 * read from the packages installed at the repository root. The server's `version` is blazon's, since it ships inside blazon.
 */
export const VERSIONS: BundledVersions =
  typeof __BLAZON_MCP_VERSIONS__ !== 'undefined'
    ? __BLAZON_MCP_VERSIONS__
    : {
        blazon: readVersion('../../package.json'),
        sdk: readVersion('../../node_modules/@modelcontextprotocol/sdk/package.json'),
        zod: readVersion('../../node_modules/zod/package.json'),
      };

/** The line `blazon-mcp --version` prints. */
export const versionLine = (): string => `blazon-mcp ${VERSIONS.blazon} (bundles @modelcontextprotocol/sdk ${VERSIONS.sdk}, zod ${VERSIONS.zod})`;
