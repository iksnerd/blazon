import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ASSET_URL_BASE, type BlazonData, type IconCategory, type IconSet } from '../../../types/index.js';
import { ChevronRightIcon } from 'lucide-react';

/** Where the dev server and the static build serve an icon set's SVGs, relative to the page. */
export function iconSetUrl(set: IconSet, icon: string): string {
  return `${ASSET_URL_BASE}/icon-sets/${set.name}/${encodeURIComponent(icon)}.svg`;
}

/**
 * The URL a mask can use. A relative url() inside a custom property resolves against the stylesheet that
 * reads it, which in a built site is /assets/index-*.css, so `brand-assets/…` would be looked up under
 * /assets/. Resolved against the page's own base it is right at the root and under a subpath alike.
 */
function maskUrl(set: IconSet, icon: string): string {
  return new URL(iconSetUrl(set, icon), document.baseURI).href;
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-destructive">{children}</p>;
}

/** One category: collapsed until opened, and its icons exist only while it is open, so a set of thousands costs nothing at load. */
function Category({ set, category }: { set: IconSet; category: IconCategory }) {
  const [open, setOpen] = useState(false);
  return (
    <section data-icon-category={category.name} className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/50"
      >
        <ChevronRightIcon className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="flex-1">{category.name}</span>
        <span className="font-mono text-[11px] font-normal text-muted-foreground">{category.icons.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1 border-t p-2">
          {category.icons.map((icon) => (
            <figure key={icon} data-icon-name={icon} title={icon} className="flex min-w-0 flex-col items-center gap-1.5 rounded-md p-2 text-center">
              <span
                data-icon-mask=""
                role="img"
                aria-label={icon}
                className="blazon-icon size-6"
                style={{ background: 'var(--blazon-text, currentColor)', '--blazon-icon': `url("${maskUrl(set, icon)}")` } as CSSProperties}
              />
              <figcaption className="w-full truncate text-[11px] text-muted-foreground">{icon}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The `<!-- blazon:icon-set <name> [category ...] -->` directive: an icon package read from node_modules,
 * every category or the ones named, each collapsed until opened. Painted in the theme's text color.
 */
export function IconSetBrowser({ data, args }: { data: BlazonData; args: string[] }) {
  const [name, ...names] = args;
  const set = data.iconSets.find((s) => s.name === name);
  if (!set) return <Missing>No icon set at {name}</Missing>;
  const unknown = names.filter((n) => !set.categories.some((c) => c.name === n));
  const shown = names.length ? set.categories.filter((c) => names.includes(c.name)) : set.categories;
  return (
    <div className="not-prose my-4 flex flex-col gap-2">
      <p className="font-mono text-[11px] text-muted-foreground">
        {[`${set.package}${set.version ? ` ${set.version}` : ''}`, set.license, `${set.count} icons`].filter(Boolean).join(' · ')}
      </p>
      {unknown.map((n) => (
        <Missing key={n}>{`No category ${n} in ${set.name}`}</Missing>
      ))}
      {shown.map((category) => (
        <Category key={category.name} set={set} category={category} />
      ))}
    </div>
  );
}
