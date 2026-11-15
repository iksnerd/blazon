import { useEffect, useRef, useState } from 'react';
import type { BlazonData } from '../../../types/index.js';
import { isDarkBackground, logoOn } from '@/lib/brand';
import type { Favicons } from '@/lib/favicons';
import { pairIntros, paginate, type Block } from '@/lib/paginate';
import type { Mode } from '@/lib/theme/theme';
import { printBlocks, measured } from './blocks';
import { printChapters } from './chapters';
import { printCss } from './css';
import { fit, footer, frame, slackOf } from './frames';
import { cut } from './split';
import { packContents, linesOf } from './contents';
import { CONTENTS_COLUMN_WIDTH, CONTENTS_COLUMNS, CONTENTS_GAP, firstChapterPage, ROOM } from './geometry';
import { pageId, pageLinks } from './links';
import { settled } from './settle';

export { printBlocks } from './blocks';
export { printChapters } from './chapters';
export { SLIDE } from './geometry';

/**
 * The print book: the brand book as one document of chapters, which the blazon.print-book plugin prints in a headless
 * browser. `#print` is every guideline page, `#print/essentials` the logo, color and typography pages,
 * `#print/reference` the token pages, and `#print/pages=a,b` the chapters named, in that order. A site that has the
 * blazon.favicons plugin's copy adds a Favicons chapter (`favicons`) to the full book and to `pages=`.
 */

/**
 * `favicons` is undefined until the viewer has asked the site for the plugin's copy, then the data or null. The book is
 * not laid out before that, so the chapter is in it (or not) before it is measured, and `ready` is not set early.
 */
export function PrintBook({
  data,
  view,
  mode,
  selection,
  title: bookTitle,
  subtitle,
  favicons,
}: {
  data: BlazonData;
  view: BlazonData;
  mode: Mode;
  selection: string;
  /** Replaces the brand's title on the cover and in every footer; the brand's own when absent */
  title?: string;
  /** Replaces the line under the cover's title (the brand's description); the description when absent */
  subtitle?: string;
  favicons: Favicons | null | undefined;
}) {
  const heading = bookTitle ?? data.title;
  const line = subtitle ?? data.description;
  const chapters = printChapters(selection, data, view, mode, favicons);
  // The contents entries are measured once the fonts are in: a title that does not fit a column wraps, and counts as the lines it takes
  const titles = chapters.map((chapter) => chapter.title);
  const key = titles.join('\n');
  const [measure, setMeasure] = useState<{ key: string; lines: number[] }>();
  const lines = measure?.key === key ? measure.lines : titles.map(() => 1);
  const plan = packContents(lines);
  const firstPage = firstChapterPage(plan.length);
  const probe = useRef<HTMLOListElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([]);

  // How many lines each title takes in a column, from entries set as they are on the slide (a page number as wide as the widest)
  useEffect(() => {
    let cancelled = false;
    void settled(probe.current!).then(() => {
      if (cancelled || !probe.current) return;
      const [one, two, ...rest] = [...probe.current.children].map((li) => li.getBoundingClientRect().height);
      setMeasure({ key, lines: linesOf(rest, one!, two!) });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Measure each chapter's blocks, pack them into slides, and build a frame per slide from copies of its blocks
  useEffect(() => {
    let cancelled = false;
    delete window.__blazonPrint;
    if (favicons === undefined || measure?.key !== key) return;
    void settled(flow.current!).then(async () => {
      if (cancelled || !flow.current || !deck.current) return;
      const first: number[] = [];
      const frames: HTMLElement[] = [];
      const headingPage = new Map<string, number>();
      const chapterPage = new Map<string, number>();
      for (const chapter of flow.current.querySelectorAll<HTMLElement>('[data-print-chapter]')) {
        // A table or a grid too tall for a slide is cut by rows into pieces that each fit one, rather than drawn smaller
        const placed = printBlocks(chapter);
        const { blocks, heights } = cut(placed, measured(placed, chapter), ROOM);
        const measuredBlocks = blocks.map((b, i): Block => ({
          height: heights[i]!,
          ...(b.kind && { kind: b.kind }),
          ...(b.figure && { figure: true }),
          ...(b.table && { table: true }),
          ...(b.lead && { lead: true }),
          ...(b.continued && { continued: true }),
          ...(b.figure && slackOf(b.el) > 0 && { slack: slackOf(b.el) }),
        }));
        const slides = pairIntros(paginate(measuredBlocks, ROOM), measuredBlocks, ROOM);
        first.push(firstPage + frames.length);
        chapterPage.set(chapter.dataset.printChapter!, firstPage + frames.length);
        // The page each section of the chapter starts on, by its id: the section's own element is not printed (its blocks are), so
        // the page is the one its first block is on
        for (const section of chapter.querySelectorAll<HTMLElement>('section[id]')) {
          const at = blocks.findIndex((b) => section.contains(b.origin ?? b.el));
          const slide = slides.findIndex((s) => s.blocks.includes(at));
          if (at >= 0 && slide >= 0) headingPage.set(`${chapter.dataset.printChapter}#${section.id}`, firstPage + frames.length + slide);
        }
        for (const slide of slides) {
          const kind = blocks[slide.blocks[0]!]!.kind === 'opener' ? 'opener' : 'content';
          const built = frame(
            kind,
            slide.blocks.map((i) => blocks[i]!.el),
            slide.layout,
            slide.squeeze,
          );
          if (kind === 'content') built.append(footer(heading, firstPage + frames.length));
          frames.push(built);
        }
      }
      // A link to another page of the book becomes a jump to the page and the page number after its words, before the frames are
      // fitted, since the added words take room
      frames.forEach((built, index) => void (built.id = pageId(firstPage + index)));
      for (const built of frames) pageLinks(built, window.location.origin, { chapterPage, headingPage });
      deck.current.replaceChildren(...frames);
      await settled(deck.current);
      if (cancelled) return;
      frames.forEach(fit);
      setStarts(first);
      window.__blazonPrint = {
        ready: true,
        pages: firstPage - 1 + frames.length,
        clipped: frames.flatMap((f, i) => (f.dataset.printClipped !== undefined ? [firstPage + i] : [])),
      };
    });
    return () => {
      cancelled = true;
    };
  }, [selection, favicons, heading, firstPage, measure, key]);

  // The logo made for the cover's ground (the inverse role), as a deck's title slide carries it; a brand with one logo
  // gets that one
  const ground = isDarkBackground(data.theme.inverse, data.theme.inverseText) ? 'dark' : 'light';
  const coverLogo = logoOn(data, data.theme.inverse, ground === 'dark');

  return (
    <main data-print-book="" className="bg-background text-foreground">
      <style>{printCss()}</style>
      <div data-print-slide="cover" className="flex flex-col justify-end gap-6 bg-[var(--blazon-inverse)] p-20 text-[var(--blazon-inverse-text)]">
        {coverLogo && <img data-print-cover-logo="" className="mb-auto h-12 w-auto self-start" src={coverLogo} alt="" />}
        <h1 className="font-heading text-[96px] leading-[0.95] font-semibold tracking-[-0.035em]">{heading}</h1>
        {line && <p className="max-w-3xl text-xl opacity-80">{line}</p>}
      </div>
      {plan.map((columns, n) => (
        <div key={n} data-print-slide="contents" data-print-contents="">
          <h2 className="mb-8">{n === 0 ? 'Contents' : 'Contents (continued)'}</h2>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${CONTENTS_COLUMNS}, minmax(0, 1fr))`, columnGap: CONTENTS_GAP }}>
            {columns.map(([from, to]) => (
              <ol key={from} className="flex flex-col gap-y-2">
                {chapters.slice(from, to).map((chapter, offset) => (
                  <li key={chapter.id} data-chapter={chapter.id} className="flex items-start justify-between gap-6 border-b py-1 text-lg">
                    <span data-title="" className="min-w-0 [overflow-wrap:anywhere]">
                      {chapter.title}
                    </span>
                    {starts[from + offset] !== undefined && (
                      <span data-page="" className="flex-none whitespace-nowrap">
                        {starts[from + offset]}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ))}
          </div>
          <div data-print-footer="">
            <span>{heading}</span>
            <span>{2 + n}</span>
          </div>
        </div>
      ))}
      {/* Off the page: the entries as they are set on a slide, to count the lines each title takes. The first two are a one-line and a two-line entry, for the height of a line */}
      <ol ref={probe} aria-hidden="true" data-print-probe="" className="flex flex-col" style={{ position: 'absolute', left: -100000, top: 0, width: CONTENTS_COLUMN_WIDTH }}>
        {['M', 'M\nM', ...titles].map((title, i) => (
          <li key={i} className="flex items-start justify-between gap-6 border-b py-1 text-lg">
            <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{title}</span>
            <span className="flex-none whitespace-nowrap">9999</span>
          </li>
        ))}
      </ol>
      {/* The frames, built from the measured chapters once they are laid out; React renders nothing in here */}
      <div ref={deck} data-print-deck="" />
      <div ref={flow} data-print-flow="" aria-hidden="true">
        {chapters.map((chapter) => (
          <section key={chapter.id} data-print-chapter={chapter.id}>
            <h2 data-print-chapter-title="" className="sr-only">
              {chapter.title}
            </h2>
            {chapter.body()}
          </section>
        ))}
      </div>
    </main>
  );
}
