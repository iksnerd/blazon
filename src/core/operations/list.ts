import { DEFAULT_LIMIT, MAX_LIMIT, MAX_PAIRS, MAX_TEXT } from './limits.js';
import type { InputSchema, JsonSchema, Operation, Prop } from './types.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** The folder a command reads. A command-line argument only: a tool never takes it, because the server fixes the brand. */
const DIR: Prop = { type: 'string', description: 'The brand folder. Default: the current folder' };

/** A resolver theme context, as `can`, `list` and `get` take it. The pattern keeps a value that starts with a dash from being read as an option. */
const THEME = (what: string): Prop => ({
  type: 'string',
  maxLength: 200,
  pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*$',
  description: `${what} in this context of the resolver's theme modifier, such as dark. An unknown theme is refused with the list of themes. Default: the default tokens`,
});

/** The pattern of a token path, as a tool argument takes it. */
const TOKEN_PATH = '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$';

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
  brandHasErrors: {
    type: 'boolean',
    description:
      "True when the brand's own data has error findings, so a value read from it may be wrong. Run check_brand to see them. A blazon.lock that names another blazon build does not set it: that is `pinMismatch`",
  },
  pinMismatch: {
    type: 'object',
    properties: {
      pinned: { type: 'string', description: 'The blazon build blazon.lock names, as blazon prints it (12 hex digits)' },
      running: { type: 'string', description: 'The blazon build running, as blazon prints it, or "unknown" when it cannot say' },
      message: { type: 'string', description: 'One line: which build the book is pinned to, which is running, and what to do' },
    },
    required: ['pinned', 'running', 'message'],
    additionalProperties: {},
    description:
      'Present only when blazon.lock names a different blazon build than the one running. The build and the book disagree; no token or value is wrong because of it, so there is no need to re-check values. Tell the user. `blazon check`, `build` and `tokens` refuse until it is fixed',
  },
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
    description: `Runs blazon check on the brand, without plugins, and returns its findings and counts. Plugins in blazon.json do not run, so the counts can be lower than \`blazon check\` prints, but only for a plugin with a check role; a build-only plugin adds no finding. \`pluginsSkipped\` and \`warnings\` list every configured plugin, since a role is known only by starting the plugin; \`rulesNotRun\` gives the code pattern of each (\`name/*\`). \`byRule\` groups the findings by code with a count and one example each. \`passed\` is false when the brand's own data has errors (\`brandHasErrors\`), and values read from such a brand can be wrong; a \`pin-mismatch\` finding is listed and counted but does not make \`passed\` false, and is also in \`pinMismatch\`. Returns at most \`limit\` findings (default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}); \`counts\` stay whole. Not for reading a value: use get_token.`,
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
          description: 'True when no finding other than the pin family is an error. A pin-mismatch alone leaves it true',
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
        byRule: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'The finding code' },
              severity: { type: 'string', description: 'error, warning or info' },
              count: { type: 'number', description: 'How many findings carry this code at this severity, before `limit` cut the list' },
              example: {
                type: 'object',
                description: 'The first finding of this code',
                properties: {
                  path: { type: 'string', description: 'Where the first finding of this code is, cut to 80 characters' },
                  message: { type: 'string', description: 'What it says, cut to 120 characters' },
                },
                required: ['path', 'message'],
                additionalProperties: {},
              },
            },
            required: ['code', 'severity', 'count', 'example'],
            additionalProperties: {},
          },
          description:
            'The findings grouped by code, worst severity first, then the larger count: what the warnings are without reading the list. Counted over every finding the check returned, not only the `limit` kept; with `severity` set, only that level and worse',
        },
        rulesNotRun: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The code pattern of each plugin that did not run, such as `blazon.copy/*`. A plugin finding code starts with its name and a slash, so no code matching one of these is in `findings`, and its absence says nothing about the brand. Absent when the config lists no plugin',
        },
        pluginsSkipped: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Every plugin blazon.json lists, which did not run because the server never starts a plugin. Only one with a check role can make `blazon check` report more findings than `counts`; the server cannot tell which without starting it. Absent when the config lists none',
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
    description: `Lists the design tokens of the brand, or of one group, type or tier, each with its path, type, tier and value, in the order the token files write them. Use it to find a path or to read many values at once. \`tier\` (primitive, semantic or component) keeps to one layer of the brand. \`theme\` gives the values as that theme resolves them, and \`defaultValue\` on a token the theme changes; \`themes\` names the themes the brand has. For a token's CSS variable names and rules use get_token; for the brand's usage rules use get_rules. An answer over ${MAX_TEXT} characters is cut to whole tokens, and \`tokensTotal\` says how many matched: narrow with \`group\`, \`type\` or \`tier\`.`,
    annotations: READ_ONLY,
    inputSchema: input(
      {
        group: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description:
            "A group path as list_tokens returns it, the part of a token path before its last dot (a path of the form `<group>.<token>` has the group `<group>`). Leave out for every token. Run list_tokens first to see the brand's groups",
        },
        type: {
          description: 'A token type, for example color, dimension or fontFamily. Leave out for every type. An unknown type is refused with the list of types',
          type: 'string',
          maxLength: 40,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*$',
        },
        tier: {
          description: 'A tier: primitive, semantic or component. Leave out for every tier. An unknown tier is refused with the list of tiers',
          type: 'string',
          maxLength: 40,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*$',
        },
        theme: THEME('List the values'),
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
        tier: {
          description: 'The tier asked for. Absent when every tier was listed',
          type: 'string',
        },
        theme: {
          description: 'The theme the values are resolved in. Absent when the default tokens were listed',
          type: 'string',
        },
        themes: {
          description: 'The names of the themes the brand has, to pass as `theme`. Absent when the brand has no resolver theme modifier',
          type: 'array',
          items: { type: 'string' },
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
              tier: {
                description: 'primitive, semantic or component, when the brand writes one',
                type: 'string',
              },
              defaultValue: {
                description: 'With `theme`: the value in the default tokens, present only when the theme changes it',
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
        {
          property: 'tier',
          value: 'tier',
          description: 'List only the tokens of one tier: primitive, semantic or component',
        },
        {
          property: 'theme',
          value: 'name',
          description:
            "list the values as this context of the resolver's theme modifier resolves them (such as dark), and the default value of each token it changes; exits 2 for an unknown theme",
        },
      ],
    },
  },
  {
    name: 'get_token',
    title: 'Read a token',
    description:
      'Looks up one design token of the brand: its value, type, the CSS variable names it gets, and the rules that apply to it. Use it for the value of a path you know; a group path is refused. With `theme` the value is the one that theme resolves, and `defaultValue` is the default one when it differs. For a path you do not know use list_tokens.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        path: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The token path, exactly as list_tokens returns it (a format such as `<group>.<token>`). Paths differ between brands: run list_tokens first',
        },
        theme: THEME('Read the value'),
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
              description: 'The value as CSS needs it, with aliases resolved; with `theme`, as that theme resolves it',
            },
            defaultValue: {
              description: 'With `theme`: the value in the default tokens, present only when the theme changes it',
            },
            theme: {
              description: 'The theme the value is resolved in. Absent for the default tokens',
              type: 'string',
            },
            tier: {
              description: 'primitive, semantic or component, when the brand writes one',
              type: 'string',
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
      summary: 'Read one token: its value, type, CSS variable name in theme.css, its usage, pairs and logo rules, and the file it is in. To find a path, use blazon list',
      options: [
        {
          property: 'theme',
          value: 'name',
          description:
            "read the value as this context of the resolver's theme modifier resolves it (such as dark), and the default value when it differs; exits 2 for an unknown theme",
        },
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
          description: 'A token or group path as list_tokens returns it. Leave out for the whole brand. Paths differ between brands: run list_tokens first',
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
    description: `Answers whether one color token may be text on another color token, by the brand rules. Give \`fg\` and \`bg\` for one pair, or \`pairs\` (at most ${MAX_PAIRS}) for several in one call: the answer then has one result per pair, in order, and \`allowed\` is true only when every pair is. Exactly one of the two forms. Set \`role\` to ui for a focus ring, border or icon stroke: it is judged against the 3:1 non-text contrast and the pairs rules do not apply. \`verbose\` false leaves out the \`checks\` of an allowed answer; a denial keeps them. Contrast is measured as \`check_brand\` measures it: a color with an alpha channel is blended over its background, and \`alpha\` sets the foreground's opacity. The usage rules are read first, so a token a rule forbids is a denial even when it is not a color. A background with an alpha channel is an error, because what is behind it is not known, and so is a token that is not a color when usage allows it. A denied answer is a normal result (\`allowed\` is false, \`reason\` names the rule), not an error. Pairs come only from the \`pairs\` rules of token groups; component tokens are not read for them. For a color you have not picked, find one with list_tokens and type color.`,
    annotations: READ_ONLY,
    inputSchema: input(
      {
        fg: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The text color token path, as list_tokens returns it for a color token. Give it with bg, or give pairs instead',
        },
        bg: {
          type: 'string',
          maxLength: 200,
          pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]*(\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$',
          description: 'The background color token path, as list_tokens returns it for a color token. Give it with fg, or give pairs instead',
        },
        pairs: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_PAIRS,
          description: `Several pairs to judge in one call, each a text color token fg and a background color token bg, in place of fg and bg. At most ${MAX_PAIRS}`,
          items: {
            type: 'object',
            properties: {
              fg: { type: 'string', maxLength: 200, pattern: TOKEN_PATH, description: 'The text color token path' },
              bg: { type: 'string', maxLength: 200, pattern: TOKEN_PATH, description: 'The background color token path' },
            },
            required: ['fg', 'bg'],
            additionalProperties: false,
          },
        },
        verbose: {
          type: 'boolean',
          default: true,
          description: 'False leaves out the `checks` of an answer that is allowed, which shortens the answer; a denial keeps its checks, since they are the reason. Default: true',
        },
        role: {
          type: 'string',
          enum: ['text', 'ui'],
          default: 'text',
          description:
            'What the first color is: text (default), judged by the usage, pairs and WCAG text rules, or ui for a focus ring, border or icon stroke, judged by the usage rules and the 3:1 non-text contrast',
        },
        alpha: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Measure the first color at this opacity, 0 to 1, on top of any alpha the token already has (the two multiply). The pair still names tokens; only the measured ratio changes. Default: the token as it is',
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
      [],
    ),
    outputSchema: output(
      {
        allowed: {
          type: 'boolean',
          description: 'True when the brand allows this text color on this background; with `pairs`, true when it allows every pair',
        },
        results: {
          description:
            'With `pairs`: one answer for each pair, in order, each with the fields of a single answer: fg, bg, allowed, reason, role, contrast and, unless `verbose` is false and the pair is allowed, checks',
          type: 'array',
          items: { type: 'object' },
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
        alpha: {
          description: 'The opacity the first color was measured at, when alpha was given',
          type: 'number',
        },
        theme: {
          description: 'The theme context the pair was judged in; absent for the default tokens',
          type: 'string',
        },
        contrast: {
          description:
            'The contrast ratio of the pair, the strictest WCAG level it meets, and for role ui the threshold it had to reach. Absent when a usage rule denied a pair whose colors cannot be measured',
          type: 'object',
        },
      },
      ['allowed'],
    ),
    cli: {
      rank: 4,
      command: ['can'],
      positional: ['fg', 'bg', 'dir'],
      cliOnly: ['dir'],
      folder: 'fg',
      summary:
        'Ask whether the foreground token may be text (or, with --role ui, a border or focus ring) on the background token, by the brand rules; exits 0 allowed, 1 denied, 2 unknown token. Several pairs: --pair fg:bg, repeated',
      options: [
        {
          property: 'pairs',
          flag: 'pair',
          value: 'fg:bg',
          items: ['fg', 'bg'],
          description: `judge this pair, in place of the fg and bg arguments; repeat the flag for up to ${MAX_PAIRS} pairs, one result each, in order; exits 0 when every pair is allowed, else 1`,
        },
        {
          property: 'verbose',
          flag: 'no-verbose',
          description: 'leave out the checks of an allowed answer, which are all it adds to the reason; a denial keeps them',
        },
        {
          property: 'role',
          value: 'text|ui',
          description: 'text (default) or ui: judge a non-text element by the 3:1 rule, with no pairs',
        },
        {
          property: 'alpha',
          value: '0-1',
          description: 'measure the foreground at this opacity, 0 to 1, times its own alpha; a translucent background is refused (exit 2)',
        },
        {
          property: 'theme',
          value: 'name',
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
          description:
            'The logo variants (onLight, onDark), each with its file, whether the file was found and, when it was, its absolute path (on the machine the server runs on) and sha256',
          type: 'array',
          items: {},
        },
        assets: {
          description:
            'The logo assets, each once, with its id, its files (a list; the first is the one a reader with no preference takes), details (for each file, in order: file, absolute path, sha256, bytes, format), the variants it serves and its rules: clear space, minimum size, lockups. Paths are absolute on the machine the server runs on',
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
    name: 'get_brand',
    title: 'Read the whole brand',
    description:
      'The brand as brand.json holds it, compiled now and written nowhere. It is the whole document, large for a real brand, so no tool serves it: the CLI prints it, and the resource blazon://brand carries it for an agent. `key` cuts it to one part.',
    annotations: READ_ONLY,
    inputSchema: input(
      {
        key: { type: 'string', description: 'Only this part of the document, by its dotted path, such as theme.roles' },
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
      options: [{ property: 'key', value: 'path', description: 'Print only this part of the document, by its dotted path, such as theme.roles' }],
    },
    mcp: false,
  },
];
