import { useEffect, useState } from 'react';
import { getApiKey, saveApiKey, verifyApiKey } from '../lib/etherscan';
import Panel, { Group } from './Panel.jsx';
import { CONTROL } from './controls.jsx';

/**
 * Where the reader supplies their own Etherscan key.
 *
 * The key is deliberately never bundled: this is a static client-side app, so a
 * build-time key would be readable by anyone who loads the page and would burn
 * one account's rate limit for every visitor. Each key stays in the browser
 * that entered it.
 */
export default function ApiKeyDialog({ open, onClose, onSaved }) {
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
    <Panel title="Etherscan key" width={440} onClose={onClose}>
      <form onSubmit={submit}>
        <Group title="Key">
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
        </Group>

        <Group title="Why">
          <p className="max-w-[46ch] text-xs leading-5 text-dim">
            Balance lookups need a key of your own; the app ships without one. It is checked once
            against the API, then kept in this browser and sent to Etherscan and nowhere else.
            Generating keys does not need it: without one the sheet still rolls, it just cannot
            say what any address holds.
          </p>
        </Group>
      </form>
    </Panel>
  );
}
