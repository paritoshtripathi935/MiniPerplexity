/**
 * /projects/:projectId/c/:campaignId — campaign home.
 *
 * Compact header → 4-up tile grid (investigations is the first card with
 * the brand-gradient CTA inside; plays / calculators / creatives are
 * whole-card links) → recent investigations feed.
 *
 * Project color appears as a whisper: 4px header strip, breadcrumb dot,
 * session-row strips. The marquee gradient stays brand violet→blue.
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
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/Button';
import {
  projectColor,
  projectStrip,
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
  const strip = projectStrip(color.dot);

  const toolBase = `/projects/${projectId}/c/${campaignId}`;
  const liveSessionCount = sessions.filter(s => !s.is_archived).length;
  const lastSession = sessions[0] ?? null;

  return (
    <>
      <CampaignIdentityHeader
        project={project}
        campaign={campaign}
        strip={strip}
        dotClass={color.dot}
        onAfterArchive={() => navigate(`/projects/${project.id}`)}
      />

      {/* 5-up tile grid — investigations leads with the gradient CTA;
          plays / calc / studio / creatives are whole-card secondary
          links. On smaller screens this stacks to 2 / 1 columns. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <InvestigationsTile
          liveSessionCount={liveSessionCount}
          onNew={() => navigate(`${toolBase}/investigations/${uuidv4()}`)}
          lastSession={lastSession}
          onOpenLast={
            lastSession
              ? () => navigate(`${toolBase}/investigations/${lastSession.id}`)
              : undefined
          }
        />
        <SecondaryTile
          to={`${toolBase}/plays`}
          icon={<PlayCircle className="w-4 h-4" />}
          title="plays"
          subtitle="ready-to-run growth plays"
        />
        <SecondaryTile
          to={`${toolBase}/calc`}
          icon={<Calculator className="w-4 h-4" />}
          title="calculators"
          subtitle="CAC payback, ROAS, A/B, mix"
        />
        <SecondaryTile
          to={`${toolBase}/studio`}
          icon={<Wand2 className="w-4 h-4" />}
          title="studio"
          subtitle="generate ad creatives"
        />
        <SecondaryTile
          to={`${toolBase}/creatives`}
          icon={<ImageIcon className="w-4 h-4" />}
          title="creatives"
          subtitle="pdf + image library"
        />
      </div>

      <RecentInvestigationsSection
        sessions={sessions}
        toolBase={toolBase}
        strip={strip}
        onCreate={() => navigate(`${toolBase}/investigations/${uuidv4()}`)}
      />
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Header — compact: breadcrumb + title + chip strip + overflow menu     */
/* -------------------------------------------------------------------- */

function CampaignIdentityHeader({
  project,
  campaign,
  strip,
  dotClass,
  onAfterArchive,
}: {
  project: ProjectSummary;
  campaign: CampaignSummary;
  strip: string;
  dotClass: string;
  onAfterArchive: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = campaignStatus(campaign);
  const timeSignal = computeTimeSignal(campaign);
  const hasDateChip = !!(campaign.starts_on || campaign.ends_on);

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
      <div className="relative rounded-2xl border border-border/60 bg-surface-raised/40 pl-5 pr-3 py-4">
        <span aria-hidden className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl', strip)} />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb */}
            <p className="text-body-sm text-fg-muted inline-flex items-center gap-1.5 mb-1.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full', dotClass)} />
              <Link to={`/projects/${project.id}`} className="hover:text-fg transition-colors">
                {project.name}
              </Link>
              <ChevronRight className="w-3 h-3 text-fg-subtle" />
              <span className="text-fg-subtle">campaign</span>
            </p>

            {/* Title */}
            <h1 className="font-display text-h1 text-fg leading-tight truncate">
              {campaign.name}
            </h1>

            {/* Objective — single line, italic if empty */}
            <p className="text-body-sm text-fg-muted mt-1.5 line-clamp-1 max-w-2xl">
              {campaign.objective || (
                <span className="italic text-fg-subtle">no objective set</span>
              )}
            </p>

            {/* Chip strip: status + dates + time-signal */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <StatusPill status={status} />
              {hasDateChip && (
                <DateChip starts={campaign.starts_on} ends={campaign.ends_on} />
              )}
              {timeSignal && (
                <span className="inline-flex items-center h-6 rounded-md border border-border/60 bg-surface-sunken/40 px-2 font-mono text-[11px] text-fg-muted">
                  {timeSignal}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <CampaignOverflowMenu
              projectId={project.id}
              onArchive={handleArchive}
              archiving={archiving}
            />
          </div>
        </div>
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
        className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 transition-colors"
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
/* Tiles                                                                 */
/* -------------------------------------------------------------------- */

function InvestigationsTile({
  liveSessionCount,
  onNew,
  lastSession,
  onOpenLast,
}: {
  liveSessionCount: number;
  onNew: () => void;
  lastSession: SessionListItem | null;
  onOpenLast: (() => void) | undefined;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/15 text-brand">
          <Search className="w-4 h-4" />
        </span>
        {liveSessionCount > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
            {liveSessionCount} live
          </span>
        )}
      </div>

      <h3 className="font-display font-semibold text-fg text-body-base mb-0.5">
        investigations
      </h3>
      <p className="text-body-sm text-fg-muted leading-relaxed mb-4">
        ask a question, run a play, capture answers.
      </p>

      <div className="mt-auto flex flex-col gap-1.5">
        <Button
          variant="gradient"
          size="sm"
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={onNew}
          className="w-full"
        >
          new investigation
        </Button>
        {onOpenLast && lastSession && (
          <button
            type="button"
            onClick={onOpenLast}
            title={lastSession.title || 'open last investigation'}
            className="text-body-sm text-fg-muted hover:text-fg transition-colors truncate text-left px-1"
          >
            <span className="text-fg-subtle">last: </span>
            {lastSession.title || 'untitled'}
          </button>
        )}
      </div>
    </div>
  );
}

function SecondaryTile({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 hover:border-border transition-colors p-4 flex flex-col h-full"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-surface-sunken/60 text-fg-muted group-hover:text-fg transition-colors">
          {icon}
        </span>
        <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-fg group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="font-display font-semibold text-fg text-body-base mb-0.5">
        {title}
      </h3>
      <p className="text-body-sm text-fg-muted leading-relaxed">{subtitle}</p>
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
  onCreate,
}: {
  sessions: SessionListItem[];
  toolBase: string;
  strip: string;
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
        <EmptyInvestigations onCreate={onCreate} />
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
        className="relative block rounded-xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 hover:border-border transition-colors pl-5 pr-4 py-3 overflow-hidden"
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

function EmptyInvestigations({ onCreate }: { onCreate: () => void }) {
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
      <Button
        variant="gradient"
        leadingIcon={<Plus className="w-3.5 h-3.5" />}
        onClick={onCreate}
      >
        start first investigation
      </Button>
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
