import type { BlazonData } from '../../../../types/index.js';
import { isDarkPaint, logoOn } from '@/lib/brand';
import { tokenTitle } from '@/components/blazon/token-preview';
import { TokenPath } from '@/components/blazon/token-path';
import { Missing, paints } from './shared';

/**
 * The `<!-- blazon:logo-on <path> ... -->` directive: the logo on each color or gradient token. The
 * variant for dark backgrounds wherever white reaches the bar (3:1, or the level of a colorway that names the token for it), as on a saturated brand color;
 * the variant for light backgrounds elsewhere.
 */
export function LogoOn({ data, args }: { data: BlazonData; args: string[] }) {
  const logo = data.logo;
  if (!logo) return <Missing>No logo is configured (blazon.json → logo).</Missing>;
  return (
    <div className="not-prose my-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
      {paints(data, args).map((item) => {
        if ('missing' in item) return <Missing key={item.missing}>No token at {item.missing}</Missing>;
        const paint = String(item.value);
        const dark = isDarkPaint(data, paint, item);
        const ink = dark ? '#fff' : '#000';
        const src = logoOn(data, paint, dark, true, item);
        return (
          <figure key={item.path} data-logo-on={item.path} className="flex min-h-40 flex-col justify-between gap-6 rounded-lg border p-6" style={{ background: paint, color: ink }}>
            {src && <img className="my-auto h-7 w-auto self-center" src={src} alt="" />}
            <figcaption className="flex flex-col text-[13px]">
              <span className="font-semibold">{tokenTitle(item)}</span>
              <TokenPath path={item.path} className="opacity-80" />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
