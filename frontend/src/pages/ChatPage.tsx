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
import { ChatEmptyState } from '../components/ChatEmptyState';
import {
  getBrandProfile, listPlays,
  performSearch, getAnswer, getSessionHistory, runPlay,
  type BrandProfile, type Play,
} from '../services/api';
import { Message } from '../types';
import { useStreamingReveal } from '../hooks/useStreamingReveal';
import {
  applyAssistantAnswer,
  normaliseSearchResults,
  rehydrateMessages,
} from '../utils/messageShape';

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

  const startStreamingReveal = useStreamingReveal(setMessages, sessionId);

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
              <ChatEmptyState
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
