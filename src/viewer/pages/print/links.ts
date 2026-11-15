/**
 * A link between two pages of the book, made for paper and for a PDF.
 *
 * In the printed book a link to another page of the same site (`01.2-voice-bg.md`, `04-typography.md#numbers`) has no
 * server to answer it: Chrome writes it into the PDF as an address on the print server (127.0.0.1 and a port that is
 * gone when the PDF is opened), and on paper, in a PowerPoint made from pictures of the pages, or in Keynote it is only
 * underlined text. So each such link is turned into what a printed book has: a jump to the page inside the PDF, and the
 * page number after the words, so a reader holding paper can turn to it. A link to another site is left as it is.
 */

/** The id a printed page carries, as an in-document link can name it. */
export const pageId = (page: number): string => `print-page-${page}`;

export interface LinkTargets {
  /** The page each chapter starts on, by chapter id ("doc/<slug>"). */
  chapterPage: ReadonlyMap<string, number>;
  /** The page a section starts on, by "<chapter id>#<section id>" ("doc/typography#section-numbers-are-the-product"), for a link to a heading. */
  headingPage: ReadonlyMap<string, number>;
}

/** The chapter id a markdown link names: the file name without its folder, number prefix and extension. */
export function chapterOf(path: string): string | null {
  const file = path.split('/').pop() ?? '';
  const match = /^(?:\d+(?:\.\d+)?[-_.])?(.+?)\.(?:md|markdown)$/.exec(file);
  return match ? `doc/${match[1]}` : null;
}

/** Whether a link points at the site the book was printed from (the print server), and not at another site. */
function isOnSite(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

/** The page a link on this site points at, or null when it is not a link to a page of the book (or the page is not in this print). */
export function pageFor(href: string, origin: string, targets: LinkTargets): number | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const fragment = decodeURIComponent(url.hash.slice(1));
  const chapter = chapterOf(url.pathname);
  if (chapter === null) return null;
  // A section's id is "section-" and its heading's slug; a fragment in a Markdown link is the slug
  const section = fragment && (targets.headingPage.get(`${chapter}#section-${fragment}`) ?? targets.headingPage.get(`${chapter}#${fragment}`));
  return section || targets.chapterPage.get(chapter) || null;
}

/** Rewrites the page links inside `root` (the printed frames): a jump to the page, and "p. N" after the text. A link to a file of the site loses its address. Returns how many page links were rewritten. */
export function pageLinks(root: ParentNode, origin: string, targets: LinkTargets): number {
  let done = 0;
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    const page = pageFor(href, origin, targets);
    if (page === null) {
      // A link to a file of the site (an asset) has no server in a PDF either: the words stay, the dead address goes
      if (isOnSite(href, origin)) a.removeAttribute('href');
      continue;
    }
    a.setAttribute('href', `#${pageId(page)}`);
    if (!a.querySelector('[data-print-page-ref]')) {
      const ref = a.ownerDocument.createElement('span');
      ref.dataset.printPageRef = '';
      ref.textContent = `, p. ${page}`;
      a.append(ref);
    }
    done++;
  }
  return done;
}
