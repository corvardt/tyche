import { ethers } from 'ethers';
import { KEYS_PER_ROLL, TEST_MODE_ADDRESS } from '../config';

/**
 * The app's core record. Replaces the old `[address, privateKey, balance]`
 * tuples, which forced every call site to remember what index 2 meant.
 *
 * @typedef {object} Account
 * @property {string} address
 * @property {string} privateKey  64 hex chars, no 0x prefix
 * @property {number|null} balance  ETH, or null when not yet scanned
 */

/** @returns {Account} */
function randomAccount() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey.slice(2),
    balance: null,
  };
}

/**
 * Generates a fresh batch. In test mode the last slot is replaced with a known
 * funded address so the "found one" path can be exercised on demand.
 *
 * @returns {Account[]}
 */
export function generateAccounts({ testMode = false } = {}) {
  const count = testMode ? KEYS_PER_ROLL - 1 : KEYS_PER_ROLL;
  const accounts = Array.from({ length: count }, randomAccount);

  if (testMode) {
    accounts.push({
      address: TEST_MODE_ADDRESS,
      privateKey: 'ThisWouldBeThePrivateKey',
      balance: null,
    });
  }
  return accounts;
}

/** @param {Account} account */
export const isFunded = (account) => Number(account?.balance) > 0;

/**
 * Coerces a stored favourite into an {@link Account}.
 *
 * Favourites used to be persisted as `[address, privateKey, balance, index]`
 * tuples, so anything already sitting in a user's localStorage is migrated here
 * rather than silently dropped.
 *
 * @returns {Account|null} null when the entry is unusable
 */
export function normaliseAccount(entry) {
  if (!entry) return null;

  const [address, privateKey, balance] = Array.isArray(entry)
    ? entry
    : [entry.address, entry.privateKey, entry.balance];

  if (typeof address !== 'string' || typeof privateKey !== 'string') return null;
  if (!address || !privateKey) return null;

  return { address, privateKey, balance: Number(balance) || 0 };
}

/** Sums balances, ignoring unscanned entries. @param {Account[]} accounts */
export const totalBalance = (accounts) =>
  accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
