import { describe, expect, it, vi } from 'vitest';

// The clack-backed prompter turns a cancel into PromptCancelled, which runInit maps to exit 130.

const cancelled = Symbol('clack:cancel');
vi.mock('@clack/prompts', () => ({
  isCancel: (v: unknown) => v === cancelled,
  text: vi.fn(async () => cancelled),
  confirm: vi.fn(async () => true),
  select: vi.fn(async () => cancelled),
  multiselect: vi.fn(async () => []),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  spinner: vi.fn(),
  log: { message: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), step: vi.fn() },
}));

import * as clack from '@clack/prompts';
import { clackPrompter, PromptCancelled } from '../../src/core/init/prompts.js';
import { runInit } from '../../src/cli/commands/init.js';
import { tempDir } from '../support/project';
import path from 'node:path';
import fs from 'node:fs';

describe('clackPrompter', () => {
  it('rejects with PromptCancelled when clack reports a cancel', async () => {
    const p = clackPrompter();
    await expect(p.text({ message: 'x' })).rejects.toBeInstanceOf(PromptCancelled);
    await expect(p.select({ message: 'x', options: [{ value: 'a', label: 'a' }] })).rejects.toBeInstanceOf(PromptCancelled);
  });
  it('passes other answers through and hands the validator an empty string for no input', async () => {
    const p = clackPrompter();
    expect(await p.confirm({ message: 'x' })).toBe(true);
    vi.mocked(clack.text).mockResolvedValueOnce('hello');
    const validate = vi.fn(() => undefined);
    expect(await p.text({ message: 'x', validate })).toBe('hello');
    const given = vi.mocked(clack.text).mock.calls.at(-1)![0].validate as (v: string | undefined) => unknown;
    given(undefined);
    expect(validate).toHaveBeenCalledWith('');
  });
  it('exits 130 from runInit and leaves the starter, through the real prompter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = path.join(tempDir(), 'acme-brand');
    expect(await runInit(dir, { tty: true })).toBe(130);
    expect(clack.cancel).toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, 'blazon.config.ts'), 'utf8')).toContain('title: "Acme Brand Book"');
  });
});

import { wrapText } from '../../src/core/init/prompts.js';
describe('wrapText', () => {
  it('breaks at spaces within the width and leaves ANSI lines whole', () => {
    expect(wrapText('aaa bbb ccc ddd', 7)).toBe('aaa bbb\nccc ddd');
    const swatches = `\x1b[48;5;1m  \x1b[0m ${'x '.repeat(40)}`;
    expect(wrapText(swatches, 10)).toBe(swatches);
  });
});
