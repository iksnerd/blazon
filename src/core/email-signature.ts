import type { EmailSignatureConfig } from '../types/index.js';

// The `<!-- blazon:email-signature -->` directive's output: HTML a mail app keeps when it is pasted into its signature
// settings. Mail apps drop <style>, classes, web fonts, SVG and data URIs, so the markup is a table with inline styles,
// a system font after the brand's, and a logo loaded from a URL.

/** What one person fills in. */
export interface SignatureFields {
  name: string;
  position: string;
  phone: string;
  email: string;
}

/** The brand's own look, taken from the theme: two text colors and the font family. */
export interface SignatureStyle {
  text: string;
  muted: string;
  /** A CSS font-family list or one family; only the first family is kept, with mail-safe families after it */
  font?: string;
}

export const SIGNATURE_FIELDS = ['name', 'position', 'phone', 'email'] as const satisfies readonly (keyof SignatureFields)[];

/** Families every mail app has, after the brand's own, which most of them cannot load. */
const SAFE_FONTS = 'Arial, Helvetica, sans-serif';

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The first family of a font list, unquoted, then the mail-safe families. */
export function fontStack(font: string | undefined): string {
  const first = (font ?? '')
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  if (!first || /^(ui-|system-ui|sans-serif|serif|monospace|-apple-system)/.test(first)) return SAFE_FONTS;
  return `${/\s/.test(first) ? `'${first}'` : first}, ${SAFE_FONTS}`;
}

/** The number a `tel:` link dials: the digits, with a leading plus kept. */
export function dialable(phone: string): string {
  const trimmed = phone.trim();
  return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}

/** What is wrong with each field, if anything. An empty field is wrong: every signature has all four. */
export function fieldProblems(config: EmailSignatureConfig, fields: SignatureFields): Partial<Record<keyof SignatureFields, string>> {
  const problems: Partial<Record<keyof SignatureFields, string>> = {};
  if (!fields.name.trim()) problems.name = 'Enter your name';
  if (!fields.position.trim()) problems.position = 'Enter your position';
  const digits = dialable(fields.phone).replace('+', '');
  if (!fields.phone.trim()) problems.phone = 'Enter your phone number';
  else if (!/^\+?[\d\s().-]+$/.test(fields.phone.trim()) || digits.length < 7 || digits.length > 15) {
    problems.phone = 'Use digits, spaces and a leading +, such as +44 20 7946 0000';
  }
  const email = fields.email.trim().toLowerCase();
  const domain = email.split('@')[1] ?? '';
  if (!email) problems.email = 'Enter your email address';
  // The part before the @ is letters, digits and . _ + ' - only: it goes into a mailto: link as it is, and a ? & , or % there would add a
  // recipient or a header (x?cc=a%40other.com&@acme.com) that the check of the domain below never sees.
  else if (!/^[a-z0-9._+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) problems.email = 'Enter a full email address, like name@company.com';
  else if (config.domains && !config.domains.includes(domain)) problems.email = `Use your ${config.domains.map((d) => `@${d}`).join(' or ')} address`;
  return problems;
}

/**
 * The signature as HTML for a mail app's signature settings. Every field and line is escaped. `logoSrc` is for a preview
 * only: it shows that image where the signature would load `logoUrl` (the book's own logo, while the hosted one is not
 * there yet). What is copied or downloaded never passes it, so it always names the hosted address.
 */
export function signatureHtml(config: EmailSignatureConfig, fields: SignatureFields, style: SignatureStyle, options: { logoSrc?: string } = {}): string {
  const font = escapeHtml(fontStack(style.font));
  const text = escapeHtml(style.text);
  const muted = escapeHtml(style.muted);
  const email = fields.email.trim().toLowerCase();
  const { width, height } = config.logoSize;
  const cell = (body: string, css: string) => `<tr><td style="${css}">${body}</td></tr>`;
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${text};text-decoration:none">${escapeHtml(label)}</a>`;
  const rows = [
    cell(escapeHtml(fields.name.trim()), `padding:0;font-size:15px;line-height:20px;font-weight:bold;color:${text}`),
    cell(escapeHtml(fields.position.trim()), `padding:0 0 8px 0;color:${muted}`),
    cell(link(`tel:${dialable(fields.phone)}`, fields.phone.trim()), 'padding:0'),
    cell(link(`mailto:${email}`, email), 'padding:0'),
    cell(
      `<img src="${escapeHtml(options.logoSrc ?? config.logoUrl)}" width="${width}" height="${height}" alt="${escapeHtml(config.logoAlt)}" style="display:block;border:0;outline:none;width:${width}px;height:${height}px">`,
      'padding:12px 0 0 0',
    ),
    ...(config.lines ?? []).map((line, index) => cell(escapeHtml(line), `padding:${index === 0 ? 12 : 4}px 0 0 0;font-size:11px;line-height:16px;color:${muted}`)),
  ];
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:480px;border-collapse:collapse;font-family:${font};font-size:13px;line-height:18px;color:${text}">${rows.join('')}</table>`;
}

/** The same signature as plain text, for the plain-text part of an email and for apps that paste no HTML. */
export function signatureText(config: EmailSignatureConfig, fields: SignatureFields): string {
  return [fields.name.trim(), fields.position.trim(), fields.phone.trim(), fields.email.trim().toLowerCase(), '', config.logoAlt, ...(config.lines ?? [])].join('\n');
}

/** A whole HTML file holding the signature, for mail apps that import a file (Apple Mail, classic Outlook). */
export function signatureDocument(config: EmailSignatureConfig, fields: SignatureFields, style: SignatureStyle): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(fields.name.trim())}</title></head><body>${signatureHtml(config, fields, style)}</body></html>\n`;
}
