import { computeAddress, hexlify, randomBytes } from 'ethers';
import { KEYS_PER_ROLL, TEST_MODE_ADDRESS } from '../config';
import { DEFAULT_CHAIN_ID } from './chains';

/**
 * The app's core record. Replaces the old `[address, privateKey, balance]`
 * tuples, which forced every call site to remember what index 2 meant.
 *
 * `balances` is keyed by chain id and holds only what is actually there: a
 * scanned-and-empty address is `{}`, not a row of zeroes. It replaced a single
 * `balance` number, which could not say *where* an amount was once a roll could
 * be read against more than one chain — and 1 POL is not 1 Ξ, so there is no
 * honest way to add them into one figure.
 *
 * @typedef {object} Account
 * @property {string} address
 * @property {string} privateKey  64 hex chars, no 0x prefix
 * @property {Record<number, number>|null} balances  by chain id, or null when unscanned
 */

/**
 * One keypair, and nothing else.
 *
 * This was `Wallet.createRandom()`, which builds a full HD wallet: a BIP-39
 * mnemonic, then PBKDF2 over it at 2048 rounds of HMAC-SHA512, then a
 * derivation down m/44'/60'/0'/0/0. All of it was discarded one line later, and
 * it cost 300ms per roll of forty on the main thread. A random scalar and one
 * secp256k1 multiplication give the identical address in 15ms.
 *
 * @returns {Account}
 */
function randomAccount() {
  const privateKey = hexlify(randomBytes(32));
  return {
    address: computeAddress(privateKey),
    privateKey: privateKey.slice(2),
    balances: null,
  };
}

/**
 * Generates a fresh batch. In test mode the last slot is replaced with a known
 * funded address so the "found one" path can be exercised on demand.
 *
 * @returns {Account[]}
 */
export function generateAccounts({ testMode = false, count = KEYS_PER_ROLL } = {}) {
  const size = Math.max(1, testMode ? count - 1 : count);
  const accounts = Array.from({ length: size }, randomAccount);

  if (testMode) {
    accounts.push({
      address: TEST_MODE_ADDRESS,
      privateKey: 'ThisWouldBeThePrivateKey',
      balances: null,
    });
  }
  return accounts;
}

/** Anything, anywhere. @param {Account} account */
export const isFunded = (account) =>
  Object.values(account?.balances ?? {}).some((amount) => Number(amount) > 0);

/**
 * What an account holds, chain by chain, largest first. Empty for a miss.
 *
 * @param {Account} account
 * @returns {{chainId: number, amount: number}[]}
 */
export const fundedChains = (account) =>
  Object.entries(account?.balances ?? {})
    .map(([chainId, amount]) => ({ chainId: Number(chainId), amount: Number(amount) || 0 }))
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount);

/** @param {Account} account @param {number} chainId */
export const balanceOn = (account, chainId) => Number(account?.balances?.[chainId]) || 0;

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

  // Favourites saved before balances were per-chain carry one bare number, and
  // it could only ever have been mainnet.
  const balances = entry?.balances ?? (Number(balance) > 0 ? { [DEFAULT_CHAIN_ID]: Number(balance) } : {});

  return { address, privateKey, balances };
}

/**
 * Sums one chain across a batch.
 *
 * Deliberately per-chain: adding a Polygon balance to an Ethereum one produces
 * a number that is not denominated in anything.
 *
 * @param {Account[]} accounts @param {number} chainId
 */
export const totalBalance = (accounts, chainId = DEFAULT_CHAIN_ID) =>
  accounts.reduce((sum, account) => sum + balanceOn(account, chainId), 0);
