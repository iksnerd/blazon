/**
 * Blazon - Lightweight Brand Book & Design Token Compiler
 *
 * Public programmatic API
 */

// Types
export * from './types/index.js';

// Configuration
export { DEFAULT_CONFIG, loadConfig, resolveConfig, ConfigError, CONFIG_KEYS } from './core/config/index.js';

// Core compilation pipeline
export { compileBlazonData, emitTokenOutputs } from './core/index.js';

// The whole brand in one file for tools in any language (RFC 0001 section 12)
export { BRAND_FORMAT, BRAND_VERSION, buildBrandExport, formatBrandJson, type BrandExport, type BrandToken } from './core/brand/export.js';
export { BRAND_SCHEMA, BRAND_SCHEMA_FILE } from './core/brand/schema.js';

// The core of blazon as a plugin host (RFC 0002, section 2), under its own name: `import { plugins } from '@iksnerd/blazon'`
export * as plugins from './plugins/index.js';

// Token loading and resolution (DTCG 2025.10, RFC 0001)
export { loadTokenTree } from './core/tokens/load.js';
export { generateCssVarName } from './core/tokens/names.js';
export type { DeclaredToken, TokenTree } from './core/tokens/walk.js';

export { aliasTarget } from './core/tokens/alias.js';
export { resolveTokenTree } from './core/tokens/resolve.js';
export { toCssValue, compositeParts, DEFAULT_GRADIENT_ANGLE } from './core/tokens/values/index.js';

// Validation & Diagnostics
export { checkTokens, type CheckFinding, type CheckResult } from './core/checker/index.js';

// Formatters
export { formatCssTokens, formatTypographyCss } from './core/tokens/formatters/css.js';
export { formatTsTokens } from './core/tokens/formatters/ts.js';
export { formatJsonTokens } from './core/tokens/formatters/json.js';

// Docs and Assets
export { parseDocs } from './core/docs/parser.js';
export { scanAssets } from './core/assets/scanner.js';

// Vite Dev Server & Static Site Builder
export { startDevServer, resolveViewer, resolvePrebuiltViewerDir } from './server/dev-server.js';
export { buildSite } from './builder/site-builder.js';
export { createBlazonVitePlugin } from './server/plugin.js';
