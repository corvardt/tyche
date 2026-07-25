import { ETHERSCAN_CALLS_PER_SECOND, ETHERSCAN_RATE_SAFETY } from '../config';
import { emit } from './telemetry';

/**
 * Spaces outgoing Etherscan calls so a roll cannot outrun the plan.
 *
 * This used to be a backstop. Auto rolled on a two-second timer, which held a
 * single chain to about a call a second on its own, and the limiter existed for
 * the settings that multiplied past the ceiling. Auto runs continuously now, so
 * nothing else spaces anything: this is the only thing standing between a roll
 * and the plan's rate, under every setting. Answering a rate limit by retrying
 * into it is the one response guaranteed not to clear it.
 *
 * The queue is a single chain of promises rather than a token bucket: requests
 * are already issued in a loop, and what matters is the floor between them, not
 * a burst allowance. Everything funnels through `schedule`, so the limit holds
 * across chains, batches and concurrent rolls alike.
 */
const MIN_INTERVAL_MS = 1000 / (ETHERSCAN_CALLS_PER_SECOND * ETHERSCAN_RATE_SAFETY);

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
    if (since < MIN_INTERVAL_MS) {
      const held = Math.round(MIN_INTERVAL_MS - since);
      // Worth saying out loud: on an unscreened run this is what auto is
      // waiting on for most of its time, and it is otherwise invisible.
      emit('throttle', `held ${held}ms · ${ETHERSCAN_CALLS_PER_SECOND}/s cap`);
      await wait(held);
    }
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
