import { Fragment } from 'react';
import { cn } from '@/lib/utils';

/**
 * A token path in code type that wraps after a dot, so a narrow card shows "gradient.category." over
 * "digitalTransformation" instead of cutting a word. A single segment too long for the line still breaks.
 */
export function TokenPath({ path, className }: { path: string; className?: string }) {
  const segments = path.split('.');
  return (
    <code className={cn('font-mono text-xs [overflow-wrap:anywhere]', className)}>
      {segments.map((segment, i) =>
        i < segments.length - 1 ? (
          <Fragment key={i}>
            {`${segment}.`}
            <wbr />
          </Fragment>
        ) : (
          segment
        ),
      )}
    </code>
  );
}
