import { useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { BlazonData } from '../../types/index.js';
import { assetCategories, docGroups, logoFor, TOKEN_PAGES } from '@/lib/brand';
import type { Favicons } from '@/lib/favicons';
import type { Mode } from '@/lib/theme/theme';
import { modeModifier, type SelectedContexts } from '@/lib/theme/contexts';
import { ContextSwitcher } from '@/components/blazon/context-switcher';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

/** Where the reader's closed groups are kept, so the index opens as they left it. */
const CLOSED_KEY = 'blazon:nav-closed';

function readClosed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeClosed(closed: string[]): void {
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
  } catch {
    // Storage blocked (a private window, cleared site data): the groups still open and close, for this visit
  }
}

/** A page in the index: text only, the current one marked by a line in the accent color at its left edge. */
function NavLink({ href, current, label, count }: { href: string; current: string; label: string; count?: number }) {
  const active = href === current;
  return (
    <SidebarMenuItem>
      {active && <span aria-hidden="true" className="absolute inset-y-1.5 -left-2 w-1 rounded-full bg-primary" />}
      <SidebarMenuButton isActive={active} className="data-active:font-semibold" render={<a href={href} aria-current={active ? 'page' : undefined} />}>
        <span>{label}</span>
      </SidebarMenuButton>
      {count !== undefined && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

/** A section of the index whose label opens and closes it, set off from the one above by a rule. */
function NavGroup({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={
        <SidebarGroup className="not-first:pt-3 not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-sidebar-border" />
      }
    >
      <SidebarGroupLabel
        render={<CollapsibleTrigger />}
        className="w-full cursor-pointer justify-between text-[13px] font-semibold text-sidebar-foreground hover:bg-sidebar-accent [&[data-panel-open]>svg]:rotate-180"
      >
        {title}
        <ChevronDownIcon aria-hidden="true" className="text-sidebar-foreground/60 transition-transform" />
      </SidebarGroupLabel>
      <CollapsibleContent>
        <SidebarMenu>{children}</SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The brand's logo, linking home: in the top bar, and at the head of the sidebar when it is a drawer. */
export function Brand({ data, mode }: { data: BlazonData; mode: Mode }) {
  const logo = logoFor(data, mode);
  return (
    <a href="#" aria-label="Home" className="flex h-12 items-center rounded-md px-2 outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring">
      {logo ? <img src={logo} alt={data.title} className="h-[26px] w-auto" /> : <span className="truncate font-heading text-base font-semibold">{data.title}</span>}
    </a>
  );
}

export function AppSidebar({
  data,
  hash,
  mode,
  favicons,
  contexts,
  onSelectContext,
  ...props
}: ComponentProps<typeof Sidebar> & {
  data: BlazonData;
  hash: string;
  mode: Mode;
  /** The chosen contexts, and how to choose one: the drawer shows them where the top bar has no room (under 768px) */
  contexts: SelectedContexts;
  onSelectContext: (modifier: string, context: string) => void;
  /** The blazon.favicons plugin's data when the site has it; the entry is shown only then */
  favicons: Favicons | null | undefined;
}) {
  const tokenPages = TOKEN_PAGES.filter((p) => data.tokens.items.some(p.has));
  const assets = assetCategories(data);
  const { isMobile } = useSidebar();
  const [closed, setClosed] = useState(readClosed);
  // Every group of the index by its title: what "Expand all" and "Collapse all" act on
  const titles = [...docGroups(data).map(([title]) => title), 'Tokens', ...(assets.length > 0 || favicons ? ['Assets'] : []), 'Quality'];
  const allOpen = titles.every((title) => !closed.includes(title));
  const setAll = (open: boolean) => {
    const next = open ? [] : titles;
    setClosed(next);
    writeClosed(next);
  };
  const group = (title: string) => ({
    title,
    open: !closed.includes(title),
    onOpenChange: (open: boolean) => {
      const next = open ? closed.filter((t) => t !== title) : [...closed, title];
      setClosed(next);
      writeClosed(next);
    },
  });

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* On a wide screen the logo is in the top bar, which the sidebar sits under */}
      {isMobile && (
        <SidebarHeader>
          <Brand data={data} mode={mode} />
          <ContextSwitcher data={data} selected={contexts} onSelect={onSelectContext} exclude={modeModifier(data)} className="flex-wrap pt-2 md:hidden" />
        </SidebarHeader>
      )}
      <SidebarContent>
        <div className="flex justify-end px-3 pt-2">
          <button
            type="button"
            aria-pressed={allOpen}
            onClick={() => setAll(!allOpen)}
            className="rounded-[2px] px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        <nav aria-label="Brand book">
          {docGroups(data).map(([title, docs]) => (
            <NavGroup key={title} {...group(title)}>
              {docs.map((doc) => (
                <NavLink key={doc.slug} href={`#doc/${doc.slug}`} current={hash} label={doc.title} />
              ))}
            </NavGroup>
          ))}
          <NavGroup {...group('Tokens')}>
            {tokenPages.map((page) => (
              <NavLink key={page.hash} href={page.hash} current={hash} label={page.label} />
            ))}
            <NavLink href="#tokens/all" current={hash} label="All tokens" count={data.tokens.items.length} />
          </NavGroup>
          {(assets.length > 0 || favicons) && (
            <NavGroup {...group('Assets')}>
              {assets.map((c) => (
                <NavLink key={c.category} href={`#assets/${c.category}`} current={hash} label={c.label} count={c.assets.length} />
              ))}
              {favicons && <NavLink href="#favicons" current={hash} label="Favicons" />}
            </NavGroup>
          )}
          <NavGroup {...group('Quality')}>
            <NavLink href="#review" current={hash} label="Review" count={data.findings.filter((f) => f.severity !== 'info').length} />
          </NavGroup>
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
