import { Badge } from '@/components/ui/badge';
import type { CategoryKind } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Marks an asset category that is not the brand's live identity, and not a finding: explorations ("Experiment") or material kept for
 * comparison or supplied by someone else ("Reference"). Nothing for an ordinary category, so a call site passes the kind it has.
 */
export function CategoryLabel({ kind, className }: { kind?: CategoryKind; className?: string }) {
  if (!kind) return null;
  const marker = kind === 'experiment' ? { 'data-experiment': '' } : { 'data-reference': '' };
  return (
    <Badge variant="outline" {...marker} className={cn('border-current bg-transparent text-current', className)}>
      {kind === 'experiment' ? 'Experiment' : 'Reference'}
    </Badge>
  );
}
