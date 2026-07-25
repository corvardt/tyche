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
 * @param {boolean} [props.dimMissed] step back everything that isn't the hit
 * @param {string} [props.hitClass]   marker class the click-outside test looks for
 * @param {(event: MouseEvent, account: object) => void} [props.onSelect]
 */
function BlockieSheet({
  accounts,
  fill = false,
  dimMissed = false,
  hitClass = '',
  onSelect,
}) {
  return (
    <div className={`sheet ${fill ? 'sheet-fill' : ''}`}>
      {accounts.map((account) => {
        if (!account?.address) return null;
        const funded = isFunded(account);

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
            className={`cell ${funded ? 'cell-hit breathe' : dimMissed ? 'cell-missed' : ''}`}
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
    </div>
  );
}

// Forty cells, each an image decode, re-rendered by anything that touched the
// page: every progress tick, the elapsed-time readout, the price landing. None
// of those change a single blockie.
export default memo(BlockieSheet);
