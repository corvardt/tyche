import { describe, expect, it } from 'vitest';

import { ETHERSCAN_CALLS_PER_DAY, ETHERSCAN_CALLS_PER_SECOND } from '../config';
import { describeCost, keyspaceFraction, yearsToExhaust } from './cost';

const at = (chains, keysPerRoll = 40) => describeCost({ keysPerRoll, chains });

describe('what a setting costs', () => {
  it('counts the calls a roll makes', () => {
    expect(at([1]).callsPerRoll).toBe(2);
    expect(at([1, 137]).callsPerRoll).toBe(4);
    expect(at([1, 137, 42161]).callsPerRoll).toBe(6);
    expect(at([1], 200).callsPerRoll).toBe(10);
  });

  it('is paced by the limiter, not by the settings', () => {
    // Auto rolls continuously, so the calls saturate the limiter whatever the
    // batch size or chain count. Nothing here changes the rate.
    const rate = at([1]).callsPerSecond;
    expect(rate).toBeLessThan(ETHERSCAN_CALLS_PER_SECOND);

    for (const chains of [[1], [1, 137], [1, 137, 42161, 59144, 100]]) {
      expect(at(chains).callsPerSecond).toBe(rate);
      expect(at(chains, 200).callsPerSecond).toBe(rate);
    }
  });

  it('spends a free tier day in about ten hours, whatever is selected', () => {
    for (const chains of [[1], [1, 137], [1, 137, 42161]]) {
      expect(at(chains).hoursToDailyCap).toBeCloseTo(10.3, 1);
      expect(at(chains, 200).hoursToDailyCap).toBeCloseTo(10.3, 1);
    }
  });

  it('reports no exceedance flag, because every selection would raise it', () => {
    // The panel used to colour the allowance row from this. Saturating the
    // limiter passes the daily cap under every input, so the flag said nothing
    // and the colour never came off.
    expect(at([1])).not.toHaveProperty('overDailyLimit');
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
