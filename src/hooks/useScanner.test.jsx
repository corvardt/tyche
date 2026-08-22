import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '../config';
import { readHits } from '../lib/hits';
import { useScanner } from './useScanner';

/**
 * The scanner is the one place where a bug is invisible: it runs eighty times a
 * second, most rolls make no call at all, and the sheet deliberately shows only
 * a fraction of what it does. Everything asserted here has at some point been
 * wrong in a way nothing on screen reported.
 */

const { fetchBalances, fetchEthPrice } = vi.hoisted(() => ({
  fetchBalances: vi.fn(),
  fetchEthPrice: vi.fn(),
}));

vi.mock('../lib/etherscan', async (importOriginal) => ({
  // `callsPerRoll` is arithmetic and stays real: what a roll costs is one of
  // the things under test.
  ...(await importOriginal()),
  fetchBalances,
}));

vi.mock('../lib/price', () => ({ fetchEthPrice }));

/** Every address a miss, which is the answer to all but one roll in 2^160. */
const allEmpty = (addresses) => new Map(addresses.map((address) => [address.toLowerCase(), {}]));

/** The event the instrument exists for, planted on the first address of a batch. */
const firstFunded = (addresses) =>
  new Map(addresses.map((address, i) => [address.toLowerCase(), i === 0 ? { 1: 1.5 } : {}]));

const setup = (options = {}) =>
  renderHook(() => useScanner({ chains: [1], keysPerRoll: 4, ...options }));

beforeEach(() => {
  // `restoreMocks` does not clear the call history of a module mock, and half
  // of what is asserted here is how many calls a roll made.
  fetchBalances.mockReset();
  fetchEthPrice.mockReset();
  fetchBalances.mockImplementation(async (addresses) => allEmpty(addresses));
  fetchEthPrice.mockResolvedValue(null);
});

describe('a roll', () => {
  it('publishes the batch with the balances it read', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.roll();
    });

    expect(result.current.accounts).toHaveLength(4);
    expect(result.current.accounts.every((account) => account.balances)).toBe(true);
    expect(result.current.resolved).toBe(4);
    expect(result.current.session.rolls).toBe(1);
    expect(result.current.session.keys).toBe(4);
    // Four addresses is one `balancemulti` call on one chain.
    expect(result.current.session.calls).toBe(1);
  });

  it('counts the keys it has ever made across sittings', async () => {
    localStorage.setItem(STORAGE_KEYS.keysChecked, '100');
    const { result } = setup();

    await act(async () => {
      await result.current.roll();
    });

    expect(result.current.keysChecked).toBe(104);
    expect(localStorage.getItem(STORAGE_KEYS.keysChecked)).toBe('104');
  });

  it('drops a roll asked for while one is already in flight', async () => {
    let release;
    fetchBalances.mockImplementation(
      (addresses) =>
        new Promise((resolve) => {
          release = () => resolve(allEmpty(addresses));
        }),
    );

    const { result } = setup();

    let first;
    let second;
    await act(async () => {
      first = result.current.roll();
      second = result.current.roll();
      await Promise.resolve();
    });

    await act(async () => {
      release();
      await Promise.all([first, second]);
    });

    // The second call returned immediately rather than queueing a second batch.
    expect(fetchBalances).toHaveBeenCalledTimes(1);
    expect(result.current.session.rolls).toBe(1);
  });
});

describe('recording', () => {
  it('reports every completed roll, including the ones never drawn', async () => {
    // `rec` accumulated from `accounts`, which is written only when the sheet is
    // due a redraw. Two rolls inside SHEET_MIN_MS draw once, and the recording
    // that followed the sheet kept one batch of the two.
    const onRoll = vi.fn();
    const { result } = setup({ onRoll });

    await act(async () => {
      await result.current.roll();
    });
    await act(async () => {
      await result.current.roll();
    });

    expect(onRoll).toHaveBeenCalledTimes(2);
    expect(onRoll.mock.calls[0][0]).toHaveLength(4);
    expect(onRoll.mock.calls[1][0]).toHaveLength(4);

    // The second batch is a different batch, and it never reached the sheet:
    // that is the whole point of asserting it was still reported.
    const [firstBatch] = onRoll.mock.calls[0];
    const [secondBatch] = onRoll.mock.calls[1];
    expect(secondBatch[0].address).not.toBe(firstBatch[0].address);
    expect(result.current.accounts[0].address).toBe(firstBatch[0].address);
  });

});

describe('a find', () => {
  it('halts, records the hit, and tells the caller', async () => {
    fetchBalances.mockImplementation(async (addresses) => firstFunded(addresses));
    const onHit = vi.fn();
    const { result } = setup({ onHit });

    await act(async () => {
      await result.current.roll();
    });

    expect(result.current.halted).toBe(true);
    expect(onHit).toHaveBeenCalledTimes(1);

    const hits = readHits();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      address: result.current.accounts[0].address,
      balances: { 1: 1.5 },
    });
    expect(hits[0].at).toEqual(expect.any(String));
  });

  it('refuses to roll while it holds, and rolls again on resume', async () => {
    fetchBalances.mockImplementation(async (addresses) => firstFunded(addresses));
    const { result } = setup();

    await act(async () => {
      await result.current.roll();
    });
    expect(result.current.session.rolls).toBe(1);

    // The hold is the point: a find must not be rolled past.
    await act(async () => {
      await result.current.roll();
    });
    expect(result.current.session.rolls).toBe(1);

    // Resuming clears the hold and rolls in the same tick, which only works
    // because `halted` is mirrored into a ref.
    fetchBalances.mockImplementation(async (addresses) => allEmpty(addresses));
    await act(async () => {
      result.current.resumeAfterHit();
    });

    await waitFor(() => expect(result.current.session.rolls).toBe(2));
    expect(result.current.halted).toBe(false);
  });
});

describe('screening', () => {
  /** Every bit clear, so nothing is ever a candidate: the ordinary roll. */
  const matchNothing = { m: 8, k: 1, bytes: new Uint8Array(1) };

  it('makes no call at all when a batch raises no candidate', async () => {
    const { result } = setup({ filter: matchNothing });

    await act(async () => {
      await result.current.roll();
    });

    expect(fetchBalances).not.toHaveBeenCalled();
    // The cost line used to report the whole batch here, whatever was read.
    expect(result.current.session.calls).toBe(0);
    expect(result.current.session.screened).toBe(4);
    expect(result.current.session.candidates).toBe(0);
    expect(result.current.session.keys).toBe(4);
  });
});

describe('a failed roll', () => {
  it('surfaces the error, keeps the batch, and still counts as ended', async () => {
    fetchBalances.mockRejectedValue(new Error('No Etherscan API key.'));
    const { result } = setup();

    await act(async () => {
      await result.current.roll();
    });

    expect(result.current.error).toBe('No Etherscan API key.');
    expect(result.current.consecutiveErrors).toBe(1);
    // Key generation does not depend on Etherscan, so the sheet stays up.
    expect(result.current.accounts).toHaveLength(4);
    // Auto waits on this; a roll that threw is still a roll that ended.
    expect(result.current.completedRolls).toBe(1);
    expect(result.current.scanning).toBe(false);
  });

  it('clears the error run once a roll succeeds', async () => {
    fetchBalances.mockRejectedValueOnce(new Error('rate limit'));
    const { result } = setup();

    await act(async () => {
      await result.current.roll();
    });
    expect(result.current.consecutiveErrors).toBe(1);

    await act(async () => {
      await result.current.roll();
    });
    expect(result.current.consecutiveErrors).toBe(0);
    expect(result.current.error).toBe(null);
  });
});
