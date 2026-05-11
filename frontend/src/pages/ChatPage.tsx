import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../components/ChatMessage';
import { SearchBar, type ComposerHandle } from '../components/SearchBar';
import { SessionsSidebar } from '../components/SessionsSidebar';
import { PlayRunModal } from '../components/PlayRunModal';
import { ChatRightRail } from '../components/ChatRightRail';
import { ChatEmptyState } from '../components/ChatEmptyState';
import { ModelSelector } from '../components/ModelSelector';
import {
  getBrandProfile, getMe, getNextSteps, listPlays,
  performSearch, getSessionHistory, streamAnswer,
  type BrandProfile, type Play, type StreamDoneEvent, type UserProfile,
} from '../services/api';
import { Message } from '../types';
import {
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
    if (!routeSessionId) {
      // Skip the history-load effect on the upcoming sessionId change: this
      // ID was just minted on the client, there's nothing in the DB yet.
      justCreatedRef.current = true;
      navigate(`/investigations/${uuidv4()}`, { replace: true });
    }
  }, [routeSessionId, navigate]);

  const sessionId = routeSessionId ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  /** Slash-selected play queued for the run modal. */
  const [slashPlay, setSlashPlay] = useState<Play | null>(null);
  /** The play whose context is "loaded" — visible in the composer chip and
   * right rail. Stays after the play completes so the user can see what they
   * just ran; cleared when they start a fresh non-play turn. */
  const [activePlay, setActivePlay] = useState<Play | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  // True only when a fresh session was just minted on the client (auto-mint
  // on `/chat`, or "New chat" from the sidebar) — tells the history-load
  // effect to skip the upcoming fetch since there's nothing persisted yet.
  // Defaults to false so arrivals to `/chat/:id` from anywhere (Home, deep
  // link, refresh) actually load the conversation.
  const justCreatedRef = useRef(false);

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

  // Pull the user profile so the ModelSelector can preselect the saved
  // preferred chat model. Anonymous users hit a 401 here — that's fine,
  // the selector falls back to the catalog default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getMe(getToken);
        if (!cancelled) setMe(u);
      } catch {
        /* anonymous — selector silently uses backend default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

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
        await runAnswerStream({
          responseMsgId: responseMsg.id,
          query: pending.query,
          searchResults,
          playId: pending.play.id,
          originatingQuery: pending.query,
          originatingPlayId: pending.play.id,
        });
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
   * Fire-and-forget next-step suggestion fetch. Runs in parallel with the
   * streaming reveal so suggestions appear as soon as they're ready without
   * delaying the answer. Failures are silent — the chips just stay hidden.
   */
  const fetchNextSteps = useCallback(
    (clientMsgId: string, dbMessageId: string | undefined) => {
      if (!dbMessageId) return;
      (async () => {
        try {
          const { items } = await getNextSteps(dbMessageId, getToken);
          setMessages(prev =>
            prev.map(m =>
              m.id === clientMsgId
                ? { ...m, nextSteps: items, nextStepsLoading: false }
                : m
            )
          );
        } catch {
          setMessages(prev =>
            prev.map(m => (m.id === clientMsgId ? { ...m, nextStepsLoading: false } : m))
          );
        }
      })();
    },
    [getToken]
  );

  /**
   * Stream an answer into an already-rendered placeholder assistant
   * message. Shared by handleSearch and the two play paths — all three
   * differ only in query/playId/previousQueries.
   *
   * First token flips `isSearching` off and clears the placeholder
   * content. Subsequent tokens are appended. The `done` event provides
   * the persisted message id (for next-steps), the ranked search_results
   * + citations (for the right rail), and the total latency.
   */
  const runAnswerStream = useCallback(
    async (params: {
      responseMsgId: string;
      query: string;
      searchResults: any[];
      previousQueries?: string[];
      playId?: string;
      originatingQuery: string;
      originatingPlayId?: string;
    }) => {
      let firstTokenSeen = false;
      let streamErrorDetail: string | null = null;
      await streamAnswer({
        query: params.query,
        sessionId,
        searchResults: params.searchResults,
        previousQueries: params.previousQueries,
        playId: params.playId,
        getToken,
        onToken: (text: string) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== params.responseMsgId) return m;
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                return {
                  ...m,
                  content: text,
                  isSearching: false,
                  searchingUrls: undefined,
                  isStreaming: true,
                };
              }
              return { ...m, content: m.content + text };
            })
          );
        },
        onDone: (evt: StreamDoneEvent) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === params.responseMsgId
                ? {
                    ...m,
                    dbId: evt.message_id,
                    sources: evt.citations.map(c => ({ title: '', url: c, type: 'web' })),
                    search_results:
                      normaliseSearchResults(evt.search_results) ?? m.search_results,
                    latencyMs: evt.latency_ms,
                    isStreaming: false,
                    nextStepsLoading: !!evt.message_id,
                    originatingQuery: params.originatingQuery,
                    originatingSearchResults: params.searchResults,
                    originatingPlayId: params.originatingPlayId,
                  }
                : m
            )
          );
          fetchNextSteps(params.responseMsgId, evt.message_id);
          setSidebarRefresh(n => n + 1);
        },
        onError: detail => {
          streamErrorDetail = detail;
        },
      });
      if (streamErrorDetail) throw new Error(streamErrorDetail);
    },
    [sessionId, getToken, fetchNextSteps]
  );

  /**
   * Regenerate an assistant turn in place — same query + same search
   * results, just re-stream /answer into the existing message id. Cheaper
   * than a fresh round and mirrors what ChatGPT/Claude do. First token
   * replaces the "_Regenerating…_" placeholder.
   */
  const handleRegenerate = async (msg: Message) => {
    if (!msg.originatingQuery || !msg.originatingSearchResults?.length) return;
    setError(null);
    setMessages(prev =>
      prev.map(m =>
        m.id === msg.id
          ? { ...m, content: '_Regenerating…_\n', isSearching: true, isStreaming: false }
          : m
      )
    );
    setLoading(true);
    try {
      await runAnswerStream({
        responseMsgId: msg.id,
        query: msg.originatingQuery,
        searchResults: msg.originatingSearchResults,
        playId: msg.originatingPlayId,
        originatingQuery: msg.originatingQuery,
        originatingPlayId: msg.originatingPlayId,
      });
    } catch (e) {
      setError(`Regenerate failed: ${e}`);
      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id ? { ...m, isSearching: false, isStreaming: false } : m
        )
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
      await runAnswerStream({
        responseMsgId: responseMsg.id,
        query,
        searchResults,
        playId: play.id,
        originatingQuery: query,
        originatingPlayId: play.id,
      });
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
      await runAnswerStream({
        responseMsgId: responseMsg.id,
        query,
        searchResults,
        previousQueries,
        originatingQuery: query,
      });
    } catch (err) {
      console.error(err);
      setError(`Failed to fetch answer: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = (id: string) => navigate(`/investigations/${id}`);
  const handleNewInvestigation = () => {
    justCreatedRef.current = true;
    setMessages([]);
    setActivePlay(null);
    navigate(`/investigations/${uuidv4()}`);
  };

  /**
   * Click on a generated next-step chip → submit the follow-up question
   * directly. The user said "we continue the question" — no editing step,
   * just send. Bails if a turn is in flight to avoid concurrent submits.
   */
  const handleFollowupSubmit = useCallback(
    (text: string) => {
      if (loading) return;
      handleSearch(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading]
  );

  // Most recent assistant turn that has finished — drives the follow-up chips.
  const lastFinishedAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'assistant' && !m.isSearching && !m.isStreaming) {
        return m.id;
      }
    }
    return null;
  }, [messages]);

  const conversationTitle = useMemo(() => {
    const firstUser = messages.find(m => m.type === 'user');
    if (!firstUser) return 'New investigation';
    const t = firstUser.content.replace(/^▸\s+/, '').split('\n')[0].trim();
    return t.length > 80 ? t.slice(0, 79).trim() + '…' : t;
  }, [messages]);

  // Count user turns. Used for the status-chip strip in the sticky header.
  const turnCount = useMemo(
    () => messages.filter(m => m.type === 'user').length,
    [messages],
  );
  const hasStarted = turnCount > 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="hidden md:block h-full">
        <aside className="flex flex-col h-full w-72 shrink-0 border-r border-border bg-surface-sunken">
          <SessionsSidebar
            darkMode={darkMode}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewInvestigation={handleNewInvestigation}
            refreshSignal={sidebarRefresh}
          />
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-surface relative">
        {/* Always-visible investigation header — title + status chips +
            ModelSelector. Replaces the earlier dual "toolbar / scroll-
            triggered sticky bar" pattern; one bar that's always in view. */}
        <div className="border-b border-border bg-surface px-4 sm:px-6 h-12 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="text-body-base font-medium text-on-surface truncate">
              {conversationTitle}
            </div>
            {hasStarted && (
              <span className="inline-flex items-center gap-1.5 px-1.5 h-5 rounded-control bg-surface-container text-label-caps text-on-surface-variant shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden />
                Active
              </span>
            )}
            {hasStarted && (
              <span className="inline-flex items-center px-1.5 h-5 rounded-control bg-surface-container text-label-caps text-on-surface-variant shrink-0 tabular-nums">
                {turnCount} turn{turnCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <ModelSelector
            value={me?.preferred_chat_model ?? null}
            onChange={modelId =>
              setMe(prev => (prev ? { ...prev, preferred_chat_model: modelId } : prev))
            }
          />
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
          <div className="max-w-3xl mx-auto">
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
                    onFollowupSubmit={handleFollowupSubmit}
                  />
                ))}
              </div>
            )}
            {error && (
              <div className="mt-6 p-4 rounded-md bg-danger-subtle text-danger text-body-sm">
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

      <ChatRightRail activePlay={activePlay} messages={messages} />

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
