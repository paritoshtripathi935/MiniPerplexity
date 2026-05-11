import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { ArrowRight, ChevronRight, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  getBrandProfile, listSessions, type BrandProfile, type SessionListItem,
} from '../services/api';
import { PageHeader } from '../components/AppLayout';
import { Card } from '../components/ui/Card';

interface Props {
  darkMode: boolean;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

interface PrimaryAction {
  eyebrow: string;
  title: string;
  body: string;
  to: string;
}

/**
 * Choose the single suggested primary action for the home anchor card.
 * Prefers, in order:
 *   1. Resume the most recent active investigation (<24h old, has turns).
 *   2. First-time user nudge: run a foundational play.
 *   3. Day-of-week marketing rituals (Mon = Weekly Review, Fri = Retro).
 *   4. Default: open a fresh investigation.
 */
function pickPrimaryAction(
  sessions: SessionListItem[],
  newChatId: string,
  hasProfile: boolean,
): PrimaryAction {
  const now = Date.now();

  const resumeCandidate = sessions.find(s => {
    const age = now - new Date(s.last_accessed_at).getTime();
    return age < ONE_DAY_MS && s.message_count > 0 && !s.is_archived;
  });
  if (resumeCandidate) {
    const title = resumeCandidate.title?.trim() || 'your last investigation';
    return {
      eyebrow: 'Pick up where you left off',
      title: `Resume · ${title}`,
      body:
        resumeCandidate.last_message_excerpt ||
        `${resumeCandidate.message_count} turn${resumeCandidate.message_count === 1 ? '' : 's'}.`,
      to: `/investigations/${resumeCandidate.id}`,
    };
  }

  if (sessions.length === 0 && hasProfile) {
    return {
      eyebrow: 'Get started',
      title: 'Run your first play',
      body:
        '10 ready-to-run playbooks tuned for paid acquisition — pick a channel plan or a creative brief to see PaidPilot apply your brand context end-to-end.',
      to: '/plays',
    };
  }

  const dow = new Date().getDay(); // 0 Sun – 6 Sat
  if (dow === 1) {
    return {
      eyebrow: "It's Monday",
      title: 'Run your Weekly Review',
      body:
        "Drop in last week's numbers and PaidPilot writes the structured retro a sharp marketer would write for their boss.",
      to: '/plays?run=weekly_review',
    };
  }
  if (dow === 5) {
    return {
      eyebrow: "It's Friday",
      title: 'Wrap the week with a channel-mix check',
      body:
        'Sanity-check your blended efficiency before the weekend — the calculator pulls everything into one view.',
      to: '/calc',
    };
  }
  if (dow === 3) {
    return {
      eyebrow: 'Mid-week',
      title: 'Refresh your creative',
      body:
        'Generate 5 hook variants for your highest-spend ad — vary by emotion to find what unlocks CTR.',
      to: '/plays?run=hook_ideation',
    };
  }

  return {
    eyebrow: 'Ready when you are',
    title: 'Open a new investigation',
    body:
      'Ask what changed, what to test, or what to scale. Citations weighted toward platform docs and trade press; your brand context is applied automatically.',
    to: `/investigations/${newChatId}`,
  };
}

export function HomePage({}: Props) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [newChatId] = useState(() => uuidv4());

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          getBrandProfile(getToken).catch(() => null),
          listSessions(getToken, { limit: 5 }).catch(
            () => ({ sessions: [] as SessionListItem[] }),
          ),
        ]);
        if (p) setProfile(p);
        setSessions(s.sessions);
      } catch {
        /* silent */
      }
    })();
  }, [getToken]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const time =
      hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const name = user?.firstName ? `, ${user.firstName}` : '';
    return `Good ${time}${name}`;
  }, [user?.firstName]);

  const onboarded = !!profile?.onboarding_completed;
  const action = useMemo(
    () => pickPrimaryAction(sessions, newChatId, onboarded),
    [sessions, newChatId, onboarded],
  );

  // Sessions touched in the past 7 days — used by the bottom "this week" strip.
  const sessionsThisWeek = useMemo(() => {
    const cutoff = Date.now() - ONE_WEEK_MS;
    return sessions.filter(s => new Date(s.last_accessed_at).getTime() >= cutoff).length;
  }, [sessions]);

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          onboarded && profile?.company_name
            ? `Working on ${profile.company_name} — your brand context is baked into every answer.`
            : 'Open an investigation, run a play, or do the math.'
        }
        actions={<BrandChip profile={profile} />}
      />

      {/* Anchor card — single primary action. */}
      <section className="mb-4">
        <Link
          to={action.to}
          className="group block focus-visible:outline-none focus-visible:shadow-focus rounded-lg"
        >
          <Card interactive className="p-6 sm:p-7">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle font-medium mb-2">
                  {action.eyebrow}
                </div>
                <h2 className="font-display font-semibold text-[20px] sm:text-[22px] tracking-tight mb-2 leading-tight">
                  {action.title}
                </h2>
                <p className="text-[14px] text-fg-muted leading-relaxed max-w-2xl">
                  {action.body}
                </p>
              </div>
              <div className="shrink-0 grid place-items-center w-10 h-10 rounded-full border border-border text-fg-muted group-hover:border-brand group-hover:text-brand group-hover:bg-brand-subtle transition-colors">
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </div>
            </div>
          </Card>
        </Link>
      </section>

      {/* Secondary breadcrumb — replaces the previous three-card row. */}
      <nav className="mb-10 text-[13px] text-fg-subtle flex items-center gap-2 flex-wrap">
        <span>Or jump to</span>
        <span className="text-fg-subtle/60">·</span>
        <Link to={`/investigations/${newChatId}`} className="hover:text-fg transition-colors">
          Investigations
        </Link>
        <span className="text-fg-subtle/60">·</span>
        <Link to="/plays" className="hover:text-fg transition-colors">
          Plays
        </Link>
        <span className="text-fg-subtle/60">·</span>
        <Link to="/calc" className="hover:text-fg transition-colors">
          Calculators
        </Link>
      </nav>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-[15px] tracking-tight">
              Recent investigations
            </h2>
            <Link to="/investigations" className="text-[12px] text-brand hover:underline">
              View all
            </Link>
          </div>
          {sessions.length === 0 ? (
            <p className="text-[13px] text-fg-muted">
              No investigations yet.{' '}
              <Link to={`/investigations/${newChatId}`} className="text-brand hover:underline">
                Start one →
              </Link>
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-border/60">
              {sessions.map(s => (
                <li key={s.id}>
                  <Link
                    to={`/investigations/${s.id}`}
                    className="block py-3 px-2 rounded-md hover:bg-surface-sunken transition-colors group"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="text-[14px] font-medium truncate min-w-0 flex-1">
                        {s.title || 'Untitled investigation'}
                      </div>
                      <div className="text-[12px] text-fg-subtle shrink-0 tabular-nums">
                        {relativeTime(s.last_accessed_at)}
                      </div>
                    </div>
                    {s.last_message_excerpt ? (
                      <p className="text-[13px] text-fg-muted line-clamp-1 leading-relaxed">
                        {s.last_message_excerpt}
                      </p>
                    ) : (
                      <p className="text-[12px] text-fg-subtle">
                        {s.message_count} turn{s.message_count === 1 ? '' : 's'}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <BrandSnapshot profile={profile} />
      </section>

      <ThisWeekStrip
        chatsThisWeek={sessionsThisWeek}
        totalChats={sessions.length}
        lastActivityIso={sessions[0]?.last_accessed_at ?? null}
      />
    </>
  );
}

/* ---------- subcomponents ------------------------------------------------ */

function BrandChip({ profile }: { profile: BrandProfile | null }) {
  if (!profile?.onboarding_completed) {
    return (
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand-subtle text-brand text-[12px] font-medium hover:bg-brand-subtle/80 transition-colors"
      >
        Set up brand
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      </Link>
    );
  }
  const bits: string[] = [];
  if (profile.company_name) bits.push(profile.company_name);
  if (profile.primary_channels?.length) {
    bits.push(profile.primary_channels.slice(0, 2).join(' + '));
  }
  if (!bits.length) return null;
  return (
    <Link
      to="/settings"
      className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-border bg-surface text-[12px] text-fg-muted hover:text-fg hover:border-border-strong transition-colors max-w-[280px]"
      title="Edit brand profile"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-hidden />
      <span className="truncate">{bits.join(' · ')}</span>
      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-fg-subtle" strokeWidth={2} />
    </Link>
  );
}

function BrandSnapshot({ profile }: { profile: BrandProfile | null }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-[15px] tracking-tight">
          Brand snapshot
        </h2>
        <Link to="/settings" className="text-[12px] text-brand hover:underline">
          Edit
        </Link>
      </div>
      {profile?.onboarding_completed ? (
        <BrandSnapshotFilled profile={profile} />
      ) : (
        <BrandSnapshotProgress profile={profile} />
      )}
    </Card>
  );
}

function BrandSnapshotFilled({ profile }: { profile: BrandProfile }) {
  return (
    <dl className="text-[13px] space-y-2.5">
      {profile.company_name && <Row label="Company" value={profile.company_name} />}
      {profile.primary_channels?.length > 0 && (
        <Row label="Channels" value={profile.primary_channels.join(', ')} />
      )}
      {profile.target_cac != null && (
        <Row label="Target CAC" value={`$${Number(profile.target_cac).toLocaleString()}`} />
      )}
      {profile.target_roas != null && (
        <Row label="Target ROAS" value={`${profile.target_roas}×`} />
      )}
      {profile.icp_description && (
        <div className="pt-2 border-t border-border/60">
          <div className="text-fg-subtle text-[12px] mb-1">ICP</div>
          <p className="text-[13px] text-fg leading-relaxed line-clamp-2">
            {profile.icp_description}
          </p>
        </div>
      )}
    </dl>
  );
}

function BrandSnapshotProgress({ profile }: { profile: BrandProfile | null }) {
  const items: { label: string; done: boolean }[] = [
    { label: 'Company', done: !!profile?.company_name },
    { label: 'Channels', done: !!profile?.primary_channels?.length },
    { label: 'Target CAC', done: profile?.target_cac != null },
    { label: 'Voice', done: !!profile?.voice_guidelines },
  ];
  const filled = items.filter(i => i.done).length;
  const pct = Math.round((filled / items.length) * 100);

  return (
    <div className="text-[13px]">
      <p className="text-fg-muted leading-relaxed mb-3">
        Finish setup so every answer is shaped by your brand context.
      </p>
      <ul className="space-y-1.5 mb-3">
        {items.map(item => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              className={
                item.done
                  ? 'grid place-items-center w-4 h-4 rounded-full bg-brand text-brand-fg shrink-0'
                  : 'w-4 h-4 rounded-full border border-border shrink-0'
              }
              aria-hidden
            >
              {item.done && <Check className="w-3 h-3" strokeWidth={3} />}
            </span>
            <span className={item.done ? 'text-fg' : 'text-fg-subtle'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="h-1 rounded-full bg-surface-sunken overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-brand transition-[width] duration-300 ease-out-quad"
          style={{ width: `${pct}%` }}
        />
      </div>
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-brand text-[13px] font-medium hover:underline"
      >
        Complete setup
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      </Link>
    </div>
  );
}

function ThisWeekStrip({
  chatsThisWeek,
  totalChats,
  lastActivityIso,
}: {
  chatsThisWeek: number;
  totalChats: number;
  lastActivityIso: string | null;
}) {
  if (totalChats === 0) return null;
  const parts: string[] = [];
  parts.push(
    `${chatsThisWeek} investigation${chatsThisWeek === 1 ? '' : 's'} this week`,
  );
  if (lastActivityIso) parts.push(`last active ${relativeTime(lastActivityIso)}`);
  return (
    <Card className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="text-[13px] text-fg-muted flex items-center gap-3 flex-wrap">
        <span className="font-medium text-fg">This week</span>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            <span className="text-fg-subtle/60" aria-hidden>·</span>
            <span>{p}</span>
          </React.Fragment>
        ))}
      </div>
      <Link to="/investigations" className="text-[12px] text-brand hover:underline">
        View all
      </Link>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-right truncate max-w-[60%]">{value}</dd>
    </div>
  );
}
