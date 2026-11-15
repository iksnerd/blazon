import type { Asset, AssetDimension, AssetFormat, AssetMeta, AssetRules, TokenItem } from '../../../types/index.js';
import { dimensionText, describeMeasure } from '../logo-geometry';

export function humanize(segment: string): string {
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parentOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf('.')));
}

/** The last path segment, humanized: "color.brand.indigo" -> "Indigo". */
export function lastSegment(path: string): string {
  return humanize(path.split('.').pop() ?? path);
}

export function usageNote(token: TokenItem): string | undefined {
  const usage = token.blazon.usage;
  if (usage?.allow?.length) return `Only for ${usage.allow.join(', ')}`;
  if (usage?.deny?.length) return `Not for ${usage.deny.join(', ')}`;
  return undefined;
}

export function isRamp(tokens: TokenItem[]): boolean {
  const steps = /^(\d+|lightest|lighter|light|base|dark|darker|darkest)$/;
  return tokens.length >= 5 && tokens.every((t) => steps.test(t.name));
}

/** Splits tokens into consecutive blocks under one heading: a ramp's heading is its grandparent group. */
export function colorBlocks(tokens: TokenItem[]): { heading: string; groups: TokenItem[][] }[] {
  const byParent = new Map<string, TokenItem[]>();
  for (const t of tokens) byParent.set(parentOf(t.path), [...(byParent.get(parentOf(t.path)) ?? []), t]);

  const blocks: { heading: string; groups: TokenItem[][] }[] = [];
  for (const [parent, group] of byParent) {
    const heading = isRamp(group) ? parentOf(parent) || parent : parent;
    const last = blocks[blocks.length - 1];
    if (last && last.heading === heading) last.groups.push(group);
    else blocks.push({ heading, groups: [group] });
  }
  return blocks;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

export function firstFamily(stack: string | number | undefined): string {
  return String(stack ?? '')
    .split(',')[0]!
    .replace(/['"]/g, '')
    .trim();
}

/** A label in the deck's own format, e.g. "Inter Semibold 64/72px". */
export function styleLabel(token: TokenItem): string {
  const parts = token.parts ?? {};
  const size = parseFloat(String(parts.fontSize));
  const lineHeight = Number(parts.lineHeight);
  const unit = String(parts.fontSize).replace(/[\d.]/g, '');
  // Line height is a multiplier (DTCG), so size × multiplier needs rounding back to the authored px value.
  const leading = Number.isFinite(size * lineHeight) ? `/${Math.round(size * lineHeight * 10) / 10}` : '';
  return `${firstFamily(parts.fontFamily)} ${WEIGHT_NAMES[Number(parts.fontWeight)] ?? parts.fontWeight} ${size}${leading}${unit}`;
}

export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function assetMeta(asset: Asset): string {
  const size = asset.width && asset.height ? `${asset.width} × ${asset.height}` : '';
  return [asset.format.toUpperCase(), size, fileSize(asset.bytes)].filter(Boolean).join(', ');
}

/** "width 90px", or "height 20px" when only a height is stated. */
export function sizeText(size: { width?: AssetDimension; height?: AssetDimension }): string {
  return size.width ? `width ${dimensionText(size.width)}` : `height ${dimensionText(size.height!)}`;
}

/** "Below width 30px, use Small mark": the asset a sidecar says to use instead under a size, named by `titleOf`, or by its id. */
export function replacementText(rule: NonNullable<AssetMeta['replacedBelow']>, titleOf: (id: string) => string | undefined = () => undefined): string {
  return `Below ${sizeText(rule)}, use ${titleOf(rule.by) ?? rule.by}`;
}

/** What the asset's sidecar says to do with it, as short phrases: "For dark backgrounds", "Clear space 20px". */
export function assetRules(asset: Asset): string[] {
  const meta = asset.meta;
  if (!meta) return [];
  const { width, height } = meta.minSize ?? {};
  return [
    meta.background && `For ${meta.background} backgrounds`,
    meta.lockup && `${meta.lockup[0]!.toUpperCase()}${meta.lockup.slice(1)} lockup`,
    meta.clearSpace && `Clear space ${describeMeasure(meta.clearSpace, meta)}`,
    width && `Min width ${dimensionText(width)}`,
    height && `Min height ${dimensionText(height)}`,
    meta.maxSize?.width && `Max width ${dimensionText(meta.maxSize.width)}`,
    meta.maxSize?.height && `Max height ${dimensionText(meta.maxSize.height)}`,
    meta.replacedBelow && replacementText(meta.replacedBelow),
    meta.description,
  ].filter((rule): rule is string => Boolean(rule));
}

const FORMAT_NAMES: Record<AssetFormat, string> = { svg: 'SVG', png: 'PNG', jpg: 'JPG', gif: 'GIF', webp: 'WebP', avif: 'AVIF' };

/** "a", "a or b", "a, b or c" */
function either(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/**
 * What a category asks of its files, as one sentence for the asset page: "Files: WebP or JPG, at least
 * 1600px wide, 16:9." Undefined when the config sets no rules.
 */
export function rulesLine(rules: AssetRules | undefined): string | undefined {
  if (!rules) return undefined;
  const { width, height } = rules.minPixels ?? {};
  const size = width && height ? `at least ${width} × ${height}px` : width ? `at least ${width}px wide` : height ? `at least ${height}px tall` : undefined;
  const parts = [rules.formats?.length && either(rules.formats.map((f) => FORMAT_NAMES[f])), size, rules.aspectRatios?.length && either(rules.aspectRatios)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? `Files: ${parts.join(', ')}.` : undefined;
}
