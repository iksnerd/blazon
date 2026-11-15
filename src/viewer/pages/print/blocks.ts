import type { Block } from '@/lib/paginate';

/** Elements whose children are the blocks: a page's article and sections, a prose column, a wrapper of sections. */
function isContainer(el: Element): boolean {
  if (el.tagName === 'ARTICLE') return true;
  // A lockup group (the logo-lockups directive) is a block: it is set as it was drawn, a heading and its cards
  if (el.tagName === 'SECTION') return !el.querySelector(':scope > h1') && !el.hasAttribute('data-lockup-group');
  if (el.tagName !== 'DIV') return false;
  // A prose column, a run of Markdown between directives (doc.tsx), a wrapper of assets
  if (el.classList.contains('blazon-prose') || el.hasAttribute('data-print-split')) return true;
  // The groups of a lockup list, which is longer than a slide, go on slides of their own
  if (el.querySelector(':scope > [data-lockup-group]')) return true;
  const kids = [...el.children];
  // A Section's two columns, and Doc's wrapper of Sections
  return el.parentElement?.tagName === 'SECTION' || (kids.length > 0 && kids.every((k) => k.tagName === 'SECTION'));
}

export interface Placed {
  el: HTMLElement;
  /** A piece of a block that was cut by rows: the block it is a copy of, which is what is in the page */
  origin?: HTMLElement;
  kind?: Block['kind'];
  /** A later piece of a cut block (see Block) */
  continued?: boolean;
  figure?: boolean;
  table?: boolean;
  lead?: boolean;
}

/** A block that shows something rather than says it: a picture, a drawing, an asset, or a directive's cards. */
function isFigure(el: HTMLElement): boolean {
  return el.matches('figure, img, svg, [data-section-asset], .not-prose') || el.querySelector('img, svg, figure, canvas') !== null;
}

/**
 * The blocks of a chapter, in order: its opener (a page's title band, or a token page's header), which opens a slide,
 * then the headings, prose and figures of its sections, which share slides.
 */
export function printBlocks(root: Element): Placed[] {
  const out: Placed[] = [];
  const walk = (el: Element, opens: boolean) => {
    let first = opens;
    for (const child of el.children) {
      if (
        !(child instanceof HTMLElement) ||
        child.tagName === 'FOOTER' ||
        child.tagName === 'STYLE' ||
        child.hasAttribute('data-print-chapter-title') ||
        child.hasAttribute('data-section-index')
      )
        continue;
      if (isContainer(child)) {
        const before = out.length;
        walk(child, first);
        if (out.length > before) first = false;
        continue;
      }
      const titled = child.tagName === 'HEADER' || (child.tagName === 'SECTION' && child.querySelector(':scope > h1'));
      const kind = titled ? 'opener' : first ? 'section' : /^H[2-6]$/.test(child.tagName) ? 'heading' : undefined;
      const table = child.tagName === 'TABLE' || child.querySelector(':scope > table') !== null;
      out.push({ el: child, ...(kind && { kind }), ...(isFigure(child) && { figure: true }), ...(table && { table: true }), ...(child.tagName === 'P' && { lead: true }) });
      first = false;
    }
  };
  walk(root, true);
  return out;
}

/**
 * Each block's height with the space around it: from its top to the next block's top, and for the last, to the
 * chapter's bottom. Section padding and gaps then count, and packing by these heights does not overflow a slide.
 */
export function measured(blocks: Placed[], chapter: HTMLElement): number[] {
  const tops = blocks.map((b) => b.el.getBoundingClientRect().top);
  const bottom = chapter.getBoundingClientRect().bottom;
  return tops.map((top, i) => Math.max(0, (tops[i + 1] ?? bottom) - top));
}
