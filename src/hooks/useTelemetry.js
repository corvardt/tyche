import { useEffect, useRef, useState } from 'react';
import { lastEntry, subscribe } from '../lib/telemetry';

/**
 * How long each entry holds the line before the next replaces it. Fast enough
 * to feel live, slow enough that the text can actually be read.
 */
const DWELL_MS = 110;

/**
 * How far behind the machine the line is allowed to fall. Beyond this the
 * backlog is discarded from the front: the readout's job is to say what is
 * happening now, so when it cannot keep up it should skip ahead rather than
 * narrate the past.
 */
const MAX_BACKLOG = 8;

/**
 * The telemetry entries, paced so a person can read them.
 *
 * Showing each entry the instant it arrives does not work: a roll emits its
 * start, its generation timing and its first lookup inside about fifteen
 * milliseconds, and anything that renders only the newest per frame drops the
 * first two entirely — the line ends up quieter than the events behind it. So
 * entries queue and are shown in turn for a fixed dwell, and the queue is
 * truncated rather than allowed to lag.
 */
export function useTelemetry() {
  const [entry, setEntry] = useState(lastEntry);

  const queue = useRef([]);
  const timer = useRef(0);

  useEffect(() => {
    const show = () => {
      const next = queue.current.shift();
      if (next) setEntry(next);

      // Hold the line for the full dwell even with nothing waiting behind it.
      // Releasing as soon as the queue empties looks like pacing but is not:
      // a burst arriving a few milliseconds apart then renders back to back,
      // React coalesces the updates, and the browser paints only the last —
      // so the entries in between are displayed to nobody.
      timer.current = setTimeout(() => {
        timer.current = 0;
        if (queue.current.length > 0) show();
      }, DWELL_MS);
    };

    const unsubscribe = subscribe((next) => {
      queue.current.push(next);

      // Skip ahead rather than fall behind.
      if (queue.current.length > MAX_BACKLOG) {
        queue.current = queue.current.slice(-MAX_BACKLOG);
      }

      // Show the first arrival immediately; the timer paces whatever follows.
      if (timer.current === 0) show();
    });

    return () => {
      unsubscribe();
      if (timer.current !== 0) clearTimeout(timer.current);
      queue.current = [];
    };
  }, []);

  return entry;
}
