import { useCallback, useState } from 'react';
import { KEYS_PER_ROLL, KEYS_PER_ROLL_OPTIONS, STORAGE_KEYS } from '../config';
import { CHAINS, DEFAULT_CHAIN_ID } from '../lib/chains';
import { readJSON, readNumber, writeJSON, writeString } from '../lib/storage';

const KNOWN = new Set(CHAINS.map((chain) => chain.id));

/**
 * What the instrument is set to: which chains a roll is read against, and how
 * many keys it generates.
 *
 * Both default to what the app did before they existed — mainnet, forty keys —
 * because both cost quota, and a stored setting should never be able to make
 * the app more expensive than the reader last saw it being.
 */
function loadChains() {
  const stored = readJSON(STORAGE_KEYS.chains, null);
  const valid = Array.isArray(stored) ? stored.map(Number).filter((id) => KNOWN.has(id)) : [];
  // Reading nothing at all is not a configuration; it is a broken app that
  // silently reports every address as empty.
  return valid.length > 0 ? valid : [DEFAULT_CHAIN_ID];
}

function loadKeysPerRoll() {
  const stored = readNumber(STORAGE_KEYS.keysPerRoll, KEYS_PER_ROLL);
  return KEYS_PER_ROLL_OPTIONS.includes(stored) ? stored : KEYS_PER_ROLL;
}

export function useSettings() {
  const [chains, setChainsState] = useState(loadChains);
  const [keysPerRoll, setKeysPerRollState] = useState(loadKeysPerRoll);

  const setChains = useCallback((next) => {
    const cleaned = next.filter((id) => KNOWN.has(id));
    const safe = cleaned.length > 0 ? cleaned : [DEFAULT_CHAIN_ID];
    setChainsState(safe);
    writeJSON(STORAGE_KEYS.chains, safe);
  }, []);

  const toggleChain = useCallback(
    (id) =>
      setChains(chains.includes(id) ? chains.filter((c) => c !== id) : [...chains, id]),
    [chains, setChains],
  );

  const setKeysPerRoll = useCallback((next) => {
    const safe = KEYS_PER_ROLL_OPTIONS.includes(next) ? next : KEYS_PER_ROLL;
    setKeysPerRollState(safe);
    writeString(STORAGE_KEYS.keysPerRoll, String(safe));
  }, []);

  return { chains, setChains, toggleChain, keysPerRoll, setKeysPerRoll };
}
