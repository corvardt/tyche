import { useCallback, useState } from 'react';
import { KEYS_PER_ROLL, KEYS_PER_ROLL_OPTIONS, STORAGE_KEYS } from '../config';
import { CHAINS, DEFAULT_CHAIN_ID } from '../lib/chains';
import { readJSON, readNumber, readString, writeJSON, writeString } from '../lib/storage';
import { PALETTES } from '../lib/theme';

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
  // On unless switched off. Watching the machine work is most of what there is
  // to do here, so the commentary is the default state and quiet is the choice.
  // Tested against 'off' rather than for 'on' so an unset key reads as on.
  const [verbose, setVerboseState] = useState(
    () => readString(STORAGE_KEYS.verbose, '') !== 'off',
  );

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

  // On whenever a filter is present. Someone who has gone to the trouble of
  // building one did not do it to leave it switched off; turning it off is for
  // reading every address against the chain deliberately.
  const [screening, setScreeningState] = useState(
    () => readString(STORAGE_KEYS.screening, '') !== 'off',
  );

  const setScreening = useCallback((next) => {
    setScreeningState(next);
    writeString(STORAGE_KEYS.screening, next ? 'on' : 'off');
  }, []);

  const setVerbose = useCallback((next) => {
    setVerboseState(next);
    writeString(STORAGE_KEYS.verbose, next ? 'on' : 'off');
  }, []);

  // The coating. Read back from the attribute the boot script in index.html
  // already set, so this agrees with what is on screen rather than resolving
  // the same stored value a second time.
  const [palette, setPaletteState] = useState(
    () => document.documentElement.dataset.palette || 'white',
  );

  const setPalette = useCallback((next) => {
    const safe = PALETTES.includes(next) ? next : 'white';
    document.documentElement.dataset.palette = safe;
    setPaletteState(safe);
    writeString(STORAGE_KEYS.palette, safe);
  }, []);

  return {
    chains,
    setChains,
    toggleChain,
    keysPerRoll,
    setKeysPerRoll,
    verbose,
    setVerbose,
    screening,
    setScreening,
    palette,
    setPalette,
  };
}
