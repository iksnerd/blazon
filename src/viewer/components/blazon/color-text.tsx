import type { ReactNode } from 'react';
import { COLOR_CODE } from '@/lib/theme/color-badges';
import { ColorBadge } from '@/components/blazon/color-badge';

/**
 * Text with each color code in it (a six- or eight-digit hex, rgb() or rgba()) drawn as a badge in that color, for the
 * captions, descriptions and values the viewer prints itself; badgeColorCodes does the same for the Markdown of a page.
 */
export function ColorText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(COLOR_CODE)) {
    const start = match.index!;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<ColorBadge key={start} paint={match[0]} />);
    at = start + match[0].length;
  }
  if (parts.length === 0) return text;
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
