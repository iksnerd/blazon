import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlazonData } from '../../../types/index.js';
import { SIGNATURE_FIELDS, fieldProblems, signatureDocument, signatureHtml, signatureText, type SignatureFields } from '../../../core/email-signature.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logoFor } from '@/lib/brand';

// The `<!-- blazon:email-signature -->` directive: a form for one person's details, the signature it makes, and the two
// ways to take it to a mail app. Nothing typed leaves the page. In the print book only the sample signature shows.
// The preview draws the book's own logo, so it looks right before the hosted logo exists; the signature that is copied or
// downloaded always loads the hosted one (`logoUrl`), because a mail app draws the logo when the email is opened, from an address.

const LABELS: Record<keyof SignatureFields, string> = { name: 'Name', position: 'Position', phone: 'Phone', email: 'Email' };
const TYPES: Record<keyof SignatureFields, string> = { name: 'text', position: 'text', phone: 'tel', email: 'email' };
const AUTOCOMPLETE: Record<keyof SignatureFields, string> = { name: 'name', position: 'organization-title', phone: 'tel', email: 'email' };

/** What the preview shows for a field left empty, so the page, and the print book, show a whole signature. */
function sample(domain: string | undefined): SignatureFields {
  return { name: 'Alex Morgan', position: 'Head of Partnerships', phone: '+44 20 7946 0000', email: `alex.morgan@${domain ?? 'example.com'}` };
}

const EMPTY: SignatureFields = { name: '', position: '', phone: '', email: '' };

/** Puts the signature on the clipboard as formatted text, which a signature editor keeps, with plain text beside it. */
async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    return true;
  } catch {
    // An older browser, or a page not served over https: copy a selection of the rendered signature instead
    const holder = document.createElement('div');
    holder.innerHTML = html;
    holder.style.position = 'fixed';
    holder.style.left = '-9999px';
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const copied = document.execCommand('copy');
    selection?.removeAllRanges();
    holder.remove();
    return copied;
  }
}

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EmailSignature({ data }: { data: BlazonData; args: string[] }) {
  const config = data.emailSignature;
  const [fields, setFields] = useState<SignatureFields>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof SignatureFields, boolean>>>({});
  const [status, setStatus] = useState('');
  const [logoLoads, setLogoLoads] = useState<boolean | undefined>(undefined);
  const [height, setHeight] = useState(180);
  const frame = useRef<HTMLIFrameElement>(null);

  // Mail apps load the logo from its URL, so say so when it does not load here either
  useEffect(() => {
    if (!config) return;
    // A probe for an earlier config must not answer for this one
    let current = true;
    const probe = new Image();
    probe.onload = () => current && setLogoLoads(true);
    probe.onerror = () => current && setLogoLoads(false);
    probe.src = config.logoUrl;
    return () => {
      current = false;
    };
  }, [config]);

  const style = useMemo(() => ({ text: data.theme.text ?? '#111111', muted: data.theme.muted ?? '#555555', font: data.theme.fontBody }), [data.theme]);
  if (!config) return <p className="text-[13px] text-destructive">No email signature is configured (blazon.json → emailSignature).</p>;

  const problems = fieldProblems(config, fields);
  const ready = Object.keys(problems).length === 0;
  const example = sample(config.domains?.[0]);
  const shown = Object.fromEntries(SIGNATURE_FIELDS.map((key) => [key, fields[key].trim() ? fields[key] : example[key]])) as unknown as SignatureFields;
  const html = signatureHtml(config, shown, style);
  // On white, as mail is read: the artwork made for a light background
  const previewLogo = logoFor(data, 'light');
  const previewHtml = previewLogo ? signatureHtml(config, shown, style, { logoSrc: previewLogo }) : html;

  const copy = async () =>
    setStatus(
      (await copyRich(html, signatureText(config, shown)))
        ? 'Copied. Paste it into your mail app’s signature settings.'
        : 'The browser did not allow copying: download the file instead.',
    );
  const save = () => {
    download('email-signature.html', signatureDocument(config, shown, style));
    setStatus('Downloaded email-signature.html.');
  };

  return (
    // Side by side only when the column it sits in is wide enough, not the window: the page's column can be narrow on a wide screen
    <div className="not-prose @container my-4" data-email-signature="">
      <div className="grid gap-5 @2xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <form className="flex flex-col gap-3 print:hidden" onSubmit={(event) => event.preventDefault()} noValidate>
          {SIGNATURE_FIELDS.map((key) => {
            const error = touched[key] ? problems[key] : undefined;
            return (
              <label key={key} className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{LABELS[key]}</span>
                <Input
                  type={TYPES[key]}
                  autoComplete={AUTOCOMPLETE[key]}
                  placeholder={example[key]}
                  value={fields[key]}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => {
                    setFields({ ...fields, [key]: event.target.value });
                    setStatus('');
                  }}
                  onBlur={() => setTouched({ ...touched, [key]: true })}
                />
                {error && <span className="text-destructive">{error}</span>}
              </label>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" disabled={!ready} onClick={() => void copy()}>
              Copy signature
            </Button>
            <Button type="button" variant="outline" disabled={!ready} onClick={save}>
              Download .html
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {status || (ready ? 'Ready to copy.' : 'Fill in all four fields to copy or download.')}
          </p>
        </form>
        <figure className="flex min-w-0 flex-col gap-2">
          {/* A frame of its own, so none of the book's styles or fonts reach it: it looks as it does on its own, which is how
            a mail app shows it. Mail is read on white, so it is white in both modes. No scripts run in it */}
          <iframe
            ref={frame}
            title="Email signature preview"
            sandbox="allow-same-origin"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:20px;background:#ffffff">${previewHtml}</body></html>`}
            onLoad={() => setHeight(frame.current?.contentDocument?.documentElement.scrollHeight ?? height)}
            style={{ height }}
            className="w-full rounded-lg border bg-white"
          />
          <figcaption className="text-[13px] text-muted-foreground">
            {fields.name.trim() ? 'Your signature, as a mail app shows it.' : 'A sample signature. Fill in the form to make yours.'}
            {previewLogo && (
              <span className="block print:hidden">
                The preview shows the book’s own logo. The signature you copy loads it from <code className="break-all">{config.logoUrl}</code>.
              </span>
            )}
            {logoLoads === false && (
              <span data-logo-warning="" className="block text-destructive print:hidden">
                That address did not load here, so it is not hosted yet: a signature made now shows “{config.logoAlt}” in mail apps in place of the logo.
              </span>
            )}
          </figcaption>
          <details data-logo-why="" className="text-[13px] text-muted-foreground print:hidden">
            <summary className="cursor-pointer font-medium">Why the logo comes from a web address</summary>
            <p className="mt-2 max-w-[46em]">
              A mail app draws the logo when someone opens the email, so it fetches the image from the address in the signature. A file on your computer does not exist for the
              reader, and most mail apps do not show SVG, so the signature needs a public https link to a PNG. The preview above uses the book’s own copy so you can see the result;
              the address is <code>emailSignature.logoUrl</code> in <code>blazon.json</code>.
            </p>
          </details>
        </figure>
      </div>
    </div>
  );
}
