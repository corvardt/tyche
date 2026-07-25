import { useState } from 'react';

import { parseAccounts } from '../lib/download';
import BlockieSheet from './BlockieSheet.jsx';
import ContextMenu from './ContextMenu.jsx';
import Panel, { Group } from './Panel.jsx';
import { CONTROL } from './controls.jsx';

/**
 * Everything the reader chose to keep, as one sheet.
 *
 * This replaces the dock and the inventory, which were two panels showing the
 * same list at two sizes, positioned with fixed pixel offsets (`mx-[5.9rem]`,
 * `mt-[10.2em]`, `scale-[200%]`) that only lined up on the screen they were
 * written on. One panel, on the shared shell, at any width.
 */
export default function FavoritesPanel({
  open,
  favorites,
  menu,
  onSelect,
  onCloseMenu,
  onRemove,
  onNotify,
  onExport,
  onImport,
  onClose,
}) {
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');

  if (!open) return null;

  const submitImport = () => {
    const added = onImport(text);
    setText('');
    setImporting(false);
    return added;
  };

  return (
    <Panel
      title="Kept keys"
      width={560}
      onClose={onClose}
      footer={
        <footer className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-2xs uppercase tracking-label text-dim">
            {favorites.length} stored locally
          </span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => setImporting((on) => !on)} className={CONTROL}>
              [ import ]
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={favorites.length === 0}
              className={CONTROL}
            >
              [ export ]
            </button>
          </span>
        </footer>
      }
    >
      {menu && (
        <ContextMenu
          menu={menu}
          onClose={onCloseMenu}
          favoriteAction="remove"
          onFavorite={(account) => {
            onRemove(account);
            onNotify('Removed');
          }}
          onCopy={onNotify}
        />
      )}

      {/* Export has been here since the beginning with no way back in, so a
          kept sheet could leave a browser and never return to one. Anything
          holding 64-hex keys will do; the addresses are re-derived. */}
      {importing && (
        <Group title="Import">
          <textarea
            value={text}
            autoFocus
            spellCheck="false"
            rows={4}
            placeholder="paste an export, or any text with private keys in it"
            aria-label="Keys to import"
            onChange={(event) => setText(event.target.value)}
            className="mt-1 w-full resize-y border border-line bg-void px-2 py-1.5 font-mono text-xs text-text outline-none transition-colors placeholder:text-land focus:border-land"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            {/* Counted the same way the import counts, so the preview cannot
                promise four keys and then add three. */}
            <span className="text-2xs uppercase tracking-label text-land">
              {parseAccounts(text).accounts.length} keys found
            </span>
            <button type="button" onClick={submitImport} disabled={!text.trim()} className={CONTROL}>
              [ add ]
            </button>
          </div>
        </Group>
      )}

      <Group title="Sheet">
        {favorites.length === 0 ? (
          // An empty panel should say what fills it, not sit blank.
          <p className="py-2 text-xs text-dim">
            Nothing kept yet. Right-click any key on the sheet to keep it.
          </p>
        ) : (
          <div className="mt-1">
            <BlockieSheet accounts={favorites} fill hitClass="img2" onSelect={onSelect} />
          </div>
        )}
      </Group>
    </Panel>
  );
}
