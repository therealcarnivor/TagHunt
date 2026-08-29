import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPlayer, getPlayer, renamePlayer, updatePlayerAvatar } from '../api.js';

const PlayerContext = createContext(null);

const ID_KEY = 'taghunt.playerId';
const NAME_KEY = 'taghunt.playerName';

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem(ID_KEY);
    const storedName = localStorage.getItem(NAME_KEY);
    if (!storedId || !storedName) {
      setLoading(false);
      return;
    }
    getPlayer(storedId)
      .then((p) => setPlayer(p))
      .catch(() => {
        localStorage.removeItem(ID_KEY);
        localStorage.removeItem(NAME_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const join = useCallback(async (name) => {
    const p = await createPlayer(name);
    localStorage.setItem(ID_KEY, p.id);
    localStorage.setItem(NAME_KEY, p.name);
    setPlayer(p);
    return p;
  }, []);

  const leave = useCallback(() => {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    setPlayer(null);
  }, []);

  const rename = useCallback(async (name) => {
    const p = await renamePlayer(player.id, name);
    localStorage.setItem(NAME_KEY, p.name);
    setPlayer(p);
    return p;
  }, [player]);

  const setAvatar = useCallback(async (avatar) => {
    const p = await updatePlayerAvatar(player.id, avatar);
    setPlayer(p);
    return p;
  }, [player]);

  return (
    <PlayerContext.Provider value={{ player, loading, join, leave, rename, setAvatar }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
