import { useTelemetry } from '../hooks/useTelemetry';

const pad = (value, width = 2) => String(value).padStart(width, '0');

/** `hh:mm:ss.mmm`, because the interesting gaps here are milliseconds wide. */
const stamp = (at) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

/**
 * Phases that mean something went wrong or something was found, and should not
 * read like the forty lines of routine traffic around them.
 */
const HOT = new Set(['found', 'halt', 'error']);

/**
 * The running commentary, one line, bottom of the page.
 *
 * Everything the instrument does says so here: the keys as they are generated,
 * each call and the chain it went to, each wait the rate limiter imposed, each
 * roll as it lands. It subscribes to the bus itself rather than taking the
 * entry as a prop, so a line arriving re-renders this line and nothing else.
 */
export default function StatusLine() {
  const entry = useTelemetry();

  return (
    <div
      role="log"
      aria-live="off"
      aria-label="Activity"
      className="flex h-6 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-line px-3 font-mono text-2xs text-dim sm:px-4"
    >
      {entry ? (
        <>
          <span className="shrink-0 text-land">{stamp(entry.at)}</span>
          <span className="shrink-0 tabular-nums text-land">
            {String(entry.seq).padStart(5, '0')}
          </span>
          <span
            className={`w-16 shrink-0 uppercase tracking-label ${
              HOT.has(entry.phase) ? 'glow-hot text-strike' : 'text-dim'
            }`}
          >
            {entry.phase}
          </span>
          <span
            className={`truncate ${HOT.has(entry.phase) ? 'glow text-strike' : 'text-text'}`}
            title={entry.detail}
          >
            {entry.detail}
          </span>
        </>
      ) : (
        <span className="text-land">waiting</span>
      )}
    </div>
  );
}
