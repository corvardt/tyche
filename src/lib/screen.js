import { parseFilter } from './bloom';

/**
 * Where a filter is expected to sit, relative to wherever the app is served.
 *
 * The data is not in the repository for the same reason the API key is not:
 * it is large, it goes stale, and which addresses are worth screening against
 * is the reader's call. `npm run build-filter` makes one; a self-hosted
 * deployment can drop it in `public/` and ship it.
 */
const FILTER_URL = 'funded.bin';

/** One attempt per page load, shared by every caller. */
let attempt = null;

/**
 * Loads the funded-address filter, if there is one.
 *
 * Absence is the normal case and not an error: without a filter the app reads
 * every address against the chain exactly as it always has. A file that is
 * present but damaged *is* an error worth showing, because the alternative is
 * screening every address as a miss and never saying why.
 *
 * @returns {Promise<{filter: object|null, error: string|null}>}
 */
export function loadFilter() {
  attempt ??= (async () => {
    let response;
    try {
      response = await fetch(FILTER_URL);
    } catch {
      return { filter: null, error: null };
    }

    if (!response.ok) return { filter: null, error: null };

    try {
      const buffer = await response.arrayBuffer();
      return { filter: parseFilter(buffer), error: null };
    } catch (cause) {
      // A static host commonly answers a missing file with index.html and a
      // 200, which lands here as "not a Tyche filter". That is indistinguishable
      // from having no filter, so it is not worth alarming anyone about.
      const missing = /not a tyche filter/i.test(cause.message ?? '');
      return { filter: null, error: missing ? null : (cause.message ?? 'Filter failed to load.') };
    }
  })();

  return attempt;
}

/** Test seam. */
export function resetFilter() {
  attempt = null;
}
