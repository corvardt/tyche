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
  onClose,
}) {
  if (!open) return null;

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
          <button
            type="button"
            onClick={onExport}
            disabled={favorites.length === 0}
            className={CONTROL}
          >
            [ export ]
          </button>
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
