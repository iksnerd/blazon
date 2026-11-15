import { measurePx } from '../../core/assets/measure.js';
import { planInitiative, planPartnership, type InitiativeLayout, type PartnershipLayout, type Size } from '../../core/logo/lockup.js';
import type { BrandRead, KitAsset } from './brand.js';
import { finding, type Finding, type Options } from './options.js';

// What the kit draws, decided before anything is read or drawn: a partnership lockup for each logo that states a `partnership` rule and
// each partner, and a clear-space sheet for each logo that states a `clearSpace`. The layout of a lockup is core/logo/lockup.ts, the
// one the brand book's own figure uses.

export interface PartnershipPiece {
  kind: 'partnership';
  /** The file name without its extension */
  stem: string;
  logo: KitAsset;
  partner: KitAsset;
  layout: PartnershipLayout;
}

export interface InitiativePiece {
  kind: 'initiative';
  stem: string;
  logo: KitAsset;
  mark: KitAsset;
  /** The program's name, from the sidecar */
  name: string;
  layout: InitiativeLayout;
}

export interface ClearSpacePiece {
  kind: 'clear-space';
  stem: string;
  logo: KitAsset;
  size: Size;
  /** The clear space on each side, in the logo's own pixels */
  space: number;
}

export type Piece = PartnershipPiece | InitiativePiece | ClearSpacePiece;

/** An asset id as a file name part: nothing but letters, digits, dots, hyphens and underscores, so a name cannot leave out_dir. */
export const fileName = (id: string): string => id.replace(/[^A-Za-z0-9._]+/g, '-').replace(/^[-.]+/, '') || 'asset';

export function planPieces(brand: BrandRead, options: Options): { pieces: Piece[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const pieces: Piece[] = [];
  const inCategory = (category: string) => [...brand.assets.values()].filter((asset) => asset.category === category).map((asset) => asset.id);
  const named = options.logos !== undefined;
  const logos = options.logos ?? inCategory('logos');
  const partners = options.partners ?? inCategory('partners');

  for (const id of logos) {
    const logo = brand.assets.get(id)!;
    if (!logo.size) {
      findings.push(finding('no-size', 'warning', logo.id, `${logo.id} has no width and height in its file, so a lockup cannot be laid out`));
      continue;
    }
    const size = logo.size;
    if (logo.meta.partnership) {
      for (const partnerId of partners) {
        const partner = brand.assets.get(partnerId)!;
        if (!partner.size) {
          findings.push(finding('no-size', 'warning', partner.id, `${partner.id} has no width and height in its file, so a lockup cannot be laid out`));
          continue;
        }
        const layout = planPartnership({ size, meta: logo.meta }, { size: partner.size })!;
        pieces.push({ kind: 'partnership', stem: `partnership-${fileName(logo.id)}--${fileName(partner.id)}`, logo, partner, layout });
      }
    } else if (named && partners.length > 0) {
      findings.push(finding('no-partnership-rule', 'warning', logo.id, `${logo.id} states no partnership in its sidecar, so no lockup is drawn for it`));
    }
    const initiative = logo.meta.initiative;
    if (initiative) {
      const mark = brand.assets.get(initiative.mark);
      if (!mark) {
        findings.push(finding('initiative-mark-missing', 'warning', logo.id, `${logo.id} names ${initiative.mark} as its initiative mark, which the brand has no asset for`));
      } else if (!mark.size) {
        findings.push(finding('no-size', 'warning', mark.id, `${mark.id} has no width and height in its file, so a lockup cannot be laid out`));
      } else {
        const layout = planInitiative({ size, meta: logo.meta }, { size: mark.size })!;
        pieces.push({ kind: 'initiative', stem: `initiative-${fileName(logo.id)}--${fileName(mark.id)}`, logo, mark, name: initiative.name, layout });
      }
    }
    const space = logo.meta.clearSpace ? measurePx(logo.meta.clearSpace, logo.meta) : undefined;
    if (space !== undefined && space > 0) pieces.push({ kind: 'clear-space', stem: `clear-space-${fileName(logo.id)}`, logo, size, space });
    else if (named) findings.push(finding('no-clear-space', 'warning', logo.id, `${logo.id} states no clear space in its sidecar, so no sheet is drawn for it`));
  }
  if (pieces.length === 0) {
    findings.push(
      finding(
        'nothing-to-draw',
        'warning',
        'options',
        'no logo states a partnership, an initiative or a clear space in its sidecar (or none could be laid out), so the kit is empty',
      ),
    );
  }
  return { pieces, findings };
}
