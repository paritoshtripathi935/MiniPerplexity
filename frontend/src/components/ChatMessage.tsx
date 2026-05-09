import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUser } from '@clerk/clerk-react';
import { Check, Copy, ExternalLink, RotateCw, ShieldCheck, Youtube } from 'lucide-react';
import clsx from 'clsx';
import type { Message, MessageSearchResult } from '../types';
import { getDomain } from '../utils/url';

interface ChatMessageProps {
  message: Message;
  /** Kept for back-compat; tokens swap via .dark on <html>. */
  darkMode?: boolean;
  /** Optional regenerate handler — if provided, shows a Regenerate button on assistant turns. */
  onRegenerate?: (msg: Message) => void;
  /** Whether to render the next-step suggestion chips below the answer (only
   * the latest finished assistant turn shows them — older turns stay quiet). */
  showFollowups?: boolean;
  /** Fired when a suggestion chip is clicked. The host submits the question
   * directly (no prefill-and-edit step) so the user can keep moving. */
  onFollowupSubmit?: (text: string) => void;
}

/** Document-style chat message with inline citation pills + Copy / Regenerate. */
export function ChatMessage({
  message,
  onRegenerate,
  showFollowups,
  onFollowupSubmit,
}: ChatMessageProps) {
  const { user } = useUser();
  if (message.type !== 'assistant') {
    return <UserTurn name={user?.fullName || 'You'} content={message.content} />;
  }
  return (
    <AssistantTurn
      message={message}
      onRegenerate={onRegenerate ? () => onRegenerate(message) : undefined}
      showFollowups={!!showFollowups}
      onFollowupSubmit={onFollowupSubmit}
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
  showFollowups,
  onFollowupSubmit,
}: {
  message: Message;
  onRegenerate?: () => void;
  showFollowups: boolean;
  onFollowupSubmit?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isSearching = !!message.isSearching;
  const searchingUrls = message.searchingUrls ?? [];

  // While the streaming reveal is in progress, show only the revealed prefix
  // of the content. `undefined` means "render everything" (covers historical
  // messages and the "_Thinking…_" placeholder).
  const visibleContent = useMemo(() => {
    if (typeof message.revealedLength !== 'number') return message.content;
    return message.content.slice(0, message.revealedLength);
  }, [message.content, message.revealedLength]);
  const isStreaming =
    typeof message.revealedLength === 'number' &&
    message.revealedLength < message.content.length;

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
    const out: {
      url: string;
      title: string;
      type?: string;
      snippet?: string;
      authoritative?: boolean;
    }[] = [];
    for (const r of message.search_results ?? []) {
      if (r.source) {
        out.push({
          url: r.source,
          title: r.title || r.source,
          type: r.type,
          snippet: r.snippet,
          authoritative: !!r._authoritative,
        });
      }
    }
    if (out.length === 0) {
      // Fallback: bare citations array (URLs only). Loses the badge/snippet
      // but at least keeps the list non-empty for back-compat with old data.
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
  const videos = useMemo<MessageSearchResult[]>(
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
        {(isSearching || isStreaming) && <SearchingDot label={isSearching ? 'Searching' : 'Writing'} />}
      </div>

      {isSearching && searchingUrls.length > 0 && (
        <SearchingPanel urls={searchingUrls} />
      )}

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
        <ReactMarkdown components={components}>{visibleContent}</ReactMarkdown>
        {isStreaming && <StreamingCursor />}
      </article>

      {!isStreaming && webSources.length > 0 && (
        <SourceStrip sources={webSources} anchorPrefix={anchorPrefix} />
      )}
      {!isStreaming && videos.length > 0 && <VideoStrip videos={videos} />}

      {!isSearching && !isStreaming && (
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

      {showFollowups && !isSearching && !isStreaming && onFollowupSubmit && (
        <NextStepChips
          items={message.nextSteps}
          loading={!!message.nextStepsLoading}
          onSubmit={onFollowupSubmit}
        />
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

function SearchingDot({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-brand opacity-60 animate-ping" />
        <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-brand" />
      </span>
      {label}
    </span>
  );
}

function StreamingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-brand align-text-bottom ml-0.5 animate-pulse"
      aria-hidden
    />
  );
}

function SearchingPanel({ urls }: { urls: string[] }) {
  return (
    <div className="mb-4 p-3 rounded-md bg-surface-sunken border border-border">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2">
        Reading sources
      </div>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto">
        {urls.map((url, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px] text-fg-muted animate-fade-in">
            <span className="inline-block w-3 h-3 rounded-sm overflow-hidden bg-border shrink-0">
              <img
                src={`https://www.google.com/s2/favicons?sz=32&domain=${getDomain(url)}`}
                alt=""
                className="w-full h-full object-cover"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </span>
            <span className="truncate flex-1">{getDomain(url)}</span>
          </li>
        ))}
      </ul>
    </div>
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
      if (nums.length === 0) continue;
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
  if (max === 0) return undefined;
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
interface SourceItem {
  url: string;
  title: string;
  type?: string;
  snippet?: string;
  authoritative?: boolean;
}

/**
 * The source strip used to be small pills with hover popovers; now each
 * source renders as a card with title + snippet visible inline. Cuts the
 * "hover to see what this is" friction and gives the panel real density.
 *
 * Authoritative sources get a left brand-rule for at-a-glance scanning.
 * Anchor ids are kept on the card root so [N] citation pills still
 * scroll-flash to the right card.
 */
const SOURCE_PREVIEW_COUNT = 4;

function SourceStrip({
  sources,
  anchorPrefix,
}: {
  sources: SourceItem[];
  anchorPrefix: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sources : sources.slice(0, SOURCE_PREVIEW_COUNT);
  const authoritativeCount = sources.filter(s => s.authoritative).length;

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle">
          Sources · {sources.length}
        </div>
        {authoritativeCount > 0 && (
          <div
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] font-semibold text-brand"
            title={`${authoritativeCount} source${authoritativeCount === 1 ? '' : 's'} from a high-authority marketing domain`}
          >
            <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
            {authoritativeCount} authoritative
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {visible.map((s, i) => (
          <SourceCard
            key={`${anchorPrefix}-${i + 1}`}
            anchorId={`${anchorPrefix}-${i + 1}`}
            n={i + 1}
            source={s}
          />
        ))}
      </div>
      {!expanded && sources.length > SOURCE_PREVIEW_COUNT && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-brand hover:underline"
        >
          Show {sources.length - SOURCE_PREVIEW_COUNT} more source{sources.length - SOURCE_PREVIEW_COUNT === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

function SourceCard({
  anchorId,
  n,
  source,
}: {
  anchorId: string;
  n: number;
  source: SourceItem;
}) {
  const domain = getDomain(source.url);
  return (
    <a
      id={anchorId}
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'group/src relative flex flex-col gap-1.5 p-3 rounded-md scroll-mt-20',
        'bg-surface border border-border hover:border-border-strong',
        'transition-colors duration-150 overflow-hidden',
        source.authoritative && 'ring-1 ring-brand/25 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-brand'
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle min-w-0">
        <span className="font-semibold tabular-nums shrink-0">
          {String(n).padStart(2, '0')}
        </span>
        <span className="inline-block w-3.5 h-3.5 rounded-sm overflow-hidden shrink-0 bg-border">
          <img
            src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
            alt=""
            className="w-full h-full object-cover"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </span>
        <span className="truncate flex-1">{domain}</span>
        {source.authoritative && (
          <span
            className="inline-flex items-center gap-0.5 shrink-0 text-brand font-semibold uppercase tracking-[0.06em] text-[9.5px]"
            aria-label="Authoritative source"
          >
            <ShieldCheck className="w-2.5 h-2.5" strokeWidth={2.5} />
            Auth
          </span>
        )}
        <ExternalLink className="w-3 h-3 shrink-0 text-fg-subtle opacity-0 group-hover/src:opacity-100 transition-opacity" />
      </div>
      {source.title && (
        <div className="text-[13px] font-medium text-fg leading-snug line-clamp-2">
          {source.title}
        </div>
      )}
      {source.snippet && (
        <div className="text-[12px] text-fg-muted leading-snug line-clamp-2">
          {source.snippet}
        </div>
      )}
    </a>
  );
}

function VideoStrip({ videos }: { videos: MessageSearchResult[] }) {
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

function SuggestionShimmer() {
  return (
    <div
      className="h-9 rounded-md bg-surface-sunken overflow-hidden relative"
      aria-hidden
    >
      <div
        className="absolute inset-0 -translate-x-full animate-shimmer"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgb(var(--fg-subtle) / 0.08) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
}

// ---------- Next-step suggestion chips -----------------------------------
function NextStepChips({
  items,
  loading,
  onSubmit,
}: {
  items?: string[];
  loading: boolean;
  onSubmit: (text: string) => void;
}) {
  if (!loading && (!items || items.length === 0)) return null;
  return (
    <div className="mt-4 pt-3 border-t border-border/60">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-2">
        Next steps
      </div>
      <div className="flex flex-col gap-1.5">
        {loading && (!items || items.length === 0)
          ? [0, 1, 2].map(i => <SuggestionShimmer key={i} />)
          : (items ?? []).map(text => (
              <button
                key={text}
                onClick={() => onSubmit(text)}
                className="text-left inline-flex items-start gap-1.5 px-3 py-2 rounded-md text-[13px] text-fg-muted bg-surface-sunken hover:bg-brand-subtle hover:text-brand border border-transparent hover:border-brand/30 transition-colors"
              >
                <span className="text-fg-subtle">→</span>
                <span className="leading-snug">{text}</span>
              </button>
            ))}
      </div>
    </div>
  );
}
