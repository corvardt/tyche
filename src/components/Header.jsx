import { memo } from 'react';
import { CONTROL, Rule } from './controls.jsx';

/**
 * The mark, matching `public/glyph.svg` stroke for stroke. Squared and drawn as
 * a path: nothing in this interface is rounded, and it must hold at 16px in a
 * tab bar where no font of ours is loaded. Same extent and open ends as the
 * unmod U, so the two are siblings rather than two unrelated logos.
 */
const Glyph = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M4 3.5 H12 M8 3.5 V12.5" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/**
 * The instrument's top edge: who is transmitting on the left, what it is doing
 * in the middle, and every control on the right.
 *
 * This replaces the hamburger nav, which hid a four-item list behind an
 * animated icon and a fixed 250px drawer on a page that has room to just show
 * them.
 */
function Header({
  scanning,
  halted,
  error,
  theme,
  onTheme,
  onKeys,
  onFavorites,
  onChains,
  onStats,
  favoriteCount,
  chainCount,
}) {
  // When it is simply rolling, the sweeping dot already says so. Speak up only
  // for the two states that stop the machine.
  const state = error ? 'no signal' : halted ? 'holding' : null;

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between gap-4 border-b border-line px-3 sm:px-4">
      <div className="flex items-baseline gap-2.5">
        <span className="translate-y-px text-text">
          <Glyph />
        </span>
        <span className="glow text-base font-semibold tracking-mark text-text">TYCHE</span>
        <span className="hidden text-2xs uppercase tracking-label text-dim sm:inline">
          &#47;&#47; random keys
        </span>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <span className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 ${
              error ? 'bg-land' : halted ? 'bg-strike' : 'bg-dim'
            } ${scanning ? 'seek' : halted ? 'breathe' : ''}`}
            aria-hidden="true"
          />
          {state && (
            <span className="glow text-2xs uppercase tracking-label text-text">[ {state} ]</span>
          )}
        </span>

        <span className="flex items-center gap-3 border-l border-line pl-3 sm:pl-4">
          {/* Two media, named for what they are rather than "light"/"dark". */}
          <button
            type="button"
            onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'paper' : 'tube'}`}
            className={CONTROL}
          >
            {theme === 'dark' ? 'tube' : 'paper'}
          </button>
          <Rule />
          <button type="button" onClick={onKeys} className={CONTROL}>
            api
          </button>
          <button type="button" onClick={onChains} className={`${CONTROL} hidden sm:inline`}>
            chains{chainCount > 1 ? ` ${chainCount}` : ''}
          </button>
          <button type="button" onClick={onStats} className={CONTROL}>
            stats
          </button>
          <button type="button" onClick={onFavorites} className={CONTROL}>
            kept{favoriteCount > 0 ? ` ${favoriteCount}` : ''}
          </button>
          <Rule />
          <a
            className={`${CONTROL} hidden sm:inline`}
            target="_blank"
            rel="noreferrer"
            href="https://github.com/corvardt/tyche"
          >
            src
          </a>
        </span>
      </div>
    </header>
  );
}

export default memo(Header);
