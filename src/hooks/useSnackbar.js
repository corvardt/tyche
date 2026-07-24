import { useCallback, useEffect, useRef, useState } from 'react';

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

  return { message, show, dismiss: clear };
}
