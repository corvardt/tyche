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
export const ETHERSCAN_CALLS_PER_DAY = 100_000;

/** Delay between rolls while auto mode is running. */
export const AUTO_ROLL_INTERVAL_MS = 2000;

/**
 * Consecutive failed rolls before auto mode switches itself off. A wrong key or
 * an exhausted rate limit fails every roll, and auto answered that by asking
 * again every two seconds indefinitely — which, for a rate limit, is the one
 * response guaranteed not to clear it.
 */
export const AUTO_STOP_AFTER_ERRORS = 3;

/** How long a fetched ETH price stays fresh, so a roll loop can't hammer CoinGecko. */
export const PRICE_MAX_AGE_MS = 60_000;

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
};
