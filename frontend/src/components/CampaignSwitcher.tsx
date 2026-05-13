/**
 * Top-nav campaign switcher (Category H / H4).
 *
 * Pill in the header showing `<project-color-dot> <project> · <campaign> ▾`.
 * Click opens a popover with all live projects + their campaigns; selecting
 * a campaign updates the global active context (localStorage-backed) and
 * the whole app rescopes.
 *
 * Layered on top of the SWR-cached projects + campaigns hooks via
 * <ActiveCampaignProvider>, so any other consumer (settings page, command
 * palette) shares the same data + invalidation path.
 *
 * v1 scope: select existing project + campaign. Create-project / create-
 * campaign footer buttons trigger inline mini-forms in the popover. Once
 * the Settings projects page (H5) lands, the footer buttons will deep-link
 * there instead of inlining the form.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import {
  projectColor,
  useActiveCampaign,
  useSwapActiveContext,
} from './ActiveCampaign';
import {
  createCampaign,
  createProject,
  listCampaigns,
  type CampaignSummary,
  type ProjectSummary,
} from '../services/api';
import { QK, useCacheActions } from '../services/queries';
import { useSWRConfig } from 'swr';

export function CampaignSwitcher() {
  const { activeProject, activeCampaign, projects } = useActiveCampaign();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Don't render anything until we have at least one project to display —
  // avoids a flash of empty pill on first auth.
  if (!activeProject || projects.length === 0) {
    return (
      <div className="hidden md:flex items-center h-8 px-3 rounded-xl border border-border/60 bg-surface-raised/40 text-fg-subtle text-body-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle/40 mr-2" />
        loading…
      </div>
    );
  }

  const color = projectColor(activeProject.id);
  const campaignLabel = activeCampaign?.name || '—';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center h-8 pl-2.5 pr-2 rounded-xl border text-body-sm transition-colors duration-150',
          'min-w-0 max-w-[260px]',
          open
            ? 'border-brand/40 bg-brand/5'
            : 'border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60',
        )}
        title={`${activeProject.name} · ${campaignLabel}`}
      >
        <span className={clsx('w-1.5 h-1.5 rounded-full mr-2 shrink-0', color.dot)} />
        <span className="text-fg font-medium truncate">{activeProject.name}</span>
        <span className="text-fg-subtle mx-1.5">·</span>
        <span className="text-fg-muted truncate">{campaignLabel}</span>
        <ChevronDown
          className={clsx(
            'w-3.5 h-3.5 ml-1.5 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Switch project or campaign"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[360px] rounded-xl border border-border/60 bg-surface-raised/90 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          <SwitcherBody onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Popover body                                                          */
/* -------------------------------------------------------------------- */

function SwitcherBody({ onClose }: { onClose: () => void }) {
  const { projects, activeProject, activeCampaign, campaigns } = useActiveCampaign();
  // Which project is expanded in the popover (defaults to active).
  const [expandedId, setExpandedId] = useState<string>(
    activeProject?.id || projects[0]?.id || '',
  );

  return (
    <div className="py-1.5">
      <ul className="max-h-[420px] overflow-y-auto py-1">
        {projects.map(p => (
          <ProjectRow
            key={p.id}
            project={p}
            expanded={p.id === expandedId}
            isActiveProject={activeProject?.id === p.id}
            activeCampaignId={activeCampaign?.id || null}
            campaignsForActive={p.id === activeProject?.id ? campaigns : null}
            onToggle={() => setExpandedId(prev => (prev === p.id ? '' : p.id))}
            onPick={onClose}
          />
        ))}
      </ul>
      <SwitcherFooter expandedProjectId={expandedId} onClose={onClose} />
    </div>
  );
}

function ProjectRow({
  project,
  expanded,
  isActiveProject,
  activeCampaignId,
  campaignsForActive,
  onToggle,
  onPick,
}: {
  project: ProjectSummary;
  expanded: boolean;
  isActiveProject: boolean;
  activeCampaignId: string | null;
  /** Campaigns from cache when this IS the active project — avoids
   *  a duplicate fetch. Null for other projects (we fetch lazily). */
  campaignsForActive: CampaignSummary[] | null;
  onToggle: () => void;
  onPick: () => void;
}) {
  const color = projectColor(project.id);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-sunken/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
        )}
        <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', color.dot)} />
        <span className="text-fg font-medium truncate flex-1">{project.name}</span>
        {isActiveProject && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand/80">
            current
          </span>
        )}
      </button>

      {expanded && (
        <CampaignList
          project={project}
          activeCampaignId={activeCampaignId}
          preloaded={campaignsForActive}
          onPick={onPick}
        />
      )}
    </li>
  );
}

function CampaignList({
  project,
  activeCampaignId,
  preloaded,
  onPick,
}: {
  project: ProjectSummary;
  activeCampaignId: string | null;
  preloaded: CampaignSummary[] | null;
  onPick: () => void;
}) {
  const { getToken } = useAuth();
  const swap = useSwapActiveContext();
  // Lazy-fetch campaigns the first time this project is expanded (only if
  // we don't already have them via the active-project pass-through).
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(preloaded || []);
  const [loading, setLoading] = useState<boolean>(preloaded === null);

  useEffect(() => {
    if (preloaded) {
      setCampaigns(preloaded);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listCampaigns(project.id, getToken)
      .then(rows => {
        if (!cancelled) setCampaigns(rows);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, preloaded, getToken]);

  const live = campaigns.filter(c => !c.archived_at);

  if (loading) {
    return (
      <div className="pl-9 pr-3 py-2 text-body-sm text-fg-subtle">loading campaigns…</div>
    );
  }

  if (live.length === 0) {
    return (
      <div className="pl-9 pr-3 py-2 text-body-sm text-fg-subtle italic">
        no live campaigns
      </div>
    );
  }

  return (
    <ul className="pb-1">
      {live.map(c => {
        const isActive = c.id === activeCampaignId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                swap(project.id, c.id);
                onPick();
              }}
              className={clsx(
                'w-full flex items-center justify-between gap-3 pl-9 pr-3 py-2 text-left hover:bg-surface-sunken/40 transition-colors',
                'border-l-2',
                isActive ? 'border-brand bg-brand/5' : 'border-transparent',
              )}
            >
              <div className="min-w-0">
                <div className="text-fg text-body-base truncate">{c.name}</div>
                {c.objective && (
                  <div className="text-fg-subtle text-body-sm truncate mt-0.5">
                    {c.objective}
                  </div>
                )}
              </div>
              {c.starts_on && c.ends_on && (
                <span className="font-mono text-[10px] text-fg-subtle shrink-0">
                  {formatDateRange(c.starts_on, c.ends_on)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function formatDateRange(startISO: string, endISO: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(startISO)} – ${fmt(endISO)}`.toLowerCase();
}

/* -------------------------------------------------------------------- */
/* Footer: inline create-project / create-campaign forms                 */
/* -------------------------------------------------------------------- */

type FooterMode = 'idle' | 'new-project' | 'new-campaign';

function SwitcherFooter({
  expandedProjectId,
  onClose,
}: {
  expandedProjectId: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<FooterMode>('idle');

  return (
    <div className="border-t border-border/60 px-2 py-2">
      {mode === 'idle' && (
        <div className="flex items-stretch gap-1">
          <button
            type="button"
            onClick={() => setMode('new-project')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            new project
          </button>
          <div className="w-px self-stretch bg-border/60" />
          <button
            type="button"
            onClick={() => setMode('new-campaign')}
            disabled={!expandedProjectId}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus className="w-3.5 h-3.5" />
            new campaign
          </button>
        </div>
      )}
      {mode === 'new-project' && (
        <NewProjectForm onDone={onClose} onCancel={() => setMode('idle')} />
      )}
      {mode === 'new-campaign' && (
        <NewCampaignForm
          projectId={expandedProjectId}
          onDone={onClose}
          onCancel={() => setMode('idle')}
        />
      )}
    </div>
  );
}

function NewProjectForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const { invalidateCampaigns } = useCacheActions();
  const swap = useSwapActiveContext();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const project = await createProject(name.trim(), getToken);
      // The backend doesn't auto-create a "General" campaign on new
      // projects (only on user signup), so we create one inline so the
      // newly-created project is immediately usable as an active scope.
      const campaign = await createCampaign(
        project.id,
        { name: 'General' },
        getToken,
      );
      // Bust caches so the popover (and any other consumer) sees the
      // new rows on next read.
      mutate(QK.projects);
      invalidateCampaigns(project.id);
      swap(project.id, campaign.id);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'failed to create project');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="project name"
        maxLength={120}
        className="flex-1 h-8 px-2.5 rounded-md bg-surface-sunken/40 border border-border/60 text-fg text-body-sm placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
      />
      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="h-8 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_24px_rgba(124,92,255,0.3)] disabled:opacity-40 disabled:shadow-none"
      >
        {submitting ? '…' : 'create'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-8 px-2 text-fg-subtle hover:text-fg text-body-sm"
      >
        cancel
      </button>
      {err && (
        <span className="text-rose-400 text-body-sm ml-2">{err}</span>
      )}
    </form>
  );
}

function NewCampaignForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { getToken } = useAuth();
  const { invalidateCampaigns } = useCacheActions();
  const swap = useSwapActiveContext();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const campaign = await createCampaign(
        projectId,
        { name: name.trim() },
        getToken,
      );
      invalidateCampaigns(projectId);
      swap(projectId, campaign.id);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'failed to create campaign');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="campaign name"
        maxLength={120}
        className="flex-1 h-8 px-2.5 rounded-md bg-surface-sunken/40 border border-border/60 text-fg text-body-sm placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
      />
      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="h-8 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_24px_rgba(124,92,255,0.3)] disabled:opacity-40 disabled:shadow-none"
      >
        {submitting ? '…' : 'create'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-8 px-2 text-fg-subtle hover:text-fg text-body-sm"
      >
        cancel
      </button>
      {err && (
        <span className="text-rose-400 text-body-sm ml-2">{err}</span>
      )}
    </form>
  );
}
