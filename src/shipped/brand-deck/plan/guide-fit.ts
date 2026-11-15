import {
  GUIDE_BULLET,
  GUIDE_FORMS,
  GUIDE_INSET,
  GUIDE_ITEM,
  GUIDE_LABEL,
  GUIDE_LEAD,
  GUIDE_PAIR_GAP,
  GUIDE_PAIR_MIN,
  GUIDE_SIZES,
  GUIDE_SPACE,
  MARGIN,
  PAGE,
  PANEL_BOTTOM,
  PANEL_TOP,
} from './constants.js';
import { guideCandidates, guideGeometry, guideOps, sourceRoom } from './guide-layout.js';
import { type GuideContent, type GuidelineSlide, type Wrap } from './types.js';

const contentOf = (slide: GuideContent): GuideContent => ({ description: slide.description, traits: slide.traits, do: slide.do, dont: slide.dont });
const emptyContent = (): GuideContent => ({ description: null, traits: [], do: [], dont: [] });

/** [placed, rest] of one paragraph in `room` points: all of it when it fits, else nothing when it can wait for a fresh slide (`whole`: it would fit one), else as many lines as fit, the rest to follow. */
function takeText(text: string, size: number, width: number, room: number, wrap: Wrap, whole: boolean): [string | null, string | null] {
  const lines = wrap(text, size, width);
  const lead = size * GUIDE_LEAD;
  if (lines.length * lead <= room) return [text, null];
  if (whole) return [null, text];
  const count = Math.floor(room / lead);
  return [lines.slice(0, Math.max(count, 0)).join(' ') || null, lines.slice(Math.max(count, 0)).join(' ')];
}

/** [placed, rest] of a list in `room` points. An item that does not fit waits for the next slide, with the ones after it; one taller than a whole slide (`pageRoom`) is split between its lines. */
function takeItems(items: string[], size: number, width: number, room: number, wrap: Wrap, pageRoom: number): [string[], string[]] {
  const placed: string[] = [];
  let used = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const height = wrap(item, size, width - GUIDE_BULLET).length * size * GUIDE_LEAD + GUIDE_ITEM;
    if (used + height <= room) {
      placed.push(item);
      used += height;
      continue;
    }
    const [first, rest] = takeText(item, size, width - GUIDE_BULLET, room - used - GUIDE_ITEM, wrap, height <= pageRoom);
    if (first) placed.push(first);
    return [placed, [...(rest ? [rest] : []), ...items.slice(index + 1)]];
  }
  return [placed, []];
}

/**
 * [placed, rest, traits as a list] of an asset slide's text on one slide with `room` points for it. The description first,
 * the traits as one line, then Do and Don't side by side; what does not fit is `rest`, for the next slide. Do and Don't stay
 * together: unless both fit here, they wait for a slide of their own (`fresh`), where each list is cut between its items if it
 * must be. `pageRoom` is what a list has on a slide of its own.
 */
function fillPage(content: GuideContent, size: number, width: number, room: number, pageRoom: number, wrap: Wrap, fresh: boolean): [GuideContent, GuideContent, boolean] {
  const placed = emptyContent();
  const rest = emptyContent();
  let asList = false;
  if (content.description) [placed.description, rest.description] = takeText(content.description, size, width, room - GUIDE_INSET, wrap, false);
  if (content.traits.length > 0 && !rest.description) {
    if (guideOps({ ...placed, traits: content.traits }, size, width, 2, wrap, true).height + GUIDE_INSET <= room) {
      placed.traits = content.traits;
    } else if (fresh && !placed.description) {
      // More traits than a slide holds in a line: a list, which can be cut between its items
      [placed.traits, rest.traits] = takeItems(content.traits, size, width, room - GUIDE_INSET, wrap, pageRoom);
      asList = true;
    } else {
      rest.traits = content.traits;
    }
  } else {
    rest.traits = content.traits;
  }
  if (rest.description || rest.traits.length > 0) {
    rest.do = content.do;
    rest.dont = content.dont;
    return [placed, rest, asList];
  }
  if (guideOps({ ...placed, do: content.do, dont: content.dont }, size, width, 2, wrap, !asList).height + GUIDE_INSET <= room) {
    placed.do = content.do;
    placed.dont = content.dont;
    return [placed, rest, asList];
  }
  if (!fresh) {
    rest.do = content.do;
    rest.dont = content.dont;
    return [placed, rest, asList];
  }
  const column = content.do.length > 0 && content.dont.length > 0 ? (width - GUIDE_PAIR_GAP) / 2 : width;
  const left = room - guideOps(placed, size, width, 2, wrap, !asList).height - GUIDE_SPACE;
  for (const key of ['do', 'dont'] as const) {
    if (content[key].length > 0) [placed[key], rest[key]] = takeItems(content[key], size, column, left - GUIDE_LABEL, wrap, pageRoom);
  }
  return [placed, rest, asList];
}

/**
 * The slides of one asset: one when its text fits beside the image at a legible size, else the widest room the image can
 * give and, for what still does not fit, slides titled "(continued)" with the text across the whole slide. No text is dropped.
 */
export function fitted(slide: GuidelineSlide, wrap: Wrap): GuidelineSlide[] {
  const candidates = guideCandidates(slide);
  for (const [panel, size] of candidates) {
    const { width } = guideGeometry(panel);
    const room = PANEL_TOP - PANEL_BOTTOM - sourceRoom(slide, width, wrap).height;
    for (const [columns, line] of GUIDE_FORMS) {
      if (columns === 2 && (width - GUIDE_PAIR_GAP) / 2 < GUIDE_PAIR_MIN) continue;
      if (guideOps(contentOf(slide), size, width, columns, wrap, line).height + GUIDE_INSET <= room) {
        return [{ ...slide, layout: { panel, size, columns, traits: line ? 'line' : 'list' } }];
      }
    }
  }
  // Every slide after the first is text across its width, with the source below it: that is what a list has on a slide of its own
  const across = PAGE.width - 2 * MARGIN;
  const pageRoom = PANEL_TOP - PANEL_BOTTOM - sourceRoom(slide, across, wrap).height - GUIDE_SPACE - GUIDE_LABEL;
  // The first slide keeps the image, in the narrowest panel, and sets what it holds at the largest size: the lists go to the next
  const slides: GuidelineSlide[] = [];
  let content = contentOf(slide);
  const panel = Math.min(...candidates.filter(([, size]) => size === GUIDE_SIZES[0]).map(([p]) => p));
  const size = GUIDE_SIZES[0];
  for (;;) {
    const first = slides.length === 0;
    const here: [number | null, number] = first ? [panel, size] : [null, GUIDE_SIZES[0]];
    const { width } = guideGeometry(here[0]);
    const room = PANEL_TOP - PANEL_BOTTOM - sourceRoom(slide, width, wrap).height;
    const [placed, rest, asList] = fillPage(content, here[1], width, room, pageRoom, wrap, !first);
    content = rest;
    slides.push({
      ...slide,
      ...placed,
      title: first ? slide.title : `${slide.title} (continued)`,
      layout: { panel: here[0], size: here[1], columns: 2, traits: asList ? 'list' : 'line' },
    });
    if (!(content.description || content.traits.length > 0 || content.do.length > 0 || content.dont.length > 0)) return slides;
  }
}
