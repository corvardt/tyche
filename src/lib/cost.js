import {
  AUTO_ROLL_INTERVAL_MS,
  ETHERSCAN_BATCH_SIZE,
  ETHERSCAN_CALLS_PER_DAY,
  ETHERSCAN_CALLS_PER_SECOND,
} from '../config';

/**
 * What a given setting costs to run.
 *
 * Worth stating plainly, because the arithmetic is not obvious and the app used
 * to hide it entirely. One chain at forty keys is two calls a roll and one call
 * a second under auto — a quarter of the free tier's second-by-second budget,
 * and about 43% of its day. Three chains sits exactly on the per-second ceiling
 * and runs the daily allowance out in eighteen hours.
 *
 * The deeper point is `keysPerDay`. A quota buys a fixed number of *lookups*,
 * and every extra chain spends the same allowance re-asking about keys already
 * generated instead of generating new ones. Reading N chains multiplies the
 * chance any one key is funded by roughly N, and divides the keys reachable in
 * a day by exactly N. Those cancel. Multichain is not a better search; it is
 * the same search, spread — and since mainnet holds far more funded addresses
 * than the quiet chains, spreading it slightly lowers the odds per call.
 *
 * @param {{keysPerRoll: number, chains: number[], intervalMs?: number}} options
 */
export function describeCost({ keysPerRoll, chains, intervalMs = AUTO_ROLL_INTERVAL_MS }) {
  const chainCount = Math.max(chains.length, 1);
  const callsPerRoll = Math.ceil(keysPerRoll / ETHERSCAN_BATCH_SIZE) * chainCount;
  const callsPerSecond = callsPerRoll / (intervalMs / 1000);
  const callsPerDay = callsPerSecond * 86_400;

  const hoursToDailyCap = callsPerSecond > 0 ? ETHERSCAN_CALLS_PER_DAY / callsPerSecond / 3600 : Infinity;
  const keysPerDay = (ETHERSCAN_CALLS_PER_DAY * ETHERSCAN_BATCH_SIZE) / chainCount;

  return {
    chainCount,
    callsPerRoll,
    callsPerSecond,
    callsPerDay,
    hoursToDailyCap,
    keysPerDay,
    // Auto mode would outrun the plan's per-second limit at this setting. The
    // limiter will hold the line by slowing rolls down, so this is a warning
    // that the cadence will slip, not that anything will break.
    overRateLimit: callsPerSecond > ETHERSCAN_CALLS_PER_SECOND,
    overDailyLimit: callsPerDay > ETHERSCAN_CALLS_PER_DAY,
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
