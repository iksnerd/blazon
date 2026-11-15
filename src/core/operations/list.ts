import { DEFAULT_LIMIT, MAX_LIMIT, MAX_TEXT } from './limits.js';
import type { InputSchema, JsonSchema, Operation, Prop } from './types.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** The folder a command reads. A command-line argument only: a tool never takes it, because the server fixes the brand. */
const DIR: Prop = { type: 'string', description: 'The brand folder. Default: the current folder' };

/** A closed object schema. */
const input = (properties: Record<string, Prop>, required: string[]): InputSchema => ({
  type: 'object',
  properties,
  ...(required.length > 0 && { required }),
  additionalProperties: false,
});

/**
 * What every tool's answer carries besides the command's own fields: what blazon said on standard error, whether the brand has errors, and
 * whether the answer was cut. The server adds these to every answer, so they are here once.
 */
const COMMON: Record<string, JsonSchema> = {
  warnings: {
    type: 'array',
    items: { type: 'string' },
    description: 'Lines blazon printed on standard error, such as a warning that the brand has errors. Empty when blazon said nothing',
  },
  brandHasErrors: { type: 'boolean', description: 'True when the brand has errors, so values read from it may be wrong. Run check_brand to see them' },
  truncated: { description: 'True when the answer was cut to fit the size limit. `notice` says how to narrow the question', type: 'boolean' },
  notice: { description: 'Present when the answer was cut: how much was kept and how to ask a narrower question', type: 'string' },
};

/** An output schema: the common fields, then the command's own. Loose on purpose, so blazon can add a field without breaking a client. */
const output = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({
  type: 'object',
  properties: { ...COMMON, ...properties },
  required: ['warnings', 'brandHasErrors', ...required],
  additionalProperties: {},
});

/**
 * The read operations of blazon, in the order the MCP server lists them. This is the one place that says what each is called, what it takes and
 * what it answers; the command line (`src/cli/operations.ts`) and the MCP server (`mcp/src/server.ts`) both read it. `cli: false` is an operation
 * with no command of its own yet; `mcp: false` is one the server does not serve.
 */
export const OPERATIONS: readonly Operation[] = [
  {
    name: 'check_brand',
    title: 'Check the brand',
    description: `Runs blazon check on the brand, without plugins, and returns its findings and counts. \`passed\` is false when the brand has errors, and values read from such a brand can be wrong. Returns at most \`limit\` findings (default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}); \`counts\` stay whole. Not for reading a value: use get_token.`,
    annotations: READ_ONLY,
    inputSchema: input(
      {
        severity: {
          description: 'List only the findings at this level or worse. The counts stay whole',
          type: 'string',
          enum: ['error', 'warning', 'info'],
        },
        limit: {
          default: DEFAULT_LIMIT,
          description: `The most findings to return, from 1 to ${MAX_LIMIT}; default ${DEFAULT_LIMIT}`,
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
        },
      },
      [],
    ),
    outputSchema: output(
      {
        passed: {
          type: 'boolean',
          description: 'True when the brand has no errors',
        },
        counts: {
          type: 'object',
          properties: {
            errors: {
              type: 'number',
              description: 'How many findings are errors, whatever `severity` or `limit` asked for',
            },
            warnings: {
              type: 'number',
              description: 'How many findings are warnings',
            },
            info: {
              type: 'number',
              description: 'How many findings are notes',
            },
          },
          required: ['errors', 'warnings', 'info'],
          additionalProperties: {},
          description: 'How many findings the brand has at each level',
        },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The finding code, such as starter-logo-unchanged',
              },
              severity: {
                type: 'string',
                description: 'error, warning or info',
              },
              message: {
                type: 'string',
                description: 'What is wrong and where',
              },
            },
            required: ['code', 'severity', 'message'],
            additionalProperties: {},
          },
          description: 'The findings, cut to `limit`',
        },
        findingsTotal: {
          description: 'How many findings there are before `limit` cut the list',
          type: 'number',
        },
      },
      ['passed', 'counts', 'findings'],
    ),
    cli: false,
    mcp: {
      command: ['check'],
      fixed: ['--no-plugins'],
      flags: ['severity'],
      answers: [1],
      ignoreStderr: true,
    },
  },
  {
    name: 'list_tokens',
    title: 'List the tokens',
    description: `Lists the design tokens of the brand, or of one group, or of one type, each with its path, type and value, in the order the token files write them. Use it to find a path or to read many values at once. For a token's CSS variable names and rules use get_token; for the brand's usage rules use get_rules. An answer over ${MAX_TEXT} characters is cut and says so. The list is cut to fit and says how many were left out: narrow with \`group\` or \`type\`.`,
    annotations: READ_ONLY,
    inputSchema: input(
      {
        group: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'A group path, for example color or color.brand. Leave out for every token',
        },
        type: {
          description: 'A token type, for example color, dimension or fontFamily. Leave out for every type. An unknown type is refused with the list of types',
          type: 'string',
          maxLength: 40,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*$',
        },
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
      },
      [],
    ),
    outputSchema: output(
      {
        group: {
          description: 'The group asked for, as a clean path. Absent when the whole brand was listed',
          type: 'string',
        },
        type: {
          description: 'The type asked for. Absent when every type was listed',
          type: 'string',
        },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The token path, to pass to get_token',
              },
              type: {
                description: 'The token type, such as color',
                type: 'string',
              },
              value: {
                description: 'The value as CSS needs it, with aliases resolved: a string or a number',
              },
              aliasOf: {
                description: 'The token this one is an alias of, when it is one',
                type: 'string',
              },
            },
            required: ['path', 'value'],
            additionalProperties: {},
          },
          description: 'The tokens, cut to fit the size limit',
        },
        tokensTotal: {
          description: 'How many tokens matched before the size limit cut the list',
          type: 'number',
        },
      },
      ['tokens'],
    ),
    cli: {
      rank: 2,
      command: ['list'],
      positional: ['group', 'dir'],
      cliOnly: ['dir'],
      folder: 'group',
      summary: 'List the tokens: path, type and value, and the token each aliases. With a group path, only the tokens in that group',
      options: [
        {
          property: 'json',
          description: 'Print the list as JSON on standard output',
        },
        {
          property: 'type',
          value: 'type',
          description: 'List only the tokens of one $type (color, dimension, fontFamily, ...)',
        },
      ],
    },
  },
  {
    name: 'get_token',
    title: 'Read a token',
    description:
      'Looks up one design token of the brand: its value, type, the CSS variable names it gets, and the rules that apply to it. Use it for the value of a path you know; a group path is refused. For a path you do not know use list_tokens.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        path: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The token path, for example color.brand.primary. A path from list_tokens works',
        },
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
      },
      ['path'],
    ),
    outputSchema: output(
      {
        token: {
          description: 'The token, with its CSS variable names, the rules that apply to it and the file that writes it',
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The token path',
            },
            type: {
              description: 'The token type, such as color',
              type: 'string',
            },
            value: {
              description: 'The value as CSS needs it, with aliases resolved',
            },
          },
          required: ['path', 'value'],
          additionalProperties: {},
        },
      },
      [],
    ),
    cli: {
      rank: 1,
      command: ['get'],
      positional: ['path', 'dir'],
      cliOnly: ['dir'],
      summary:
        'Read one token: its value, type, CSS variable names in theme.css and tailwind.css, its usage, pairs and logo rules, and the file it is in. To find a path, use blazon list',
      options: [
        {
          property: 'json',
          description: 'Print the token as JSON on standard output',
        },
      ],
    },
  },
  {
    name: 'get_rules',
    title: 'Read the brand rules',
    description: `Lists the brand rules (allowed uses, approved color pairs, logo restrictions) of a token or a group of tokens, or of the whole brand when no path is given. The whole brand can be larger than the size limit (${MAX_TEXT} characters): give a path, or read the resource blazon://rules, which is not cut.`,
    annotations: READ_ONLY,
    inputSchema: input(
      {
        path: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'A token or group path, for example color.brand. Leave out for the whole brand',
        },
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
      },
      [],
    ),
    outputSchema: output(
      {
        kind: {
          description: 'What the rules are for: one token, a group of tokens, or the whole brand',
          type: 'string',
          enum: ['token', 'group', 'brand'],
        },
        path: {
          description: 'The path the rules are for; empty for the whole brand',
          type: 'string',
        },
        entries: {
          description: 'The rules, each with the path it applies to (`at`) and what it says: usage, pairs or logo restrictions',
          type: 'array',
          items: {},
        },
      },
      [],
    ),
    cli: {
      rank: 3,
      command: ['rules'],
      positional: ['path', 'dir'],
      cliOnly: ['dir'],
      folder: 'path',
      summary: 'Read the usage, pairs and logo rules of a token or a group, or of the whole brand when no path is given',
      options: [
        {
          property: 'json',
          description: 'Print the rules as JSON on standard output',
        },
      ],
    },
  },
  {
    name: 'can_use',
    title: 'Can this color be used here',
    description:
      'Answers whether one color token may be text on another color token, by the brand rules. Set `role` to ui for a focus ring, border or icon stroke: it is judged against the 3:1 non-text contrast and the pairs rules do not apply. A denied answer is a normal result (`allowed` is false, `reason` names the rule), not an error. For a color you have not picked, find one with list_tokens and type color.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        fg: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The text color token path, for example text.primary',
        },
        bg: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The background color token path, for example surface.background',
        },
        role: {
          type: 'string',
          enum: ['text', 'ui'],
          default: 'text',
          description:
            'What the first color is: text (default), judged by the usage, pairs and WCAG text rules, or ui for a focus ring, border or icon stroke, judged by the usage rules and the 3:1 non-text contrast',
        },
        theme: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*$',
          description: "Judge the pair in this context of the resolver's theme modifier, such as dark. Default: the default tokens",
        },
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
      },
      ['fg', 'bg'],
    ),
    outputSchema: output(
      {
        allowed: {
          type: 'boolean',
          description: 'True when the brand allows this text color on this background',
        },
        reason: {
          type: 'string',
          description: 'The rule that decided the answer',
        },
        fg: {
          description: 'The text color token that was asked about',
          type: 'string',
        },
        bg: {
          description: 'The background color token that was asked about',
          type: 'string',
        },
        role: {
          description: 'What the first color was judged as: text or ui',
          type: 'string',
          enum: ['text', 'ui'],
        },
        theme: {
          description: 'The theme context the pair was judged in; absent for the default tokens',
          type: 'string',
        },
        contrast: {
          description: 'The contrast ratio of the pair, the strictest WCAG level it meets, and for role ui the threshold it had to reach',
          type: 'object',
        },
      },
      ['allowed', 'reason'],
    ),
    cli: {
      rank: 4,
      command: ['can'],
      positional: ['fg', 'bg', 'dir'],
      cliOnly: ['dir'],
      summary:
        'Ask whether the foreground token may be text (or, with --role ui, a border or focus ring) on the background token, by the brand rules; exits 0 allowed, 1 denied, 2 unknown token',
      options: [
        {
          property: 'role',
          value: 'text|ui',
          description: 'text (default) or ui: judge a non-text element by the 3:1 rule, with no pairs',
        },
        {
          property: 'theme',
          value: '<name>',
          description: "judge the pair in this context of the resolver's theme modifier (such as dark); exits 2 for an unknown theme",
        },
        {
          property: 'json',
          description: 'Print the answer as JSON on standard output',
        },
      ],
    },
    mcp: {
      answers: [1],
    },
  },
  {
    name: 'get_fonts',
    title: 'Read the brand fonts',
    description:
      'Gets the font stylesheets and font files the brand loads, and for each font family a token names whether the brand loads it. Use it to load the same fonts as the brand instead of typing a font address. For the family a token names, use get_token.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
        css: {
          type: 'boolean',
          description: 'Print the @font-face rules for the font files, and a comment for each stylesheet',
        },
        base: {
          type: 'string',
          description: 'With css: the URL prefix for each font file, in place of its path from the brand folder',
        },
      },
      [],
    ),
    outputSchema: output(
      {
        stylesheets: {
          description: 'Addresses of the font stylesheets to load',
          type: 'array',
          items: {
            type: 'string',
          },
        },
        files: {
          description: 'Font files the brand ships. Empty when the fonts come from a stylesheet',
          type: 'array',
          items: {},
        },
        families: {
          description: 'Each font family a token names, with the tokens that name it and `loaded`, whether the brand loads it',
          type: 'array',
          items: {},
        },
      },
      [],
    ),
    cli: {
      rank: 5,
      command: ['fonts'],
      positional: ['dir'],
      cliOnly: ['dir', 'css', 'base'],
      summary: 'Read the fonts the brand loads (stylesheets and font files) and the families its tokens name',
      options: [
        {
          property: 'css',
          description: 'Print the @font-face rules for the brand font files (and the stylesheet addresses as comments) instead of the listing',
        },
        {
          property: 'base',
          value: 'url-prefix',
          description: 'With --css: serve the files from this prefix, such as /fonts/, instead of their path from the brand folder',
        },
        {
          property: 'json',
          description: 'Print the fonts as JSON on standard output',
        },
      ],
    },
  },
  {
    name: 'get_logo',
    title: 'Read the brand logo',
    description:
      "Gets the brand logo variants for light and dark surfaces, their files, and the rules for each logo: clear space, minimum size, lockups, and the backgrounds that forbid it. Use it before placing a logo. For the brand's other rules use get_rules.",
    annotations: READ_ONLY,
    inputSchema: input(
      {
        dir: {
          type: 'string',
          description: 'The brand folder. Default: the current folder',
        },
      },
      [],
    ),
    outputSchema: output(
      {
        variants: {
          description: 'The logo variants (onLight, onDark), each with its file and whether the file was found',
          type: 'array',
          items: {},
        },
        assets: {
          description: 'The logo assets, each with its id, file, the variants it serves and its rules: clear space, minimum size, lockups',
          type: 'array',
          items: {},
        },
      },
      [],
    ),
    cli: {
      rank: 6,
      command: ['logo'],
      positional: ['dir'],
      cliOnly: ['dir'],
      summary: 'Read the configured logo variants and the rules each logo sidecar states: clear space, minimum size, lockups, ink',
      options: [
        {
          property: 'json',
          description: 'Print the logo as JSON on standard output',
        },
      ],
    },
  },
  {
    name: 'get_shadcn',
    title: 'Read the shadcn/ui variables',
    description:
      'Gets the shadcn/ui variables the brand supplies (theme.shadcn): which token each variable takes, its value, and the variables nothing supplies. Use it when the site uses shadcn/ui. It compiles the brand now (blazon brand --key theme.shadcn), so it needs no build and is never out of date.',
    annotations: READ_ONLY,
    inputSchema: input({}, []),
    outputSchema: output(
      {
        variables: {
          description: 'Each shadcn variable the brand supplies, by name, with the token it takes, its value and where the pick came from',
          type: 'object',
          propertyNames: {
            type: 'string',
          },
          additionalProperties: {},
        },
        unsupplied: {
          description: 'The shadcn variables nothing supplies. They are questions for the brand owner, not for a guess',
          type: 'array',
          items: {},
        },
      },
      [],
    ),
    cli: false,
    mcp: {
      command: ['brand'],
      fixed: ['--key', 'theme.shadcn'],
      json: false,
    },
  },
  {
    name: 'get_brand',
    title: 'Read the whole brand',
    description:
      'The brand as brand.json holds it, compiled now and written nowhere. It is the whole document, large for a real brand, so no tool serves it: the CLI prints it, and the resource blazon://brand carries it for an agent. `key` cuts it to one part.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        key: { type: 'string', description: 'Only this part of the document, by its dotted path, such as theme.shadcn' },
        dir: DIR,
      },
      [],
    ),
    cli: {
      rank: 7,
      command: ['brand'],
      positional: ['dir'],
      cliOnly: ['dir'],
      summary: 'Print the brand as brand.json holds it, compiled now and written nowhere; --key prints one part',
      options: [{ property: 'key', value: 'path', description: 'Print only this part of the document, by its dotted path, such as theme.shadcn' }],
    },
    mcp: false,
  },
];
