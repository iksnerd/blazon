import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../support/spawn';
import { merge } from '../../scripts/conformance-reads.js';
import { ROOT_DIR } from '../plugins/support/spec.js';
import { tempDir } from '../support/project';

// What the host's tests recorded, as the `reads-v1` a conformance report is made from: the merge of the lines, and the recorder itself run in
// a test that fails, since a report that calls a failed test a pass is the one mistake it must not make.

const line = (file: string, passed: boolean, test = 't1', attempt = 0) => `${JSON.stringify({ file, test, attempt, passed })}\n`;

describe('conformance-reads merge', () => {
  it('has one entry for each file, sorted, in the reads-v1 shape', () => {
    expect(merge(line('core/scrub/b.json', true) + line('core/admit/refuse/a.json', true))).toEqual({
      format: 'reads-v1',
      reads: [
        { file: 'core/admit/refuse/a.json', passed: true },
        { file: 'core/scrub/b.json', passed: true },
      ],
    });
  });

  it('passes a file only when every test that read it passed', () => {
    const reads = merge(
      line('tree-digest/valid/x.json', true, 'a') + line('tree-digest/valid/x.json', false, 'b') + line('tree-digest/valid/x.json', true, 'c') + line('core/name/y.json', true),
    ).reads;
    expect(reads).toEqual([
      { file: 'core/name/y.json', passed: true },
      { file: 'tree-digest/valid/x.json', passed: false },
    ]);
  });

  it('takes the last attempt of a retried test: one that failed and then passed passed, and one that passed and then failed did not', () => {
    expect(merge(line('a.json', false, 't', 0) + line('a.json', true, 't', 1)).reads).toEqual([{ file: 'a.json', passed: true }]);
    expect(merge(line('a.json', true, 't', 0) + line('a.json', false, 't', 1)).reads).toEqual([{ file: 'a.json', passed: false }]);
  });

  it('fails a file that a test read twice in one attempt when either read was in a failing test', () => {
    expect(merge(line('a.json', true) + line('a.json', false)).reads).toEqual([{ file: 'a.json', passed: false }]);
  });

  it('is empty for no lines, and refuses a line the tests do not write', () => {
    expect(merge('').reads).toEqual([]);
    expect(() => merge('{"file":"a.json","passed":true}\n')).toThrow(/not a line the tests write/);
    expect(() => merge('{"file":"a.json","test":"t","attempt":-1,"passed":true}\n')).toThrow(/not a line the tests write/);
    expect(() => merge('not json\n')).toThrow();
  });
});

describe('the recorder, run in tests that pass and fail', () => {
  it('marks a corpus file read by a failing test as failing, and one read by a passing test as passing', () => {
    const root = tempDir('blazon-reads-');
    const spec = path.join(ROOT_DIR, 'test/plugins/support/spec.ts');
    const allowed = "['about', 'rfc', 'program', 'timeout_s', 'stdin', 'env', 'host_env', 'expect']";
    fs.writeFileSync(
      path.join(root, 'recorder.test.ts'),
      [
        "import { it, expect } from 'vitest';",
        `import { caseFiles, loadCase } from ${JSON.stringify(spec)};`,
        `it('reads a case and passes', () => { loadCase(caseFiles('call')[0]!, ${allowed}); });`,
        `it('reads another case and fails', () => { loadCase(caseFiles('call')[1]!, ${allowed}); expect(1).toBe(2); });`,
      ].join('\n'),
    );
    const out = path.join(root, 'reads.json');
    const ran = spawnSync(process.execPath, [path.join(ROOT_DIR, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=dot'], {
      cwd: root,
      encoding: 'utf-8',
      env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), CONFORMANCE_READS: out },
    });
    expect(ran.status, 'the second test is meant to fail').toBe(1);
    const reads = merge(fs.readFileSync(`${out}.lines`, 'utf-8')).reads;
    const first = path.relative(
      path.join(ROOT_DIR, 'test/spec'),
      fs
        .readdirSync(path.join(ROOT_DIR, 'test/spec/core/call'))
        .sort()
        .map((name) => path.join(ROOT_DIR, 'test/spec/core/call', name))[0]!,
    );
    expect(reads).toHaveLength(2);
    expect(reads.find((read) => read.file === first.split(path.sep).join('/'))).toEqual({ file: first.split(path.sep).join('/'), passed: true });
    expect(reads.filter((read) => !read.passed)).toHaveLength(1);
  }, 60000);
});
