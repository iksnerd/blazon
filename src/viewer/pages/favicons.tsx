import type { BlazonData } from '../../types/index.js';
import { faviconUrl, type Favicons } from '@/lib/favicons';
import { Doc, Note, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { DocCode } from '@/components/blazon/doc-code';

/** What each of the plugin's views shows, as the brand deck's Favicons part says it. */
const VIEW_NOTES: Record<string, string> = {
  tabs: 'The favicon in a light and a dark browser tab, with the 16 px and 32 px icons enlarged and drawn pixelated.',
  masks: 'The 1024 px master under the iOS and Android masks. Dashed circles: the maskable safe zone (80%) and the Android adaptive safe zone (66 dp).',
  sizes: 'The master at the iOS app-icon sizes, 180 px down to 29 px.',
};

const COLOR_LABELS = [
  ['ground', 'Ground'],
  ['ink', 'Ink'],
  ['favicon', 'Favicon'],
  ['themeColor', 'Theme color'],
] as const;

/** A swatch is filled only with a plain hex color: the value comes from a file of the site, and is still printed as written. */
const HEX = /^#[0-9a-f]{3,8}$/i;

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** A view's note; for the masks, with how far the symbol reaches into the Android layer, as measured on the drawn pixels. */
function noteFor(view: { id: string }, favicons: Favicons): string | undefined {
  const note = VIEW_NOTES[view.id];
  const { adaptive } = favicons;
  if (view.id !== 'masks' || !note || adaptive?.symbolReach === undefined || adaptive.safeRadius === undefined) return note;
  return `${note} The symbol reaches ${percent(adaptive.symbolReach)} of the Android layer's width from its centre; the adaptive safe zone is ${percent(adaptive.safeRadius)}.`;
}

/**
 * The Favicons page: what the blazon.favicons plugin drew from the brand's symbol. One block per view, the table of the
 * files and the head snippet with the colors the set is drawn in, as the brand deck shows them. The images and the data
 * are the plugin's copy in the built site (favicons/), read at runtime.
 */
export function FaviconsPage({ data, favicons }: { data: BlazonData; favicons: Favicons }) {
  const colors = COLOR_LABELS.flatMap(([key, label]) => (favicons.colors?.[key] ? [{ key, label, value: favicons.colors[key]! }] : []));
  return (
    <>
      <PageHeader
        label="Assets"
        title="Favicons"
        intro={`The favicon and app-icon set drawn from ${favicons.symbol ? `the symbol ${favicons.symbol}` : 'the brand symbol'}, and how it looks in a browser tab, under each platform's mask and at each iOS size.`}
      />
      <Doc>
        {(favicons.views ?? []).map((view) => (
          <Section key={view.id} heading={view.title} wide>
            <div className="flex flex-col gap-4">
              {noteFor(view, favicons) && <Note>{noteFor(view, favicons)}</Note>}
              <figure data-favicons-view={view.id} className="overflow-hidden rounded-lg border">
                <img src={faviconUrl(view.file)} width={view.width} height={view.height} alt={view.title} loading="lazy" className="h-auto w-full" />
              </figure>
            </div>
          </Section>
        ))}
        {favicons.files && favicons.files.length > 0 && (
          <Section heading="Files" wide>
            <table data-favicons-files="" className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 font-semibold">File</th>
                  <th className="py-2 pr-4 font-semibold">Size</th>
                  <th className="py-2 font-semibold">Use</th>
                </tr>
              </thead>
              <tbody>
                {favicons.files.map((row) => (
                  <tr key={row.file} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono text-[13px]">{row.file}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.size}</td>
                    <td className="py-2 text-muted-foreground">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
        {favicons.head && (
          <Section heading="Head snippet" wide>
            <div className="flex flex-col gap-4">
              <DocCode code={favicons.head} language="html" />
              {colors.length > 0 && (
                <ul data-favicons-colors="" className="flex flex-wrap gap-x-8 gap-y-3">
                  {colors.map(({ key, label, value }) => (
                    <li key={key} className="flex items-center gap-3 text-sm">
                      <span aria-hidden="true" className="size-7 rounded-md border" style={HEX.test(value) ? { background: value } : undefined} />
                      <span className="flex flex-col">
                        <span className="font-semibold">{label}</span>
                        <span className="font-mono text-[13px] text-muted-foreground">{value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}
      </Doc>
      <PageFooter title={data.title} trail="Assets / Favicons" />
    </>
  );
}
