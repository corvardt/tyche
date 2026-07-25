import {
  ETHERSCAN_BATCH_SIZE,
  ETHERSCAN_CALLS_PER_DAY,
  ETHERSCAN_CALLS_PER_SECOND,
  ETHERSCAN_RATE_SAFETY,
} from '../config';

/**
 * What a given setting costs to run, unscreened.
 *
 * This used to be arithmetic on the two-second auto interval. Auto is
 * continuous now, so nothing paces the calls but the limiter — which means the
 * rate is the plan's rate whatever the batch size or the chain count, and the
 * allowance goes at one speed: about ten hours to spend a free tier's day.
 *
 * What the settings still decide is what you get for it. `keysPerDay` is the
 * figure worth reading: an allowance buys *lookups*, and each chain added
 * spends the same budget re-asking about keys already generated rather than
 * generating new ones. Reading N chains multiplies the chance any one key is
 * funded by roughly N and divides the keys reachable in a day by exactly N.
 * Those cancel. Multichain is not a better search; it is the same search,
 * spread — and since mainnet holds far more funded addresses than the quiet
 * chains, spreading it slightly lowers the odds per call.
 *
 * None of this applies to a screened roll, which does not call the API at all.
 * There the ceiling is how fast the browser can make keys.
 *
 * @param {{keysPerRoll: number, chains: number[]}} options
 */
export function describeCost({ keysPerRoll, chains }) {
  const chainCount = Math.max(chains.length, 1);
  const callsPerRoll = Math.ceil(keysPerRoll / ETHERSCAN_BATCH_SIZE) * chainCount;

  // Saturated by construction: rolls follow each other with no gap, so the
  // limiter is the only thing setting the pace.
  const callsPerSecond = ETHERSCAN_CALLS_PER_SECOND * ETHERSCAN_RATE_SAFETY;
  const callsPerDay = callsPerSecond * 86_400;

  const hoursToDailyCap = ETHERSCAN_CALLS_PER_DAY / callsPerSecond / 3600;
  const keysPerDay = (ETHERSCAN_CALLS_PER_DAY * ETHERSCAN_BATCH_SIZE) / chainCount;

  // There is no `overDailyLimit` any more. Saturating the limiter spends a free
  // tier in about ten hours whatever is selected, so the flag was true for every
  // input it could be given and the panel wore its warning colour permanently.
  // A warning that never turns off is not one; `hoursToDailyCap` says the same
  // thing with a number that means something.
  return {
    chainCount,
    callsPerRoll,
    callsPerSecond,
    callsPerDay,
    hoursToDailyCap,
    keysPerDay,
  };
}

/** Total keyspace: every 160-bit address. */
export const KEYSPACE = 2 ** 160;

/**
 * The fraction of the keyspace a number of keys covers, as a decimal string.
 *
 * `toExponential` is the only honest rendering: at any rate a browser can
 * manage the figure has forty-odd leading zeros, and rounds to plain `0` in
 * every format that is not exponential. That it never visibly moves is the
 * point of the readout, not a fault in it.
 *
 * @param {number} keys
 */
export const keyspaceFraction = (keys) => (keys > 0 ? (keys / KEYSPACE).toExponential(2) : '0');

/**
 * Years to cover the keyspace at the observed rate. Returns Infinity at rest.
 *
 * @param {number} keysPerSecond
 */
export const yearsToExhaust = (keysPerSecond) =>
  keysPerSecond > 0 ? KEYSPACE / keysPerSecond / 31_557_600 : Infinity;
