import * as clack from '@clack/prompts';

// The seam between `blazon init` and the terminal. The guided start talks to a Prompter; the real one draws with
// @clack/prompts, and a test passes a scripted one, so no test opens a terminal.

/** Ctrl-C (or the end of input) at a prompt: the caller stops, leaves the starter as copied and exits 130. */
export class PromptCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PromptCancelled';
  }
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Returns an error message to ask again, or undefined when the answer is fine. */
export type Validate = (value: string) => string | undefined;

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  /** Ends the session after a cancel */
  cancel(message: string): void;
  text(o: { message: string; placeholder?: string; defaultValue?: string; validate?: Validate }): Promise<string>;
  select<T extends string>(o: { message: string; options: Choice<T>[]; initialValue?: T }): Promise<T>;
  multiselect<T extends string>(o: { message: string; options: Choice<T>[]; initialValues?: T[] }): Promise<T[]>;
  confirm(o: { message: string; initialValue?: boolean }): Promise<boolean>;
  spinner(): { start(message: string): void; stop(message: string): void; error(message: string): void };
  note(body: string, title: string): void;
  log: { message(m: string): void; info(m: string): void; success(m: string): void; warn(m: string): void; error(m: string): void; step(m: string): void };
}

/** Breaks long lines at spaces so they fit beside the rail; lines with ANSI codes (swatches) are left alone. */
export function wrapText(text: string, width: number): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= width || line.includes('\x1b')) return line;
      const out: string[] = [];
      let current = '';
      for (const word of line.split(' ')) {
        if (current && current.length + 1 + word.length > width) {
          out.push(current);
          current = word;
        } else current = current ? `${current} ${word}` : word;
      }
      out.push(current);
      return out.join('\n');
    })
    .join('\n');
}

const railWidth = (): number => Math.max(30, (process.stdout.columns ?? 80) - 6);

function answered<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new PromptCancelled();
  return value as T;
}

/** The terminal prompter: @clack/prompts, with a cancel turned into PromptCancelled. */
export function clackPrompter(): Prompter {
  return {
    intro: (title) => clack.intro(title),
    outro: (message) => clack.outro(message),
    cancel: (message) => clack.cancel(message),
    text: async (o) =>
      (answered(
        await clack.text({ message: o.message, placeholder: o.placeholder, defaultValue: o.defaultValue, validate: o.validate && ((v) => o.validate!(v ?? '')) }),
      ) as string) ?? '',
    select: async (o) =>
      answered(await clack.select<string>({ message: o.message, options: o.options as { value: string; label: string; hint?: string }[], initialValue: o.initialValue })) as never,
    multiselect: async (o) =>
      answered(
        await clack.multiselect<string>({
          message: o.message,
          options: o.options as { value: string; label: string; hint?: string }[],
          initialValues: o.initialValues,
          required: false,
        }),
      ) as never,
    confirm: async (o) => answered(await clack.confirm({ message: o.message, initialValue: o.initialValue })) as boolean,
    spinner: () => {
      const s = clack.spinner();
      return { start: (m) => s.start(m), stop: (m) => s.stop(m), error: (m) => s.error(m) };
    },
    note: (body, title) => clack.note(body, title),
    log: {
      message: (m) => clack.log.message(wrapText(m, railWidth())),
      info: (m) => clack.log.info(wrapText(m, railWidth())),
      success: (m) => clack.log.success(wrapText(m, railWidth())),
      warn: (m) => clack.log.warn(wrapText(m, railWidth())),
      error: (m) => clack.log.error(wrapText(m, railWidth())),
      step: (m) => clack.log.step(wrapText(m, railWidth())),
    },
  };
}

/** What a scripted prompter was asked, in order. */
export interface Asked {
  kind: string;
  message: string;
  /** The labels of a select or multiselect, one per option */
  options?: string[];
}

/** Stands for Ctrl-C in a script. */
export const CANCEL = Symbol('cancel');

export interface Scripted extends Prompter {
  asked: Asked[];
  /** Everything printed through log, note, spinner, intro and outro, as `kind: text` lines */
  output: string[];
  /** The validation messages a bad text answer got, in order */
  rejected: string[];
}

/**
 * A prompter that answers from a list, in the order the questions come. A text answer that `validate` refuses is
 * recorded in `rejected` and the next answer is used, as the terminal would ask again. When the list runs out it
 * cancels, as the end of input does.
 */
export function scriptedPrompter(answers: unknown[]): Scripted {
  const queue = [...answers];
  const asked: Asked[] = [];
  const output: string[] = [];
  const rejected: string[] = [];
  const next = (kind: string, message: string, options?: string[]): unknown => {
    asked.push({ kind, message, ...(options && { options }) });
    if (queue.length === 0) throw new PromptCancelled();
    const value = queue.shift();
    if (value === CANCEL) throw new PromptCancelled();
    return value;
  };
  const say = (kind: string) => (m: string) => void output.push(`${kind}: ${m}`);
  return {
    asked,
    output,
    rejected,
    intro: say('intro'),
    outro: say('outro'),
    cancel: say('cancel'),
    text: async (o) => {
      for (;;) {
        const value = String(next('text', o.message));
        const text = value === '' && o.defaultValue !== undefined ? o.defaultValue : value;
        const problem = o.validate?.(text);
        if (problem === undefined) return text;
        rejected.push(problem);
      }
    },
    select: async (o) =>
      next(
        'select',
        o.message,
        o.options.map((x) => x.label),
      ) as never,
    multiselect: async (o) =>
      next(
        'multiselect',
        o.message,
        o.options.map((x) => x.label),
      ) as never,
    confirm: async (o) => Boolean(next('confirm', o.message)),
    spinner: () => ({ start: say('spinner'), stop: say('spinner done'), error: say('spinner failed') }),
    note: (body, title) => void output.push(`note ${title}: ${body}`),
    log: { message: say('message'), info: say('info'), success: say('success'), warn: say('warn'), error: say('error'), step: say('step') },
  };
}
