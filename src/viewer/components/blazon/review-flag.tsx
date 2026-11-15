import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Marks a token that `blazon check` wants a person to look at. */
export function ReviewFlag({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-current bg-transparent text-current', className)}>
      Review
    </Badge>
  );
}
