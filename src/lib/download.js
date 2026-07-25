import { computeAddress } from 'ethers';

/**
 * Triggers a client-side text download.
 *
 * The previous implementation branched on `window.webkitURL` and, on the
 * non-webkit path, assigned an undefined `destroyClickedElement`, a
 * ReferenceError that broke saving on every non-Chromium browser. `URL` is
 * universally available, so the branch is gone.
 *
 * @param {string} contents
 * @param {string} filename
 */
export function downloadTextFile(contents, filename) {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Without this the blob is pinned in memory for the life of the document.
  URL.revokeObjectURL(url);
}

/**
 * Serialises accounts as address/private-key pairs separated by blank lines,
 * matching the format the app has always exported.
 *
 * @param {import('./accounts').Account[]} accounts
 */
export function accountsToText(accounts) {
  return accounts
    .filter(Boolean)
    .flatMap((account) => [account.address, account.privateKey, ''])
    .join('\n');
}

export function downloadAccounts(accounts, filename) {
  downloadTextFile(accountsToText(accounts), filename);
}

/**
 * Reads back what {@link accountsToText} writes, and rather more besides.
 *
 * Export has existed since the beginning with no way in, so a kept sheet could
 * leave a browser and never return to one. Rather than insist on the exact
 * shape it emits, this takes any text and pulls the keys out of it: a private
 * key determines its address, so the addresses in the file are confirmation,
 * not information, and a list of bare keys is as good as a full export.
 *
 * @param {string} text
 * @returns {{accounts: import('./accounts').Account[], found: number}}
 */
export function parseAccounts(text) {
  const keys = String(text).match(/[0-9a-fA-F]{64}/g) ?? [];

  const seen = new Set();
  const accounts = [];

  for (const key of keys) {
    const privateKey = key.toLowerCase();
    if (seen.has(privateKey)) continue;
    seen.add(privateKey);

    try {
      accounts.push({
        address: computeAddress(`0x${privateKey}`),
        privateKey,
        balances: {},
      });
    } catch {
      // Sixty-four hex characters that are not a valid curve scalar. Vanishingly
      // rare, and not a reason to reject the rest of the file.
    }
  }

  return { accounts, found: keys.length };
}
