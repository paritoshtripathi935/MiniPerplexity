/**
 * /projects/:projectId — project detail.
 *
 * Surface 3 from STITCH_PROMPTS_H.md. Post-redesign 2026-05-14:
 * project identity tile + accent strip header, segmented-pill tabs,
 * project-colored row strips, snapshot-first brand profile, overflow
 * menu for rename/archive.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Archive,
  Calendar,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/ui/Button';
import {
  projectColor,
  projectStrip,
  projectTint,
  useSwapActiveContext,
} from '../components/ActiveCampaign';
import { CampaignDrawer } from '../components/CampaignDrawer';
import {
  BrandProfileFormFields,
  CHANNELS,
  emptyBrandProfileForm,
  type BrandProfileFormState,
} from '../components/BrandProfileFormFields';
import {
  archiveProject,
  getProjectBrandProfile,
  putProjectBrandProfile,
  renameProject,
  unarchiveCampaign,
  type CampaignSummary,
  type ProjectSummary,
} from '../services/api';
import { QK, useCampaigns, useProjects } from '../services/queries';
import { useSWRConfig } from 'swr';

interface Props {
  darkMode: boolean;
}

type Tab = 'campaigns' | 'brand-profile';

function projectInitial(name: string): string {
  const t = name.trim();
  if (!t) return '•';
  return t[0]!.toUpperCase();
}

/* -------------------------------------------------------------------- */
/* Page                                                                  */
/* -------------------------------------------------------------------- */

export function ProjectDetailPage(_props: Props) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const { data: projects } = useProjects(getToken, !!isSignedIn);
  const project = useMemo(
    () => (projects || []).find(p => p.id === projectId) || null,
    [projects, projectId],
  );

  // Keep the top-nav switcher + brand-profile lookups in sync with the URL.
  const swap = useSwapActiveContext();
  useEffect(() => {
    if (projectId) swap(projectId);
  }, [projectId, swap]);

  const [tab, setTab] = useState<Tab>('campaigns');

  if (!projects) {
    return <p className="text-body-sm text-fg-muted">loading…</p>;
  }
  if (!project) {
    return (
      <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-8 text-center">
        <p className="text-fg-muted">project not found</p>
        <Link
          to="/projects"
          className="inline-block mt-3 text-brand hover:underline text-body-sm"
        >
          back to projects
        </Link>
      </div>
    );
  }

  return (
    <>
      <ProjectIdentityHeader
        project={project}
        onAfterArchive={() => navigate('/projects')}
      />
      <SegmentedTabs tab={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'campaigns' && <CampaignsTab project={project} />}
        {tab === 'brand-profile' && <BrandProfileTab project={project} />}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Identity header — initial tile + accent strip + overflow menu         */
/* -------------------------------------------------------------------- */

function ProjectIdentityHeader({
  project,
  onAfterArchive,
}: {
  project: ProjectSummary;
  onAfterArchive: () => void;
}) {
  const { getToken, isSignedIn } = useAuth();
  const { mutate } = useSWRConfig();
  const { data: campaigns } = useCampaigns(project.id, getToken, !!isSignedIn);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project.name);
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const color = projectColor(project.id);
  const strip = projectStrip(color.dot);
  const tint = projectTint(color.dot);

  // Keep local name in sync if the project rename happens elsewhere.
  useEffect(() => setName(project.name), [project.name, project.id]);

  const liveCount = (campaigns || []).filter(c => !c.archived_at).length;

  async function saveName() {
    if (!name.trim() || name === project.name) {
      setEditingName(false);
      setName(project.name);
      return;
    }
    try {
      await renameProject(project.id, name.trim(), getToken);
      mutate(QK.projects);
      setEditingName(false);
    } catch (e: any) {
      setErr(e?.message || 'rename failed');
      setName(project.name);
      setEditingName(false);
    }
  }

  async function handleArchive() {
    if (archiving) return;
    if (!window.confirm(`archive “${project.name}”? you can unarchive it later.`)) {
      return;
    }
    setArchiving(true);
    setErr(null);
    try {
      await archiveProject(project.id, getToken);
      mutate(QK.projects);
      onAfterArchive();
    } catch (e: any) {
      setErr(e?.message || 'archive failed');
      setArchiving(false);
    }
  }

  return (
    <div className="mb-8">
      <div
        className={clsx(
          'relative overflow-hidden rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur',
          'pl-6 pr-4 py-5 sm:pl-7',
        )}
      >
        {/* Project-colored left accent strip */}
        <span
          aria-hidden
          className={clsx('absolute left-0 top-0 bottom-0 w-1', strip)}
        />

        <div className="flex items-start gap-5">
          {/* Brand-initial tile */}
          <div
            className={clsx(
              'shrink-0 grid place-items-center rounded-xl ring-1',
              'w-14 h-14 sm:w-16 sm:h-16',
              tint,
              color.ring,
            )}
          >
            <span
              className={clsx(
                'font-display text-h1 font-semibold leading-none',
                color.text,
              )}
            >
              {projectInitial(project.name)}
            </span>
          </div>

          {/* Title + meta */}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1.5">
              project
            </p>
            {editingName ? (
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    setName(project.name);
                    setEditingName(false);
                  }
                }}
                maxLength={120}
                className="font-display text-h1 bg-surface-sunken/60 rounded-md px-3 py-1 outline-none w-full max-w-md"
              />
            ) : (
              <h1 className="font-display text-h1 text-fg leading-tight truncate">
                {project.name}
              </h1>
            )}
            <p className="text-body-sm text-fg-muted mt-1.5 inline-flex items-center gap-1.5">
              <span>{liveCount} live campaign{liveCount === 1 ? '' : 's'}</span>
              <span className="text-fg-subtle">·</span>
              <Link to="/projects" className="hover:text-fg transition-colors">
                all projects
              </Link>
            </p>
          </div>

          {/* Overflow menu */}
          <div className="shrink-0">
            <OverflowMenu
              onRename={() => setEditingName(true)}
              onArchive={handleArchive}
              archiving={archiving}
            />
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-3 text-rose-400 text-body-sm">{err}</div>
      )}
    </div>
  );
}

function OverflowMenu({
  onRename,
  onArchive,
  archiving,
}: {
  onRename: () => void;
  onArchive: () => void;
  archiving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid place-items-center w-9 h-9 rounded-md text-fg-muted hover:text-fg hover:bg-surface-sunken/40 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-xl border border-border/60 bg-surface-raised/95 backdrop-blur shadow-card overflow-hidden py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-fg hover:bg-surface-sunken/60 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            rename
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={archiving}
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            <Archive className="w-3.5 h-3.5" />
            {archiving ? 'archiving…' : 'archive project'}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Segmented tabs — pill control with project-colored indicator          */
/* -------------------------------------------------------------------- */

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
}) {
  const items: Array<{ id: Tab; label: string }> = [
    { id: 'campaigns', label: 'campaigns' },
    { id: 'brand-profile', label: 'brand profile' },
  ];

  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 p-1 rounded-xl border border-border/60 bg-surface-sunken/40"
    >
      {items.map(item => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={clsx(
              'h-8 px-3.5 rounded-lg text-body-sm font-medium transition-colors',
              active
                ? 'text-fg bg-surface-raised shadow-card'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Campaigns tab                                                         */
/* -------------------------------------------------------------------- */

function CampaignsTab({ project }: { project: ProjectSummary }) {
  const { getToken, isSignedIn } = useAuth();
  const { data: campaignsData, mutate: refetch } = useCampaigns(
    project.id,
    getToken,
    !!isSignedIn,
  );
  const campaigns = useMemo(() => campaignsData || [], [campaignsData]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignSummary | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const color = projectColor(project.id);

  // Active campaigns float to top; "no-window" below; ended below them.
  const live = useMemo(() => {
    const order: Record<CampaignStatus, number> = {
      active: 0,
      'no-window': 1,
      ended: 2,
      archived: 3,
    };
    return campaigns
      .filter(c => !c.archived_at)
      .slice()
      .sort((a, b) => order[campaignStatus(a)] - order[campaignStatus(b)]);
  }, [campaigns]);
  const archived = useMemo(
    () => campaigns.filter(c => !!c.archived_at),
    [campaigns],
  );

  function openNew() {
    setEditing(null);
    setDrawerOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h2 font-display font-semibold text-fg">campaigns</h2>
        <Button
          variant="gradient"
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={openNew}
        >
          new campaign
        </Button>
      </div>

      {live.length === 0 ? (
        <EmptyCampaigns onCreate={openNew} />
      ) : (
        <ul className="space-y-3">
          {live.map(c => (
            <CampaignRow
              key={c.id}
              projectId={project.id}
              campaign={c}
              stripClass={projectStrip(color.dot)}
              onEdit={() => {
                setEditing(c);
                setDrawerOpen(true);
              }}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived(s => !s)}
            className="inline-flex items-center gap-2 text-body-sm text-fg-subtle hover:text-fg transition-colors"
          >
            <ChevronRight
              className={clsx(
                'w-3.5 h-3.5 transition-transform',
                showArchived && 'rotate-90',
              )}
            />
            show archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="space-y-3 mt-3 opacity-70">
              {archived.map(c => (
                <ArchivedCampaignRow
                  key={c.id}
                  projectId={project.id}
                  campaign={c}
                  onUnarchived={() => refetch()}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {drawerOpen && (
        <CampaignDrawer
          project={project}
          campaign={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => {
            refetch();
            setDrawerOpen(false);
          }}
          liveCampaignCount={live.length}
        />
      )}
    </>
  );
}

function CampaignRow({
  projectId,
  campaign,
  stripClass,
  onEdit,
}: {
  projectId: string;
  campaign: CampaignSummary;
  stripClass: string;
  onEdit: () => void;
}) {
  const status = campaignStatus(campaign);
  return (
    <li>
      <Link
        to={`/projects/${projectId}/c/${campaign.id}`}
        className="relative block rounded-xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 hover:border-border transition-colors pl-5 pr-4 py-4 overflow-hidden group"
      >
        {/* Project-colored left strip */}
        <span
          aria-hidden
          className={clsx(
            'absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full',
            stripClass,
            // Dim ended / no-window rows for emphasis on active
            status === 'active' ? 'opacity-100' : 'opacity-40',
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-fg font-display font-semibold text-body-base truncate">
                {campaign.name}
              </span>
              <StatusPill status={status} />
            </div>
            <p className="text-body-sm text-fg-muted line-clamp-1">
              {campaign.objective || (
                <span className="italic text-fg-subtle">no objective set</span>
              )}
            </p>
            {(campaign.starts_on || campaign.ends_on) && (
              <DateChip starts={campaign.starts_on} ends={campaign.ends_on} />
            )}
          </div>
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
            className="grid place-items-center w-8 h-8 -m-2 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 transition-colors shrink-0"
            aria-label="edit campaign"
            title="edit campaign"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </Link>
    </li>
  );
}

function DateChip({
  starts,
  ends,
}: {
  starts: string | null;
  ends: string | null;
}) {
  const text = formatDateWindow(starts, ends);
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.5 mt-2 rounded-md border border-border/60 bg-surface-sunken/40 px-2 py-0.5 font-mono text-[11px] text-fg-subtle">
      <Calendar className="w-3 h-3" />
      {text}
    </span>
  );
}

function ArchivedCampaignRow({
  projectId,
  campaign,
  onUnarchived,
}: {
  projectId: string;
  campaign: CampaignSummary;
  onUnarchived: () => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await unarchiveCampaign(projectId, campaign.id, getToken);
      onUnarchived();
    } catch (e: any) {
      setErr(e?.message || 'unarchive failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-surface-raised/30 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-fg-muted text-body-base truncate">{campaign.name}</div>
        <div className="text-fg-subtle text-body-sm">
          archived
          {campaign.archived_at &&
            ' · ' +
              new Date(campaign.archived_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
        </div>
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-40"
      >
        unarchive
      </button>
      {err && <span className="text-rose-400 text-body-sm">{err}</span>}
    </li>
  );
}

function EmptyCampaigns({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 px-8 py-12 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
        campaigns
      </p>
      <h3 className="font-display text-h2 text-fg mb-2">no campaigns yet</h3>
      <p className="text-body-sm text-fg-muted max-w-md mx-auto mb-6">
        a campaign anchors investigations, plays, and creatives to a real-world push.
        create one to start grounding work in this project.
      </p>
      <Button
        variant="gradient"
        leadingIcon={<Plus className="w-3.5 h-3.5" />}
        onClick={onCreate}
      >
        create first campaign
      </Button>
    </div>
  );
}

type CampaignStatus = 'active' | 'ended' | 'no-window' | 'archived';

function campaignStatus(c: CampaignSummary): CampaignStatus {
  if (c.archived_at) return 'archived';
  if (!c.starts_on && !c.ends_on) return 'no-window';
  const today = new Date().toISOString().slice(0, 10);
  if (c.ends_on && c.ends_on < today) return 'ended';
  return 'active';
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const map: Record<
    CampaignStatus,
    { label: string; cls: string; dot?: string }
  > = {
    active: {
      label: 'active',
      cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
      dot: 'bg-emerald-400',
    },
    ended: {
      label: 'ended',
      cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    },
    'no-window': {
      label: 'no window',
      cls: 'border-border/60 bg-surface-sunken/40 text-fg-subtle',
    },
    archived: {
      label: 'archived',
      cls: 'border-border/60 bg-surface-sunken/40 text-fg-subtle',
    },
  };
  const m = map[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 h-5 px-2 rounded font-mono text-[10px] uppercase tracking-[0.12em] border',
        m.cls,
      )}
    >
      {m.dot && (
        <span
          className={clsx(
            'w-1 h-1 rounded-full motion-safe:animate-status-blink',
            m.dot,
          )}
        />
      )}
      {m.label}
    </span>
  );
}

function formatDateWindow(starts: string | null, ends: string | null): string {
  const fmt = (s: string) =>
    new Date(s)
      .toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      .toLowerCase();
  if (starts && ends) return `${fmt(starts)} – ${fmt(ends)}`;
  if (starts) return `started ${fmt(starts)}`;
  if (ends) return `ends ${fmt(ends)}`;
  return '';
}

/* -------------------------------------------------------------------- */
/* Brand profile tab — snapshot-first with edit flip                     */
/* -------------------------------------------------------------------- */

function BrandProfileTab({ project }: { project: ProjectSummary }) {
  const { getToken } = useAuth();
  const [form, setForm] = useState<BrandProfileFormState>(emptyBrandProfileForm);
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    getProjectBrandProfile(project.id, getToken)
      .then(p => {
        if (cancelled) return;
        setForm({
          companyName: p.company_name ?? '',
          website: p.website ?? '',
          icp: p.icp_description ?? '',
          channels: p.primary_channels ?? [],
          targetCac: p.target_cac != null ? String(p.target_cac) : '',
          targetRoas: p.target_roas != null ? String(p.target_roas) : '',
          voice: p.voice_guidelines ?? '',
          campaigns: p.current_campaigns_summary ?? '',
        });
      })
      .catch(() => {
        // 404 / network — empty profile is fine.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, getToken]);

  const isEmpty =
    !form.companyName &&
    !form.website &&
    !form.icp &&
    form.channels.length === 0 &&
    !form.targetCac &&
    !form.targetRoas &&
    !form.voice &&
    !form.campaigns;

  // Default to edit mode when the project has no profile yet — the
  // user is here precisely to fill it in.
  useEffect(() => {
    if (hydrated && isEmpty) setEditing(true);
  }, [hydrated, isEmpty]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await putProjectBrandProfile(
        project.id,
        {
          company_name: form.companyName.trim() || null,
          website: form.website.trim() || null,
          icp_description: form.icp.trim() || null,
          primary_channels: form.channels,
          target_cac: form.targetCac ? Number(form.targetCac) : null,
          target_roas: form.targetRoas ? Number(form.targetRoas) : null,
          voice_guidelines: form.voice.trim() || null,
          current_campaigns_summary: form.campaigns.trim() || null,
          mark_completed: true,
        },
        getToken,
      );
      setSavedAt(Date.now());
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return <p className="text-body-sm text-fg-muted">loading brand profile…</p>;
  }

  if (!editing) {
    return (
      <BrandProfileSnapshot
        form={form}
        onEdit={() => setEditing(true)}
        savedAt={savedAt}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
            edit
          </p>
          <h3 className="font-display text-h2 text-fg">brand profile</h3>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-8 px-3 rounded-md text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            cancel
          </button>
        )}
      </div>

      <BrandProfileFormFields value={form} onChange={setForm} />

      {err && (
        <div className="mt-4 px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
          {err}
        </div>
      )}
      <div className="flex items-center justify-end gap-3 pt-5">
        <Button
          variant="gradient"
          onClick={save}
          loading={saving}
          leadingIcon={<Save className="w-3.5 h-3.5" />}
        >
          {saving ? 'saving' : 'save profile'}
        </Button>
      </div>
    </div>
  );
}

function BrandProfileSnapshot({
  form,
  onEdit,
  savedAt,
}: {
  form: BrandProfileFormState;
  onEdit: () => void;
  savedAt: number | null;
}) {
  const justSaved = savedAt && Date.now() - savedAt < 4000;
  const channelLabels = CHANNELS.filter(c => form.channels.includes(c.id));

  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
            grounded in
          </p>
          <h3 className="font-display text-h2 text-fg">brand profile</h3>
          <p className="text-body-sm text-fg-muted mt-1.5 max-w-md">
            this is what every investigation, play, and answer in the project sees as
            the brand context.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {justSaved && (
            <span className="text-body-sm text-success">saved</span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            edit
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <SnapshotSection label="identity">
          <SnapshotRow label="company" value={form.companyName} />
          <SnapshotRow label="website" value={form.website} mono />
        </SnapshotSection>

        <SnapshotSection label="ideal customer">
          <SnapshotBlock value={form.icp} />
        </SnapshotSection>

        <SnapshotSection label="primary channels">
          {channelLabels.length === 0 ? (
            <p className="text-body-sm text-fg-subtle italic">none selected</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {channelLabels.map(c => (
                <span
                  key={c.id}
                  className="h-7 inline-flex items-center px-2.5 rounded-md border border-brand/30 bg-brand/5 text-body-sm text-fg"
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </SnapshotSection>

        <SnapshotSection label="targets">
          <div className="grid grid-cols-2 gap-4">
            <MetricChip
              label="target CAC"
              value={form.targetCac ? `$${form.targetCac}` : null}
            />
            <MetricChip
              label="target ROAS"
              value={form.targetRoas ? `${form.targetRoas}×` : null}
            />
          </div>
        </SnapshotSection>

        {form.voice && (
          <SnapshotSection label="brand voice">
            <SnapshotBlock value={form.voice} italic />
          </SnapshotSection>
        )}

        {form.campaigns && (
          <SnapshotSection label="current campaigns">
            <SnapshotBlock value={form.campaigns} />
          </SnapshotSection>
        )}
      </div>
    </div>
  );
}

function SnapshotSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <span className="text-body-sm text-fg-subtle">{label}</span>
      {value ? (
        <span className={clsx('text-body-base text-fg', mono && 'font-mono text-body-sm')}>
          {value}
        </span>
      ) : (
        <span className="text-body-sm text-fg-subtle italic">not set</span>
      )}
    </div>
  );
}

function SnapshotBlock({
  value,
  italic,
}: {
  value: string;
  italic?: boolean;
}) {
  if (!value) {
    return (
      <p className="text-body-sm text-fg-subtle italic">not set</p>
    );
  }
  return (
    <p
      className={clsx(
        'text-body-base text-fg leading-relaxed whitespace-pre-wrap',
        italic && 'italic text-fg-muted',
      )}
    >
      {value}
    </p>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-sunken/40 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
        {label}
      </p>
      <p
        className={clsx(
          'mt-0.5 font-display',
          value ? 'text-fg text-h2' : 'text-fg-subtle italic text-body-sm',
        )}
      >
        {value ?? 'not set'}
      </p>
    </div>
  );
}
