import axios from 'axios';
import { PRICE_MAX_AGE_MS, STORAGE_KEYS } from '../config';
import { readNumber, writeString } from './storage';

const PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&precision=3';

let cache = { value: null, fetchedAt: 0 };

/**
 * ETH price in USD. Auto mode rolls every 2s; without this cache that was one
 * CoinGecko call per roll, which their free tier rate-limits within a minute.
 * Falls back to the last known price (persisted) when the request fails.
 *
 * @returns {Promise<number|null>}
 */
export async function fetchEthPrice({ signal } = {}) {
  const now = Date.now();
  if (cache.value !== null && now - cache.fetchedAt < PRICE_MAX_AGE_MS) {
    return cache.value;
  }

  try {
    const { data } = await axios.get(PRICE_URL, { signal });
    const price = Number(data?.ethereum?.usd);
    if (!Number.isFinite(price)) throw new Error('Malformed price response');

    cache = { value: price, fetchedAt: now };
    writeString(STORAGE_KEYS.ethPrice, String(price));
    return price;
  } catch {
    const stored = readNumber(STORAGE_KEYS.ethPrice, 0);
    return stored || cache.value;
  }
}
