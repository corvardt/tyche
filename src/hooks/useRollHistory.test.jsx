import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRollHistory } from './useRollHistory';

/**
 * The window is small and the arithmetic is off-by-one all the way through:
 * `offset` counts back from the newest while eviction happens at the oldest
 * end, so a reader looking back has to be carried by every push.
 */

/** A batch, identified by its single address, which is all these assert on. */
const batch = (n) => [{ address: `0x${n}` }];

const setup = (depth = 3) => renderHook(() => useRollHistory(depth));

const push = (result, ...ns) =>
  act(() => {
    for (const n of ns) result.current.push(batch(n));
  });

describe('useRollHistory', () => {
  it('starts live, with nothing to go back to', () => {
    const { result } = setup();
    expect(result.current.viewing).toBeNull();
    expect(result.current.canBack).toBe(false);
    expect(result.current.canForward).toBe(false);
  });

  it('holds the live batch but will not go back to it', () => {
    const { result } = setup();
    push(result, 1);
    // One batch held, and it is the one already on screen.
    expect(result.current.canBack).toBe(false);
  });

  it('goes back and forward, ending at live', () => {
    const { result } = setup();
    push(result, 1, 2, 3);

    act(() => result.current.back());
    expect(result.current.viewing).toEqual(batch(2));
    act(() => result.current.back());
    expect(result.current.viewing).toEqual(batch(1));
    expect(result.current.canBack).toBe(false);

    act(() => result.current.forward());
    expect(result.current.viewing).toEqual(batch(2));
    act(() => result.current.forward());
    expect(result.current.viewing).toBeNull();
    expect(result.current.canForward).toBe(false);
  });

  it('holds a reader on the batch they are looking at as new ones land', () => {
    const { result } = setup();
    push(result, 1, 2);
    act(() => result.current.back());
    expect(result.current.viewing).toEqual(batch(1));

    // A new batch in front of it: still batch 1, one further back.
    push(result, 3);
    expect(result.current.viewing).toEqual(batch(1));
    expect(result.current.offset).toBe(2);
  });

  it('leaves a reader on the oldest batch still held when theirs falls off', () => {
    const { result } = setup(3);
    push(result, 1, 2, 3);
    act(() => result.current.back());
    act(() => result.current.back());
    expect(result.current.viewing).toEqual(batch(1));

    // Batch 1 is evicted; the window is 2, 3, 4 and the reader lands on 2.
    push(result, 4);
    expect(result.current.viewing).toEqual(batch(2));
    expect(result.current.depth).toBe(3);
  });

  it('never drags a live sheet backwards', () => {
    const { result } = setup();
    push(result, 1, 2, 3, 4, 5);
    expect(result.current.offset).toBe(0);
    expect(result.current.viewing).toBeNull();
  });

  it('returns to live from anywhere', () => {
    const { result } = setup();
    push(result, 1, 2, 3);
    act(() => result.current.back());
    act(() => result.current.live());
    expect(result.current.viewing).toBeNull();
  });
});
