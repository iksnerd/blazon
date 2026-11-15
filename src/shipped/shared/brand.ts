import type { AssetMeta } from '../../types/index.js';
import { isObject } from './plugin.js';

// The reads of brand.json that the shipped plugins share. A field of the wrong shape is a field that is not there.

/** A non-empty string (not only whitespace), or undefined. */
export const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** The fields every plugin reads of an asset in brand.json. */
export interface BaseAsset {
  id: string;
  file: string;
  format: string;
  category: string;
}

/** An asset's id, file, format and category (the first segment of the id when the entry has none); undefined when the entry lacks one of the first three. */
export function readBaseAsset(raw: unknown): BaseAsset | undefined {
  if (!isObject(raw)) return undefined;
  const [id, file, format] = [text(raw.id), text(raw.file), text(raw.format)];
  if (!id || !file || !format) return undefined;
  return { id, file, format, category: text(raw.category) ?? id.split('/')[0]! };
}

/** An asset's sidecar rules: its `meta` object, or an empty one. */
export const readMeta = (raw: Record<string, unknown>): AssetMeta => (isObject(raw.meta) ? (raw.meta as AssetMeta) : {});

/** The theme roles that are non-empty strings, by role name. */
export function readRoles(root: Record<string, unknown>): Record<string, string> {
  const theme = isObject(root.theme) ? root.theme : {};
  const roles: Record<string, string> = {};
  for (const [name, value] of Object.entries(isObject(theme.roles) ? theme.roles : {})) if (text(value)) roles[name] = value as string;
  return roles;
}

/** The files brand.json names as the logo for a light and for a dark surface. */
export function readLogo(root: Record<string, unknown>): { onLight?: string; onDark?: string } {
  const logo = isObject(root.logo) ? root.logo : {};
  return { onLight: text(logo.onLight), onDark: text(logo.onDark) };
}
