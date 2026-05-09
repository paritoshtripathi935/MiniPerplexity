import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ExternalLink, ShieldCheck, Sparkles, Youtube,
} from 'lucide-react';
import clsx from 'clsx';
import type { Play } from '../services/api';
import type { Message } from '../types';
import { getDomain } from '../utils/url';

interface Props {
  /** The play whose context is "loaded" — drives the active-play panel. */
  activePlay: Play | null;
  messages: Message[];
}

type RailMode = 'auto' | 'open' | 'closed';

const STORAGE_KEY = 'paidpilot-chat-rail-mode';
const AUTO_POP_MS = 10_000;
const VIDEO_MAX = 6;
const SOURCE_MAX = 12;

/**
 * Right-side context panel for the chat. Shows the active play, the latest
 * videos, and aggregated sources. Auto-collapses; pops open for AUTO_POP_MS
 * when new sources/videos arrive. Manual toggle persists in localStorage.
 *
 * Hidden under `lg:` because the chat already has a left sidebar.
 */
export function ChatRightRail({ activePlay, messages }: Props) {
  const aggregatedSources = useMemo(() => collectSources(messages), [messages]);
  const aggregatedVideos = useMemo(() => collectVideos(messages), [messages]);

  const [mode, setMode] = useState<RailMode>(() => readMode());
  const expanded = useAutoPop({
    mode,
    sourceCount: aggregatedSources.length,
    videoCount: aggregatedVideos.length,
  });

  const setUserMode = (next: 'open' | 'closed') => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — fall back to in-memory only */
    }
  };

  const totalContent = aggregatedSources.length + aggregatedVideos.length;
  // Don't render at all when there's nothing to show and no active play —
  // the rail is purely informational, no point in floating an empty stub.
  if (!activePlay && totalContent === 0) return null;

  return (
    <aside
      className={clsx(
        'hidden lg:flex flex-col shrink-0 border-l border-border bg-surface',
        'transition-[width] duration-200 ease-out-quad overflow-hidden',
        expanded ? 'w-72' : 'w-10'
      )}
    >
      <RailToggle
        expanded={expanded}
        onToggle={() => setUserMode(expanded ? 'closed' : 'open')}
        sourceCount={aggregatedSources.length}
        videoCount={aggregatedVideos.length}
      />

      {expanded && (
        <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 pt-2 gap-4 animate-fade-in">
          {activePlay && <ActivePlayPanel play={activePlay} />}
          {aggregatedVideos.length > 0 && (
            <VideosPanel videos={aggregatedVideos.slice(0, VIDEO_MAX)} />
          )}
          {aggregatedSources.length > 0 && (
            <SourcesPanel sources={aggregatedSources.slice(0, SOURCE_MAX)} />
          )}
        </div>
      )}
    </aside>
  );
}

/* ---------- Auto-pop logic ---------------------------------------------- */

function readMode(): RailMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'open' || v === 'closed' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

interface AutoPopArgs {
  mode: RailMode;
  sourceCount: number;
  videoCount: number;
}

/**
 * Compute the rail's expanded state. In 'auto' mode, the rail pops open
 * when source/video counts increase, then collapses after AUTO_POP_MS.
 * In 'open'/'closed' modes (user-locked), the auto behaviour is suppressed.
 */
function useAutoPop({ mode, sourceCount, videoCount }: AutoPopArgs): boolean {
  const [popping, setPopping] = useState(false);
  const lastCounts = useRef({ sources: sourceCount, videos: videoCount });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const last = lastCounts.current;
    const grew = sourceCount > last.sources || videoCount > last.videos;
    lastCounts.current = { sources: sourceCount, videos: videoCount };
    if (!grew || mode !== 'auto') return;
    setPopping(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPopping(false), AUTO_POP_MS);
  }, [sourceCount, videoCount, mode]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (mode === 'open') return true;
  if (mode === 'closed') return false;
  return popping;
}

/* ---------- Sub-components ---------------------------------------------- */

function RailToggle({
  expanded,
  onToggle,
  sourceCount,
  videoCount,
}: {
  expanded: boolean;
  onToggle: () => void;
  sourceCount: number;
  videoCount: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 pt-3 pb-2 border-b border-border/60">
      <button
        onClick={onToggle}
        className="grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
        aria-label={expanded ? 'Collapse context panel' : 'Expand context panel'}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? (
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        ) : (
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        )}
      </button>
      {!expanded && (sourceCount + videoCount > 0) && (
        <CollapsedBadges sourceCount={sourceCount} videoCount={videoCount} />
      )}
      {expanded && (
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle pr-1">
          Context
        </span>
      )}
    </div>
  );
}

function CollapsedBadges({
  sourceCount,
  videoCount,
}: {
  sourceCount: number;
  videoCount: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 mt-1 mb-2">
      {videoCount > 0 && (
        <Badge icon={<Youtube className="w-3 h-3" strokeWidth={2} />} value={videoCount} />
      )}
      {sourceCount > 0 && (
        <Badge icon={<ShieldCheck className="w-3 h-3" strokeWidth={2} />} value={sourceCount} />
      )}
    </div>
  );
}

function Badge({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span
      className="grid place-items-center w-7 h-7 rounded-md bg-surface-sunken text-fg-muted text-[10px] font-semibold relative"
      title={`${value} item${value === 1 ? '' : 's'}`}
    >
      {icon}
      <span className="absolute -top-1 -right-1 grid place-items-center min-w-[14px] h-[14px] px-1 rounded-full bg-brand text-brand-fg text-[9px] font-bold tabular-nums">
        {value > 99 ? '99+' : value}
      </span>
    </span>
  );
}

function ActivePlayPanel({ play }: { play: Play }) {
  return (
    <section className="shrink-0">
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
  snippet?: string;
  domain: string;
  authoritative: boolean;
  count: number;
}

interface AggregatedVideo {
  url: string;
  title: string;
  videoId: string;
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
        snippet: r.snippet,
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

function collectVideos(messages: Message[]): AggregatedVideo[] {
  const map = new Map<string, AggregatedVideo>();
  // Walk newest → oldest so the most recent assistant turns surface first
  // (the auto-pop is most useful for "you just got new videos").
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== 'assistant') continue;
    for (const r of m.search_results ?? []) {
      if (r.type !== 'youtube' || !r.source) continue;
      if (map.has(r.source)) continue;
      const id = parseYouTubeId(r.source);
      if (!id) continue;
      map.set(r.source, { url: r.source, title: r.title || r.source, videoId: id });
    }
  }
  return Array.from(map.values());
}

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || u.pathname.split('/').pop() || null;
  } catch {
    return null;
  }
}

function VideosPanel({ videos }: { videos: AggregatedVideo[] }) {
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2 flex items-center gap-1.5 shrink-0">
        <Youtube className="w-3 h-3 text-fg-muted" />
        Videos · {videos.length}
      </h3>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
        {videos.map(v => (
          <a
            key={v.url}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            title={v.title}
            className="group block"
          >
            <div className="aspect-video rounded-md overflow-hidden bg-surface-sunken border border-border">
              <img
                src={`https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`}
                alt={v.title}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300 ease-out-expo"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                }}
              />
            </div>
            <div className="text-[11px] text-fg mt-1 line-clamp-2 leading-snug">
              {v.title}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function SourcesPanel({ sources }: { sources: AggregatedSource[] }) {
  const authoritativeCount = sources.filter(s => s.authoritative).length;
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle">
          Sources · {sources.length}
        </h3>
        {authoritativeCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] font-semibold text-brand"
            title={`${authoritativeCount} authoritative`}
          >
            <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
            {authoritativeCount}
          </span>
        )}
      </div>
      <ul className="space-y-1.5 overflow-y-auto pr-1">
        {sources.map(s => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className={clsx(
                'group flex flex-col gap-1 px-2 py-2 -mx-2 rounded-md',
                'hover:bg-surface-sunken transition-colors',
                s.authoritative && 'border-l-2 border-brand pl-2.5'
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle min-w-0">
                <span className="inline-block w-3 h-3 rounded-sm overflow-hidden bg-border shrink-0">
                  <img
                    src={`https://www.google.com/s2/favicons?sz=32&domain=${s.domain}`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </span>
                <span className="truncate flex-1">{s.domain}</span>
                {s.authoritative && (
                  <ShieldCheck
                    className="w-3 h-3 text-brand shrink-0"
                    strokeWidth={2.5}
                    aria-label="Authoritative source"
                  />
                )}
                <ExternalLink className="w-3 h-3 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <div className="text-[12px] text-fg font-medium leading-snug line-clamp-2">
                {s.title || s.domain}
              </div>
              {s.snippet && (
                <div className="text-[11px] text-fg-muted leading-snug line-clamp-2">
                  {s.snippet}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

