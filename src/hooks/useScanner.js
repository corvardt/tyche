import { useCallback, useEffect, useRef, useState } from 'react';
import { KEYS_PER_ROLL, STORAGE_KEYS } from '../config';
import { fundedChains, generateAccounts, isFunded } from '../lib/accounts';
import { chainName } from '../lib/chains';
import { callsPerRoll, fetchBalances } from '../lib/etherscan';
import { readHits } from '../lib/hits';
import { fetchEthPrice } from '../lib/price';
import { readNumber, writeJSON, writeString } from '../lib/storage';
import { emit } from '../lib/telemetry';

/**
 * Owns one roll: generate a batch, price it, look up balances, publish results.
 *
 * The previous version split this across `GenAdrs`, an effect keyed on the
 * generated list, and `CheckAdrs`, which made ordering implicit and let a failed
 * request leave `loading` stuck on forever. It is one linear async function now.
 */
export function useScanner({ testMode, onHit, chains, keysPerRoll = KEYS_PER_ROLL }) {
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

  // What this sitting has done, as opposed to `keysChecked`, which is every
  // key this browser has ever generated. The statistics panel needs both: one
  // gives a rate, the other a total.
  const [session, setSession] = useState(() => ({
    startedAt: Date.now(),
    keys: 0,
    rolls: 0,
    calls: 0,
  }));

  // Guards against overlapping rolls (auto mode ticking faster than the API) and
  // against setting state after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const onHitRef = useRef(onHit);

  /** Counts rolls for the telemetry line, so its traffic can be followed. */
  const rollNumber = useRef(0);

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
      balances: account.balances,
      at: new Date().toISOString(),
    }));

    writeJSON(STORAGE_KEYS.hits, [...readHits(), ...entries]);

    for (const account of funded) {
      const where = fundedChains(account)
        .map(({ chainId, amount }) => `${amount} on ${chainName(chainId)}`)
        .join(', ');
      console.warn(`${account.privateKey} has ${where}`);
      emit('found', `${account.address} · ${where}`);
    }
    onHitRef.current?.(funded);
  }, []);

  const roll = useCallback(async () => {
    if (inFlight.current) {
      emit('skip', 'roll already in flight');
      return;
    }
    if (haltedRef.current) {
      emit('skip', 'holding on a find');
      return;
    }
    inFlight.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const started = Date.now();
    setScanning(true);
    setError(null);
    setProgress(10);

    rollNumber.current += 1;
    emit(
      'roll',
      `#${rollNumber.current} · ${keysPerRoll} keys · ${(chains ?? []).length || 1} chain(s)${testMode ? ' · test' : ''}`,
    );

    const generatedAt = Date.now();
    const batch = generateAccounts({ testMode, count: keysPerRoll });
    emit('gen', `${batch.length} keypairs · ${Date.now() - generatedAt}ms`);

    // Keep the last completed set on screen while the new one resolves, rather
    // than flashing an empty grid.
    setPreviousAccounts((previous) => (accounts.length > 0 ? accounts : previous));
    setAccounts(batch);

    try {
      fetchEthPrice({ signal: controller.signal }).then((price) => {
        if (mounted.current && price !== null) setEthPrice(price);
      });

      const balances = await fetchBalances(
        batch.map((account) => account.address),
        {
          chains,
          signal: controller.signal,
          // Progress used to be computed from KEYS_PER_ROLL, which stopped
          // being the number of calls a roll makes the moment either the batch
          // size or the chain count could vary. The lookup reports its own.
          onBatch: ({ completed, total }) => {
            if (mounted.current) setProgress(Math.min(90, (completed / total) * 90));
          },
        },
      );

      if (!mounted.current) return;

      const scanned = batch.map((account) => ({
        ...account,
        balances: balances.get(account.address.toLowerCase()) ?? {},
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

      setSession((current) => ({
        ...current,
        keys: current.keys + batch.length,
        rolls: current.rolls + 1,
        calls: current.calls + callsPerRoll(batch.length, chains ?? []),
      }));

      const funded = scanned.filter(isFunded);
      emit(
        'done',
        `#${rollNumber.current} · ${batch.length} checked · ${funded.length} funded · ${Date.now() - started}ms · ${callsPerRoll(batch.length, chains ?? [])} calls`,
      );

      if (funded.length > 0) {
        halt(true);
        recordHits(funded);
      }
    } catch (cause) {
      if (!mounted.current) return;
      // A roll we cancelled ourselves is not a failure to report.
      if (controller.signal.aborted) {
        emit('abort', `#${rollNumber.current} cancelled`);
        return;
      }

      // Surfacing this is the whole point: a failed lookup used to leave the app
      // spinning on a disabled button with nothing on screen to explain why.
      setError(cause.message ?? 'Balance lookup failed');
      setConsecutiveErrors((count) => count + 1);
      emit('error', cause.message ?? 'Balance lookup failed');
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
  }, [accounts, chains, keysPerRoll, recordHits, halt, testMode]);

  // Keeps a stable reference for the auto-mode interval, so it never captures a
  // stale `roll` and never needs to be torn down on every render.
  const rollRef = useRef(roll);
  useEffect(() => {
    rollRef.current = roll;
  });

  const rollNow = useCallback(() => rollRef.current(), []);

  // Abandoning a roll rather than waiting it out. The controller was already
  // here for unmount; a reader stuck behind a slow lookup can use it too.
  const cancel = useCallback(() => {
    emit('stop', 'cancel requested');
    abortRef.current?.abort();
  }, []);

  // Acknowledging a find. Clearing `halted` on its own would leave the hit
  // banner on screen over a sheet nobody had asked to keep, so resuming is the
  // same gesture as rolling again: the batch that stopped the machine is
  // replaced by the one that follows it.
  const resumeAfterHit = useCallback(() => {
    emit('resume', 'hold cleared');
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
    session,
    halted,
    consecutiveErrors,
    cancel,
    resumeAfterHit,
    roll: rollNow,
  };
}
