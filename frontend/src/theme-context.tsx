import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { storage } from './lib/storage';
import { lightColors, darkColors, applyPalette, Colors } from './theme';

type ThemeMode = 'light' | 'dark';

type ThemeCtx = {
  mode: ThemeMode;
  colors: Colors;
  isDark: boolean;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  const apply = useCallback((m: ThemeMode, persist: boolean) => {
    // Rebuild all registered stylesheets BEFORE triggering the re-render so
    // module-level `styles`/`colors` bindings are fresh when React repaints.
    applyPalette(m === 'dark' ? darkColors : lightColors);
    setModeState(m);
    if (persist) storage.set(STORAGE_KEY, m).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.get(STORAGE_KEY);
        if (saved === 'dark') apply('dark', false);
      } catch {}
    })();
  }, [apply]);

  const setMode = useCallback((m: ThemeMode) => apply(m, true), [apply]);
  const toggle = useCallback(
    () => apply(mode === 'dark' ? 'light' : 'dark', true),
    [apply, mode]
  );

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      isDark: mode === 'dark',
      toggle,
      setMode,
    }),
    [mode, toggle, setMode]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
