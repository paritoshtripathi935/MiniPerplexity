/**
 * Videos drawer (PAI-14).
 *
 * Right-side slide-over that shows every YouTube source surfaced across
 * the current investigation. Opens from the "videos · N" chip in the
 * chat header — replaces the always-visible Videos panel in the old
 * right rail. Users who don't want videos pay zero pixels for them; users
 * who do get a larger, easier-to-scan grid.
 *
 * Same animation/dismissal pattern as CitationDrawer (Esc to close,
 * backdrop click, slide-in-right). Uses the YouTube oEmbed thumbnail
 * URL convention — no extra API call, no auth required.
 */
import { useEffect, useMemo } from 'react';
import { ExternalLink, Youtube, X } from 'lucide-react';
import type { Message, MessageSearchResult } from '../types';

interface Video {
  url: string;
  title: string;
  videoId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: Message[];
}

export function VideosDrawer({ open, onClose, messages }: Props) {
  const videos = useMemo(() => collectVideos(messages), [messages]);

  // Esc closes — mirrors CitationDrawer's keyboard handling.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="close videos"
        onClick={onClose}
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label="videos referenced in this investigation"
        className="relative w-full max-w-[520px] h-full bg-surface-raised/95 backdrop-blur-md border-l border-border/60 flex flex-col motion-safe:animate-slide-in-right"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1.5 inline-flex items-center gap-2">
              <Youtube className="w-3.5 h-3.5" />
              videos
              <span className="text-fg-subtle">· {videos.length}</span>
            </p>
            <h2 className="text-h2 font-display font-semibold text-fg leading-snug">
              referenced in this investigation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 shrink-0"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {videos.length === 0 ? (
            <p className="text-body-sm text-fg-subtle italic">
              no videos surfaced for this investigation yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videos.map(v => (
                <li key={v.url}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={v.title}
                    className="group block"
                  >
                    <div className="aspect-video rounded-lg overflow-hidden bg-surface-sunken border border-border/60 group-hover:border-brand/40 transition-colors">
                      <img
                        src={`https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-start gap-1.5">
                      <p className="text-body-sm text-fg leading-snug line-clamp-2 flex-1">
                        {v.title}
                      </p>
                      <ExternalLink className="w-3 h-3 text-fg-subtle/60 mt-1 shrink-0 group-hover:text-fg-subtle" />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/* --------------------------- Aggregation -------------------------------- */

export function collectVideos(messages: Message[]): Video[] {
  const map = new Map<string, Video>();
  // Walk newest → oldest so the most recent assistant turns surface
  // first in the grid (matches the user's mental model — "what just
  // came in").
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== 'assistant') continue;
    for (const r of (m.search_results ?? []) as MessageSearchResult[]) {
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
