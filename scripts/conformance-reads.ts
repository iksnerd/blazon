// Turns what the host's own tests recorded (CONFORMANCE_READS, see test/plugins/support/spec.ts) into a `reads-v1` file: one entry for each
// corpus file a test read, a path relative to the corpus and whether every test that read it passed.
//
//   CONFORMANCE_READS=reads.json npx vitest run test/plugins/host && npx tsx scripts/conformance-reads.ts reads.json
//
// A file no test read is not in it, so a report made from it shows that file as not run and never as a pass.
import fs from 'node:fs';

/**
 * The reads-v1 document for the lines the tests wrote. A line is a file, the test that read it, the attempt of that test and whether the
 * attempt passed. A retried test counts by its last attempt, and a file passes only if every test that read it did.
 */
export function merge(lines: string): { format: 'reads-v1'; reads: { file: string; passed: boolean }[] } {
  const seen = new Map<string, Map<string, { attempt: number; passed: boolean }>>();
  for (const line of lines.split('\n').filter(Boolean)) {
    const { file, test, attempt, passed } = JSON.parse(line) as { file?: unknown; test?: unknown; attempt?: unknown; passed?: unknown };
    if (typeof file !== 'string' || typeof test !== 'string' || !Number.isInteger(attempt) || (attempt as number) < 0 || typeof passed !== 'boolean')
      throw new Error(`not a line the tests write: ${line}`);
    const tests = seen.get(file) ?? new Map<string, { attempt: number; passed: boolean }>();
    const before = tests.get(test);
    if (!before || (attempt as number) > before.attempt) tests.set(test, { attempt: attempt as number, passed });
    else if (attempt === before.attempt) tests.set(test, { attempt: before.attempt, passed: before.passed && passed });
    seen.set(file, tests);
  }
  const reads = [...seen].map(([file, tests]) => ({ file, passed: [...tests.values()].every((result) => result.passed) }));
  return { format: 'reads-v1', reads: reads.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : 0)) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: tsx scripts/conformance-reads.ts <the CONFORMANCE_READS file>');
    process.exit(2);
  }
  const lines = fs.existsSync(`${out}.lines`) ? fs.readFileSync(`${out}.lines`, 'utf-8') : '';
  const reads = merge(lines);
  if (reads.reads.length === 0) {
    console.error(`no corpus file was read: run the tests with CONFORMANCE_READS=${out} first`);
    process.exit(1);
  }
  fs.writeFileSync(out, `${JSON.stringify(reads, null, 1)}\n`);
  fs.rmSync(`${out}.lines`);
  const failed = reads.reads.filter((r) => !r.passed).length;
  console.log(`${out}: ${reads.reads.length} files read, ${failed} failing`);
}
