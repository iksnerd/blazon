import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT, read, interfaceKeys, unionMembers } from '../support/spec-helpers.js';

// The data model chapter (docs/manual/17-data-model.md) names every field of the model and every member of the lists a value is checked
// against, and the glossary (16-glossary.md) is linked from the manual's index. Expectations are read from the types and the schema,
// so a field added without a line in the chapter fails here. This does not judge the prose.

const chapter = read('docs/manual/17-data-model.md');
const backticked = (word: string) => chapter.includes(`\`${word}\``);

const MODEL = [
  'BlazonData',
  'ParsedTokens',
  'TokenItem',
  'TokenGroup',
  'GroupMeta',
  'TokenContext',
  'BlazonExtension',
  'Review',
  'ContrastPair',
  'FontMeta',
  'DocItem',
  'DocFrontmatter',
  'SectionInfo',
  'Vocabulary',
  'Asset',
  'AssetMeta',
  'AssetCategoryConfig',
  'AssetCategoryInfo',
  'AssetRules',
  'LogoSet',
  'IconSet',
  'Finding',
];

describe('the data model chapter names every field of the model', () => {
  it.each(MODEL)('%s', (name) => {
    const keys = interfaceKeys(name);
    expect(keys.length, `${name} has no fields: it moved or the name is wrong`).toBeGreaterThan(0);
    expect(
      keys.filter((key) => !backticked(key)),
      `fields of ${name} that docs/manual/17-data-model.md does not name`,
    ).toEqual([]);
  });
});

describe('the data model chapter lists every member of the controlled lists', () => {
  it.each(['TokenType', 'Tier', 'ContrastLevel', 'PatternKind', 'PreviewKind', 'AssetFormat', 'LogoCorner', 'InitiativePosition', 'ThemeRole', 'Severity'])('%s', (name) => {
    const members = unionMembers(name);
    expect(members.length, `${name} has no members: it moved or the name is wrong`).toBeGreaterThan(0);
    expect(members.filter((member) => !backticked(member))).toEqual([]);
  });
});

describe('the data model chapter lists the keys of brand.json', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/brand/brand.schema.json'), 'utf-8')) as { properties: Record<string, unknown> };
  it.each(Object.keys(schema.properties).filter((key) => !key.startsWith('$')))('%s', (key) => {
    expect(backticked(key)).toBe(true);
  });
});

describe('the glossary and the data model are in the manual', () => {
  const index = read('docs/manual/index.md');
  it.each(['16-glossary.md', '17-data-model.md'])('the index links %s, and the file exists', (file) => {
    expect(index).toContain(`](${file})`);
    expect(fs.existsSync(path.join(ROOT, 'docs/manual', file))).toBe(true);
  });
});
