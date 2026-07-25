/**
 * The running commentary.
 *
 * Everything the instrument does passes through here as one short line: keys
 * generated, every call made and which chain it went to, every wait the rate
 * limiter imposed, every roll finished, every control touched. The status line
 * at the bottom of the page reads the latest.
 *
 * It is a bus rather than component state on purpose. The events fire several
 * times a second during a roll, and holding them in the page component would
 * re-render the whole tree at that rate; a subscriber that renders one line
 * re-renders one line.
 *
 * Deliberately dependency-free: the limiter and the lookup layer both publish
 * to it, and anything it imported would be at risk of a cycle back through them.
 */

/** Kept for the moment the panel is switched on mid-session, so it is not blank. */
const CAPACITY = 200;

const buffer = [];
const listeners = new Set();

let sequence = 0;

/**
 * @param {string} phase   short tag, rendered in its own column
 * @param {string} [detail]
 */
export function emit(phase, detail = '') {
  sequence += 1;
  const entry = { seq: sequence, at: Date.now(), phase, detail };

  buffer.push(entry);
  if (buffer.length > CAPACITY) buffer.shift();

  for (const listener of listeners) listener(entry);
  return entry;
}

/** @param {(entry: {seq: number, at: number, phase: string, detail: string}) => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const lastEntry = () => buffer.at(-1) ?? null;

export const history = () => [...buffer];

/** Test seam. */
export function resetTelemetry() {
  buffer.length = 0;
  listeners.clear();
  sequence = 0;
}
