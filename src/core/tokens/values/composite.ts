import type { BlazonExtension, TokenType } from '../../../types/index.js';
import { fail, InvalidValue, isObject } from './shared.js';
import { simple } from './simple.js';
import { number } from './units.js';

/** CSS default direction (to bottom); RFC 0001 open question 3. */
export const DEFAULT_GRADIENT_ANGLE = 180;

/** Sub-value types of composite tokens (Format Module §9). */
const TYPOGRAPHY_PARTS: Record<string, TokenType> = {
  fontFamily: 'fontFamily',
  fontSize: 'dimension',
  fontWeight: 'fontWeight',
  letterSpacing: 'dimension',
  lineHeight: 'number',
};
const SHADOW_PARTS: Record<string, TokenType> = {
  color: 'color',
  offsetX: 'dimension',
  offsetY: 'dimension',
  blur: 'dimension',
  spread: 'dimension',
};
const BORDER_PARTS: Record<string, TokenType> = { color: 'color', width: 'dimension', style: 'strokeStyle' };
const TRANSITION_PARTS: Record<string, TokenType> = {
  duration: 'duration',
  delay: 'duration',
  timingFunction: 'cubicBezier',
};

function part(value: unknown, partType: TokenType): string | number {
  return simple(partType, value);
}

/** A measure written as "16px" or {"value": 16, "unit": "px"}, or undefined for anything else. */
function measureOf(value: unknown): { amount: number; unit: string } | undefined {
  if (isObject(value) && typeof value.value === 'number' && typeof value.unit === 'string') return { amount: value.value, unit: value.unit };
  const m = typeof value === 'string' ? /^\s*(-?\d*\.?\d+)\s*([a-z%]+)\s*$/i.exec(value) : null;
  return m ? { amount: Number(m[1]), unit: m[2]!.toLowerCase() } : undefined;
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A typography lineHeight. DTCG 2025.10 defines it as a number, a multiple of the font size: when it is written as anything else, say what to write. */
function lineHeight(value: unknown, fontSize: unknown): string | number {
  try {
    return part(value, 'number');
  } catch (err) {
    if (!(err instanceof InvalidValue)) throw err;
    const rule = 'lineHeight is a number, a multiple of fontSize';
    const height = measureOf(value);
    const size = measureOf(fontSize);
    let hint = rule;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'normal') {
      hint = `${rule}: write a number such as 1.2 because DTCG has no keyword`;
    } else if (height?.unit === '%') {
      hint = `${rule}: ${height.amount}% is ${round(height.amount / 100)}: divide by 100`;
    } else if (height && size && height.unit === size.unit && size.amount > 0 && (height.unit === 'px' || height.unit === 'rem')) {
      hint = `${rule}: ${height.amount}${height.unit} at fontSize ${size.amount}${size.unit} is ${round(height.amount / size.amount)} (${height.amount}/${size.amount})`;
    }
    return fail(`${err.message}. ${hint}`);
  }
}

function shadow(value: unknown): string {
  const layers = Array.isArray(value) ? value : [value];
  return layers
    .map((layer) => {
      if (!isObject(layer)) fail('shadow must be an object or an array of objects');
      const inset = layer.inset === true ? 'inset ' : '';
      return `${inset}${part(layer.offsetX, 'dimension')} ${part(layer.offsetY, 'dimension')} ${part(layer.blur, 'dimension')} ${part(layer.spread, 'dimension')} ${part(layer.color, 'color')}`;
    })
    .join(', ');
}

function gradient(value: unknown, blazon: BlazonExtension): string {
  if (!Array.isArray(value) || value.length < 2) fail('gradient must be an array of at least two stops');
  const stops = value.map((stop) => {
    if (!isObject(stop)) fail('gradient stops must be {"color", "position"}');
    const position = Math.min(1, Math.max(0, number(stop.position)));
    return `${part(stop.color, 'color')} ${Math.round(position * 10000) / 100}%`;
  });
  return `linear-gradient(${blazon.angle ?? DEFAULT_GRADIENT_ANGLE}deg, ${stops.join(', ')})`;
}

function typography(value: unknown): string {
  if (!isObject(value)) fail('typography must be an object');
  const required = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'];
  const missing = required.filter((k) => value[k] === undefined);
  if (missing.length) fail(`typography is missing ${missing.join(', ')}`);
  // CSS `font` shorthand; letterSpacing has no place in it and is emitted separately.
  return `${part(value.fontWeight, 'fontWeight')} ${part(value.fontSize, 'dimension')}/${lineHeight(value.lineHeight, value.fontSize)} ${part(value.fontFamily, 'fontFamily')}`;
}

export function css(type: TokenType, value: unknown, blazon: BlazonExtension): string | number {
  switch (type) {
    case 'typography':
      return typography(value);
    case 'gradient':
      return gradient(value, blazon);
    case 'shadow':
      return shadow(value);
    case 'border': {
      if (!isObject(value)) fail('border must be an object');
      return `${part(value.width, 'dimension')} ${part(value.style, 'strokeStyle')} ${part(value.color, 'color')}`;
    }
    case 'transition': {
      if (!isObject(value)) fail('transition must be an object');
      return `${part(value.duration, 'duration')} ${part(value.timingFunction, 'cubicBezier')} ${part(value.delay, 'duration')}`;
    }
    default:
      return simple(type, value);
  }
}

/** Composite parts keyed by property, each converted to CSS; used by tokens.ts and per-part CSS variables. */
export function compositeParts(type: TokenType | undefined, value: unknown): Record<string, string | number> | undefined {
  const partTypes =
    type === 'typography'
      ? TYPOGRAPHY_PARTS
      : type === 'border'
        ? BORDER_PARTS
        : type === 'transition'
          ? TRANSITION_PARTS
          : type === 'shadow' && isObject(value)
            ? SHADOW_PARTS
            : undefined;
  if (!partTypes || !isObject(value)) return undefined;
  try {
    const parts: Record<string, string | number> = {};
    for (const [key, partType] of Object.entries(partTypes)) {
      if (value[key] !== undefined) parts[key] = key === 'lineHeight' ? lineHeight(value[key], value.fontSize) : part(value[key], partType);
    }
    return parts;
  } catch (err) {
    if (err instanceof InvalidValue) return undefined;
    throw err;
  }
}
