import { describe, expect, it } from 'vitest';
import { computeAddress, hexlify, randomBytes } from 'ethers';

import { STORAGE_KEYS } from '../config';
import { readHits } from './hits';

const key = () => hexlify(randomBytes(32)).slice(2);

describe('reading hits back', () => {
  it('is empty when nothing has ever been found', () => {
    expect(readHits()).toEqual([]);
    localStorage.setItem(STORAGE_KEYS.hits, '');
    expect(readHits()).toEqual([]);
  });

  it('round-trips the record format', () => {
    const entry = { address: '0xabc', privateKey: 'ff', balances: { 1: 2 }, at: '2026-07-25T00:00:00Z' };
    localStorage.setItem(STORAGE_KEYS.hits, JSON.stringify([entry]));
    expect(readHits()).toEqual([entry]);
  });

  it('recovers hits written in the old flat-string format', () => {
    // The only data in the app that has to outlive the tab. Earlier versions
    // stored "<key> has <n>Ξ" segments joined with '; ' and no address at all.
    const a = key();
    const b = key();
    localStorage.setItem(STORAGE_KEYS.hits, `${a} has 1.5Ξ; ${b} has 0.002Ξ`);

    const hits = readHits();
    expect(hits).toHaveLength(2);
    expect(hits[0].privateKey).toBe(a);
    expect(hits[0].balance).toBe(1.5);
    expect(hits[1].balance).toBe(0.002);
  });

  it('derives the address the old format never stored', () => {
    const a = key();
    localStorage.setItem(STORAGE_KEYS.hits, `${a} has 3Ξ`);
    expect(readHits()[0].address).toBe(computeAddress(`0x${a}`));
  });

  it('ignores segments that are not hits', () => {
    const a = key();
    localStorage.setItem(STORAGE_KEYS.hits, `nonsense; ${a} has 1Ξ; ; not a key has 2Ξ`);
    expect(readHits()).toHaveLength(1);
  });

  it('degrades to empty rather than throwing on garbage', () => {
    localStorage.setItem(STORAGE_KEYS.hits, '{not json');
    expect(readHits()).toEqual([]);
    localStorage.setItem(STORAGE_KEYS.hits, '{"not":"an array"}');
    expect(readHits()).toEqual([]);
  });
});
