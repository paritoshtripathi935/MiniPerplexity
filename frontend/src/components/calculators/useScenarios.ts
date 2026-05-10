import { useCallback, useEffect, useState } from 'react';
import type { CalcMode } from './ModeToggle';

const STORAGE_KEY = 'paidpilot.calc.scenarios.v1';

export interface Scenario {
  id: string;
  calcId: string;
  name: string;
  mode: CalcMode;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  createdAt: number;
}

type Store = Record<string, Scenario[]>;

function readStore(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / disabled — silent */
  }
}

export function useScenarios(calcId: string) {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => readStore()[calcId] ?? []);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setScenarios(readStore()[calcId] ?? []);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [calcId]);

  const persist = useCallback(
    (next: Scenario[]) => {
      const store = readStore();
      store[calcId] = next;
      writeStore(store);
      setScenarios(next);
    },
    [calcId],
  );

  const save = useCallback(
    (data: Omit<Scenario, 'id' | 'calcId' | 'createdAt'>) => {
      const scenario: Scenario = {
        ...data,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        calcId,
        createdAt: Date.now(),
      };
      persist([...scenarios, scenario]);
      return scenario;
    },
    [calcId, persist, scenarios],
  );

  const remove = useCallback(
    (id: string) => persist(scenarios.filter(s => s.id !== id)),
    [persist, scenarios],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      persist(scenarios.map(s => (s.id === id ? { ...s, name } : s))),
    [persist, scenarios],
  );

  const duplicate = useCallback(
    (id: string) => {
      const original = scenarios.find(s => s.id === id);
      if (!original) return;
      const copy: Scenario = {
        ...original,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `${original.name} (copy)`,
        createdAt: Date.now(),
      };
      persist([...scenarios, copy]);
    },
    [persist, scenarios],
  );

  return { scenarios, save, remove, rename, duplicate };
}
