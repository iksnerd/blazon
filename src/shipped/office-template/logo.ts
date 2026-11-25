import { dimensionToPx, measurePx } from '../../core/assets/measure.js';
import { findByFile } from '../../core/assets/representations.js';
import { bestOf, judgeLogos, ratioOnColor, type Candidate } from '../../core/logo/judge.js';
import { parseColor as parseCore } from '../../core/checker/contrast.js';
import { luminance, parseColor } from '../shared/color.js';
import type { BrandRead, LogoAsset } from './brand.js';
import { finding, type Finding, type Options } from './options.js';

// Which logo goes on which surface, and how large it is drawn. The sizes come from the logo's sidecar: its `minSize` and `maxSize` bound
// the width, and its `clearSpace` is kept free on every side. (core/logo/lockup.ts lays a logo out beside a partner's; there is no
// partner here, so what this needs of the core is `measurePx`, which reads a sidecar measure in the artwork's pixels.)

export const EMU_PER_PX = 9525;
/** The share of the logo's height kept clear when its sidecar states no clear space */
export const DEFAULT_CLEAR = 0.25;

export type Surface = 'light' | 'dark';

/** The surface a logo is made for: its sidecar says; without that, brand.json's own pairing, and else light. */
export function madeFor(asset: LogoAsset, brand: Pick<BrandRead, 'logo'>): Surface {
  return asset.meta.background ?? (asset.file === brand.logo.onDark ? 'dark' : 'light');
}

/** The logo for each kind of surface: the one `logo` names first, then the pair brand.json names, then the logos folder. */
export function chooseLogos(brand: BrandRead, options: Pick<Options, 'logo'>): { light?: LogoAsset; dark?: LogoAsset } {
  const byFile = (file?: string) => (file ? findByFile(brand.files, file) : undefined);
  const pool = [
    options.logo ? brand.assets.get(options.logo) : undefined,
    byFile(brand.logo.onLight),
    byFile(brand.logo.onDark),
    ...[...brand.assets.values()].filter((asset) => asset.id.startsWith('logos/')),
  ].filter((asset): asset is LogoAsset => asset !== undefined);
  return { light: pool.find((asset) => madeFor(asset, brand) === 'light'), dark: pool.find((asset) => madeFor(asset, brand) === 'dark') };
}

/** The logo each surface gets once the brand's `logo.deny` is read: `null` is none, and a surface not in the object keeps `chooseLogos`' pick */
export type SurfaceLogos = Partial<Record<'primary' | 'inverse', LogoAsset | null>>;

const SURFACE_ROLE = { primary: 'background', inverse: 'inverse' } as const;
/** Below this luminance a surface is dark, as `planLayouts` judges it */
const DARK_BELOW = 0.4;

/**
 * Applies the brand's `logo.deny` to the surfaces the template draws (`theme.tokens`: background and inverse), with core's `judgeLogos`, the deny
 * and bar `pickLogo` applies. A surface whose token denies no candidate keeps what `chooseLogos` picked. One that does gets the highest-ratio candidate
 * that is allowed and reaches its bar (the logo made for the surface wins a tie), or none, with a finding. That choice is not `pickLogo`'s
 * inked-first order.
 */
export function logosBySurface(brand: BrandRead, chosen: { light?: LogoAsset; dark?: LogoAsset }): { logos: SurfaceLogos; findings: Finding[] } {
  const logos: SurfaceLogos = {};
  const findings: Finding[] = [];
  const pool = [...new Set([chosen.light, chosen.dark, ...[...brand.assets.values()].filter((asset) => asset.id.startsWith('logos/'))])].filter(
    (a): a is LogoAsset => a !== undefined,
  );
  for (const surface of ['primary', 'inverse'] as const) {
    const path = brand.surfaceTokens[SURFACE_ROLE[surface]];
    const background = path ? brand.items.find((item) => item.path === path) : undefined;
    const css = background && typeof background.value === 'string' ? background.value : undefined;
    const bg = css ? parseCore(css) : undefined;
    const rgb = css ? parseColor(css) : undefined;
    if (!background || !bg || !rgb) continue;
    const dark = luminance(rgb) < DARK_BELOW;
    const candidates: Candidate[] = pool.flatMap((asset): Candidate[] => {
      const made = madeFor(asset, brand);
      const variant = asset.file === brand.logo.onLight ? 'onLight' : asset.file === brand.logo.onDark ? 'onDark' : undefined;
      const ink = asset.meta.ink ?? (made === 'dark' ? '#ffffff' : '#000000');
      return [{ file: asset.file, asset: asset.id, names: variant ? [variant, asset.id] : [asset.id], ink, configured: made === (dark ? 'dark' : 'light') }];
    });
    const judged = judgeLogos({ background, items: brand.items, ratioOn: ratioOnColor(bg), candidates, colorways: [] });
    if (judged.denied.length === 0) continue;
    const winner = bestOf(judged.chosen);
    logos[surface] = winner ? (pool.find((asset) => asset.id === winner.asset) ?? null) : null;
    const [first] = judged.denied;
    const said = `${first!.from} forbids ${first!.name}${first!.reason ? ` (${first!.reason})` : ''}`;
    findings.push(
      finding(
        'logo-denied',
        'warning',
        path!,
        winner ? `${said}, so the ${surface} surface uses ${winner.asset}` : `${said} and no other logo is allowed and reads there, so the ${surface} surface carries none`,
      ),
    );
  }
  return { logos, findings };
}

export interface Placed {
  /** EMU */
  width: number;
  height: number;
  /** The clear space on every side, in EMU */
  clear: number;
  /** True when the sidecar states none and a share of the height was used */
  defaulted: boolean;
}

/** The logo drawn about `target` EMU wide, held between its sidecar's smallest and largest size, with its clear space. Undefined without a size. */
export function sizeLogo(asset: LogoAsset, target: number): Placed | undefined {
  if (!asset.size) return undefined;
  const { width: w0, height: h0 } = asset.size;
  const { minSize, maxSize } = asset.meta;
  let width = target;
  const limit = (size: { width?: { value: number; unit: 'px' | 'rem' }; height?: { value: number; unit: 'px' | 'rem' } } | undefined, direction: 'min' | 'max') => {
    if (!size) return;
    const bounds = [size.width && dimensionToPx(size.width) * EMU_PER_PX, size.height && (dimensionToPx(size.height) * EMU_PER_PX * w0) / h0].filter(
      (bound): bound is number => !!bound,
    );
    for (const bound of bounds) width = direction === 'min' ? Math.max(width, bound) : Math.min(width, bound);
  };
  limit(maxSize, 'max');
  limit(minSize, 'min');
  width = Math.round(width);
  const clearPx = asset.meta.clearSpace ? measurePx(asset.meta.clearSpace, asset.meta) : undefined;
  const defaulted = !(clearPx !== undefined && clearPx > 0);
  return { width, height: Math.round((width * h0) / w0), clear: Math.round((defaulted ? h0 * DEFAULT_CLEAR : clearPx!) * (width / w0)), defaulted };
}

/** The findings for a logo that cannot be placed as the sidecar says */
export function logoFindings(brand: BrandRead, logos: { light?: LogoAsset; dark?: LogoAsset }): Finding[] {
  const out: Finding[] = [];
  if (!logos.light && !logos.dark) return [finding('logo-none', 'warning', 'assets', 'the brand has no logo asset, so the template carries none')];
  if (!logos.light) out.push(finding('logo-no-variant', 'warning', 'logo', 'no logo is made for a light surface, so the content layouts carry none'));
  if (!logos.dark) out.push(finding('logo-no-variant', 'warning', 'logo', 'no logo is made for a dark surface, so the cover and the closing layout carry none'));
  for (const asset of new Set([logos.light, logos.dark])) {
    if (!asset) continue;
    if (!asset.size) out.push(finding('logo-no-size', 'warning', asset.id, `${asset.id} does not give its width and height, so it cannot be placed`));
    else if (sizeLogo(asset, 1)!.defaulted)
      out.push(finding('logo-no-clear-space', 'warning', asset.id, `${asset.id} states no clear space in its sidecar, so a quarter of its height is kept clear`));
  }
  void brand;
  return out;
}
