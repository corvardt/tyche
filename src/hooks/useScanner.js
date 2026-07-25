import { useCallback, useEffect, useRef, useState } from 'react';
import { ETHERSCAN_BATCH_SIZE, KEYS_PER_ROLL, STORAGE_KEYS } from '../config';
import { generateAccounts, isFunded } from '../lib/accounts';
import { fetchBalances } from '../lib/etherscan';
import { readHits } from '../lib/hits';
import { fetchEthPrice } from '../lib/price';
import { readNumber, writeJSON, writeString } from '../lib/storage';

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
  // Rolls that have failed back to back. Auto mode watches this so a bad key or
  // a rate limit cannot be answered by asking again every two seconds forever.
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // Guards against overlapping rolls (auto mode ticking faster than the API) and
  // against setting state after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const onHitRef = useRef(onHit);

  // `halted` is mirrored into a ref because the guard inside `roll` has to read
  // it synchronously. Resuming sets state and then rolls in the same tick, and a
  // closure over the state value would still say `true` at that point and drop
  // the roll on the floor. It also keeps `halted` out of `roll`'s deps.
  const haltedRef = useRef(false);
  const halt = useCallback((next) => {
    haltedRef.current = next;
    setHalted(next);
  }, []);

  useEffect(() => {
    onHitRef.current = onHit;
  });

  // `fetchBalances` and `fetchEthPrice` have both taken a `signal` from the
  // start, and nothing ever passed one: a roll in flight outlived the component
  // and kept two requests running against an unmounted tree.
  const abortRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const recordHits = useCallback((funded) => {
    if (funded.length === 0) return;

    // Hits were stored as `"<key> has <n>Ξ"` segments joined with '; ' — one
    // string holding the only data in the app that has to outlive the tab, in
    // the least readable form available. They are records now, with the address
    // and the time they landed, which the old format threw away.
    const entries = funded.map((account) => ({
      address: account.address,
      privateKey: account.privateKey,
      balance: account.balance,
      at: new Date().toISOString(),
    }));

    writeJSON(STORAGE_KEYS.hits, [...readHits(), ...entries]);

    for (const account of funded) {
      console.warn(`${account.privateKey} has ${account.balance}Ξ`);
    }
    onHitRef.current?.(funded);
  }, []);

  const roll = useCallback(async () => {
    if (inFlight.current || haltedRef.current) return;
    inFlight.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

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
      fetchEthPrice({ signal: controller.signal }).then((price) => {
        if (mounted.current && price !== null) setEthPrice(price);
      });

      let completed = 0;
      const balances = await fetchBalances(
        batch.map((account) => account.address),
        {
          signal: controller.signal,
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
      setConsecutiveErrors(0);

      const total = readNumber(STORAGE_KEYS.keysChecked, 0) + batch.length;
      writeString(STORAGE_KEYS.keysChecked, String(total));
      setKeysChecked(total);

      const funded = scanned.filter(isFunded);
      if (funded.length > 0) {
        halt(true);
        recordHits(funded);
      }
    } catch (cause) {
      if (!mounted.current) return;
      // A roll we cancelled ourselves is not a failure to report.
      if (controller.signal.aborted) return;

      // Surfacing this is the whole point: a failed lookup used to leave the app
      // spinning on a disabled button with nothing on screen to explain why.
      setError(cause.message ?? 'Balance lookup failed');
      setConsecutiveErrors((count) => count + 1);
      // Key generation does not depend on Etherscan, so the batch stays on screen
      // with unknown balances. Dropping it here (back to an empty
      // `previousAccounts` on the first roll) left the app permanently blank
      // whenever the API key was missing or the request failed.
      setAccounts(batch);
      setPreviousAccounts(batch);
      setProgress(0);
    } finally {
      inFlight.current = false;
      if (abortRef.current === controller) abortRef.current = null;
      if (mounted.current) {
        setScanning(false);
        setTimeout(() => mounted.current && setProgress(0), 150);
      }
    }
  }, [accounts, recordHits, halt, testMode]);

  // Keeps a stable reference for the auto-mode interval, so it never captures a
  // stale `roll` and never needs to be torn down on every render.
  const rollRef = useRef(roll);
  useEffect(() => {
    rollRef.current = roll;
  });

  const rollNow = useCallback(() => rollRef.current(), []);

  // Acknowledging a find. Clearing `halted` on its own would leave the hit
  // banner on screen over a sheet nobody had asked to keep, so resuming is the
  // same gesture as rolling again: the batch that stopped the machine is
  // replaced by the one that follows it.
  const resumeAfterHit = useCallback(() => {
    halt(false);
    rollRef.current();
  }, [halt]);

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
    consecutiveErrors,
    resumeAfterHit,
    roll: rollNow,
  };
}
