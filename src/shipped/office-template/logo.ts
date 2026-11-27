import { dimensionToPx, measurePx } from '../../core/assets/measure.js';
import { findByFile } from '../../core/assets/representations.js';
import { chooseLogo, ratioOnColor, type BarColorway, type Candidate } from '../../core/logo/judge.js';
import { logoDenialUnder } from '../../core/checker/logo-rules.js';
import { inkOf } from '../../core/logo/colorways.js';
import { parseColor as parseCore } from '../../core/checker/contrast.js';
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

/**
 * Applies the brand's `logo.deny` to the surfaces the template draws (`theme.tokens`: background and inverse), with the choice core makes for
 * `blazon logo --on` (`chooseLogo`): the candidates that declare an `ink` come first, the highest ratio winning, a tie to the configured file; else
 * the dark-surface file wherever white reaches the bar and is allowed, else the light-surface one. A surface whose token denies no candidate keeps
 * what `chooseLogos` picked. One that does gets that choice, or none, with a finding.
 */
export function logosBySurface(brand: BrandRead, chosen: { light?: LogoAsset; dark?: LogoAsset }): { logos: SurfaceLogos; findings: Finding[] } {
  const logos: SurfaceLogos = {};
  const findings: Finding[] = [];
  const pool = [...new Set([chosen.light, chosen.dark, ...[...brand.assets.values()].filter((asset) => asset.id.startsWith('logos/'))])].filter(
    (a): a is LogoAsset => a !== undefined,
  );
  // The candidates as core builds them from its data (`logoCandidatesOf`): the two files brand.json names, then the other assets that state an ink
  const configured: Candidate[] = (['onLight', 'onDark'] as const).flatMap((variant): Candidate[] => {
    const file = brand.logo[variant];
    const asset = file ? findByFile(brand.files, file) : undefined;
    if (!asset) return [];
    const ink = asset.meta.ink ?? (variant === 'onLight' ? '#000000' : '#ffffff');
    return [{ file: asset.file, asset: asset.id, names: [variant, asset.id], ink, configured: true, declared: Boolean(asset.meta.ink) }];
  });
  const taken = new Set(configured.map((c) => c.asset));
  const others: Candidate[] = pool.flatMap((asset): Candidate[] => {
    const ink = inkOf(asset);
    return taken.has(asset.id) || !ink ? [] : [{ file: asset.file, asset: asset.id, names: [asset.id], ink, configured: false, declared: Boolean(asset.meta.ink) }];
  });
  const colorways: BarColorway[] = [...brand.assets.values()].flatMap((owner) => (owner.meta.colorways ?? []).map((cw) => ({ ...cw, asset: cw.variant ?? owner.id })));
  for (const surface of ['primary', 'inverse'] as const) {
    const path = brand.surfaceTokens[SURFACE_ROLE[surface]];
    const background = path ? brand.items.find((item) => item.path === path) : undefined;
    const css = background && typeof background.value === 'string' ? background.value : undefined;
    const bg = css ? parseCore(css) : undefined;
    if (!background || !bg) continue;
    const judged = chooseLogo({ background, items: brand.items, ratioOn: ratioOnColor(bg), configured, others, colorways, plain: true });
    // The rule is read on every candidate, not only on the ones the order reaches: a surface whose token forbids any of them is a surface this decides
    const [first] = [...configured, ...others].flatMap((c) => logoDenialUnder(background, brand.items, c.names) ?? []);
    if (!first) continue;
    const winner = judged.winner;
    logos[surface] = winner ? ([...pool, ...brand.files].find((asset) => asset.id === winner.asset) ?? null) : null;
    const said = `${first.path} forbids ${first.name}${first.reason ? ` (${first.reason})` : ''}`;
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
