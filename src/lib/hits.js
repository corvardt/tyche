import { computeAddress } from 'ethers';
import { STORAGE_KEYS } from '../config';
import { readJSON, readString } from './storage';

/**
 * @typedef {object} Hit
 * @property {string} address
 * @property {string} privateKey  64 hex chars, no 0x prefix
 * @property {number} balance     ETH
 * @property {string} [at]        ISO timestamp; absent on migrated entries
 */

/** Earlier versions stored `"<64 hex> has <n>Ξ"` segments joined with '; '. */
const LEGACY_ENTRY = /^([0-9a-fA-F]{64}) has (.+)Ξ$/;

/**
 * Recovers hits written in the old flat-string format.
 *
 * The address was never stored, but it does not need to have been: the private
 * key is right there, and deriving the address from it is the one thing this
 * app is built to do.
 *
 * @param {string} raw
 * @returns {Hit[]}
 */
function parseLegacy(raw) {
  return raw
    .split(';')
    .map((segment) => segment.trim().match(LEGACY_ENTRY))
    .filter(Boolean)
    .map(([, privateKey, balance]) => ({
      address: computeAddress(`0x${privateKey}`),
      privateKey,
      balance: Number(balance) || 0,
    }));
}

/**
 * Every hit this browser has ever recorded, oldest first.
 *
 * @returns {Hit[]}
 */
export function readHits() {
  const stored = readJSON(STORAGE_KEYS.hits, null);
  if (Array.isArray(stored)) return stored;

  const raw = readString(STORAGE_KEYS.hits, '');
  return raw ? parseLegacy(raw) : [];
}
