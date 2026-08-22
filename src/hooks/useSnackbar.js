import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const VISIBLE_MS = 1700;

/**
 * Replaces the previous `getElementById('snackbar')` + manual className string
 * surgery, which threw whenever a message fired on a layout that doesn't render
 * the snackbar (every desktop branch except one) and leaked a timeout per call.
 */
export function useSnackbar() {
  const [message, setMessage] = useState(null);
  const timeout = useRef(null);

  const clear = useCallback(() => {
    clearTimeout(timeout.current);
    setMessage(null);
  }, []);

  const show = useCallback((text) => {
    clearTimeout(timeout.current);
    setMessage(text);
    timeout.current = setTimeout(() => setMessage(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timeout.current), []);

  // A fresh object every render made this hook impossible to depend on
  // honestly: callers wanting `show` in a dependency array had to reach past
  // the object and name the method, which reads like an oversight and which
  // the hooks lint flags as one.
  return useMemo(() => ({ message, show, dismiss: clear }), [message, show, clear]);
}
