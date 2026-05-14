/**
 * /projects/:projectId/c/:campaignId — campaign home.
 *
 * Launching pad for the campaign's "do work" surfaces. Hierarchy:
 *   identity card  →  primary "investigations" tile  →  secondary 3-card
 *   strip (plays / calc / creatives)  →  recent investigations feed.
 *
 * Threads the parent project's color across the page (accent strip,
 * gradient wash, primary CTA, session-row strips) so this surface visually
 * belongs to its project.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Archive,
  Calculator,
  Calendar,
  ChevronRight,
  Edit3,
  Image as ImageIcon,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Search,
  Target,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import {
  projectColor,
  projectGradient,
  projectStrip,
  projectTint,
  useActiveCampaign,
  useSwapActiveContext,
} from '../components/ActiveCampaign';
import {
  archiveCampaign,
  listCampaigns,
  type CampaignSummary,
  type ProjectSummary,
  type SessionListItem,
} from '../services/api';
import { QK, useProjects, useSessions } from '../services/queries';
import { useSWRConfig } from 'swr';

interface Props {
  darkMode: boolean;
}

export function CampaignHomePage(_props: Props) {
  const { projectId = '', campaignId = '' } = useParams<{
    projectId: string;
    campaignId: string;
  }>();
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();

  const { data: projects } = useProjects(getToken, !!isSignedIn);
  const project = useMemo(
    () => (projects || []).find(p => p.id === projectId) || null,
    [projects, projectId],
  );

  const swap = useSwapActiveContext();
  const { campaigns: activeCampaigns, activeProject } = useActiveCampaign();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(
    activeProject?.id === projectId ? activeCampaigns : null,
  );

  useEffect(() => {
    if (campaigns !== null) return;
    let cancelled = false;
    listCampaigns(projectId, getToken)
      .then(rows => {
        if (!cancelled) setCampaigns(rows);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, campaigns, getToken]);

  const campaign = useMemo(
    () => (campaigns || []).find(c => c.id === campaignId) || null,
    [campaigns, campaignId],
  );

  useEffect(() => {
    if (projectId && campaignId) swap(projectId, campaignId);
  }, [projectId, campaignId, swap]);

  const { data: sessions = [] } = useSessions(
    getToken,
    { limit: 8, campaignId },
    !!isSignedIn && !!campaignId,
  );

  if (!projects || campaigns === null) {
    return <p className="text-body-sm text-fg-muted">loading…</p>;
  }

  if (!project) {
    return (
      <NotFound
        message="project not found"
        backTo="/projects"
        backLabel="back to projects"
      />
    );
  }
  if (!campaign) {
    return (
      <NotFound
        message="campaign not found in this project"
        backTo={`/projects/${project.id}`}
        backLabel="back to project"
      />
    );
  }

  const color = projectColor(project.id);
  const gradient = projectGradient(color.dot);
  const strip = projectStrip(color.dot);
  const tint = projectTint(color.dot);

  const toolBase = `/projects/${projectId}/c/${campaignId}`;
  const liveSessionCount = sessions.filter(s => !s.is_archived).length;

  return (
    <>
      <CampaignIdentityHeader
        project={project}
        campaign={campaign}
        strip={strip}
        gradient={gradient}
        tint={tint}
        textCls={color.text}
        ringCls={color.ring}
        onAfterArchive={() => navigate(`/projects/${project.id}`)}
      />

      {/* Primary tile — investigations */}
      <PrimaryInvestigationsTile
        gradient={gradient}
        tint={tint}
        textCls={color.text}
        liveSessionCount={liveSessionCount}
        onNew={() => navigate(`${toolBase}/investigations/${uuidv4()}`)}
        onOpenLast={
          sessions.length > 0
            ? () => navigate(`${toolBase}/investigations/${sessions[0].id}`)
            : undefined
        }
        lastTitle={sessions[0]?.title || null}
        lastAccessed={sessions[0]?.last_accessed_at || null}
      />

      {/* Secondary tiles — plays, calculators, creatives */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <SecondaryTile
          to={`${toolBase}/plays`}
          icon={<PlayCircle className="w-4 h-4" />}
          title="plays"
          subtitle="ready-to-run growth plays"
          tint={tint}
          textCls={color.text}
        />
        <SecondaryTile
          to={`${toolBase}/calc`}
          icon={<Calculator className="w-4 h-4" />}
          title="calculators"
          subtitle="CAC payback, ROAS, A/B, mix"
          tint={tint}
          textCls={color.text}
        />
        <SecondaryTile
          to={`${toolBase}/creatives`}
          icon={<ImageIcon className="w-4 h-4" />}
          title="creatives"
          subtitle="pdf + image library"
          tint={tint}
          textCls={color.text}
        />
      </div>

      {/* Recent investigations within this campaign */}
      <RecentInvestigationsSection
        sessions={sessions}
        toolBase={toolBase}
        strip={strip}
        gradient={gradient}
        onCreate={() => navigate(`${toolBase}/investigations/${uuidv4()}`)}
      />
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Identity header                                                       */
/* -------------------------------------------------------------------- */

function CampaignIdentityHeader({
  project,
  campaign,
  strip,
  gradient,
  tint,
  textCls,
  ringCls,
  onAfterArchive,
}: {
  project: ProjectSummary;
  campaign: CampaignSummary;
  strip: string;
  gradient: string;
  tint: string;
  textCls: string;
  ringCls: string;
  onAfterArchive: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = campaignStatus(campaign);
  const timeSignal = computeTimeSignal(campaign);

  async function handleArchive() {
    if (archiving) return;
    if (
      !window.confirm(
        `archive “${campaign.name}”? investigations stay; the campaign is hidden until unarchived.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    setErr(null);
    try {
      await archiveCampaign(project.id, campaign.id, getToken);
      mutate(QK.campaigns(project.id));
      onAfterArchive();
    } catch (e: any) {
      setErr(e?.message || 'archive failed');
      setArchiving(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur pl-6 pr-4 py-5 sm:pl-7">
        {/* Project-colored left accent strip */}
        <span
          aria-hidden
          className={clsx('absolute left-0 top-0 bottom-0 w-1', strip)}
        />

        <div className="flex items-start gap-5">
          {/* Campaign glyph tile */}
          <div
            className={clsx(
              'shrink-0 grid place-items-center rounded-xl ring-1',
              'w-14 h-14 sm:w-16 sm:h-16',
              tint,
              ringCls,
            )}
          >
            <Target className={clsx('w-6 h-6 sm:w-7 sm:h-7', textCls)} />
          </div>

          {/* Breadcrumb + title + meta */}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1.5 inline-flex items-center gap-1.5">
              <Link
                to={`/projects/${project.id}`}
                className="hover:text-brand transition-colors normal-case tracking-normal text-body-sm text-fg-muted"
              >
                {project.name}
              </Link>
              <ChevronRight className="w-3 h-3 text-fg-subtle" />
              <span>campaign</span>
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-h1 text-fg leading-tight truncate">
                {campaign.name}
              </h1>
              <StatusPill status={status} />
            </div>

            <p className="text-body-base text-fg-muted mt-2 max-w-2xl leading-relaxed">
              {campaign.objective || (
                <span className="italic text-fg-subtle">no objective set</span>
              )}
            </p>

            {(campaign.starts_on || campaign.ends_on || timeSignal) && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {(campaign.starts_on || campaign.ends_on) && (
                  <DateChip starts={campaign.starts_on} ends={campaign.ends_on} />
                )}
                {timeSignal && (
                  <span className="inline-flex items-center h-6 rounded-md border border-border/60 bg-surface-sunken/40 px-2 font-mono text-[11px] text-fg-muted">
                    {timeSignal}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Overflow menu */}
          <div className="shrink-0">
            <CampaignOverflowMenu
              projectId={project.id}
              onArchive={handleArchive}
              archiving={archiving}
            />
          </div>
        </div>

        {/* Faint gradient wash on the right edge */}
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-20 blur-3xl bg-gradient-to-br',
            gradient,
          )}
        />
      </div>

      {err && <div className="mt-3 text-rose-400 text-body-sm">{err}</div>}
    </div>
  );
}

function CampaignOverflowMenu({
  projectId,
  onArchive,
  archiving,
}: {
  projectId: string;
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
        aria-label="campaign actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid place-items-center w-9 h-9 rounded-md text-fg-muted hover:text-fg hover:bg-surface-sunken/40 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-xl border border-border/60 bg-surface-raised/95 backdrop-blur shadow-card overflow-hidden py-1"
        >
          <Link
            to={`/projects/${projectId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-fg hover:bg-surface-sunken/60 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            edit (in project)
          </Link>
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
            {archiving ? 'archiving…' : 'archive campaign'}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Primary investigations tile                                           */
/* -------------------------------------------------------------------- */

function PrimaryInvestigationsTile({
  gradient,
  tint,
  textCls,
  liveSessionCount,
  onNew,
  onOpenLast,
  lastTitle,
  lastAccessed,
}: {
  gradient: string;
  tint: string;
  textCls: string;
  liveSessionCount: number;
  onNew: () => void;
  onOpenLast: (() => void) | undefined;
  lastTitle: string | null;
  lastAccessed: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-6 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <span
            className={clsx(
              'grid place-items-center w-12 h-12 rounded-xl shrink-0',
              tint,
              textCls,
            )}
          >
            <Search className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle mb-1">
              primary surface
            </p>
            <h2 className="font-display font-semibold text-h1 text-fg leading-tight">
              investigations
            </h2>
            <p className="text-body-sm text-fg-muted mt-1.5 max-w-md">
              ask a question, run a play, capture answers grounded in the brand
              context.
              {liveSessionCount > 0 && (
                <>
                  {' '}
                  <span className="text-fg">
                    {liveSessionCount} live in this campaign.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenLast && (
            <button
              type="button"
              onClick={onOpenLast}
              className="inline-flex flex-col items-start h-11 px-3.5 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 transition-colors text-left"
              title={lastTitle || 'open last investigation'}
            >
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-fg-subtle leading-none">
                last
              </span>
              <span className="text-body-sm text-fg truncate max-w-[180px]">
                {lastTitle || 'untitled'}
                {lastAccessed && (
                  <span className="text-fg-subtle ml-1.5">
                    · {formatRelative(lastAccessed)}
                  </span>
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className={clsx(
              'inline-flex items-center gap-1.5 h-11 px-4 rounded-md text-white text-body-sm font-medium',
              'bg-gradient-to-br shadow-card hover:brightness-110 active:scale-[0.99] transition',
              gradient,
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            new investigation
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Secondary tile                                                        */
/* -------------------------------------------------------------------- */

function SecondaryTile({
  to,
  icon,
  title,
  subtitle,
  tint,
  textCls,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tint: string;
  textCls: string;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 hover:border-border transition-colors p-4 flex items-center gap-3"
    >
      <span
        className={clsx(
          'grid place-items-center w-10 h-10 rounded-lg shrink-0',
          tint,
          textCls,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display font-semibold text-fg text-body-base leading-tight">
          {title}
        </h3>
        <p className="text-body-sm text-fg-muted truncate">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-fg group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

/* -------------------------------------------------------------------- */
/* Recent investigations                                                 */
/* -------------------------------------------------------------------- */

function RecentInvestigationsSection({
  sessions,
  toolBase,
  strip,
  gradient,
  onCreate,
}: {
  sessions: SessionListItem[];
  toolBase: string;
  strip: string;
  gradient: string;
  onCreate: () => void;
}) {
  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-h2 text-fg">
          recent investigations
        </h2>
        {sessions.length > 0 && (
          <Link
            to={`${toolBase}/investigations`}
            className="inline-flex items-center gap-1 text-body-sm text-fg-subtle hover:text-fg"
          >
            open all
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </header>

      {sessions.length === 0 ? (
        <EmptyInvestigations gradient={gradient} onCreate={onCreate} />
      ) : (
        <ul className="space-y-2">
          {sessions.slice(0, 8).map(s => (
            <SessionRow
              key={s.id}
              session={s}
              toolBase={toolBase}
              stripClass={strip}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionRow({
  session,
  toolBase,
  stripClass,
}: {
  session: SessionListItem;
  toolBase: string;
  stripClass: string;
}) {
  return (
    <li>
      <Link
        to={`${toolBase}/investigations/${session.id}`}
        className="relative block rounded-xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 hover:border-border transition-colors pl-5 pr-4 py-3.5 overflow-hidden"
      >
        <span
          aria-hidden
          className={clsx(
            'absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full opacity-70',
            stripClass,
          )}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-fg font-medium truncate">
              {session.title || 'untitled investigation'}
            </div>
            {session.last_message_excerpt && (
              <p className="text-body-sm text-fg-muted line-clamp-1 mt-0.5">
                {session.last_message_excerpt}
              </p>
            )}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle whitespace-nowrap pt-0.5">
            {formatRelative(session.last_accessed_at)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function EmptyInvestigations({
  gradient,
  onCreate,
}: {
  gradient: string;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 px-8 py-12 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
        investigations
      </p>
      <h3 className="font-display text-h2 text-fg mb-2">
        no investigations yet
      </h3>
      <p className="text-body-sm text-fg-muted max-w-md mx-auto mb-6">
        start one to ask questions, run a play, or work an answer to a brief — every
        turn is grounded in the campaign's brand context.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className={clsx(
          'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-white text-body-sm font-medium',
          'bg-gradient-to-br shadow-card hover:brightness-110 active:scale-[0.99] transition',
          gradient,
        )}
      >
        <Plus className="w-3.5 h-3.5" />
        start first investigation
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Status + helpers                                                      */
/* -------------------------------------------------------------------- */

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
        'inline-flex items-center gap-1.5 h-6 px-2 rounded font-mono text-[10px] uppercase tracking-[0.12em] border',
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
    <span className="inline-flex items-center gap-1.5 h-6 rounded-md border border-border/60 bg-surface-sunken/40 px-2 font-mono text-[11px] text-fg-subtle">
      <Calendar className="w-3 h-3" />
      {text}
    </span>
  );
}

function NotFound({
  message,
  backTo,
  backLabel,
}: {
  message: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-8 text-center">
      <p className="text-fg-muted mb-3">{message}</p>
      <Link to={backTo} className="text-brand hover:underline text-body-sm">
        {backLabel}
      </Link>
    </div>
  );
}

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
  return new Date(isoDate).toLocaleDateString();
}

function formatDateWindow(
  starts: string | null,
  ends: string | null,
): string {
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

/** Operational time signal derived from `starts_on` / `ends_on`.
 *  - both set + in-window  → "day X of Y"
 *  - both set + before     → "starts in Xd"
 *  - both set + after      → "ended Xd ago"
 *  - only ends_on + future → "ends in Xd"
 *  - only starts_on        → "running Xd"
 *  - neither               → null
 */
function computeTimeSignal(c: CampaignSummary): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startsMs = c.starts_on ? Date.parse(c.starts_on) : null;
  const endsMs = c.ends_on ? Date.parse(c.ends_on) : null;
  const ONE_DAY = 86_400_000;

  if (startsMs != null && endsMs != null) {
    const totalDays = Math.max(1, Math.round((endsMs - startsMs) / ONE_DAY) + 1);
    if (today.getTime() < startsMs) {
      const inDays = Math.round((startsMs - today.getTime()) / ONE_DAY);
      return `starts in ${inDays}d`;
    }
    if (today.getTime() > endsMs) {
      const agoDays = Math.round((today.getTime() - endsMs) / ONE_DAY);
      return `ended ${agoDays}d ago`;
    }
    const dayN = Math.round((today.getTime() - startsMs) / ONE_DAY) + 1;
    return `day ${dayN} of ${totalDays}`;
  }
  if (endsMs != null) {
    if (today.getTime() > endsMs) {
      const agoDays = Math.round((today.getTime() - endsMs) / ONE_DAY);
      return `ended ${agoDays}d ago`;
    }
    const inDays = Math.round((endsMs - today.getTime()) / ONE_DAY);
    return `ends in ${inDays}d`;
  }
  if (startsMs != null) {
    if (today.getTime() < startsMs) {
      const inDays = Math.round((startsMs - today.getTime()) / ONE_DAY);
      return `starts in ${inDays}d`;
    }
    const dayN = Math.round((today.getTime() - startsMs) / ONE_DAY) + 1;
    return `running ${dayN}d`;
  }
  return null;
}
