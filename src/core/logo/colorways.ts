import type { Asset, Finding, LogoColorway, TokenItem } from '../../types/index.js';
import { pickRepresentation } from '../assets/representations.js';
import { CONTRAST_MINIMUM, contrastBetween, parseColor, ratioMessage } from '../checker/contrast.js';
import { finding } from '../checker/catalogue.js';

// The named colorways of a logo (RFC 0001 §10): "Bone on Graphite", a logo variant on a color token, each with the contrast it must reach.
// The ratio is the one `blazon check`, `pairs` and `blazon can` use, so the brand book and the check never disagree.

/** The level a colorway must reach when its sidecar names none. */
export const DEFAULT_COLORWAY_LEVEL = 'AA-large' as const;

export interface ColorwayResult {
  name: string;
  /** The background token's path */
  on: string;
  min: LogoColorway['min'];
  /** The file drawn: the variant the colorway names, picked by the shared rule, or the logo itself */
  variant: Asset;
  /** The background token, when it exists and is a color */
  background?: TokenItem;
  /** The artwork's color as measured: its `ink`, else black on a light-surface logo and white on a dark-surface one */
  ink?: string;
  /** Undefined when the ink or the background cannot be read, or the background is translucent */
  ratio?: number;
  /** Undefined together with `ratio` */
  pass?: boolean;
}

/** The color a logo file is measured as: the ink its sidecar declares, else the one its background implies. Undefined when it states neither. */
export function inkOf(asset: Asset): string | undefined {
  const meta = asset.meta;
  if (meta?.ink) return meta.ink;
  if (meta?.background === 'dark') return '#ffffff';
  if (meta?.background === 'light') return '#000000';
  return undefined;
}

/** The colorways a logo states, each measured. A colorway whose variant names no asset is left out: that is its own error. */
export function colorwayResults(logo: Asset, assets: readonly Asset[], items: readonly TokenItem[]): ColorwayResult[] {
  return (logo.meta?.colorways ?? []).flatMap((colorway): ColorwayResult[] => {
    const variant = colorway.variant === undefined ? logo : pickRepresentation(assets, colorway.variant);
    if (!variant) return [];
    const background = items.find((t) => t.path === colorway.on && t.type === 'color');
    const ink = inkOf(variant);
    const [fg, bg] = [ink ? parseColor(ink) : undefined, background ? parseColor(String(background.value)) : undefined];
    const ratio = fg && bg ? contrastBetween(fg, bg) : undefined;
    return [
      {
        name: colorway.name,
        on: colorway.on,
        min: colorway.min,
        variant,
        ...(background && { background }),
        ...(ink && { ink }),
        ...(ratio !== undefined && { ratio, pass: ratio >= CONTRAST_MINIMUM[colorway.min] }),
      },
    ];
  });
}

/**
 * The findings of every logo's colorways: a variant that names no asset is an error on the sidecar (as `replacedBelow.by` is), a colorway
 * below its level is `contrast-insufficient`, and one that cannot be measured is `contrast-unknown`. A logo id with several files is one logo.
 */
export function colorwayFindings(assets: readonly Asset[], items: readonly TokenItem[], absentLocal: ReadonlySet<string>, unresolved: ReadonlySet<string> = new Set()): Finding[] {
  const seen = new Set<string>();
  return assets.flatMap((asset): Finding[] => {
    if (!asset.meta?.colorways || seen.has(asset.id)) return [];
    seen.add(asset.id);
    const where = `${asset.id}.json`;
    const ids = new Set(assets.map((a) => a.id));
    const findings: Finding[] = [];
    asset.meta.colorways.forEach((colorway, at) => {
      const by = colorway.variant;
      if (by !== undefined && !ids.has(by)) {
        if (!absentLocal.has(by.split('/')[0]!)) findings.push(finding('asset-sidecar-invalid', { path: where, message: `colorways[${at}].variant: no asset at ${by}` }));
        return;
      }
      const result = colorwayResults({ ...asset, meta: { ...asset.meta, colorways: [colorway] } }, assets, items)[0];
      if (!result || unresolved.has(colorway.on)) return;
      if (result.ratio === undefined) {
        const why = !result.background
          ? `{${colorway.on}} is not a color token`
          : !result.ink
            ? `${result.variant.id} declares no ink and no background to judge it by`
            : `{${colorway.on}} is translucent`;
        findings.push(finding('contrast-unknown', { path: where, message: `Cannot measure the colorway "${colorway.name}": ${why}` }));
      } else if (!result.pass) {
        findings.push(
          finding('contrast-insufficient', {
            path: where,
            message: `The colorway "${colorway.name}" (${result.variant.id} on {${colorway.on}}) is ${ratioMessage(result.ratio)}:1; ${colorway.min} needs ${CONTRAST_MINIMUM[colorway.min]}:1`,
          }),
        );
      }
    });
    return findings;
  });
}
