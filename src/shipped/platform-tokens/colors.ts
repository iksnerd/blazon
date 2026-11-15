import Color from 'colorjs.io';

/** A color as the platforms keep it: sRGB, each channel a whole number from 0 to 255, alpha too */
export interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** How far past 0 or 1 a channel may be before the color counts as outside sRGB: conversion noise is not a gamut problem */
const TOLERANCE = 0.0005;

const byte = (unit: number): number => Math.max(0, Math.min(255, Math.round(unit * 255)));

/**
 * Any CSS color colorjs.io reads (hex, rgb(), hsl(), hwb(), lab(), oklch(), color(), a name) as sRGB. A color sRGB cannot show is clamped
 * channel by channel and flagged. undefined for anything that is not a color: a var(), a gradient, `currentcolor`.
 */
export function readColor(value: unknown): { color: Rgba; clamped: boolean } | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  let srgb: Color;
  try {
    srgb = new Color(value.trim()).to('srgb');
  } catch {
    return undefined;
  }
  const [red, green, blue] = srgb.coords.map((channel) => (Number.isNaN(channel) ? 0 : channel)) as [number, number, number];
  const alpha = Number.isNaN(srgb.alpha) ? 1 : srgb.alpha;
  const clamped = [red, green, blue].some((channel) => channel < -TOLERANCE || channel > 1 + TOLERANCE);
  return { color: { red: byte(red), green: byte(green), blue: byte(blue), alpha: byte(alpha) }, clamped };
}

export const sameColor = (a: Rgba, b: Rgba): boolean => a.red === b.red && a.green === b.green && a.blue === b.blue && a.alpha === b.alpha;

const hex = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

/** The channels as two-digit hex, in capitals: `FF5A1F`, or `80FF5A1F` with the alpha first when `withAlpha` */
export const hexOf = ({ red, green, blue, alpha }: Rgba, withAlpha: boolean): string => `${withAlpha ? hex(alpha) : ''}${hex(red)}${hex(green)}${hex(blue)}`;
