import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../components/ChatMessage';
import { SearchBar } from '../components/SearchBar';
import { SessionsSidebar } from '../components/SessionsSidebar';
import {
  performSearch, getAnswer, getSessionHistory, runPlay, type Play,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const justCreatedRef = useRef(true);

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
        content: `🤔 Running play: ${pending.play.title}…\n`,
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
      content: '🤔 Let me think about that...\n',
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
              ? { ...m, content: m.content + `\n🔍 Searching: ${url}\n`, animation: 'animate-pulse' }
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
        <aside
          className={`flex flex-col h-full w-72 shrink-0 border-r ${
            darkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <SessionsSidebar
            darkMode={darkMode}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            refreshSignal={sidebarRefresh}
          />
        </aside>
      </div>

      <div className={`flex-1 flex flex-col min-w-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className={`text-center mt-20 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <p className="text-lg mb-1">Ask anything paid-acquisition.</p>
                <p className="text-sm">
                  Citations are biased toward Meta/Google docs, eMarketer, Adweek. Your brand context is auto-applied.
                </p>
              </div>
            )}
            {messages.map(message => (
              <ChatMessage key={message.id} message={message} darkMode={darkMode} />
            ))}
            {error && (
              <div
                className={`p-4 rounded-lg ${
                  darkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'
                }`}
              >
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div
          className={`border-t px-4 sm:px-6 py-3 ${
            darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="max-w-3xl mx-auto">
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
