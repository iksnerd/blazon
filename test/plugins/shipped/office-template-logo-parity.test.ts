import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { buildBrandExport } from '../../../src/core/brand/export.js';
import { pickLogo } from '../../../src/core/logo/pick.js';
import { readBrand } from '../../../src/shipped/office-template/brand.js';
import { chooseLogos, logosBySurface } from '../../../src/shipped/office-template/logo.js';
import { exampleProject } from '../../support/examples';

// One order everywhere: for the same background in a brand with `logo.deny` rules, the Office template draws the file `blazon logo --on` names.
// The brand is a copy of the starter with three background tokens (dark, mid grey, light grey) and one more logo that declares an ink.

const GROUNDS = { night: '#202020', mid: '#808080', haze: '#C0C0C0' } as const;

async function surfaces(ground: keyof typeof GROUNDS, deny: string[]) {
  const root = exampleProject('blazon');
  const logos = path.join(root, 'assets/logos');
  fs.copyFileSync(path.join(logos, 'blazon-bone.svg'), path.join(logos, 'acme-gold.svg'));
  fs.writeFileSync(path.join(logos, 'acme-gold.json'), JSON.stringify({ ink: '#D4AF37', background: 'dark' }));
  const tokens = path.join(root, 'tokens/colors.json');
  const json = JSON.parse(fs.readFileSync(tokens, 'utf-8'));
  json.color.acme = Object.fromEntries(
    Object.entries(GROUNDS).map(([name, value]) => [name, { $value: value, ...(name === ground && { $extensions: { 'dev.blazon': { logo: { deny, reason: 'Acme rule' } } } }) }]),
  );
  fs.writeFileSync(tokens, JSON.stringify(json, null, 2));
  const configFile = path.join(root, 'blazon.json');
  const raw = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  raw.theme = { ...raw.theme, inverse: `color.acme.${ground}` };
  fs.writeFileSync(configFile, JSON.stringify(raw, null, 2));
  const config = await loadConfig(root);
  const data = await compileBlazonData(config, root);
  const core = pickLogo(data, config, root, { on: `color.acme.${ground}` });
  const read = readBrand(JSON.parse(JSON.stringify(buildBrandExport(data, config, root))));
  const template = logosBySurface(read, chooseLogos(read, {})).logos.inverse;
  return { core, template };
}

describe('the Office template and `blazon logo --on` give the same logo', () => {
  const cases: [string, keyof typeof GROUNDS, string[]][] = [
    ['an inked asset before a plain file with a higher ratio', 'night', ['logos/blazon-graphite']],
    ['the dark-surface file where white reaches 3:1', 'mid', ['logos/acme-gold']],
    ['the light-surface file where white does not', 'haze', ['logos/acme-gold']],
    ['no logo when the brand forbids every one that reads', 'night', ['onDark', 'logos/acme-gold']],
  ];
  for (const [name, ground, deny] of cases) {
    it(name, async () => {
      const { core, template } = await surfaces(ground, deny);
      if ('refused' in core) expect(template).toBeNull();
      else {
        expect(template).toBeTruthy();
        expect(template!.id).toBe(core.asset);
      }
    });
  }
});
