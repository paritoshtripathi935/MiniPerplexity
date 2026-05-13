/**
 * /projects/:projectId — project detail with tabs.
 *
 * Surface 3 from STITCH_PROMPTS_H.md, simplified to the Stitch designer's
 * tab structure (campaigns | brand profile) instead of the two-column
 * version originally proposed. Owns the campaign list (with the drawer
 * for create / edit / archive) and the brand-profile form.
 */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Archive, ChevronRight, MoreHorizontal, Plus, Save } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';
import { projectColor, useSwapActiveContext } from '../components/ActiveCampaign';
import { CampaignDrawer } from '../components/CampaignDrawer';
import {
  BrandProfileFormFields,
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
import {
  QK,
  useCampaigns,
  useProjects,
} from '../services/queries';
import { useSWRConfig } from 'swr';

interface Props {
  darkMode: boolean;
}

type Tab = 'campaigns' | 'brand-profile';

export function ProjectDetailPage(_props: Props) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const { data: projects } = useProjects(getToken, !!isSignedIn);
  const project = useMemo(
    () => (projects || []).find(p => p.id === projectId) || null,
    [projects, projectId],
  );

  // Keep the top-nav switcher pill + brand-profile lookups in sync with
  // the URL — visiting /projects/:id makes that the active project.
  // Campaign defaults to whatever the new project's first live campaign
  // resolves to (handled by the provider's auto-resolve).
  const swap = useSwapActiveContext();
  React.useEffect(() => {
    if (projectId) swap(projectId);
  }, [projectId, swap]);

  const [tab, setTab] = useState<Tab>('campaigns');

  // Loading + not-found handling. The "loading" branch covers the case
  // where the page is opened directly from a URL before useProjects has
  // resolved; the "not-found" branch covers a stale link or wrong owner.
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
      <ProjectHeader project={project} onAfterArchive={() => navigate('/projects')} />

      <div className="mt-6 border-b border-border/60 flex items-center gap-1">
        <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
          campaigns
        </TabButton>
        <TabButton
          active={tab === 'brand-profile'}
          onClick={() => setTab('brand-profile')}
        >
          brand profile
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === 'campaigns' && <CampaignsTab project={project} />}
        {tab === 'brand-profile' && <BrandProfileTab project={project} />}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative h-9 px-3 text-body-base transition-colors',
        active ? 'text-fg' : 'text-fg-subtle hover:text-fg',
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------- */
/* Header (breadcrumb, name, archive)                                    */
/* -------------------------------------------------------------------- */

function ProjectHeader({
  project,
  onAfterArchive,
}: {
  project: ProjectSummary;
  onAfterArchive: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const color = projectColor(project.id);

  async function saveName() {
    if (!name.trim() || name === project.name) {
      setEditing(false);
      setName(project.name);
      return;
    }
    try {
      await renameProject(project.id, name.trim(), getToken);
      mutate(QK.projects);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'rename failed');
      setName(project.name);
      setEditing(false);
    }
  }

  async function handleArchive() {
    if (archiving) return;
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
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className={clsx('w-1.5 h-1.5 rounded-full', color.dot)} />
            project
          </span> as any
        }
        title={
          editing ? (
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
                  setEditing(false);
                }
              }}
              maxLength={120}
              className="bg-surface-sunken/40 rounded-md px-3 py-1 outline-none focus:bg-surface-sunken/60"
            />
          ) : (
            (<span onClick={() => setEditing(true)} className="cursor-text">
              {project.name}
            </span>) as any
          )
        }
        subtitle={
          <span className="inline-flex items-center gap-1.5 text-fg-subtle">
            <Link to="/settings" className="hover:text-fg">
              settings
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/projects" className="hover:text-fg">
              projects
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-fg-muted">{project.name}</span>
          </span>
        }
        actions={
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-40"
          >
            <Archive className="w-3.5 h-3.5" />
            {archiving ? 'archiving…' : 'archive project'}
          </button>
        }
      />
      {err && (
        <div className="-mt-4 mb-4 text-rose-400 text-body-sm">{err}</div>
      )}
    </>
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

  const live = campaigns.filter(c => !c.archived_at);
  const archived = campaigns.filter(c => !!c.archived_at);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h2 font-display font-semibold text-fg">campaigns</h2>
        <Button
          variant="gradient"
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          new campaign
        </Button>
      </div>

      {live.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-8 text-center text-fg-muted">
          no live campaigns. create one to start grounding investigations.
        </div>
      ) : (
        <ul className="space-y-3">
          {live.map(c => (
            <CampaignRow
              key={c.id}
              projectId={project.id}
              campaign={c}
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
              className={clsx('w-3.5 h-3.5 transition-transform', showArchived && 'rotate-90')}
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
  onEdit,
}: {
  projectId: string;
  campaign: CampaignSummary;
  onEdit: () => void;
}) {
  const status = campaignStatus(campaign);
  return (
    <li>
      <Link
        to={`/projects/${projectId}/c/${campaign.id}`}
        className="block rounded-xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors p-4"
      >
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
              <p className="font-mono text-body-sm text-fg-subtle mt-1">
                {formatDateWindow(campaign.starts_on, campaign.ends_on)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={e => {
              // Prevent the parent Link navigation when clicking the edit icon.
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
            ' · ' + new Date(campaign.archived_at).toLocaleDateString('en-US', {
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

type CampaignStatus = 'active' | 'ended' | 'no-window' | 'archived';

function campaignStatus(c: CampaignSummary): CampaignStatus {
  if (c.archived_at) return 'archived';
  if (!c.starts_on && !c.ends_on) return 'no-window';
  const today = new Date().toISOString().slice(0, 10);
  if (c.ends_on && c.ends_on < today) return 'ended';
  return 'active';
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; cls: string }> = {
    active: { label: 'active', cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
    ended: { label: 'ended', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300' },
    'no-window': { label: 'no window', cls: 'border-border/60 bg-surface-sunken/40 text-fg-subtle' },
    archived: { label: 'archived', cls: 'border-border/60 bg-surface-sunken/40 text-fg-subtle' },
  };
  const m = map[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center h-5 px-2 rounded font-mono text-[10px] uppercase tracking-[0.12em] border',
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

function formatDateWindow(starts: string | null, ends: string | null): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
  if (starts && ends) return `${fmt(starts)} – ${fmt(ends)}`;
  if (starts) return `started ${fmt(starts)}`;
  if (ends) return `ends ${fmt(ends)}`;
  return '';
}

/* -------------------------------------------------------------------- */
/* Brand profile tab                                                     */
/* -------------------------------------------------------------------- */

function BrandProfileTab({ project }: { project: ProjectSummary }) {
  const { getToken } = useAuth();
  const [form, setForm] = useState<BrandProfileFormState>(emptyBrandProfileForm);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load the project's brand profile on mount + when project changes.
  React.useEffect(() => {
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
        // 404 or network error — empty profile is fine; user can fill in.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, getToken]);

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
    } catch (e: any) {
      setErr(e?.message || 'save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return <p className="text-body-sm text-fg-muted">loading brand profile…</p>;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6 space-y-5 max-w-3xl">
      <BrandProfileFormFields value={form} onChange={setForm} />
      {err && (
        <div className="px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
          {err}
        </div>
      )}
      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-body-md text-success inline-flex items-center gap-1">
            saved
          </span>
        )}
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

