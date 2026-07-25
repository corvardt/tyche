import { useLayoutEffect, useRef, useState } from 'react';

import { fundedChains } from '../lib/accounts';
import { explorerAddress } from '../lib/chains';

const MENU_WIDTH = 190;

function MenuItem({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-2xs uppercase tracking-label text-dim transition-colors hover:bg-void hover:text-text"
    >
      {label}
    </button>
  );
}

/**
 * Actions for a single key.
 *
 * This replaces `ContextMenu` and `ContextMenu2`, which were byte-identical
 * apart from their favourite action, and were both declared inside the page
 * component, so React saw a brand new component type on every render and
 * remounted the open menu each time.
 *
 * @param {object} props
 * @param {{x: number, y: number, account: import('../lib/accounts').Account}} props.menu
 * @param {'add'|'remove'} props.favoriteAction
 */
export default function ContextMenu({ menu, onClose, favoriteAction, onFavorite, onCopy }) {
  const { x, y, account } = menu;
  const ref = useRef(null);
  const [height, setHeight] = useState(0);

  // Measured rather than assumed: the menu flips above the cursor near the
  // bottom edge, and its height depends on the type size the reader is using.
  useLayoutEffect(() => {
    setHeight(ref.current?.offsetHeight ?? 0);
  }, []);

  const spaceOnRight = window.innerWidth - x;
  const left = spaceOnRight < MENU_WIDTH && x >= MENU_WIDTH ? x - MENU_WIDTH : x;
  const top = height && y + height > window.innerHeight ? Math.max(4, y - height) : y;

  const act = (fn) => async () => {
    await fn();
    onClose();
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy(`${what} copied`);
    } catch {
      // Clipboard access is denied outside a secure context.
      onCopy('Clipboard unavailable');
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top, left, width: MENU_WIDTH }}
      className="z-40 border border-line bg-panel py-1 shadow-lg"
    >
      <div className="truncate border-b border-line px-3 pb-1.5 pt-1 text-2xs text-land">
        {account.address}
      </div>

      <MenuItem
        label={favoriteAction === 'remove' ? '[ drop ]' : '[ keep ]'}
        onClick={act(() => onFavorite(account))}
      />
      <MenuItem label="[ copy key ]" onClick={act(() => copy(account.privateKey, 'Key'))} />
      <MenuItem label="[ copy address ]" onClick={act(() => copy(account.address, 'Address'))} />
      <MenuItem
        label="[ etherscan ]"
        onClick={act(() =>
          window.open(
            explorerAddress(account.address, fundedChains(account)[0]?.chainId),
            '_blank',
            'noopener,noreferrer',
          ),
        )}
      />
    </div>
  );
}
