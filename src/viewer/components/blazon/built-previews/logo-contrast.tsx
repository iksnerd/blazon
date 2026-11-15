import type { BlazonData } from '../../../../types/index.js';
import { logoCandidates } from '@/lib/brand';
import { GRAPHIC_CONTRAST } from '@/lib/theme/color';
import { logoDenial } from '../../../../core/checker/logo-rules.js';
import { tokenTitle } from '@/components/blazon/token-preview';
import { TokenPath } from '@/components/blazon/token-path';
import { Missing, paints } from './shared';

/**
 * The `<!-- blazon:logo-contrast <path> ... -->` directive: both logo variants on each color or gradient
 * token with their contrast ratio, and whether it reaches graphic contrast. Each variant is judged as
 * the ink its sidecar declares, else as the ink it is made for: black for the one for light backgrounds,
 * white for the other. A logo asset that declares an ink and is not a configured file is listed too; one
 * that is a configured file is that row, not a second. A variant the
 * brand forbids on the token (`dev.blazon` `logo.deny`) is marked forbidden with its reason even when the
 * ratio passes: contrast says whether it reads, not whether the brand allows it.
 */
export function LogoContrast({ data, args }: { data: BlazonData; args: string[] }) {
  const logo = data.logo;
  if (!logo) return <Missing>No logo is configured (blazon.config.ts → logo).</Missing>;
  const variants = logoCandidates(data);
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
      {paints(data, args).map((item) => {
        if ('missing' in item) return <Missing key={item.missing}>No token at {item.missing}</Missing>;
        const paint = String(item.value);
        return (
          <figure key={item.path} data-logo-contrast={item.path} className="flex flex-col gap-3 rounded-lg border p-4" style={{ background: paint }}>
            {variants.map((v) => {
              const ratio = v.ratio(paint);
              const ok = ratio !== undefined && ratio >= GRAPHIC_CONTRAST;
              const denial = v.names.map((name) => logoDenial(item, data.tokens.items, name)).find((d) => d !== undefined);
              return (
                <div
                  key={v.name}
                  data-variant={v.name}
                  data-legible={ok}
                  data-forbidden={denial !== undefined}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                >
                  <img className="h-6 w-auto" src={v.src} alt="" />
                  <span className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                    {denial ? `${ratio === undefined ? '' : `${ratio.toFixed(1)}:1 `}✗ forbidden` : ratio === undefined ? 'n/a' : `${ratio.toFixed(1)}:1 ${ok ? '✓' : '✗'}`}
                  </span>
                  {denial && (
                    <span data-forbidden-reason="" className="basis-full rounded bg-background px-2 py-0.5 text-[11px] text-foreground">
                      {denial.reason ?? 'The brand forbids this logo on this background.'}
                    </span>
                  )}
                </div>
              );
            })}
            <figcaption className="flex flex-col rounded bg-background/90 px-2 py-1 text-[13px] text-foreground">
              <span className="font-semibold">{tokenTitle(item)}</span>
              <TokenPath path={item.path} className="text-muted-foreground" />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
