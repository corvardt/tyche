import { beforeEach } from 'vitest';

/**
 * A `localStorage` that behaves like the real one in the ways the app depends
 * on, and is empty at the start of every test.
 *
 * `src/lib/storage.js` guards every access because Safari private mode makes
 * these calls throw, so the stub stores strings and nothing else — anything
 * more forgiving would let a bug through that the browser would not.
 */
class MemoryStorage {
  #entries = new Map();

  getItem(key) {
    const value = this.#entries.get(String(key));
    return value === undefined ? null : value;
  }

  setItem(key, value) {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key) {
    this.#entries.delete(String(key));
  }

  clear() {
    this.#entries.clear();
  }

  get length() {
    return this.#entries.size;
  }
}

globalThis.localStorage = new MemoryStorage();

beforeEach(() => {
  globalThis.localStorage.clear();
});
