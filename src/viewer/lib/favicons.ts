import { useEffect, useState } from 'react';

/** Where the blazon.favicons plugin leaves its copy in the built site, beside index.html */
export const FAVICONS_FOLDER = 'favicons';

/** What the Favicons page reads from favicons.json (format blazon-favicons, version 1); the plugin writes more than this. */
export interface Favicons {
  symbol?: string;
  colors?: { ground?: string; ink?: string; favicon?: string; themeColor?: string };
  views?: { id: string; title: string; file: string; width: number; height: number }[];
  adaptive?: { safeRadius?: number; symbolReach?: number };
  files?: { file: string; size: string; use: string }[];
  head?: string;
}

/** The URL of a file of the copy, relative to the page, so the book works under any path it is served from. */
export const faviconUrl = (file: string): string => `${FAVICONS_FOLDER}/${file}`;

/**
 * The plugin's data, or null when the site has none. The viewer is static and its data is fixed before the plugins run, so
 * this asks at runtime. A brand without the plugin has no such file: that, a server that answers the page for any path
 * (blazon dev does), a file that is not JSON and one of another format all mean "no Favicons page", quietly.
 */
export async function loadFavicons(): Promise<Favicons | null> {
  try {
    const response = await fetch(`${FAVICONS_FOLDER}/favicons.json`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown> | null;
    if (!data || data.format !== 'blazon-favicons') return null;
    if (data.version !== 1) {
      console.warn(`[blazon] ${FAVICONS_FOLDER}/favicons.json is version ${String(data.version)}; this book reads version 1, so it has no Favicons page`);
      return null;
    }
    return data as Favicons;
  } catch {
    return null;
  }
}

/** undefined while the file is being asked for, then the data or null. The print book waits for it to be settled. */
export function useFavicons(): Favicons | null | undefined {
  const [favicons, setFavicons] = useState<Favicons | null | undefined>();
  useEffect(() => {
    let cancelled = false;
    void loadFavicons().then((found) => {
      if (!cancelled) setFavicons(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return favicons;
}
