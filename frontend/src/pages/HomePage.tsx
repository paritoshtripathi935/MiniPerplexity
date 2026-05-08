import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Activity, ArrowRight, Calculator, MessageSquare, Settings as SettingsIcon, Sparkles,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  getBrandProfile, listSessions, type BrandProfile, type SessionListItem,
} from '../services/api';
import { PageHeader } from '../components/AppLayout';

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

export function HomePage({ darkMode }: Props) {
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
        // Silent — first-load failures show empty state.
      }
    })();
  }, [getToken]);

  const card = darkMode
    ? 'bg-gray-900 border-gray-800 hover:border-gray-700'
    : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const time = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const name = user?.firstName ? `, ${user.firstName}` : '';
    return `Good ${time}${name}.`;
  }, [user?.firstName]);

  const quickActions: {
    to: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    body: string;
    accent: string;
  }[] = [
    {
      to: `/chat/${newChatId}`,
      icon: MessageSquare,
      title: 'Start a chat',
      body: 'Ask anything paid-acquisition. Sources weighted toward Meta/Google docs, eMarketer, Adweek.',
      accent: 'text-blue-500',
    },
    {
      to: '/plays',
      icon: Sparkles,
      title: 'Run a play',
      body: '10 ready-to-run playbooks — creative briefs, channel plans, A/B specs, weekly reviews.',
      accent: 'text-purple-500',
    },
    {
      to: '/calc',
      icon: Calculator,
      title: 'Open calculators',
      body: 'CAC payback, ROAS-to-margin, A/B sample size, blended channel efficiency.',
      accent: 'text-emerald-500',
    },
  ];

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          profile?.company_name
            ? `Working on ${profile.company_name}. Ask anything paid-acquisition — your brand context is baked into every answer.`
            : "Welcome to PaidPilot. Ask anything paid-acquisition, run a play, or do the math."
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {quickActions.map(a => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className={`group rounded-xl border p-5 transition ${card}`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-6 h-6 ${a.accent}`} />
                <ArrowRight
                  className={`w-4 h-4 ${subtle} transition group-hover:translate-x-1`}
                />
              </div>
              <h3 className="font-semibold mb-1">{a.title}</h3>
              <p className={`text-sm ${subtle}`}>{a.body}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 rounded-xl border p-5 ${card.replace('hover:border-gray-700', '').replace('hover:border-gray-300', '')}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent chats</h2>
            <Link to="/chat" className="text-xs text-blue-500 hover:underline">
              View all →
            </Link>
          </div>
          {sessions.length === 0 ? (
            <p className={`text-sm ${subtle}`}>
              No chats yet. {' '}
              <Link to={`/chat/${newChatId}`} className="text-blue-500 hover:underline">
                Start one →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-current/5">
              {sessions.map(s => (
                <li key={s.id}>
                  <Link
                    to={`/chat/${s.id}`}
                    className={`flex items-center justify-between gap-3 py-2.5 -mx-2 px-2 rounded ${
                      darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {s.title || 'Untitled chat'}
                      </div>
                      <div className={`text-xs ${subtle}`}>
                        {s.message_count} message{s.message_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className={`text-xs ${subtle} shrink-0`}>
                      {relativeTime(s.last_accessed_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`rounded-xl border p-5 ${card.replace('hover:border-gray-700', '').replace('hover:border-gray-300', '')}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Brand</h2>
            <Link to="/settings" className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1">
              Edit <SettingsIcon className="w-3 h-3" />
            </Link>
          </div>
          {profile?.onboarding_completed ? (
            <dl className={`text-sm space-y-2 ${subtle}`}>
              {profile.company_name && (
                <div className="flex justify-between gap-2">
                  <dt>Company</dt>
                  <dd className="text-right truncate max-w-[60%] font-medium">{profile.company_name}</dd>
                </div>
              )}
              {profile.primary_channels?.length > 0 && (
                <div className="flex justify-between gap-2">
                  <dt>Channels</dt>
                  <dd className="text-right font-medium">{profile.primary_channels.join(', ')}</dd>
                </div>
              )}
              {profile.target_cac != null && (
                <div className="flex justify-between gap-2">
                  <dt>Target CAC</dt>
                  <dd className="font-medium">${profile.target_cac.toLocaleString()}</dd>
                </div>
              )}
              {profile.target_roas != null && (
                <div className="flex justify-between gap-2">
                  <dt>Target ROAS</dt>
                  <dd className="font-medium">{profile.target_roas}×</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className={`text-sm ${subtle}`}>
              <Activity className="inline w-4 h-4 mr-1 -mt-0.5" />
              Finish onboarding to personalise every answer.
              <br />
              <Link to="/settings" className="text-blue-500 hover:underline">
                Set up brand profile →
              </Link>
            </p>
          )}
        </div>
      </section>
    </>
  );
}
