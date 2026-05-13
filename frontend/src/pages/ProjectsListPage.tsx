/**
 * /settings/projects — list of the user's projects.
 *
 * Matches Surface 2 from STITCH_PROMPTS_H.md: stacked operational list, one
 * row per project. Each row shows the color dot, project name, campaign
 * count and last-active hint, plus a horizontal scroll of up-to-5 campaign
 * chips (active campaign tinted). Archived projects collapse into a
 * "show archived (N)" section.
 *
 * Inline creation lives in the top-nav switcher; this page is for
 * navigating into a project and managing it. The "+ new project" header
 * CTA opens the same inline form as the switcher to avoid two creation
 * surfaces drifting.
 */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Archive, ChevronRight, MoreHorizontal, Plus, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';
import { projectColor, useActiveCampaign } from '../components/ActiveCampaign';
import { useProjects, useCacheActions, QK } from '../services/queries';
import {
  archiveProject,
  createProject,
  createCampaign,
  listCampaigns,
  unarchiveProject,
  type CampaignSummary,
  type ProjectSummary,
} from '../services/api';
import { useSWRConfig } from 'swr';

const CHIP_PREVIEW_LIMIT = 5;

interface Props {
  darkMode: boolean;
}

export function ProjectsListPage(_props: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { data: live, mutate: refetchLive } = useProjects(getToken, !!isSignedIn);
  const { data: all, mutate: refetchAll } = useProjects(
    getToken,
    !!isSignedIn,
  );
  // We need archived too — pass a different cache key. Easiest: a parallel
  // fetch directly into a local state via toggle, only when needed.
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<ProjectSummary[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // Force-fetch the archived list lazily.
  React.useEffect(() => {
    if (!showArchived || archived !== null) return;
    setArchivedLoading(true);
    import('../services/api').then(async ({ listProjects }) => {
      try {
        const all = await listProjects(getToken, { includeArchived: true });
        const onlyArchived = all.filter(p => p.archived_at);
        setArchived(onlyArchived);
      } finally {
        setArchivedLoading(false);
      }
    });
  }, [showArchived, archived, getToken]);

  const projects = useMemo(() => live || [], [live]);

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="projects + campaigns."
        subtitle="each project is a brand. campaigns group the work you do for that brand."
        actions={
          <Button
            variant="gradient"
            leadingIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setCreateOpen(o => !o)}
          >
            new project
          </Button>
        }
      />

      {createOpen && (
        <InlineCreateProject
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            refetchLive();
            setCreateOpen(false);
          }}
        />
      )}

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-10 text-center">
          <p className="text-fg-muted text-body-base">
            no projects yet. create your first brand to get started.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map(p => (
            <ProjectRow
              key={p.id}
              project={p}
              onArchived={() => {
                refetchLive();
                setArchived(null); // bust the archived-list cache
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowArchived(s => !s)}
          className="inline-flex items-center gap-2 text-body-sm text-fg-subtle hover:text-fg transition-colors"
        >
          <ChevronRight
            className={clsx('w-3.5 h-3.5 transition-transform', showArchived && 'rotate-90')}
          />
          show archived
        </button>
        {showArchived && (
          <div className="mt-3 space-y-3 opacity-70">
            {archivedLoading && (
              <p className="text-body-sm text-fg-subtle">loading…</p>
            )}
            {archived && archived.length === 0 && (
              <p className="text-body-sm text-fg-subtle italic">no archived projects.</p>
            )}
            {archived &&
              archived.map(p => (
                <ArchivedProjectRow
                  key={p.id}
                  project={p}
                  onUnarchived={() => {
                    refetchLive();
                    setArchived(prev => prev?.filter(x => x.id !== p.id) || null);
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Live project row                                                      */
/* -------------------------------------------------------------------- */

function ProjectRow({
  project,
  onArchived,
}: {
  project: ProjectSummary;
  onArchived: () => void;
}) {
  const { getToken } = useAuth();
  const { activeCampaign } = useActiveCampaign();
  const color = projectColor(project.id);

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    listCampaigns(project.id, getToken)
      .then(rows => {
        if (!cancelled) setCampaigns(rows);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, getToken]);

  const liveCampaigns = (campaigns || []).filter(c => !c.archived_at);
  const visible = liveCampaigns.slice(0, CHIP_PREVIEW_LIMIT);
  const overflow = Math.max(0, liveCampaigns.length - CHIP_PREVIEW_LIMIT);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleArchive() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await archiveProject(project.id, getToken);
      onArchived();
    } catch (e: any) {
      setErr(e?.message || 'archive failed');
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  return (
    <li className="relative rounded-2xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors p-5">
      <div className="flex items-start gap-4">
        <Link
          to={`/settings/projects/${project.id}`}
          className="flex-1 min-w-0 flex items-start gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('w-2 h-2 rounded-full', color.dot)} />
              <h2 className="font-display font-semibold text-fg text-h2 truncate">
                {project.name}
              </h2>
            </div>
            <p className="text-body-sm text-fg-muted">
              {liveCampaigns.length} {liveCampaigns.length === 1 ? 'campaign' : 'campaigns'}
              <span className="text-fg-subtle"> · last updated {formatRelative(project.updated_at)}</span>
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3 min-w-0">
          {campaigns === null ? (
            <span className="text-body-sm text-fg-subtle">loading…</span>
          ) : (
            <div className="flex items-center gap-1.5 max-w-md overflow-x-auto">
              {visible.map(c => (
                <span
                  key={c.id}
                  className={clsx(
                    'inline-flex items-center h-7 px-3 rounded-lg border text-body-sm whitespace-nowrap',
                    activeCampaign?.id === c.id
                      ? 'border-brand/40 bg-brand/5 text-fg'
                      : 'border-border/60 bg-surface-sunken/40 text-fg-muted',
                  )}
                >
                  {c.name}
                </span>
              ))}
              {overflow > 0 && (
                <Link
                  to={`/settings/projects/${project.id}`}
                  className="inline-flex items-center h-7 px-2 rounded-lg border border-border/60 bg-surface-sunken/40 text-fg-subtle text-body-sm hover:text-fg"
                >
                  +{overflow} more
                </Link>
              )}
            </div>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              aria-label="project actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-border/60 bg-surface-raised/90 backdrop-blur shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] py-1">
                <Link
                  to={`/settings/projects/${project.id}`}
                  className="block px-3 py-2 text-body-sm text-fg hover:bg-surface-sunken/40"
                  onClick={() => setMenuOpen(false)}
                >
                  open
                </Link>
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-sunken/40 inline-flex items-center gap-2"
                >
                  <Archive className="w-3.5 h-3.5" />
                  archive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {err && (
        <div className="absolute right-5 -bottom-5 text-rose-400 text-body-sm">{err}</div>
      )}
    </li>
  );
}

function ArchivedProjectRow({
  project,
  onUnarchived,
}: {
  project: ProjectSummary;
  onUnarchived: () => void;
}) {
  const { getToken } = useAuth();
  const color = projectColor(project.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleUnarchive() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await unarchiveProject(project.id, getToken);
      onUnarchived();
    } catch (e: any) {
      setErr(e?.message || 'unarchive failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/30 p-4 flex items-center gap-3">
      <span className={clsx('w-2 h-2 rounded-full', color.dot)} />
      <div className="flex-1 min-w-0">
        <div className="text-fg-muted text-body-base truncate">{project.name}</div>
        <div className="text-fg-subtle text-body-sm">
          archived {project.archived_at && formatRelative(project.archived_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={handleUnarchive}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-40"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        unarchive
      </button>
      {err && <span className="text-rose-400 text-body-sm">{err}</span>}
    </div>
  );
}

function InlineCreateProject({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const p = await createProject(name.trim(), getToken);
      // Auto-add a "General" campaign so it's immediately usable as a scope.
      await createCampaign(p.id, { name: 'General' }, getToken);
      mutate(QK.projects);
      onCreated();
    } catch (e: any) {
      setErr(e?.message || 'failed to create');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-brand/30 bg-brand/5 p-4 mb-4 flex items-center gap-2"
    >
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="brand name (eg. Allbirds, Lumen Skincare)"
        maxLength={120}
        className="flex-1 h-9 px-3 rounded-md bg-surface-sunken/40 border border-border/60 text-fg text-body-base placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
      />
      <Button variant="gradient" disabled={!name.trim() || submitting}>
        {submitting ? 'creating…' : 'create'}
      </Button>
      <button
        type="button"
        onClick={onClose}
        className="h-9 px-3 text-fg-subtle hover:text-fg text-body-sm"
      >
        cancel
      </button>
      {err && <span className="text-rose-400 text-body-sm ml-2">{err}</span>}
    </form>
  );
}

/* -------------------------------------------------------------------- */
/* Helpers                                                               */
/* -------------------------------------------------------------------- */

function formatRelative(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const delta = Date.now() - then;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
