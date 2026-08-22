import { useEffect, useState } from 'react';
import { getApiKey, saveApiKey, verifyApiKey } from '../lib/etherscan';
import { formatCount } from '../lib/format';
import { palettesFor } from '../lib/theme';
import Panel, { Group } from './Panel.jsx';
import { CONTROL, CONTROL_ON } from './controls.jsx';

/**
 * Everything the reader sets, in one place.
 *
 * This was the key dialog alone, with the screen and the status line living
 * under `stats` — which meant the panel that reports what the instrument has
 * done was also the panel that changed what it does. They are separate
 * questions and they are separate panels now: `cfg` is what to set, `stats` is
 * what happened.
 *
 * The key is deliberately never bundled: this is a static client-side app, so a
 * build-time key would be readable by anyone who loads the page and would burn
 * one account's rate limit for every visitor. Each key stays in the browser
 * that entered it.
 */
export default function ConfigPanel({
  open,
  onClose,
  onSaved,
  verbose,
  onVerbose,
  filter,
  filterError,
  screening,
  onScreening,
  importing,
  onImportFilter,
  onClearFilter,
  session,
  theme,
  onTheme,
  palette,
  onPalette,
}) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  // Re-seed from storage each time it opens, so cancelling really cancels.
  useEffect(() => {
    if (!open) return;
    setValue(getApiKey());
    setError(null);
    setChecking(false);
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError(null);

    const result = await verifyApiKey(value);
    setChecking(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    saveApiKey(value);
    onSaved(true);
  };

  const clear = () => {
    saveApiKey('');
    setValue('');
    onSaved(false);
  };

  return (
    <Panel title="Configuration" width={480} onClose={onClose}>
      {/* ── The medium ────────────────────────────────────────────────────
          Top of the panel: it is the setting that changes every other thing
          on screen, and the only one a reader is likely to come back to. */}
      <Group title="Medium">
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {['dark', 'light'].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={theme === option}
              onClick={() => onTheme(option)}
              className={theme === option ? CONTROL_ON : CONTROL}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Absent in light mode rather than disabled: a coating is a property
            of a tube, and paper has one ink. */}
        {palettesFor(theme).length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {palettesFor(theme).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={palette === option}
                  onClick={() => onPalette(option)}
                  className={palette === option ? CONTROL_ON : CONTROL}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="mt-2 max-w-[46ch] text-xs leading-5 text-dim">
              The phosphor the tube is coated with. <span className="text-text">white</span> is no
              coating at all.
            </p>
          </>
        )}
      </Group>

      {/* ── The key ───────────────────────────────────────────────────────
          What the panel opens itself for on a browser that has never been
          here, so it takes the focus even from below the medium. */}
      <form onSubmit={submit}>
        <Group title="Etherscan key">
          <input
            type="text"
            value={value}
            autoFocus
            spellCheck="false"
            autoComplete="off"
            placeholder="paste your key"
            aria-label="Etherscan API key"
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 w-full border border-line bg-void px-2 py-1.5 text-xs text-text outline-none transition-colors placeholder:text-land focus:border-land"
          />

          {/* The one line that has to be read, so it is the one line that is not
              in the dim grey everything else lives in. */}
          {error && <p className="glow mt-2 text-xs text-strike">{error}</p>}

          <div className="mt-3 flex items-center justify-between gap-3">
            <a
              href="https://etherscan.io/myapikey"
              target="_blank"
              rel="noopener noreferrer"
              className={CONTROL}
            >
              get one, free
            </a>

            <span className="flex items-center gap-3">
              <button type="button" onClick={clear} className={CONTROL}>
                [ clear ]
              </button>
              <button type="submit" disabled={checking} className={CONTROL}>
                {checking ? '[ checking ]' : '[ save ]'}
              </button>
            </span>
          </div>

          <p className="mt-3 max-w-[46ch] text-xs leading-5 text-dim">
            Balance lookups need a key of your own; the app ships without one. It is checked once
            against the API, then kept in this browser and sent to Etherscan and nowhere else.
            Generating keys does not need it: without one the sheet still rolls, it just cannot
            say what any address holds.
          </p>
        </Group>
      </form>

      {/* ── The screen ────────────────────────────────────────────────────
          What moves the ceiling. A quota buys ~23 lookups a second; the same
          browser generates and screens thousands. */}
      <Group title="Screen">
        {filter ? (
          <>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <button
                type="button"
                aria-pressed={screening}
                onClick={() => onScreening(!screening)}
                className={`flex items-baseline gap-2 ${screening ? CONTROL_ON : CONTROL}`}
              >
                <span>{screening ? '[x]' : '[ ]'}</span>
                <span>screen against the filter</span>
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <Row label="addresses" value={formatCount(filter.n)} />
              <Row label="size" value={`${Math.round(filter.byteLength / 1024)} kB`} />
              <Row
                label="false candidates"
                value={`1 in ${formatCount(Math.round(1 / filter.falsePositiveRate))}`}
              />
              <Row label="screened this session" value={formatCount(session.screened)} />
              <Row label="candidates raised" value={formatCount(session.candidates)} />
            </dl>
          </>
        ) : (
          <p className="max-w-[46ch] py-1 text-xs leading-5 text-dim">
            No filter, so every address is read against the chain and the daily allowance is what
            sets the rate. Load a list of addresses worth screening against and that stops being
            true.
          </p>
        )}

        {filterError && <p className="glow mt-2 text-xs text-strike">{filterError}</p>}

        {/* The list is the reader's, for the same reason the API key is: it is
            large, it goes stale, and which addresses are worth screening
            against is their call. A plain text file of addresses is enough —
            the filter is built here from whatever is in it. */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className={`${CONTROL} cursor-pointer`}>
            {importing ? '[ building ]' : '[ load addresses ]'}
            <input
              type="file"
              accept=".txt,.csv,.tsv,.bin,text/plain,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(event) => {
                const [file] = event.target.files ?? [];
                event.target.value = '';
                if (file) onImportFilter(file);
              }}
            />
          </label>
          {filter && (
            <button type="button" onClick={onClearFilter} className={CONTROL}>
              [ clear ]
            </button>
          )}
        </div>
      </Group>

      <Group title="Readout">
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <button
            type="button"
            aria-pressed={verbose}
            onClick={() => onVerbose(!verbose)}
            className={`flex items-baseline gap-2 ${verbose ? CONTROL_ON : CONTROL}`}
          >
            <span>{verbose ? '[x]' : '[ ]'}</span>
            <span>verbose status line</span>
          </button>
        </div>
        <p className="mt-2 max-w-[46ch] text-xs leading-5 text-dim">
          A line along the bottom edge naming everything as it happens: each roll, the keys as they
          are generated, every call and the chain it went to, every wait the rate limiter imposed,
          and every find.
        </p>
      </Group>
    </Panel>
  );
}

const Row = ({ label, value }) => (
  <>
    <dt className="text-dim">{label}</dt>
    <dd className="text-right text-text">{value}</dd>
  </>
);
