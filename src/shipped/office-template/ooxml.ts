import type { LogoAsset } from './brand.js';
import type { FontPlan, HeadingStyle } from './fonts.js';
import type { Palette, Slot } from './palette.js';
import { H, W, type Box, type LayoutPlan, type LogoPlan, type PlaceholderPlan, type Plan } from './plan.js';
import type { Segment, Vector } from './svg.js';
import { zipOf, type Entry } from '../shared/zip.js';

// The plan as an Office file: a zip of XML parts, written by hand, with nothing in it that varies with the computer or the hour.
// Every placeholder carries its box and a rectangle outline, because Keynote drops the text of a slide placeholder that has no
// geometry of its own, and PowerPoint reads the same values and means the same thing.

export type Media = { kind: 'vector'; vector: Vector } | { kind: 'raster'; ext: 'png' | 'jpeg' | 'gif'; data: Buffer } | { kind: 'svg'; data: Buffer; fallback: Buffer };

export interface Source {
  title: string;
  palette: Palette;
  fonts: FontPlan;
  /** The line height and tracking of titles */
  heading: HeadingStyle;
  plan: Plan;
  /** What each logo asset is drawn from, by asset id */
  media: Map<string, Media>;
  /** potx is the template; pptx carries a sample slide for each layout */
  ext: 'potx' | 'pptx';
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

export const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xfrm = (box: Box): string => `<a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm>`;
const rectangle = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
const scheme = (slot: string): string => `<a:solidFill><a:schemeClr val="${slot}"/></a:solidFill>`;

/** The relationships of one part: an id for each target, in the order asked */
class Rels {
  readonly items: [id: string, type: string, target: string][] = [];
  add(type: string, target: string): string {
    const found = this.items.find((item) => item[1] === type && item[2] === target);
    if (found) return found[0];
    const id = `rId${this.items.length + 1}`;
    this.items.push([id, type, target]);
    return id;
  }
  xml(): string {
    return `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${REL}/${type}`}" Target="${target}"/>`).join('')}</Relationships>`;
  }
}

/** A counter for the shape ids of one part */
const ids = () => {
  let next = 1;
  return () => ++next;
};

const phAttrs = (p: PlaceholderPlan): string => {
  const size = p.half ? ' sz="half"' : '';
  switch (p.kind) {
    case 'ctrTitle':
      return 'type="ctrTitle"';
    case 'subTitle':
      return `type="subTitle" idx="${p.idx}"`;
    case 'title':
      return 'type="title"';
    case 'body':
      return `type="body" idx="${p.idx}"`;
    case 'content':
      return `idx="${p.idx}"${size}`;
    case 'sldNum':
      return `type="sldNum" sz="quarter" idx="${p.idx}"`;
  }
};

const FIELD = '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>&#8249;#&#8250;</a:t></a:fld></a:p>';
const para = (text: string, level = 0): string => `<a:p>${level ? `<a:pPr lvl="${level}"/>` : ''}<a:r><a:rPr lang="en-US"/><a:t>${esc(text)}</a:t></a:r></a:p>`;

/** The `spc` attribute of a title at a size in points: hundredths of a point, from the brand's tracking in em. Empty when there is none. */
const tracking = (heading: HeadingStyle, points: number): string => {
  const spc = Math.round((heading.tracking ?? 0) * points * 100);
  return spc === 0 ? '' : ` spc="${spc}"`;
};

/** The placeholder as a master or a layout draws it */
function placeholder(p: PlaceholderPlan, id: number, inkSlot: string | undefined, onMaster: boolean, heading: HeadingStyle): string {
  const ink = inkSlot ? scheme(inkSlot) : '';
  let lst = '';
  if (p.kind === 'sldNum') lst = '<a:lvl1pPr algn="r"><a:defRPr sz="1000"/></a:lvl1pPr>';
  else if (p.plain) lst = `<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="${(p.size ?? 20) * 100}">${ink}</a:defRPr></a:lvl1pPr>`;
  else if (!onMaster)
    lst = `<a:lvl1pPr><a:defRPr sz="${(p.size ?? 20) * 100}"${p.kind === 'title' || p.kind === 'ctrTitle' ? tracking(heading, p.size ?? 20) : ''}>${ink}</a:defRPr></a:lvl1pPr>`;
  const text = p.kind === 'sldNum' ? FIELD : para(p.prompt) + (p.kind === 'body' && onMaster ? para('Second level', 1) : '');
  const anchor = p.anchor ? ` anchor="${p.anchor}"` : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(p.name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phAttrs(p)}/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(p.box)}${rectangle}</p:spPr><p:txBody><a:bodyPr${anchor}><a:normAutofit/></a:bodyPr><a:lstStyle>${lst}</a:lstStyle>${text}</p:txBody></p:sp>`;
}

const K = 100;
function pathXml(segments: Segment[]): string {
  const pt = (x: number, y: number) => `<a:pt x="${Math.round(x * K)}" y="${Math.round(y * K)}"/>`;
  return segments
    .map((s) =>
      s[0] === 'M'
        ? `<a:moveTo>${pt(s[1], s[2])}</a:moveTo>`
        : s[0] === 'L'
          ? `<a:lnTo>${pt(s[1], s[2])}</a:lnTo>`
          : s[0] === 'C'
            ? `<a:cubicBezTo>${pt(s[1], s[2])}${pt(s[3], s[4])}${pt(s[5], s[6])}</a:cubicBezTo>`
            : '<a:close/>',
    )
    .join('');
}

/** The logo of the plan as a shape of the master or the layout: a group of vector shapes, or a picture */
function logoShape(logo: LogoPlan, media: Media, id: () => number, rels: Rels, mediaPath: (asset: LogoAsset, kind: string) => string, alt: string): string {
  const { box } = logo;
  const name = `Logo ${logo.asset.id}`;
  if (media.kind === 'vector') {
    const { width, height, shapes } = media.vector;
    const parts = shapes
      .map(
        (shape, k) =>
          `<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="${esc(name)} part ${k + 1}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(box)}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(width * K)}" h="${Math.round(height * K)}">${pathXml(shape.segments)}</a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="${shape.fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`,
      )
      .join('');
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id()}" name="${esc(name)}" descr="${esc(alt)}"/><p:cNvGrpSpPr/><p:nvPr userDrawn="1"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/><a:chOff x="${box.x}" y="${box.y}"/><a:chExt cx="${box.width}" cy="${box.height}"/></a:xfrm></p:grpSpPr>${parts}</p:grpSp>`;
  }
  const picture = rels.add('image', `../media/${mediaPath(logo.asset, media.kind === 'svg' ? 'png' : media.ext)}`);
  const svg = media.kind === 'svg' ? rels.add('image', `../media/${mediaPath(logo.asset, 'svg')}`) : undefined;
  const extra = svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svg}"/></a:ext></a:extLst>`
    : '';
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id()}" name="${esc(name)}" descr="${esc(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="${picture}">${extra}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box)}${rectangle}</p:spPr></p:pic>`;
}

function themeXml({ title, palette, fonts }: Source): string {
  const color = (tag: string, hex: string) => `<a:${tag}><a:srgbClr val="${hex}"/></a:${tag}>`;
  const colors = [
    color('dk1', palette.dk1),
    color('lt1', palette.lt1),
    color('dk2', palette.dk2),
    color('lt2', palette.lt2),
    ...palette.accents.map((hex, k) => color(`accent${k + 1}`, hex)),
    color('hlink', palette.hlink),
    color('folHlink', palette.folHlink),
  ].join('');
  const font = (tag: string, face: string) => `<a:${tag}><a:latin typeface="${esc(face)}"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) => `<a:ln w="${w}">${fill}</a:ln>`;
  const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>';
  const name = esc(title);
  return `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements><a:clrScheme name="${name}">${colors}</a:clrScheme><a:fontScheme name="${name}">${font('majorFont', fonts.major)}${font('minorFont', fonts.minor)}</a:fontScheme><a:fmtScheme name="${name}"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const level = (n: number, margin: number, size: number): string =>
  `<a:lvl${n}pPr marL="${margin}" indent="-228600"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buFontTx/><a:buChar char="&#8226;"/><a:defRPr sz="${size}">${scheme('tx1')}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${n}pPr>`;

export function buildPackage(source: Source): Buffer {
  const { plan, palette, media } = source;
  const entries: Entry[] = [];
  const mediaFiles = new Map<string, Buffer>();
  const mediaNames = new Map<string, string>();
  const mediaPath = (asset: LogoAsset, ext: string): string => {
    const key = `${asset.id}.${ext}`;
    if (!mediaNames.has(key)) mediaNames.set(key, `logo${mediaNames.size + 1}.${ext}`);
    return mediaNames.get(key)!;
  };
  const alt = `${source.title} logo`;
  const logoXml = (logo: LogoPlan | undefined, id: () => number, rels: Rels): string => {
    const item = logo && media.get(logo.asset.id);
    if (!logo || !item) return '';
    if (item.kind === 'raster') mediaFiles.set(mediaPath(logo.asset, item.ext), item.data);
    if (item.kind === 'svg') {
      mediaFiles.set(mediaPath(logo.asset, 'svg'), item.data);
      mediaFiles.set(mediaPath(logo.asset, 'png'), item.fallback);
    }
    return logoShape(logo, item, id, rels, mediaPath, alt);
  };

  // The master
  const masterRels = new Rels();
  const masterId = ids();
  const masterShapes = plan.master.placeholders.map((p) => placeholder(p, masterId(), undefined, true, source.heading)).join('') + logoXml(plan.master.logo, masterId, masterRels);
  const layoutRelIds = plan.layouts.map((_, k) => masterRels.add('slideLayout', `../slideLayouts/slideLayout${k + 1}.xml`));
  masterRels.add('theme', '../theme/theme1.xml');
  const { slots } = palette;
  const map = (bg1: Slot, tx1: Slot, bg2: Slot, tx2: Slot, tag: string): string =>
    `<${tag} bg1="${bg1}" tx1="${tx1}" bg2="${bg2}" tx2="${tx2}" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;
  const masterXml = `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}${masterShapes}</p:spTree></p:cSld>${map(slots.background, slots.text, slots.canvas, slots.inverse, 'p:clrMap')}<p:sldLayoutIdLst>${layoutRelIds.map((rid, k) => `<p:sldLayoutId id="${2147483649 + k}" r:id="${rid}"/>`).join('')}</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="${Math.round(source.heading.lineHeight * 100000)}"/></a:lnSpc><a:defRPr sz="4000"${tracking(source.heading, 40)}>${scheme('tx1')}<a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle>${[228600, 685800, 1143000, 1600200, 2057400].map((margin, k) => level(k + 1, margin, [2000, 1800, 1600, 1400, 1400][k]!)).join('')}</p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800">${scheme('tx1')}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

  // The layouts
  const layoutXml = (layout: LayoutPlan, rels: Rels): string => {
    const id = ids();
    const inverse = layout.surface === 'inverse';
    const surface = plan.surfaces[layout.surface];
    const shapes =
      (layout.accentBar
        ? `<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="Accent bar"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(layout.accentBar)}${rectangle}${scheme('accent1')}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
        : '') +
      layout.placeholders.map((p) => placeholder(p, id(), inverse ? surface.text : undefined, false, source.heading)).join('') +
      logoXml(layout.logo, id, rels);
    const background = inverse ? `<p:bg><p:bgPr>${scheme(surface.background)}<a:effectLst/></p:bgPr></p:bg>` : '';
    const override = inverse
      ? `<p:clrMapOvr>${map(surface.background, surface.text, slots.background, slots.text, 'a:overrideClrMapping')}</p:clrMapOvr>`
      : '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
    return `${HEAD}<p:sldLayout ${NS} type="${layout.type}" preserve="1"${layout.showMaster ? '' : ' showMasterSp="0"'}><p:cSld name="${esc(layout.name)}">${background}<p:spTree>${GROUP}${shapes}</p:spTree></p:cSld>${override}</p:sldLayout>`;
  };
  const layoutParts = plan.layouts.map((layout, k) => {
    const rels = new Rels();
    rels.add('slideMaster', '../slideMasters/slideMaster1.xml');
    return { name: `ppt/slideLayouts/slideLayout${k + 1}.xml`, xml: layoutXml(layout, rels), rels };
  });

  // Sample slides, for the .pptx
  const slides = source.ext === 'pptx' ? plan.layouts : [];
  const slideXml = (layout: LayoutPlan): string => {
    const id = ids();
    const shapes = layout.placeholders
      .filter((p) => p.kind !== 'sldNum')
      .map(
        (p) =>
          `<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="${esc(p.name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phAttrs(p)}/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(p.box)}${rectangle}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${(layout.sample[p.name] ?? [p.prompt]).map((line) => para(line)).join('')}</p:txBody></p:sp>`,
      )
      .join('');
    return `${HEAD}<p:sld ${NS}><p:cSld><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  };

  // The package
  const pptxType = 'application/vnd.openxmlformats-officedocument.presentationml';
  const exts = new Set([...mediaNames.values()].map((name) => name.split('.').pop()!));
  const defaults = [
    ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
    ['xml', 'application/xml'],
    ...[...exts].sort().map((ext) => [ext, ext === 'svg' ? 'image/svg+xml' : `image/${ext}`]),
  ];
  const overrides: [string, string][] = [
    ['/ppt/presentation.xml', `${pptxType}.${source.ext === 'potx' ? 'template' : 'presentation'}.main+xml`],
    ['/ppt/slideMasters/slideMaster1.xml', `${pptxType}.slideMaster+xml`],
    ...plan.layouts.map((_, k): [string, string] => [`/ppt/slideLayouts/slideLayout${k + 1}.xml`, `${pptxType}.slideLayout+xml`]),
    ...slides.map((_, k): [string, string] => [`/ppt/slides/slide${k + 1}.xml`, `${pptxType}.slide+xml`]),
    ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'],
  ];
  // The media are known only once the logos are written, so the content types come last
  const presentationRels = new Rels();
  presentationRels.add('slideMaster', 'slideMasters/slideMaster1.xml');
  presentationRels.add('theme', 'theme/theme1.xml');
  const slideIds = slides.map((_, k) => presentationRels.add('slide', `slides/slide${k + 1}.xml`));
  const presentation = `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${slides.length ? `<p:sldIdLst>${slideIds.map((rid, k) => `<p:sldId id="${256 + k}" r:id="${rid}"/>`).join('')}</p:sldIdLst>` : ''}<p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800">${scheme('tx1')}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;
  const root = new Rels();
  root.add('officeDocument', 'ppt/presentation.xml');
  root.add('http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml');
  root.add('extended-properties', 'docProps/app.xml');
  const when = '2000-01-01T00:00:00Z';
  const core = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(source.title)}</dc:title><dc:creator>blazon</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`;
  const app = `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>blazon.office-template</Application></Properties>`;

  entries.push([
    '[Content_Types].xml',
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join('')}${overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join('')}</Types>`,
  ]);
  entries.push(
    ['_rels/.rels', root.xml()],
    ['docProps/core.xml', core],
    ['docProps/app.xml', app],
    ['ppt/presentation.xml', presentation],
    ['ppt/_rels/presentation.xml.rels', presentationRels.xml()],
    ['ppt/theme/theme1.xml', themeXml(source)],
  );
  entries.push(['ppt/slideMasters/slideMaster1.xml', masterXml], ['ppt/slideMasters/_rels/slideMaster1.xml.rels', masterRels.xml()]);
  layoutParts.forEach((part, k) => entries.push([part.name, part.xml], [`ppt/slideLayouts/_rels/slideLayout${k + 1}.xml.rels`, part.rels.xml()]));
  slides.forEach((layout, k) => {
    const rels = new Rels();
    rels.add('slideLayout', `../slideLayouts/slideLayout${k + 1}.xml`);
    entries.push([`ppt/slides/slide${k + 1}.xml`, slideXml(layout)], [`ppt/slides/_rels/slide${k + 1}.xml.rels`, rels.xml()]);
  });
  for (const name of [...mediaNames.values()].sort()) entries.push([`ppt/media/${name}`, [...mediaFiles].find(([n]) => n === name)![1]]);
  return zipOf(entries);
}
