import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BlazonError, BlazonRunner, type BlazonTarget, type RunOptions } from './blazon.js';
import { checkAgainst } from './generated/check.js';
import { toolInput, toolOf } from './generated/project.js';
import type { JsonSchema, Operation } from './generated/types.js';
import { coerceArgs, commandFor, operationNamed, OPERATIONS, withDefaults } from './operations.js';
import { buildPageText, INSTRUCTIONS } from './prompts.js';
import { VERSIONS } from './version.js';
import { answerWith, failure, limitItems, NARROW_FINDINGS, NARROW_NONE, NARROW_TOKENS, removedNotice, stripInvisible, type ToolResult } from './result.js';

/** Said after blazon's own message when a path is not a token, so the model knows the next call. */
const FIND_PATH = 'To find a token path, call list_tokens.';

/** What the server does with an answer, by tool. What a tool is called, takes and answers is in the operations list; this is only how its answer is shaped. */
interface Lookup {
  /** Appended to blazon's own message when blazon says no, so the error names the next call. */
  hint?: string;
  /** The narrowing advice for an answer that is too large. */
  narrow?: string;
  /** Reshapes the document. */
  shape?: (document: Record<string, unknown>, args: Record<string, unknown>, warnings: string[]) => Record<string, unknown>;
  /** Replaces blazon's message when blazon says no, for a refusal whose next step is a tool and not a command. */
  reword?: (message: string, args: Record<string, unknown>) => string | undefined;
  /** What the server knows about the answer that blazon's output does not say: fields for the document and lines for `warnings`. */
  notes?: (brand: string) => { fields: Record<string, unknown>; warnings: string[] };
  /** Whether the values read may be wrong. Default: blazon said so on standard error. */
  brandHasErrors?: (document: Record<string, unknown>) => boolean;
}

/**
 * The plugin names the brand's blazon.json lists, read as data (the server starts none). A missing, unreadable or odd file gives none: blazon
 * reports a bad config itself. Names are cleaned like the rest of the answer, since the file is the brand's.
 */
function configuredPlugins(brand: string): string[] {
  try {
    const config: unknown = JSON.parse(fs.readFileSync(path.join(brand, 'blazon.json'), 'utf8'));
    const list = typeof config === 'object' && config !== null ? (config as { plugins?: unknown }).plugins : undefined;
    if (!Array.isArray(list)) return [];
    const names = list
      .map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: unknown } | null)?.name))
      .filter((n): n is string => typeof n === 'string' && n !== '');
    return [...new Set(names.map((n) => stripInvisible(n.length > 100 ? `${n.slice(0, 100)}...` : n).value))];
  } catch {
    return [];
  }
}

/**
 * `check_brand` runs `blazon check --no-plugins`, so it says which plugins of the config did not run. A plugin's roles are only in the manifest
 * its program prints (`--blazon-manifest`), so the server cannot tell a check plugin from a build-only one without starting it: it lists all and says so.
 */
function skippedPlugins(brand: string): { fields: Record<string, unknown>; warnings: string[] } {
  const names = configuredPlugins(brand);
  if (names.length === 0) return { fields: {}, warnings: [] };
  return {
    fields: { pluginsSkipped: names },
    warnings: [
      `Plugins in blazon.json did not run: ${names.join(', ')}. Only a plugin with a check role can add findings to these counts; a build-only plugin adds none. The server cannot read a plugin's role without starting it, so it lists every configured plugin. Run \`blazon check\` for the full counts.`,
    ],
  };
}

const LOOKUPS: Record<string, Lookup> = {
  check_brand: {
    narrow: NARROW_FINDINGS,
    notes: skippedPlugins,
    shape: (document, args, warnings) => limitItems(document, 'findings', Number(args.limit), NARROW_FINDINGS, warnings),
    brandHasErrors: (document) => ((document.counts as { errors?: number } | undefined)?.errors ?? 0) > 0,
  },
  list_tokens: {
    hint: 'Call list_tokens with no arguments to see every path.',
    shape: (document, _args, warnings) => limitItems(document, 'tokens', Number.POSITIVE_INFINITY, NARROW_TOKENS, warnings),
    narrow: NARROW_TOKENS,
  },
  get_token: {
    hint: FIND_PATH,
    narrow: NARROW_NONE,
    reword: (message, args) =>
      /is a group of tokens/.test(message)
        ? `"${String(args.path)}" is a group of tokens, not one token. Call list_tokens with group "${String(args.path)}" to see its tokens.`
        : undefined,
  },
  get_rules: { hint: FIND_PATH },
  can_use: {
    hint: FIND_PATH,
    narrow: 'send fewer pairs, or set verbose to false',
    // a batch is cut to whole results; a single answer has no `results` and is left whole
    shape: (document, _args, warnings) =>
      Array.isArray(document.results) ? limitItems(document, 'results', Number.POSITIVE_INFINITY, 'send fewer pairs, or set verbose to false', warnings) : document,
  },
  get_fonts: { narrow: NARROW_NONE },
  get_logo: { narrow: NARROW_NONE },
};

/** A schema as `tools/list` sends it: the JSON Schema dialect named, as the protocol's own schema generator does. */
const wireSchema = (schema: object): JsonSchema => {
  const { additionalProperties, ...rest } = schema as JsonSchema;
  return { ...rest, $schema: 'http://json-schema.org/draft-07/schema#', additionalProperties };
};

/** The tool as `tools/list` sends it. Everything but the dialect and `execution` is the operation's. */
function wireTool(op: Operation): Record<string, unknown> {
  const tool = toolOf(op);
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: wireSchema(tool.inputSchema),
    ...(tool.outputSchema && { outputSchema: wireSchema(tool.outputSchema) }),
    annotations: tool.annotations,
    execution: { taskSupport: 'forbidden' },
  };
}

export function createServer(target: BlazonTarget, runner: BlazonRunner = new BlazonRunner(target)): McpServer {
  const server = new McpServer({ name: 'blazon', version: VERSIONS.blazon }, { instructions: INSTRUCTIONS });

  /** Runs a call; blazon's own error message becomes a tool error, and anything else is reported as one too. */
  async function answer(op: Operation, args: Record<string, unknown>): Promise<ToolResult> {
    const { hint, narrow, shape, reword, brandHasErrors, notes } = LOOKUPS[op.name] ?? {};
    try {
      const { argv, options } = commandFor(op, args);
      const run = await runner.run(argv, options);
      const cleaned = stripInvisible(run.document);
      const extra = notes?.(target.brand) ?? { fields: {}, warnings: [] };
      const warnings = [...run.warnings, ...(cleaned.removed > 0 ? [removedNotice(cleaned.removed)] : []), ...extra.warnings];
      const shaped = shape ? shape({ ...cleaned.value, ...extra.fields }, args, warnings) : { ...cleaned.value, ...extra.fields };
      // the notice above is ours, so it must not decide `brandHasErrors` when the lookup leaves that to blazon's own warnings
      return answerWith(shaped, warnings, narrow, brandHasErrors ? brandHasErrors(shaped) : run.warnings.some((w) => /\b\d+ error\(s\)/.test(w)));
    } catch (error) {
      if (error instanceof BlazonError) {
        const reworded = error.fromBlazon ? reword?.(error.message, args) : undefined;
        return failure(stripInvisible(reworded ?? (error.fromBlazon && hint ? `${error.message} ${hint}` : error.message)).value);
      }
      throw error;
    }
  }

  // The tools are the operations that have one. The arguments are checked against the operation's input and the answer against its output,
  // by the same function, before blazon runs and before the answer leaves.
  server.server.registerCapabilities({ tools: { listChanged: true } });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: OPERATIONS.map(wireTool) }) as never);
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const op = operationNamed(request.params.name);
    if (!op) return failure(`Tool ${request.params.name} not found`);
    try {
      const given = coerceArgs(op, request.params.arguments ?? {});
      const problems = checkAgainst(toolInput(op) as unknown as JsonSchema, given, 'arguments');
      if (problems.length > 0) return failure(`Invalid arguments for tool ${op.name}: ${problems.join('; ')}`);
      const result = await answer(op, withDefaults(op, given));
      if (!result.isError && op.outputSchema) {
        const wrong = checkAgainst(op.outputSchema, result.structuredContent, 'the answer');
        if (wrong.length > 0) return failure(`Output validation error: Tool ${op.name} returned an answer that does not match its output schema: ${wrong.join('; ')}`);
      }
      return result;
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  });

  const resource = (name: string, uri: string, title: string, description: string, args: string[], options?: RunOptions) =>
    server.registerResource(name, uri, { title, description, mimeType: 'application/json' }, async (url) => {
      const run = await runner.run(args, options);
      const { value: document, removed } = stripInvisible(run.document);
      const warnings = removed > 0 ? [...run.warnings, removedNotice(removed)] : run.warnings;
      // Warnings are a separate entry, so the JSON entry stays a valid document.
      const note = warnings.length > 0 ? [{ uri: url.href, mimeType: 'text/plain', text: `Warning from blazon: ${warnings.join(' ')}` }] : [];
      return { contents: [...note, { uri: url.href, mimeType: 'application/json', text: JSON.stringify(document) }] };
    });

  resource('rules', 'blazon://rules', 'Brand rules', 'Every usage, pairs and logo rule of the brand, as blazon rules --json prints them. Not cut to a size limit.', ['rules']);
  resource('brand', 'blazon://brand', 'Compiled brand', 'The whole brand as brand.json holds it, compiled now (blazon brand). Not cut to a size limit.', ['brand'], {
    json: false,
  });

  server.registerPrompt(
    'build_page',
    {
      title: 'Build a page with the brand',
      description: 'The workflow for building a page that follows the brand: check first, read the rules, never hard-code a value, and list what the brand does not answer.',
      argsSchema: { description: z.string().min(1).max(500).describe('A short description of the page to build') },
    },
    ({ description }) => ({ messages: [{ role: 'user', content: { type: 'text', text: buildPageText(description) } }] }),
  );

  return server;
}
