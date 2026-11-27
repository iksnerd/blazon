import { PUBLIC_NETWORK, refusedAddress, type Network } from '../../src/core/drift/fetch.js';

// The fetch refuses loopback addresses, so a test that serves a page from 127.0.0.1 passes this network to the function it calls. It is a
// parameter of those functions only: the command line has no flag and no environment variable for it.

/** The public network, plus 127.0.0.1 (the address the tests' servers listen on). Every other private address stays refused. */
export const TEST_LOOPBACK: Network = {
  resolve: PUBLIC_NETWORK.resolve,
  refused: (address) => (address === '127.0.0.1' ? undefined : refusedAddress(address)),
};

/** A resolver stub: each name gives the addresses listed for it, in turn when there is more than one answer (rebinding). */
export function stubNetwork(answers: Record<string, string[][]>, refused: Network['refused'] = refusedAddress): Network & { calls: string[] } {
  const calls: string[] = [];
  const asked = new Map<string, number>();
  return {
    calls,
    refused,
    resolve: async (host) => {
      calls.push(host);
      const list = answers[host];
      if (!list) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      const n = asked.get(host) ?? 0;
      asked.set(host, n + 1);
      return list[Math.min(n, list.length - 1)]!.map((address) => ({ address, family: address.includes(':') ? (6 as const) : (4 as const) }));
    },
  };
}
