import { useEffect, useRef, useState } from 'react';

/**
 * Holds the outgoing display on screen long enough for the tube to collapse.
 *
 * The sheet and the field are not two pages, they are two modes of one tube, so
 * they change the way a channel changes: the picture pulls into a bright line
 * and blooms back out as the other thing. That only reads if the swap happens
 * while the line is closed. Rendering the incoming view first and animating
 * around it would show the new picture collapsing, which is the gesture
 * backwards.
 *
 * So `shown` lags `target`: it changes at the bottom of the collapse and the
 * bloom carries it back up.
 *
 * Both halves, in milliseconds. A channel change is not a page transition and
 * is not there to be admired: it wants to be over about as fast as the eye can
 * follow the line close and open again.
 *
 * The stylesheet carries the same pair as its own defaults so the keyframes
 * read sensibly alone, but the wrapper is handed an explicit
 * `animation-duration` from here, so these are the numbers that count and the
 * two cannot drift apart.
 *
 * @param {*} target the view that should be on screen
 * @returns {{shown: *, phase: 'collapse'|'bloom'|null, durationMs: number}}
 */
export const TUBE_COLLAPSE_MS = 80;
export const TUBE_BLOOM_MS = 150;

export function useTubeSwitch(
  target,
  { collapseMs = TUBE_COLLAPSE_MS, bloomMs = TUBE_BLOOM_MS } = {},
) {
  const [shown, setShown] = useState(target);
  const [phase, setPhase] = useState(null);
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    if (target === shown) return undefined;

    // Nothing to hide behind, so the swap is simply the swap.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return undefined;
    }

    setPhase('collapse');
    const toBloom = setTimeout(() => {
      setShown(target);
      setPhase('bloom');
    }, collapseMs);
    const toRest = setTimeout(() => setPhase(null), collapseMs + bloomMs);

    timers.current = [toBloom, toRest];
    return () => {
      clearTimeout(toBloom);
      clearTimeout(toRest);
    };
  }, [target, shown, collapseMs, bloomMs]);

  return { shown, phase, durationMs: phase === 'collapse' ? collapseMs : bloomMs };
}
