/**
 * A set of funded addresses, small enough to hold in a browser.
 *
 * The instrument is quota-bound, not compute-bound: Etherscan's free tier buys
 * two million lookups a day, while the same browser generates two and a half
 * thousand keys a second. Screening locally against a filter of addresses known
 * to hold something moves the ceiling by two orders of magnitude, and spends an
 * API call only when a candidate turns up.
 *
 * Addresses are the low twenty bytes of a keccak digest, so the input is
 * already uniform, but uniform input is not the same as independent probe
 * positions, and at the k this filter runs at, the difference is measurable.
 * See `probe`.
 */

const MAGIC = 'TYCHEBLM';
const VERSION = 1;
const HEADER_BYTES = 28;

const LN2 = Math.LN2;

/** Thrown for a file that is not one of ours, or is damaged. */
export class BloomError extends Error {
  name = 'BloomError';
}

/**
 * Bits per entry, and hashes per lookup, for a target false-positive rate.
 *
 * @param {number} entries
 * @param {number} falsePositiveRate
 */
export function sizeFor(entries, falsePositiveRate) {
  const n = Math.max(1, Math.floor(entries));
  const p = Math.min(Math.max(falsePositiveRate, 1e-12), 0.5);

  const m = Math.ceil(-(n * Math.log(p)) / (LN2 * LN2));
  const k = Math.max(1, Math.round((m / n) * LN2));
  return { m, k, n };
}

/**
 * The probability a miss is reported as a hit, for a filter as actually built.
 *
 * Not the rate that was asked for: rounding `k` to a whole number moves it, and
 * a filter loaded from disk should report what it is rather than what someone
 * intended.
 */
export const falsePositiveRate = ({ m, k, n }) => (1 - Math.exp((-k * n) / m)) ** k;

/** 40 hex characters, no `0x`, lowercased. Anything else is not an address. */
function normalise(address) {
  const hex = String(address).trim().replace(/^0x/i, '').toLowerCase();
  return /^[0-9a-f]{40}$/.test(hex) ? hex : null;
}

/** 32-bit avalanche, the murmur3 finalizer. */
function mix(x) {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Two seeds, folded from the whole address rather than its first eight bytes.
 *
 * `h2` is forced odd so repeated addition walks the entire bit array instead of
 * a subset. The `>>> 0` is load-bearing: `|` is an int32 operation, so without
 * it every word with the top bit set goes negative, which puts the bit index
 * negative too, dropped silently on write, read back as zero, and so reported
 * as a miss. A false negative is the one answer this filter must never give.
 */
function words(hex) {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;

  for (let i = 0; i < 40; i += 8) {
    const word = Number.parseInt(hex.slice(i, i + 8), 16);
    a = mix(a ^ word);
    b = Math.imul(b ^ word, 0x27d4eb2d) >>> 0;
  }

  return [a, (b | 1) >>> 0];
}

/**
 * The i-th bit position for an address.
 *
 * Plain double hashing, `h1 + i·h2` straight into the modulo, is the textbook
 * construction and it measurably does not hold here. It tracks the predicted
 * rate to about one in ten thousand and then comes apart: at one in a hundred
 * thousand it was twice the predicted rate, and at the one-in-a-hundred-million
 * this filter is built for it was off by more than two orders of magnitude,
 * because at k=27 the positions are an arithmetic progression and nowhere near
 * independent. Avalanching each one decorrelates them, and costs a handful of
 * integer operations against a budget with room to spare.
 */
const probe = (h1, h2, i, m) => mix(h1 + Math.imul(i + 1, h2)) % m;

/**
 * FNV-1a over the bit array, so a truncated or corrupted download is refused
 * rather than quietly screening every address as a miss.
 */
function checksum(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Pulls addresses out of whatever text they arrive in.
 *
 * A CSV from BigQuery or Dune, an Etherscan export, a bare list: the address
 * is the only part worth reading, so anything else on the line is ignored and a
 * header row costs nothing.
 *
 * @param {string} text
 * @returns {string[]} lowercased, de-duplicated, in first-seen order
 */
export function addressesFrom(text) {
  const found = String(text).match(/0x[0-9a-fA-F]{40}/g) ?? [];
  return [...new Set(found.map((address) => address.toLowerCase()))];
}

/**
 * Builds a filter over `addresses`.
 *
 * @param {Iterable<string>} addresses
 * @param {{falsePositiveRate?: number, entries?: number}} [options] `entries`
 *   sizes the filter ahead of a stream whose length is not known yet
 * @returns {{buffer: ArrayBuffer, m: number, k: number, n: number, skipped: number}}
 */
export function buildFilter(addresses, options = {}) {
  const list = Array.isArray(addresses) ? addresses : [...addresses];
  const target = options.falsePositiveRate ?? 1e-8;

  const valid = [];
  let skipped = 0;
  for (const address of list) {
    const hex = normalise(address);
    if (hex) valid.push(hex);
    else skipped += 1;
  }

  const { m, k } = sizeFor(options.entries ?? valid.length, target);
  const byteLength = Math.ceil(m / 8);

  const buffer = new ArrayBuffer(HEADER_BYTES + byteLength);
  const bytes = new Uint8Array(buffer, HEADER_BYTES, byteLength);

  for (const hex of valid) {
    const [h1, h2] = words(hex);
    for (let i = 0; i < k; i += 1) {
      const bit = probe(h1, h2, i, m);
      bytes[bit >>> 3] |= 1 << (bit & 7);
    }
  }

  const view = new DataView(buffer);
  for (let i = 0; i < MAGIC.length; i += 1) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint32(8, VERSION);
  view.setUint32(12, m);
  view.setUint32(16, k);
  view.setUint32(20, valid.length);
  view.setUint32(24, checksum(bytes));

  return { buffer, m, k, n: valid.length, skipped };
}

/**
 * Reads a filter built by {@link buildFilter}.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{m: number, k: number, n: number, bytes: Uint8Array, byteLength: number, falsePositiveRate: number}}
 */
export function parseFilter(buffer) {
  if (!buffer || buffer.byteLength < HEADER_BYTES) {
    throw new BloomError('Filter is too small to be valid.');
  }

  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < MAGIC.length; i += 1) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new BloomError('Not a Tyche filter.');

  const version = view.getUint32(8);
  if (version !== VERSION) throw new BloomError(`Unsupported filter version ${version}.`);

  const m = view.getUint32(12);
  const k = view.getUint32(16);
  const n = view.getUint32(20);
  const expected = view.getUint32(24);

  const byteLength = Math.ceil(m / 8);
  if (m === 0 || k === 0) throw new BloomError('Filter header is empty.');
  if (buffer.byteLength !== HEADER_BYTES + byteLength) {
    throw new BloomError('Filter is truncated.');
  }

  const bytes = new Uint8Array(buffer, HEADER_BYTES, byteLength);
  if (checksum(bytes) !== expected) throw new BloomError('Filter failed its checksum.');

  return { m, k, n, bytes, byteLength, falsePositiveRate: falsePositiveRate({ m, k, n }) };
}

/**
 * Whether an address might be in the set.
 *
 * False is certain; true is a candidate and has to be confirmed against the
 * chain. That asymmetry is the whole point: a miss costs nothing, and misses
 * are what almost every key is.
 *
 * @param {ReturnType<typeof parseFilter>} filter
 * @param {string} address
 */
export function mightContain(filter, address) {
  const hex = normalise(address);
  if (!hex) return false;

  const { m, k, bytes } = filter;
  const [h1, h2] = words(hex);

  for (let i = 0; i < k; i += 1) {
    const bit = probe(h1, h2, i, m);
    if ((bytes[bit >>> 3] & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}
