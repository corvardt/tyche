import { useEffect, useState } from 'react';
import { describeCost, keyspaceFraction, yearsToExhaust } from '../lib/cost';
import { fetchApiUsage } from '../lib/etherscan';
import { formatCount } from '../lib/format';
import { readHits } from '../lib/hits';
import Panel, { Group } from './Panel.jsx';
import { CONTROL, CONTROL_ON } from './controls.jsx';

const Row = ({ label, value, hot = false, title }) => (
  <>
    <dt className="text-dim" title={title}>
      {label}
    </dt>
    <dd className={`text-right ${hot ? 'glow-hot text-strike' : 'text-text'}`}>{value}</dd>
  </>
);

const duration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/**
 * The readout for the waiting.
 *
 * The instrument is built to catch something that will not happen, so the
 * honest thing to put on screen is the scale of what it is not catching. The
 * covered-fraction figure is the point of the panel: it has forty-odd leading
 * zeros, and running the machine all week does not move a digit of it.
 */
export default function StatsPanel({
  open,
  onClose,
  keysChecked,
  session,
  chains,
  keysPerRoll,
  verbose,
  onVerbose,
  filter,
  filterError,
  screening,
  onScreening,
  importing,
  onImportFilter,
  onClearFilter,
}) {
  const [usage, setUsage] = useState(null);
  const [now, setNow] = useState(Date.now());
  // Read on open rather than held in state: a find halts the machine, so this
  // cannot change while the panel is up.
  const [hits, setHits] = useState(0);

  // Tick while open so the rate is live rather than frozen at whatever it was
  // when the panel was opened.
  useEffect(() => {
    if (!open) return undefined;
    setHits(readHits().length);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Best-effort: the endpoint is not on every plan, and `fetchApiUsage` answers
  // null rather than throwing, so the rest of the panel stands without it.
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    fetchApiUsage({ signal: controller.signal }).then(setUsage);
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  const elapsedMs = Math.max(1, now - session.startedAt);
  const keysPerSecond = session.keys / (elapsedMs / 1000);
  const cost = describeCost({ keysPerRoll, chains });
  const years = yearsToExhaust(keysPerSecond);
  const screened = Boolean(filter && screening);

  return (
    <Panel title="Statistics" width={480} onClose={onClose}>
      {/* The instrument's own commentary. It lives with the statistics because
          it is the same thing at a different resolution: this panel is what the
          machine has done, the line is what it is doing. */}
      <Group title="Readout">
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <button
            type="button"
            aria-pressed={verbose}
            onClick={() => onVerbose(!verbose)}
            className={`flex items-baseline gap-2 ${verbose ? CONTROL_ON : CONTROL}`}
          >
            <span>{verbose ? '[x]' : '[ ]'}</span>
            <span>verbose status line</span>
          </button>
        </div>
        <p className="mt-2 max-w-[46ch] text-xs leading-5 text-dim">
          A line along the bottom edge naming everything as it happens: each roll, the keys as they
          are generated, every call and the chain it went to, every wait the rate limiter imposed,
          and every find.
        </p>
      </Group>

      {/* ── The screen ────────────────────────────────────────────────────
          What moves the ceiling. A quota buys ~23 lookups a second; the same
          browser generates and screens thousands. */}
      <Group title="Screen">
        {filter ? (
          <>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <button
                type="button"
                aria-pressed={screening}
                onClick={() => onScreening(!screening)}
                className={`flex items-baseline gap-2 ${screening ? CONTROL_ON : CONTROL}`}
              >
                <span>{screening ? '[x]' : '[ ]'}</span>
                <span>screen against the filter</span>
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <Row label="addresses" value={formatCount(filter.n)} />
              <Row label="size" value={`${Math.round(filter.byteLength / 1024)} kB`} />
              <Row
                label="false candidates"
                value={`1 in ${formatCount(Math.round(1 / filter.falsePositiveRate))}`}
              />
              <Row label="screened this session" value={formatCount(session.screened)} />
              <Row label="candidates raised" value={formatCount(session.candidates)} />
            </dl>
          </>
        ) : (
          <p className="max-w-[46ch] py-1 text-xs leading-5 text-dim">
            No filter, so every address is read against the chain and the daily allowance is what
            sets the rate. Load a list of addresses worth screening against and that stops being
            true.
          </p>
        )}

        {filterError && <p className="glow mt-2 text-xs text-strike">{filterError}</p>}

        {/* The list is the reader's, for the same reason the API key is: it is
            large, it goes stale, and which addresses are worth screening
            against is their call. A plain text file of addresses is enough —
            the filter is built here from whatever is in it. */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className={`${CONTROL} cursor-pointer`}>
            {importing ? '[ building ]' : '[ load addresses ]'}
            <input
              type="file"
              accept=".txt,.csv,.tsv,.bin,text/plain,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(event) => {
                const [file] = event.target.files ?? [];
                event.target.value = '';
                if (file) onImportFilter(file);
              }}
            />
          </label>
          {filter && (
            <button type="button" onClick={onClearFilter} className={CONTROL}>
              [ clear ]
            </button>
          )}
        </div>
      </Group>

      <Group title="This session">
        <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <Row label="running for" value={duration(elapsedMs)} />
          <Row label="rolls" value={formatCount(session.rolls)} />
          <Row label="keys" value={formatCount(session.keys)} />
          <Row label="keys / sec" value={keysPerSecond.toFixed(1)} />
          <Row label="api calls" value={formatCount(session.calls)} />
        </dl>
      </Group>

      <Group title="All time">
        <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <Row label="keys checked" value={formatCount(keysChecked)} />
          <Row label="funded found" value={formatCount(hits)} hot={hits > 0} />
        </dl>
      </Group>

      {/* ── The scale ─────────────────────────────────────────────────────
          Every figure here is the same joke told four ways, and the joke is
          the reason the app exists. */}
      <Group title="Against the keyspace">
        <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <Row label="keyspace" value="2^160" title="Every possible address" />
          <Row
            label="covered"
            value={keyspaceFraction(keysChecked)}
            title="Fraction of all addresses this browser has ever generated"
          />
          <Row
            label="at this rate, all of it in"
            value={Number.isFinite(years) ? `${years.toExponential(1)} years` : '—'}
          />
          <Row
            label={screened ? 'screened, so bound by' : 'quota ceiling'}
            value={
              screened
                ? `${formatCount(Math.round(keysPerSecond * 86_400))} keys / day`
                : `${formatCount(Math.round(cost.keysPerDay))} keys / day`
            }
            title={
              screened
                ? 'Screening locally, the allowance no longer sets the rate — generation does'
                : "Most keys a free tier's 100,000 daily calls can reach at this chain count"
            }
          />
        </dl>
        <p className="mt-2 max-w-[46ch] text-xs leading-5 text-dim">
          The covered figure is not rounding to zero; it is that small, and no amount of running
          the machine will move a digit of it.
        </p>
      </Group>

      <Group title="API allowance">
        {usage ? (
          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <Row label="used today" value={formatCount(usage.used)} />
            <Row
              label="remaining"
              value={formatCount(usage.remaining)}
              hot={usage.limit > 0 && usage.remaining / usage.limit < 0.1}
            />
            <Row label="limit" value={formatCount(usage.limit)} />
            {usage.expiresIn && <Row label="resets in" value={usage.expiresIn} />}
          </dl>
        ) : (
          <p className="py-1 text-xs text-dim">
            Not reported for this key. The endpoint is not available on every plan.
          </p>
        )}
      </Group>
    </Panel>
  );
}
