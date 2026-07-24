/**
 * Transient confirmations, bottom left, on the same panel chrome as everything
 * else. It used to be a 270×70px rounded toast driven by imperative className
 * edits on a `#snackbar` node that half the layouts never mounted.
 */
export default function Snackbar({ message, onDismiss }) {
  if (!message) return null;

  return (
    <button
      type="button"
      onClick={onDismiss}
      role="status"
      aria-live="polite"
      className="settle fixed bottom-14 left-3 z-40 border border-line bg-panel px-3 py-1.5 text-2xs uppercase tracking-label text-text sm:left-4"
    >
      {message}
    </button>
  );
}
