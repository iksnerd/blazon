import type { ReactNode } from 'react';
import type { BlazonData } from '../../../types/index.js';
import { TOKEN_PAGES } from '@/lib/brand';
import type { Favicons } from '@/lib/favicons';
import type { Mode } from '@/lib/theme/theme';
import { DocPage } from '@/pages/doc';
import { FaviconsPage } from '@/pages/favicons';
import { TOKEN_VIEWS } from '@/pages/token-views';

export interface Chapter {
  /** "doc/<slug>" or "tokens/<page>", as the hash names the page without its "#" */
  id: string;
  title: string;
  body: () => ReactNode;
}

/** What the essentials keep: the guideline pages for these sections. */
const ESSENTIAL_SECTIONS = ['logo', 'color', 'typography'];

function guidelineChapters(data: BlazonData, mode: Mode): Chapter[] {
  return data.docs.map((doc): Chapter => ({ id: `doc/${doc.slug}`, title: doc.title, body: () => <DocPage data={data} doc={doc} mode={mode} print /> }));
}

/** The token pages the brand has tokens for, as the sidebar lists them. */
function referenceChapters(view: BlazonData): Chapter[] {
  return TOKEN_PAGES.filter((page) => view.tokens.items.some(page.has)).map((page): Chapter => {
    const View = TOKEN_VIEWS[page.hash]!;
    return { id: page.hash.slice(1), title: page.label, body: () => <View data={view} /> };
  });
}

/** The Favicons chapter, when the site has the plugin's data: after the guidelines, as the brand deck ends with it. */
function faviconsChapters(data: BlazonData, favicons: Favicons | null | undefined): Chapter[] {
  return favicons ? [{ id: 'favicons', title: 'Favicons', body: () => <FaviconsPage data={data} favicons={favicons} /> }] : [];
}

/** The chapters a print hash asks for. */
export function printChapters(selection: string, data: BlazonData, view: BlazonData, mode: Mode, favicons?: Favicons | null): Chapter[] {
  const guidelines = [...guidelineChapters(data, mode), ...faviconsChapters(data, favicons)];
  if (selection === 'essentials') {
    const essential = new Set(data.docs.filter((doc) => doc.sections.some((s) => ESSENTIAL_SECTIONS.includes(s))).map((doc) => `doc/${doc.slug}`));
    return guidelines.filter((chapter) => essential.has(chapter.id));
  }
  if (selection === 'reference') return referenceChapters(view);
  if (selection.startsWith('pages=')) {
    const byId = new Map([...guidelines, ...referenceChapters(view)].map((chapter) => [chapter.id, chapter]));
    return selection
      .slice('pages='.length)
      .split(',')
      .flatMap((id) => byId.get(id) ?? []);
  }
  return guidelines;
}
