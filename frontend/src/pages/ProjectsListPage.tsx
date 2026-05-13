/**
 * /projects — list of the user's projects (Stitch Surface 2 +
 * the projects_dashboard_list variant).
 *
 * Layout mirrors the Stitch operator-tool design:
 *   - Search input + status filter + sort dropdown above the list.
 *   - Column-header strip — PROJECT · METRICS · ACTIVE CAMPAIGNS · ACTIONS.
 *   - One row per project: color dot + name + brand label + AMPS / INVS
 *     metric blocks + up-to-5 campaign chips + ⋯ overflow menu.
 *   - Archived rows collapse behind a "show archived" toggle.
 *   - Filtered-empty state with "clear all filters" CTA.
 *
 * Campaign chips render from the project row's campaign_count >= 0 (no
 * fan-out fetch — chips show as pills with a "+N more" overflow when the
 * project carries more than CHIP_PREVIEW_LIMIT live campaigns). The
 * settings detail page is the place to inspect them all.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import clsx from 'clsx';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';
import { projectColor, useActiveCampaign } from '../components/ActiveCampaign';
import { useProjects } from '../services/queries';
import {
  archiveProject,
  createCampaign,
  createProject,
  listCampaigns,
  listProjects,
  unarchiveProject,
  type CampaignSummary,
  type ProjectSummary,
} from '../services/api';
import { useSWRConfig } from 'swr';
import { QK } from '../services/queries';

const CHIP_PREVIEW_LIMIT = 3;

type StatusFilter = 'live' | 'archived' | 'all';
type SortKey = 'recent' | 'name' | 'activity';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'recently updated',
  name: 'name (a–z)',
  activity: 'most active',
};
const STATUS_LABELS: Record<StatusFilter, string> = {
  live: 'live',
  archived: 'archived',
  all: 'all',
};

interface Props {
  darkMode: boolean;
}

export function ProjectsListPage(_props: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { data: liveProjects, mutate: refetch } = useProjects(getToken, !!isSignedIn);

  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('live');
  const [sort, setSort] = useState<SortKey>('recent');
  const [createOpen, setCreateOpen] = useState(false);

  // Lazy-load archived rows on first request, and refetch when explicit
  // "all" filter is selected since live projects alone won't include them.
  React.useEffect(() => {
    const needArchived = status !== 'live' || showArchived;
    if (!needArchived || archivedProjects !== null) return;
    setArchivedLoading(true);
    listProjects(getToken, { includeArchived: true })
      .then(all => setArchivedProjects(all.filter(p => p.archived_at)))
      .catch(() => setArchivedProjects([]))
      .finally(() => setArchivedLoading(false));
  }, [status, showArchived, archivedProjects, getToken]);

  const liveList = liveProjects || [];
  const archivedList = archivedProjects || [];
  const sourceList = useMemo<ProjectSummary[]>(() => {
    if (status === 'live') return liveList;
    if (status === 'archived') return archivedList;
    return [...liveList, ...archivedList];
  }, [status, liveList, archivedList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = sourceList;
    if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q));
    const cmp =
      sort === 'name'
        ? (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name)
        : sort === 'activity'
        ? (a: ProjectSummary, b: ProjectSummary) => b.session_count - a.session_count
        : (a: ProjectSummary, b: ProjectSummary) =>
            (b.last_session_at || b.updated_at).localeCompare(
              a.last_session_at || a.updated_at,
            );
    return [...rows].sort(cmp);
  }, [sourceList, query, sort]);

  const isFiltering = query.trim().length > 0 || status !== 'live' || sort !== 'recent';

  function clearAllFilters() {
    setQuery('');
    setStatus('live');
    setSort('recent');
  }

  function bustArchivedCache() {
    setArchivedProjects(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="projects + campaigns."
        subtitle="each project is a brand. campaigns group the work you do for it."
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
            refetch();
            bustArchivedCache();
            setCreateOpen(false);
          }}
        />
      )}

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
        sort={sort}
        onSortChange={setSort}
      />

      {liveProjects === undefined && (
        <p className="text-body-sm text-fg-subtle">loading…</p>
      )}

      {liveProjects && filtered.length === 0 && !archivedLoading && (
        <FilteredEmpty
          isFiltering={isFiltering}
          onReset={clearAllFilters}
        />
      )}

      {filtered.length > 0 && (
        <>
          <ColumnHeaders />
          <ul className="space-y-3">
            {filtered.map(p => (
              <ProjectRow
                key={p.id}
                project={p}
                onMutated={() => {
                  refetch();
                  bustArchivedCache();
                }}
              />
            ))}
          </ul>
        </>
      )}

      {/* Archived footer reveal — only shown when not already filtering to "archived" / "all". */}
      {status === 'live' && (
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
            {archivedList.length > 0 && ` (${archivedList.length})`}
          </button>
          {showArchived && (
            <div className="mt-3 space-y-3 opacity-70">
              {archivedLoading && (
                <p className="text-body-sm text-fg-subtle">loading…</p>
              )}
              {archivedProjects && archivedProjects.length === 0 && (
                <p className="text-body-sm text-fg-subtle italic">
                  no archived projects.
                </p>
              )}
              {archivedProjects?.map(p => (
                <ArchivedProjectRow
                  key={p.id}
                  project={p}
                  onUnarchived={() => {
                    refetch();
                    setArchivedProjects(prev => prev?.filter(x => x.id !== p.id) || null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Filter bar (search + status + sort)                                   */
/* -------------------------------------------------------------------- */

function FilterBar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (s: string) => void;
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-4">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="search projects…"
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-border/60 bg-surface-raised/40 text-fg text-body-base placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
        />
      </div>
      <FilterMenu
        ariaLabel="status filter"
        value={status}
        onChange={v => onStatusChange(v as StatusFilter)}
        options={Object.entries(STATUS_LABELS) as Array<[StatusFilter, string]>}
        prefix="status · "
      />
      <FilterMenu
        ariaLabel="sort"
        value={sort}
        onChange={v => onSortChange(v as SortKey)}
        options={Object.entries(SORT_LABELS) as Array<[SortKey, string]>}
        prefix="sort · "
      />
    </div>
  );
}

function FilterMenu<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  prefix,
}: {
  ariaLabel: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (next: T) => void;
  prefix: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const currentLabel = options.find(([k]) => k === value)?.[1] ?? value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'inline-flex items-center gap-2 h-10 px-3 rounded-xl border text-body-sm transition-colors',
          open
            ? 'border-brand/40 bg-brand/5 text-fg'
            : 'border-border/60 bg-surface-raised/40 text-fg-muted hover:text-fg hover:bg-surface-raised/60',
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
          {prefix}
        </span>
        <span className="text-fg">{currentLabel}</span>
        <ChevronDown
          className={clsx('w-3.5 h-3.5 text-fg-subtle transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[180px] rounded-xl border border-border/60 bg-surface-raised/90 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] py-1.5">
          {options.map(([k, label]) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={clsx(
                  'w-full text-left px-3 py-2 text-body-sm transition-colors hover:bg-surface-sunken/40',
                  k === value ? 'text-fg' : 'text-fg-muted',
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Column header strip                                                   */
/* -------------------------------------------------------------------- */

function ColumnHeaders() {
  return (
    <div className="hidden lg:grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-5 pb-2 mb-2 border-b border-border/40">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
        project · brand
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle text-center w-[120px]">
        metrics
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle w-[280px]">
        active campaigns
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
        actions
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Filtered empty state                                                  */
/* -------------------------------------------------------------------- */

function FilteredEmpty({
  isFiltering,
  onReset,
}: {
  isFiltering: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-surface-raised/30 p-10 text-center">
      <div className="grid place-items-center w-10 h-10 rounded-full bg-surface-sunken/40 mx-auto mb-3">
        <Search className="w-4 h-4 text-fg-subtle" />
      </div>
      <h3 className="font-display font-semibold text-fg mb-1">
        {isFiltering ? 'no matching projects' : 'no projects yet'}
      </h3>
      <p className="text-body-sm text-fg-muted mb-3">
        {isFiltering
          ? 'try adjusting your search or filters.'
          : 'create your first brand to get started.'}
      </p>
      {isFiltering && (
        <button
          type="button"
          onClick={onReset}
          className="text-brand text-body-sm hover:underline"
        >
          clear all filters
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Project row (live)                                                    */
/* -------------------------------------------------------------------- */

function ProjectRow({
  project,
  onMutated,
}: {
  project: ProjectSummary;
  onMutated: () => void;
}) {
  const { getToken } = useAuth();
  const { activeCampaign } = useActiveCampaign();
  const color = projectColor(project.id);
  const isArchived = !!project.archived_at;

  // Live-campaign chips. Fetch only when the project has >0 campaigns;
  // skip the fetch entirely when campaign_count is 0 (no chips to show).
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  React.useEffect(() => {
    if (project.campaign_count === 0) {
      setCampaigns([]);
      return;
    }
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
  }, [project.id, project.campaign_count, getToken]);

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

  async function handleArchiveToggle() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (isArchived) await unarchiveProject(project.id, getToken);
      else await archiveProject(project.id, getToken);
      onMutated();
    } catch (e: any) {
      setErr(e?.message || 'action failed');
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  const lastTouched = project.last_session_at || project.updated_at;

  return (
    <li
      className={clsx(
        'relative rounded-2xl border border-border/60 bg-surface-raised/40 transition-colors p-5',
        isArchived ? 'opacity-60' : 'hover:bg-surface-raised/60',
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] items-center gap-4 lg:gap-6">
        {/* Project name + brand label + last-touched */}
        <Link to={`/projects/${project.id}`} className="min-w-0 flex items-start gap-3">
          <span className={clsx('w-2 h-2 rounded-full shrink-0 mt-2', color.dot)} />
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-fg text-h2 truncate">
              {project.name}
            </h2>
            <p className="text-body-sm text-fg-muted">
              <span>updated {formatRelative(lastTouched)}</span>
              {isArchived && (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
                  archived
                </span>
              )}
            </p>
          </div>
        </Link>

        {/* Metric blocks (AMPS / INVS) */}
        <div className="flex items-center gap-4 lg:gap-5 lg:w-[120px] justify-center">
          <MetricBlock value={project.campaign_count} label="amps" />
          <MetricBlock value={project.session_count} label="invs" />
        </div>

        {/* Campaign chips */}
        <div className="flex items-center gap-1.5 max-w-md lg:w-[280px] overflow-x-auto">
          {campaigns === null ? (
            <span className="text-body-sm text-fg-subtle">…</span>
          ) : visible.length === 0 ? (
            <span className="text-body-sm text-fg-subtle italic">no live campaigns</span>
          ) : (
            <>
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
                  to={`/projects/${project.id}`}
                  className="inline-flex items-center h-7 px-2 rounded-lg border border-border/60 bg-surface-sunken/40 text-fg-subtle text-body-sm hover:text-fg"
                >
                  +{overflow} more
                </Link>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 justify-end">
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
                  to={`/projects/${project.id}`}
                  className="block px-3 py-2 text-body-sm text-fg hover:bg-surface-sunken/40"
                  onClick={() => setMenuOpen(false)}
                >
                  open
                </Link>
                <button
                  type="button"
                  onClick={handleArchiveToggle}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 text-body-sm text-fg hover:bg-surface-sunken/40 inline-flex items-center gap-2"
                >
                  {isArchived ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      unarchive
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5" />
                      archive
                    </>
                  )}
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

function MetricBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-h2 text-fg tabular-nums leading-none">
        {String(value).padStart(2, '0')}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle mt-1">
        {label}
      </div>
    </div>
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

/* -------------------------------------------------------------------- */
/* Inline create-project form                                            */
/* -------------------------------------------------------------------- */

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
