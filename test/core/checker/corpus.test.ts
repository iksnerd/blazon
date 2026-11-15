import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKS, type CheckCode } from '../../../src/core/checker/catalogue.js';
import { DEFAULT_CONFIG } from '../../../src/core/config/index.js';
import { compileBlazonData } from '../../../src/core/index.js';
import { blazonPinFindings } from '../../../src/core/blazon-pin.js';
import { PluginRun } from '../../../src/plugins/roles/roles.js';
import { readLock } from '../../../src/plugins/pins/lock.js';
import type { Finding, BlazonConfig } from '../../../src/types/index.js';
import { tempProject } from '../../support/project.js';
import { CASES, CLEAN, type Setup } from '../../corpus/checks/cases.js';

// The conformance corpus of the checks: every code in the catalogue has a project that yields it at the catalogue's severity and a near-miss that
// does not. A new code with no case in test/corpus/checks/cases.ts fails here. Findings are compared by code and severity, never by order.

const codes = Object.keys(CHECKS) as CheckCode[];

/** What `blazon check` would collect for a project: the compile, then the pin, the plugin lock and the check plugins. */
async function findingsOf(setup: Setup): Promise<Finding[]> {
  const root = tempProject(setup.files ?? {});
  for (const file of setup.unreadable ?? []) fs.chmodSync(path.join(root, file), 0o000);
  for (const [name, files] of Object.entries(setup.packages ?? {})) {
    for (const [file, text] of Object.entries(files)) {
      const full = path.join(root, 'node_modules', name, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    fs.writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0', license: 'ISC' }));
  }
  const config = { ...DEFAULT_CONFIG, ...setup.config } as BlazonConfig;
  const data = await compileBlazonData(config, root);
  const found = [...data.findings, ...blazonPinFindings(root, setup.identity === undefined ? CLEAN : setup.identity), ...readLock(root).problems];
  if (setup.plugins) found.push(...(await new PluginRun(config, root).check({})));
  return found;
}

describe('check corpus', () => {
  it('has a case for every code in the catalogue, and for no other', () => {
    expect(codes.filter((code) => !(code in CASES))).toEqual([]);
    expect(Object.keys(CASES).filter((code) => !(code in CHECKS))).toEqual([]);
  });

  it.each(codes)('%s: the failing case yields it at the catalogue severity', async (code) => {
    const found = (await findingsOf(CASES[code]!.fail)).filter((f) => f.code === code);
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((f) => f.severity))).toEqual(new Set([CHECKS[code].severity]));
  });

  it.each(codes)('%s: the near-miss does not yield it', async (code) => {
    expect((await findingsOf(CASES[code]!.near)).filter((f) => f.code === code)).toEqual([]);
  });
});
