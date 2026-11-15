import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionIndex } from '@/components/blazon/section-index';

/** Page gutter shared by headers, sections and footers, as in the deck. */
export const GUTTER = 'px-[clamp(24px,5vw,72px)]';

export function PageHeader({ label, title, intro, children }: { label: string; title: string; intro?: string; children?: ReactNode }) {
  return (
    <>
      <header className={cn(GUTTER, 'border-b pt-12 pb-10')}>
        <p className="mb-3 text-[13px] font-semibold">{label}</p>
        <h1 className="font-heading text-[clamp(32px,4.5vw,56px)] leading-[1.05] font-semibold tracking-[-0.03em]">{title}</h1>
        {intro && <p className="mt-4 max-w-[40em] text-muted-foreground">{intro}</p>}
        {children}
      </header>
      <SectionIndex />
    </>
  );
}

export function PageFooter({ title, trail }: { title: string; trail: string }) {
  return (
    <footer className={cn(GUTTER, 'mt-12 flex justify-between gap-6 border-t py-5 text-xs text-muted-foreground')}>
      <span>{title}</span>
      <span>{trail}</span>
    </footer>
  );
}

export function Doc({ children }: { children: ReactNode }) {
  return (
    <div data-page-body="" className={GUTTER}>
      {children}
    </div>
  );
}

/** A small heading in the left column and the content on the right, the way the deck lays out a page. */
/**
 * A section's anchor id from its heading and path: "Primary" + "color.primary" -> "section-primary-color-primary".
 * Both, because two sections can share a path (a palette and the proportion documented on its group).
 */
function sectionId(path: string | undefined, heading: ReactNode): string | undefined {
  const key = [typeof heading === 'string' ? heading : undefined, path].filter(Boolean).join(' ');
  return key
    ? `section-${key
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`
    : undefined;
}

export function Section({ heading, path, wide, children }: { heading?: ReactNode; path?: string; wide?: boolean; children: ReactNode }) {
  const id = sectionId(path, heading);
  return (
    <section
      id={id}
      data-section={typeof heading === 'string' ? heading : undefined}
      data-path={path}
      className={cn('grid scroll-mt-28 gap-x-12 gap-y-6 border-b py-10 last:border-b-0', wide ? 'grid-cols-1' : 'lg:grid-cols-[minmax(140px,220px)_minmax(0,1fr)]')}
    >
      <div>
        {heading && <h2 className="text-[15px] font-semibold">{heading}</h2>}
        {path && <code className="mt-1 block font-mono text-[0.86em] text-muted-foreground">{path}</code>}
      </div>
      <div className={cn('min-w-0', !wide && 'max-w-[980px]')}>{children}</div>
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}
