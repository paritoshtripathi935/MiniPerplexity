import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../components/ChatMessage';
import { SearchBar, type ComposerHandle } from '../components/SearchBar';
import { SessionsSidebar } from '../components/SessionsSidebar';
import { PlayRunModal } from '../components/PlayRunModal';
import {
  getBrandProfile, listPlays,
  performSearch, getAnswer, getSessionHistory, runPlay,
  type BrandProfile, type Play,
} from '../services/api';
import { Message } from '../types';

export interface PendingPlay {
  play: Play;
  query: string;
  sessionId: string;
}

interface Props {
  darkMode: boolean;
  /** When set, the chat page will run this play on mount and clear it. */
  pending: PendingPlay | null;
  clearPending: () => void;
}

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
  // When set, the slash-menu picked a play and we need to collect inputs
  // before running it in the current session.
  const [slashPlay, setSlashPlay] = useState<Play | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const justCreatedRef = useRef(true);

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

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        setMessages(
          history.map((m: { role: string; content: string }) => ({
            id: uuidv4(),
            type: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            timestamp: new Date(),
            search_results: [],
          }))
        );
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, getToken, pending]);

  // Auto-run a pending Play that was queued on the previous page.
  useEffect(() => {
    if (!pending || pending.sessionId !== sessionId) return;
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
        isSearching: true,
      };
      setMessages([userMsg, responseMsg]);
      setLoading(true);
      try {
        const searchResults = await performSearch(
          pending.query, pending.sessionId, [], undefined, undefined, getToken
        );
        const answerResponse = await runPlay(
          pending.play.id, pending.query, pending.sessionId, searchResults, getToken
        );
        if (answerResponse?.answer && Array.isArray(answerResponse.citations)) {
          setMessages(prev => prev.map(m =>
            m.id === responseMsg.id
              ? {
                  ...m,
                  content: answerResponse.answer,
                  search_results: searchResults.map((r: { title: any; url: any; source: any }) => ({
                    title: r.title, source: r.url, type: r.source,
                  })),
                  sources: answerResponse.citations.map((c: string) => ({
                    title: '', url: c, type: 'web',
                  })),
                  isSearching: false,
                  originatingQuery: pending.query,
                  originatingSearchResults: searchResults,
                  originatingPlayId: pending.play.id,
                }
              : m
          ));
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

  /**
   * Regenerate an assistant turn in place — same query + same search
   * results, just re-call /answer (re-running search would change the
   * underlying sources). Cheaper than a fresh round and mirrors what
   * ChatGPT/Claude do.
   */
  const handleRegenerate = async (msg: Message) => {
    if (!msg.originatingQuery || !msg.originatingSearchResults?.length) return;
    setError(null);
    setMessages(prev =>
      prev.map(m =>
        m.id === msg.id
          ? { ...m, content: '_Regenerating…_\n', isSearching: true }
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
        setMessages(prev =>
          prev.map(m =>
            m.id === msg.id
              ? {
                  ...m,
                  content: answerResponse.answer,
                  sources: (answerResponse.citations ?? []).map((c: string) => ({
                    title: '',
                    url: c,
                    type: 'web',
                  })),
                  isSearching: false,
                }
              : m
          )
        );
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
   * Run a slash-selected play in the *current* session (vs. the /plays page
   * which spins up a fresh session). Behaviour otherwise matches the
   * pending-play branch.
   */
  const handleSlashPlayRun = async (play: Play, query: string) => {
    setSlashPlay(null);
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
      isSearching: true,
    };
    setMessages(prev => [...prev, userMsg, responseMsg]);
    setLoading(true);
    try {
      const searchResults = await performSearch(
        query, sessionId, [], undefined, undefined, getToken
      );
      const answerResponse = await runPlay(
        play.id, query, sessionId, searchResults, getToken
      );
      if (answerResponse?.answer) {
        setMessages(prev => prev.map(m =>
          m.id === responseMsg.id
            ? {
                ...m,
                content: answerResponse.answer,
                search_results: searchResults.map((r: { title: any; url: any; source: any }) => ({
                  title: r.title, source: r.url, type: r.source,
                })),
                sources: (answerResponse.citations ?? []).map((c: string) => ({
                  title: '', url: c, type: 'web',
                })),
                isSearching: false,
                originatingQuery: query,
                originatingSearchResults: searchResults,
                originatingPlayId: play.id,
              }
            : m
        ));
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
        url => {
          setMessages(prev => prev.map(m =>
            m.id === responseMsg.id
              ? { ...m, content: m.content + `\n› ${url}\n` }
              : m
          ));
        },
        getToken
      );
      const answerResponse = await getAnswer(query, sessionId, searchResults, previousQueries, getToken);
      if (answerResponse?.answer && Array.isArray(answerResponse.citations)) {
        setMessages(prev => prev.map(m =>
          m.id === responseMsg.id
            ? {
                ...m,
                content: answerResponse.answer,
                search_results: searchResults.map((r: { title: any; url: any; source: any }) => ({
                  title: r.title, source: r.url, type: r.source,
                })),
                sources: answerResponse.citations.map((c: string) => ({ title: '', url: c, type: 'web' })),
                isSearching: false,
                originatingQuery: query,
                originatingSearchResults: searchResults,
              }
            : m
        ));
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
    navigate(`/chat/${uuidv4()}`);
  };

  // Total height of nav (h-14 = 56px). The chat container fills the rest.
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

      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
          <div className="max-w-3xl mx-auto">
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
            />
          </div>
        </div>
      </div>

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

// ---------- Empty state ---------------------------------------------------
function EmptyState({
  profile,
  onPick,
}: {
  profile: BrandProfile | null;
  onPick: (text: string) => void;
}) {
  // Tailor starter prompts to the user's brand profile when we have it.
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
