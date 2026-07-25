import { describe, expect, it } from 'vitest';
import { computeAddress } from 'ethers';

import { KEYS_PER_ROLL, TEST_MODE_ADDRESS } from '../config';
import {
  balanceOn, fundedChains, generateAccounts, generateAccountsProgressively, isFunded,
  normaliseAccount, totalBalance,
} from './accounts';

/** True if the queued macrotask got to run before `work` settled. */
async function yieldedDuring(work) {
  let ran = false;
  setTimeout(() => {
    ran = true;
  }, 0);
  await work();
  return ran;
}

/**
 * Whether generation yields is not a detail of generation. Auto rolls again
 * when the last roll ends, and it can only see a roll end if the roll rendered
 * something; a batch that fits one chunk and raises no candidate does neither,
 * which once stopped auto dead whenever the screen was on. The loop no longer
 * depends on this, and these pin down the behaviour it stopped depending on.
 */
describe('yielding', () => {
  it('does not yield when the batch fits a single chunk', async () => {
    expect(await yieldedDuring(() => generateAccountsProgressively({ count: 40, chunk: 100 }))).toBe(
      false,
    );
  });

  it('yields between chunks when the batch needs more than one', async () => {
    expect(await yieldedDuring(() => generateAccountsProgressively({ count: 40, chunk: 20 }))).toBe(
      true,
    );
  });
});

describe('generation', () => {
  it('makes a full batch of distinct, self-consistent keypairs', () => {
    const batch = generateAccounts({ count: 40 });
    expect(batch).toHaveLength(40);
    expect(new Set(batch.map((a) => a.address)).size).toBe(40);

    for (const account of batch) {
      expect(account.privateKey).toMatch(/^[0-9a-f]{64}$/);
      expect(computeAddress(`0x${account.privateKey}`)).toBe(account.address);
      expect(account.balances).toBeNull();
    }
  });

  it('defaults to the configured size', () => {
    expect(generateAccounts()).toHaveLength(KEYS_PER_ROLL);
  });

  it('plants one known funded address in test mode, keeping the size', () => {
    const batch = generateAccounts({ testMode: true, count: 40 });
    expect(batch).toHaveLength(40);
    expect(batch.at(-1).address).toBe(TEST_MODE_ADDRESS);
  });

  it('never produces an empty batch', () => {
    expect(generateAccounts({ count: 0 }).length).toBeGreaterThan(0);
    expect(generateAccounts({ count: 1, testMode: true }).length).toBeGreaterThan(0);
  });
});

describe('balances, which are per chain', () => {
  const account = { address: '0xA', privateKey: 'f', balances: { 1: 0.5, 137: 12 } };

  it('counts an address funded on any chain', () => {
    expect(isFunded(account)).toBe(true);
    expect(isFunded({ balances: {} })).toBe(false);
    expect(isFunded({ balances: null })).toBe(false);
    expect(isFunded(undefined)).toBe(false);
  });

  it('orders holdings largest first', () => {
    expect(fundedChains(account).map((h) => h.chainId)).toEqual([137, 1]);
  });

  it('sums one chain at a time, because the units differ', () => {
    // 1 POL is not 1 Ξ; there is no honest single total.
    expect(totalBalance([account], 1)).toBe(0.5);
    expect(totalBalance([account], 137)).toBe(12);
    expect(totalBalance([account, { balances: { 1: 1 } }], 1)).toBe(1.5);
    expect(balanceOn(account, 999)).toBe(0);
  });
});

describe('stored favourites', () => {
  it('migrates the tuples earlier versions wrote', () => {
    const migrated = normaliseAccount(['0xA', 'ff', '2.5', 7]);
    expect(migrated).toEqual({ address: '0xA', privateKey: 'ff', balances: { 1: 2.5 } });
  });

  it('puts a legacy single balance on mainnet, the only chain it could have been', () => {
    expect(normaliseAccount({ address: '0xA', privateKey: 'ff', balance: 3 }).balances).toEqual({ 1: 3 });
  });

  it('keeps per-chain balances when they are already there', () => {
    const entry = { address: '0xA', privateKey: 'ff', balances: { 137: 9 } };
    expect(normaliseAccount(entry).balances).toEqual({ 137: 9 });
  });

  it('rejects entries it cannot use rather than storing half of one', () => {
    for (const junk of [null, undefined, {}, ['0xA'], { address: '0xA' }, { privateKey: 'ff' }, ['', 'ff']]) {
      expect(normaliseAccount(junk)).toBeNull();
    }
  });
});
