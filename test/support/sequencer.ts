import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { isBrowserTest } from './browser-tests.js';
import { CHROME_SLOTS } from './chrome-limits.js';
import { slotAwareOrder, withEstimates } from './schedule.js';

// vitest.config.ts, sequence.sequencer: vitest's own order (failed first, then the longest first, from its results cache), with the files that
// start Chrome spread out so that a worker does not sit waiting for a Chrome slot (test/support/schedule.ts). Sharding is vitest's own.

export class ChromeSlotSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    // One project and one group is what this repository has; anything else keeps vitest's order
    const first = sorted[0];
    if (!first || sorted.some((spec) => spec.project !== first.project)) return sorted;
    const planned = withEstimates(
      sorted.map((spec) => ({ item: spec, duration: this.ctx.cache.getTestSpecificationResult(spec)?.duration, chrome: isBrowserTest(spec.moduleId) })),
    );
    return slotAwareOrder(planned, first.project.config.maxWorkers, CHROME_SLOTS);
  }
}
