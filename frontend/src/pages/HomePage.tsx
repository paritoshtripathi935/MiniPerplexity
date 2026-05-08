import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { ArrowUpRight, Calculator, MessageSquare, Sparkles } from 'lucide-react';
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
          listSessions(getToken, { limit: 5 }).catch(() => ({ sessions: [] as SessionListItem[] })),
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
    const time = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const name = user?.firstName ? `, ${user.firstName}` : '';
    return `Good ${time}${name}`;
  }, [user?.firstName]);

  const quickActions = [
    {
      to: `/chat/${newChatId}`,
      icon: MessageSquare,
      title: 'Start a chat',
      body: 'Ask anything paid-acquisition. Citations weighted toward platform docs and trade press.',
    },
    {
      to: '/plays',
      icon: Sparkles,
      title: 'Run a play',
      body: '10 ready-to-run playbooks — creative briefs, channel plans, A/B specs, weekly reviews.',
    },
    {
      to: '/calc',
      icon: Calculator,
      title: 'Open calculators',
      body: 'CAC payback, ROAS-to-margin, A/B sample size, blended channel efficiency.',
    },
  ];

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          profile?.company_name
            ? `Working on ${profile.company_name} — your brand context is baked into every answer.`
            : 'Welcome to PaidPilot. Ask anything paid-acquisition, run a play, or do the math.'
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        {quickActions.map(a => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="group block focus-visible:outline-none focus-visible:shadow-focus rounded-lg"
            >
              <Card interactive className="p-5 h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="grid place-items-center w-9 h-9 rounded-md bg-surface-sunken text-fg-muted group-hover:bg-brand-subtle group-hover:text-brand transition-colors">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-fg-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
                <h3 className="font-display font-semibold text-[15px] mb-1.5 tracking-tight">
                  {a.title}
                </h3>
                <p className="text-[13px] text-fg-muted leading-relaxed">{a.body}</p>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-[15px] tracking-tight">
              Recent chats
            </h2>
            <Link to="/chat" className="text-[12px] text-brand hover:underline">
              View all
            </Link>
          </div>
          {sessions.length === 0 ? (
            <p className="text-[13px] text-fg-muted">
              No chats yet.{' '}
              <Link to={`/chat/${newChatId}`} className="text-brand hover:underline">
                Start one →
              </Link>
            </p>
          ) : (
            <ul className="-mx-2">
              {sessions.map(s => (
                <li key={s.id}>
                  <Link
                    to={`/chat/${s.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 px-2 rounded-md hover:bg-surface-sunken transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium truncate">
                        {s.title || 'Untitled chat'}
                      </div>
                      <div className="text-[12px] text-fg-subtle mt-0.5">
                        {s.message_count} message{s.message_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-[12px] text-fg-subtle shrink-0 tabular-nums">
                      {relativeTime(s.last_accessed_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-[15px] tracking-tight">Brand</h2>
            <Link to="/settings" className="text-[12px] text-brand hover:underline">
              Edit
            </Link>
          </div>
          {profile?.onboarding_completed ? (
            <dl className="text-[13px] space-y-2.5">
              {profile.company_name && (
                <Row label="Company" value={profile.company_name} />
              )}
              {profile.primary_channels?.length > 0 && (
                <Row label="Channels" value={profile.primary_channels.join(', ')} />
              )}
              {profile.target_cac != null && (
                <Row
                  label="Target CAC"
                  value={`$${Number(profile.target_cac).toLocaleString()}`}
                />
              )}
              {profile.target_roas != null && (
                <Row label="Target ROAS" value={`${profile.target_roas}×`} />
              )}
            </dl>
          ) : (
            <p className="text-[13px] text-fg-muted">
              Finish onboarding to personalise every answer.{' '}
              <Link to="/settings" className="text-brand hover:underline">
                Set up brand profile →
              </Link>
            </p>
          )}
        </Card>
      </section>
    </>
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
