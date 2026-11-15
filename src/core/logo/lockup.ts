import type { AssetMeta } from '../../types/index.js';
import { measurePx } from '../assets/measure.js';

// How a logo sits beside a partner's, from the `partnership` rule in the logo's sidecar. One place computes it, so the brand book's
// figure (the viewer) and the files blazon.logo-kit writes can never disagree.

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

export interface PartnershipLayout {
  /** The whole row, in the logo's own pixels */
  width: number;
  height: number;
  logo: Box;
  partner: Box;
  /** A partnership with no divider has none: one gap sits between the logos */
  divider?: { x: number; y1: number; y2: number; stroke: number };
}

export interface InitiativeLayout {
  width: number;
  height: number;
  logo: Box;
  mark: Box;
}

/** The divider's weight: a brand states where the line goes and how tall it is, rarely how thick. It is 1% of the logo's height, 1px at least. */
export const dividerStroke = (logoHeight: number): number => Math.max(1, logoHeight / 100);

/**
 * The logo and a partner's side by side, divided by a vertical line, on one baseline. The gap on each side of the line and the line's
 * height come from the rule; the line is centered on the row. The partner is as tall as the rule's `partnerHeight`, or as tall as the
 * logo when it states none. Undefined when the logo states no partnership.
 */
export function planPartnership(logo: { size: Size; meta: Pick<AssetMeta, 'unit' | 'partnership'> }, partner: { size: Size }): PartnershipLayout | undefined {
  const rule = logo.meta.partnership;
  if (!rule) return undefined;
  const gap = measurePx(rule.gap, logo.meta) ?? 0;
  const dividerHeight = rule.dividerHeight ? (measurePx(rule.dividerHeight, logo.meta) ?? logo.size.height) : 0;
  const partnerHeight = (rule.partnerHeight && measurePx(rule.partnerHeight, logo.meta)) || logo.size.height;
  const partnerWidth = (partner.size.width * partnerHeight) / partner.size.height;
  const height = Math.max(logo.size.height, dividerHeight, partnerHeight);
  const stroke = rule.dividerHeight ? dividerStroke(logo.size.height) : 0;
  const partnerX = rule.dividerHeight ? logo.size.width + gap + stroke + gap : logo.size.width + gap;
  const dividerX = logo.size.width + gap + stroke / 2;
  return {
    width: partnerX + partnerWidth,
    height,
    logo: { x: 0, y: height - logo.size.height, ...logo.size },
    partner: { x: partnerX, y: height - partnerHeight, width: partnerWidth, height: partnerHeight },
    ...(rule.dividerHeight && { divider: { x: dividerX, y1: (height - dividerHeight) / 2, y2: (height + dividerHeight) / 2, stroke } }),
  };
}

/**
 * The logo and the artwork of a program it runs. Beside, the mark sits one gap to the right and both stand on one baseline; below, the
 * mark sits one gap under the logo with their left edges aligned. The mark is as tall as `markHeight`, or as tall as the logo when the
 * rule states none. Undefined when the logo states no initiative.
 */
export function planInitiative(logo: { size: Size; meta: Pick<AssetMeta, 'unit' | 'initiative'> }, mark: { size: Size }): InitiativeLayout | undefined {
  const rule = logo.meta.initiative;
  if (!rule) return undefined;
  const gap = measurePx(rule.gap, logo.meta) ?? 0;
  const markHeight = (rule.markHeight && measurePx(rule.markHeight, logo.meta)) || logo.size.height;
  const markWidth = (mark.size.width * markHeight) / mark.size.height;
  if (rule.position === 'below') {
    return {
      width: Math.max(logo.size.width, markWidth),
      height: logo.size.height + gap + markHeight,
      logo: { x: 0, y: 0, ...logo.size },
      mark: { x: 0, y: logo.size.height + gap, width: markWidth, height: markHeight },
    };
  }
  const height = Math.max(logo.size.height, markHeight);
  return {
    width: logo.size.width + gap + markWidth,
    height,
    logo: { x: 0, y: height - logo.size.height, ...logo.size },
    mark: { x: logo.size.width + gap, y: height - markHeight, width: markWidth, height: markHeight },
  };
}
