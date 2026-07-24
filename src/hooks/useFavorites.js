import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from '../config';
import { normaliseAccount } from '../lib/accounts';
import { readJSON, writeJSON } from '../lib/storage';

const load = () =>
  (readJSON(STORAGE_KEYS.favorites, []) ?? []).map(normaliseAccount).filter(Boolean);

export function useFavorites() {
  const [favorites, setFavorites] = useState(load);

  const persist = useCallback((next) => {
    setFavorites(next);
    writeJSON(STORAGE_KEYS.favorites, next);
  }, []);

  const add = useCallback(
    (account) => {
      const entry = normaliseAccount(account);
      if (!entry) return false;

      // The old menu happily stored the same address a dozen times over.
      if (favorites.some((f) => f.address === entry.address)) return false;

      persist([...favorites, entry]);
      return true;
    },
    [favorites, persist],
  );

  const remove = useCallback(
    (account) => {
      // Previously `delete FavTable[index]` mutated state in place and left a
      // hole in the array, which is why a null-filter had to follow it.
      persist(favorites.filter((f) => f.address !== account.address));
    },
    [favorites, persist],
  );

  return { favorites, add, remove };
}
