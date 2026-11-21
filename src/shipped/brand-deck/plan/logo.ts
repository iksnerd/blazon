import { type Brand, dimensionPx, has, isNumber, isObject, measurePx, type Obj } from '../brand.js';
import { pickRepresentation } from '../../../core/assets/representations.js';
import { assetTitle, backgroundOf } from './assets.js';
import { number, textOrNull } from './format.js';
import { type LogoSlide, type Rule } from './types.js';

const UNIT_WORDS = ['unit', 'units'] as const;

const pxText = (px: number): string => `${number(px)}px`;

function sizeText(size: Obj): string {
  return (['width', 'height'] as const)
    .filter((side) => side in size)
    .map((side) => `${side} ${pxText(dimensionPx(size[side]) ?? 0)}`)
    .join(', ');
}

/** The (label, text) lines a logo's sidecar states, and its clear space in artwork pixels. `titleOf` names another asset by its id, for the one to use below a size. */
export function logoRules(meta: Obj, titleOf: (id: string) => string | undefined = () => undefined): { rules: Rule[]; clearPx: number | null } {
  const rules: Rule[] = [];
  let clearPx: number | null = null;
  if ('lockup' in meta) rules.push({ label: 'Lockup', text: String(meta.lockup) });
  if ('clearSpace' in meta) {
    const clear = measurePx(meta.clearSpace, meta);
    const units = isObject(meta.clearSpace) ? meta.clearSpace.units : undefined;
    if (clear !== undefined) {
      clearPx = clear;
      const suffix = isNumber(units) ? ` (${number(units)} ${UNIT_WORDS[units !== 1 ? 1 : 0]})` : '';
      rules.push({ label: 'Clear space', text: pxText(clear) + suffix });
    }
  }
  if (isObject(meta.minSize) && has(meta.minSize)) rules.push({ label: 'Minimum size', text: sizeText(meta.minSize) });
  if (isObject(meta.maxSize) && has(meta.maxSize)) rules.push({ label: 'Maximum size', text: sizeText(meta.maxSize) });
  const replaced = meta.replacedBelow;
  if (isObject(replaced) && has(replaced)) {
    const by = String(replaced.by);
    rules.push({ label: 'Smaller sizes', text: `below ${sizeText(replaced)}, use ${titleOf(by) ?? by}` });
  }
  if (Array.isArray(meta.placement) && meta.placement.length > 0) rules.push({ label: 'Placement', text: meta.placement.join(', ') });
  const partnership = meta.partnership;
  if (isObject(partnership) && has(partnership)) {
    const parts: string[] = [];
    for (const [key, label] of [
      ['gap', 'gap'],
      ['dividerHeight', 'divider height'],
      ['partnerHeight', 'partner height'],
    ] as const) {
      const px = key in partnership ? measurePx(partnership[key], meta) : undefined;
      if (px !== undefined) parts.push(`${label} ${pxText(px)}`);
    }
    if (!('dividerHeight' in partnership)) parts.push('no divider');
    if (parts.length > 0) rules.push({ label: 'Partnership', text: parts.join(', ') });
  }
  const initiative = meta.initiative;
  if (isObject(initiative) && typeof initiative.name === 'string') {
    const gap = measurePx(initiative.gap, meta);
    const parts = [initiative.position === 'below' ? 'mark below the logo' : 'mark beside the logo'];
    if (gap !== undefined) parts.push(`gap ${pxText(gap)}`);
    rules.push({ label: 'Program', text: `${initiative.name}, ${parts.join(', ')}` });
  }
  return { rules, clearPx };
}

export function logoSlides(brand: Brand, skip: readonly string[] = []): LogoSlide[] {
  const titleOf = (id: string) => {
    const asset = pickRepresentation(brand.assets, id);
    return asset ? assetTitle(asset) : undefined;
  };
  const slides: LogoSlide[] = [];
  for (const asset of brand.assets) {
    if (asset.category !== 'logos' || skip.includes('logos')) continue;
    const meta = asset.meta ?? {};
    const { rules, clearPx } = logoRules(meta, titleOf);
    slides.push({
      kind: 'logo',
      title: assetTitle(asset),
      file: asset.file,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      background: backgroundOf(asset),
      note: textOrNull(meta.description),
      rules,
      clear_space_px: clearPx,
    });
  }
  return slides;
}
