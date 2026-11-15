import type { ReactNode } from 'react';
import { inkOnPaint, paintLabel } from '@/lib/theme/color';

/** A color written as text: a pill filled with the color or gradient, in black or white ink by contrast. */
export function ColorBadge({ paint, children }: { paint: string; children?: ReactNode }) {
  const label = paintLabel(paint);
  return (
    <span data-color-badge className="blazon-badge [overflow-wrap:anywhere]" style={{ background: paint, color: inkOnPaint(paint) }} title={label === paint ? undefined : paint}>
      {children ?? label}
    </span>
  );
}
