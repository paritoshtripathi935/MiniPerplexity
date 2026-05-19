/**
 * Citation drawer — landing page feature A3.
 *
 * Landing copy promises: "expand the citation drawer to see the exact
 * paragraph the number came from." This is that drawer. When a user clicks
 * a `[N]` pill in a chat message, the corresponding search_result opens
 * here with its title, domain, the snippet the LLM was conditioned on, and
 * an external-link to the source. Multiple consecutive `[1,2,3]` pills
 * each open one entry; the drawer supports stepping between siblings.
 *
 * The drawer state is global (one drawer for the whole app, opened from
 * any chat message regardless of which page we're on). We expose it via a
 * provider mounted in AppLayout next to the other UI providers. Pills
 * call `useCitationDrawer().open(results, index)`.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ShieldCheck, X } from 'lucide-react';
import clsx from 'clsx';
import type { Message, MessageSearchResult } from '../types';
import { getDomain } from '../utils/url';

interface DrawerState {
  /** Full citation context for this open — the message's search_results
   *  in order so prev / next can step through siblings. */
  results: MessageSearchResult[];
  /** The 0-based index in `results` of the citation that was clicked. */
  index: number;
}

interface CitationDrawerContextValue {
  open: (results: MessageSearchResult[], index: number) => void;
  close: () => void;
  state: DrawerState | null;
}

const Ctx = createContext<CitationDrawerContextValue | null>(null);

export function CitationDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState | null>(null);

  const open = useCallback(
    (results: MessageSearchResult[], index: number) => {
      if (!results.length) return;
      const safe = Math.max(0, Math.min(index, results.length - 1));
      setState({ results, index: safe });
    },
    [],
  );

  const close = useCallback(() => setState(null), []);

  const value = useMemo(() => ({ open, close, state }), [open, close, state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCitationDrawer(): CitationDrawerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fall back to a no-op so consumers (citation pills) can be rendered
    // outside a provider during tests / Storybook without crashing.
    return { open: () => {}, close: () => {}, state: null };
  }
  return ctx;
}

/** The drawer UI itself. Mount once near the top of the tree (AppLayout)
 *  so it renders above the routed surfaces. */
export function CitationDrawer() {
  const ctx = useContext(Ctx);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Mirror state.index into local state on open so prev/next inside the
  // drawer can step without re-issuing open() from the pill.
  useEffect(() => {
    setActiveIndex(ctx?.state?.index ?? null);
  }, [ctx?.state]);

  // Esc closes. Arrow keys step through siblings while the drawer is open.
  useEffect(() => {
    if (!ctx?.state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        ctx.close();
      } else if (e.key === 'ArrowLeft' && activeIndex !== null && activeIndex > 0) {
        e.preventDefault();
        setActiveIndex(activeIndex - 1);
      } else if (
        e.key === 'ArrowRight' &&
        activeIndex !== null &&
        ctx.state &&
        activeIndex < ctx.state.results.length - 1
      ) {
        e.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, activeIndex]);

  if (!ctx?.state || activeIndex === null) return null;
  const { results } = ctx.state;
  const result = results[activeIndex];
  if (!result) return null;

  const citationNumber = activeIndex + 1;
  const domain = result.source ? getDomain(result.source) : null;
  const total = results.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="close citation"
        onClick={ctx.close}
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label={`citation ${citationNumber}`}
        className="relative w-full max-w-[480px] h-full bg-surface-raised/95 backdrop-blur-md border-l border-border/60 flex flex-col motion-safe:animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1.5 inline-flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md border border-brand/30 bg-brand/5 font-mono text-[10px] tabular-nums text-brand">
                {citationNumber}
              </span>
              citation
              {total > 1 && (
                <span className="text-fg-subtle">
                  · {citationNumber} of {total}
                </span>
              )}
            </p>
            <h2 className="text-h2 font-display font-semibold text-fg leading-snug">
              {result.title || 'untitled source'}
            </h2>
            {domain && (
              <a
                href={result.source}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-body-sm text-fg-muted hover:text-fg transition-colors"
              >
                {domain}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {result._authoritative && (
              <span className="mt-2 inline-flex items-center gap-1 px-1.5 h-5 rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                authoritative
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={ctx.close}
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 shrink-0"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — the quoted paragraph */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
            quoted excerpt
          </p>
          {result.snippet ? (
            <blockquote className="border-l-2 border-brand/40 pl-4 text-body-base text-fg leading-relaxed whitespace-pre-wrap">
              {result.snippet}
            </blockquote>
          ) : (
            <p className="text-body-sm text-fg-subtle italic">
              no excerpt was captured for this source — open the page directly
              to see what the model cited.
            </p>
          )}
          <p className="mt-4 text-body-sm text-fg-subtle">
            this is the snippet the model was conditioned on when it cited{' '}
            <span className="font-mono text-brand">[{citationNumber}]</span>.
            open the source to read the full page.
          </p>
        </div>

        {/* Footer — sibling navigation + open-source CTA */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-border/60 bg-surface-sunken/40">
          <div className="flex items-center gap-1">
            <FooterStepButton
              direction="prev"
              disabled={activeIndex <= 0}
              onClick={() => setActiveIndex(i => (i !== null && i > 0 ? i - 1 : i))}
            />
            <FooterStepButton
              direction="next"
              disabled={activeIndex >= total - 1}
              onClick={() =>
                setActiveIndex(i =>
                  i !== null && i < total - 1 ? i + 1 : i,
                )
              }
            />
          </div>
          {result.source && (
            <a
              href={result.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow"
            >
              open source
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Collect every citation that's been surfaced anywhere in the
 *  conversation, in the order they first appeared. De-duplicated by
 *  source URL so the drawer's prev/next doesn't loop through the same
 *  page twice. Used by the header "citations" chip to open the drawer
 *  with a conversation-wide view. */
export function collectCitations(messages: Message[]): MessageSearchResult[] {
  const seen = new Set<string>();
  const out: MessageSearchResult[] = [];
  for (const m of messages) {
    if (!m.search_results?.length) continue;
    for (const r of m.search_results) {
      const key = r.source || r.title || JSON.stringify(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function FooterStepButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === 'prev' ? 'previous citation' : 'next citation'}
      className={clsx(
        'grid place-items-center w-8 h-8 rounded-md border border-border/60 transition-colors',
        disabled
          ? 'text-fg-subtle/40 cursor-not-allowed'
          : 'text-fg-muted hover:text-fg hover:bg-surface-raised',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
