import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AUTO_ROLL_INTERVAL_MS, AUTO_STOP_AFTER_ERRORS, KEYS_PER_ROLL } from './config';
import { isFunded, totalBalance } from './lib/accounts';
import { downloadAccounts } from './lib/download';
import { hasApiKey } from './lib/etherscan';
import { formatCount, formatEth, formatUsd } from './lib/format';
import { useTheme } from './lib/theme';

import { useContextMenu } from './hooks/useContextMenu';
import { useFavorites } from './hooks/useFavorites';
import { useScanner } from './hooks/useScanner';
import { useSnackbar } from './hooks/useSnackbar';

import AddressTable from './components/AddressTable';
import ApiKeyDialog from './components/ApiKeyDialog';
import BlockieSheet from './components/BlockieSheet';
import ContextMenu from './components/ContextMenu';
import Crt, { Ticks } from './components/Crt';
import FavoritesPanel from './components/FavoritesPanel';
import Header from './components/Header';
import LoadingBar from './components/LoadingBar';
import Snackbar from './components/Snackbar';
import { CONTROL, CONTROL_ON, Readout, Rule } from './components/controls';

export default function DApp() {
  const { theme, setTheme } = useTheme();

  const [view, setView] = useState('sheet');
  const [testMode, setTestMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [autosave, setAutosave] = useState(false);
  const [autosaveBuffer, setAutosaveBuffer] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  // Users bring their own Etherscan key. Prompt for it on the first visit, then
  // stay out of the way; key generation itself works without one.
  const [apiKeySet, setApiKeySet] = useState(hasApiKey);
  const [apiKeyOpen, setApiKeyOpen] = useState(() => !hasApiKey());

  const snackbar = useSnackbar();
  const { favorites, add: addFavorite, remove: removeFavorite } = useFavorites();

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
    halted,
    consecutiveErrors,
    resumeAfterHit,
    roll,
  } = useScanner({ testMode, onHit });

  const listMenu = useContextMenu('.img3');
  const favMenu = useContextMenu('.img2');

  // First roll on mount. This lived in a `useState(callback)` call, which happens
  // to run once but is not what useState means and fires during render.
  useEffect(() => {
    roll();
  }, [roll]);

  useEffect(() => {
    if (!autoMode) return undefined;
    const id = setInterval(roll, AUTO_ROLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoMode, roll]);

  // Auto mode already stops on a find; it should stop on a wall too. A wrong
  // key or a spent rate limit fails every roll, and the old loop kept firing
  // into it every two seconds with only a one-line error to show for it.
  useEffect(() => {
    if (!autoMode || consecutiveErrors < AUTO_STOP_AFTER_ERRORS) return;
    setAutoMode(false);
    snackbar.show('Auto stopped: no signal');
  }, [autoMode, consecutiveErrors, snackbar.show]);

  const anyPanelOpen = apiKeyOpen || favoritesOpen;

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
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anyPanelOpen, roll, setTheme, theme]);

  // While a roll is in flight the previous batch stays on screen, but only if
  // there is one. Keying this on `hasScanned` meant the very first roll (and
  // every roll after a failed balance lookup) rendered an empty sheet, since
  // `previousAccounts` is still `[]` at that point.
  const visible =
    scanning && previousAccounts.length > 0
      ? previousAccounts
      : accounts.length > 0
        ? accounts
        : previousAccounts;

  const totalEth = useMemo(() => totalBalance(visible), [visible]);
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

    if (!next && autosave && autosaveBuffer.length > 0) {
      downloadAccounts(autosaveBuffer, 'autosave-data');
      setAutosaveBuffer([]);
    }
  };

  const handleAddFavorite = (account) => {
    const added = addFavorite(account);
    snackbar.show(added ? 'Kept' : 'Already kept');
  };

  const exportFavorites = () => {
    if (favorites.length === 0) return;
    downloadAccounts(favorites, 'favorites');
  };

  const handleApiKeySaved = (saved) => {
    setApiKeySet(saved);
    setApiKeyOpen(false);
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
        favoriteCount={favorites.length}
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
                  <span className="glow-hot text-strike">
                    {formatEth(Number(account.balance))} Ξ
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
              <Readout label="holding" value={`${formatEth(totalEth)} Ξ`} hot={totalEth > 0} />
              <Readout label="usd" value={formatUsd(totalEth, ethPrice)} hot={totalEth > 0} />
              <span className="hidden text-2xs uppercase tracking-label text-land sm:inline">
                {KEYS_PER_ROLL} keys / roll
              </span>
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
                title={`Press A, rolls every ${AUTO_ROLL_INTERVAL_MS / 1000}s`}
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
                <div key={visible[0]?.address ?? 'empty'} className="arrive">
                  <BlockieSheet
                    accounts={visible}
                    dimMissed={halted}
                    hitClass="img3"
                    onSelect={listMenu.open}
                  />
                </div>
                <Ticks />
              </div>
            ) : (
              <div key={visible[0]?.address ?? 'empty'} className="arrive">
                <AddressTable accounts={visible} onSelect={listMenu.open} hitClass="img3" />
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── The bottom edge ──────────────────────────────────────────────
          The counters that outlive a batch, and the keys that drive it. The
          shortcuts live here permanently instead of behind a `window.alert`
          that hid itself after a thousand keys. */}
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
          <kbd className="hidden font-mono md:inline">t tube</kbd>
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
        onClose={() => setFavoritesOpen(false)}
      />

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </div>
  );
}
