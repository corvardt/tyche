import makeBlockie from 'ethereum-blockies-base64';
import { KEYS_PER_ROLL_OPTIONS } from '../config';

/**
 * Identicons, encoded once per address.
 *
 * `ethereum-blockies-base64` is a pure-JS PNG encoder (deflate, no canvas), and
 * it was being called inline in the render body of both the sheet and the
 * table. Forty encodes cost ~53ms and they ran on every render, including every
 * progress tick of a roll and again when a batch is republished with its
 * balances filled in: the same forty addresses, encoded twice a roll.
 *
 * The cache is bounded because it cannot be otherwise: each data URI is ~22kB,
 * so a sheet is ~870kB and an hour of auto mode would pin about 1.5GB. LRU with
 * a small ceiling keeps the working set (the batch on screen, the batch behind
 * it, and an open favourites sheet) and lets everything else go.
 */
/**
 * Room for the batch on screen and the batch still behind it, at the largest
 * size a roll can be.
 *
 * This was a flat 128, chosen when a roll was always forty. Adding a 200-key
 * option silently broke it: the working set no longer fit, so every repaint
 * evicted the entries it was about to ask for and the cache missed on all two
 * hundred cells: 306ms of PNG encoding per repaint, at exactly the setting
 * where the cache mattered most. Derived from the options rather than picked,
 * so it cannot fall behind them again.
 */
const CAPACITY = Math.max(...KEYS_PER_ROLL_OPTIONS) * 2;

const cache = new Map();

/** @param {string} address @returns {string} PNG data URI */
export function blockie(address) {
  const hit = cache.get(address);
  if (hit !== undefined) {
    // Re-insert to mark it most-recently-used; Map iterates in insertion order.
    cache.delete(address);
    cache.set(address, hit);
    return hit;
  }

  const uri = makeBlockie(address);
  if (cache.size >= CAPACITY) cache.delete(cache.keys().next().value);
  cache.set(address, uri);
  return uri;
}
