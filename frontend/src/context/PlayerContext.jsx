import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api.js';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api.getToken()) {
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then((d) => setPlayer(d.player))
      .catch(() => api.setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (username, password) => {
    const d = await api.login(username, password);
    api.setToken(d.token);
    setPlayer(d.player);
    return d.player;
  }, []);

  const signUp = useCallback(async (username, password, name) => {
    const d = await api.register(username, password, name);
    api.setToken(d.token);
    setPlayer(d.player);
    return d.player;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Signing out locally still matters even if the server call fails.
    }
    api.setToken(null);
    setPlayer(null);
  }, []);

  const rename = useCallback(async (name) => {
    const p = await api.updateMe({ name });
    setPlayer((prev) => ({ ...prev, ...p }));
    return p;
  }, []);

  const setAvatar = useCallback(async (avatar) => {
    const p = await api.updateMe({ avatar });
    setPlayer((prev) => ({ ...prev, ...p }));
    return p;
  }, []);

  return (
    <PlayerContext.Provider
      value={{ player, loading, isAdmin: Boolean(player?.isAdmin), signIn, signUp, signOut, rename, setAvatar }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
