import { useCallback, useEffect, useRef, useState } from 'react';

import { addressesFrom, buildFilter, parseFilter } from '../lib/bloom';
import { clearStoredFilter, readStoredFilter, writeStoredFilter } from '../lib/filterStore';
import { loadFilter } from '../lib/screen';
import { emit } from '../lib/telemetry';

/** The false-positive rate a filter built in the browser is sized for. */
const IMPORT_FPR = 1e-8;

const describe = (filter) =>
  `${filter.n.toLocaleString('en-US')} addresses · ${Math.round(filter.byteLength / 1024)}kB · 1 in ${Math.round(
    1 / filter.falsePositiveRate,
  ).toLocaleString('en-US')}`;

/**
 * The funded-address filter: whatever was imported here, else whatever the
 * deployment ships, else none at all.
 *
 * An imported one wins. It is the reader's own choice of what is worth
 * screening against, and it should not be quietly overridden by whatever
 * happens to sit in `public/`.
 */
export function useFilter() {
  const [state, setState] = useState({ filter: null, error: null, loading: true });
  const [importing, setImporting] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await readStoredFilter();
      if (stored) {
        try {
          const filter = parseFilter(stored);
          if (!live.current) return;
          setState({ filter, error: null, loading: false });
          emit('filter', `imported · ${describe(filter)}`);
          return;
        } catch {
          // Whatever is in storage is unusable; fall through to the shipped
          // file rather than leaving the reader with nothing.
          await clearStoredFilter();
        }
      }

      const { filter, error } = await loadFilter();
      if (!live.current) return;

      setState({ filter, error, loading: false });
      if (filter) emit('filter', describe(filter));
      else if (error) emit('filter', `unusable · ${error}`);
    })();
  }, []);

  /**
   * Takes either a filter built by `npm run build-filter` or a plain list of
   * addresses, and tells them apart by looking rather than by file extension.
   *
   * @param {File} file
   */
  const importFile = useCallback(async (file) => {
    if (!file) return;
    setImporting(true);

    try {
      const buffer = await file.arrayBuffer();
      const magic = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 8)));

      let filter;
      let built;

      if (magic === 'TYCHEBLM') {
        filter = parseFilter(buffer);
        built = buffer;
      } else {
        const addresses = addressesFrom(new TextDecoder().decode(buffer));
        if (addresses.length === 0) {
          throw new Error('No addresses in that file: expected 0x-prefixed 40-hex values.');
        }

        const result = buildFilter(addresses, { falsePositiveRate: IMPORT_FPR });
        filter = parseFilter(result.buffer);
        built = result.buffer;
      }

      // Usable now. Keeping it for next time is worth doing but not worth
      // waiting on: a browser with storage disabled should cost the reader a
      // re-import, not the use of the filter they just built.
      setState({ filter, error: null, loading: false });
      emit('filter', `imported · ${describe(filter)}`);

      writeStoredFilter(built).then((saved) => {
        if (!saved) emit('filter', 'kept for this session only · storage unavailable');
      });
    } catch (cause) {
      if (!live.current) return;
      const message = cause.message ?? 'That file could not be read as a filter.';
      setState((current) => ({ ...current, error: message }));
      emit('filter', `import failed · ${message}`);
    } finally {
      if (live.current) setImporting(false);
    }
  }, []);

  /** Drops the imported filter, falling back to whatever the deployment ships. */
  const clear = useCallback(async () => {
    await clearStoredFilter();
    const { filter, error } = await loadFilter();
    if (!live.current) return;

    setState({ filter, error, loading: false });
    emit('filter', filter ? `reverted · ${describe(filter)}` : 'cleared');
  }, []);

  return { ...state, importing, importFile, clear };
}
