import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/clerk-react';
import { Check, Clock, Copy, RotateCw } from 'lucide-react';
import type { Message } from '../types';
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

  // Citation index → URL map for the inline `[N]` pills. The right rail
  // owns the aggregated source list; clicking a pill jumps you straight
  // to the cited page in a new tab. We preserve search_results order so
  // [N] matches what the LLM saw in its "Sources for this turn" block.
  const sourceUrls = useMemo(() => {
    const urls: string[] = [];
    for (const r of message.search_results ?? []) {
      if (r.source) urls.push(r.source);
    }
    if (urls.length === 0) {
      // Fallback for legacy turns where only the bare citations list landed.
      for (const s of message.sources ?? []) {
        if (s.url) urls.push(s.url);
      }
    }
    return urls;
  }, [message.search_results, message.sources]);

  const components = useMemo(() => makeMarkdownComponents(sourceUrls), [sourceUrls]);

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
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {visibleContent}
        </ReactMarkdown>
        {isStreaming && <StreamingCursor />}
      </article>


      {!isSearching && !isStreaming && (
        <div className="mt-3 flex items-center gap-2">
          {typeof message.latencyMs === 'number' && (
            <LatencyHint ms={message.latencyMs} />
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
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

function LatencyHint({ ms }: { ms: number }) {
  const formatted =
    ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-fg-subtle tabular-nums"
      title={`Answer generated in ${ms}ms`}
    >
      <Clock className="w-3 h-3" aria-hidden />
      Answered in {formatted}
    </span>
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

function CitationPill({ n, url }: { n: number; url?: string }) {
  if (!url) {
    // Index without a known URL — render as plain text so the user isn't
    // teased with a non-functional pill.
    return (
      <span className="inline-flex items-baseline mx-0.5 px-1.5 rounded text-[10px] font-semibold tabular-nums bg-surface-sunken text-fg-subtle relative -top-[2px]">
        {n}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-baseline mx-0.5 px-1.5 rounded text-[10px] font-semibold tabular-nums bg-brand-subtle text-brand hover:bg-brand hover:text-brand-fg transition-colors no-underline relative -top-[2px]"
    >
      {n}
    </a>
  );
}

/**
 * Walk a children tree and replace `[N]` / `[N, M]` markers with citation
 * pills that link to the source URL. Recurses into element children via
 * React.cloneElement so markers nested in <em>, <strong>, <code>, etc.
 * work without extra component overrides.
 */
function walkCitations(
  node: React.ReactNode,
  urls: string[],
  keyBase: string,
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
        .filter(n => Number.isFinite(n) && n >= 1 && n <= urls.length);
      if (nums.length === 0) continue;
      if (m.index > last) out.push(node.slice(last, m.index));
      nums.forEach((n, i) => {
        out.push(
          <CitationPill key={`${keyBase}-${m!.index}-${i}`} n={n} url={urls[n - 1]} />
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
        {walkCitations(c, urls, `${keyBase}-${i}`)}
      </React.Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    if (node.type === 'a') return node;
    const childProps = node.props as { children?: React.ReactNode };
    return React.cloneElement(
      node,
      undefined,
      walkCitations(childProps.children, urls, `${keyBase}-c`),
    );
  }
  return node;
}

function makeMarkdownComponents(urls: string[]) {
  if (urls.length === 0) return undefined;
  const wrap = (Tag: keyof JSX.IntrinsicElements) =>
    function WrappedTag({ children, node, ...rest }: any) {
      return React.createElement(
        Tag,
        rest,
        walkCitations(children, urls, `${Tag}`),
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
