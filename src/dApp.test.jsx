import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DApp from './dApp';

const { fetchBalances, fetchEthPrice, hasApiKey } = vi.hoisted(() => ({
  fetchBalances: vi.fn(),
  fetchEthPrice: vi.fn(),
  hasApiKey: vi.fn(),
}));

vi.mock('./lib/etherscan', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchBalances,
  hasApiKey,
}));
vi.mock('./lib/price', () => ({ fetchEthPrice }));

const allEmpty = (addresses) => new Map(addresses.map((a) => [a.toLowerCase(), {}]));

beforeEach(() => {
  fetchBalances.mockReset();
  fetchEthPrice.mockReset();
  hasApiKey.mockReset();
  hasApiKey.mockReturnValue(true);
  fetchEthPrice.mockResolvedValue(null);
  fetchBalances.mockImplementation(async (addresses) => allEmpty(addresses));
  localStorage.setItem('keysPerRoll', '20');
  // jsdom has neither, and the instrument asks both on mount.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

/**
 * Only drawn batches reach the history, and drawing is paced to `SHEET_MIN_MS`.
 * Rolls in a test land instantly, so the clock is walked forward between them
 * to make each one a batch the sheet would actually have shown.
 */
let ahead = 0;
const realNow = Date.now.bind(Date);
beforeEach(() => {
  ahead = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ahead);
});
const settle = () => {
  ahead += 500;
};

/** Presses `x`, but only once the last roll has actually finished: a roll
 *  asked for while one is in flight is dropped on purpose. */
let calls = 0;
const rollOnce = async () => {
  await waitFor(() => expect(screen.getByTitle('Press X').disabled).toBe(false));
  settle();
  calls += 1;
  act(() => {
    fireEvent.keyDown(document, { key: 'x' });
  });
  await waitFor(() => expect(fetchBalances).toHaveBeenCalledTimes(calls));
};

const back = async () => {
  await act(async () => {
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
  });
};

const marker = () => screen.getByText(/^(live|−\d+ \/ \d+)$/).textContent;

describe('history navigation', () => {
  it('steps back one batch at a time', async () => {
    calls = 1; // the roll on mount
    render(<DApp />);
    await waitFor(() => expect(fetchBalances).toHaveBeenCalledTimes(1));
    expect(marker()).toBe('live');

    // Roll a few times so there is something behind the live sheet.
    for (let i = 0; i < 5; i += 1) {
      await rollOnce();
    }

    const seen = [];
    for (let i = 0; i < 5; i += 1) {
      await back();
      seen.push(marker());
    }
    expect(seen).toEqual(['−1 / 5', '−2 / 5', '−3 / 5', '−4 / 5', '−5 / 5']);
  });

  it('holds the batch it is on while rolling carries on behind it', async () => {
    calls = 1; // the roll on mount
    render(<DApp />);
    await waitFor(() => expect(fetchBalances).toHaveBeenCalledTimes(1));
    expect(marker()).toBe('live');

    for (let i = 0; i < 15; i += 1) {
      await rollOnce();
    }

    for (let i = 0; i < 10; i += 1) {
      await back();
    }
    expect(marker()).toBe('−10 / 15');
    const held = screen.getAllByRole('img')[0]?.getAttribute('alt');

    // Three more rolls land in front of it. It must still be the batch on screen.
    for (let i = 0; i < 3; i += 1) {
      await rollOnce();
    }
    expect(marker()).toBe('−13 / 18');
    expect(screen.getAllByRole('img')[0]?.getAttribute('alt')).toBe(held);
  });

  it('steps forward one batch at a time, and only then to live', async () => {
    calls = 1;
    render(<DApp />);
    await waitFor(() => expect(fetchBalances).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 4; i += 1) await rollOnce();
    for (let i = 0; i < 3; i += 1) await back();
    expect(marker()).toBe('−3 / 4');

    const forward = async () => {
      await act(async () => {
        fireEvent.keyDown(document, { key: 'ArrowRight' });
      });
    };
    await forward();
    expect(marker()).toBe('−2 / 4');
    await forward();
    expect(marker()).toBe('−1 / 4');
    await forward();
    expect(marker()).toBe('live');
  });
});
