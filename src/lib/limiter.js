import { ETHERSCAN_CALLS_PER_SECOND } from '../config';

/**
 * Spaces outgoing Etherscan calls so a roll cannot outrun the plan.
 *
 * A single-chain roll of forty is two calls, and auto mode fires one roll every
 * two seconds: one call a second, comfortably inside the free tier's three. Add
 * chains and that multiplies — three chains at the same cadence sits exactly on
 * the ceiling, and any more goes through it. Answering a rate limit by retrying
 * into it is the one response guaranteed not to clear it.
 *
 * The queue is a single chain of promises rather than a token bucket: requests
 * are already issued in a loop, and what matters is the floor between them, not
 * a burst allowance. Everything funnels through `schedule`, so the limit holds
 * across chains, batches and concurrent rolls alike.
 */
/**
 * Aim slightly under the stated ceiling. Spacing calls at exactly the limit
 * puts every call on the boundary of whatever window the far end measures, and
 * the cost of being wrong is a rejected roll; the cost of being 10% slow is
 * nothing anyone can see.
 */
const SAFETY = 0.9;
const MIN_INTERVAL_MS = 1000 / (ETHERSCAN_CALLS_PER_SECOND * SAFETY);

let tail = Promise.resolve();
let lastStart = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` no sooner than the rate limit allows.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function schedule(task) {
  const run = tail.then(async () => {
    const since = Date.now() - lastStart;
    if (since < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - since);
    lastStart = Date.now();
  });

  // The queue advances on scheduling alone. Chaining it to the task's own
  // result would make one failed request stall every request behind it, and
  // would reject an unrelated caller's promise.
  tail = run.catch(() => {});
  return run.then(task);
}

/** Test seam: forget the spacing so a suite is not paced by the real limiter. */
export function resetLimiter() {
  tail = Promise.resolve();
  lastStart = 0;
}
