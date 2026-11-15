import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BlazonError, BlazonRunner, type BlazonTarget, type RunOptions } from './blazon.js';
import { checkAgainst } from './generated/check.js';
import { toolInput, toolOf } from './generated/project.js';
import type { JsonSchema, Operation } from './generated/types.js';
import { commandFor, operationNamed, OPERATIONS, withDefaults } from './operations.js';
import { buildPageText, INSTRUCTIONS } from './prompts.js';
import { answerWith, failure, limitItems, NARROW_FINDINGS, NARROW_TOKENS, type ToolResult } from './result.js';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

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
  /** Whether the values read may be wrong. Default: blazon said so on standard error. */
  brandHasErrors?: (document: Record<string, unknown>) => boolean;
}

const LOOKUPS: Record<string, Lookup> = {
  check_brand: {
    narrow: NARROW_FINDINGS,
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
    reword: (message, args) =>
      /is a group of tokens/.test(message)
        ? `"${String(args.path)}" is a group of tokens, not one token. Call list_tokens with group "${String(args.path)}" to see its tokens.`
        : undefined,
  },
  get_rules: { hint: FIND_PATH },
  can_use: { hint: FIND_PATH },
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
  const server = new McpServer({ name: 'blazon', version }, { instructions: INSTRUCTIONS });

  /** Runs a call; blazon's own error message becomes a tool error, and anything else is reported as one too. */
  async function answer(op: Operation, args: Record<string, unknown>): Promise<ToolResult> {
    const { hint, narrow, shape, reword, brandHasErrors } = LOOKUPS[op.name] ?? {};
    try {
      const { argv, options } = commandFor(op, args);
      const { document, warnings } = await runner.run(argv, options);
      const shaped = shape ? shape(document, args, warnings) : document;
      return answerWith(shaped, warnings, narrow, brandHasErrors?.(shaped));
    } catch (error) {
      if (error instanceof BlazonError) {
        const reworded = error.fromBlazon ? reword?.(error.message, args) : undefined;
        return failure(reworded ?? (error.fromBlazon && hint ? `${error.message} ${hint}` : error.message));
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
      const given = request.params.arguments ?? {};
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
      const { document, warnings } = await runner.run(args, options);
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
