import { useCallback, useEffect, useRef, useState } from 'react';
import { ETHERSCAN_BATCH_SIZE, KEYS_PER_ROLL, STORAGE_KEYS } from '../config';
import { generateAccounts, isFunded } from '../lib/accounts';
import { fetchBalances } from '../lib/etherscan';
import { fetchEthPrice } from '../lib/price';
import { readNumber, readString, writeString } from '../lib/storage';

/**
 * Owns one roll: generate a batch, price it, look up balances, publish results.
 *
 * The previous version split this across `GenAdrs`, an effect keyed on the
 * generated list, and `CheckAdrs`, which made ordering implicit and let a failed
 * request leave `loading` stuck on forever. It is one linear async function now.
 */
export function useScanner({ testMode, onHit }) {
  const [accounts, setAccounts] = useState([]);
  const [previousAccounts, setPreviousAccounts] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ethPrice, setEthPrice] = useState(null);
  const [keysChecked, setKeysChecked] = useState(() =>
    readNumber(STORAGE_KEYS.keysChecked, 0),
  );
  const [halted, setHalted] = useState(false);

  // Guards against overlapping rolls (auto mode ticking faster than the API) and
  // against setting state after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const onHitRef = useRef(onHit);

  useEffect(() => {
    onHitRef.current = onHit;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const recordHits = useCallback((funded) => {
    if (funded.length === 0) return;

    const lines = funded.map((a) => `${a.privateKey} has ${a.balance}Ξ`);
    const existing = readString(STORAGE_KEYS.hits);
    writeString(
      STORAGE_KEYS.hits,
      existing ? [existing, ...lines].join('; ') : lines.join('; '),
    );

    for (const account of funded) {
      console.warn(`${account.privateKey} has ${account.balance}Ξ`);
    }
    onHitRef.current?.(funded);
  }, []);

  const roll = useCallback(async () => {
    if (inFlight.current || halted) return;
    inFlight.current = true;

    const started = Date.now();
    setScanning(true);
    setError(null);
    setProgress(10);

    const batch = generateAccounts({ testMode });

    // Keep the last completed set on screen while the new one resolves, rather
    // than flashing an empty grid.
    setPreviousAccounts((previous) => (accounts.length > 0 ? accounts : previous));
    setAccounts(batch);

    try {
      fetchEthPrice().then((price) => {
        if (mounted.current && price !== null) setEthPrice(price);
      });

      let completed = 0;
      const balances = await fetchBalances(
        batch.map((account) => account.address),
        {
          onBatch: () => {
            completed += 1;
            if (mounted.current) {
              setProgress(
                Math.min(90, (completed / Math.ceil(KEYS_PER_ROLL / ETHERSCAN_BATCH_SIZE)) * 90),
              );
            }
          },
        },
      );

      if (!mounted.current) return;

      const scanned = batch.map((account) => ({
        ...account,
        balance: balances.get(account.address.toLowerCase()) ?? 0,
      }));

      setAccounts(scanned);
      setPreviousAccounts(scanned);
      setHasScanned(true);
      setProgress(100);
      setElapsedMs(Date.now() - started);

      const total = readNumber(STORAGE_KEYS.keysChecked, 0) + batch.length;
      writeString(STORAGE_KEYS.keysChecked, String(total));
      setKeysChecked(total);

      const funded = scanned.filter(isFunded);
      if (funded.length > 0) {
        setHalted(true);
        recordHits(funded);
      }
    } catch (cause) {
      if (!mounted.current) return;
      // Surfacing this is the whole point: a failed lookup used to leave the app
      // spinning on a disabled button with nothing on screen to explain why.
      setError(cause.message ?? 'Balance lookup failed');
      // Key generation does not depend on Etherscan, so the batch stays on screen
      // with unknown balances. Dropping it here (back to an empty
      // `previousAccounts` on the first roll) left the app permanently blank
      // whenever the API key was missing or the request failed.
      setAccounts(batch);
      setPreviousAccounts(batch);
      setProgress(0);
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setScanning(false);
        setTimeout(() => mounted.current && setProgress(0), 150);
      }
    }
  }, [accounts, halted, previousAccounts, recordHits, testMode]);

  // Keeps a stable reference for the auto-mode interval, so it never captures a
  // stale `roll` and never needs to be torn down on every render.
  const rollRef = useRef(roll);
  useEffect(() => {
    rollRef.current = roll;
  });

  const rollNow = useCallback(() => rollRef.current(), []);

  return {
    accounts,
    previousAccounts,
    scanning,
    hasScanned,
    error,
    progress,
    elapsedMs,
    ethPrice,
    keysChecked,
    halted,
    resumeAfterHit: () => setHalted(false),
    roll: rollNow,
  };
}
