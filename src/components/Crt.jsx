import { memo } from 'react';

/**
 * The glass. Sits above everything, catches no pointer events, and is the only
 * place the retro treatment lives; the components underneath stay clean.
 */
function Crt() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <div className="crt-sweep absolute inset-x-0 top-0" />
      <div className="crt-scanlines absolute inset-0" />
      <div className="crt-vignette absolute inset-0" />
    </div>
  );
}

// Nothing reaches it. There is no render of the app that should also repaint
// the glass, and it repaints the whole viewport.
export default memo(Crt);

/** Corner ticks for panels and the sheet: an instrument bezel, not a border. */
export function Ticks() {
  return (
    <>
      <span className="tick left-0 top-0 border-l border-t" />
      <span className="tick right-0 top-0 border-r border-t" />
      <span className="tick bottom-0 left-0 border-b border-l" />
      <span className="tick bottom-0 right-0 border-b border-r" />
    </>
  );
}
