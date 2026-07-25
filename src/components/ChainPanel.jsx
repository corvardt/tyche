import { CHAINS } from '../lib/chains';
import { describeCost } from '../lib/cost';
import { formatCount } from '../lib/format';
import Panel, { Group } from './Panel.jsx';
import { CONTROL, CONTROL_ON } from './controls.jsx';

/**
 * Which chains a roll is read against.
 *
 * Etherscan V2 serves every chain from one endpoint on one key, so this is a
 * `chainid` and nothing more. What it is not is free, and the cost is on screen
 * here rather than discovered later as a spent daily allowance: every chain
 * added multiplies the calls a roll makes, against one account-wide quota.
 */
export default function ChainPanel({ open, chains, keysPerRoll, onToggle, onClose }) {
  if (!open) return null;

  const cost = describeCost({ keysPerRoll, chains });

  return (
    <Panel title="Chains" width={520} onClose={onClose}>
      <Group title="Read against">
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {CHAINS.map((chain) => {
            const on = chains.includes(chain.id);
            return (
              <button
                key={chain.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(chain.id)}
                title={chain.free ? `chainid ${chain.id}` : `chainid ${chain.id} // paid plans only`}
                className={`flex items-baseline gap-2 py-0.5 text-left ${on ? CONTROL_ON : CONTROL}`}
              >
                <span>{on ? '[x]' : '[ ]'}</span>
                <span className="truncate">{chain.name}</span>
                {!chain.free && (
                  <span className="shrink-0 text-2xs uppercase tracking-label text-land">paid</span>
                )}
              </button>
            );
          })}
        </div>
      </Group>

      {/* ── What it costs ────────────────────────────────────────────────
          The numbers that decide whether a selection is sane, next to the
          switches that set it. */}
      <Group title="Cost">
        <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <dt className="text-dim">calls / roll</dt>
          <dd className="text-right text-text">{cost.callsPerRoll}</dd>

          <dt className="text-dim">paced at</dt>
          <dd className="text-right text-text">{cost.callsPerSecond.toFixed(1)} calls / sec</dd>

          {/* Plain, not hot. This is now the same number under every selection,
              so colouring it as an exceedance made it a light that was always
              on. What the switches move is the row below. */}
          <dt className="text-dim">daily allowance spent in</dt>
          <dd className="text-right text-text">{cost.hoursToDailyCap.toFixed(1)}h</dd>

          <dt className="text-dim">keys / day at the cap</dt>
          <dd className="text-right text-text">{formatCount(Math.round(cost.keysPerDay))}</dd>
        </dl>

        <p className="mt-2 max-w-[52ch] text-xs leading-5 text-dim">
          Auto rolls continuously, so the limiter sets the pace and the allowance goes at one
          speed whatever is selected here. What these switches change is what it buys — the last
          row. A screened roll does not call the API at all, and none of this applies to it.
        </p>
      </Group>

      {/* The finding that matters more than the feature. Stated here because
          this panel is where someone decides to switch chains on. */}
      <Group title="Worth knowing">
        <p className="max-w-[52ch] text-xs leading-5 text-dim">
          A quota buys lookups, not keys. Reading {cost.chainCount} chain
          {cost.chainCount === 1 ? '' : 's'} multiplies the chance any one key is funded by roughly
          that much, and divides the keys you can reach in a day by exactly that much. They cancel:
          the expected find rate is the same. Mainnet also holds far more funded addresses than the
          quiet chains, so spreading a fixed allowance across them slightly lowers the odds per
          call. Breadth is worth paying for on a key with headroom to spare; on the free tier it is
          a trade, not an upgrade.
        </p>
        <p className="mt-2 max-w-[52ch] text-xs leading-5 text-dim">
          Chains marked <span className="text-land">paid</span> answer balance queries only on a
          paid plan. Selecting one on a free key fails the roll.
        </p>
      </Group>
    </Panel>
  );
}
