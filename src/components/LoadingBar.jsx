/**
 * A single scan line across the top edge, reporting the batch's progress.
 *
 * Progress was previously a Tailwind class string in state (`"w-[25%]"`) set at
 * four hardcoded points. Those are arbitrary classes generated at runtime, which
 * Tailwind's content scanner cannot see: `w-[50%]` and `w-[75%]` were never
 * emitted into the stylesheet, so the bar only ever showed empty or full. An
 * inline width sidesteps the scanner entirely.
 */
export default function LoadingBar({ percent }) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 h-px" aria-hidden="true">
      <div
        className="h-px bg-text transition-[width,opacity] duration-200"
        style={{ width: `${percent}%`, opacity: percent > 0 ? 1 : 0, boxShadow: '0 0 6px var(--bloom)' }}
      />
    </div>
  );
}
