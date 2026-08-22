/** Wallets generated per roll, unless the reader picks another size. */
export const KEYS_PER_ROLL = 40;

/** Offered sizes. Each is a whole number of API calls per chain. */
export const KEYS_PER_ROLL_OPTIONS = [20, 40, 100, 200];

/** Etherscan's `balancemulti` accepts at most 20 addresses per call. */
export const ETHERSCAN_BATCH_SIZE = 20;

/**
 * The free tier allows 3 calls/second and 100,000 calls/day. Everything is
 * spaced to that ceiling; a paid key may raise it, and nothing here breaks if
 * it is left where it is.
 *
 * Source: https://docs.etherscan.io/resources/rate-limits
 */
export const ETHERSCAN_CALLS_PER_SECOND = 3;

/**
 * Aim under the stated rate rather than exactly at it. Spacing calls on the
 * limit puts every one on the boundary of whatever window the far end measures,
 * and a rejected roll costs more than being a tenth slow.
 */
export const ETHERSCAN_RATE_SAFETY = 0.9;
export const ETHERSCAN_CALLS_PER_DAY = 100_000;

/**
 * How long a batch stays on screen before another may replace it.
 *
 * Auto used to roll on a two-second timer, which made sense when a roll cost
 * two API calls and 300ms of key generation. It does not now: screening removes
 * the API from an ordinary roll entirely, so the pause was the slowest thing
 * left. Auto rolls continuously instead, and this is the one thing still paced:
 * a display constraint, not a rate limit. Batches that land inside it are
 * still generated, screened and counted; they are simply not drawn, which also
 * spares them their identicons. Encoding two hundred of those costs ~266ms,
 * more than making the keys in the first place.
 */
export const SHEET_MIN_MS = 400;

/**
 * How many drawn batches can be gone back to.
 *
 * Only the batches that reached the sheet are held: those are the ones paced by
 * `SHEET_MIN_MS`, and so the ones anyone had a chance to look at. A hundred of
 * them is forty seconds of auto at that pace, and at the largest roll size a few
 * megabytes of keys, which is nothing next to what `rec` is allowed to hold.
 */
export const HISTORY_DEPTH = 100;

/**
 * Consecutive failed rolls before auto mode switches itself off. A wrong key or
 * an exhausted rate limit fails every roll, and auto answered that by asking
 * again every two seconds indefinitely, which, for a rate limit, is the one
 * response guaranteed not to clear it.
 */
export const AUTO_STOP_AFTER_ERRORS = 3;

/** How long a fetched ETH price stays fresh, so a roll loop can't hammer CoinGecko. */
export const PRICE_MAX_AGE_MS = 60_000;

/**
 * Ceiling on what `rec` holds before it stops taking more.
 *
 * Recording follows the roll now rather than the sheet, and a screened roll
 * lands about eighty times a second: every batch means thousands of keys a
 * second into a buffer that is only written when the reader stops. Unbounded,
 * a session left running fills the tab's memory with a file nobody asked for.
 * At forty thousand rolls of forty this is a ~22MB download, which is already
 * more than anyone reads.
 */
export const MAX_RECORDED_KEYS = 200_000;

/**
 * Known-funded address (Binance hot wallet) swapped into a test-mode batch so the
 * "you found one" path can be exercised without waiting for a 1-in-2^160 event.
 */
export const TEST_MODE_ADDRESS = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

export const STORAGE_KEYS = {
  apiKey: 'etherscanApiKey',
  keysChecked: 'keys',
  favorites: 'favTable',
  hits: 'stonks',
  ethPrice: 'EthPrice',
  chains: 'chains',
  keysPerRoll: 'keysPerRoll',
  verbose: 'verbose',
  screening: 'screening',
  // Per-origin, unlike the medium: the coating is this instrument's, while
  // dark-or-light is shared across corvardt.com in a cookie.
  palette: 'palette',
};
