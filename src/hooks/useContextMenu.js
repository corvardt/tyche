import { useCallback, useEffect, useState } from 'react';

/**
 * Position + target for one popup menu. The app had two verbatim copies of this
 * state (six `useState`s and two effects), differing only in which CSS class the
 * outside-click test looked for.
 *
 * @param {string} insideSelector element the click-outside handler should ignore
 */
export function useContextMenu(insideSelector) {
  const [state, setState] = useState(null);

  const open = useCallback((event, account) => {
    event.preventDefault();
    setState({ x: event.clientX, y: event.clientY, account });
  }, []);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return undefined;

    const onClickOutside = (event) => {
      if (!event.target.closest(insideSelector)) close();
    };
    const onEscape = (event) => {
      if (event.key === 'Escape') close();
    };

    document.body.addEventListener('click', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.body.removeEventListener('click', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [close, insideSelector, state]);

  return { menu: state, open, close };
}
