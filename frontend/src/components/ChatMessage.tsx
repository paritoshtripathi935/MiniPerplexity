import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUser } from '@clerk/clerk-react';
import { Check, Copy, ExternalLink, Youtube } from 'lucide-react';
import clsx from 'clsx';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  /** Kept for back-compat with the page; tokens swap via .dark on <html>. */
  darkMode?: boolean;
}

/**
 * Document-style chat message.
 *
 * Design notes (post-redesign):
 * - No chat bubbles. User turn renders as a small typographic lead-in;
 *   assistant turn renders as a full-width article.
 * - No generic <Bot /> avatar. Authorship is conveyed by typography +
 *   role badge ("You" / "Assistant"), not iconography.
 * - Sources collapse into a compact strip (favicon + domain + title)
 *   below the answer; videos render in their own tighter strip.
 * - Copy button on assistant turns; nothing else lives in the actions
 *   row yet — leaves room for regenerate / share later.
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const { user } = useUser();
  const isAssistant = message.type === 'assistant';
  const isSearching = message.isSearching;

  if (!isAssistant) {
    return <UserTurn name={user?.fullName || 'You'} content={message.content} />;
  }

  return (
    <AssistantTurn
      content={message.content}
      isSearching={!!isSearching}
      sources={message.sources}
      searchResults={message.search_results}
    />
  );
}

// ---------- User turn ------------------------------------------------------
function UserTurn({ name, content }: { name: string; content: string }) {
  return (
    <div className="group">
      <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-1.5">
        {name}
      </div>
      <div className="text-[15px] text-fg leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

// ---------- Assistant turn -------------------------------------------------
function AssistantTurn({
  content,
  isSearching,
  sources,
  searchResults,
}: {
  content: string;
  isSearching: boolean;
  sources?: Message['sources'];
  searchResults?: Message['search_results'];
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const webSources = useMemo(() => {
    const set = new Map<string, { url: string; title: string }>();
    // Prefer the rich `search_results` (has titles) but fall back to `sources`
    // (URL-only, e.g. citations array) so we always show something.
    for (const r of searchResults ?? []) {
      if (r.type !== 'youtube' && r.source && !set.has(r.source)) {
        set.set(r.source, { url: r.source, title: r.title || r.source });
      }
    }
    for (const s of sources ?? []) {
      if (s.url && !set.has(s.url)) {
        set.set(s.url, { url: s.url, title: s.title || s.url });
      }
    }
    return Array.from(set.values());
  }, [sources, searchResults]);

  const videos = useMemo(
    () => (searchResults ?? []).filter(r => r.type === 'youtube'),
    [searchResults]
  );

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-subtle">
          PaidPilot
        </span>
        {isSearching && <SearchingDot />}
      </div>

      <article
        className="
          prose prose-sm max-w-none text-fg
          prose-headings:font-display prose-headings:tracking-tight prose-headings:text-fg
          prose-h1:text-[20px] prose-h1:mt-0 prose-h2:text-[16px] prose-h3:text-[14px]
          prose-p:leading-[1.7] prose-p:text-[15px] prose-p:text-fg
          prose-strong:text-fg prose-strong:font-semibold
          prose-a:text-brand prose-a:no-underline hover:prose-a:underline
          prose-code:bg-surface-sunken prose-code:text-fg prose-code:px-1 prose-code:py-0.5
          prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono
          prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-surface-sunken prose-pre:border prose-pre:border-border
          prose-pre:rounded-md prose-pre:text-[13px]
          prose-li:text-[15px] prose-li:leading-relaxed
          prose-blockquote:border-l-2 prose-blockquote:border-brand
          prose-blockquote:bg-brand-subtle/30 prose-blockquote:py-0.5
          prose-blockquote:px-3 prose-blockquote:not-italic
          prose-hr:border-border
          prose-table:text-[13px]
          prose-th:bg-surface-sunken prose-th:font-semibold
          prose-td:border-border prose-th:border-border
        "
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>

      {webSources.length > 0 && <SourceStrip sources={webSources} />}
      {videos.length > 0 && <VideoStrip videos={videos} />}

      {!isSearching && (
        <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-success" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function SearchingDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-brand opacity-60 animate-ping" />
        <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-brand" />
      </span>
      Searching
    </span>
  );
}

// ---------- Sources --------------------------------------------------------
function getDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return url;
  }
}

function SourceStrip({ sources }: { sources: { url: string; title: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sources : sources.slice(0, 5);

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2">
        Sources · {sources.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s, i) => {
          const domain = getDomain(s.url);
          return (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className={clsx(
                'group/src inline-flex items-center gap-1.5 max-w-[260px] h-7 px-2 rounded-md',
                'text-[12px] bg-surface-sunken hover:bg-surface text-fg-muted hover:text-fg',
                'border border-transparent hover:border-border transition-colors duration-150'
              )}
            >
              <span className="inline-block w-3 h-3 rounded-sm overflow-hidden shrink-0 bg-border">
                <img
                  src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </span>
              <span className="font-medium tabular-nums text-fg-subtle">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="truncate text-fg">{domain}</span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover/src:opacity-100 transition-opacity" />
            </a>
          );
        })}
        {!expanded && sources.length > 5 && (
          <button
            onClick={() => setExpanded(true)}
            className="h-7 px-2 rounded-md text-[12px] text-brand hover:underline"
          >
            +{sources.length - 5} more
          </button>
        )}
      </div>
    </div>
  );
}

function VideoStrip({
  videos,
}: {
  videos: NonNullable<Message['search_results']>;
}) {
  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2 flex items-center gap-1.5">
        <Youtube className="w-3 h-3 text-fg-muted" />
        Videos
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
        {videos.map((v, i) => {
          const videoId = (() => {
            try {
              return new URL(v.source).searchParams.get('v') || '';
            } catch {
              return '';
            }
          })();
          if (!videoId) return null;
          return (
            <a
              key={i}
              href={v.source}
              target="_blank"
              rel="noopener noreferrer"
              className="group/v shrink-0 w-[180px]"
            >
              <div className="aspect-video w-full rounded-md overflow-hidden bg-surface-sunken border border-border">
                <img
                  src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                  alt={v.title}
                  className="w-full h-full object-cover group-hover/v:scale-[1.02] transition-transform duration-300 ease-out-expo"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                  }}
                />
              </div>
              <div className="text-[12px] text-fg mt-1.5 line-clamp-2 leading-snug">
                {v.title}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
