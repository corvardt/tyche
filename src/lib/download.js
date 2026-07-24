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
