import { useEffect, useState } from 'react';
import { describeCost, keyspaceFraction, yearsToExhaust } from '../lib/cost';
import { fetchApiUsage } from '../lib/etherscan';
import { formatCount } from '../lib/format';
import { readHits } from '../lib/hits';
import Panel, { Group } from './Panel.jsx';

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
export default function StatsPanel({ open, onClose, keysChecked, session, chains, keysPerRoll }) {
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

  return (
    <Panel title="Statistics" width={480} onClose={onClose}>
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
            label="quota ceiling"
            value={`${formatCount(Math.round(cost.keysPerDay))} keys / day`}
            title="Most keys a free tier's 100,000 daily calls can reach at this chain count"
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
