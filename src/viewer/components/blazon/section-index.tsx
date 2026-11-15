import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Entry {
  id: string;
  label: string;
}

/** Below this many sections a page is short enough to scroll. */
const MIN_SECTIONS = 4;

/**
 * The section being read: the last whose top has reached its own scroll margin, which is where a jump to it puts it (the
 * margin clears the bars at the top, so it is the same wherever the index sits), or the last when the page ends.
 */
function current(entries: Entry[]): string | undefined {
  const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atEnd) return entries.at(-1)?.id;
  let found = entries[0]?.id;
  for (const entry of entries) {
    const el = document.getElementById(entry.id);
    if (!el) continue;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top - margin <= 8) found = entry.id;
  }
  return found;
}

/**
 * "On this page": a jump link per section of the page it sits on, read from the sections the page
 * rendered, so every page gets one without listing its sections twice. Two sections with the same
 * heading are told apart by their path. It marks the section being read. Below 1280px it is a bar that sticks under
 * the top bar; from 1280px it is a list in a column at the right, beside the content (index.css makes the room).
 */
export function SectionIndex() {
  const ref = useRef<HTMLElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<string>();

  // No dependency list: the page's sections change whenever it re-renders (new data, another context)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the missing list is the point, as the comment above says
  useEffect(() => {
    const page = ref.current?.closest('main');
    const sections = [...(page?.querySelectorAll<HTMLElement>('section[data-section]') ?? [])];
    const counts = new Map<string, number>();
    for (const s of sections) counts.set(s.dataset.section!, (counts.get(s.dataset.section!) ?? 0) + 1);
    const next = sections.map((s) => ({
      id: s.id,
      label: counts.get(s.dataset.section!)! > 1 && s.dataset.path ? `${s.dataset.section} · ${s.dataset.path}` : s.dataset.section!,
    }));
    setEntries((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  useEffect(() => {
    if (entries.length < MIN_SECTIONS) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(current(entries)));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [entries]);

  // An id the page no longer lists marks nothing
  const marked = entries.some((entry) => entry.id === active) ? active : undefined;

  // Keep the marked link in view when the bar is wider than the screen
  useEffect(() => {
    const bar = ref.current?.firstElementChild;
    const link = bar?.querySelector<HTMLElement>('[aria-current="true"]');
    if (bar instanceof HTMLElement && link && (link.offsetLeft < bar.scrollLeft || link.offsetLeft + link.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
      bar.scrollTo?.({ left: link.offsetLeft - 24 });
    }
  }, [marked]);

  return (
    <nav
      ref={ref}
      data-section-index=""
      aria-label="On this page"
      hidden={entries.length < MIN_SECTIONS}
      // From xl the bar is a point of no height that sticks under the top bar, and the list hangs from it at the right
      className="sticky top-14 z-[5] border-b bg-background/95 backdrop-blur xl:h-0 xl:border-b-0 xl:bg-transparent xl:backdrop-blur-none"
    >
      {entries.length >= MIN_SECTIONS && (
        // The page gutter (GUTTER in page.tsx, which imports this file)
        <div className="flex gap-1.5 overflow-x-auto px-[clamp(24px,5vw,72px)] py-2.5 [scrollbar-width:none] xl:absolute xl:top-10 xl:right-[clamp(24px,5vw,72px)] xl:max-h-[calc(100vh-8rem)] xl:w-56 xl:flex-col xl:gap-0 xl:overflow-y-auto xl:px-0 xl:py-0">
          <p className="hidden pb-3 pl-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase xl:block">On this page</p>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={entry.id === marked ? 'true' : undefined}
              className={cn(
                'shrink-0 rounded-[2px] border px-3 py-1 text-[13px] whitespace-nowrap transition-colors hover:bg-muted',
                'xl:rounded-none xl:border-0 xl:border-l-2 xl:border-transparent xl:py-1.5 xl:text-left xl:whitespace-normal xl:text-muted-foreground xl:hover:bg-transparent xl:hover:text-foreground',
                entry.id === marked &&
                  'border-primary bg-primary text-primary-foreground hover:bg-primary xl:border-l-primary xl:bg-transparent xl:font-semibold xl:text-foreground',
              )}
              onClick={() =>
                document
                  .getElementById(entry.id)
                  ?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              }
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
