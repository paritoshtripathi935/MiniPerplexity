import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowUp } from 'lucide-react';
import { ChatMessage } from '../components/ChatMessage';
import { SearchBar, type ComposerHandle } from '../components/SearchBar';
import { SessionsSidebar } from '../components/SessionsSidebar';
import { PlayRunModal } from '../components/PlayRunModal';
import { ChatRightRail } from '../components/ChatRightRail';
import {
  getBrandProfile, listPlays,
  performSearch, getAnswer, getSessionHistory, runPlay,
  type BrandProfile, type Play,
} from '../services/api';
import { Message, MessageSearchResult } from '../types';

export interface PendingPlay {
  play: Play;
  query: string;
  sessionId: string;
}

interface Props {
  darkMode: boolean;
  pending: PendingPlay | null;
  clearPending: () => void;
}

/**
 * Tunables for the client-side streaming reveal. Real SSE will replace this
 * later — for now we accept the full answer and animate it in.
 *   CHARS_PER_TICK ≈ 30 chars × 20 ticks/sec → ~600 chars/s, which lands
 *   squarely between "feels too slow to read" and "snaps in instantly".
 */
const REVEAL_CHARS_PER_TICK = 30;
const REVEAL_TICK_MS = 50;

export function ChatPage({ darkMode, pending, clearPending }: Props) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams();

  // If no sessionId in URL, mint one and redirect (so refresh keeps the chat).
  useEffect(() => {
    if (!routeSessionId) navigate(`/chat/${uuidv4()}`, { replace: true });
  }, [routeSessionId, navigate]);

  const sessionId = routeSessionId ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  /** Slash-selected play queued for the run modal. */
  const [slashPlay, setSlashPlay] = useState<Play | null>(null);
  /** The play whose context is "loaded" — visible in the composer chip and
   * right rail. Stays after the play completes so the user can see what they
   * just ran; cleared when they start a fresh non-play turn. */
  const [activePlay, setActivePlay] = useState<Play | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const justCreatedRef = useRef(true);
  /** Per-message reveal-animation interval handles, keyed by message id. */
  const revealHandles = useRef<Map<string, number>>(new Map());

  const [showStickyHeader, setShowStickyHeader] = useState(false);

  // One-time load of the Plays catalog so the composer can offer slash
  // commands. Failure is non-fatal — the user just doesn't get the menu.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { plays } = await listPlays();
        if (!cancelled) setPlays(plays);
      } catch {
        /* slash menu silently disabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull the brand profile so the empty-state can be brand-aware.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getBrandProfile(getToken);
        if (!cancelled) setProfile(p);
      } catch {
        /* anonymous or first-time — empty state still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Clean up any in-flight reveal intervals on unmount or session change.
  useEffect(() => {
    return () => {
      revealHandles.current.forEach(h => window.clearInterval(h));
      revealHandles.current.clear();
    };
  }, [sessionId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Sticky conversation header — show once the first turn has scrolled out
  // of view. Uses IntersectionObserver against a sentinel above the messages.
  useEffect(() => {
    const sentinel = messagesTopRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyHeader(!entry.isIntersecting),
      { root, threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [messages.length]);

  // Hydrate when the URL session changes — but skip the auto-mint case
  // (where there's nothing to load yet) and the pending-play case.
  useEffect(() => {
    if (!sessionId) return;
    if (pending && pending.sessionId === sessionId) return;
    if (justCreatedRef.current) {
      justCreatedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getSessionHistory(sessionId, getToken);
        if (cancelled) return;
        const history = data?.history?.messages ?? [];
        setMessages(rehydrateMessages(history));
        // No active play known on rehydration (we'd need to persist it).
        setActivePlay(null);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, getToken, pending]);

  /**
   * Animate the assistant turn from the "_Thinking…_" placeholder to the
   * full answer. Replaces the message's content + revealedLength=0 atomically,
   * then ticks revealedLength up until the full content is shown.
   */
  const startStreamingReveal = useCallback(
    (msgId: string, fullContent: string) => {
      const existing = revealHandles.current.get(msgId);
      if (existing) window.clearInterval(existing);
      const handle = window.setInterval(() => {
        let done = false;
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== msgId) return m;
            const current = m.revealedLength ?? 0;
            const next = current + REVEAL_CHARS_PER_TICK;
            if (next >= fullContent.length) {
              done = true;
              return { ...m, revealedLength: undefined };
            }
            return { ...m, revealedLength: next };
          })
        );
        if (done) {
          window.clearInterval(handle);
          revealHandles.current.delete(msgId);
        }
      }, REVEAL_TICK_MS);
      revealHandles.current.set(msgId, handle);
    },
    []
  );

  // Auto-run a pending Play that was queued on the previous page.
  useEffect(() => {
    if (!pending || pending.sessionId !== sessionId) return;
    setActivePlay(pending.play);
    (async () => {
      const userMsg: Message = {
        id: uuidv4(),
        type: 'user',
        content: `▸ ${pending.play.title}\n\n${pending.query}`,
        timestamp: new Date(),
      };
      const responseMsg: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: `_Running play: ${pending.play.title}…_\n`,
        timestamp: new Date(),
        search_results: [],
        searchingUrls: [],
        isSearching: true,
      };
      setMessages([userMsg, responseMsg]);
      setLoading(true);
      try {
        const searchResults = await performSearch(
          pending.query, pending.sessionId, [], undefined,
          url => appendSearchUrl(responseMsg.id, url),
          getToken
        );
        const answerResponse = await runPlay(
          pending.play.id, pending.query, pending.sessionId, searchResults, getToken
        );
        if (answerResponse?.answer && Array.isArray(answerResponse.citations)) {
          const reveal = applyAssistantAnswer({
            messageId: responseMsg.id,
            answer: answerResponse.answer,
            searchResults: searchResults,
            citations: answerResponse.citations,
            originatingQuery: pending.query,
            originatingSearchResults: searchResults,
            originatingPlayId: pending.play.id,
          });
          setMessages(reveal.update);
          startStreamingReveal(reveal.messageId, reveal.fullContent);
          setSidebarRefresh(n => n + 1);
        }
      } catch (e) {
        setError(`Play failed: ${e}`);
      } finally {
        setLoading(false);
        clearPending();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, sessionId]);

  /** Append a fetched URL to a message's searchingUrls (deduped). */
  const appendSearchUrl = useCallback((msgId: string, url: string) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== msgId) return m;
        const existing = m.searchingUrls ?? [];
        if (existing.includes(url)) return m;
        return { ...m, searchingUrls: [...existing, url] };
      })
    );
  }, []);

  /**
   * Regenerate an assistant turn in place — same query + same search
   * results, just re-call /answer. Cheaper than a fresh round and mirrors
   * what ChatGPT/Claude do.
   */
  const handleRegenerate = async (msg: Message) => {
    if (!msg.originatingQuery || !msg.originatingSearchResults?.length) return;
    setError(null);
    setMessages(prev =>
      prev.map(m =>
        m.id === msg.id
          ? { ...m, content: '_Regenerating…_\n', isSearching: true, revealedLength: undefined }
          : m
      )
    );
    setLoading(true);
    try {
      const answerResponse = msg.originatingPlayId
        ? await runPlay(
            msg.originatingPlayId,
            msg.originatingQuery,
            sessionId,
            msg.originatingSearchResults,
            getToken
          )
        : await getAnswer(
            msg.originatingQuery,
            sessionId,
            msg.originatingSearchResults,
            [],
            getToken
          );
      if (answerResponse?.answer) {
        const fullContent = answerResponse.answer;
        setMessages(prev =>
          prev.map(m =>
            m.id === msg.id
              ? {
                  ...m,
                  content: fullContent,
                  sources: (answerResponse.citations ?? []).map((c: string) => ({
                    title: '',
                    url: c,
                    type: 'web',
                  })),
                  search_results: normaliseSearchResults(answerResponse.search_results) ?? m.search_results,
                  isSearching: false,
                  revealedLength: 0,
                }
              : m
          )
        );
        startStreamingReveal(msg.id, fullContent);
      }
    } catch (e) {
      setError(`Regenerate failed: ${e}`);
      setMessages(prev =>
        prev.map(m => (m.id === msg.id ? { ...m, isSearching: false } : m))
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Run a slash-selected play in the *current* session. Behaviour matches
   * the pending-play branch but stays on the same chat.
   */
  const handleSlashPlayRun = async (play: Play, query: string) => {
    setSlashPlay(null);
    setActivePlay(play);
    setError(null);
    const userMsg: Message = {
      id: uuidv4(),
      type: 'user',
      content: `▸ ${play.title}\n\n${query}`,
      timestamp: new Date(),
    };
    const responseMsg: Message = {
      id: uuidv4(),
      type: 'assistant',
      content: `_Running play: ${play.title}…_\n`,
      timestamp: new Date(),
      search_results: [],
      searchingUrls: [],
      isSearching: true,
    };
    setMessages(prev => [...prev, userMsg, responseMsg]);
    setLoading(true);
    try {
      const searchResults = await performSearch(
        query, sessionId, [], undefined,
        url => appendSearchUrl(responseMsg.id, url),
        getToken
      );
      const answerResponse = await runPlay(
        play.id, query, sessionId, searchResults, getToken
      );
      if (answerResponse?.answer) {
        const reveal = applyAssistantAnswer({
          messageId: responseMsg.id,
          answer: answerResponse.answer,
          searchResults: searchResults,
          citations: answerResponse.citations ?? [],
          originatingQuery: query,
          originatingSearchResults: searchResults,
          originatingPlayId: play.id,
        });
        setMessages(reveal.update);
        startStreamingReveal(reveal.messageId, reveal.fullContent);
        setSidebarRefresh(n => n + 1);
      }
    } catch (e) {
      setError(`Play failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string, customUrl?: string) => {
    setError(null);
    // A fresh, non-play search clears the active-play context.
    setActivePlay(null);
    const userMsg: Message = {
      id: uuidv4(),
      type: 'user',
      content: query,
      timestamp: new Date(),
    };
    const responseMsg: Message = {
      id: uuidv4(),
      type: 'assistant',
      content: '_Thinking…_\n',
      timestamp: new Date(),
      search_results: [],
      searchingUrls: [],
      isSearching: true,
    };
    setMessages(prev => [...prev, userMsg, responseMsg]);
    setLoading(true);
    try {
      const previousQueries = messages.filter(m => m.type === 'user').map(m => m.content);
      const searchResults = await performSearch(
        query,
        sessionId,
        previousQueries,
        customUrl,
        url => appendSearchUrl(responseMsg.id, url),
        getToken
      );
      const answerResponse = await getAnswer(
        query, sessionId, searchResults, previousQueries, getToken
      );
      if (answerResponse?.answer && Array.isArray(answerResponse.citations)) {
        const reveal = applyAssistantAnswer({
          messageId: responseMsg.id,
          answer: answerResponse.answer,
          searchResults: searchResults,
          citations: answerResponse.citations,
          originatingQuery: query,
          originatingSearchResults: searchResults,
        });
        setMessages(reveal.update);
        startStreamingReveal(reveal.messageId, reveal.fullContent);
        setSidebarRefresh(n => n + 1);
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to fetch answer: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = (id: string) => navigate(`/chat/${id}`);
  const handleNewChat = () => {
    justCreatedRef.current = true;
    setMessages([]);
    setActivePlay(null);
    navigate(`/chat/${uuidv4()}`);
  };

  const handleFollowupPick = useCallback((text: string) => {
    composerRef.current?.prefill(text);
  }, []);

  // Most recent assistant turn that has finished — drives the follow-up chips.
  const lastFinishedAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (
        m.type === 'assistant' &&
        !m.isSearching &&
        typeof m.revealedLength !== 'number'
      ) {
        return m.id;
      }
    }
    return null;
  }, [messages]);

  const conversationTitle = useMemo(() => {
    const firstUser = messages.find(m => m.type === 'user');
    if (!firstUser) return 'New chat';
    const t = firstUser.content.replace(/^▸\s+/, '').split('\n')[0].trim();
    return t.length > 80 ? t.slice(0, 79).trim() + '…' : t;
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="hidden md:block h-full">
        <aside className="flex flex-col h-full w-72 shrink-0 border-r border-border bg-surface-sunken">
          <SessionsSidebar
            darkMode={darkMode}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            refreshSignal={sidebarRefresh}
          />
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-surface relative">
        {showStickyHeader && (
          <div className="absolute top-0 inset-x-0 z-20 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70 animate-fade-in">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-fg truncate">
                  {conversationTitle}
                </div>
              </div>
              <button
                onClick={scrollToTop}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] text-fg-muted hover:text-fg hover:bg-surface-sunken transition-colors"
              >
                <ArrowUp className="w-3 h-3" /> Top
              </button>
            </div>
          </div>
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
          <div className="max-w-3xl mx-auto">
            <div ref={messagesTopRef} />
            {messages.length === 0 ? (
              <EmptyState
                profile={profile}
                onPick={text => composerRef.current?.prefill(text)}
              />
            ) : (
              <div className="space-y-10">
                {messages.map(message => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    darkMode={darkMode}
                    onRegenerate={
                      message.originatingQuery && message.originatingSearchResults?.length
                        ? handleRegenerate
                        : undefined
                    }
                    showFollowups={message.id === lastFinishedAssistantId}
                    onFollowupPick={handleFollowupPick}
                  />
                ))}
              </div>
            )}
            {error && (
              <div className="mt-6 p-4 rounded-md bg-danger-subtle text-danger text-[13px]">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border bg-surface px-4 sm:px-6 py-3">
          <div className="max-w-3xl mx-auto">
            <SearchBar
              ref={composerRef}
              onSearch={handleSearch}
              loading={loading}
              plays={plays}
              onPlaySelect={p => setSlashPlay(p)}
              activePlay={activePlay}
              onClearActivePlay={() => setActivePlay(null)}
            />
          </div>
        </div>
      </div>

      <ChatRightRail profile={profile} activePlay={activePlay} messages={messages} />

      {slashPlay && (
        <PlayRunModal
          play={slashPlay}
          onClose={() => setSlashPlay(null)}
          onSubmit={(p, q) => handleSlashPlayRun(p, q)}
        />
      )}
    </div>
  );
}

// ---------- Helpers ------------------------------------------------------

interface ApplyAnswerArgs {
  messageId: string;
  answer: string;
  searchResults: any[];
  citations: string[];
  originatingQuery: string;
  originatingSearchResults: any[];
  originatingPlayId?: string;
}

interface ApplyAnswerResult {
  update: (prev: Message[]) => Message[];
  messageId: string;
  fullContent: string;
}

/**
 * Wraps the message-update for an arrived answer, normalising server fields
 * and seeding the reveal animation state. The host then schedules the tick
 * via `startStreamingReveal`.
 *
 * Returned as a `(prev) => next` updater so the caller can pass it directly
 * into `setMessages` — keeps the live update batched with the searching
 * flag flipping off.
 */
function applyAssistantAnswer(args: ApplyAnswerArgs): ApplyAnswerResult {
  const updater = (prev: Message[]) =>
    prev.map(m =>
      m.id === args.messageId
        ? {
            ...m,
            content: args.answer,
            search_results: normaliseSearchResults(args.searchResults) ?? [],
            sources: args.citations.map((c: string) => ({
              title: '',
              url: c,
              type: 'web',
            })),
            isSearching: false,
            searchingUrls: undefined,
            revealedLength: 0,
            originatingQuery: args.originatingQuery,
            originatingSearchResults: args.originatingSearchResults,
            originatingPlayId: args.originatingPlayId,
          }
        : m
    );
  return { update: updater, messageId: args.messageId, fullContent: args.answer };
}

/** Convert backend search-result shape into the message-level shape the
 * ChatMessage component expects. The backend uses `{ title, url, source: <provider>, ... }`;
 * the frontend stores `{ title, source: <url>, type: <provider>, ... }` for legacy reasons. */
function normaliseSearchResults(results: any[] | undefined | null): MessageSearchResult[] | undefined {
  if (!results || !Array.isArray(results)) return undefined;
  return results.map(r => ({
    title: r.title ?? '',
    source: r.url ?? r.source ?? '',
    type: r.source ?? r.type ?? 'web',
    snippet: r.snippet,
    _authoritative: !!r._authoritative,
    _authority: r._authority,
  }));
}

/**
 * Convert the server's history payload into client-side Message[]. Each
 * assistant turn carries the search_results that grounded it (server joins
 * messages → query → search_results → tags via source_ranker).
 */
function rehydrateMessages(
  history: { role: string; content: string; search_results?: any[] }[],
): Message[] {
  return history.map(h => {
    if (h.role === 'assistant') {
      return {
        id: uuidv4(),
        type: 'assistant',
        content: h.content,
        timestamp: new Date(),
        search_results: normaliseSearchResults(h.search_results),
      };
    }
    return {
      id: uuidv4(),
      type: 'user',
      content: h.content,
      timestamp: new Date(),
    };
  });
}

// ---------- Empty state ---------------------------------------------------
function EmptyState({
  profile,
  onPick,
}: {
  profile: BrandProfile | null;
  onPick: (text: string) => void;
}) {
  const starters = useMemo(() => starterPrompts(profile), [profile]);
  const hello = profile?.company_name
    ? `What can I help with for ${profile.company_name}?`
    : 'What can I help you ship today?';

  return (
    <div className="mt-16 sm:mt-24 animate-fade-in">
      <h2 className="font-display text-[24px] sm:text-[28px] font-semibold tracking-tight text-fg">
        {hello}
      </h2>
      <p className="text-[14px] text-fg-muted mt-2 max-w-xl leading-relaxed">
        Citations are weighted toward platform docs (Meta, Google, TikTok) and trade
        press (eMarketer, Adweek, Search Engine Land). Your brand context is applied
        automatically.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s.prompt)}
            className="group text-left rounded-lg border border-border bg-surface hover:bg-surface-sunken hover:border-border-strong transition-colors duration-150 p-4 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-1.5">
              {s.tag}
            </div>
            <div className="text-[13.5px] text-fg leading-snug">{s.prompt}</div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-fg-subtle mt-6">
        Tip: paste a URL inside the composer to get an answer about that page specifically.
      </p>
    </div>
  );
}

interface Starter {
  tag: string;
  prompt: string;
}

function starterPrompts(profile: BrandProfile | null): Starter[] {
  const channels = profile?.primary_channels ?? [];
  const channel = channels[0];
  const channelLabel: Record<string, string> = {
    meta: 'Meta',
    google: 'Google',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
  };
  const ch = channelLabel[channel] || 'Meta';

  const icpHook = profile?.icp_description ? '— for our ICP' : '';
  const company = profile?.company_name ? ` for ${profile.company_name}` : '';

  return [
    {
      tag: 'Benchmark',
      prompt: `What's a healthy CAC and ROAS range on ${ch} for SaaS in 2026? Cite sources.`,
    },
    {
      tag: 'Creative',
      prompt: `Give me 5 hook variants for a ${ch} ad ${icpHook}. Vary by emotion (curiosity, contrarian, FOMO, social proof, transformational).`,
    },
    {
      tag: 'Plan',
      prompt: `Draft a $50K/month channel plan${company}. Pick 2–3 channels, give a budget split with rationale and a KPI per slice.`,
    },
    {
      tag: 'Audit',
      prompt: `My ${ch} CAC has crept up 30% over the last 4 weeks despite refreshing creative. Walk me through the most likely causes, ranked.`,
    },
  ];
}
