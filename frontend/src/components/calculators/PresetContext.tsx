import React, { createContext, useCallback, useContext, useState } from 'react';
import type { PresetKey } from './presets';

interface PresetCtx {
  /** The most recently applied preset (informational — chip highlight). */
  preset: PresetKey | null;
  /** Tick increments each time `apply` is called, even with the same key. */
  applyTick: number;
  apply: (k: PresetKey) => void;
}

const Ctx = createContext<PresetCtx | null>(null);

export function PresetProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [applyTick, setApplyTick] = useState(0);

  const apply = useCallback((k: PresetKey) => {
    setPreset(k);
    setApplyTick(t => t + 1);
  }, []);

  return <Ctx.Provider value={{ preset, applyTick, apply }}>{children}</Ctx.Provider>;
}

export function usePreset(): PresetCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreset must be used within PresetProvider');
  return ctx;
}
