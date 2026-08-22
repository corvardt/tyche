import { useCallback, useEffect, useState } from 'react';

/**
 * Palette values live in CSS (see index.css) so the stylesheet and any canvas
 * can never drift apart. These are the token names, in both places.
 */
export const TOKENS = ['void', 'panel', 'line', 'land', 'dim', 'text', 'strike'];

/**
 * The tube's coating, carried over from Keraunos. `white` is not a colour among
 * four: it is the absence of a coating, which is what the grey palette in
 * index.css already is, so choosing it writes an attribute no rule matches.
 */
export const PALETTES = ['white', 'oil', 'crimson', 'demon'];

/**
 * All of them on the tube, none at all on paper: a coating is a property of a
 * tube, and every palette here was drawn for a dark ground. The panel reads the
 * length of this and drops the control rather than offering a list of one.
 */
export const palettesFor = (theme) => (theme === 'dark' ? PALETTES : []);

// The medium is shared with the rest of corvardt.com, so the choice lives in a
// cookie scoped to the domain rather than in localStorage, which is per-origin
// and would not survive the walk between the index and a project.
const COOKIE_KEY = 'corvardt-theme';

const stored = () => document.cookie.match(/(?:^|;\s*)corvardt-theme=(dark|light)/)?.[1] ?? null;

function write(theme) {
  const domain = location.hostname.endsWith('corvardt.com') ? '; domain=.corvardt.com' : '';
  document.cookie = `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax${domain}`;
}

// Applied synchronously rather than in an effect: effects run child-first, so a
// child reading computed style would otherwise see the outgoing theme.
function apply(next) {
  document.documentElement.dataset.theme = next;
  return next;
}

/**
 * Two media, not one palette inverted. Dark is a phosphor tube: light emitted
 * on black. Light is ink on chart paper: marks deposited on cool stock.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  // Follow the system while the reader hasn't expressed a preference.
  useEffect(() => {
    if (stored()) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event) => setTheme(apply(event.matches ? 'light' : 'dark'));
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const choose = useCallback((next) => {
    write(next);
    setTheme(apply(next));
  }, []);

  return { theme, setTheme: choose };
}
