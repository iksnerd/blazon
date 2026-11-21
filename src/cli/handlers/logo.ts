import pc from '../../core/colors.js';
import { describeLogo, type LogoDescription } from '../../core/read/index.js';
import { readBrand } from '../read.js';
import type { Handler } from './types.js';

const measure = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) return String(value);
  const v = value as { value?: number; unit?: string; units?: number; width?: unknown; height?: unknown };
  if (v.units !== undefined) return `${v.units} unit${v.units === 1 ? '' : 's'}`;
  if (v.value !== undefined) return `${v.value}${v.unit}`;
  return [v.width !== undefined && `width ${measure(v.width)}`, v.height !== undefined && `height ${measure(v.height)}`].filter(Boolean).join(', ');
};

/** `get_logo`, `blazon logo`: the configured logo variants and the rules each logo asset's sidecar states. Prints only; exits 0. */
export const getLogoHandler: Handler = async (_args, { dir }) => {
  const { config, data } = await readBrand(dir);
  const logo = describeLogo(data, config, dir);
  return { command: 'logo', passed: true, status: 0, body: logo, text: () => print(logo) };
};

function print(logo: LogoDescription): void {
  console.log(`\n  ${pc.bold('Variants')}`);
  if (logo.variants.length === 0) console.log(pc.dim('  No logo is configured.'));
  for (const v of logo.variants)
    console.log(`  ${v.variant.padEnd(8)}  ${v.file}${v.found ? '' : pc.red('  (not found)')}${v.ink ? `  ink ${v.ink}` : ''}${v.asset ? pc.dim(`  ${v.asset}`) : ''}`);
  for (const asset of logo.assets) {
    const r = asset.rules;
    console.log(`\n  ${pc.bold(asset.id)}  ${asset.files.join(', ')}${asset.variants.length ? pc.dim(`  used as ${asset.variants.join(', ')}`) : ''}`);
    const rows: [string, string | undefined][] = [
      ['lockup', r.lockup],
      ['ink', r.ink],
      ['background', r.background],
      ['unit', r.unit && measure(r.unit)],
      ['clear space', r.clearSpace && measure(r.clearSpace)],
      ['min size', r.minSize && measure(r.minSize)],
      ['max size', r.maxSize && measure(r.maxSize)],
      ['below that', r.replacedBelow && `${measure(r.replacedBelow)}: use ${r.replacedBelow.by}`],
      ['placement', r.placement?.join(', ')],
      ['partnership', r.partnership && `gap ${measure(r.partnership.gap)}${r.partnership.dividerHeight ? `, divider ${measure(r.partnership.dividerHeight)}` : ''}`],
      ['initiative', r.initiative && `${r.initiative.name}, mark ${r.initiative.mark}, gap ${measure(r.initiative.gap)}, ${r.initiative.position ?? 'beside'}`],
    ];
    for (const [label, value] of rows) if (value !== undefined) console.log(`    ${pc.dim(label.padEnd(12))}  ${value}`);
    for (const line of r.do ?? []) console.log(`    ${pc.dim('do')}            ${line}`);
    for (const line of r.dont ?? []) console.log(`    ${pc.dim('do not')}        ${line}`);
  }
  if (logo.forbidden.length > 0) {
    console.log(`\n  ${pc.bold('Forbidden on')}`);
    for (const f of logo.forbidden) console.log(`  ${f.at}  ${f.deny.join(', ')}${f.reason ? `  ${pc.dim(f.reason)}` : ''}`);
  }
  console.log();
}
