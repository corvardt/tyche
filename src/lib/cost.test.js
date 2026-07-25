import { describe, expect, it } from 'vitest';

import { ETHERSCAN_CALLS_PER_DAY, ETHERSCAN_CALLS_PER_SECOND } from '../config';
import { describeCost, keyspaceFraction, yearsToExhaust } from './cost';

const at = (chains, keysPerRoll = 40) => describeCost({ keysPerRoll, chains });

describe('what a setting costs', () => {
  it('matches the published table', () => {
    // These numbers are in the README and in the chain panel, and they are the
    // whole basis for the default being Ethereum alone.
    expect(at([1]).callsPerRoll).toBe(2);
    expect(at([1]).callsPerSecond).toBe(1);
    expect(Math.round(at([1]).callsPerDay)).toBe(86_400);

    expect(at([1, 137]).callsPerRoll).toBe(4);
    expect(Math.round(at([1, 137]).callsPerDay)).toBe(172_800);

    expect(at([1, 137, 42161]).callsPerRoll).toBe(6);
    expect(at([1, 137, 42161]).callsPerSecond).toBe(3);
    expect(Math.round(at([1, 137, 42161]).callsPerDay)).toBe(259_200);
  });

  it('puts one chain inside the daily allowance and three outside it', () => {
    expect(at([1]).overDailyLimit).toBe(false);
    expect(at([1]).hoursToDailyCap).toBeGreaterThan(24);

    expect(at([1, 137, 42161]).overDailyLimit).toBe(true);
    expect(at([1, 137, 42161]).hoursToDailyCap).toBeCloseTo(9.26, 1);
  });

  it('flags the per-second ceiling only once it is passed', () => {
    expect(at([1, 137, 42161]).callsPerSecond).toBe(ETHERSCAN_CALLS_PER_SECOND);
    expect(at([1, 137, 42161]).overRateLimit).toBe(false);
    expect(at([1, 137, 42161, 59144]).overRateLimit).toBe(true);
  });

  it('scales reachable keys as exactly 1/N in the chain count', () => {
    // The claim the chain panel makes: reading N chains multiplies the odds any
    // one key is funded by roughly N and divides the keys reachable in a day by
    // exactly N, so they cancel.
    const one = at([1]).keysPerDay;
    expect(one).toBe(2_000_000);

    for (const n of [2, 3, 4, 5]) {
      const chains = [1, 137, 42161, 59144, 100].slice(0, n);
      expect(at(chains).keysPerDay * n).toBeCloseTo(one, 6);
    }
  });

  it('does not let batch size change the cost per key', () => {
    // A quota buys lookups; how they are grouped into rolls is irrelevant.
    const sizes = [20, 40, 100, 200].map((keysPerRoll) => at([1], keysPerRoll).keysPerDay);
    expect(new Set(sizes).size).toBe(1);
  });

  it('treats no chains as one rather than dividing by zero', () => {
    expect(at([]).callsPerRoll).toBe(2);
    expect(Number.isFinite(at([]).keysPerDay)).toBe(true);
  });

  it('derives the ceiling from the configured allowance', () => {
    expect(at([1]).keysPerDay).toBe(ETHERSCAN_CALLS_PER_DAY * 20);
  });
});

describe('against the keyspace', () => {
  it('reports a fraction small enough to need an exponent', () => {
    expect(keyspaceFraction(0)).toBe('0');
    // Any figure a browser can reach still has forty-odd leading zeros; that it
    // never visibly moves is the point of the readout.
    expect(keyspaceFraction(1e9)).toMatch(/e-\d\d/);
    expect(Number(keyspaceFraction(1e9))).toBeLessThan(1e-38);
  });

  it('projects nothing while at rest', () => {
    expect(yearsToExhaust(0)).toBe(Infinity);
  });

  it('projects longer than the universe at any reachable rate', () => {
    const atQuotaCeiling = 2_000_000 / 86_400;
    expect(yearsToExhaust(atQuotaCeiling)).toBeGreaterThan(1e30);
    // Even screening locally, which is two orders of magnitude faster.
    expect(yearsToExhaust(2_667)).toBeGreaterThan(1e30);
  });
});
