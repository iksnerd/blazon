// Covers the `byRule` view of check_brand: findings grouped by code, and what the answer says about rules of plugins that did not run.
// One of the server-*.test.ts files, kept small so the files run in parallel; the shared setup is in support.ts.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../test/support/project.js';
import { connect, fakeBlazon, installed, structured } from './support.js';

const finding = (code: string, severity: string, p: string, message: string) => ({ code, severity, path: p, message });

/** A fake `blazon check --json` answer with the given findings, in a brand folder whose config lists `configPlugins`. */
function checkWith(findings: { severity: string }[], configPlugins: string[] = []) {
  const brand = tempDir('blazon-mcp-groups-');
  if (configPlugins.length > 0) fs.writeFileSync(path.join(brand, 'blazon.json'), JSON.stringify({ plugins: configPlugins }));
  const count = (s: string) => findings.filter((f) => f.severity === s).length;
  const doc = { command: 'check', passed: true, counts: { errors: count('error'), warnings: count('warning'), info: count('info') }, brandHasErrors: false, findings };
  const file = path.join(tempDir('blazon-mcp-groups-doc-'), 'doc.json');
  fs.writeFileSync(file, JSON.stringify(doc));
  return { brand, bin: fakeBlazon(`cat "${file}"`) };
}

describe.skipIf(!installed)('check_brand byRule', () => {
  const findings = [
    finding('b-rule', 'warning', 'z.path', 'second warning rule'),
    finding('a-rule', 'warning', 'y.path', 'first of many'),
    finding('a-rule', 'warning', 'y.other', 'another'),
    finding('c-rule', 'info', 'i.path', 'only a note'),
    finding('d-rule', 'error', 'e.path', 'x'.repeat(400)),
    finding('a-rule', 'warning', 'y.third', 'third'),
  ];

  it('groups the findings by rule: severity first, then the larger count, with one capped example each', async () => {
    const other = await connect(checkWith(findings));
    const answer = structured(await other.callTool({ name: 'check_brand', arguments: {} }));
    expect(answer.byRule.map((g: { code: string }) => g.code)).toEqual(['d-rule', 'a-rule', 'b-rule', 'c-rule']);
    expect(answer.byRule[1]).toEqual({ code: 'a-rule', severity: 'warning', count: 3, example: { path: 'y.path', message: 'first of many' } });
    expect(answer.byRule[0].example.message.length).toBeLessThanOrEqual(120);
    expect(answer.findings).toHaveLength(6);
    await other.close();
  });

  it('counts the whole list, not the part that `limit` keeps', async () => {
    const other = await connect(checkWith(findings));
    const answer = structured(await other.callTool({ name: 'check_brand', arguments: { limit: 1 } }));
    expect(answer.findings).toHaveLength(1);
    expect(answer.byRule.find((g: { code: string }) => g.code === 'a-rule').count).toBe(3);
    await other.close();
  });

  it('gives an empty list for a brand with no findings', async () => {
    const other = await connect(checkWith([]));
    expect(structured(await other.callTool({ name: 'check_brand', arguments: {} })).byRule).toEqual([]);
    await other.close();
  });

  it('names the code prefix of each plugin that did not run, so a zero count is not read as a clean brand', async () => {
    const other = await connect(checkWith(findings, ['blazon.copy', 'acme.house-style']));
    const answer = structured(await other.callTool({ name: 'check_brand', arguments: {} }));
    expect(answer.pluginsSkipped).toEqual(['blazon.copy', 'acme.house-style']);
    expect(answer.rulesNotRun).toEqual(['blazon.copy/*', 'acme.house-style/*']);
    expect(answer.warnings.join(' ')).toMatch(/codes that start with blazon\.copy\/ .*not run/);
    await other.close();
  });

  it('has no rulesNotRun when no plugin is configured', async () => {
    const other = await connect(checkWith(findings));
    expect(structured(await other.callTool({ name: 'check_brand', arguments: {} })).rulesNotRun).toBeUndefined();
    await other.close();
  });
});
