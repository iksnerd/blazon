import type { LogoAsset } from './brand.js';
import { luminance, parseColor } from '../shared/color.js';
import { sizeLogo, type Placed, type SurfaceLogos } from './logo.js';
import type { Palette, Slot } from './palette.js';
import { MARGIN as DECK_MARGIN, PAGE as DECK_PAGE } from '../brand-deck/plan/constants.js';

// The master and the five layouts as plain data: where each placeholder and the logo go, in EMU on a 13.333 x 7.5 inch slide. The
// geometry follows the logo's clear space: no placeholder reaches into it. ooxml.ts writes this as XML.

export const W = 12192000;
export const H = 6858000;
export const INCH = 914400;
const inches = (n: number) => Math.round(n * INCH);
/** The side margin of the brand's deck (blazon.brand-deck, 56 of 960 points), as the same share of this slide's width, so a template and a deck made from one brand agree */
export const MARGIN = Math.round((W * DECK_MARGIN) / DECK_PAGE.width);

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Kind = 'ctrTitle' | 'subTitle' | 'title' | 'body' | 'content' | 'sldNum';

export interface PlaceholderPlan {
  name: string;
  kind: Kind;
  /** The idx a placeholder of its own gets, which a slide matches it by */
  idx?: number;
  half?: boolean;
  box: Box;
  prompt: string;
  /** Points */
  size?: number;
  anchor?: 'b' | 't' | 'ctr';
  /** Text with no bullet, for a subtitle or a line under a title */
  plain?: boolean;
}

export interface LogoPlan {
  asset: LogoAsset;
  box: Box;
  /** The clear space kept free on every side, in EMU */
  clear: number;
}

export type Surface = 'primary' | 'inverse';

export interface LayoutPlan {
  name: string;
  type: 'title' | 'secHead' | 'obj' | 'twoObj';
  surface: Surface;
  /** False for a layout that has its own logo and none of the master's */
  showMaster: boolean;
  placeholders: PlaceholderPlan[];
  logo?: LogoPlan;
  /** A bar of the accent color above the title, for the section divider */
  accentBar?: Box;
  /** What the sample slide of the .pptx says in each placeholder, by name */
  sample: Record<string, string[]>;
}

export interface MasterPlan {
  placeholders: PlaceholderPlan[];
  logo?: LogoPlan;
}

export interface Plan {
  master: MasterPlan;
  layouts: LayoutPlan[];
  /** Where the logo of the master is, as the content layouts see it */
  surfaces: Record<Surface, { background: Slot; text: Slot }>;
}

const grow = (box: Box, by: number): Box => ({ x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by });
/** True when the two boxes share any area */
export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** The logo and its clear space as one box: where nothing else may go */
export const keepOut = (logo: LogoPlan): Box => grow(logo.box, logo.clear);

const EDGE = inches(0.4);

function placeLogo(asset: LogoAsset | undefined, target: number, where: (placed: Placed) => { x: number; y: number }): LogoPlan | undefined {
  const placed = asset && sizeLogo(asset, target);
  if (!asset || !placed) return undefined;
  const { x, y } = where(placed);
  return { asset, box: { x, y, width: placed.width, height: placed.height }, clear: placed.clear };
}

/** The master and layouts for a palette and the logos to place. A surface is dark when its color is, and gets the logo made for dark. */
export function planLayouts(palette: Palette, logos: { light?: LogoAsset; dark?: LogoAsset }, bySurface: SurfaceLogos = {}): Plan {
  const luminanceOf = (slot: Slot): number => luminance(parseColor(`#${palette[slot]}`)!);
  const bgSlot = palette.slots.background;
  const textSlot = palette.slots.text;
  const invSlot = palette.slots.inverse;
  // The text on the inverse surface: whichever of the two main slots is further from it in lightness
  const onInverse: Slot = Math.abs(luminanceOf('dk1') - luminanceOf(invSlot)) > Math.abs(luminanceOf('lt1') - luminanceOf(invSlot)) ? 'dk1' : 'lt1';
  // A logo made for a dark surface goes where the surface is dark, and the same for a light one
  const darkSurface = (surface: Surface) => luminanceOf(surface === 'primary' ? bgSlot : invSlot) < 0.4;
  const logoFor = (surface: Surface) => {
    const decided = bySurface[surface];
    return decided === undefined ? (darkSurface(surface) ? logos.dark : logos.light) : (decided ?? undefined);
  };

  const content = W - 2 * MARGIN;
  // The master: a logo at the foot, left, and the slide number at the right
  const masterLogo = placeLogo(logoFor('primary'), inches(1.3), (p) => ({ x: Math.max(MARGIN, p.clear), y: H - Math.max(EDGE, p.clear) - p.height }));
  const footTop = masterLogo ? keepOut(masterLogo).y : H - inches(0.8);
  const bodyBottom = Math.min(footTop, H - inches(0.8)) - inches(0.1);
  const titleBox: Box = { x: MARGIN, y: inches(0.5), width: content, height: inches(1.1) };
  const bodyBox: Box = { x: MARGIN, y: inches(1.8), width: content, height: bodyBottom - inches(1.8) };
  const numBox: Box = { x: W - MARGIN - inches(1), y: H - inches(0.7), width: inches(1), height: inches(0.3) };
  const num = (idx: number): PlaceholderPlan => ({ name: 'Slide Number', kind: 'sldNum', idx, box: numBox, prompt: '', size: 10 });

  const master: MasterPlan = {
    placeholders: [
      { name: 'Title', kind: 'title', box: titleBox, prompt: 'Click to edit Master title style', size: 40, anchor: 'b' },
      { name: 'Body', kind: 'body', idx: 1, box: bodyBox, prompt: 'Click to edit Master text styles', size: 20 },
      num(4),
    ],
    ...(masterLogo && { logo: masterLogo }),
  };

  // The cover: the logo at the top left, large; the title below it and its clear space
  const coverLogo = placeLogo(logoFor('inverse'), inches(2.4), (p) => ({ x: Math.max(MARGIN, p.clear), y: Math.max(inches(0.5), p.clear) }));
  const coverTop = Math.max(inches(2.4), coverLogo ? keepOut(coverLogo).y + keepOut(coverLogo).height : 0);
  const closingLogo = placeLogo(logoFor('inverse'), inches(2), (p) => ({ x: Math.max(MARGIN, p.clear), y: H - Math.max(inches(0.6), p.clear) - p.height }));
  const closingBottom = closingLogo ? keepOut(closingLogo).y : H - inches(0.6);

  const half = Math.round((content - inches(0.4)) / 2);
  const layouts: LayoutPlan[] = [
    {
      name: 'Cover',
      type: 'title',
      surface: 'inverse',
      showMaster: false,
      ...(coverLogo && { logo: coverLogo }),
      placeholders: [
        { name: 'Title', kind: 'ctrTitle', box: { x: MARGIN, y: coverTop, width: content, height: inches(1.9) }, prompt: 'Presentation title', size: 60, anchor: 'b' },
        {
          name: 'Subtitle',
          kind: 'subTitle',
          idx: 1,
          box: { x: MARGIN, y: coverTop + inches(2.1), width: content, height: inches(1) },
          prompt: 'Subtitle or date',
          size: 24,
          plain: true,
        },
      ],
      sample: { Title: ['Presentation title'], Subtitle: ['Subtitle or date'] },
    },
    {
      name: 'Section divider',
      type: 'secHead',
      // On the inverse surface like the cover and the closing layout, and so with a logo of its own and none of the master's: the master's is made for the primary surface
      surface: 'inverse',
      showMaster: false,
      ...(closingLogo && { logo: closingLogo }),
      accentBar: { x: MARGIN, y: inches(2.4), width: inches(1.2), height: inches(0.08) },
      placeholders: [
        { name: 'Title', kind: 'title', box: { x: MARGIN, y: inches(2.6), width: content, height: inches(1.6) }, prompt: 'Section title', size: 54, anchor: 'b' },
        { name: 'Text', kind: 'body', idx: 1, box: { x: MARGIN, y: inches(4.4), width: content, height: inches(1) }, prompt: 'A line about this section', size: 20, plain: true },
        num(12),
      ],
      sample: { Title: ['Section title'], Text: ['A line about this section'] },
    },
    {
      name: 'Title and content',
      type: 'obj',
      surface: 'primary',
      showMaster: true,
      placeholders: [
        { name: 'Title', kind: 'title', box: titleBox, prompt: 'Click to edit title', size: 40, anchor: 'b' },
        { name: 'Content', kind: 'content', idx: 1, box: bodyBox, prompt: 'Click to edit text', size: 20 },
        num(12),
      ],
      sample: { Title: ['Title and content'], Content: ['First point', 'Second point', 'Third point'] },
    },
    {
      name: 'Two columns',
      type: 'twoObj',
      surface: 'primary',
      showMaster: true,
      placeholders: [
        { name: 'Title', kind: 'title', box: titleBox, prompt: 'Click to edit title', size: 40, anchor: 'b' },
        { name: 'Left content', kind: 'content', idx: 1, half: true, box: { ...bodyBox, width: half }, prompt: 'Click to edit text', size: 20 },
        { name: 'Right content', kind: 'content', idx: 2, half: true, box: { ...bodyBox, x: MARGIN + half + inches(0.4), width: half }, prompt: 'Click to edit text', size: 20 },
        num(12),
      ],
      sample: { Title: ['Two columns'], 'Left content': ['Before', 'The old way'], 'Right content': ['After', 'The new way'] },
    },
    {
      name: 'Closing',
      type: 'obj',
      surface: 'inverse',
      showMaster: false,
      ...(closingLogo && { logo: closingLogo }),
      placeholders: [
        { name: 'Title', kind: 'title', box: { x: MARGIN, y: inches(2.4), width: content, height: inches(1.5) }, prompt: 'Thank you', size: 60, anchor: 'b' },
        {
          name: 'Contact',
          kind: 'content',
          idx: 1,
          box: { x: MARGIN, y: inches(4.1), width: content, height: Math.max(inches(0.6), Math.min(inches(1.2), closingBottom - inches(4.1))) },
          prompt: 'Name, address, link',
          size: 20,
          plain: true,
        },
      ],
      sample: { Title: ['Thank you'], Contact: ['name@example.com'] },
    },
  ];
  return { master, layouts, surfaces: { primary: { background: bgSlot, text: textSlot }, inverse: { background: invSlot, text: onInverse } } };
}
