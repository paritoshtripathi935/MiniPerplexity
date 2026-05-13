/**
 * /projects/:projectId/c/:campaignId — campaign home.
 *
 * Launching pad for the campaign's "do work" surfaces. Quick-access
 * tiles for investigations, plays, and calculators; recent sessions
 * within this campaign listed underneath. Clicking a tile sets the
 * active-campaign localStorage so the global tool routes
 * (/investigations, /plays, /calc) pick up the right scope, then
 * navigates into that route.
 *
 * Pattern: this page is the canonical "I'm working inside Q4 holiday
 * push for Allbirds" surface. Top-nav switcher lands you at the project
 * home (campaigns grid); you pick a campaign here and the tiles take
 * you into the tools.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Calculator,
  ChevronRight,
  Edit3,
  PlayCircle,
  Plus,
  Search,
  Target,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { PageHeader } from '../components/AppLayout';
import {
  projectColor,
  useActiveCampaign,
  useSwapActiveContext,
} from '../components/ActiveCampaign';
import {
  listCampaigns,
  type CampaignSummary,
  type ProjectSummary,
  type SessionListItem,
} from '../services/api';
import { useProjects, useSessions } from '../services/queries';

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

  // Campaigns for the project — fetched once on mount, also keyed by the
  // useActiveCampaign cache when this is the active project (so we don't
  // double-fetch in the common case).
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

  // On mount, sync the active-campaign localStorage to this URL — keeps
  // the top-nav switcher and the global /investigations etc. routes
  // pointing at the campaign the user is actually working in.
  useEffect(() => {
    if (projectId && campaignId) swap(projectId, campaignId);
  }, [projectId, campaignId, swap]);

  // Sessions for this campaign — the "recent investigations" feed.
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

  function enter(path: string) {
    // Active-campaign localStorage is already in sync via the mount
    // effect, so the destination route reads the right scope.
    navigate(path);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb project={project} campaign={campaign} dotClass={color.dot} />
        }
        title={campaign.name}
        subtitle={
          <span className="text-fg-muted">
            {campaign.objective ? (
              <>{campaign.objective}</>
            ) : (
              <span className="italic text-fg-subtle">no objective set</span>
            )}
            {(campaign.starts_on || campaign.ends_on) && (
              <span className="ml-3 font-mono text-fg-subtle">
                {formatDateWindow(campaign.starts_on, campaign.ends_on)}
              </span>
            )}
          </span>
        }
        actions={
          <Link
            to={`/projects/${project.id}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            edit campaign
          </Link>
        }
      />

      {/* Quick-action tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <ToolTile
          icon={<Search className="w-5 h-5" />}
          title="investigations"
          subtitle="ask questions, run plays, capture answers"
          metric={`${sessions.filter(s => !s.is_archived).length} live`}
          onClick={() => enter(`/investigations/${uuidv4()}`)}
          ctaLabel="new investigation"
          ctaIcon={<Plus className="w-3.5 h-3.5" />}
          secondaryLabel={sessions.length > 0 ? 'open last' : null}
          onSecondary={
            sessions.length > 0
              ? () => enter(`/investigations/${sessions[0].id}`)
              : undefined
          }
        />
        <ToolTile
          icon={<PlayCircle className="w-5 h-5" />}
          title="plays"
          subtitle="catalog of ready-to-run growth plays"
          onClick={() => enter('/plays')}
          ctaLabel="open plays"
          ctaIcon={<ChevronRight className="w-3.5 h-3.5" />}
        />
        <ToolTile
          icon={<Calculator className="w-5 h-5" />}
          title="calculators"
          subtitle="CAC payback, ROAS, A/B, channel mix"
          onClick={() => enter('/calc')}
          ctaLabel="open calculators"
          ctaIcon={<ChevronRight className="w-3.5 h-3.5" />}
        />
      </div>

      {/* Recent sessions within this campaign */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-h2 text-fg">
            recent investigations
          </h2>
          {sessions.length > 0 && (
            <Link
              to="/investigations"
              className="inline-flex items-center gap-1 text-body-sm text-fg-subtle hover:text-fg"
            >
              open all
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </header>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface-raised/30 p-10 text-center">
            <Target className="w-5 h-5 text-fg-subtle mx-auto mb-2" />
            <p className="text-fg-muted text-body-base mb-1">
              no investigations yet in this campaign
            </p>
            <p className="text-body-sm text-fg-subtle">
              start one with the tile above.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.slice(0, 8).map(s => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Bits                                                                  */
/* -------------------------------------------------------------------- */

function Breadcrumb({
  project,
  campaign,
  dotClass,
}: {
  project: ProjectSummary;
  campaign: CampaignSummary;
  dotClass: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full', dotClass)} />
      <Link
        to={`/projects/${project.id}`}
        className="text-brand/80 hover:text-brand"
      >
        {project.name}
      </Link>
      <ChevronRight className="w-3 h-3 text-fg-subtle" />
      <span className="text-fg-subtle">campaign</span>
    </span>
  );
}

function ToolTile({
  icon,
  title,
  subtitle,
  metric,
  onClick,
  ctaLabel,
  ctaIcon,
  secondaryLabel,
  onSecondary,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  metric?: string;
  onClick: () => void;
  ctaLabel: string;
  ctaIcon: React.ReactNode;
  secondaryLabel?: string | null;
  onSecondary?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <span className="grid place-items-center w-10 h-10 rounded-lg bg-brand/15 text-brand">
          {icon}
        </span>
        {metric && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
            {metric}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="font-display font-semibold text-fg text-h2 mb-1 lowercase">
          {title}
        </h3>
        <p className="text-body-sm text-fg-muted leading-relaxed">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow"
        >
          {ctaIcon}
          {ctaLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="h-9 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionListItem }) {
  return (
    <li>
      <Link
        to={`/investigations/${session.id}`}
        className="block rounded-xl border border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors p-4"
      >
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
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle whitespace-nowrap">
            {formatRelative(session.last_accessed_at)}
          </span>
        </div>
      </Link>
    </li>
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
