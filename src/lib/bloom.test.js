import { describe, expect, it } from 'vitest';
import { computeAddress, hexlify, randomBytes } from 'ethers';

import {
  addressesFrom,
  BloomError,
  buildFilter,
  falsePositiveRate,
  mightContain,
  parseFilter,
  sizeFor,
} from './bloom';

/**
 * Addresses are the low twenty bytes of a keccak digest, so twenty random bytes
 * are distributed exactly like the real thing, while deriving real keypairs
 * costs a secp256k1 multiplication each, which at twenty thousand samples takes
 * far longer than the code under test.
 */
const addresses = (count) =>
  Array.from({ length: count }, () => hexlify(randomBytes(20)));

/** For the one case where it matters that these are genuine addresses. */
const realAddresses = (count) =>
  Array.from({ length: count }, () => computeAddress(hexlify(randomBytes(32))));

/** mulberry32, enough for uniform hex, and reproducible run to run. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic addresses. Measuring a false-positive rate against random input
 * gives a threshold that has to be loose enough to never flake, which is too
 * loose to catch the thing worth catching.
 */
function seeded(seed, count) {
  const next = rng(seed);
  return Array.from({ length: count }, () => {
    let hex = '';
    for (let i = 0; i < 40; i += 1) hex += Math.floor(next() * 16).toString(16);
    return `0x${hex}`;
  });
}

const build = (list, options) => parseFilter(buildFilter(list, options).buffer);

describe('sizing', () => {
  it('gives about 38 bits an entry at one in a hundred million', () => {
    const { m, k, n } = sizeFor(100_000, 1e-8);
    expect(m / n).toBeGreaterThan(37);
    expect(m / n).toBeLessThan(40);
    expect(k).toBe(27);
  });

  it('keeps a 100k-entry filter inside half a megabyte', () => {
    const { m } = sizeFor(100_000, 1e-8);
    expect(m / 8 / 1024).toBeLessThan(512);
  });

  it('reports the rate it actually achieves, not the one requested', () => {
    // Rounding k to a whole number moves the real rate; a filter should say
    // what it is rather than what someone intended.
    const { m, k, n } = sizeFor(50_000, 1e-6);
    expect(falsePositiveRate({ m, k, n })).toBeLessThan(1e-5);
  });

  it('survives degenerate inputs rather than producing a zero-length filter', () => {
    expect(sizeFor(0, 1e-8).m).toBeGreaterThan(0);
    expect(sizeFor(10, 0).m).toBeGreaterThan(0);
    expect(sizeFor(10, 1).k).toBeGreaterThanOrEqual(1);
  });
});

describe('membership', () => {
  it('never misses an address it was built from', () => {
    // The one property that must not break: a false negative means walking
    // past the thing the whole instrument exists to find.
    const known = addresses(20_000);
    const filter = build(known);
    for (const address of known) expect(mightContain(filter, address)).toBe(true);
  });

  it('never misses a genuine checksummed address', () => {
    const known = realAddresses(500);
    const filter = build(known);
    for (const address of known) expect(mightContain(filter, address)).toBe(true);
  });

  it('rejects addresses it has never seen', () => {
    const filter = build(addresses(2_000));
    const strangers = addresses(2_000);
    const hits = strangers.filter((a) => mightContain(filter, a));
    expect(hits).toHaveLength(0);
  });

  it('holds its false-positive rate where the filter actually runs', () => {
    // The reported rate is only worth anything if it survives at the low end,
    // and that is exactly where the textbook `h1 + i·h2` construction stopped
    // holding: it tracked the prediction to about 1e-4, was twice it by 1e-5,
    // and was out by two orders of magnitude at the 1e-8 this filter is built
    // for, because at high k an arithmetic progression's positions are not
    // independent. Every other test in this file passed throughout.
    //
    // Seeded rather than random so the threshold means something: on this
    // sample the current construction gives 5 hits and the old one 11, against
    // an expected 5. A drifting rate is not a crash, so nothing else would
    // notice it.
    const filter = build(seeded(1, 5_000), { falsePositiveRate: 1e-5 });
    expect(filter.falsePositiveRate).toBeLessThan(1.5e-5);

    const hits = seeded(999, 500_000).filter((a) => mightContain(filter, a)).length;
    expect(hits).toBeLessThanOrEqual(8);
  });

  it('holds its false-positive rate over a large sample', () => {
    // Deliberately loose: at 1e-2 over 20,000 draws the expected count is 200,
    // so a working filter lands far below 600 and a broken one lands near
    // 20,000 or 0.
    const filter = build(addresses(1_000), { falsePositiveRate: 1e-2 });
    const draws = addresses(20_000);
    const hits = draws.filter((a) => mightContain(filter, a)).length;

    expect(hits).toBeGreaterThan(20);
    expect(hits).toBeLessThan(600);
  });

  it('ignores case and an 0x prefix', () => {
    const [address] = addresses(1);
    const filter = build([address.toLowerCase()]);

    expect(mightContain(filter, address)).toBe(true);
    expect(mightContain(filter, address.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(mightContain(filter, address.slice(2))).toBe(true);
  });

  it('treats anything that is not an address as a miss', () => {
    const filter = build(addresses(10));
    for (const junk of ['', 'hello', '0x', '0x1234', null, undefined, '0xzz']) {
      expect(mightContain(filter, junk)).toBe(false);
    }
  });

  it('drops unusable entries at build time and says how many', () => {
    const good = addresses(5);
    const { n, skipped } = buildFilter([...good, 'nonsense', '', '0x123']);
    expect(n).toBe(5);
    expect(skipped).toBe(3);
  });
});

describe('reading an address list', () => {
  it('takes a CSV without needing it cleaned up first', () => {
    const [a, b] = addresses(2);
    const csv = `address,balance\n${a},1200\n${b},34\n`;
    expect(addressesFrom(csv)).toEqual([a.toLowerCase(), b.toLowerCase()]);
  });

  it('takes a bare list, and anything with addresses buried in it', () => {
    const [a] = addresses(1);
    expect(addressesFrom(a)).toEqual([a.toLowerCase()]);
    expect(addressesFrom(`rank 1: ${a} (whale)`)).toEqual([a.toLowerCase()]);
  });

  it('de-duplicates, keeping first-seen order', () => {
    const [a, b] = addresses(2);
    expect(addressesFrom([a, b, a, b].join('\n'))).toEqual([a.toLowerCase(), b.toLowerCase()]);
  });

  it('is case-insensitive, since checksums are just capitalisation', () => {
    const [a] = addresses(1);
    expect(addressesFrom(a.toUpperCase().replace('0X', '0x'))).toEqual([a.toLowerCase()]);
  });

  it('finds nothing in text that has nothing in it', () => {
    expect(addressesFrom('')).toEqual([]);
    expect(addressesFrom('address,balance\nno rows')).toEqual([]);
    // Too short and too long are both not addresses.
    expect(addressesFrom('0x1234')).toEqual([]);
  });
});

describe('the file', () => {
  it('round-trips its header', () => {
    const { buffer, m, k, n } = buildFilter(addresses(500), { falsePositiveRate: 1e-6 });
    const filter = parseFilter(buffer);

    expect(filter.m).toBe(m);
    expect(filter.k).toBe(k);
    expect(filter.n).toBe(n);
    expect(filter.byteLength).toBe(Math.ceil(m / 8));
  });

  it('can be sized ahead of a stream whose length is not yet known', () => {
    const { m } = buildFilter(addresses(10), { entries: 100_000, falsePositiveRate: 1e-8 });
    expect(m).toBe(sizeFor(100_000, 1e-8).m);
  });

  it('refuses a file that is not ours', () => {
    const notOurs = new Uint8Array(64).buffer;
    expect(() => parseFilter(notOurs)).toThrow(BloomError);
  });

  it('refuses a truncated file', () => {
    const { buffer } = buildFilter(addresses(200));
    expect(() => parseFilter(buffer.slice(0, buffer.byteLength - 32))).toThrow(/truncated/i);
  });

  it('refuses a corrupted file rather than screening everything as a miss', () => {
    // A flipped bit would otherwise turn into silent false negatives, which is
    // the one failure mode with no symptom.
    const { buffer } = buildFilter(addresses(200));
    const bytes = new Uint8Array(buffer);
    bytes[bytes.length - 1] ^= 0xff;

    expect(() => parseFilter(buffer)).toThrow(/checksum/i);
  });

  it('refuses something far too small to hold a header', () => {
    expect(() => parseFilter(new Uint8Array(4).buffer)).toThrow(BloomError);
    expect(() => parseFilter(null)).toThrow(BloomError);
  });
});

describe('cost', () => {
  it('screens far faster than the API could answer', () => {
    // The whole justification: the quota buys ~23 lookups a second.
    const filter = build(addresses(10_000), { falsePositiveRate: 1e-8 });
    const sample = addresses(20_000);

    const started = performance.now();
    for (const address of sample) mightContain(filter, address);
    const perSecond = sample.length / ((performance.now() - started) / 1000);

    expect(perSecond).toBeGreaterThan(100_000);
  });
});
