import { beforeEach, describe, expect, it } from 'vitest';

import { ETHERSCAN_CALLS_PER_SECOND } from '../config';
import { resetLimiter, schedule } from './limiter';

describe('the rate limiter', () => {
  beforeEach(() => resetLimiter());

  it('holds the steady rate under the plan ceiling', async () => {
    // Not at it: spacing calls exactly on the limit puts every one on the
    // boundary of whatever window the far end measures.
    const started = Date.now();
    const calls = 8;
    for (let i = 0; i < calls; i += 1) await schedule(async () => i);

    const rate = (calls - 1) / ((Date.now() - started) / 1000);
    expect(rate).toBeLessThan(ETHERSCAN_CALLS_PER_SECOND);
    expect(rate).toBeGreaterThan(ETHERSCAN_CALLS_PER_SECOND * 0.7);
  });

  it('spaces concurrent callers too, not just sequential ones', async () => {
    // A roll issues its lookups in a loop; nothing may slip between them.
    const at = [];
    await Promise.all(
      Array.from({ length: 6 }, () => schedule(async () => at.push(Date.now()))),
    );

    at.sort((a, b) => a - b);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    const floor = 1000 / ETHERSCAN_CALLS_PER_SECOND - 1;
    for (const gap of gaps) expect(gap).toBeGreaterThan(floor * 0.8);
  });

  it('passes a result through untouched', async () => {
    await expect(schedule(async () => 'through')).resolves.toBe('through');
  });

  it('lets one failure reject its own caller and nobody else', async () => {
    // Chaining the queue to each task's result would stall every request behind
    // a failed one and reject an unrelated caller's promise.
    const failing = schedule(async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await expect(schedule(async () => 'still going')).resolves.toBe('still going');
  });
});
