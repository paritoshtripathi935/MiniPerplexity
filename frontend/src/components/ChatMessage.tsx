import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/clerk-react';
import { Brain, Check, ChevronDown, Clock, Copy, RotateCw } from 'lucide-react';
import type { Message, MessageSearchResult } from '../types';
import { getDomain } from '../utils/url';
import { useCitationDrawer } from './CitationDrawer';

/**
 * Some chat models (qwq-32b, gpt-oss with reasoning enabled, the deepseek-r1
 * family) emit their chain-of-thought wrapped in `<think>…</think>` directly
 * inside the answer content rather than the separate `reasoning_content`
 * field. We extract those blocks before handing the content to react-markdown
 * for two reasons:
 *
 *   1. They're not part of the user-facing answer — they belong in a
 *      collapsible "show thinking" disclosure, not in the prose body.
 *   2. react-markdown + remark-gfm's HTML handling will happily pass
 *      `<think>` through as raw markup. That has chased down weird
 *      rendering quirks (digits inside `<think>` blocks getting parsed
 *      as attribute values, sibling text inheriting truncated parsing
 *      state). Stripping the tags before render-time avoids the whole
 *      class of problem.
 *
 * Supports nested or unmatched closers — anything between the first
 * `<think>` and the matching (or end-of-string) `</think>` is treated as
 * reasoning. An open `<think>` with no closer (mid-stream) hides the rest
 * of the in-flight content until the closer arrives.
 */
const THINK_RE = /<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/gi;

/** Private-Use-Area sentinel for "the model emitted a <br>". Survives
 *  markdown parsing as a plain character (no parser claims PUA) and is
 *  exchanged for an actual <br/> element inside walkCitations. Picked
 *  arbitrarily from the BMP PUA block — never appears in real content. */
const BR_SENTINEL = '';
const BR_TAG_RE = /<br\s*\/?>/gi;

/** Convert literal `<br>` / `<br/>` / `<br />` tags (case-insensitive)
 *  in model output into our sentinel so we can render them as real line
 *  breaks downstream. */
function normalizeBrTags(content: string): string {
  if (!content) return content;
  return content.replace(BR_TAG_RE, BR_SENTINEL);
}

/** Models whose chain-of-thought streams *before* any opening `<think>`
 *  tag arrives. qwq-32b on Cloudflare strips the chat-template's opener
 *  and only emits `</think>` at the end. Without help, the very first
 *  tokens flow into the answer body, then jump into the thinking
 *  disclosure the instant the closer arrives — exactly the "ends, then
 *  shows thinking" flicker the user reported.
 *
 *  Models in this set get a synthetic `<think>` prepended *while
 *  streaming* whenever neither a real opener nor a closer has appeared
 *  yet. Once `</think>` lands, the normal extraction path takes over
 *  with no special case needed. Stream finished without ever emitting
 *  `</think>` → no synthetic prepend (the guard checks `isStreaming`),
 *  so we never wrongly hide a final answer that just happened to look
 *  like reasoning.
 *
 *  Matching is by substring so future revisions (`@cf/qwen/qwq-32b-v2`)
 *  keep working without a code edit. */
const REASONING_TAG_MODEL_HINTS = ['qwq'];

function modelEmitsThinkingMidStream(modelId: string | undefined): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return REASONING_TAG_MODEL_HINTS.some(hint => lower.includes(hint));
}

function splitThinking(
  content: string,
  opts: { isStreaming?: boolean; modelId?: string } = {},
): { body: string; thinking: string } {
  const firstClose = content.search(/<\/think>/i);
  const firstOpen = content.search(/<think\b/i);

  // Case 1 — qwq pattern, closer present but no opener: synthesise an
  // opener at the start so the regex extracts cleanly. (Always safe;
  // unchanged from prior behaviour.)
  // Case 2 — qwq pattern, *streaming*, neither tag present yet: treat
  // the in-flight content as in-progress reasoning instead of letting
  // it bleed into the answer body. This is what fixes the flicker.
  let normalized = content;
  if (firstClose >= 0 && (firstOpen < 0 || firstOpen > firstClose)) {
    normalized = '<think>' + content;
  } else if (
    opts.isStreaming &&
    firstOpen < 0 &&
    firstClose < 0 &&
    content.trim().length > 0 &&
    modelEmitsThinkingMidStream(opts.modelId)
  ) {
    normalized = '<think>' + content;
  }

  const thinkParts: string[] = [];
  const body = normalized.replace(THINK_RE, (_, inner: string) => {
    thinkParts.push(inner.trim());
    return '';
  });
  // Collapse the run of blank lines a removed block leaves behind so the
  // visible answer doesn't start with a yawning gap.
  const cleaned = body.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
  return { body: cleaned, thinking: thinkParts.join('\n\n').trim() };
}

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
  /** The chat model currently in use (e.g. `@cf/qwen/qwq-32b`). Threaded
   *  through to splitThinking so mid-stream content from `</think>`-only
   *  models gets routed into the thinking disclosure from the first
   *  token, not after the closer arrives. */
  activeModelId?: string;
}

/** Document-style chat message with inline citation pills + Copy / Regenerate. */
export function ChatMessage({
  message,
  onRegenerate,
  showFollowups,
  onFollowupSubmit,
  activeModelId,
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
      activeModelId={activeModelId}
    />
  );
}

// ---------- User turn ------------------------------------------------------
function UserTurn({ name, content }: { name: string; content: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle mb-1.5">
        {name}
      </div>
      <div className="text-body-base text-fg leading-relaxed whitespace-pre-wrap">
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
  activeModelId,
}: {
  message: Message;
  onRegenerate?: () => void;
  showFollowups: boolean;
  onFollowupSubmit?: (text: string) => void;
  activeModelId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const isSearching = !!message.isSearching;
  const searchingUrls = message.searchingUrls ?? [];
  const isStreaming = !!message.isStreaming;

  // Pull `<think>…</think>` blocks out of the content so they render in a
  // separate disclosure instead of polluting the answer body. See
  // splitThinking() — also defends react-markdown against malformed inline
  // HTML for models that emit raw <think> tags. Pass `isStreaming` +
  // `activeModelId` so reasoning models that emit `</think>` without a
  // matching opener (qwq-32b) get an early synthetic `<think>` instead
  // of showing the chain-of-thought as answer text until the closer
  // arrives.
  const { body, thinking } = useMemo(
    () => splitThinking(message.content, { isStreaming, modelId: activeModelId }),
    [message.content, isStreaming, activeModelId],
  );
  // Normalise literal <br> tags in the prose-rendered body. react-
  // markdown@9 strips raw HTML by default, so models that emit `<br>`
  // inside table cells (a common pattern because markdown tables don't
  // support newlines in cells) end up rendering the literal text `<br>`
  // in the output. We replace those occurrences with a Private-Use-
  // Area sentinel that survives markdown parsing untouched; the
  // citation walker (walkCitations) splits text nodes on the sentinel
  // and emits real <br/> elements — covering tables, lists, paragraphs
  // uniformly without enabling raw-HTML passthrough (and its XSS
  // surface). Not applied to `thinking` because that renders in a
  // <pre> with whitespace-pre-wrap, where the PUA char would surface
  // as a tofu glyph and real newlines work natively.
  const visibleContent = useMemo(() => normalizeBrTags(body), [body]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  // Citation index → search-result map for the inline `[N]` pills.
  // Clicking a pill opens the CitationDrawer with the quoted excerpt
  // the LLM was conditioned on. We preserve search_results order so
  // [N] matches what the LLM saw in its "Sources for this turn" block.
  const sourceResults = useMemo<MessageSearchResult[]>(() => {
    if (message.search_results && message.search_results.length > 0) {
      return message.search_results;
    }
    // Fallback for legacy turns where only the bare citations list
    // landed — synthesize stub results so pills still render + open
    // (drawer shows "no excerpt was captured" gracefully).
    return (message.sources ?? []).map(s => ({
      source: s.url,
      title: s.title,
      type: s.type ?? 'web',
      snippet: undefined,
    }));
  }, [message.search_results, message.sources]);

  const components = useMemo(
    () => makeMarkdownComponents(sourceResults),
    [sourceResults],
  );

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          PaidPilot
        </span>
        {(isSearching || isStreaming) && <SearchingDot label={isSearching ? 'searching' : 'writing'} />}
      </div>

      {isSearching && searchingUrls.length > 0 && (
        <SearchingPanel urls={searchingUrls} />
      )}

      {thinking && <ThinkingDisclosure thinking={thinking} isStreaming={isStreaming} />}

      <article
        className="
          prose prose-sm max-w-none text-fg
          prose-headings:font-display prose-headings:tracking-tight prose-headings:text-fg
          prose-h1:text-[20px] prose-h1:mt-0 prose-h2:text-[16px] prose-h3:text-body-base
          prose-p:leading-[1.7] prose-p:text-body-base prose-p:text-fg
          prose-strong:text-fg prose-strong:font-semibold
          prose-a:text-brand prose-a:no-underline hover:prose-a:underline
          prose-code:bg-surface-sunken prose-code:text-fg prose-code:px-1 prose-code:py-0.5
          prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono
          prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-surface-sunken prose-pre:border prose-pre:border-border
          prose-pre:rounded-md prose-pre:text-body-sm
          prose-li:text-body-base prose-li:leading-relaxed
          prose-blockquote:border-l-2 prose-blockquote:border-brand
          prose-blockquote:bg-brand-subtle/30 prose-blockquote:py-0.5
          prose-blockquote:px-3 prose-blockquote:not-italic
          prose-hr:border-border
          prose-table:text-body-sm
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
                  <Check className="w-3 h-3 text-success" /> copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> copy
                </>
              )}
            </ActionBtn>
            {onRegenerate && (
              <ActionBtn onClick={onRegenerate}>
                <RotateCw className="w-3 h-3" /> regenerate
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
      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-body-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
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
      answered in {formatted}
    </span>
  );
}

function SearchingDot({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">
      {/* Emerald pulse — "live data is moving". Matches landing's status-dot
       * convention. (Brand violet stays reserved for engagement / active.) */}
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      {label}
    </span>
  );
}

function StreamingCursor() {
  // 1Hz blink at calm contrast — the cursor blink is a UX convention so we
  // keep the motion, but drop Tailwind's default animate-pulse (which dips
  // to 50% opacity and is too theatrical on a brand-colored bar per
  // CLAUDE.md). animate-cursor-blink is defined in tailwind.config.js.
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-on-surface-variant align-text-bottom ml-0.5 animate-cursor-blink"
      aria-hidden
    />
  );
}

/**
 * Collapsible "show thinking" disclosure rendered above the answer body
 * for assistant turns whose content contained `<think>…</think>` blocks.
 * Auto-expands while the model is still streaming the reasoning so the
 * user gets a live sense of progress, then collapses by default once the
 * answer body lands.
 */
function ThinkingDisclosure({
  thinking,
  isStreaming,
}: {
  thinking: string;
  isStreaming: boolean;
}) {
  // Auto-open during streaming, collapse on completion. The user can
  // re-toggle freely after the stream finishes.
  const [open, setOpen] = useState(isStreaming);
  React.useEffect(() => {
    if (!isStreaming) setOpen(false);
  }, [isStreaming]);

  return (
    <details
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
      className="mb-4 rounded-2xl border border-border/60 bg-surface-sunken/40 backdrop-blur"
    >
      <summary className="cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-fg-muted hover:text-fg transition-colors list-none [&::-webkit-details-marker]:hidden">
        <Brain className="w-3.5 h-3.5 text-brand/70 shrink-0" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          thinking
        </span>
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
        <span className="ml-auto text-body-sm text-fg-subtle">
          {open ? 'hide' : 'show'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-fg-subtle transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </summary>
      <div className="px-3 pb-3 pt-1">
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg-muted">
          {thinking}
        </pre>
      </div>
    </details>
  );
}

function SearchingPanel({ urls }: { urls: string[] }) {
  return (
    <div className="mb-4 p-3 rounded-2xl bg-surface-raised/40 border border-border/60 backdrop-blur">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
        reading sources
      </div>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto">
        {urls.map((url, i) => (
          <li key={i} className="flex items-center gap-2 text-body-md text-fg-muted animate-fade-in">
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

function CitationPill({
  n,
  results,
}: {
  n: number;
  /** Full message-level results so the drawer can step prev/next through
   *  siblings. When omitted (no resolution), renders as inert. */
  results?: MessageSearchResult[];
}) {
  const { open } = useCitationDrawer();
  const result = results && n >= 1 && n <= results.length ? results[n - 1] : null;
  if (!result || !result.source) {
    return (
      <span className="inline-flex items-baseline mx-0.5 px-1.5 rounded-md border border-border/60 bg-surface-raised/60 font-mono text-[10px] tabular-nums text-fg-subtle relative -top-[2px]">
        {n}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open(results!, n - 1)}
      title={result.title || result.source}
      className="inline-flex items-baseline mx-0.5 px-1.5 rounded-md border border-brand/30 bg-brand/5 font-mono text-[10px] tabular-nums text-brand hover:border-brand/60 hover:bg-brand/15 focus-visible:shadow-focus transition-colors relative -top-[2px]"
    >
      {n}
    </button>
  );
}

/**
 * Walk a children tree and replace `[N]` / `[N, M]` markers with citation
 * pills that open the drawer. Recurses into element children via
 * React.cloneElement so markers nested in <em>, <strong>, <code>, etc.
 * work without extra component overrides.
 */
function walkCitations(
  node: React.ReactNode,
  results: MessageSearchResult[],
  keyBase: string,
): React.ReactNode {
  if (typeof node === 'string') {
    // Step 1 — line-break sentinels. The content normalizer at the top
    // of the pipeline converted every `<br>` variant the model emitted
    // into a single PUA character (see BR_SENTINEL). Split here and
    // emit real `<br/>` elements between the surviving text fragments,
    // then recurse on each fragment so citation markers inside the
    // segmented text still resolve.
    if (node.includes(BR_SENTINEL)) {
      const segs = node.split(BR_SENTINEL);
      const out: React.ReactNode[] = [];
      segs.forEach((seg, i) => {
        if (i > 0) out.push(<br key={`${keyBase}-br-${i}`} />);
        if (seg) out.push(walkCitations(seg, results, `${keyBase}-s${i}`));
      });
      return out;
    }
    if (!node.includes('[')) return node;
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(node)) !== null) {
      const parsed = m[1].split(',').map(s => parseInt(s.trim(), 10));
      // Keep everything before this match, regardless of whether the match
      // resolves to a URL — early `continue` on a partial filter was eating
      // the prose between [N] markers when N pointed out of range.
      if (m.index > last) out.push(node.slice(last, m.index));
      const valid = parsed.filter(
        n => Number.isFinite(n) && n >= 1 && n <= results.length,
      );
      if (valid.length > 0) {
        valid.forEach((n, i) => {
          out.push(
            <CitationPill
              key={`${keyBase}-${m!.index}-${i}`}
              n={n}
              results={results}
            />,
          );
        });
      } else {
        // Out-of-range or unparseable — render the original marker as
        // an inert styled pill so the user can see the model tried to
        // cite something but the index didn't resolve.
        parsed
          .filter(n => Number.isFinite(n))
          .forEach((n, i) => {
            out.push(
              <CitationPill
                key={`${keyBase}-${m!.index}-x${i}`}
                n={n}
                results={undefined}
              />,
            );
          });
        // If even parseInt failed (e.g. `[abc]`), surface the literal
        // text rather than swallowing it.
        if (parsed.every(n => !Number.isFinite(n))) {
          out.push(m[0]);
        }
      }
      last = m.index + m[0].length;
    }
    if (out.length === 0) return node;
    if (last < node.length) out.push(node.slice(last));
    return out;
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <React.Fragment key={`${keyBase}-${i}`}>
        {walkCitations(c, results, `${keyBase}-${i}`)}
      </React.Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    if (node.type === 'a') return node;
    const childProps = node.props as { children?: React.ReactNode };
    return React.cloneElement(
      node,
      undefined,
      walkCitations(childProps.children, results, `${keyBase}-c`),
    );
  }
  return node;
}

function makeMarkdownComponents(results: MessageSearchResult[]) {
  // Run the walker even when results is empty so `[N]` markers in the
  // prose become inert pills rather than getting orphaned as raw text —
  // keeps the citation affordance consistent whether or not search
  // results came through with the message.
  const wrap = (Tag: keyof JSX.IntrinsicElements) =>
    function WrappedTag({ children, node, ...rest }: any) {
      return React.createElement(
        Tag,
        rest,
        walkCitations(children, results, `${Tag}`),
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
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
        next steps
      </div>
      <div className="flex flex-col gap-1.5">
        {loading && (!items || items.length === 0)
          ? [0, 1, 2].map(i => <SuggestionShimmer key={i} />)
          : (items ?? []).map(text => (
              <button
                key={text}
                onClick={() => onSubmit(text)}
                className="text-left inline-flex items-start gap-1.5 px-3 py-2 rounded-md text-body-sm text-fg-muted bg-surface-raised/40 hover:bg-brand/10 hover:text-fg border border-border/40 hover:border-brand/40 transition-colors"
              >
                <span className="text-brand/70">→</span>
                <span className="leading-snug">{text}</span>
              </button>
            ))}
      </div>
    </div>
  );
}
