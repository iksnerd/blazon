import { describe, it, expect } from 'vitest';
import { Breaker } from '../../../src/plugins/roles/breaker.js';
import { RunBreakers } from '../../../src/plugins/roles/gate.js';
import { scrub, REDACTED } from '../../../src/plugins/host/scrub.js';
import { encodings } from '../../../src/plugins/wire/forms.js';
import { admit, type Labels, type Flows } from '../../../src/plugins/host/admit.js';
import { decodeManifest } from '../../../src/plugins/wire/manifest.js';
import { TEST_ROLE, caseFiles, loadCase, name } from '../support/spec.js';

// RFC 0005 sections 7 (the breaker), 3.5 (scrubbing) and 3.5 to 3.6 (admission).

describe('the breaker (7)', () => {
  for (const file of caseFiles('breaker')) {
    it(`agrees with ${name(file)}`, () => {
      const found = loadCase(file, ['about', 'rfc', 'sequence', 'opens_after_index']);
      const breakers = new RunBreakers();
      const plugin = 'plugin';
      let opened: number | null = null;
      found.sequence.forEach((call: string, index: number) => {
        expect(['break', 'answer', 'exit-2'], `unknown call ${call}`).toContain(call);
        breakers.record(plugin, call as 'break' | 'answer' | 'exit-2');
        const open = breakers.stopped(plugin) !== undefined;
        if (opened === null && open) opened = index;
        if (opened !== null) expect(open, `closed again at call ${index} (${found.about})`).toBe(true);
      });
      expect(opened, found.about).toBe(found.opens_after_index);
    });
  }

  it('has a threshold the host sets', () => {
    const breaker = new Breaker(2);
    breaker.record(true);
    expect(breaker.open).toBe(false);
    breaker.record(true);
    expect(breaker.open).toBe(true);
  });

  it('is closed when new: it never carries into the next unit of work', () => {
    const a = new Breaker();
    for (let i = 0; i < 3; i++) a.record(true);
    expect(a.open).toBe(true);
    expect(new Breaker().open).toBe(false);
  });
});

describe('scrubbing (3.5)', () => {
  for (const file of caseFiles('scrub')) {
    it(`agrees with ${name(file)}`, () => {
      const found = loadCase(file, ['about', 'rfc', 'secrets', 'text', 'expect']);
      expect(found.expect.absent.length && found.expect.present.length, 'a case names what must go and what must stay').toBeTruthy();
      const got = scrub(found.text, found.secrets);
      for (const gone of found.expect.absent) expect(got, `${found.about}: ${JSON.stringify(gone)} is still in ${JSON.stringify(got)}`).not.toContain(gone);
      for (const kept of found.expect.present) expect(got, `${found.about}: ${JSON.stringify(kept)} is gone from ${JSON.stringify(got)}`).toContain(kept);
    });
  }

  it('takes bytes and returns bytes', () => {
    const got = scrub(Buffer.from('a tok-1x b'), ['tok-1x']);
    expect(Buffer.isBuffer(got)).toBe(true);
    expect(got.toString()).toBe(`a ${REDACTED} b`);
  });

  it('matches a value as text and never as a pattern, and an empty secret matches nothing', () => {
    expect(scrub('a.*b and axb', ['a.*b'])).toBe(`${REDACTED} and axb`);
    expect(scrub('nothing here', [''])).toBe('nothing here');
  });

  it('removes overlapping secrets together and leaves no tail of either', () => {
    expect(scrub('xxabcdefyy', ['abcd', 'cdef'])).toBe(`xx${REDACTED}yy`);
  });
});

describe('the forms a leaked value takes (3.5)', () => {
  it('are the value, base64 in both alphabets without padding, and URL-encoded as a query, with %20, and as a path segment', () => {
    const forms = encodings('a b+/=:').map((form) => form.toString()).slice(0, 6);
    expect(forms).toEqual([
      'a b+/=:',
      'YSBiKy89Og',
      'YSBiKy89Og',
      'a+b%2B%2F%3D%3A',
      'a%20b%2B%2F%3D%3A',
      'a%20b+%2F=:',
    ]);
  });

  it('differ for a value with characters that change when encoded', () => {
    const forms = encodings('sk_check_>>>???/+ &=').map((form) => form.toString());
    expect(new Set(forms).size).toBe(forms.length);
  });

  it('percent-encodes the characters JavaScript\'s own encoder leaves alone: ! * \' ( )', () => {
    expect(encodings("a!*'()b")[4]!.toString()).toBe('a%21%2A%27%28%29b');
  });
});

describe('admission (3.5 and 3.6)', () => {
  it.each([['admit/start', true], ['admit/refuse', false]] as const)('every case in %s is %s', (folder, admitted) => {
    for (const file of caseFiles(folder)) {
      const found = loadCase(file, ['about', 'rfc', 'manifest', 'labels', 'marked_fields', 'pinned', 'mode', 'flows', 'expect']);
      const want = found.expect;
      expect(want.admit, `${name(file)} is in ${folder} but says admit=${want.admit}`).toBe(admitted);
      expect('reason' in want && admitted, `${name(file)}: reason belongs to a refusal`).toBe(false);
      expect('warn' in want && !admitted, `${name(file)}: warn belongs to an admission`).toBe(false);

      const manifest = decodeManifest(JSON.stringify(found.manifest).replaceAll('$role', TEST_ROLE), { roles: [TEST_ROLE], secretFields: found.marked_fields });
      const labels: Labels = { env: found.labels.env, fields: found.labels.fields, delegated: found.labels.delegated };
      const flows: Flows = { returnsSecret: found.flows.returns_secret, authorizes: found.flows.authorizes };
      const got = admit(manifest, labels, found.marked_fields, found.pinned, found.mode, flows);
      expect([got.admitted, got.warn, got.reason], `${name(file)}: ${found.about}`).toEqual([want.admit, want.warn ?? false, want.reason ?? '']);
    }
  });
});
