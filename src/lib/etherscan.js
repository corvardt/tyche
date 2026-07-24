import axios from 'axios';
import { formatEther } from 'ethers';
import { ETHERSCAN_BATCH_SIZE, STORAGE_KEYS } from '../config';
import { readString, writeString } from './storage';

const API_URL = 'https://api.etherscan.io/v2/api';
const MAINNET = 1;

/**
 * Optional build-time fallback, kept only so a self-hosted deployment can bake in
 * its own key. The app does not ship one: this is a client-side bundle, so any
 * key compiled into it would be readable by every visitor. Each user supplies
 * their own at runtime instead, and it never leaves their browser.
 */
const ENV_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY ?? '';

/** Thrown for API-level failures, which Etherscan reports with HTTP 200. */
export class EtherscanError extends Error {
  name = 'EtherscanError';
}

/** The key in use: whatever the user saved in this browser, else the build-time one. */
export function getApiKey() {
  return readString(STORAGE_KEYS.apiKey, '') || ENV_API_KEY;
}

/** @param {string} value  pass '' to clear the saved key */
export function saveApiKey(value) {
  writeString(STORAGE_KEYS.apiKey, value.trim());
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Etherscan answers errors with `{ status: "0", result: "<message>" }` and a 200
 * status code, so a bare `.result` read silently yields a string where a list is
 * expected. Everything funnels through here to make that a thrown error instead.
 */
async function request(params, { signal, apiKey } = {}) {
  const { data } = await axios.get(API_URL, {
    params: { chainid: MAINNET, apikey: apiKey ?? getApiKey(), ...params },
    signal,
  });

  if (!Array.isArray(data?.result)) {
    throw new EtherscanError(
      typeof data?.result === 'string' ? data.result : (data?.message ?? 'Unknown Etherscan error'),
    );
  }
  return data.result;
}

/**
 * Round-trips a key against the live API so a typo is caught while the user is
 * still looking at the input, rather than surfacing as a failed roll later.
 *
 * @param {string} candidate
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function verifyApiKey(candidate) {
  const key = candidate.trim();
  if (!key) return { ok: false, message: 'Enter a key first.' };

  try {
    await request(
      {
        module: 'account',
        action: 'balancemulti',
        address: '0x0000000000000000000000000000000000000000',
        tag: 'latest',
      },
      { apiKey: key },
    );
    return { ok: true };
  } catch (cause) {
    return { ok: false, message: cause.message ?? 'Could not reach Etherscan.' };
  }
}

/**
 * Looks up balances for any number of addresses, transparently splitting them
 * into API-sized batches.
 *
 * @param {string[]} addresses
 * @param {{ signal?: AbortSignal, onBatch?: (accounts: {address: string, balance: number}[]) => void }} options
 * @returns {Promise<Map<string, number>>} lowercased address -> balance in ETH
 */
export async function fetchBalances(addresses, { signal, onBatch } = {}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new EtherscanError('No Etherscan API key. Add yours from the header to see balances.');
  }

  const balances = new Map();

  for (const batch of chunk(addresses, ETHERSCAN_BATCH_SIZE)) {
    const result = await request(
      { module: 'account', action: 'balancemulti', address: batch.join(','), tag: 'latest' },
      { signal, apiKey },
    );

    const parsed = result.map((entry) => ({
      address: entry.account,
      balance: Number(formatEther(entry.balance ?? '0')),
    }));

    for (const { address, balance } of parsed) balances.set(address.toLowerCase(), balance);
    onBatch?.(parsed);
  }

  return balances;
}
