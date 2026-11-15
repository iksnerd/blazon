import { hexOf } from './colors.js';
import { dp } from './dimensions.js';
import type { Plan } from './plan.js';

const HEADER = '<!-- Written by blazon.platform-tokens from brand.json. Do not edit: build again instead. -->';

const resources = (lines: string[], note?: string): string =>
  ['<?xml version="1.0" encoding="utf-8"?>', HEADER, ...(note ? [`<!-- ${note} -->`] : []), '<resources>', ...lines.map((line) => `    ${line}`), '</resources>', ''].join('\n');

/** Android resources: colors.xml (#RRGGBB, or #AARRGGBB with alpha), values-night/colors.xml for the colors the dark context changes, and dimens.xml in dp */
export function androidFiles(plan: Plan): Map<string, string> {
  const files = new Map<string, string>();
  const hex = (color: Plan['colors'][number]['light']) => `#${hexOf(color, color.alpha !== 255)}`;
  if (plan.colors.length) files.set('android/values/colors.xml', resources(plan.colors.map((c) => `<color name="${c.android}">${hex(c.light)}</color>`)));
  const night = plan.colors.filter((c) => c.dark);
  if (night.length) files.set('android/values-night/colors.xml', resources(night.map((c) => `<color name="${c.android}">${hex(c.dark!)}</color>`)));
  if (plan.dimensions.length)
    files.set(
      'android/values/dimens.xml',
      resources(
        plan.dimensions.map((d) => `<dimen name="${d.android}">${dp(d.dp)}dp</dimen>`),
        'px tokens are dp 1:1; rem tokens are 16 dp to the rem',
      ),
    );
  return files;
}
