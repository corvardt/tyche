import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KEYS_PER_ROLL_OPTIONS } from '../config';

// Counted rather than timed: the question is how many times the PNG encoder
// runs, and a stopwatch would answer it only on a quiet machine.
const encode = vi.fn((address) => `data:image/png;base64,${address}`);
vi.mock('ethereum-blockies-base64', () => ({ default: (address) => encode(address) }));

const { blockie } = await import('./blockie');

const sheet = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => `0x${String(i + offset).padStart(40, '0')}`);

describe('the identicon cache', () => {
  beforeEach(() => encode.mockClear());

  it('encodes an address once, however often it is painted', () => {
    const address = '0xabc';
    expect(blockie(address)).toBe(blockie(address));
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('holds a full sheet at the largest roll size', () => {
    // The regression this exists for: capacity was a flat 128 while a roll
    // could be 200, so the working set no longer fit and every repaint evicted
    // the entries it was about to ask for — 306ms of encoding per repaint, at
    // exactly the setting where the cache mattered most.
    const largest = Math.max(...KEYS_PER_ROLL_OPTIONS);
    const addresses = sheet(largest);

    addresses.forEach(blockie);
    expect(encode).toHaveBeenCalledTimes(largest);

    encode.mockClear();
    addresses.forEach(blockie);
    expect(encode).not.toHaveBeenCalled();
  });

  it('holds the sheet on screen and the one still behind it', () => {
    // A roll keeps the previous batch visible while the next resolves, so both
    // are live at once.
    const largest = Math.max(...KEYS_PER_ROLL_OPTIONS);
    const previous = sheet(largest, 0);
    const current = sheet(largest, largest);

    previous.forEach(blockie);
    current.forEach(blockie);

    encode.mockClear();
    previous.forEach(blockie);
    current.forEach(blockie);
    expect(encode).not.toHaveBeenCalled();
  });

  it('evicts rather than growing without bound', () => {
    // Each entry is a ~22kB data URI, so an hour of auto mode would pin well
    // over a gigabyte if this ever stopped being true.
    const far = sheet(50, 10_000_000);
    far.forEach(blockie);

    const flood = sheet(Math.max(...KEYS_PER_ROLL_OPTIONS) * 3, 20_000_000);
    flood.forEach(blockie);

    encode.mockClear();
    far.forEach(blockie);
    expect(encode).toHaveBeenCalledTimes(far.length);
  });
});
