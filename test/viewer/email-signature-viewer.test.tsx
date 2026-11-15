// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BlazonData } from '../../src/types/index.js';
import { EmailSignature } from '../../src/viewer/components/blazon/email-signature';

// The `<!-- blazon:email-signature -->` directive: a form, a preview that shows a sample until the form is filled,
// and buttons that stay off until every field is right.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LOCAL_LOGO = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const HOSTED = 'https://example.com/logo@2x.png';

const data = (withSignature = true, logo: boolean = false) =>
  ({
    theme: { text: '#111827', muted: '#4B5563', fontBody: 'Mulish' },
    ...(logo && { logo: { onLight: LOCAL_LOGO } }),
    ...(withSignature && {
      emailSignature: { logoUrl: 'https://example.com/logo@2x.png', logoSize: { width: 150, height: 35 }, logoAlt: 'Acme', domains: ['acme.com'], lines: ['Confidential.'] },
    }),
  }) as unknown as BlazonData;

const type = (label: string, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

/** The preview frame's document: the signature alone, in a frame that runs no scripts. */
const preview_ = () => {
  const frame = screen.getByTitle('Email signature preview');
  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
  return frame.getAttribute('srcdoc') ?? '';
};

describe('the email signature form', () => {
  it('shows a sample signature on the configured domain before anything is typed', () => {
    render(<EmailSignature data={data()} args={[]} />);
    const preview = preview_();
    expect(preview).toContain('Alex Morgan');
    expect(preview).toContain('alex.morgan@acme.com');
    expect(preview).toContain('Confidential.');
    expect(screen.getByRole('button', { name: 'Copy signature' })).toHaveProperty('disabled', true);
  });

  it('shows what is typed, and turns the buttons on once every field is right', () => {
    render(<EmailSignature data={data()} args={[]} />);
    type('Name', 'Sam Lee');
    type('Position', 'Designer');
    type('Phone', '+359 2 123 4567');
    type('Email', 'sam@acme.com');
    expect(preview_()).toContain('Sam Lee');
    expect(screen.getByRole('button', { name: 'Copy signature' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Download .html' })).toHaveProperty('disabled', false);
  });

  it('says why an address on another domain is refused', () => {
    render(<EmailSignature data={data()} args={[]} />);
    type('Email', 'sam@gmail.com');
    expect(screen.getByText('Use your @acme.com address')).toBeTruthy();
  });

  it("shows the book's own logo in the preview, and says the signature loads the hosted one", () => {
    render(<EmailSignature data={data(true, true)} args={[]} />);
    const preview = preview_();
    expect(preview).toContain(`<img src="${LOCAL_LOGO}"`);
    expect(preview).not.toContain(HOSTED);
    expect(screen.getByText(/The preview shows the book’s own logo/)).toBeTruthy();
    expect(screen.getByText(HOSTED)).toBeTruthy();
  });

  it('shows the hosted logo in the preview when the book has no logo of its own', () => {
    render(<EmailSignature data={data(true, false)} args={[]} />);
    expect(preview_()).toContain(`<img src="${HOSTED}"`);
    expect(screen.queryByText(/The preview shows the book’s own logo/)).toBeNull();
  });

  it('copies the signature with the hosted logo, never the local one', async () => {
    const written: Blob[][] = [];
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async (items: { items: Record<string, Blob> }[]) => void written.push(Object.values(items[0]!.items)) },
    });
    const readBlob = (blob: Blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
    render(<EmailSignature data={data(true, true)} args={[]} />);
    type('Name', 'Sam Lee');
    type('Position', 'Designer');
    type('Phone', '+359 2 123 4567');
    type('Email', 'sam@acme.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy signature' }));
    });
    expect(written).toHaveLength(1);
    const html = await readBlob(written[0]![0]!);
    expect(html).toContain(`<img src="${HOSTED}"`);
    expect(html).not.toContain(LOCAL_LOGO);
  });

  it('says the hosted address does not load, and what a mail app then shows, only when it does not', async () => {
    const image = (outcome: 'onload' | 'onerror') =>
      class {
        onload?: () => void;
        onerror?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this[outcome]?.());
        }
      };
    vi.stubGlobal('Image', image('onerror'));
    render(<EmailSignature data={data(true, true)} args={[]} />);
    expect(await screen.findByText(/That address did not load here, so it is not hosted yet: a signature made now shows “Acme”/)).toBeTruthy();
    cleanup();

    vi.stubGlobal('Image', image('onload'));
    render(<EmailSignature data={data(true, true)} args={[]} />);
    await act(async () => {});
    expect(document.querySelector('[data-logo-warning]')).toBeNull();
  });

  it('explains why the logo comes from a web address, out of the print', () => {
    render(<EmailSignature data={data(true, true)} args={[]} />);
    const why = document.querySelector<HTMLElement>('[data-logo-why]')!;
    expect(why.textContent).toContain('Why the logo comes from a web address');
    expect(why.textContent).toContain('public https link to a PNG');
    expect(why.textContent).toContain('emailSignature.logoUrl');
    expect(why.className).toContain('print:hidden');
  });

  it('says so when the config has no emailSignature block', () => {
    render(<EmailSignature data={data(false)} args={[]} />);
    expect(screen.getByText('No email signature is configured (blazon.config.ts → emailSignature).')).toBeTruthy();
  });
});
