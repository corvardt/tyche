import { describe, expect, it } from 'vitest';

import { generateAccounts } from './accounts';
import { accountsToText, parseAccounts } from './download';

describe('import', () => {
  it('round-trips its own export', () => {
    const batch = generateAccounts({ count: 5 });
    const { accounts } = parseAccounts(accountsToText(batch));

    expect(accounts).toHaveLength(5);
    expect(accounts.map((a) => a.privateKey)).toEqual(batch.map((a) => a.privateKey));
    // Addresses are re-derived rather than trusted from the file.
    expect(accounts.map((a) => a.address)).toEqual(batch.map((a) => a.address));
  });

  it('takes a bare list of keys, since a key determines its address', () => {
    const batch = generateAccounts({ count: 3 });
    const { accounts } = parseAccounts(batch.map((a) => a.privateKey).join('\n'));

    expect(accounts).toHaveLength(3);
    expect(accounts[0].address).toBe(batch[0].address);
  });

  it('finds keys buried in unrelated text', () => {
    const [account] = generateAccounts({ count: 1 });
    const { accounts } = parseAccounts(`notes\nkey: ${account.privateKey} (the good one)\n`);
    expect(accounts).toHaveLength(1);
  });

  it('collapses duplicates', () => {
    const batch = generateAccounts({ count: 2 });
    const text = accountsToText(batch);
    expect(parseAccounts(`${text}\n${text}`).accounts).toHaveLength(2);
  });

  it('reports nothing for text with no keys in it', () => {
    for (const junk of ['', 'hello', '0x', 'deadbeef']) {
      expect(parseAccounts(junk).accounts).toHaveLength(0);
    }
  });

  it('starts imported accounts with no balances rather than a stale one', () => {
    const [account] = generateAccounts({ count: 1 });
    expect(parseAccounts(account.privateKey).accounts[0].balances).toEqual({});
  });
});
