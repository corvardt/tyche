import { memo, useEffect, useRef, useState } from 'react';

/**
 * What the sheet becomes while the screen is running flat out.
 *
 * A contact sheet is a way of looking at forty keys. Under auto with a filter
 * loaded there are thousands a second and none of them survive, so forty
 * identicons swapped wholesale every four hundred milliseconds is not a picture
 * of anything — it is a strobe, and the one thing it cannot show is the one
 * thing happening: volume passing through a filter that rejects all of it.
 *
 * So the cells go and the tube itself is the readout. Every screened key leaves
 * a grain, every grain decays, and what stands on the glass is the balance
 * between the two: density is rate, directly. Nothing here is a frame — the
 * field is continuous, which is precisely why it cannot flicker no matter how
 * fast rolls land behind it.
 *
 * A candidate is drawn hot and larger. It fades on the same curve as everything
 * else, so it lingers rather than persists, which is the correct weight for it:
 * a candidate is not a find, it is the one key in a hundred million the filter
 * could not rule out on its own.
 *
 * The grains fall where they fall. Position carries nothing, and is not made to
 * look as though it does: what is true here is how many and how fast.
 */

/** One grain per key, to this ceiling in a single frame. */
const MAX_GRAINS_PER_FRAME = 600;

/**
 * How much of the field is erased per frame, and so how long a grain lasts:
 * about seventy frames, a bit over a second.
 *
 * Density is the product of this and the rate, which is what makes the field
 * readable as a rate at all. Too short a tail and a few thousand keys a second
 * is a handful of specks on a large black rectangle; too long and the field
 * saturates and stops responding to anything.
 */
const DECAY = 0.015;

/** Grain edge in CSS pixels, scaled by the device ratio when drawn. */
const GRAIN_PX = 3;

/** A candidate is drawn at this edge instead, and cannot be mistaken for grain. */
const CANDIDATE_PX = 6;

/** Smoothing on the rate, so the readout is legible rather than twitching. */
const SMOOTHING = 0.12;

/** How often the number under the field is allowed to change. */
const READOUT_MS = 250;

const readInk = (element) => {
  const style = getComputedStyle(element);
  return {
    rest: style.getPropertyValue('--c-text').trim() || '#c8c8cc',
    hot: style.getPropertyValue('--c-strike').trim() || '#ffffff',
  };
};

/**
 * @param {object} props
 * @param {number} props.screened   keys screened this session, cumulative
 * @param {number} props.candidates candidates raised this session, cumulative
 * @param {number} props.batchSize  keys per roll, so the field stands where the sheet did
 * @param {string} props.theme      re-read the palette when the medium changes
 * @param {string} props.palette    or when the tube's coating does
 */
function PhosphorField({ screened, candidates, batchSize = 40, theme = 'dark', palette = 'white' }) {
  const canvasRef = useRef(null);
  const latest = useRef({ screened, candidates });
  const [rate, setRate] = useState(0);

  // Written every render, read by the loop. The loop must not restart when a
  // roll lands — at eighty rolls a second it would never run a frame.
  useEffect(() => {
    latest.current = { screened, candidates };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    const ink = readInk(canvas);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;

    /**
     * The field as one exposure rather than a running one.
     *
     * Asked for less motion, the honest answer is a still of the same thing,
     * not an empty rectangle: the grain is what the panel is, and the rate goes
     * on the readout underneath where it can be read without moving.
     */
    const paintStill = () => {
      const ratio = window.devicePixelRatio || 1;
      const size = Math.max(1, Math.round(GRAIN_PX * ratio));
      const grains = Math.round((width * height) / (size * size * 14));
      context.fillStyle = ink.rest;
      for (let i = 0; i < grains; i += 1) {
        context.globalAlpha = 0.4 + Math.random() * 0.45;
        context.fillRect(Math.random() * width, Math.random() * height, size, size);
      }
      context.globalAlpha = 1;
    };

    // `clientWidth`/`clientHeight`, never `getBoundingClientRect`. The field
    // sits inside the wrapper that the channel change scales, and a bounding
    // rect carries ancestor transforms with it: measured mid-bloom it reports a
    // box a few pixels tall, the backing store is built at that size, and CSS
    // then stretches those few rows over the full height. Every grain comes out
    // as a vertical streak and stays that way until the next resize. The layout
    // box does not move when something is transformed, so it is the honest one.
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;

      width = Math.max(1, Math.round(cssWidth * ratio));
      height = Math.max(1, Math.round(cssHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      if (still) paintStill();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    if (still) {
      let previous = latest.current.screened;
      let last = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        const seen = latest.current.screened;
        setRate(Math.round(((seen - previous) * 1000) / Math.max(1, now - last)));
        previous = seen;
        last = now;
      }, READOUT_MS * 2);
      return () => {
        clearInterval(id);
        observer.disconnect();
      };
    }

    let frame = 0;
    let previousScreened = latest.current.screened;
    let previousCandidates = latest.current.candidates;
    let lastTime = performance.now();
    let lastReadout = lastTime;
    let smoothed = 0;

    const draw = (time) => {
      frame = requestAnimationFrame(draw);

      // Clamped: a backgrounded tab hands back one enormous step, which would
      // otherwise arrive as a single white flash of catch-up grains.
      const elapsed = Math.min(0.25, Math.max(0.001, (time - lastTime) / 1000));
      lastTime = time;

      const { screened: seen, candidates: raised } = latest.current;
      const newKeys = Math.max(0, seen - previousScreened);
      const newCandidates = Math.max(0, raised - previousCandidates);
      previousScreened = seen;
      previousCandidates = raised;

      const instant = newKeys / elapsed;
      smoothed = smoothed === 0 ? instant : smoothed + (instant - smoothed) * SMOOTHING;

      if (time - lastReadout >= READOUT_MS) {
        lastReadout = time;
        setRate(Math.round(smoothed));
      }

      // Erase toward transparent rather than painting the background over the
      // top: the panel colour then belongs to CSS alone, and the field is right
      // in both media without knowing which one it is in.
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = `rgba(0, 0, 0, ${DECAY})`;
      context.fillRect(0, 0, width, height);

      context.globalCompositeOperation = 'source-over';

      const ratio = window.devicePixelRatio || 1;

      const grains = Math.min(MAX_GRAINS_PER_FRAME, newKeys);
      if (grains > 0) {
        context.fillStyle = ink.rest;
        const size = Math.max(1, Math.round(GRAIN_PX * ratio));
        for (let i = 0; i < grains; i += 1) {
          // Varied alpha so the field has depth rather than reading as one
          // uniform dither. The floor is high enough that ink on stock carries
          // as far as light on black does; the tube gets bloom and scanlines to
          // help it and the paper gets nothing.
          context.globalAlpha = 0.55 + Math.random() * 0.45;
          context.fillRect(Math.random() * width, Math.random() * height, size, size);
        }
        context.globalAlpha = 1;
      }

      if (newCandidates > 0) {
        context.fillStyle = ink.hot;
        const size = Math.max(2, Math.round(CANDIDATE_PX * ratio));
        for (let i = 0; i < Math.min(24, newCandidates); i += 1) {
          context.globalAlpha = 1;
          context.fillRect(Math.random() * width, Math.random() * height, size, size);
        }
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [theme, palette]);

  // The sheet is five cells across, eight past the breakpoint, and its height
  // follows from that. The field takes the same shape so switching between them
  // moves nothing on the page. Sized from the roll setting rather than from the
  // sheet's own `slots`, which is zero between rolls and would collapse the
  // field to a letterbox eighty times a second.
  const rowsNarrow = Math.max(1, Math.ceil(batchSize / 5));
  const rowsWide = Math.max(1, Math.ceil(batchSize / 8));

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="field"
        style={{ '--rows-narrow': rowsNarrow, '--rows-wide': rowsWide }}
        role="img"
        aria-label="Screening activity. Each grain is a key read against the filter."
      />
      <dl className="mt-2 flex items-baseline justify-between px-1 text-2xs tracking-label text-dim">
        <div className="flex items-baseline gap-2">
          <dt>screening</dt>
          <dd className="text-text">{rate.toLocaleString('en-US')} / sec</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>candidates</dt>
          <dd className={candidates > 0 ? 'glow text-strike' : 'text-text'}>
            {candidates.toLocaleString('en-US')}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// The field paints itself from a ref on its own clock. Re-rendering it because
// a roll landed would be eighty wasted renders a second.
export default memo(PhosphorField);
