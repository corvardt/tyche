import { memo } from 'react';

import { isFunded } from '../lib/accounts';
import { blockie } from '../lib/blockie';

/**
 * The batch as a contact sheet: forty exposures butted against one hairline,
 * read as a single frame rather than forty cards.
 *
 * The four layout branches this replaces inlined the same JSX four times over,
 * nested two ternaries deep (`hit ? loaded ? map : fallback : loaded ? map :
 * fallback`) where the only difference between arms was a `grayscale` class.
 *
 * @param {object} props
 * @param {import('../lib/accounts').Account[]} props.accounts
 * @param {boolean} [props.fill]      size cells to the container instead of 5/8 columns
 * @param {number} [props.resolved]  how many cells have actually been read
 * @param {number} [props.slots]     grid size to hold while a batch is generated
 * @param {boolean} [props.dimMissed] step back everything that isn't the hit
 * @param {string} [props.hitClass]   marker class the click-outside test looks for
 * @param {(event: MouseEvent, account: object) => void} [props.onSelect]
 */
function BlockieSheet({
  accounts,
  resolved = Number.POSITIVE_INFINITY,
  slots = 0,
  fill = false,
  dimMissed = false,
  hitClass = '',
  onSelect,
}) {
  return (
    <div className={`sheet ${fill ? 'sheet-fill' : ''}`}>
      {accounts.map((account, index) => {
        if (!account?.address) return null;
        const funded = isFunded(account);
        // The exposure is there from the moment the key exists; what has not
        // arrived is the balance. Latent cells hold back until theirs does.
        const latent = index >= resolved;

        const image = (
          <img
            className={`blockie ${hitClass}`}
            src={blockie(account.address)}
            alt={`Identicon for ${account.address}`}
            draggable="false"
          />
        );

        return (
          <div
            key={account.address}
            // Twenty land at a time, so they are staggered inside their own
            // group: the batch develops as a quick wave rather than a switch.
            style={{ '--i': index % 20 }}
            className={`cell ${latent ? 'cell-latent' : 'cell-read'} ${
              funded ? 'cell-hit breathe' : dimMissed ? 'cell-missed' : ''
            }`}
          >
            {onSelect ? (
              <button
                type="button"
                // The blockie is the button. A separate overlay button meant the
                // hover state and the hit target could disagree.
                className="block h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0"
                onClick={(event) => onSelect(event, account)}
                onContextMenu={(event) => onSelect(event, account)}
                title={account.address}
                aria-label={`Key ${account.address}`}
              >
                {image}
              </button>
            ) : (
              image
            )}
          </div>
        );
      })}

      {/* Slots for keys not yet made, held after what exists so the sheet
          fills from the start rather than growing — a growing grid would
          reflow the page under the reader on every roll. */}
      {Array.from({ length: Math.max(0, slots - accounts.length) }, (_, index) => (
        <div key={`slot-${index}`} className="cell cell-empty" aria-hidden="true" />
      ))}
    </div>
  );
}

// Forty cells, each an image decode, re-rendered by anything that touched the
// page: every progress tick, the elapsed-time readout, the price landing. None
// of those change a single blockie.
export default memo(BlockieSheet);
