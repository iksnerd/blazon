import fs from 'node:fs';
import path from 'node:path';
import {
  INITIATIVE_POSITIONS,
  LOGO_CORNERS,
  STANDARD_LOGO_LOCKUPS,
  type Asset,
  type AssetDimension,
  type AssetMeasure,
  type AssetMeta,
  type Finding,
  type InitiativePosition,
  type LogoCorner,
  type Review,
  type ParsedTokens,
} from '../../types/index.js';
import { isMisuseKind, unknownMisuseMessage } from '../logo/misuse.js';
import { cleanReview, reviewProblem } from '../checker/review.js';
import { isObject, isSource, isStringList, listMessage, SOURCE_MESSAGE } from './fields.js';
import { finding } from '../checker/catalogue.js';

const FIELDS = [
  'title',
  'traits',
  'do',
  'dont',
  'misuse',
  'description',
  'background',
  'ink',
  'unit',
  'clearSpace',
  'minSize',
  'maxSize',
  'replacedBelow',
  'lockup',
  'placement',
  'partnership',
  'initiative',
  'order',
  'extensions',
  'source',
  'review',
  'generated',
];
const GENERATED_FIELDS = ['by', 'prompt', 'licence'];
const PARTNERSHIP_FIELDS = ['gap', 'dividerHeight', 'partnerHeight'];
const INITIATIVE_FIELDS = ['name', 'mark', 'gap', 'position', 'markHeight'];
const REPLACED_BELOW_FIELDS = ['width', 'height', 'by'];
const ASSET_ID = /^[^/]+\/[^/]+$/;
/** An extension key as DTCG asks for it: a reverse domain name, such as "com.acme.contrast" */
const EXTENSION_KEY = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

/** True when `file` is `root` or lies below it once symlinks are resolved. */
function isInside(root: string, file: string): boolean {
  const realRoot = fs.realpathSync(root);
  const real = fs.realpathSync(file);
  return real === realRoot || real.startsWith(realRoot + path.sep);
}

/**
 * A dimension as DTCG states it, or an alias to a dimension token ("{spacing.4}"), which is how a brand
 * says its clear space is a spacing step.
 */
function dimension(value: unknown, tokens: ParsedTokens | undefined): AssetDimension | string {
  const alias = typeof value === 'string' ? value.match(/^\{([^{}]+)\}$/)?.[1] : undefined;
  if (alias) {
    const token = tokens?.byPath.get(alias);
    if (!token) return `{${alias}} is not a token`;
    value = token.type === 'dimension' ? token.resolvedValue : undefined;
    if (value === undefined) return `{${alias}} is not a dimension token`;
  }
  if (isObject(value) && typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 && (value.unit === 'px' || value.unit === 'rem')) {
    return { value: value.value, unit: value.unit };
  }
  return `must be {"value": number, "unit": "px" | "rem"} or an alias to a dimension token, got ${JSON.stringify(value)}`;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** An ink as a CSS color: a hex string, or the color a color token resolves to; otherwise the message for the mistake. */
function inkColor(value: unknown, tokens: ParsedTokens | undefined): { color: string } | { error: string } {
  if (typeof value === 'string' && HEX_COLOR.test(value)) return { color: value };
  const alias = typeof value === 'string' ? value.match(/^\{([^{}]+)\}$/)?.[1] : undefined;
  if (!alias) return { error: `ink must be a hex color ("#0B1F3A") or an alias to a color token ("{color.navy.900}"), got ${JSON.stringify(value)}` };
  const token = tokens?.byPath.get(alias);
  if (!token) return { error: `ink: {${alias}} is not a token` };
  if (token.type !== 'color' || typeof token.resolvedValue !== 'string') return { error: `ink: {${alias}} is not a color token` };
  return { color: token.resolvedValue };
}

/** The validated metadata in a sidecar's JSON, or one message per mistake. Unknown fields are mistakes, so a typo shows. */
function validate(raw: unknown, tokens: ParsedTokens | undefined, lockups: readonly string[]): { meta: AssetMeta; errors: string[]; unknownMisuse: string[] } {
  const errors: string[] = [];
  const meta: AssetMeta = {};
  const unknownMisuse: string[] = [];
  if (!isObject(raw)) return { meta, errors: ['must be a JSON object'], unknownMisuse };

  for (const key of Object.keys(raw)) if (!FIELDS.includes(key)) errors.push(`unknown field "${key}"; known: ${FIELDS.join(', ')}`);

  const dim = (name: string, value: unknown): AssetDimension | undefined => {
    const result = dimension(value, tokens);
    if (typeof result === 'string') errors.push(`${name}: ${result}`);
    else return result;
    return undefined;
  };

  // A multiple of the unit is only meaningful when the sidecar states the unit, so that is read first
  if (raw.unit !== undefined) {
    const unit = dim('unit', raw.unit);
    if (unit && unit.value > 0) meta.unit = unit;
    else if (unit) errors.push('unit: must be above 0');
  }

  const measure = (name: string, value: unknown): AssetMeasure | undefined => {
    if (!isObject(value) || !('units' in value)) return dim(name, value);
    if (Object.keys(value).length !== 1) {
      errors.push(`${name}: a multiple of the unit has only "units", got ${JSON.stringify(value)}`);
      return undefined;
    }
    if (typeof value.units !== 'number' || !Number.isFinite(value.units) || value.units <= 0) {
      errors.push(`${name}: units must be a number above 0, got ${JSON.stringify(value.units)}`);
      return undefined;
    }
    if (raw.unit === undefined) {
      errors.push(`${name}: {"units": ${value.units}} needs a "unit" on the sidecar, the length it is a multiple of`);
      return undefined;
    }
    return { units: value.units };
  };

  if (raw.title !== undefined) {
    if (typeof raw.title === 'string' && raw.title.trim() !== '') meta.title = raw.title;
    else errors.push('title must be a string');
  }
  for (const name of ['traits', 'do', 'dont'] as const) {
    if (raw[name] === undefined) continue;
    if (isStringList(raw[name])) meta[name] = raw[name];
    else errors.push(listMessage(name));
  }
  if (raw.misuse !== undefined) {
    if (isStringList(raw.misuse)) {
      // A name that is not a kind is its own finding (asset-misuse-unknown); the known kinds are still kept
      for (const name of raw.misuse) if (!isMisuseKind(name) && !unknownMisuse.includes(name)) unknownMisuse.push(name);
      meta.misuse = [...new Set(raw.misuse.filter(isMisuseKind))];
    } else errors.push(listMessage('misuse'));
  }
  if (raw.description !== undefined) {
    if (typeof raw.description === 'string') meta.description = raw.description;
    else errors.push('description must be a string');
  }
  if (raw.background !== undefined) {
    if (raw.background === 'light' || raw.background === 'dark') meta.background = raw.background;
    else errors.push('background must be "light" or "dark"');
  }
  if (raw.ink !== undefined) {
    const ink = inkColor(raw.ink, tokens);
    if ('error' in ink) errors.push(ink.error);
    else meta.ink = ink.color;
  }
  if (raw.clearSpace !== undefined) {
    const clearSpace = measure('clearSpace', raw.clearSpace);
    if (clearSpace) meta.clearSpace = clearSpace;
  }
  const size = (name: 'minSize' | 'maxSize') => {
    const value = raw[name];
    if (value === undefined) return;
    if (!isObject(value) || (value.width === undefined && value.height === undefined)) {
      errors.push(`${name} must be an object with a width, a height or both`);
    } else {
      const width = value.width === undefined ? undefined : dim(`${name}.width`, value.width);
      const height = value.height === undefined ? undefined : dim(`${name}.height`, value.height);
      meta[name] = { ...(width && { width }), ...(height && { height }) };
    }
  };
  size('minSize');
  size('maxSize');
  if (raw.replacedBelow !== undefined) {
    const rule = raw.replacedBelow;
    if (!isObject(rule) || (rule.width === undefined && rule.height === undefined) || rule.by === undefined) {
      errors.push('replacedBelow needs a width or a height, and by: the asset to use below that size');
    } else {
      for (const key of Object.keys(rule))
        if (!REPLACED_BELOW_FIELDS.includes(key)) errors.push(`replacedBelow has unknown field "${key}"; known: ${REPLACED_BELOW_FIELDS.join(', ')}`);
      const width = rule.width === undefined ? undefined : dim('replacedBelow.width', rule.width);
      const height = rule.height === undefined ? undefined : dim('replacedBelow.height', rule.height);
      const by = typeof rule.by === 'string' && ASSET_ID.test(rule.by) ? rule.by : undefined;
      if (!by) errors.push('replacedBelow.by must be an asset id written category/name');
      if (by && (rule.width === undefined || width) && (rule.height === undefined || height)) {
        meta.replacedBelow = { ...(width && { width }), ...(height && { height }), by };
      }
    }
  }
  if (raw.lockup !== undefined) {
    if (typeof raw.lockup === 'string' && lockups.includes(raw.lockup)) meta.lockup = raw.lockup;
    else errors.push(`lockup must be one of ${lockups.join(', ')}`);
  }
  if (raw.placement !== undefined) {
    const corners = raw.placement;
    if (!Array.isArray(corners) || corners.length === 0) {
      errors.push(`placement must be a list of corners, from ${LOGO_CORNERS.join(', ')}`);
    } else {
      const valid: LogoCorner[] = [];
      for (const corner of corners) {
        if (!LOGO_CORNERS.includes(corner as LogoCorner)) errors.push(`placement corner ${JSON.stringify(corner)} is not one of ${LOGO_CORNERS.join(', ')}`);
        else if (valid.includes(corner as LogoCorner)) errors.push(`placement names ${corner} twice`);
        else valid.push(corner as LogoCorner);
      }
      if (valid.length === corners.length) meta.placement = valid;
    }
  }
  if (raw.partnership !== undefined) {
    const rule = raw.partnership;
    if (!isObject(rule)) {
      errors.push('partnership must be an object with a gap');
    } else {
      for (const key of Object.keys(rule)) if (!PARTNERSHIP_FIELDS.includes(key)) errors.push(`partnership has unknown field "${key}"; known: ${PARTNERSHIP_FIELDS.join(', ')}`);
      if (rule.gap === undefined) {
        errors.push('partnership needs a gap');
      } else {
        const gap = measure('partnership.gap', rule.gap);
        const dividerHeight = rule.dividerHeight === undefined ? undefined : measure('partnership.dividerHeight', rule.dividerHeight);
        const partnerHeight = rule.partnerHeight === undefined ? undefined : measure('partnership.partnerHeight', rule.partnerHeight);
        if (gap && (rule.dividerHeight === undefined || dividerHeight) && (rule.partnerHeight === undefined || partnerHeight)) {
          meta.partnership = { gap, ...(dividerHeight && { dividerHeight }), ...(partnerHeight && { partnerHeight }) };
        }
      }
    }
  }
  if (raw.initiative !== undefined) {
    const rule = raw.initiative;
    if (!isObject(rule)) {
      errors.push('initiative must be an object with a name, a mark and a gap');
    } else {
      for (const key of Object.keys(rule)) if (!INITIATIVE_FIELDS.includes(key)) errors.push(`initiative has unknown field "${key}"; known: ${INITIATIVE_FIELDS.join(', ')}`);
      const name = typeof rule.name === 'string' && rule.name.trim() !== '' ? rule.name : undefined;
      if (!name) errors.push('initiative needs a name: the program, as a non-empty string');
      const mark = typeof rule.mark === 'string' && ASSET_ID.test(rule.mark) ? rule.mark : undefined;
      if (!mark) errors.push('initiative needs a mark: the asset id of the program artwork, written category/name');
      if (rule.gap === undefined) errors.push('initiative needs a gap');
      const gap = rule.gap === undefined ? undefined : measure('initiative.gap', rule.gap);
      const position = rule.position as InitiativePosition | undefined;
      const positionOk = position === undefined || INITIATIVE_POSITIONS.includes(position);
      if (!positionOk) errors.push(`initiative.position must be one of ${INITIATIVE_POSITIONS.join(', ')}`);
      const markHeight = rule.markHeight === undefined ? undefined : measure('initiative.markHeight', rule.markHeight);
      if (name && mark && gap && positionOk && (rule.markHeight === undefined || markHeight)) {
        meta.initiative = { name, mark, gap, ...(position && { position }), ...(markHeight && { markHeight }) };
      }
    }
  }
  if (raw.order !== undefined) {
    if (typeof raw.order === 'number' && Number.isFinite(raw.order)) meta.order = raw.order;
    else errors.push(`order must be a number, got ${JSON.stringify(raw.order)}`);
  }
  if (raw.extensions !== undefined) {
    const extensions = raw.extensions;
    const keys = isObject(extensions) ? Object.keys(extensions) : [];
    const bad = keys.filter((key) => !EXTENSION_KEY.test(key) || key === 'dev.blazon');
    if (!isObject(extensions) || keys.length === 0) {
      errors.push('extensions must be an object of reverse-domain keys, such as {"com.acme.contrast": {...}}');
    } else if (bad.length > 0) {
      errors.push(
        `extensions key ${bad.map((key) => JSON.stringify(key)).join(', ')} must be a reverse domain name such as "com.acme.contrast", and not "dev.blazon": the sidecar's own fields are blazon's`,
      );
    } else meta.extensions = extensions;
  }
  if (raw.source !== undefined) {
    if (isSource(raw.source)) meta.source = { doc: raw.source.doc, locator: raw.source.locator };
    else errors.push(SOURCE_MESSAGE);
  }
  if (raw.review !== undefined) {
    const problem = reviewProblem(raw.review);
    if (problem === undefined) meta.review = cleanReview(raw.review as Review);
    else errors.push(problem);
  }
  if (raw.generated !== undefined) {
    const generated = raw.generated;
    if (!isObject(generated) || typeof generated.by !== 'string' || generated.by.trim() === '') {
      errors.push('generated must be {"by": string, "prompt"?: string, "licence"?: string}, where by names the model or tool');
    } else {
      for (const key of Object.keys(generated)) if (!GENERATED_FIELDS.includes(key)) errors.push(`generated has unknown field "${key}"; known: ${GENERATED_FIELDS.join(', ')}`);
      for (const key of ['prompt', 'licence'] as const) if (generated[key] !== undefined && typeof generated[key] !== 'string') errors.push(`generated.${key} must be a string`);
      meta.generated = {
        by: generated.by,
        ...(typeof generated.prompt === 'string' && { prompt: generated.prompt }),
        ...(typeof generated.licence === 'string' && { licence: generated.licence }),
      };
    }
  }
  return { meta, errors, unknownMisuse };
}

/**
 * Reads the sidecar for an asset: `logos/mark.json` for `logos/mark.svg`. A missing sidecar is not a
 * problem. A sidecar that is not valid JSON, has a bad field, or is a symlink out of the assets folder
 * is an error and gives no metadata. `review-pending` is a warning, as on a token. An asset with `generated` and no `review` is an `asset-review-missing` warning.
 */
export function readSidecar(
  assetsDir: string,
  sidecarPath: string,
  assetId: string,
  tokens?: ParsedTokens,
  /** Put before the path in findings: `<key>/` for a category scanned from its own folder */
  displayPrefix = '',
  /** The lockups a sidecar may state: the standard ones and the brand's own (RFC 0002 §1) */
  lockups: readonly string[] = STANDARD_LOGO_LOCKUPS,
): { meta?: AssetMeta; problems: Finding[] } {
  if (!fs.existsSync(sidecarPath)) return { problems: [] };
  const where = displayPrefix + path.relative(assetsDir, sidecarPath).split(path.sep).join('/');
  const invalid = (message: string): { problems: Finding[] } => ({
    problems: [finding('asset-sidecar-invalid', { path: where, message })],
  });

  if (!isInside(assetsDir, sidecarPath)) return invalid('is outside the assets folder');
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
  } catch (err) {
    return invalid(`is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { meta, errors, unknownMisuse } = validate(raw, tokens, lockups);
  if (errors.length > 0) return { problems: errors.map((message) => finding('asset-sidecar-invalid', { path: where, message })) };

  const problems: Finding[] = [];
  if (unknownMisuse.length > 0) problems.push(finding('asset-misuse-unknown', { path: where, message: `misuse: ${unknownMisuseMessage(unknownMisuse)}` }));
  if (meta.review?.status === 'needs-review') {
    problems.push(finding('review-pending', { path: assetId, message: meta.review.note ?? 'Marked needs-review' }));
  } else if (meta.generated && !meta.review) {
    problems.push(
      finding('asset-review-missing', {
        path: assetId,
        message: `${assetId} was generated by ${meta.generated.by} and nobody has confirmed it: set review.status to ok once a person has checked it`,
      }),
    );
  }
  return { meta, problems };
}

/**
 * A `replacedBelow` that names no asset, as an error on the sidecar. A name in a local category whose images
 * are not in this checkout is not reported: the category's note says why it is missing.
 */
export function replacementFindings(assets: readonly Asset[], absentLocal: ReadonlySet<string>): Finding[] {
  const ids = new Set(assets.map((asset) => asset.id));
  return assets.flatMap((asset): Finding[] => {
    const by = asset.meta?.replacedBelow?.by;
    if (!by || ids.has(by) || absentLocal.has(by.split('/')[0]!)) return [];
    return [finding('asset-sidecar-invalid', { path: `${asset.id}.json`, message: `replacedBelow.by: no asset at ${by}` })];
  });
}

/** An `initiative.mark` that names no asset, as an error on the sidecar; a name in a local category absent from this checkout is not reported, as for `replacedBelow`. */
export function initiativeFindings(assets: readonly Asset[], absentLocal: ReadonlySet<string>): Finding[] {
  const ids = new Set(assets.map((asset) => asset.id));
  return assets.flatMap((asset): Finding[] => {
    const mark = asset.meta?.initiative?.mark;
    if (!mark || ids.has(mark) || absentLocal.has(mark.split('/')[0]!)) return [];
    return [finding('asset-sidecar-invalid', { path: `${asset.id}.json`, message: `initiative.mark: no asset at ${mark}` })];
  });
}
