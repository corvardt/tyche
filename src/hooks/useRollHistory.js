import { useCallback, useState } from 'react';
import { HISTORY_DEPTH } from '../config';

/**
 * A rolling window of the batches that reached the sheet, so one can be gone
 * back to after it has been rolled over.
 *
 * Only drawn batches are kept. Every finished roll goes to `rec`, and under a
 * screened auto run that is about eighty a second: a history taking all of them
 * would turn over a hundred deep in a second and a bit, and hold nothing anyone
 * had time to see. The sheet is already paced to `SHEET_MIN_MS`, so what it
 * drew is exactly the set worth being able to return to.
 *
 * `offset` counts back from the newest: 0 is live, 1 the batch before it. New
 * batches land at the newest end and the oldest falls off, so a reader looking
 * back holds their place by counting one further back each time, until the
 * batch they were on drops out of the window and they are left on the oldest
 * one still held.
 */
export function useRollHistory(depth = HISTORY_DEPTH) {
  const [{ entries, offset }, setState] = useState({ entries: [], offset: 0 });

  const push = useCallback(
    (batch) => {
      setState((current) => {
        const kept = [...current.entries, batch].slice(-depth);
        return {
          entries: kept,
          offset:
            current.offset === 0 ? 0 : Math.min(current.offset + 1, kept.length - 1),
        };
      });
    },
    [depth],
  );

  const back = useCallback(() => {
    setState((current) => ({
      ...current,
      offset: Math.min(current.offset + 1, current.entries.length - 1),
    }));
  }, []);

  const forward = useCallback(() => {
    setState((current) => ({ ...current, offset: Math.max(current.offset - 1, 0) }));
  }, []);

  const live = useCallback(() => {
    setState((current) => (current.offset === 0 ? current : { ...current, offset: 0 }));
  }, []);

  return {
    // The batch being looked at, or null when the sheet is live. Null and not
    // the newest entry: the caller has the live batch already, mid-roll and
    // developing, which is not what the history holds.
    viewing: offset > 0 ? entries[entries.length - 1 - offset] : null,
    offset,
    depth: entries.length,
    canBack: entries.length - 1 > offset,
    canForward: offset > 0,
    push,
    back,
    forward,
    live,
  };
}
