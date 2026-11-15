import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlazonData } from '../types/index.js';
import { useBlazonData } from '@/lib/blazon-data';
import { applyTheme, useMode, type Mode } from '@/lib/theme/theme';
import { assetCategories, categoryKind, defaultHash, docGroup, TOKEN_PAGES } from '@/lib/brand';
import { notify } from '@/lib/copy';
import { useFavicons, type Favicons } from '@/lib/favicons';
import { contextFor, effectiveData, modeModifier, useSelectedContexts, withMode } from '@/lib/theme/contexts';
import { MenuIcon, MoonIcon, SearchIcon, SunIcon } from 'lucide-react';
import { AppSidebar, Brand } from '@/components/app-sidebar';
import { ConnectAgent } from '@/components/blazon/connect-agent';
import { ContextSwitcher } from '@/components/blazon/context-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocPage } from '@/pages/doc';
import { SearchPage } from '@/pages/tokens';
import { TOKEN_VIEWS } from '@/pages/token-views';
import { ReviewPage } from '@/pages/review';
import { AssetsPage } from '@/pages/assets';
import { FaviconsPage } from '@/pages/favicons';
import { NotFoundPage } from '@/pages/not-found';
import { PrintBook } from '@/pages/print';
import { parsePrintHash } from '@/pages/print/selection';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/**
 * `data` is the brand book as compiled (docs, review, assets); `view` is it as the chosen resolver
 * contexts resolve it, which every token page renders from.
 */
function Page({ data, view, hash, query, mode, favicons }: { data: BlazonData; view: BlazonData; hash: string; query: string; mode: Mode; favicons: Favicons | null | undefined }) {
  if (query) return <SearchPage data={view} query={query} />;
  if (hash.startsWith('#doc/')) {
    const doc = data.docs.find((d) => d.slug === hash.slice('#doc/'.length));
    // In the chosen contexts, as the token pages: a dark theme's colors on the Color page too
    if (doc) return <DocPage data={view} doc={doc} mode={mode} />;
  }
  const View = TOKEN_VIEWS[hash];
  if (View) return <View data={view} />;
  if (hash === '#review') return <ReviewPage data={data} />;
  // The plugin's copy is asked for at load: a reload at #favicons shows nothing until it is known, not "not found"
  if (hash === '#favicons' && favicons !== null) return favicons ? <FaviconsPage data={data} favicons={favicons} /> : null;
  if (hash.startsWith('#assets/')) {
    const found = assetCategories(data).find((c) => `#assets/${c.category}` === hash);
    if (found) return <AssetsPage data={data} assets={found.assets} title={found.label} description={found.description} rules={found.rules} kind={categoryKind(found)} />;
  }
  return <NotFoundPage />;
}

/** Where the reader is, as the breadcrumb shows it: the index section, then the page. */
function location(data: BlazonData, hash: string, query: string, favicons: Favicons | null | undefined): { section: string; page: string } {
  if (query) return { section: 'Search', page: query };
  if (hash.startsWith('#doc/')) {
    const doc = data.docs.find((d) => d.slug === hash.slice('#doc/'.length));
    if (doc) return { section: docGroup(doc), page: doc.title };
  }
  if (hash === '#tokens/all') return { section: 'Tokens', page: 'All tokens' };
  const tokenPage = TOKEN_PAGES.find((p) => p.hash === hash);
  if (tokenPage) return { section: 'Tokens', page: tokenPage.label };
  if (hash === '#review') return { section: 'Quality', page: 'Review' };
  if (hash === '#favicons' && favicons !== null) return { section: 'Assets', page: 'Favicons' };
  const assets = assetCategories(data).find((c) => `#assets/${c.category}` === hash);
  if (assets) return { section: 'Assets', page: assets.label };
  return { section: data.title, page: 'Not found' };
}

/** The sidebar stays open on a wide screen: what would close it (the menu button, Cmd+B) only opens the drawer below 1024px. */
const KEEP_OPEN = () => undefined;

/** Opens the sidebar as a drawer on a narrow screen; a wide one always shows it. */
function MenuButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" aria-label="Menu" className="-ml-1 lg:hidden" onClick={toggleSidebar}>
      <MenuIcon />
    </Button>
  );
}

export function App() {
  const data = useBlazonData();
  const rawHash = useHash();
  const [mode, setMode] = useMode();
  // The search belongs to the page it was typed on: a new hash ends it before anything is committed with the old query
  const [typed, setTyped] = useState({ text: '', hash: rawHash });
  if (typed.hash !== rawHash) setTyped({ text: '', hash: rawHash });
  const query = typed.text;
  const setQuery = (text: string) => setTyped({ text, hash: rawHash });
  const [contexts, selectContext] = useSelectedContexts(data);
  const favicons = useFavicons();
  // The mode switch also picks the brand's light or dark tokens, when the resolver has them
  const view = useMemo(() => effectiveData(data, withMode(data, contexts, mode)), [data, contexts, mode]);
  const main = useRef<HTMLElement>(null);
  const firstData = useRef(data);
  // "#tokens/colors?token=color.primary.indigo": the page, then the token to open it at
  const [route, search] = rawHash.split('?');
  const hash = route || defaultHash(data);
  const focusToken = new URLSearchParams(search ?? '').get('token');

  // The theme as the chosen contexts resolve it, so a locale's typeface dresses the whole book
  useEffect(() => applyTheme(view), [view]);
  // Dark mode paints from the brand's own dark theme when the mode switch drives one (index.css)
  useEffect(() => {
    document.documentElement.toggleAttribute('data-mode-themed', modeModifier(data) !== undefined);
  }, [data]);
  useEffect(() => {
    if (data !== firstData.current) notify('Updated');
  }, [data]);
  // A new page starts at the top
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [rawHash]);

  // A link from a doc opens its token page at the token, and flashes it once
  useEffect(() => {
    if (!focusToken) return;
    const matches = [...document.querySelectorAll<HTMLElement>(`[data-token="${CSS.escape(focusToken)}"]`)];
    const target = matches.find((el) => el.getClientRects().length > 0) ?? matches[0];
    if (!target) return;
    target.scrollIntoView?.({ block: 'center' });
    target.classList.remove('blazon-flash');
    void target.offsetWidth;
    target.classList.add('blazon-flash');
  }, [focusToken, hash]);

  // The print book has no sidebar: a headless browser prints it as the brand book's PDF
  if (hash === '#print' || hash.startsWith('#print/')) {
    return <PrintBook data={data} view={view} mode={mode} {...parsePrintHash(rawHash)} favicons={favicons} />;
  }

  const needle = query.trim().toLowerCase();
  const here = location(data, hash, needle, favicons);

  return (
    <Toaster>
      <TooltipProvider>
        <SidebarProvider open onOpenChange={KEEP_OPEN} className="flex-col">
          {/* The top bar spans the window, as on most documentation sites: the logo over the sidebar, then where the reader is */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex shrink-0 items-center gap-1 lg:w-[calc(var(--sidebar-width)-1rem)]">
              <MenuButton />
              <Brand data={data} mode={mode} />
            </div>
            <Breadcrumb className="hidden min-w-0 md:flex">
              <BreadcrumbList>
                <BreadcrumbItem>{here.section}</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{here.page}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {/* Search, the resolver's contexts and the viewer's mode, at the right as on most documentation sites */}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <label className="relative min-w-0">
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search tokens and pages"
                  aria-label="Search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 w-[clamp(140px,28vw,320px)] pl-8"
                />
              </label>
              <ContextSwitcher data={data} selected={contexts} onSelect={selectContext} exclude={modeModifier(data)} className="hidden md:flex" />
              <ConnectAgent />
              <Button variant="ghost" size="icon" aria-label={mode === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
                {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
              </Button>
            </div>
          </header>
          <div className="flex flex-1">
            <AppSidebar
              data={data}
              hash={hash}
              mode={mode}
              favicons={favicons}
              contexts={contexts}
              onSelectContext={selectContext}
              className="lg:top-14 lg:h-[calc(100svh-3.5rem)]"
            />
            {/* :lang() rules and glyph shaping follow the chosen locale */}
            <SidebarInset ref={main} lang={contextFor(data, 'locale', contexts)} className="min-w-0">
              <Page data={data} view={view} hash={hash} query={needle} mode={mode} favicons={favicons} />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </Toaster>
  );
}
