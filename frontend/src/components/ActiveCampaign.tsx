/**
 * Active campaign context — the global "current scope" for the signed-in app.
 *
 * Design (per Category H, decision 6 in the grill-me interview):
 *   - Source of truth: localStorage `paidpilot-active-campaign-id`.
 *   - Falls back to the user's default project's oldest live campaign if
 *     the stored id is missing, malformed, or points at an archived /
 *     since-deleted campaign.
 *   - The whole app scopes to this campaign. Switching campaigns swaps
 *     the entire app context — sidebar, home, plays, calculators.
 *
 * The provider does *not* fetch projects / campaigns itself — it consumes
 * the SWR caches (`useProjects`, `useCampaigns`) so any other consumer of
 * those keys (settings page, command palette, etc.) shares the same data
 * and invalidation path.
 *
 * Storage event listener keeps multiple tabs in sync: switching the
 * active campaign in one tab updates the other tabs without a refresh.
 */
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { CampaignSummary, ProjectSummary } from '../services/api';
import { useCampaigns, useProjects } from '../services/queries';

const STORAGE_KEY = 'paidpilot-active-campaign-id';

interface ActiveCampaignContextValue {
  /** All live projects for the user; empty while loading. */
  projects: ProjectSummary[];
  /** Campaigns within the active project; empty while loading. */
  campaigns: CampaignSummary[];
  activeProject: ProjectSummary | null;
  activeCampaign: CampaignSummary | null;
  /** True once we have a non-null activeCampaign (or have given up). */
  ready: boolean;
  /** Switch context. Persists to localStorage immediately. */
  setActiveCampaignId: (campaignId: string) => void;
}

const Ctx = createContext<ActiveCampaignContextValue | null>(null);

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage disabled — running in-memory only is fine.
  }
}

export function ActiveCampaignProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const enabled = !!isSignedIn;

  const { data: projectsData } = useProjects(getToken, enabled);
  const projects = useMemo(() => projectsData || [], [projectsData]);

  // We need to know which project owns the stored campaign so we can
  // fetch the right campaign list. Initially we don't — we discover it
  // by scanning each project's campaigns. To avoid a fan-out fetch, we
  // optimistically start with the first project's campaigns and switch
  // if the stored id lives elsewhere.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(() => readStored());

  // Once projects load, pick a default active project: stored id's owner
  // (when discoverable from the cache) or the first live project.
  useEffect(() => {
    if (!enabled) return;
    if (projects.length === 0) return;
    if (activeProjectId && projects.some(p => p.id === activeProjectId)) return;
    setActiveProjectId(projects[0].id);
  }, [enabled, projects, activeProjectId]);

  const { data: campaignsData } = useCampaigns(
    activeProjectId,
    getToken,
    enabled,
  );
  const campaigns = useMemo(() => campaignsData || [], [campaignsData]);

  // Resolve activeCampaign once we have campaigns. If the stored id
  // doesn't match anything in the current project's campaigns, we'd need
  // to search other projects — defer that to a future iteration (most
  // users have one project today). For now: stored id → first live
  // campaign in the active project.
  const activeCampaign = useMemo<CampaignSummary | null>(() => {
    if (campaigns.length === 0) return null;
    if (storedId) {
      const hit = campaigns.find(c => c.id === storedId && !c.archived_at);
      if (hit) return hit;
    }
    // Fall back to the oldest live campaign of the active project.
    const live = campaigns.find(c => !c.archived_at);
    return live || campaigns[0];
  }, [campaigns, storedId]);

  // Once we've resolved the active campaign, write it back to storage so
  // subsequent loads short-circuit. Also keeps storage in sync if the
  // stored id pointed at a stale campaign.
  useEffect(() => {
    if (activeCampaign && activeCampaign.id !== storedId) {
      writeStored(activeCampaign.id);
      setStoredId(activeCampaign.id);
    }
  }, [activeCampaign, storedId]);

  // Cross-tab sync: if another tab switches the active campaign, mirror
  // the change here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setStoredId(e.newValue || null);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setActiveCampaignId = useCallback(
    (campaignId: string) => {
      // Find which project owns this campaign — search the active project's
      // campaigns first, then nothing else (cross-project switching goes
      // through the popover, which also bumps activeProjectId).
      writeStored(campaignId);
      setStoredId(campaignId);
    },
    [],
  );

  const activeProject =
    projects.find(p => p.id === activeProjectId) || projects[0] || null;

  const ready =
    !enabled ||
    (projects.length > 0 && campaigns.length > 0 && activeCampaign !== null);

  // Internal helper for the switcher to swap project + campaign atomically.
  const value = useMemo<ActiveCampaignContextValue & { _swapProject: (projectId: string, campaignId: string) => void }>(
    () => ({
      projects,
      campaigns,
      activeProject,
      activeCampaign,
      ready,
      setActiveCampaignId,
      _swapProject: (projectId: string, campaignId: string) => {
        setActiveProjectId(projectId);
        writeStored(campaignId);
        setStoredId(campaignId);
      },
    }),
    [projects, campaigns, activeProject, activeCampaign, ready, setActiveCampaignId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveCampaign(): ActiveCampaignContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useActiveCampaign must be used inside <ActiveCampaignProvider>',
    );
  }
  return ctx;
}

/** Internal hook the CampaignSwitcher uses to swap project + campaign
 *  atomically (project_id and campaign_id state both move together). */
export function useSwapActiveContext() {
  const ctx = useContext(Ctx) as
    | (ActiveCampaignContextValue & {
        _swapProject: (projectId: string, campaignId: string) => void;
      })
    | null;
  if (!ctx) {
    throw new Error(
      'useSwapActiveContext must be used inside <ActiveCampaignProvider>',
    );
  }
  return ctx._swapProject;
}

/** Deterministic project color — stable hue per project_id, drawn from a
 *  small operator-tool-friendly palette. */
export function projectColor(projectId: string): {
  dot: string;
  ring: string;
  text: string;
} {
  const palette: Array<{ dot: string; ring: string; text: string }> = [
    { dot: 'bg-violet-400', ring: 'ring-violet-400/40', text: 'text-violet-300' },
    { dot: 'bg-sky-400', ring: 'ring-sky-400/40', text: 'text-sky-300' },
    { dot: 'bg-emerald-400', ring: 'ring-emerald-400/40', text: 'text-emerald-300' },
    { dot: 'bg-amber-400', ring: 'ring-amber-400/40', text: 'text-amber-300' },
    { dot: 'bg-rose-400', ring: 'ring-rose-400/40', text: 'text-rose-300' },
  ];
  // FNV-1a-ish folded hash, deterministic + cheap.
  let h = 0x811c9dc5;
  for (let i = 0; i < projectId.length; i++) {
    h ^= projectId.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return palette[h % palette.length];
}
