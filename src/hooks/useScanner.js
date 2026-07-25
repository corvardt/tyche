import { useCallback, useEffect, useRef, useState } from 'react';
import { KEYS_PER_ROLL, STORAGE_KEYS } from '../config';
import { fundedChains, generateAccountsProgressively, isFunded } from '../lib/accounts';
import { mightContain } from '../lib/bloom';
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
export function useScanner({
  testMode,
  onHit,
  chains,
  keysPerRoll = KEYS_PER_ROLL,
  filter = null,
}) {
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
  // How many of the batch on screen have actually been read. Everything past
  // it is latent: the address is known the moment it is generated, so the
  // identicon is there from the start — it is the balance that has not arrived.
  const [resolved, setResolved] = useState(0);
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
    screened: 0,
    candidates: 0,
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

    setResolved(0);

    // The sheet empties to the size of the coming batch and fills as the keys
    // are made. It used to hold the previous batch in place until the new one
    // had fully resolved, on the reasoning that an unread batch had nothing to
    // show; it has an identicon from the moment each key exists.
    setPreviousAccounts((previous) => (accounts.length > 0 ? accounts : previous));
    setAccounts([]);

    // Generation is inside the try: it yields to the browser now, so it is a
    // place a roll can fail, and a throw out here would leave `inFlight` set
    // and the instrument unable to roll again.
    let batch = [];

    try {
      const generatedAt = Date.now();
      batch = await generateAccountsProgressively({
        testMode,
        count: keysPerRoll,
        onChunk: (made) => {
          if (mounted.current) setAccounts(made);
        },
      });

      if (!mounted.current) return;
      emit('gen', `${batch.length} keypairs · ${Date.now() - generatedAt}ms`);

      fetchEthPrice({ signal: controller.signal }).then((price) => {
        if (mounted.current && price !== null) setEthPrice(price);
      });

      // With a filter loaded, the chain is asked about candidates only. Almost
      // every roll has none, and costs nothing: the quota stops being what
      // limits how many keys a day can be checked, and generation starts being
      // it instead — about two orders of magnitude further out.
      let toRead = batch;
      if (filter) {
        const screenedAt = Date.now();
        toRead = batch.filter((account) => mightContain(filter, account.address));
        emit(
          'screen',
          `${batch.length} keys · ${toRead.length} candidate${toRead.length === 1 ? '' : 's'} · ${Date.now() - screenedAt}ms`,
        );
      }

      // A screened roll with nothing to confirm needs no API at all — not even
      // a key. That is the ordinary outcome, and it is why a filter lets the
      // instrument run without one.
      const balances =
        toRead.length === 0
          ? new Map()
          : await fetchBalances(
              toRead.map((account) => account.address),
              {
                chains,
                signal: controller.signal,
                // Progress used to be computed from KEYS_PER_ROLL, which
                // stopped being the number of calls a roll makes the moment
                // either the batch size or the chain count could vary. The
                // lookup reports its own.
                onBatch: ({ completed, total, resolved: read }) => {
                  if (!mounted.current) return;
                  setProgress(Math.min(90, (completed / total) * 90));
                  // Screened rolls read only the candidates, so the count that
                  // comes back is of those, not of the sheet.
                  if (!filter) setResolved(read);
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
      setResolved(batch.length);
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
        calls: current.calls + (filter ? callsPerRoll(toRead.length, chains ?? []) : callsPerRoll(batch.length, chains ?? [])),
        screened: current.screened + (filter ? batch.length : 0),
        candidates: current.candidates + (filter ? toRead.length : 0),
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
  }, [accounts, chains, filter, keysPerRoll, recordHits, halt, testMode]);

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
    resolved,
    session,
    halted,
    consecutiveErrors,
    cancel,
    resumeAfterHit,
    roll: rollNow,
  };
}
