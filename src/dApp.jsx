import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AUTO_STOP_AFTER_ERRORS, KEYS_PER_ROLL_OPTIONS } from './config';
import { fundedChains, isFunded, totalBalance } from './lib/accounts';
import { chainById, DEFAULT_CHAIN_ID } from './lib/chains';
import { downloadAccounts, parseAccounts } from './lib/download';
import { hasApiKey } from './lib/etherscan';
import { formatCount, formatEth, formatUsd } from './lib/format';
import { emit } from './lib/telemetry';
import { useTheme } from './lib/theme';

import { useContextMenu } from './hooks/useContextMenu';
import { useFavorites } from './hooks/useFavorites';
import { useFilter } from './hooks/useFilter';
import { useScanner } from './hooks/useScanner';
import { useSettings } from './hooks/useSettings';
import { useSnackbar } from './hooks/useSnackbar';

import AddressTable from './components/AddressTable';
import ApiKeyDialog from './components/ApiKeyDialog';
import BlockieSheet from './components/BlockieSheet';
import ChainPanel from './components/ChainPanel';
import ContextMenu from './components/ContextMenu';
import Crt, { Ticks } from './components/Crt';
import FavoritesPanel from './components/FavoritesPanel';
import Header from './components/Header';
import LoadingBar from './components/LoadingBar';
import Snackbar from './components/Snackbar';
import StatsPanel from './components/StatsPanel';
import StatusLine from './components/StatusLine';
import { CONTROL, CONTROL_ON, Readout, Rule } from './components/controls';

export default function DApp() {
  const { theme, setTheme } = useTheme();

  const [view, setView] = useState('sheet');
  const [testMode, setTestMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [autosave, setAutosave] = useState(false);
  const [autosaveBuffer, setAutosaveBuffer] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [chainsOpen, setChainsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  // Users bring their own Etherscan key. Prompt for it on the first visit, then
  // stay out of the way; key generation itself works without one.
  const [apiKeySet, setApiKeySet] = useState(hasApiKey);
  const [apiKeyOpen, setApiKeyOpen] = useState(() => !hasApiKey());

  const snackbar = useSnackbar();
  const {
    filter,
    error: filterError,
    loading: filterLoading,
    importing: filterImporting,
    importFile: importFilter,
    clear: clearFilter,
  } = useFilter();
  const { chains, toggleChain, keysPerRoll, setKeysPerRoll, verbose, setVerbose, screening, setScreening } =
    useSettings();
  const {
    favorites,
    add: addFavorite,
    addMany: addFavorites,
    remove: removeFavorite,
  } = useFavorites();

  const onHit = useCallback(() => {
    // A funded address is the whole point of the app, so rolling stops and it cannot
    // be scrolled past. Previously auto mode kept running straight over it.
    setAutoMode(false);
    snackbar.show('Funded address found');
  }, [snackbar]);

  const {
    accounts,
    previousAccounts,
    scanning,
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
    roll,
  } = useScanner({ testMode, onHit, chains, keysPerRoll, filter: screening ? filter : null });

  const listMenu = useContextMenu('.img3');
  const favMenu = useContextMenu('.img2');

  // First roll on mount, but not before the filter has had its chance to load.
  // Rolling immediately raced it: the opening batch went to the API even when a
  // filter was about to make that unnecessary, which on a browser with no key
  // meant the app greeted everyone with an error it was about to stop needing.
  useEffect(() => {
    if (filterLoading) return;
    roll();
  }, [filterLoading, roll]);

  // Auto rolls again the moment the last one is done, rather than on a timer.
  // The two-second interval made sense when a roll cost two API calls and
  // 300ms of key generation; screening removes the API from an ordinary roll
  // entirely, and the pause became the slowest thing left in the loop. What
  // paces it now is whatever is actually the bottleneck — the rate limiter
  // when the chain is being read, key generation when it is not.
  //
  // The timeout is zero but not pointless: it breaks the synchronous chain so
  // a roll that returns immediately cannot recurse into the next one.
  useEffect(() => {
    if (!autoMode || scanning || halted) return undefined;
    const id = setTimeout(roll, 0);
    return () => clearTimeout(id);
  }, [autoMode, scanning, halted, roll]);

  // Auto mode already stops on a find; it should stop on a wall too. A wrong
  // key or a spent rate limit fails every roll, and the old loop kept firing
  // into it every two seconds with only a one-line error to show for it.
  useEffect(() => {
    if (!autoMode || consecutiveErrors < AUTO_STOP_AFTER_ERRORS) return;
    setAutoMode(false);
    emit('auto', `off · ${AUTO_STOP_AFTER_ERRORS} failed rolls`);
    snackbar.show('Auto stopped: no signal');
  }, [autoMode, consecutiveErrors, snackbar.show]);

  const anyPanelOpen = apiKeyOpen || favoritesOpen || chainsOpen || statsOpen;

  // Single keys, no modifiers: the whole instrument is reachable without ever
  // finding a control. The old handler was registered without a cleanup (so a
  // remount stacked duplicates), used deprecated `keyCode`, fired a synthetic
  // DOM click on a button id, and re-read an unrelated localStorage value on
  // every single keypress.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Bare-letter shortcuts must not fire while the reader is typing their
      // API key: 'x' would roll the sheet on every keystroke.
      if (event.target?.closest?.('input, textarea, [contenteditable]')) return;

      const key = event.key.toLowerCase();
      if (key === 't') setTheme(theme === 'dark' ? 'light' : 'dark');
      if (anyPanelOpen) return;

      if (key === 'x') roll();
      if (key === 'a') setAutoMode((on) => !on);
      if (key === 'v') setView((current) => (current === 'sheet' ? 'list' : 'sheet'));
      if (key === 'k') setApiKeyOpen(true);
      if (key === 'f') setFavoritesOpen(true);
      if (key === 'c') setChainsOpen(true);
      if (key === 's') setStatsOpen(true);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anyPanelOpen, roll, setTheme, theme]);

  // The batch being rolled is what is on screen, developing as it is read. It
  // used to be the *previous* batch until the new one had fully resolved, on
  // the reasoning that an unread batch had nothing to show; it has its
  // identicons from the moment it is generated, so it does.
  // While a roll is running the sheet is the batch being made, however little
  // of it exists yet; the empty remainder is drawn as slots. Only at rest does
  // the previous batch stand in, for the moment before the first roll lands.
  const visible = scanning || accounts.length > 0 ? accounts : previousAccounts;
  const slots = scanning ? keysPerRoll : 0;

  // Sums are per-chain by necessity, so the readout names one: mainnet when it
  // is being read, otherwise whichever chain is. Adding a Polygon balance to an
  // Ethereum one would produce a number denominated in nothing.
  const displayChain = chains.includes(DEFAULT_CHAIN_ID) ? DEFAULT_CHAIN_ID : chains[0];
  const displaySymbol = chainById(displayChain)?.symbol ?? '';

  const totalHeld = useMemo(
    () => totalBalance(visible, displayChain),
    [visible, displayChain],
  );
  const funded = useMemo(() => visible.filter(isFunded), [visible]);

  // The hit renders at the top of the page, which is no use if the reader is
  // scrolled down a forty-row list when it lands.
  const main = useRef(null);
  useEffect(() => {
    if (funded.length === 0) return;
    main.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [funded.length]);

  // Accumulate finished batches while auto mode + autosave are both on. The old
  // version pushed a stale copy of the *previous* batch from inside the fetch
  // callback, so the saved file was always one roll behind and missed the last.
  useEffect(() => {
    if (!autoMode || !autosave || scanning || accounts.length === 0) return;
    setAutosaveBuffer((buffer) =>
      buffer.length > 0 && buffer.at(-1)?.address === accounts.at(-1)?.address
        ? buffer
        : [...buffer, ...accounts],
    );
  }, [accounts, autoMode, autosave, scanning]);

  const toggleAutoMode = () => {
    const next = !autoMode;
    setAutoMode(next);
    emit('auto', next ? 'on · continuous' : 'off');

    if (!next && autosave && autosaveBuffer.length > 0) {
      downloadAccounts(autosaveBuffer, 'autosave-data');
      setAutosaveBuffer([]);
    }
  };

  const handleAddFavorite = (account) => {
    const added = addFavorite(account);
    emit('keep', `${account.address} · ${added ? 'kept' : 'already kept'}`);
    snackbar.show(added ? 'Kept' : 'Already kept');
  };

  const exportFavorites = () => {
    if (favorites.length === 0) return;
    downloadAccounts(favorites, 'favorites');
  };

  const importFavorites = (text) => {
    const { accounts: parsed } = parseAccounts(text);
    if (parsed.length === 0) {
      snackbar.show('No keys found');
      return 0;
    }

    const added = addFavorites(parsed);
    emit('import', `${parsed.length} keys read · ${added} new`);
    snackbar.show(
      added === 0
        ? 'All already kept'
        : added === parsed.length
          ? `Kept ${added}`
          : `Kept ${added} of ${parsed.length}`,
    );
    return added;
  };

  const handleApiKeySaved = (saved) => {
    setApiKeySet(saved);
    setApiKeyOpen(false);
    emit('key', saved ? 'saved and verified' : 'cleared');
    snackbar.show(saved ? 'Key saved' : 'Key cleared');
    // Retry the batch that's already on screen with unknown balances.
    if (saved) roll();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Crt />
      <LoadingBar percent={progress} />

      <Header
        scanning={scanning}
        halted={halted}
        error={error}
        theme={theme}
        onTheme={setTheme}
        onKeys={() => setApiKeyOpen(true)}
        onFavorites={() => setFavoritesOpen(true)}
        onChains={() => setChainsOpen(true)}
        onStats={() => setStatsOpen(true)}
        favoriteCount={favorites.length}
        chainCount={chains.length}
      />

      <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col px-3 py-4 sm:px-4">
          {/* ── The hit ────────────────────────────────────────────────────
              The one thing this instrument exists to catch, so it takes the
              top of the page the moment there is one: above the readout,
              above the sheet it came from, spelled out in full so it can be
              read off the screen and acted on. */}
          {funded.length > 0 && (
            <div className="settle mb-4 border border-strike bg-panel px-3 py-2 shadow-[0_0_16px_var(--bloom-hot)]">
              <div className="flex items-center gap-2.5 pb-1">
                <span className="glow-hot shrink-0 text-2xs uppercase tracking-mark text-strike">
                  funded
                </span>
                <span className="h-px flex-1 bg-line" />
                <span className="shrink-0 text-2xs uppercase tracking-label text-dim">
                  rolling stopped
                </span>
                {/* The way back out. Without this the instrument stopped for
                    good on a find and only a reload restarted it, which made
                    test mode a one-shot: it plants a funded address in every
                    batch, so the first roll halted the machine permanently.
                    Deliberately a click and not a key: `x` is muscle memory by
                    the thousandth roll, and a real find is the one thing that
                    must not be dismissed by reflex. */}
                <button
                  type="button"
                  onClick={resumeAfterHit}
                  title="Acknowledge and roll again"
                  className={CONTROL}
                >
                  [ resume ]
                </button>
              </div>
              {funded.map((account) => (
                <p key={account.address} className="break-all py-0.5 text-xs text-dim">
                  <span className="glow text-strike">{account.privateKey}</span>
                  <span> // </span>
                  {/* Every chain it landed on, each in its own unit. */}
                  <span className="glow-hot text-strike">
                    {fundedChains(account)
                      .map(
                        ({ chainId, amount }) =>
                          `${formatEth(amount)} ${chainById(chainId)?.symbol ?? ''}`,
                      )
                      .join(' + ')}
                  </span>
                </p>
              ))}
            </div>
          )}

          {/* ── The readout ────────────────────────────────────────────────
              What the batch on screen is worth, which for forty random keys is
              the joke and the point at once. */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <Readout
                label="holding"
                value={`${formatEth(totalHeld)} ${displaySymbol}`}
                hot={totalHeld > 0}
              />
              {/* Only meaningful where the native unit is ether. */}
              {displaySymbol === 'Ξ' && (
                <Readout
                  label="usd"
                  value={formatUsd(totalHeld, ethPrice)}
                  hot={totalHeld > 0}
                />
              )}
              <button
                type="button"
                onClick={() => setChainsOpen(true)}
                title="Press C"
                className={`hidden ${CONTROL} sm:inline`}
              >
                {chains.length === 1 ? chainById(chains[0])?.name : `${chains.length} chains`}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={roll}
                disabled={scanning || halted}
                title="Press X"
                className={scanning ? CONTROL_ON : CONTROL}
              >
                [ {scanning ? 'rolling' : 'roll'} ]
              </button>
              <button
                type="button"
                onClick={toggleAutoMode}
                disabled={halted}
                title="Press A, rolls continuously until stopped or something is found"
                className={autoMode ? CONTROL_ON : CONTROL}
              >
                [ auto ]
              </button>
              <button
                type="button"
                onClick={() => setAutosave((on) => !on)}
                disabled={autoMode}
                title="Save every batch auto mode produces, written when you stop"
                className={autosave ? CONTROL_ON : CONTROL}
              >
                [ rec ]
              </button>
              <button
                type="button"
                onClick={() => downloadAccounts(visible, 'list')}
                disabled={visible.length === 0}
                className={CONTROL}
              >
                [ save ]
              </button>
              {/* The AbortController was already there for unmount; this is a
                  reader stuck behind a slow lookup reaching the same lever. */}
              <button
                type="button"
                onClick={cancel}
                disabled={!scanning}
                title="Abandon the roll in flight"
                className={CONTROL}
              >
                [ stop ]
              </button>

              <Rule />

              {/* Every size is a whole number of API calls per chain. */}
              <span className="hidden items-center gap-2 md:flex">
                {KEYS_PER_ROLL_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={keysPerRoll === option}
                    onClick={() => setKeysPerRoll(option)}
                    title={`${option} keys per roll`}
                    className={keysPerRoll === option ? CONTROL_ON : CONTROL}
                  >
                    {option}
                  </button>
                ))}
              </span>

              <Rule />

              <button
                type="button"
                onClick={() => setTestMode((on) => !on)}
                title="Swap a known funded address into the batch"
                className={testMode ? CONTROL_ON : CONTROL}
              >
                [ test ]
              </button>

              <Rule />

              <span className="flex items-center gap-3">
                {['sheet', 'list'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={view === option ? CONTROL_ON : CONTROL}
                  >
                    {option}
                  </button>
                ))}
              </span>
            </div>
          </div>

          {/* Two states worth interrupting for, on one line each. */}
          {error && (
            <button
              type="button"
              onClick={() => setApiKeyOpen(true)}
              className="mt-3 flex items-baseline gap-2 border border-line bg-panel px-3 py-2 text-left"
            >
              <span className="text-2xs uppercase tracking-label text-dim">no signal</span>
              <span className="text-xs text-text">{error}</span>
              {!apiKeySet && (
                <span className="text-2xs uppercase tracking-label text-land">[ set key ]</span>
              )}
            </button>
          )}

          {testMode && !error && (
            <p className="mt-3 text-2xs uppercase tracking-label text-land">
              test mode // one funded address is planted in every batch
            </p>
          )}

          {/* ── The sheet ──────────────────────────────────────────────── */}
          <div className="relative mt-4">
            {listMenu.menu && (
              <ContextMenu
                menu={listMenu.menu}
                onClose={listMenu.close}
                favoriteAction="add"
                onFavorite={handleAddFavorite}
                onCopy={snackbar.show}
              />
            )}

            {view === 'sheet' ? (
              <div className="relative p-2">
                {/* Not keyed on the batch any more: that remounted the whole
                    sheet and replayed its fade-in every roll, which at this
                    cadence is a strobe. The cells handle their own arrival. */}
                <div className="arrive">
                  <BlockieSheet
                    accounts={visible}
                    resolved={resolved}
                    slots={slots}
                    dimMissed={halted}
                    hitClass="img3"
                    onSelect={listMenu.open}
                  />
                </div>
                <Ticks />
              </div>
            ) : (
              <div className="arrive">
                <AddressTable
                accounts={visible}
                resolved={resolved}
                onSelect={listMenu.open}
                hitClass="img3"
              />
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── The bottom edge ──────────────────────────────────────────────
          The counters that outlive a batch, and the keys that drive it. The
          shortcuts live here permanently instead of behind a `window.alert`
          that hid itself after a thousand keys. */}
      {verbose && <StatusLine />}

      <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-line px-3 sm:px-4">
        <div className="flex items-baseline gap-x-5 gap-y-1 overflow-hidden">
          <Readout label="checked" value={formatCount(keysChecked)} />
          <Readout label="last" value={`${elapsedMs}ms`} className="hidden sm:flex" />
          <span className="hidden text-2xs uppercase tracking-label text-land md:inline">
            {apiKeySet ? 'chain linked' : 'no chain link'}
          </span>
        </div>

        <div className="flex shrink-0 gap-3 text-2xs uppercase tracking-label text-land">
          <kbd className="font-mono">x roll</kbd>
          <kbd className="hidden font-mono sm:inline">a auto</kbd>
          <kbd className="hidden font-mono sm:inline">v view</kbd>
          <kbd className="hidden font-mono md:inline">s stats</kbd>
          <kbd className="hidden font-mono md:inline">c chains</kbd>
          <kbd className="hidden font-mono lg:inline">t tube</kbd>
        </div>
      </footer>

      <ApiKeyDialog
        open={apiKeyOpen}
        onClose={() => setApiKeyOpen(false)}
        onSaved={handleApiKeySaved}
      />

      <FavoritesPanel
        open={favoritesOpen}
        favorites={favorites}
        menu={favMenu.menu}
        onSelect={favMenu.open}
        onCloseMenu={favMenu.close}
        onRemove={removeFavorite}
        onNotify={snackbar.show}
        onExport={exportFavorites}
        onImport={importFavorites}
        onClose={() => setFavoritesOpen(false)}
      />

      <ChainPanel
        open={chainsOpen}
        chains={chains}
        keysPerRoll={keysPerRoll}
        onToggle={toggleChain}
        onClose={() => setChainsOpen(false)}
      />

      <StatsPanel
        open={statsOpen}
        keysChecked={keysChecked}
        session={session}
        chains={chains}
        keysPerRoll={keysPerRoll}
        verbose={verbose}
        onVerbose={setVerbose}
        filter={filter}
        filterError={filterError}
        screening={screening}
        onScreening={setScreening}
        importing={filterImporting}
        onImportFilter={importFilter}
        onClearFilter={clearFilter}
        onClose={() => setStatsOpen(false)}
      />

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </div>
  );
}
