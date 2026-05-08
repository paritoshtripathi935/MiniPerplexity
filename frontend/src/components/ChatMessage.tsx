import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUser } from '@clerk/clerk-react';
import { Check, Copy, ExternalLink, RotateCw, Youtube } from 'lucide-react';
import clsx from 'clsx';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  /** Kept for back-compat; tokens swap via .dark on <html>. */
  darkMode?: boolean;
  /** Optional regenerate handler — if provided, shows a Regenerate button on assistant turns. */
  onRegenerate?: (msg: Message) => void;
}

/** Document-style chat message with inline citation pills + Copy / Regenerate. */
export function ChatMessage({ message, onRegenerate }: ChatMessageProps) {
  const { user } = useUser();
  if (message.type !== 'assistant') {
    return <UserTurn name={user?.fullName || 'You'} content={message.content} />;
  }
  return (
    <AssistantTurn
      message={message}
      onRegenerate={onRegenerate ? () => onRegenerate(message) : undefined}
    />
  );
}

// ---------- User turn ------------------------------------------------------
function UserTurn({ name, content }: { name: string; content: string }) {
  return (
    <div>
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
  message,
  onRegenerate,
}: {
  message: Message;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isSearching = !!message.isSearching;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  // Source list — preserve search_results order so [N] indices match what
  // the LLM saw in the system prompt's "Sources for this turn" block.
  const orderedSources = useMemo(() => {
    const out: { url: string; title: string; type?: string }[] = [];
    for (const r of message.search_results ?? []) {
      if (r.source) {
        out.push({ url: r.source, title: r.title || r.source, type: r.type });
      }
    }
    if (out.length === 0) {
      // Fallback: bare citations array (URLs only).
      for (const s of message.sources ?? []) {
        if (s.url) out.push({ url: s.url, title: s.title || s.url, type: s.type });
      }
    }
    return out;
  }, [message.search_results, message.sources]);

  const webSources = useMemo(
    () => orderedSources.filter(s => s.type !== 'youtube'),
    [orderedSources]
  );
  const videos = useMemo(
    () => (message.search_results ?? []).filter(r => r.type === 'youtube'),
    [message.search_results]
  );

  const anchorPrefix = `cite-${message.id}`;
  const sourceCount = orderedSources.length;

  // Custom renderers for block elements that walk children and replace
  // [N] / [N, M] markers with anchored superscript pills.
  const components = useMemo(
    () => makeMarkdownComponents(anchorPrefix, sourceCount),
    [anchorPrefix, sourceCount]
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
        <ReactMarkdown components={components}>{message.content}</ReactMarkdown>
      </article>

      {webSources.length > 0 && (
        <SourceStrip sources={webSources} anchorPrefix={anchorPrefix} />
      )}
      {videos.length > 0 && <VideoStrip videos={videos} />}

      {!isSearching && (
        <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          <ActionBtn onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-3 h-3 text-success" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </ActionBtn>
          {onRegenerate && (
            <ActionBtn onClick={onRegenerate}>
              <RotateCw className="w-3 h-3" /> Regenerate
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
    >
      {children}
    </button>
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

// ---------- Citation rendering --------------------------------------------
const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function CitationPill({ n, anchor }: { n: number; anchor: string }) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Brief outline flash so the user can see which source the pill points at.
    el.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-surface');
    setTimeout(
      () =>
        el.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-surface'),
      1200
    );
  };
  return (
    <a
      href={`#${anchor}`}
      onClick={onClick}
      className="inline-flex items-baseline mx-0.5 px-1.5 rounded text-[10px] font-semibold tabular-nums bg-brand-subtle text-brand hover:bg-brand hover:text-brand-fg transition-colors no-underline relative -top-[2px]"
    >
      {n}
    </a>
  );
}

/**
 * Walk a children tree and replace `[N]` (and `[N, M]`) markers in any
 * string descendant with anchored citation pills. Recurses into element
 * children via React.cloneElement so it handles markers nested in <em>,
 * <strong>, <code>, etc. without extra component overrides.
 */
function walkCitations(
  node: React.ReactNode,
  anchorPrefix: string,
  max: number,
  keyBase: string
): React.ReactNode {
  if (typeof node === 'string') {
    if (!node.includes('[')) return node;
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(node)) !== null) {
      const nums = m[1]
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= max);
      if (nums.length === 0) continue; // out-of-range, leave as plain text
      if (m.index > last) out.push(node.slice(last, m.index));
      nums.forEach((n, i) => {
        out.push(
          <CitationPill key={`${keyBase}-${m!.index}-${i}`} n={n} anchor={`${anchorPrefix}-${n}`} />
        );
      });
      last = m.index + m[0].length;
    }
    if (out.length === 0) return node;
    if (last < node.length) out.push(node.slice(last));
    return out;
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <React.Fragment key={`${keyBase}-${i}`}>
        {walkCitations(c, anchorPrefix, max, `${keyBase}-${i}`)}
      </React.Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    // Don't walk into <a> — react-markdown already produced these from real
    // markdown links and we don't want false-positive `[N]` matches inside.
    if (node.type === 'a') return node;
    const childProps = node.props as { children?: React.ReactNode };
    return React.cloneElement(
      node,
      undefined,
      walkCitations(childProps.children, anchorPrefix, max, `${keyBase}-c`)
    );
  }
  return node;
}

function makeMarkdownComponents(anchorPrefix: string, max: number) {
  if (max === 0) return undefined; // no citations possible — fast path
  const wrap = (Tag: keyof JSX.IntrinsicElements) =>
    function WrappedTag({ children, node, ...rest }: any) {
      return React.createElement(
        Tag,
        rest,
        walkCitations(children, anchorPrefix, max, `${Tag}`)
      );
    };
  return {
    p: wrap('p'),
    li: wrap('li'),
    td: wrap('td'),
    th: wrap('th'),
    h1: wrap('h1'),
    h2: wrap('h2'),
    h3: wrap('h3'),
    h4: wrap('h4'),
    blockquote: wrap('blockquote'),
  };
}

// ---------- Source strip ---------------------------------------------------
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SourceStrip({
  sources,
  anchorPrefix,
}: {
  sources: { url: string; title: string }[];
  anchorPrefix: string;
}) {
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
          const n = i + 1;
          return (
            <a
              key={`${anchorPrefix}-${n}`}
              id={`${anchorPrefix}-${n}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className={clsx(
                'group/src inline-flex items-center gap-1.5 max-w-[260px] h-7 px-2 rounded-md scroll-mt-20',
                'text-[12px] bg-surface-sunken hover:bg-surface text-fg-muted hover:text-fg',
                'border border-transparent hover:border-border transition-all duration-150'
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
                {String(n).padStart(2, '0')}
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
