/**
 * Where an imported filter is kept between visits.
 *
 * IndexedDB rather than `localStorage`, which everything else here uses: a
 * filter is a few hundred kilobytes of binary, and `localStorage` holds strings
 * — base64 would inflate it by a third and spend the origin's whole quota on
 * one file. Every call resolves rather than throwing, because a browser with
 * storage disabled should cost the reader a re-import, not a broken page.
 */

const DB_NAME = 'tyche';
const STORE = 'filter';
const KEY = 'funded';

/**
 * Nothing here may hang.
 *
 * IndexedDB can sit forever without firing any of its callbacks — a blocked
 * upgrade, a locked profile, a browser that simply never answers. The read runs
 * before the first roll, so a request that never settles is not a slow import,
 * it is an app that never rolls at all. Every operation races this.
 */
const TIMEOUT_MS = 3000;

const withTimeout = (promise) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))]);

function open() {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function run(db, mode, action) {
  return new Promise((resolve) => {
    let request;
    try {
      request = action(db.transaction(STORE, mode).objectStore(STORE));
    } catch {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

/** @returns {Promise<ArrayBuffer|null>} */
export async function readStoredFilter() {
  const db = await withTimeout(open());
  if (!db) return null;

  const stored = await withTimeout(run(db, 'readonly', (store) => store.get(KEY)));
  db.close();
  return stored ?? null;
}

/** @param {ArrayBuffer} buffer @returns {Promise<boolean>} */
export async function writeStoredFilter(buffer) {
  const db = await withTimeout(open());
  if (!db) return false;

  const result = await withTimeout(run(db, 'readwrite', (store) => store.put(buffer, KEY)));
  db.close();
  return result !== null;
}

export async function clearStoredFilter() {
  const db = await withTimeout(open());
  if (!db) return;

  await withTimeout(run(db, 'readwrite', (store) => store.delete(KEY)));
  db.close();
}
