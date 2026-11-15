import type { BlazonData } from '../../../types/index.js';
import { contextFor, type SelectedContexts } from '@/lib/theme/contexts';
import { humanize } from '@/lib/tokens/format';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

/** One select per resolver modifier (blazon.resolver.json), e.g. Locale: en (default), ja, de, fr. */
export function ContextSwitcher({
  data,
  selected,
  onSelect,
  exclude,
  className,
}: {
  data: BlazonData;
  selected: SelectedContexts;
  onSelect: (modifier: string, context: string) => void;
  /** A modifier another control drives (the mode switch drives `theme`), left out here */
  exclude?: string;
  className?: string;
}) {
  const modifiers = (data.tokens.modifiers ?? []).filter((m) => m.name !== exclude);
  if (modifiers.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {modifiers.map((m) => (
        <label key={m.name} className="flex items-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground">
          {humanize(m.name)}
          <NativeSelect size="sm" aria-label={humanize(m.name)} value={contextFor(data, m.name, selected)} onChange={(e) => onSelect(m.name, e.target.value)}>
            {m.contexts.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c === m.default ? `${c} (default)` : c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      ))}
    </div>
  );
}
