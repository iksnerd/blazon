import type { BlazonData } from '../../../../types/index.js';
import { GRAPHIC_CONTRAST, whiteContrast } from '@/lib/theme/color';
import { tokenTitle } from '@/components/blazon/token-preview';
import { TokenPath } from '@/components/blazon/token-path';
import { Missing, paints } from './shared';

/**
 * The `<!-- blazon:cards <path> ... -->` directive: a sample card framed in each color or gradient token,
 * with the logo, the token's name and a button. The card takes the theme's background, text, display
 * font, corner radius and inverse color; its sizes and spacing are blazon's, which a brand book rarely
 * states.
 */
export function SampleCards({ data, args }: { data: BlazonData; args: string[] }) {
  const logo = data.logo?.onLight ?? data.logo?.onDark;
  return (
    <figure className="not-prose my-4 flex flex-col gap-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
        {paints(data, args).map((item) =>
          'missing' in item ? (
            <Missing key={item.missing}>No token at {item.missing}</Missing>
          ) : (
            <div key={item.path} data-card={item.path} className="flex flex-col gap-2 rounded-[calc(var(--radius)*1.6)] p-4" style={{ background: String(item.value) }}>
              <div className="flex min-h-48 flex-col items-start gap-4 rounded-[var(--radius)] bg-[var(--blazon-bg)] p-5 text-[var(--blazon-text)]">
                {logo && <img className="h-5 w-auto" src={logo} alt="" />}
                <span className="font-[family-name:var(--blazon-font-display)] text-xl leading-tight font-semibold">{tokenTitle(item)}</span>
                <span className="mt-auto rounded-[calc(var(--radius)*0.6)] bg-[var(--blazon-inverse)] px-3 py-1.5 text-xs font-semibold text-[var(--blazon-inverse-text)]">
                  Read more →
                </span>
              </div>
              <span style={{ color: (whiteContrast(String(item.value)) ?? 0) >= GRAPHIC_CONTRAST ? '#fff' : '#000' }}>
                <TokenPath path={item.path} />
              </span>
            </div>
          ),
        )}
      </div>
      <figcaption className="text-[13px] text-muted-foreground">
        Built from tokens: each frame takes its token, the card the theme's background, display font, corner radius and inverse color. Sizes and spacing are blazon's own.
      </figcaption>
    </figure>
  );
}
