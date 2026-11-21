import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The call state machine, against a child that is only an emitter, so the order of events is the test's and not the
// operating system's: an exit that comes after the call has ended, and a signal that fails in an unusual way.

const spawned = vi.hoisted(() => ({ child: undefined as unknown }));
vi.mock('node:child_process', () => ({ spawn: () => spawned.child }));

import { run } from '../../../src/plugins/host/call.js';

function fakeChild(pid: number | undefined) {
  return Object.assign(new EventEmitter(), { pid, stdout: new PassThrough(), stderr: new PassThrough() });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a call that has ended', () => {
  it('leaves no timer behind when the child exits after an error ended the call', async () => {
    vi.useFakeTimers();
    const child = fakeChild(undefined);
    spawned.child = child;
    const pending = run({ program: '/plugins/acme' });
    child.emit('error', Object.assign(new Error('spawn failed'), { code: 'EACCES' }));
    const result = await pending;
    expect(result.cause).toBe('start');
    child.emit('exit', 0, null); // late: the call has ended
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a late error from the child go uncaught', async () => {
    const child = fakeChild(undefined);
    spawned.child = child;
    const pending = run({ program: '/plugins/acme' });
    child.emit('error', new Error('first'));
    await pending;
    expect(() => child.emit('error', new Error('second'))).not.toThrow();
  });
});

describe('signalling the process group', () => {
  it('never throws, whatever the signal call fails with: a call never throws on a plugin', async () => {
    vi.useFakeTimers();
    const child = fakeChild(4242);
    spawned.child = child;
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('unexpected'), { code: 'EINVAL' });
    });
    const pending = run({ program: '/plugins/acme', timeout: 1 });
    await vi.advanceTimersByTimeAsync(1000); // the timeout asks the group to stop
    child.emit('exit', null, 'SIGTERM');
    child.emit('close');
    const result = await pending;
    expect(result.breakReason).toBe('timed out after 1s');
  });
});
