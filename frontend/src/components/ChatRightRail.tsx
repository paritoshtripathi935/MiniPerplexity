import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Sparkles, ChevronRight, ShieldCheck } from 'lucide-react';
import type { BrandProfile, Play } from '../services/api';
import type { Message } from '../types';
import { getDomain } from '../utils/url';

interface Props {
  profile: BrandProfile | null;
  /** The play whose `originatingPlayId` is set on the latest assistant turn,
   * or the slash-selected play queued for the next run. Either is fine —
   * the rail just labels what context is active. */
  activePlay: Play | null;
  messages: Message[];
}

/**
 * Right-side context panel for the chat. Surfaces what's *loaded* — brand
 * profile, the active play (if any), and the aggregated sources cited so far
 * in the conversation. Hidden under `lg:` because the chat already has a
 * left sidebar.
 */
export function ChatRightRail({ profile, activePlay, messages }: Props) {
  const aggregatedSources = useMemo(() => collectSources(messages), [messages]);

  // Empty rail when there's nothing meaningful to show.
  if (!profile?.onboarding_completed && !activePlay && aggregatedSources.length === 0) {
    return (
      <div className="hidden lg:flex flex-col w-72 shrink-0 border-l border-border bg-surface px-4 py-6 overflow-y-auto">
        <EmptyRail />
      </div>
    );
  }

  return (
    <div className="hidden lg:flex flex-col w-72 shrink-0 border-l border-border bg-surface px-4 py-6 overflow-y-auto gap-5">
      {profile?.onboarding_completed && <BrandPanel profile={profile} />}
      {activePlay && <ActivePlayPanel play={activePlay} />}
      {aggregatedSources.length > 0 && (
        <SourcesPanel sources={aggregatedSources} />
      )}
    </div>
  );
}

function EmptyRail() {
  return (
    <div className="text-[12px] text-fg-subtle leading-relaxed">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2">
        Context
      </div>
      <p>
        Brand profile, the active play, and cited sources will appear here as the
        conversation builds.
      </p>
      <Link
        to="/settings"
        className="mt-3 inline-flex items-center gap-1 text-brand text-[12px] font-medium hover:underline"
      >
        Set up brand profile
        <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
      </Link>
    </div>
  );
}

function BrandPanel({ profile }: { profile: BrandProfile }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle">
          Brand context
        </h3>
        <Link
          to="/settings"
          className="text-[11px] text-brand hover:underline"
        >
          Edit
        </Link>
      </div>
      <dl className="text-[12.5px] space-y-1.5">
        {profile.company_name && <Row label="Company" value={profile.company_name} />}
        {profile.primary_channels?.length > 0 && (
          <Row label="Channels" value={profile.primary_channels.slice(0, 4).join(', ')} />
        )}
        {profile.target_cac != null && (
          <Row label="Target CAC" value={`$${Number(profile.target_cac).toLocaleString()}`} />
        )}
        {profile.target_roas != null && (
          <Row label="Target ROAS" value={`${profile.target_roas}×`} />
        )}
      </dl>
      {profile.icp_description && (
        <p className="mt-2 pt-2 border-t border-border/60 text-[12px] text-fg-muted leading-relaxed line-clamp-3">
          {profile.icp_description}
        </p>
      )}
    </section>
  );
}

function ActivePlayPanel({ play }: { play: Play }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2">
        Active play
      </h3>
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-brand-subtle/40 border border-brand-subtle">
        <span className="grid place-items-center w-7 h-7 rounded-md bg-brand text-brand-fg shrink-0">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg leading-tight">
            {play.title}
          </div>
          <div className="text-[11px] text-fg-muted mt-0.5 leading-snug line-clamp-2">
            {play.description}
          </div>
        </div>
      </div>
    </section>
  );
}

interface AggregatedSource {
  url: string;
  title: string;
  domain: string;
  authoritative: boolean;
  count: number;
}

function collectSources(messages: Message[]): AggregatedSource[] {
  const map = new Map<string, AggregatedSource>();
  for (const m of messages) {
    if (m.type !== 'assistant') continue;
    for (const r of m.search_results ?? []) {
      if (!r.source || r.type === 'youtube') continue;
      const url = r.source;
      const existing = map.get(url);
      if (existing) {
        existing.count += 1;
        continue;
      }
      map.set(url, {
        url,
        title: r.title || url,
        domain: getDomain(url),
        authoritative: !!r._authoritative,
        count: 1,
      });
    }
  }
  // Authoritative first, then by frequency.
  return Array.from(map.values()).sort((a, b) => {
    if (a.authoritative !== b.authoritative) return a.authoritative ? -1 : 1;
    return b.count - a.count;
  });
}

function SourcesPanel({ sources }: { sources: AggregatedSource[] }) {
  const authoritativeCount = sources.filter(s => s.authoritative).length;
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle">
          Cited sources · {sources.length}
        </h3>
        {authoritativeCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] font-semibold text-brand">
            <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
            {authoritativeCount}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {sources.slice(0, 12).map(s => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="group flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-surface-sunken transition-colors text-[12px]"
            >
              <span className="inline-block w-3.5 h-3.5 rounded-sm overflow-hidden bg-border shrink-0">
                <img
                  src={`https://www.google.com/s2/favicons?sz=32&domain=${s.domain}`}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </span>
              <span className="truncate text-fg flex-1">{s.domain}</span>
              {s.authoritative && (
                <ShieldCheck
                  className="w-3 h-3 text-brand shrink-0"
                  strokeWidth={2.5}
                  aria-label="Authoritative source"
                />
              )}
              <ExternalLink className="w-3 h-3 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          </li>
        ))}
        {sources.length > 12 && (
          <li className="text-[11px] text-fg-subtle px-2 pt-1">
            +{sources.length - 12} more in conversation
          </li>
        )}
      </ul>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-subtle text-[11.5px] shrink-0">{label}</dt>
      <dd className="font-medium text-right truncate text-fg">{value}</dd>
    </div>
  );
}
