import axios from 'axios';
import { formatEther } from 'ethers';
import { ETHERSCAN_BATCH_SIZE, STORAGE_KEYS } from '../config';
import { chainName, DEFAULT_CHAIN_ID } from './chains';
import { schedule } from './limiter';
import { readString, writeString } from './storage';
import { emit } from './telemetry';

const API_URL = 'https://api.etherscan.io/v2/api';

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
async function request(params, { signal, apiKey, chainId = DEFAULT_CHAIN_ID } = {}) {
  // Every call is spaced by the limiter, so no combination of chains, batch
  // size and roll cadence can push the account through its calls-per-second.
  const { data } = await schedule(() =>
    axios.get(API_URL, {
      params: { chainid: chainId, apikey: apiKey ?? getApiKey(), ...params },
      signal,
    }),
  );

  if (!Array.isArray(data?.result)) {
    throw new EtherscanError(
      typeof data?.result === 'string' ? data.result : (data?.message ?? 'Unknown Etherscan error'),
    );
  }
  return data.result;
}

/**
 * Non-list endpoints answer with an object, which `request` rejects by design.
 *
 * @returns {Promise<object>}
 */
async function requestObject(params, { signal, apiKey, chainId = DEFAULT_CHAIN_ID } = {}) {
  const { data } = await schedule(() =>
    axios.get(API_URL, {
      params: { chainid: chainId, apikey: apiKey ?? getApiKey(), ...params },
      signal,
    }),
  );

  if (data?.status !== '1' || !data?.result || typeof data.result !== 'object') {
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

/** Calls one roll of `count` addresses costs across `chains`. */
export const callsPerRoll = (count, chains) =>
  Math.ceil(count / ETHERSCAN_BATCH_SIZE) * Math.max(chains.length, 1);

/**
 * Looks up balances for any number of addresses, on any number of chains.
 *
 * Etherscan V2 is one endpoint and one key for every chain it serves, so this
 * is the same call with a different `chainid` — but it is emphatically not
 * free: each chain multiplies the calls a roll costs, against an account-wide
 * quota. See `callsPerRoll`, which the chain panel puts on screen.
 *
 * @param {string[]} addresses
 * @param {{ chains?: number[], signal?: AbortSignal, onBatch?: (progress: {completed: number, total: number}) => void }} options
 * @returns {Promise<Map<string, Record<number, number>>>} lowercased address -> balance by chain
 */
export async function fetchBalances(addresses, { chains, signal, onBatch } = {}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new EtherscanError('No Etherscan API key. Add yours from the header to see balances.');
  }

  const chainIds = chains?.length ? chains : [DEFAULT_CHAIN_ID];
  const batches = chunk(addresses, ETHERSCAN_BATCH_SIZE);
  const total = batches.length * chainIds.length;

  const balances = new Map();
  for (const address of addresses) balances.set(address.toLowerCase(), {});

  let completed = 0;

  for (const chainId of chainIds) {
    for (const [index, batch] of batches.entries()) {
      emit(
        'lookup',
        `${chainName(chainId)} · batch ${index + 1}/${batches.length} · ${batch.length} addrs`,
      );

      const result = await request(
        { module: 'account', action: 'balancemulti', address: batch.join(','), tag: 'latest' },
        { signal, apiKey, chainId },
      );

      for (const entry of result) {
        const amount = Number(formatEther(entry.balance ?? '0'));
        // Zero is the overwhelming answer; storing it for every address on
        // every chain makes the common record forty empty numbers wide.
        if (amount > 0) {
          const key = String(entry.account).toLowerCase();
          balances.set(key, { ...(balances.get(key) ?? {}), [chainId]: amount });
        }
      }

      completed += 1;
      onBatch?.({ completed, total });
    }
  }

  return balances;
}

/**
 * The account's own quota, straight from Etherscan.
 *
 * Rolling has a running cost and the app was silent about it; this is the one
 * number that says how much of the day's allowance a session has spent. It is
 * best-effort — the endpoint is not guaranteed on every plan, and a failure
 * here must never take a roll down with it.
 *
 * @returns {Promise<{used: number, limit: number, remaining: number, expiresIn: string}|null>}
 */
export async function fetchApiUsage({ signal } = {}) {
  if (!getApiKey()) return null;

  try {
    const result = await requestObject(
      { module: 'getapilimit', action: 'getapilimit' },
      { signal },
    );

    const used = Number(result.creditsUsed);
    const limit = Number(result.creditLimit);
    if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;

    return {
      used,
      limit,
      remaining: Number(result.creditsAvailable) || Math.max(0, limit - used),
      expiresIn: result.intervalExpiryTimespan ?? '',
    };
  } catch {
    return null;
  }
}
